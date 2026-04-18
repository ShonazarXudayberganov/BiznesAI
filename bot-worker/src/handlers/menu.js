/**
 * Bot menyusi va asosiy handlerlar (Phase 3).
 *
 * - /menu, /kpi, /sources, /help, /logout
 * - Inline tugmalar: KPI, Manbalar, Tahlil, Sozlamalar
 * - Erkin matn → AI proxy → backend → AI provider
 */
const { Markup } = require('telegraf');
const { findOrgByChatId } = require('../services/linkService');
const BackendAPI = require('../services/backendApi');

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
  const lines = [];
  lines.push(`<b>${orgName}</b> — tezkor holat`);
  lines.push('');
  if (sum.sources.length === 0) {
    lines.push('📁 Manbalar yo\'q');
  } else {
    lines.push(`📁 <b>${sum.sources.length}</b> manba ulangan:`);
    for (const s of sum.sources.slice(0, 8)) {
      lines.push(`  • ${s.name} (${s.type}) — ${(s.row_count || 0).toLocaleString()} qator`);
    }
    if (sum.sources.length > 8) lines.push(`  va boshqa ${sum.sources.length - 8} ta...`);
  }
  if (sum.channels.length > 0) {
    lines.push('');
    lines.push(`📺 <b>${sum.channels.length}</b> Telegram kanal:`);
    for (const c of sum.channels) {
      lines.push(`  • ${c.title}${c.username ? ' (@' + c.username + ')' : ''} — ${(c.member_count || 0).toLocaleString()} a'zo`);
    }
  }
  if (sum.unreadAlerts > 0) {
    lines.push('');
    lines.push(`🔔 <b>${sum.unreadAlerts}</b> ta o'qilmagan ogohlantirish`);
  }
  return lines.join('\n');
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
    // "wait" xabarini almashtirish
    await ctx.telegram.editMessageText(
      ctx.chat.id, wait.message_id, undefined,
      r.reply || '(bo\'sh javob)',
      { parse_mode: 'HTML' }
    ).catch(async () => {
      // HTML parse failed — oddiy matn bilan urin
      await ctx.telegram.editMessageText(
        ctx.chat.id, wait.message_id, undefined,
        r.reply || '(bo\'sh javob)'
      );
    });
    if (r.summary) {
      await ctx.reply(`📊 Manbalar: ${r.summary} · ${r.provider}`, { reply_to_message_id: wait.message_id }).catch(() => {});
    }
  } catch (e) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, wait.message_id, undefined,
      `❌ AI xato: ${e.message}\n\nAI kalit sozlamasini tekshiring (saytda Sozlamalar → AI).`
    );
  }
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
    return aiReply(ctx, link, 'Bugungi tezkor hisobot tayyorla. Asosiy raqamlar, eng muhim 3-5 ta xulosa, tavsiyalar bilan.');
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

  // Ovozli xabar (Phase 6'da to'liq Whisper qo'shiladi, hozircha placeholder)
  bot.on('voice', async (ctx) => {
    const link = await withOrg(ctx);
    if (!link) return;
    return ctx.reply('🎙 Ovozli xabar qabul qilindi. Whisper integratsiyasi tez orada — hozircha matn bilan yozing.', mainKeyboard);
  });

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
