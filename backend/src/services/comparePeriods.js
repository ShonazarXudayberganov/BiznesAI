/**
 * Period taqqoslash xizmati — joriy davr vs o'tgan davr.
 *
 * Vazifalar:
 *   - Ikki sana oralig'i orasida sum/avg/count taqqoslash
 *   - Delta hisoblash (absolyut + foiz)
 *   - Per-bucket breakdown (kunlik/haftalik) chart uchun
 *   - YoY (yil oldin shu davr) yoki Previous (oldingi davr) rejimi
 *
 * Foydalanuvchi fronendda dropdown bilan period tanlaydi:
 *   - "Bugun vs kecha" / "Bu hafta vs o'tgan hafta" / "Bu oy vs o'tgan oy" / "Bu yil vs o'tgan yil"
 *   - "Bu oy vs o'tgan yil shu oy" (YoY)
 */

const dataLayer = require('./dataLayer');

const PERIOD_DAYS = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 91,
  year: 365,
};

/**
 * Berilgan periodga ko'ra joriy va oldingi davr sanalarini hisoblaydi.
 *
 * @param {string} period — 'day' | 'week' | 'month' | 'quarter' | 'year'
 * @param {string} mode — 'previous' (oldingi davr) yoki 'year_ago' (yil oldin)
 * @param {Date} now — referens sana (default: hozir)
 * @returns {{current: {start, end}, previous: {start, end}, label}}
 */
function calculatePeriodRanges(period, mode = 'previous', now = new Date()) {
  const days = PERIOD_DAYS[period] || 30;
  const end = new Date(now);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);

  let prevEnd, prevStart;
  if (mode === 'year_ago') {
    prevEnd = new Date(end);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    prevStart = new Date(start);
    prevStart.setFullYear(prevStart.getFullYear() - 1);
  } else {
    prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    prevStart.setHours(0, 0, 0, 0);
  }

  const labels = {
    day: { previous: 'Bugun vs kecha', year_ago: 'Bugun vs bir yil oldin' },
    week: { previous: 'Bu hafta vs o\'tgan hafta', year_ago: 'Bu hafta vs bir yil oldin' },
    month: { previous: 'Bu oy vs o\'tgan oy', year_ago: 'Bu oy vs o\'tgan yil shu oy' },
    quarter: { previous: 'Bu chorak vs o\'tgan chorak', year_ago: 'Bu chorak vs o\'tgan yil shu chorak' },
    year: { previous: 'Bu yil vs o\'tgan yil', year_ago: 'Bu yil vs o\'tgan yil' },
  };

  return {
    current: { start, end },
    previous: { start: prevStart, end: prevEnd },
    label: labels[period]?.[mode] || `${period} vs ${mode}`,
  };
}

function inRange(d, range) {
  const t = d.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime() + 86399999;
}

function parseNum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return NaN;
  const cleaned = String(v).replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

function findKey(row, name) {
  if (!row || !name) return name;
  if (row[name] !== undefined) return name;
  const lower = String(name).toLowerCase().trim();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === lower) return k;
  }
  return name;
}

function aggSlice(rows, dateKey, valueKey, range, func = 'sum') {
  const matching = rows.filter(r => {
    const raw = r[dateKey];
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    return inRange(d, range);
  });

  if (func === 'count' || !valueKey) {
    return { value: matching.length, count: matching.length };
  }

  const nums = matching.map(r => parseNum(r[valueKey])).filter(n => !isNaN(n));
  if (nums.length === 0) return { value: 0, count: matching.length };

  let v;
  if (func === 'sum') v = nums.reduce((a, b) => a + b, 0);
  else if (func === 'avg') v = nums.reduce((a, b) => a + b, 0) / nums.length;
  else if (func === 'min') v = Math.min(...nums);
  else if (func === 'max') v = Math.max(...nums);
  else v = nums.reduce((a, b) => a + b, 0);

  return { value: Math.round(v * 100) / 100, count: matching.length };
}

function bucketize(rows, dateKey, valueKey, range, granularity, func) {
  const buckets = new Map();
  const fmt = granularity === 'month'
    ? (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    : (d) => d.toISOString().slice(0, 10);

  for (const r of rows) {
    const raw = r[dateKey];
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime()) || !inRange(d, range)) continue;
    const k = fmt(d);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }

  const out = [];
  for (const [bucket, bucketRows] of buckets.entries()) {
    let v;
    if (func === 'count' || !valueKey) v = bucketRows.length;
    else {
      const nums = bucketRows.map(r => parseNum(r[valueKey])).filter(n => !isNaN(n));
      if (nums.length === 0) v = 0;
      else if (func === 'avg') v = nums.reduce((a, b) => a + b, 0) / nums.length;
      else v = nums.reduce((a, b) => a + b, 0);
    }
    out.push({ bucket, value: Math.round(v * 100) / 100 });
  }
  return out.sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/**
 * Asosiy taqqoslash funksiyasi.
 *
 * @param {object} opts
 * @param {string} opts.sourceId
 * @param {string} opts.dateColumn — sana ustun nomi
 * @param {string} [opts.valueColumn] — qiymat ustun (yoq → count)
 * @param {string} [opts.func='sum']
 * @param {string} [opts.period='month'] — day|week|month|quarter|year
 * @param {string} [opts.mode='previous'] — previous|year_ago
 * @param {boolean} [opts.includeBreakdown=true] — chart uchun bucket data
 */
async function comparePeriods(opts) {
  const {
    sourceId, dateColumn, valueColumn, func = 'sum',
    period = 'month', mode = 'previous',
    includeBreakdown = true,
  } = opts;

  if (!sourceId) return { error: 'sourceId majburiy' };
  if (!dateColumn) return { error: 'dateColumn majburiy' };

  // dataLayer.getSheetRows ham private — boshqa yo'l bilan rows olamiz
  const rows = await dataLayer._getRowsForCompare
    ? await dataLayer._getRowsForCompare(sourceId)
    : await fetchRowsViaSchema(sourceId);
  if (!rows || rows.length === 0) return { error: 'Manba bo\'sh yoki topilmadi' };

  const dateKey = findKey(rows[0], dateColumn);
  const valueKey = valueColumn ? findKey(rows[0], valueColumn) : null;

  const ranges = calculatePeriodRanges(period, mode);
  const granularity = period === 'year' ? 'month' : 'day';

  const cur = aggSlice(rows, dateKey, valueKey, ranges.current, func);
  const prev = aggSlice(rows, dateKey, valueKey, ranges.previous, func);

  const deltaAbs = cur.value - prev.value;
  const deltaPct = prev.value !== 0
    ? Math.round((deltaAbs / Math.abs(prev.value)) * 1000) / 10
    : (cur.value > 0 ? 100 : 0);
  const direction = deltaAbs > 0 ? 'up' : deltaAbs < 0 ? 'down' : 'flat';

  const result = {
    period,
    mode,
    label: ranges.label,
    func,
    current: {
      start: ranges.current.start.toISOString().slice(0, 10),
      end: ranges.current.end.toISOString().slice(0, 10),
      value: cur.value,
      count: cur.count,
    },
    previous: {
      start: ranges.previous.start.toISOString().slice(0, 10),
      end: ranges.previous.end.toISOString().slice(0, 10),
      value: prev.value,
      count: prev.count,
    },
    delta: {
      abs: Math.round(deltaAbs * 100) / 100,
      pct: deltaPct,
      direction,
    },
  };

  if (includeBreakdown) {
    result.breakdown = {
      current: bucketize(rows, dateKey, valueKey, ranges.current, granularity, func),
      previous: bucketize(rows, dateKey, valueKey, ranges.previous, granularity, func),
    };
  }

  return result;
}

// Helper — dataLayer'dan rows olish (sheet bo'lmagan oddiy source)
async function fetchRowsViaSchema(sourceId) {
  const pool = require('../db/pool');
  const r = await pool.query('SELECT data FROM source_data WHERE source_id=$1 LIMIT 1', [sourceId]);
  if (!r.rows.length) return [];
  const d = r.rows[0].data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    const firstKey = Object.keys(d)[0];
    if (firstKey && Array.isArray(d[firstKey])) return d[firstKey];
  }
  return [];
}

module.exports = { comparePeriods, calculatePeriodRanges };
