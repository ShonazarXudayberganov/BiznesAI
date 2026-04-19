/**
 * Telegram HTML xabar formatlovchi.
 * Telegram HTML yorliqlari: <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <blockquote>
 * Rang uchun emoji ishlatamiz (chinakam rang yo'q).
 */

const HR = '━━━━━━━━━━━━━━━━━━━━━';
const HR_SHORT = '─────────────';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Severity → emoji
function severityIcon(s) {
  return s === 'critical' ? '🔴' : s === 'warning' ? '🟡' : s === 'ok' ? '🟢' : '🔵';
}

// Trend → emoji
function trendArrow(delta) {
  if (delta > 0) return '📈';
  if (delta < 0) return '📉';
  return '➡️';
}

// Raqamni formatlash (12345 → "12,345")
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('uz-UZ');
}

// Pul (12400000 → "12.4M so'm")
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B so\'m';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M so\'m';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K so\'m';
  return n + ' so\'m';
}

// Foiz farqi (delta formatlash)
function fmtPct(cur, prev) {
  if (!prev || prev === 0) return '';
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  return `(${sign}${pct.toFixed(0)}%)`;
}

// Header (sarlavha)
function header(title, date) {
  return `<b>${escHtml(title)}</b>${date ? `\n<i>${escHtml(date)}</i>` : ''}\n${HR}`;
}

// Section (bo'lim)
function section(emoji, title) {
  return `\n${emoji} <b>${escHtml(title).toUpperCase()}</b>`;
}

// Bullet (ichki nuqta)
function bullet(label, value, extra) {
  const v = value !== undefined ? ` <b>${escHtml(String(value))}</b>` : '';
  const e = extra ? ` <i>${escHtml(extra)}</i>` : '';
  return `  ▫️ ${escHtml(label)}${v ? ':' + v : ''}${e}`;
}

// KPI satri: raqam bilan
function kpiRow(emoji, label, value, trend) {
  const v = value !== undefined ? ` — <b>${escHtml(String(value))}</b>` : '';
  const t = trend ? ` ${trend}` : '';
  return `${emoji} ${escHtml(label)}${v}${t}`;
}

// Jadval (monospace, pre ichida)
// columns: [{label, width}], rows: [[values]]
function table(columns, rows) {
  const widths = columns.map(c => c.width || 14);
  const padCell = (v, w) => {
    const s = String(v ?? '');
    if (s.length >= w) return s.slice(0, w - 1) + '…';
    return s + ' '.repeat(w - s.length);
  };
  const headLine = columns.map((c, i) => padCell(c.label, widths[i])).join('  ');
  const sepLine = widths.map(w => '─'.repeat(w)).join('  ');
  const bodyLines = rows.map(r => r.map((v, i) => padCell(v, widths[i])).join('  '));
  return `<pre>${escHtml(headLine)}\n${escHtml(sepLine)}\n${bodyLines.map(escHtml).join('\n')}</pre>`;
}

// Iqtibos (insight yoki xulosalar uchun)
function quote(text) {
  return `<blockquote>${escHtml(text)}</blockquote>`;
}

// Footer (pastki chegara)
function footer() {
  return `\n${HR_SHORT}\n<i>Analix · analix.uz</i>`;
}

// Markdown-ish (bold **xxx**) → Telegram HTML (ixtiyoriy yordamchi — AI matnlari uchun)
function mdToTgHtml(md) {
  let s = escHtml(md);
  // ** bold **
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // * italic *  (bold o'zgarganidan keyin)
  s = s.replace(/(^|[^\*])\*([^\*\n]+?)\*/g, '$1<i>$2</i>');
  // `code`
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Sarlavhalar qisqartirilgan: ### → qalin
  s = s.replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>');
  // - ▫️ bullet
  s = s.replace(/^[-*]\s+/gm, '  ▫️ ');
  // Separator chiziq
  s = s.replace(/^---+$/gm, HR_SHORT);
  return s;
}

module.exports = {
  HR, HR_SHORT,
  escHtml, severityIcon, trendArrow,
  fmtNum, fmtMoney, fmtPct,
  header, section, bullet, kpiRow, table, quote, footer,
  mdToTgHtml,
};
