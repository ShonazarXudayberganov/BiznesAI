/**
 * Bot menyusi va asosiy handlerlar (Phase 3-6).
 *
 * - /menu, /kpi, /sources, /help, /logout
 * - Inline tugmalar: KPI, Manbalar, Tahlil, Sozlamalar
 * - Erkin matn → AI proxy → backend → AI provider
 * - Voice → Whisper → AI
 * - Photo/document → AI tahlil
 * - Grafik so'rovi → QuickChart PNG
 */
const { Markup } = require('telegraf');
const pool = require('../db/pool');
const { findOrgByChatId } = require('../services/linkService');
const BackendAPI = require('../services/backendApi');
const { transcribeOgg } = require('../services/transcribe');
const { renderChart, lineChart } = require('../services/chartImage');
const F = require('../lib/formatter');

// ── Asosiy menyu (reply keyboard, doimiy) ──
const mainKeyboard = Markup.keyboard([
  ['📊 Hisobot', '📈 Tahlil'],
  ['📁 Manbalar', '🔔 Holat'],
  ['💬 Savol ber', '⚙️ Sozlamalar'],
]).resize();

// ── Inline tahlil tugmalari ──
const analysisInline = Markup.inlineKeyboard([
  [
    Markup.button.callback('Bugungi KPI', 'analysis:kpi'),
    Markup.button.callback('Haftalik trend', 'analysis:weekly'),
  ],
  [
    Markup.button.callback('Savdo', 'analysis:sales'),
    Markup.button.callback('CRM', 'analysis:crm'),
  ],
  [
    Markup.button.callback('Telegram kanal', 'analysis:channel'),
    Markup.button.callback('Anomaliya', 'analysis:anomaly'),
  ],
]);

// ── Hisobot turi va format tanlash ──
const reportTypeInline = Markup.inlineKeyboard([
  [
    Markup.button.callback('Kunlik hisobot', 'report-type:daily'),
    Markup.button.callback('Haftalik hisobot', 'report-type:weekly'),
  ],
  [
    Markup.button.callback('Oylik hisobot', 'report-type:monthly'),
    Markup.button.callback('Maxsus tahlil', 'report-type:custom'),
  ],
]);

function reportFormatInline(reportType) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💬 Chat', `report-fmt:${reportType}:chat`),
      Markup.button.callback('📄 PDF', `report-fmt:${reportType}:pdf`),
    ],
    [
      Markup.button.callback('📊 Excel', `report-fmt:${reportType}:xlsx`),
      Markup.button.callback('📝 TXT', `report-fmt:${reportType}:txt`),
    ],
  ]);
}

const REPORT_PROMPTS = {
  daily: 'Bugungi va kechagi tezkor biznes hisobotini tayyorla. Asosiy KPI raqamlar, eng muhim 3-5 xulosa, qisqa tavsiyalar bilan. Aniq raqamlar va trendlar.',
  weekly: 'So\'nggi 7 kunlik to\'liq tahlil tayyorla — kunlik o\'zgarishlar, trend yo\'nalishi, eng yaxshi va eng yomon kunlar, sabablari, keyingi haftaga tavsiyalar.',
  monthly: 'So\'nggi 30 kunlik chuqur tahlil — oylik dinamika, asosiy yutuqlar, muammolar, raqobat sharhi, keyingi oy strategiyasi.',
  custom: 'Tashkilot ma\'lumotlarini chuqur tahlil qil — eng muhim insightlarni top, kutilmagan trendlarni izohla, aniq harakat tavsiyalarini ber.',
};

const REPORT_TITLES = {
  daily: 'Kunlik hisobot',
  weekly: 'Haftalik hisobot',
  monthly: 'Oylik hisobot',
  custom: 'Maxsus tahlil',
};

// ── Universal: foydalanuvchi bog'langanmi tekshiradi ──
async function withOrg(ctx) {
  const link = await findOrgByChatId(ctx.from.id);
  if (!link) {
    await ctx.reply('Avval saytdan ulaning: https://analix.uz', { disable_web_page_preview: true });
    return null;
  }
  return link;
}

// ── KPI matni tayyorlash ──
async function buildKpiMessage(orgId, orgName) {
  const sum = await BackendAPI.orgSummary(orgId);
  const today = new Date().toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const out = [];
  out.push(F.header(`📊 ${orgName} — Tezkor holat`, today));

  // Manbalar
  out.push(F.section('📁', 'Ma\'lumot manbalari'));
  if (sum.sources.length === 0) {
    out.push('  <i>Hali ulanmagan</i>');
  } else {
    const totalRows = sum.sources.reduce((a, s) => a + (s.row_count || 0), 0);
    out.push(`  <b>${sum.sources.length}</b> manba · <b>${F.fmtNum(totalRows)}</b> qator jami`);
    // Top 5 ni jadval qilib ko'rsatamiz
    const topRows = sum.sources.slice(0, 5).map(s => [
      s.name,
      s.type,
      F.fmtNum(s.row_count || 0),
    ]);
    out.push(F.table(
      [{ label: 'Nom', width: 18 }, { label: 'Tur', width: 10 }, { label: 'Qator', width: 8 }],
      topRows
    ));
    if (sum.sources.length > 5) out.push(`  <i>va yana ${sum.sources.length - 5} ta</i>`);
  }

  // Telegram kanallar
  if (sum.channels.length > 0) {
    out.push(F.section('📺', 'Telegram kanallar'));
    for (const c of sum.channels) {
      const uname = c.username ? ` @${c.username}` : '';
      const synced = c.last_synced_at
        ? new Date(c.last_synced_at).toLocaleDateString('uz-UZ')
        : 'hali sinxronlanmagan';
      out.push(`  ▫️ <b>${F.escHtml(c.title)}</b>${F.escHtml(uname)}`);
      out.push(`     ${F.fmtNum(c.member_count || 0)} a'zo · <i>${F.escHtml(synced)}</i>`);
    }
  }

  // Ogohlantirishlar
  if (sum.unreadAlerts > 0) {
    out.push(F.section('🔔', 'Ogohlantirishlar'));
    out.push(`  🟡 <b>${sum.unreadAlerts}</b> ta yangi xabar`);
  }

  out.push(F.footer());
  return out.join('\n');
}

// ── Erkin matnga AI javob ──
async function aiReply(ctx, link, message) {
  const wait = await ctx.reply('🤔 Tahlil qilmoqda...');
  try {
    const r = await BackendAPI.aiChat({
      organizationId: link.organization_id,
      userId: link.user_id,
      message,
      history: [],
    });
    // AI javobini formatlab yuborish (markdown → Telegram HTML)
    const body = F.mdToTgHtml(r.reply || '(bo\'sh javob)');
    const footer = r.summary ? `\n\n${F.HR_SHORT}\n<i>📊 ${F.escHtml(r.summary)} · ${F.escHtml(r.provider)}</i>` : '';
    const text = body + footer;

    // Telegram 4096 belgi chegarasi
    const parts = splitForTelegram(text);
    await ctx.telegram.editMessageText(
      ctx.chat.id, wait.message_id, undefined,
      parts[0], { parse_mode: 'HTML' }
    ).catch(async () => {
      // HTML parse fail — oddiy matn
      await ctx.telegram.editMessageText(
        ctx.chat.id, wait.message_id, undefined,
        r.reply || '(bo\'sh javob)'
      );
    });
    for (let i = 1; i < parts.length; i++) {
      await ctx.reply(parts[i], { parse_mode: 'HTML' }).catch(() => ctx.reply(parts[i]));
    }
  } catch (e) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, wait.message_id, undefined,
      `❌ <b>AI xato</b>\n\n${F.escHtml(e.message)}\n\n<i>Saytda Sozlamalar → AI kaliti tekshiring.</i>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
}

// Telegram xabar 4096 belgidan oshmasin — qism-qism yuborish
function splitForTelegram(text, max = 3800) {
  if (text.length <= max) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > max) {
    // Yaqin \n'dan bo'lishga harakat
    let cut = remaining.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.trim()) parts.push(remaining);
  return parts;
}

module.exports = function registerMenuHandlers(bot) {
  // /menu
  bot.command('menu', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    return ctx.reply(
      `<b>${link.org_name}</b> — asosiy menyu\n\nQuyidagilardan birini tanlang yoki to'g'ridan-to'g'ri savol yozing.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  });

  // /kpi
  bot.command('kpi', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    try {
      const text = await buildKpiMessage(link.organization_id, link.org_name);
      return ctx.reply(text, { parse_mode: 'HTML', ...mainKeyboard });
    } catch (e) {
      return ctx.reply('Xato: ' + e.message);
    }
  });

  // /sources
  bot.command('sources', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    try {
      const sum = await BackendAPI.orgSummary(link.organization_id);
      if (sum.sources.length === 0 && sum.channels.length === 0) {
        return ctx.reply('Hech qanday manba ulanmagan. Saytda Data Hub orqali manba qo\'shing.', mainKeyboard);
      }
      const lines = ['<b>Ulangan manbalar:</b>', ''];
      for (const s of sum.sources) lines.push(`📁 ${s.name} — ${s.type} (${(s.row_count || 0).toLocaleString()} qator)`);
      for (const c of sum.channels) lines.push(`📺 ${c.title} — ${(c.member_count || 0).toLocaleString()} a'zo`);
      return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...mainKeyboard });
    } catch (e) {
      return ctx.reply('Xato: ' + e.message);
    }
  });

  // Inline callback'lar
  bot.action(/^analysis:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await findOrgByChatId(ctx.from.id);
    if (!link) return;
    const cat = ctx.match[1];
    const prompts = {
      kpi: 'Bugungi va kechagi asosiy ko\'rsatkichlarni tahlil qil. Sotuv, mijozlar, daromad — qisqa raqamlar bilan.',
      weekly: 'So\'nggi 7 kunlik biznes trendini tahlil qil — o\'sish/pasayish, sabablari, tavsiyalar.',
      sales: 'Savdo ko\'rsatkichlarini tahlil qil. Eng yaxshi mahsulot/kun/manba. Pasayish bo\'lsa sababini izlash.',
      crm: 'CRM ma\'lumotlarini tahlil qil — yangi mijozlar, faol guruhlar, lead konversiyasi.',
      channel: 'Telegram kanal statistikasini tahlil qil — a\'zolar dinamikasi, eng yaxshi postlar, ERR.',
      anomaly: 'Ma\'lumotlarda anomaliya bormi? Keskin o\'zgarishlar, kutilmagan trend — toping va izohlang.',
    };
    return aiReply(ctx, link, prompts[cat] || 'Umumiy tahlil ber');
  });

  // Reply keyboard tugmalari (matn sifatida keladi)
  bot.hears('📊 Hisobot', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    return ctx.reply('Qaysi hisobot turi kerak?', reportTypeInline);
  });

  // Hisobot turi tanlangan → format so'rash
  bot.action(/^report-type:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await findOrgByChatId(ctx.from.id);
    if (!link) return;
    const type = ctx.match[1];
    return ctx.reply(`<b>${REPORT_TITLES[type] || 'Hisobot'}</b> — qaysi formatda?`, {
      parse_mode: 'HTML',
      ...reportFormatInline(type),
    });
  });

  // Format tanlangan → AI matn + fayl tayyorlash va yuborish
  bot.action(/^report-fmt:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await findOrgByChatId(ctx.from.id);
    if (!link) return;
    const [, type, fmt] = ctx.match;
    const prompt = REPORT_PROMPTS[type] || REPORT_PROMPTS.daily;
    const title = REPORT_TITLES[type] || 'Hisobot';

    if (fmt === 'chat') {
      return aiReply(ctx, link, prompt);
    }

    const wait = await ctx.reply(`📄 ${fmt.toUpperCase()} tayyorlanmoqda...`);
    try {
      const buffer = await BackendAPI.buildReport({
        organizationId: link.organization_id,
        userId: link.user_id,
        format: fmt,
        title,
        prompt,
      });
      const filename = `analix_${type}_${new Date().toISOString().slice(0, 10)}.${fmt === 'xlsx' ? 'xlsx' : fmt}`;
      await ctx.replyWithDocument(
        { source: buffer, filename },
        { caption: `✓ ${title} (${fmt.toUpperCase()})` }
      );
      await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, wait.message_id, undefined,
        `❌ Hisobot tayyorlanmadi: ${e.message}`
      );
    }
  });

  bot.hears('📈 Tahlil', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    return ctx.reply('Qaysi yo\'nalish bo\'yicha tahlil kerak?', analysisInline);
  });

  bot.hears('📁 Manbalar', async (ctx) => {
    return ctx.scene ? null : bot.handleUpdate({
      ...ctx.update,
      message: { ...ctx.update.message, text: '/sources' }
    });
  });

  bot.hears('🔔 Holat', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    try {
      const text = await buildKpiMessage(link.organization_id, link.org_name);
      return ctx.reply(text, { parse_mode: 'HTML', ...mainKeyboard });
    } catch (e) {
      return ctx.reply('Xato: ' + e.message);
    }
  });

  bot.hears('💬 Savol ber', async (ctx) => {
    return ctx.reply(
      'To\'g\'ridan-to\'g\'ri savolingizni yozing — men barcha ulangan manbalar asosida javob beraman.\n\n' +
      'Masalan: <i>"Kecha qancha sotuv bo\'ldi?"</i> yoki <i>"Eng yaxshi mahsulot qaysi?"</i>',
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  });

  bot.hears('⚙️ Sozlamalar', async (ctx) => {
    return ctx.reply(
      'Sozlamalar saytda boshqariladi — analix.uz → Sozlamalar.\n\n' +
      'Shu yerdan boshqarsa bo\'ladigan narsalar tez orada qo\'shiladi.',
      mainKeyboard
    );
  });

  // Ovozli xabar — Whisper bilan transkripsiya, keyin AI
  bot.on('voice', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    const wait = await ctx.reply('🎙 Ovozni matnga aylantirmoqda...');
    try {
      const fileId = ctx.message.voice.file_id;
      const link_ = await ctx.telegram.getFileLink(fileId);
      const res = await fetch(link_.href);
      const buf = Buffer.from(await res.arrayBuffer());
      const text = await transcribeOgg(buf, 'uz');
      if (!text || !text.trim()) {
        await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, '⚠️ Ovozdan matn ajralmadi. Qayta urinib ko\'ring.');
        return;
      }
      await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, `🎙 <i>"${text}"</i>\n\n🤔 Tahlil qilmoqda...`, { parse_mode: 'HTML' });
      const r = await BackendAPI.aiChat({
        organizationId: link.organization_id,
        userId: link.user_id,
        message: text,
      });
      await ctx.reply(r.reply || '(bo\'sh javob)', { parse_mode: 'HTML' }).catch(async () => {
        await ctx.reply(r.reply || '(bo\'sh javob)');
      });
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, `❌ Ovoz tahlili xato: ${e.message}`);
    }
  });

  // Hujjat — TXT/markdown matn sifatida o'qib AI ga yuborish
  bot.on('document', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    const doc = ctx.message.document;
    const name = doc.file_name || 'document';
    const lower = name.toLowerCase();
    if (!/(\.txt|\.md|\.csv|\.json)$/.test(lower)) {
      return ctx.reply('Hozircha faqat TXT/MD/CSV/JSON fayllar qo\'llab-quvvatlanadi.\nPDF/Word fayllarni saytda Data Hub orqali yuklang — bot AI keyin ulardan foydalana oladi.');
    }
    if (doc.file_size > 200000) {
      return ctx.reply('Fayl juda katta (200KB dan oshmasin).');
    }
    const wait = await ctx.reply(`📄 ${name} o'qilmoqda...`);
    try {
      const link_ = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(link_.href);
      const text = await res.text();
      const caption = ctx.message.caption || 'Ushbu hujjatni qisqa tahlil qil va asosiy xulosalarini yoz.';
      const prompt = `FOYDALANUVCHI HUJJAT YUBORDI ("${name}"):\n\n${text.slice(0, 30000)}\n\nFOYDALANUVCHI SAVOLI: ${caption}`;
      await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, '🤔 Hujjat tahlil qilinmoqda...');
      const r = await BackendAPI.aiChat({
        organizationId: link.organization_id,
        userId: link.user_id,
        message: prompt,
      });
      await ctx.reply(r.reply, { parse_mode: 'HTML' }).catch(async () => {
        await ctx.reply(r.reply);
      });
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, `❌ Xato: ${e.message}`);
    }
  });

  // Rasm — vision bo'lmasa, izoh so'rash
  bot.on('photo', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    const caption = ctx.message.caption;
    if (!caption) {
      return ctx.reply('Rasm haqida savolingiz nima? Caption ga yozing yoki keyingi xabarda matn yuboring.');
    }
    return aiReply(ctx, link, `[Rasm yuborildi, lekin tasvirni AI ko'ra olmaydi. Faqat caption bo'yicha javob beraman]\n\nSAVOL: ${caption}`);
  });

  // /grafik <kanal> — kanal a'zolari grafigi
  bot.command('grafik', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;

    const channels = await pool.query(
      `SELECT id, title FROM telegram_channels WHERE organization_id=$1 AND active=TRUE ORDER BY id`,
      [link.organization_id]
    );
    if (channels.rows.length === 0) {
      return ctx.reply('Ulangan Telegram kanal yo\'q. Avval saytda kanal ulang.');
    }
    if (channels.rows.length === 1) {
      return sendChannelChart(ctx, channels.rows[0].id, channels.rows[0].title);
    }
    return ctx.reply('Qaysi kanal?', Markup.inlineKeyboard(
      channels.rows.map(c => [Markup.button.callback(c.title, `chart:${c.id}`)])
    ));
  });

  bot.action(/^chart:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await findOrgByChatId(ctx.from.id);
    if (!link) return;
    const id = parseInt(ctx.match[1], 10);
    const r = await pool.query(`SELECT title FROM telegram_channels WHERE id=$1`, [id]);
    if (r.rows.length === 0) return ctx.reply('Kanal topilmadi');
    return sendChannelChart(ctx, id, r.rows[0].title);
  });

  async function sendChannelChart(ctx, channelId, title) {
    const wait = await ctx.reply('📊 Grafik tayyorlanmoqda...');
    try {
      const r = await pool.query(
        `SELECT date::text, members, views_total
         FROM telegram_channel_stats_daily
         WHERE channel_id=$1 AND date >= CURRENT_DATE - INTERVAL '30 days'
         ORDER BY date`,
        [channelId]
      );
      if (r.rows.length === 0) {
        await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, 'Statistika ma\'lumoti yo\'q (sync qiling avval).');
        return;
      }
      const labels = r.rows.map(x => x.date.slice(5));
      const config = lineChart(`${title} — A'zolar (oxirgi ${r.rows.length} kun)`, labels, [
        { label: "A'zolar", data: r.rows.map(x => x.members || 0), color: '#38BDF8' },
      ]);
      const png = await renderChart(config, { width: 900, height: 500 });
      await ctx.replyWithPhoto({ source: png }, { caption: `📊 ${title}` });
      await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, undefined, `❌ Grafik xato: ${e.message}`);
    }
  }

  // Erkin matn — eng oxirgi handler bo'lishi kerak
  bot.on('message', async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return next();
    // Reply keyboard tugmalari boshqa handler'larda qabul qilinadi
    const known = ['📊 Hisobot', '📈 Tahlil', '📁 Manbalar', '🔔 Holat', '💬 Savol ber', '⚙️ Sozlamalar'];
    if (known.includes(text)) return next();

    const link = await withOrg(ctx);
    if (!link) return;
    return aiReply(ctx, link, text);
  });
};
