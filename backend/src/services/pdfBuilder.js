/**
 * Premium PDF builder — AI tomonidan yaratilgan strukturali hisobotlar uchun.
 *
 * Foydalanish: AI generate_pdf tool chaqiradi va structured data uzatadi.
 * Bu modul HTML template'ga oradi va puppeteer orqali PDF qaytaradi.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const PDF_DIR = path.join(UPLOAD_DIR, 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

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

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNumber(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(String(n).replace(/[^\d.\-]/g, ''));
  if (isNaN(num)) return escape(n);
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' mlrd';
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' mln';
  if (Math.abs(num) >= 1e3) return Math.round(num).toLocaleString('uz-UZ');
  return num.toLocaleString('uz-UZ');
}

function isNumeric(v) {
  if (v === null || v === undefined) return false;
  const cleaned = String(v).replace(/[*`\s,]/g, '');
  return /^[\+\-]?\d[\d.]*\s*%?$/.test(cleaned);
}

function renderTable(table) {
  if (!table || !table.headers || !table.rows) return '';
  const headers = table.headers.map(h => `<th>${escape(h)}</th>`).join('');
  // Numerik ustunlarni aniqlash
  const numCols = new Set();
  table.headers.forEach((_, ci) => {
    let nums = 0, total = 0;
    for (const row of table.rows) {
      if (row[ci] !== undefined && row[ci] !== '') {
        total++;
        if (isNumeric(row[ci])) nums++;
      }
    }
    if (total > 1 && nums / total >= 0.6) numCols.add(ci);
  });
  const rows = table.rows.map(row => {
    const cells = row.map((c, ci) => {
      const klass = numCols.has(ci) ? ' class="num"' : '';
      const val = numCols.has(ci) ? fmtNumber(c) : escape(c);
      // % belgisi bo'lsa rang
      const m = String(c).match(/^([\+\-]?[\d.,]+)\s*%/);
      if (m) {
        const isNeg = m[1].startsWith('-');
        return `<td${klass}><span class="${isNeg ? 'neg' : 'pos'}">${escape(c)}</span></td>`;
      }
      return `<td${klass}>${val}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `
    <div class="tbl-wrap">
      ${table.title ? `<div class="tbl-title">${escape(table.title)}</div>` : ''}
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${table.note ? `<div class="tbl-note">${escape(table.note)}</div>` : ''}
    </div>
  `;
}

function renderSection(section) {
  if (typeof section === 'string') return `<p>${escape(section)}</p>`;
  let body = '';
  if (section.heading) body += `<h2>${escape(section.heading)}</h2>`;
  if (section.intro) body += `<p>${escape(section.intro)}</p>`;
  if (section.bullets && section.bullets.length) {
    body += `<ul>${section.bullets.map(b => `<li>${escape(b)}</li>`).join('')}</ul>`;
  }
  if (section.callout) {
    const kind = section.callout.kind || 'info';
    body += `<div class="callout callout-${kind}">
      ${section.callout.title ? `<div class="callout-title">${escape(section.callout.title)}</div>` : ''}
      <div class="callout-body">${escape(section.callout.body)}</div>
    </div>`;
  }
  if (section.tables && section.tables.length) {
    body += section.tables.map(renderTable).join('');
  }
  if (section.text) body += `<p>${escape(section.text)}</p>`;
  if (section.html) body += section.html; // raw HTML — markdown'dan kelganda ishlatiladi
  return `<section class="rep-section">${body}</section>`;
}

/**
 * To'liq markdown → HTML konvertor (PDF uchun premium darajada).
 * Qo'llab-quvvatlanadi: # H1, ## H2, ### H3, **bold**, *italic*, `code`,
 * - bullet, 1. ordered, > callout, jadval (markdown table), --- divider, paragraf.
 */
function markdownToHtml(md) {
  if (!md) return '';
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let listType = null;     // 'ul' | 'ol' | null
  let tableBuf = null;     // { headers: [], rows: [], aligns: [] } yoki null

  const inline = (s) => escape(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  const flushTable = () => {
    if (!tableBuf) return;
    const { headers, rows, aligns } = tableBuf;
    // Sonlik ustunlarni aniqlash (% va status emojilarni hisobga olib)
    const numCols = new Set();
    headers.forEach((h, i) => {
      const colVals = rows.map(r => r[i] || '');
      const nums = colVals.filter(v => /^[\+\-]?[\d.,]+(\s*%)?$/.test(String(v).trim())).length;
      if (nums > 0 && nums / colVals.length >= 0.5) numCols.add(i);
    });
    const ths = headers.map((h, i) => `<th${numCols.has(i) ? ' class="num"' : ''}>${inline(h)}</th>`).join('');
    const trs = rows.map(r => {
      const tds = r.map((c, i) => {
        const cell = String(c).trim();
        // % yoki +/- bilan qiymat — rangli
        const pctMatch = cell.match(/^([\+\-]?)([\d.,]+)\s*%$/);
        if (pctMatch) {
          const cls = pctMatch[1] === '-' ? 'neg' : (pctMatch[1] === '+' ? 'pos' : '');
          return `<td class="num"><span class="${cls}">${inline(cell)}</span></td>`;
        }
        // 🟢🟡🔴 status emojilari
        if (/^[🟢🟡🔴🟠⚪]$/u.test(cell)) {
          return `<td style="text-align:center;font-size:14pt">${cell}</td>`;
        }
        return `<td${numCols.has(i) ? ' class="num"' : ''}>${inline(cell)}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    out.push(`<div class="tbl-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
    tableBuf = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.trim();

    // Jadval header detection: `| col1 | col2 |` followed by `| --- | --- |`
    if (line.startsWith('|') && line.endsWith('|') && !tableBuf) {
      const next = (lines[idx + 1] || '').trim();
      if (/^\|[\s\-:|]+\|$/.test(next) && next.includes('-')) {
        closeList();
        const headers = line.slice(1, -1).split('|').map(s => s.trim());
        const aligns = next.slice(1, -1).split('|').map(s => {
          const t = s.trim();
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':')) return 'right';
          return 'left';
        });
        tableBuf = { headers, rows: [], aligns };
        idx++; // skip separator line
        continue;
      }
    }
    // Jadval row
    if (tableBuf && line.startsWith('|') && line.endsWith('|')) {
      const row = line.slice(1, -1).split('|').map(s => s.trim());
      tableBuf.rows.push(row);
      continue;
    }
    // Jadval tugadi
    if (tableBuf && (!line.startsWith('|') || !line.endsWith('|'))) {
      flushTable();
    }

    if (!line) { closeList(); continue; }
    let m;
    // Horizontal rule
    if (/^---+$/.test(line)) { closeList(); out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0"/>'); continue; }
    if ((m = line.match(/^####\s+(.+)$/))) { closeList(); out.push(`<h3 style="font-size:11pt;color:#475569">${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^###\s+(.+)$/))) { closeList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^##\s+(.+)$/)))  { closeList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^#\s+(.+)$/)))   { closeList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^[-*]\s+(.+)$/))) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = line.match(/^\d+\.\s+(.+)$/))) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/i))) {
      closeList();
      const kind = m[1].toLowerCase();
      const cls = ({ warning:'warning', tip:'tip', info:'info', success:'success', key:'key' })[kind] || 'info';
      // Sarlavha bo'lsa keyingi satrlardan
      const titleMatch = m[2].match(/^\*\*([^*]+)\*\*\s*(.*)$/);
      const title = titleMatch ? titleMatch[1] : null;
      const body = titleMatch ? titleMatch[2] : m[2];
      out.push(`<div class="callout callout-${cls}">${title ? `<div class="callout-title">${inline(title)}</div>` : ''}<div class="callout-body">${inline(body)}</div></div>`);
      continue;
    }
    if ((m = line.match(/^>\s+(.*)$/))) {
      closeList();
      out.push(`<blockquote style="margin:10px 0;padding:8px 14px;border-left:3px solid #c9a063;background:#fffbf0;color:#1a1f2e">${inline(m[1])}</blockquote>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushTable();
  closeList();
  return out.join('\n');
}

/**
 * @param {object} doc
 * @param {string} doc.title — hisobot sarlavhasi
 * @param {string} [doc.subtitle]
 * @param {string} [doc.orgName]
 * @param {string} [doc.author]
 * @param {Array<object|string>} doc.sections — [{heading, intro, bullets[], tables[], callout, text}]
 * @param {object} [doc.summary] — { headline, value, change }
 * @param {string} [doc.footer]
 */
function buildHtml(doc) {
  const today = new Date().toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const sectionsHtml = (doc.sections || []).map(renderSection).join('');
  const summaryBlock = doc.summary ? `
    <div class="summary-card">
      ${doc.summary.headline ? `<div class="summary-headline">${escape(doc.summary.headline)}</div>` : ''}
      ${doc.summary.value ? `<div class="summary-value">${escape(doc.summary.value)}</div>` : ''}
      ${doc.summary.change ? `<div class="summary-change">${escape(doc.summary.change)}</div>` : ''}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="uz"><head><meta charset="UTF-8">
<title>${escape(doc.title || 'Hisobot')}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "SF Pro Display", "Segoe UI", "Inter", system-ui, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1f2e; background: #fff; }

  /* Header */
  .rep-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 3px solid; border-image: linear-gradient(90deg, #c9a063, #00b8a9, transparent) 1; margin-bottom: 24px; }
  .rep-head-left .rep-brand { font-size: 11pt; font-weight: 800; letter-spacing: 1.5px; color: #c9a063; text-transform: uppercase; margin-bottom: 4px; }
  .rep-head-left .rep-title { font-size: 22pt; font-weight: 800; letter-spacing: -0.6px; color: #0f1623; margin: 0 0 4px; line-height: 1.2; }
  .rep-head-left .rep-subtitle { font-size: 11pt; color: #64748b; }
  .rep-head-right { text-align: right; font-size: 9.5pt; color: #64748b; }
  .rep-head-right .rep-date { font-weight: 600; color: #1a1f2e; }

  /* Summary card */
  .summary-card { padding: 18px 22px; border-radius: 14px; background: linear-gradient(135deg, #fffbf0 0%, #f0fdfb 100%); border: 1px solid #e8d7a0; margin-bottom: 26px; }
  .summary-headline { font-size: 10pt; font-weight: 700; color: #c9a063; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px; }
  .summary-value { font-size: 26pt; font-weight: 800; color: #0f1623; letter-spacing: -1px; line-height: 1.1; margin-bottom: 4px; }
  .summary-change { font-size: 11pt; color: #64748b; }

  /* Sections */
  h2 { font-size: 14pt; font-weight: 800; color: #0f1623; margin: 24px 0 10px; padding-left: 12px; border-left: 4px solid #c9a063; letter-spacing: -0.2px; }
  h3 { font-size: 12pt; font-weight: 700; color: #00958a; margin: 16px 0 6px; }
  p { margin: 0 0 10px; color: #1a1f2e; line-height: 1.7; }
  ul { margin: 8px 0 14px; padding-left: 20px; }
  li { margin-bottom: 5px; line-height: 1.65; }
  li::marker { color: #c9a063; }

  /* Tables */
  .tbl-wrap { margin: 14px 0 22px; }
  .tbl-title { font-size: 10.5pt; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px #e2e8f0; }
  th { background: linear-gradient(135deg, #c9a063 0%, #b8924f 100%); color: #fff; padding: 10px 14px; text-align: left; font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  th.num { text-align: right; }
  td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; font-size: 10.5pt; }
  td.num { text-align: right; font-family: "SF Mono", Menlo, monospace; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  tbody tr:last-child td { border-bottom: none; }
  .tbl-note { margin-top: 6px; font-size: 9pt; color: #94a3b8; font-style: italic; }
  .pos { color: #16a34a; font-weight: 700; }
  .neg { color: #dc2626; font-weight: 700; }

  /* Callouts */
  .callout { padding: 14px 18px; border-radius: 10px; margin: 14px 0; border-left: 4px solid; }
  .callout-warning { background: #fff7ed; border-color: #f59e0b; }
  .callout-warning .callout-title { color: #ea580c; }
  .callout-tip, .callout-info { background: #ecfeff; border-color: #06b6d4; }
  .callout-tip .callout-title, .callout-info .callout-title { color: #0891b2; }
  .callout-key { background: #fffbf0; border-color: #c9a063; }
  .callout-key .callout-title { color: #b8924f; }
  .callout-success { background: #f0fdf4; border-color: #16a34a; }
  .callout-success .callout-title { color: #15803d; }
  .callout-title { font-weight: 800; font-size: 10.5pt; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .callout-body { font-size: 11pt; color: #1a1f2e; line-height: 1.65; }

  /* Footer */
  .rep-footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9pt; color: #94a3b8; }
</style>
</head><body>
  <div class="rep-head">
    <div class="rep-head-left">
      <div class="rep-brand">${escape(doc.orgName || 'Analix · BiznesAI')}</div>
      <h1 class="rep-title">${escape(doc.title || 'Hisobot')}</h1>
      ${doc.subtitle ? `<div class="rep-subtitle">${escape(doc.subtitle)}</div>` : ''}
    </div>
    <div class="rep-head-right">
      <div class="rep-date">${today}</div>
      ${doc.author ? `<div>Muallif: ${escape(doc.author)}</div>` : ''}
    </div>
  </div>

  ${summaryBlock}
  ${sectionsHtml}

  <div class="rep-footer">
    <span>${escape(doc.footer || 'Analix AI tomonidan tayyorlandi')}</span>
    <span>${today}</span>
  </div>
</body></html>`;
}

/**
 * PDF yaratish va URL qaytarish.
 */
async function generatePdf(doc) {
  const html = buildHtml(doc);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    // Faylni saqlash
    const slug = String(doc.title || 'hisobot').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const ts = Date.now().toString(36);
    const hash = crypto.randomBytes(3).toString('hex');
    const filename = `${slug}-${ts}-${hash}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    fs.writeFileSync(filepath, pdfBuffer);
    return {
      ok: true,
      filename,
      url: `/uploads/pdfs/${filename}`,
      sizeKb: Math.round(pdfBuffer.length / 1024),
      pages: null,
    };
  } finally {
    try { await page.close(); } catch {}
  }
}

module.exports = { generatePdf, buildHtml, markdownToHtml };
