/**
 * Data Layer — har turdagi manba (Sheets, Excel, CSV, Telegram, Instagram,
 * CRM, REST API, Hujjat) uchun yagona qidiruv/agregatsiya interfeysi.
 *
 * AI agent shu funksiyalarni vosita sifatida ishlatadi.
 *
 * Sheets: source_data.data — varaqlar massivi, har birida {headers, rows, rawRows, _sheet}
 * Boshqa tabular: source_data.data — qatorlar massivi (har biri object)
 * Telegram kanal: telegram_channels + telegram_channel_posts
 */
const pool = require('../db/pool');

// ────────────────────────────────────────────────
// SOURCES — listing va meta
// ────────────────────────────────────────────────

/**
 * Tashkilotning barcha ulangan manbalar ro'yxati (qisqa meta).
 */
async function listOrgSources(organizationId) {
  const r = await pool.query(
    `SELECT s.id, s.type, s.name, s.connected, s.active, s.config,
            sd.row_count
     FROM sources s
     LEFT JOIN source_data sd ON sd.source_id = s.id
     WHERE s.organization_id = $1 AND s.connected = TRUE AND s.active = TRUE
     ORDER BY s.type, s.name`,
    [organizationId]
  );

  const channels = await pool.query(
    `SELECT id, channel_id, username, title, member_count
     FROM telegram_channels WHERE organization_id=$1 AND active=TRUE`,
    [organizationId]
  );

  const result = [];

  for (const s of r.rows) {
    const schema = await getSourceSchema(s.id);
    result.push({
      id: s.id,
      type: s.type,
      name: s.name,
      rowCount: s.row_count || 0,
      sheets: schema.sheets,        // sheets/excel uchun varaqlar
      columns: schema.columns,      // tabular uchun ustunlar
      sample: schema.sample,        // 1-2 ta namuna qator
    });
  }

  for (const c of channels.rows) {
    result.push({
      id: `tg_channel:${c.id}`,
      type: 'telegram_channel',
      name: c.title,
      username: c.username,
      memberCount: c.member_count || 0,
      columns: ['posted_at', 'text', 'views', 'forwards', 'reactions', 'media_type'],
      sample: [],
    });
  }

  return result;
}

/**
 * Manba sxemasi: ustunlar, varaqlar, namuna.
 */
async function getSourceSchema(sourceId) {
  const r = await pool.query(
    `SELECT s.type, s.name, sd.data
     FROM sources s
     LEFT JOIN source_data sd ON sd.source_id = s.id
     WHERE s.id = $1`,
    [sourceId]
  );
  if (r.rows.length === 0) return { sheets: [], columns: [], sample: [] };
  const { type, data } = r.rows[0];

  if (!data || !Array.isArray(data)) return { sheets: [], columns: [], sample: [] };

  // Sheets/Excel formati — varaqlar
  if (data.length > 0 && data[0]._sheet !== undefined) {
    return {
      sheets: data.map(s => ({
        title: s._sheet,
        rowCount: s._rowCount || (s.rows ? s.rows.length : 0),
        rawRowCount: s._rawRowCount || s._rowCount || 0,
        columns: s.headers || [],
        hidden: !!s._hidden,
        sample: (s.rows || []).slice(0, 2),
      })),
      columns: [],
      sample: [],
    };
  }

  // Tabular (object massivi)
  if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const columns = Object.keys(data[0] || {}).filter(k => !k.startsWith('_'));
    return { sheets: [], columns, sample: data.slice(0, 2) };
  }

  return { sheets: [], columns: [], sample: [] };
}

// ────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────

function normalizeStr(s) {
  return String(s ?? '').toLowerCase().trim();
}

/**
 * Bitta qiymat qidiruvga moslashtirilganmi?
 * Bo'sh bo'lmagan, regex/like uslubida.
 */
function rowMatches(row, query) {
  if (!query) return true;
  const q = normalizeStr(query);
  if (!q) return true;
  // Har qiymatda qidiramiz
  for (const v of Object.values(row)) {
    if (normalizeStr(v).includes(q)) return true;
  }
  return false;
}

/**
 * Filter object'i bilan moslik tekshiruvi.
 * filter: { column: value | { gte, lte, contains, in: [...] } }
 */
function rowMatchesFilter(row, filter) {
  if (!filter || typeof filter !== 'object') return true;
  for (const [col, condition] of Object.entries(filter)) {
    const cell = row[col] !== undefined ? row[col] : findKeyCaseInsensitive(row, col);
    if (condition === null || condition === undefined) continue;
    if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
      if (normalizeStr(cell) !== normalizeStr(condition) && !normalizeStr(cell).includes(normalizeStr(condition))) {
        return false;
      }
    } else if (typeof condition === 'object') {
      if (condition.contains && !normalizeStr(cell).includes(normalizeStr(condition.contains))) return false;
      if (condition.equals !== undefined && normalizeStr(cell) !== normalizeStr(condition.equals)) return false;
      if (condition.in && Array.isArray(condition.in) && !condition.in.some(v => normalizeStr(cell) === normalizeStr(v))) return false;
      if (condition.gte !== undefined && parseNum(cell) < parseNum(condition.gte)) return false;
      if (condition.lte !== undefined && parseNum(cell) > parseNum(condition.lte)) return false;
      if (condition.gt !== undefined && parseNum(cell) <= parseNum(condition.gt)) return false;
      if (condition.lt !== undefined && parseNum(cell) >= parseNum(condition.lt)) return false;
    }
  }
  return true;
}

function findKeyCaseInsensitive(obj, key) {
  if (!obj) return undefined;
  const lower = String(key).toLowerCase();
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  // "1,234.56" yoki "1 234,56" yoki "$1,234" — tozalash
  const cleaned = String(v).replace(/[^\d.,\-]/g, '').replace(/,/g, '.');
  // Agar bir nechta nuqta bo'lsa — oxirgisini qoldiramiz, qolganlarini olib tashlaymiz
  const parts = cleaned.split('.');
  let normalized = cleaned;
  if (parts.length > 2) normalized = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  const n = parseFloat(normalized);
  return isNaN(n) ? NaN : n;
}

// ────────────────────────────────────────────────
// SHEETS uchun yordamchi — varaqdan qatorlar olish
// ────────────────────────────────────────────────

async function getSheetRows(sourceId, sheetTitle) {
  const r = await pool.query(`SELECT data FROM source_data WHERE source_id=$1`, [sourceId]);
  if (r.rows.length === 0 || !r.rows[0].data) return null;
  const data = r.rows[0].data;
  if (!Array.isArray(data)) return null;

  // Sheets format
  if (data.length > 0 && data[0]._sheet !== undefined) {
    if (sheetTitle) {
      const sheet = data.find(s => normalizeStr(s._sheet) === normalizeStr(sheetTitle));
      return sheet ? sheet.rows || [] : null;
    }
    // sheet ko'rsatilmasa — birinchi varaq
    return (data[0].rows || []);
  }

  // Tabular
  return data;
}

/**
 * Manba ichida qidirish — query string + filter object
 */
async function searchInSource({ sourceId, sheet, query, filter, limit = 100 }) {
  const isTgChannel = String(sourceId).startsWith('tg_channel:');
  if (isTgChannel) return searchTelegramPosts(sourceId, query, filter, limit);

  const rows = await getSheetRows(sourceId, sheet);
  if (!rows) return { rows: [], total: 0, error: 'Manba topilmadi yoki bo\'sh' };

  const filtered = rows.filter(row => {
    if (query && !rowMatches(row, query)) return false;
    if (filter && !rowMatchesFilter(row, filter)) return false;
    return true;
  });

  return {
    rows: filtered.slice(0, limit),
    total: filtered.length,
    truncated: filtered.length > limit,
  };
}

async function searchTelegramPosts(sourceId, query, filter, limit) {
  const channelId = parseInt(String(sourceId).split(':')[1], 10);
  let sql = `SELECT message_id, posted_at, text, views, forwards, reactions, media_type
             FROM telegram_channel_posts WHERE channel_id=$1`;
  const params = [channelId];
  let i = 2;
  if (query) {
    sql += ` AND text ILIKE $${i++}`;
    params.push(`%${query}%`);
  }
  if (filter?.posted_at?.gte) {
    sql += ` AND posted_at >= $${i++}`;
    params.push(filter.posted_at.gte);
  }
  if (filter?.posted_at?.lte) {
    sql += ` AND posted_at <= $${i++}`;
    params.push(filter.posted_at.lte);
  }
  sql += ` ORDER BY posted_at DESC LIMIT $${i++}`;
  params.push(limit);
  const r = await pool.query(sql, params);
  return { rows: r.rows, total: r.rows.length, truncated: false };
}

/**
 * Agregatsiya — SUM, AVG, COUNT, MIN, MAX, MEDIAN
 */
async function aggregate({ sourceId, sheet, column, func, filter }) {
  const rows = await getSheetRows(sourceId, sheet);
  if (!rows) return { error: 'Manba topilmadi' };

  const filtered = filter ? rows.filter(row => rowMatchesFilter(row, filter)) : rows;
  const fn = String(func || 'count').toLowerCase();

  if (fn === 'count') {
    return { value: filtered.length, count: filtered.length, function: 'count', column };
  }

  // Ustun qiymatlarini sonlarga aylantirish
  const colKey = findColumnKey(filtered[0] || rows[0] || {}, column);
  const nums = filtered
    .map(r => parseNum(r[colKey]))
    .filter(n => !isNaN(n));

  if (nums.length === 0) {
    return { value: 0, count: 0, function: fn, column, note: 'Bu ustunda raqam qiymatlar topilmadi' };
  }

  let value;
  if (fn === 'sum') value = nums.reduce((a, b) => a + b, 0);
  else if (fn === 'avg' || fn === 'mean') value = nums.reduce((a, b) => a + b, 0) / nums.length;
  else if (fn === 'min') value = Math.min(...nums);
  else if (fn === 'max') value = Math.max(...nums);
  else if (fn === 'median') {
    const sorted = [...nums].sort((a, b) => a - b);
    value = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  } else {
    return { error: `Noma'lum funksiya: ${fn}. Mavjud: sum, avg, count, min, max, median` };
  }

  return {
    value: typeof value === 'number' ? Math.round(value * 100) / 100 : value,
    count: nums.length,
    totalRows: filtered.length,
    function: fn,
    column: colKey,
  };
}

function findColumnKey(row, column) {
  if (!column || !row) return column;
  if (row[column] !== undefined) return column;
  const lower = normalizeStr(column);
  for (const k of Object.keys(row)) {
    if (normalizeStr(k) === lower) return k;
  }
  // Yumshoq mos kelish
  for (const k of Object.keys(row)) {
    if (normalizeStr(k).includes(lower) || lower.includes(normalizeStr(k))) return k;
  }
  return column;
}

/**
 * GroupBy — guruhlash + agregatsiya
 */
async function groupBy({ sourceId, sheet, groupColumn, aggColumn, func, filter, limit = 50 }) {
  const rows = await getSheetRows(sourceId, sheet);
  if (!rows) return { error: 'Manba topilmadi' };

  const filtered = filter ? rows.filter(row => rowMatchesFilter(row, filter)) : rows;
  const fn = String(func || 'sum').toLowerCase();
  const groupKey = findColumnKey(filtered[0] || rows[0] || {}, groupColumn);
  const aggKey = aggColumn ? findColumnKey(filtered[0] || rows[0] || {}, aggColumn) : null;

  const groups = new Map();
  for (const row of filtered) {
    const g = String(row[groupKey] ?? '').trim() || '(bo\'sh)';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);
  }

  const out = [];
  for (const [g, rowsInGroup] of groups.entries()) {
    let value;
    if (fn === 'count' || !aggKey) {
      value = rowsInGroup.length;
    } else {
      const nums = rowsInGroup.map(r => parseNum(r[aggKey])).filter(n => !isNaN(n));
      if (nums.length === 0) value = 0;
      else if (fn === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (fn === 'avg' || fn === 'mean') value = nums.reduce((a, b) => a + b, 0) / nums.length;
      else if (fn === 'min') value = Math.min(...nums);
      else if (fn === 'max') value = Math.max(...nums);
      else value = rowsInGroup.length;
    }
    out.push({ group: g, value: typeof value === 'number' ? Math.round(value * 100) / 100 : value, rows: rowsInGroup.length });
  }

  // Eng kattadan tartiblash
  out.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  return {
    groups: out.slice(0, limit),
    totalGroups: out.length,
    function: fn,
    groupColumn: groupKey,
    aggColumn: aggKey,
  };
}

/**
 * Distinct values — ustundagi noyob qiymatlar
 */
async function getDistinctValues({ sourceId, sheet, column, limit = 100 }) {
  const rows = await getSheetRows(sourceId, sheet);
  if (!rows) return { error: 'Manba topilmadi' };

  const colKey = findColumnKey(rows[0] || {}, column);
  const seen = new Set();
  const counts = new Map();
  for (const row of rows) {
    const v = String(row[colKey] ?? '').trim();
    if (!v) continue;
    seen.add(v);
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const values = [...seen].sort().slice(0, limit);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([value, count]) => ({ value, count }));

  return { values, total: seen.size, column: colKey, top };
}

/**
 * Cross-source qidiruv — barcha manbalar bo'ylab kalit so'z bilan
 */
async function crossSourceSearch({ organizationId, query, limit = 50 }) {
  const sources = await listOrgSources(organizationId);
  const results = [];
  for (const src of sources) {
    if (src.type === 'telegram_channel') {
      const r = await searchTelegramPosts(src.id, query, null, 10);
      if (r.rows.length > 0) {
        results.push({ source: src.name, type: src.type, sourceId: src.id, matches: r.rows.length, rows: r.rows.slice(0, 3) });
      }
      continue;
    }
    if (src.sheets && src.sheets.length > 0) {
      for (const sheet of src.sheets) {
        const r = await searchInSource({ sourceId: src.id, sheet: sheet.title, query, limit: 10 });
        if (r.rows && r.rows.length > 0) {
          results.push({ source: `${src.name} / ${sheet.title}`, type: src.type, sourceId: src.id, sheet: sheet.title, matches: r.total, rows: r.rows.slice(0, 3) });
        }
      }
    } else {
      const r = await searchInSource({ sourceId: src.id, query, limit: 10 });
      if (r.rows && r.rows.length > 0) {
        results.push({ source: src.name, type: src.type, sourceId: src.id, matches: r.total, rows: r.rows.slice(0, 3) });
      }
    }
  }
  return { query, totalSources: results.length, results: results.slice(0, limit) };
}

module.exports = {
  listOrgSources,
  getSourceSchema,
  searchInSource,
  aggregate,
  groupBy,
  getDistinctValues,
  crossSourceSearch,
  // Helpers (testing uchun ham foydali)
  parseNum,
  findColumnKey,
  rowMatchesFilter,
};
