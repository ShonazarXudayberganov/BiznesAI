/**
 * Anomaliya kuzatuvchi — har manba va har raqamli ustun bo'yicha.
 *
 * Algoritm (sodda lekin samarali):
 *   1. Har manba uchun listOrgSources/getSourceSchema bilan raqamli ustunlar topiladi
 *   2. Har raqamli ustun uchun trend (oylik, kunlik) hisoblanadi
 *   3. Z-score baseline = oxirgi 30 kun (yoki tarix bo'yicha)
 *   4. |z| > threshold → anomaliya
 *   5. AI agent har anomaliyani izohlaydi (qisqa sabab tushuntirish)
 *
 * telegram_anomalies jadvalini ishlatadi (Phase 1'da yaratilgan).
 */
const pool = require('../db/pool');
const dataLayer = require('./dataLayer');

const SENSITIVITY = {
  low:    { warning: 999, critical: 3.5 },
  medium: { warning: 2.0, critical: 3.0 },
  high:   { warning: 1.5, critical: 2.5 },
};

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}

/**
 * Sheets/Excel uchun: sana ustuni bor varaqlardan kunlik/oylik trend topish
 * va anomaliya aniqlash.
 *
 * @param {number} orgId
 * @param {string} sensitivity
 * @returns {Promise<Array<{type, severity, source, sheet, column, value, baseline, details}>>}
 */
async function detectAnomalies(orgId, sensitivity = 'medium') {
  const threshold = SENSITIVITY[sensitivity] || SENSITIVITY.medium;
  const found = [];
  const sources = await dataLayer.listOrgSources(orgId);

  for (const src of sources) {
    if (src.type === 'telegram_channel') {
      const channelAnomalies = await detectChannelAnomalies(orgId, src, threshold);
      found.push(...channelAnomalies);
      continue;
    }
    // Sheets/Excel uchun
    if (src.sheets && src.sheets.length > 0) {
      for (const sheet of src.sheets) {
        const sheetAnomalies = await detectTabularAnomalies(src, sheet, threshold);
        found.push(...sheetAnomalies);
      }
    }
  }
  return found;
}

async function detectChannelAnomalies(orgId, src, threshold) {
  const channelDbId = parseInt(String(src.id).split(':')[1], 10);
  const r = await pool.query(
    `SELECT date, members, views_total, shares_total
     FROM telegram_channel_stats_daily
     WHERE channel_id=$1 AND date >= CURRENT_DATE - INTERVAL '30 days'
     ORDER BY date`,
    [channelDbId]
  );
  if (r.rows.length < 5) return [];
  const today = r.rows[r.rows.length - 1];
  const baseline = r.rows.slice(0, -1);
  const found = [];

  for (const metric of ['members', 'views_total', 'shares_total']) {
    const vals = baseline.map(row => Number(row[metric] || 0)).filter(v => v > 0);
    if (vals.length < 5) continue;
    const todayVal = Number(today[metric] || 0);
    const m = mean(vals);
    const s = std(vals);
    if (s === 0 || m === 0) continue;
    const z = (todayVal - m) / s;
    const sev = Math.abs(z) >= threshold.critical ? 'critical' : Math.abs(z) >= threshold.warning ? 'warning' : null;
    if (!sev) continue;
    found.push({
      type: `channel.${metric}`,
      severity: sev,
      source: src.name,
      sourceId: src.id,
      column: metric,
      value: todayVal,
      baseline: Math.round(m),
      details: { z: Number(z.toFixed(2)), pctChange: Math.round(((todayVal - m) / m) * 100), direction: z > 0 ? 'oshish' : 'pasayish' },
    });
  }
  return found;
}

/**
 * Tabular (sheets/excel) uchun:
 *   1. Sheet sxemasidan raqamli ustunlarni aniqlash (namuna asosida)
 *   2. Sana ustuni bor bo'lsa — kunlik/oylik trend
 *   3. Sana yo'q bo'lsa — guruhlangan agregatsiya orasida outlier
 */
async function detectTabularAnomalies(src, sheet, threshold) {
  if (!sheet.sample || sheet.sample.length === 0) return [];
  // Faqat raqamli ustunlarni topish
  const numericCols = [];
  const dateCols = [];
  for (const col of sheet.columns || []) {
    const sampleValues = sheet.sample.map(r => r[col]).filter(v => v !== '' && v !== null && v !== undefined);
    if (sampleValues.length === 0) continue;
    const numCount = sampleValues.filter(v => !isNaN(dataLayer.parseNum(v))).length;
    const dateCount = sampleValues.filter(v => /\d{2,4}[-./]\d{1,2}[-./]\d{1,4}/.test(String(v))).length;
    if (numCount / sampleValues.length > 0.7) numericCols.push(col);
    if (dateCount / sampleValues.length > 0.5) dateCols.push(col);
  }

  if (numericCols.length === 0) return [];

  const found = [];
  // Sana ustuni bo'lsa — vaqt bo'yicha trend
  // Bo'lmasa — eng katta qator bilan o'rtacha solishtir
  for (const numCol of numericCols.slice(0, 3)) {  // har varaqdan max 3 ta ustun
    try {
      const agg = await dataLayer.aggregate({ sourceId: src.id, sheet: sheet.title, column: numCol, func: 'avg' });
      const max = await dataLayer.aggregate({ sourceId: src.id, sheet: sheet.title, column: numCol, func: 'max' });
      const min = await dataLayer.aggregate({ sourceId: src.id, sheet: sheet.title, column: numCol, func: 'min' });
      if (!agg.value || agg.value === 0) continue;
      const ratio = max.value / agg.value;
      // Eng katta qiymat o'rtachadan 5x katta bo'lsa — outlier
      if (ratio > 5) {
        found.push({
          type: 'sheet.outlier',
          severity: ratio > 10 ? 'critical' : 'warning',
          source: src.name,
          sheet: sheet.title,
          column: numCol,
          value: max.value,
          baseline: agg.value,
          details: { ratio: ratio.toFixed(1), min: min.value, avg: agg.value, max: max.value },
        });
      }
    } catch {}
  }
  return found;
}

/**
 * Aniqlangan anomaliyalarni DB'ga yozish (duplikat himoya bilan)
 */
async function persistAnomalies(orgId, anomalies) {
  const persisted = [];
  for (const a of anomalies) {
    const dup = await pool.query(
      `SELECT 1 FROM telegram_anomalies
       WHERE organization_id=$1 AND type=$2 AND metric=$3
         AND detected_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
      [orgId, a.type, a.column]
    );
    if (dup.rows.length > 0) continue;

    const ins = await pool.query(
      `INSERT INTO telegram_anomalies (organization_id, type, severity, metric, value, baseline, details, detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id`,
      [orgId, a.type, a.severity, a.column, a.value, a.baseline, JSON.stringify({ ...a.details, source: a.source, sheet: a.sheet, sourceId: a.sourceId })]
    );
    persisted.push({ ...a, id: ins.rows[0].id });
  }
  return persisted;
}

module.exports = { detectAnomalies, persistAnomalies, SENSITIVITY };
