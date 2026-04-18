/**
 * Bot uchun AI kontekstini quradi: tashkilot manbalaridan ma'lumot olib,
 * AI ga sistema prompt'i sifatida beradi.
 *
 * Manbalar: sources + source_data (Excel, Sheets, CRM, Instagram, Telegram kanal va h.k.)
 * + telegram_channels va telegram_channel_stats_daily
 *
 * Token cheklovini hisobga olib har manba ma'lumotini qisqartirib oladi.
 */
const pool = require('../db/pool');

const MAX_PER_SOURCE = 30;       // har manbadan ko'pi bilan 30 qator namuna
const MAX_TOTAL_CHARS = 50000;   // umumiy prompt o'lchami chegarasi (token emas, ~12K token)

// Manba turlari uchun do'stona nomlar
const TYPE_LABELS = {
  excel: 'Excel/CSV', csv: 'CSV', sheets: 'Google Sheets',
  restapi: 'REST API', instagram: 'Instagram', telegram: 'Telegram kanal (eski Bot API)',
  crm: 'LC-UP CRM', document: 'Hujjat', image: 'Rasm',
  '1c': '1C Buxgalteriya', metrika: 'Yandex Metrika', sql: 'SQL Database',
  manual: 'Qo\'lda kiritilgan', website: 'Veb-sayt',
};

function fmt(t) { return TYPE_LABELS[t] || t; }
function trim(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

/**
 * @param {number} organizationId
 * @returns {Promise<{systemPrompt: string, sourceCount: number, summary: string}>}
 */
async function buildOrgContext(organizationId) {
  const orgRes = await pool.query(
    `SELECT name, color FROM organizations WHERE id=$1`,
    [organizationId]
  );
  const orgName = orgRes.rows[0]?.name || 'Tashkilot';

  // 1. Manbalar va ma'lumotlari
  const srcRes = await pool.query(
    `SELECT s.id, s.type, s.name, s.connected, s.active, sd.data, sd.row_count, sd.updated_at
     FROM sources s
     LEFT JOIN source_data sd ON sd.source_id = s.id
     WHERE s.organization_id = $1 AND s.connected = TRUE AND s.active = TRUE
     ORDER BY s.type, s.name`,
    [organizationId]
  );

  // 2. Telegram kanallar (MTProto)
  const chRes = await pool.query(
    `SELECT id, channel_id, username, title, member_count, last_synced_at
     FROM telegram_channels WHERE organization_id=$1 AND active=TRUE
     ORDER BY title`,
    [organizationId]
  );

  // 3. Kanal so'nggi 7 kunlik trend (har kanal uchun)
  let channelStats = [];
  if (chRes.rows.length > 0) {
    const ids = chRes.rows.map(c => c.id);
    const sr = await pool.query(
      `SELECT channel_id, date, members, views_total, shares_total, reactions_total
       FROM telegram_channel_stats_daily
       WHERE channel_id = ANY($1::int[]) AND date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY channel_id, date DESC`,
      [ids]
    );
    channelStats = sr.rows;
  }

  // ── Prompt qurish ──
  const parts = [];
  parts.push(`Sen — Analix, ${orgName} tashkiloti uchun biznes-tahlilchi yordamchisan.`);
  parts.push(`HAR DOIM O'zbek tilida javob ber. Aniq raqamlar va dalillar bilan, qisqa va foydali.`);
  parts.push(`Foydalanuvchi savoliga TASHKILOT MA'LUMOTLARI asosida javob ber. Ma'lumot yo'q bo'lsa — "ushbu ma'lumot manbada yo'q" deb ayt.`);
  parts.push('');
  parts.push(`========== TASHKILOT: "${orgName}" ==========`);

  // Manbalar
  if (srcRes.rows.length === 0) {
    parts.push('\nUlangan manbalar yo\'q.');
  } else {
    parts.push(`\nULANGAN MANBALAR (${srcRes.rows.length} ta):\n`);
    for (const s of srcRes.rows) {
      const data = Array.isArray(s.data) ? s.data : (s.data ? [s.data] : []);
      const sample = data.slice(0, MAX_PER_SOURCE);
      const sampleStr = sample.length > 0 ? trim(JSON.stringify(sample, null, 1), 4000) : '(ma\'lumot yo\'q)';
      const updated = s.updated_at ? new Date(s.updated_at).toLocaleString('uz-UZ') : '?';
      parts.push(`--- ${fmt(s.type)}: "${s.name}" (${s.row_count || 0} qator, oxirgi yangilanish: ${updated}) ---`);
      parts.push(sampleStr);
      parts.push('');
    }
  }

  // Telegram kanallar
  if (chRes.rows.length > 0) {
    parts.push(`\nTELEGRAM KANALLAR (${chRes.rows.length} ta):\n`);
    for (const c of chRes.rows) {
      const trend = channelStats.filter(s => s.channel_id === c.id);
      parts.push(`--- "${c.title}" ${c.username ? '@' + c.username : ''} (${c.member_count || '?'} a'zo) ---`);
      if (trend.length > 0) {
        parts.push(`So'nggi 7 kun statistikasi:`);
        for (const t of trend) {
          parts.push(`  ${t.date}: a'zolar=${t.members || '?'}, ko'rishlar=${t.views_total || '?'}, share=${t.shares_total || '?'}, reaksiyalar=${t.reactions_total || '?'}`);
        }
      } else {
        parts.push('  (Statistika hali sinxronlanmagan yoki kanal kichik)');
      }
      parts.push('');
    }
  }

  let systemPrompt = parts.join('\n');
  if (systemPrompt.length > MAX_TOTAL_CHARS) {
    systemPrompt = systemPrompt.slice(0, MAX_TOTAL_CHARS) + '\n\n[...kontekst qisqartirildi: ko\'p ma\'lumot]';
  }

  return {
    systemPrompt,
    sourceCount: srcRes.rows.length + chRes.rows.length,
    summary: `${srcRes.rows.length} manba${chRes.rows.length ? ` + ${chRes.rows.length} kanal` : ''}`,
  };
}

module.exports = { buildOrgContext };
