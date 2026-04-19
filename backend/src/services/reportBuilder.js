/**
 * Hisobot generator: PDF, Excel, TXT.
 * Bot uchun (yoki frontend uchun) Buffer qaytaradi.
 *
 * Hisobot turi: kunlik dayjest, savdo, kanal va h.k.
 * Hozircha barcha tur uchun bitta umumiy generator — AI matni + tashkilot KPI'lari.
 */
const XLSX = require('xlsx');
const pool = require('../db/pool');
const puppeteer = require('puppeteer-core');
const { buildReportHtml } = require('./htmlTemplate');

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

// Markdown matnni TXT/Excel uchun tozalash
function stripMd(s) {
  return String(s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// ─────────────────────────────────────────────
// 1. Tashkilot ma'lumotlarini yig'ish
// ─────────────────────────────────────────────
async function gatherReportData(organizationId) {
  const orgRes = await pool.query(`SELECT name FROM organizations WHERE id=$1`, [organizationId]);
  const orgName = orgRes.rows[0]?.name || 'Tashkilot';

  const sources = await pool.query(
    `SELECT s.id, s.type, s.name, sd.row_count, sd.updated_at
     FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id
     WHERE s.organization_id=$1 AND s.connected=TRUE AND s.active=TRUE
     ORDER BY s.type, s.name`,
    [organizationId]
  );

  const channels = await pool.query(
    `SELECT id, title, username, member_count, last_synced_at
     FROM telegram_channels WHERE organization_id=$1 AND active=TRUE`,
    [organizationId]
  );

  // Kanal so'nggi 7 kun
  let channelTrends = [];
  if (channels.rows.length > 0) {
    const ids = channels.rows.map(c => c.id);
    const sr = await pool.query(
      `SELECT channel_id, date, members, views_total
       FROM telegram_channel_stats_daily
       WHERE channel_id = ANY($1::int[]) AND date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY channel_id, date`,
      [ids]
    );
    channelTrends = sr.rows;
  }

  return { orgName, sources: sources.rows, channels: channels.rows, channelTrends };
}

// ─────────────────────────────────────────────
// 2. PDF — Puppeteer orqali (sayt bilan bir xil dizayn)
// ─────────────────────────────────────────────
let _browserPromise = null;
async function getBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  }).catch(e => {
    _browserPromise = null;
    throw e;
  });
  return _browserPromise;
}

async function buildPdf({ organizationId, title, aiText, provider }) {
  const data = await gatherReportData(organizationId);
  const html = buildReportHtml({
    title: title || 'Hisobot',
    orgName: data.orgName,
    data,
    aiText,
    provider,
  });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
    // Puppeteer 23+ Uint8Array qaytaradi — Buffer ga aylantirish kerak
    return Buffer.from(pdfData);
  } finally {
    await page.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────
// 3. Excel
// ─────────────────────────────────────────────
async function buildExcel({ organizationId, title, aiText }) {
  const data = await gatherReportData(organizationId);
  const wb = XLSX.utils.book_new();

  // Xulosa
  const summary = [
    [`Analix — ${title || 'Hisobot'}`],
    [`Tashkilot: ${data.orgName}`],
    [`Sana: ${new Date().toLocaleString('uz-UZ')}`],
    [],
    ['Manbalar:', data.sources.length],
    ['Telegram kanallar:', data.channels.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Xulosa');

  // Manbalar
  if (data.sources.length > 0) {
    const rows = [['Tur', 'Nom', 'Qatorlar', 'Oxirgi yangilanish']];
    for (const s of data.sources) {
      rows.push([s.type, s.name, s.row_count || 0, s.updated_at ? new Date(s.updated_at).toLocaleString('uz-UZ') : '-']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Manbalar');
  }

  // Kanallar
  if (data.channels.length > 0) {
    const rows = [['Sarlavha', 'Username', 'A\'zolar', 'Oxirgi sync']];
    for (const c of data.channels) {
      rows.push([c.title, c.username || '', c.member_count || 0, c.last_synced_at ? new Date(c.last_synced_at).toLocaleString('uz-UZ') : '-']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Kanallar');

    if (data.channelTrends.length > 0) {
      const tr = [['Kanal ID', 'Sana', 'A\'zolar', 'Ko\'rishlar']];
      for (const t of data.channelTrends) {
        tr.push([t.channel_id, t.date, t.members || 0, t.views_total || 0]);
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tr), 'Kanal trendi');
    }
  }

  // AI matn
  if (aiText) {
    const lines = stripMd(aiText).split('\n').map(l => [l]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['AI tahlil'], ...lines]), 'AI tahlil');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ─────────────────────────────────────────────
// 4. TXT
// ─────────────────────────────────────────────
async function buildTxt({ organizationId, title, aiText }) {
  const data = await gatherReportData(organizationId);
  const today = new Date().toLocaleString('uz-UZ');
  const lines = [];
  lines.push(`╔════════════════════════════════════════════╗`);
  lines.push(`  ANALIX — ${title || 'Hisobot'}`);
  lines.push(`  ${data.orgName} · ${today}`);
  lines.push(`╚════════════════════════════════════════════╝`);
  lines.push('');
  lines.push(`Manbalar: ${data.sources.length} ta`);
  lines.push(`Telegram kanallar: ${data.channels.length} ta`);
  lines.push('');

  if (data.sources.length > 0) {
    lines.push('─── MA\'LUMOT MANBALARI ───');
    for (const s of data.sources) {
      lines.push(`  • ${s.name} (${s.type}) — ${(s.row_count || 0).toLocaleString()} qator`);
    }
    lines.push('');
  }
  if (data.channels.length > 0) {
    lines.push('─── TELEGRAM KANALLAR ───');
    for (const c of data.channels) {
      lines.push(`  • ${c.title}${c.username ? ' @' + c.username : ''} — ${(c.member_count || 0).toLocaleString()} a'zo`);
    }
    lines.push('');
  }
  if (aiText) {
    lines.push('─── AI TAHLIL ───');
    lines.push('');
    lines.push(stripMd(aiText));
    lines.push('');
  }
  lines.push('────────────────────────────────────────────');
  lines.push('Analix · analix.uz');
  return Buffer.from(lines.join('\n'), 'utf8');
}

// ─────────────────────────────────────────────
// Universal builder
// ─────────────────────────────────────────────
async function buildReport({ format, organizationId, title, aiText }) {
  switch ((format || 'pdf').toLowerCase()) {
    case 'pdf':   return { buffer: await buildPdf({ organizationId, title, aiText }), mime: 'application/pdf', ext: 'pdf' };
    case 'xlsx':
    case 'excel': return { buffer: await buildExcel({ organizationId, title, aiText }), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    case 'txt':   return { buffer: await buildTxt({ organizationId, title, aiText }), mime: 'text/plain', ext: 'txt' };
    default: throw new Error('Format qo\'llab-quvvatlanmaydi: ' + format);
  }
}

module.exports = { buildReport, gatherReportData };
