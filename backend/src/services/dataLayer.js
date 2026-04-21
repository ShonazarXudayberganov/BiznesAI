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
    // Juda ixcham: "Name[n|sum=X]" num uchun, "Name[d]" date, "Name" text — minimum token
    const fmtCol = (cs) => {
      if (!cs) return '';
      if (cs.type === 'number' && cs.sum !== undefined) {
        const sumShort = cs.sum >= 1e9 ? `${(cs.sum / 1e9).toFixed(1)}B` :
                         cs.sum >= 1e6 ? `${(cs.sum / 1e6).toFixed(1)}M` :
                         cs.sum >= 1e3 ? `${(cs.sum / 1e3).toFixed(0)}K` : String(cs.sum);
        return `${cs.name}[n=${sumShort}]`;
      }
      if (cs.type === 'date') return `${cs.name}[d]`;
      if (cs.type === 'empty') return '';
      return cs.name;
    };
    // Har varaq uchun max 20 ustun (raqam va date ustunlari birinchi, qolganlari keyin)
    const topCols = (stats) => {
      if (!stats) return [];
      const nums = stats.filter(c => c.type === 'number');
      const dates = stats.filter(c => c.type === 'date');
      const others = stats.filter(c => c.type !== 'number' && c.type !== 'date' && c.type !== 'empty');
      return [...nums, ...dates, ...others].slice(0, 20).map(fmtCol).filter(Boolean);
    };
    const sheetsLite = (schema.sheets || []).map(sh => ({
      title: sh.title,
      rows: sh.rowCount,
      cols: topCols(sh.columnStats),
      colTotal: (sh.columns || []).length,
    }));
    result.push({
      id: s.id,
      type: s.type,
      name: s.name,
      rowCount: s.row_count || 0,
      sheets: sheetsLite,
      columns: topCols(schema.columnStats),
      colTotal: (schema.columns || []).length,
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
// Ustun turi va statistikasini aniqlaydi (AI to'g'ri ustun tanlashi uchun)
function inferColumnStats(rows, colName) {
  const values = rows.map(r => r?.[colName]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  const total = rows.length;
  const nonEmpty = values.length;
  if (nonEmpty === 0) return { name: colName, type: 'empty', nonEmpty: 0, totalRows: total };

  // Number test: majority parseable
  const nums = values.map(v => parseNum(v)).filter(n => !isNaN(n));
  const numRatio = nums.length / nonEmpty;

  // Date test: majority parseable
  let dateCount = 0;
  for (const v of values.slice(0, Math.min(50, values.length))) {
    const s = String(v);
    // DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s.trim()) || /^\d{4}-\d{1,2}-\d{1,2}/.test(s.trim())) dateCount++;
  }
  const dateRatio = dateCount / Math.min(50, values.length);

  let type = 'text';
  if (numRatio > 0.7) type = 'number';
  else if (dateRatio > 0.7) type = 'date';

  const stat = { name: colName, type, nonEmpty, totalRows: total };
  if (type === 'number' && nums.length > 0) {
    stat.min = Math.min(...nums);
    stat.max = Math.max(...nums);
    stat.sum = Math.round(nums.reduce((a, b) => a + b, 0));
    stat.sampleValues = values.slice(0, 3).map(String);
  } else {
    stat.sampleValues = [...new Set(values.map(String))].slice(0, 5);
  }
  return stat;
}

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
      sheets: data.map(s => {
        const rows = s.rows || [];
        const colStats = (s.headers || []).map(h => inferColumnStats(rows, h));
        return {
          title: s._sheet,
          rowCount: s._rowCount || rows.length,
          rawRowCount: s._rawRowCount || s._rowCount || 0,
          columns: s.headers || [],
          columnStats: colStats,
          hidden: !!s._hidden,
          sample: rows.slice(0, 2),
        };
      }),
      columns: [],
      sample: [],
    };
  }

  // Tabular (object massivi)
  if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const columns = Object.keys(data[0] || {}).filter(k => !k.startsWith('_'));
    const columnStats = columns.map(c => inferColumnStats(data, c));
    return { sheets: [], columns, columnStats, sample: data.slice(0, 2) };
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

  const out = {
    value: typeof value === 'number' ? Math.round(value * 100) / 100 : value,
    count: nums.length,
    totalRows: filtered.length,
    function: fn,
    column: colKey,
  };
  // Ogohlantirishlar — AI foydalanuvchiga to'g'ri kontekst beradi
  if (colKey !== column) {
    out.note = `So'ralgan "${column}" ustuni "${colKey}" ga moslandi. Aniq mos kelmasa boshqa ustunni tanlang.`;
  }
  if (nums.length > 0 && nums.length < filtered.length * 0.5) {
    out.warning = `Faqat ${nums.length}/${filtered.length} qatorda raqam bor. Qolganlar bo'sh — boshqa ustun (masalan to'lov turlari alohida: Naqd, Karta) kerak bo'lishi mumkin.`;
  }
  return out;
}

function findColumnKey(row, column) {
  if (!column || !row) return column;
  if (row[column] !== undefined) return column;
  const lower = normalizeStr(column);
  if (!lower) return column;
  // 1) Aniq mos (katta-kichik harfsiz)
  for (const k of Object.keys(row)) {
    if (normalizeStr(k) === lower) return k;
  }
  // 2) Apostrof/tire farqlarini normallashtirish
  const stripPunct = (s) => s.replace(/[’'`\-_\s]/g, '');
  const lowerStripped = stripPunct(lower);
  for (const k of Object.keys(row)) {
    if (stripPunct(normalizeStr(k)) === lowerStripped) return k;
  }
  // 3) Contains mos — LEKIN juda qisqa so'rov (< 3 belgi) bilan bermaymiz
  //    (masalan "s" 'mahsulot' ga tushmasin)
  if (lower.length >= 3) {
    for (const k of Object.keys(row)) {
      const kn = normalizeStr(k);
      if (kn.length >= 3 && (kn.includes(lower) || lower.includes(kn))) return k;
    }
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
 * queryData — SQL-ga o'xshash mini-DSL bitta chaqiruvda:
 *   SELECT ... WHERE ... GROUP BY ... (AGGREGATES) ORDER BY ... LIMIT ...
 *
 * Spec:
 *   sourceId, sheet (optional)
 *   select: ["col1", "col2"] yoki ["*"]  — agregatsiya bo'lsa e'tiborga olinmaydi
 *   where:  { col: value | {gte,lte,gt,lt,contains,equals,in} }
 *   groupBy: ["col"] yoki ["col1","col2"] (ko'p ustun — kompozit guruh)
 *   aggregates: [{ col, func: sum|avg|count|min|max|median, as }]
 *   orderBy: [{ col, dir: "asc"|"desc" }]
 *   limit:  max natija (default 100, cap 500)
 *
 * Natija:
 *   { rows: [...], totalRows, groupedBy, aggregates, truncated }
 */
async function queryData({ sourceId, sheet, select, where, groupBy, aggregates, orderBy, limit }) {
  const rows = await getSheetRows(sourceId, sheet);
  if (!rows) return { error: 'Manba topilmadi' };

  const sample = rows[0] || {};
  const resolveCol = (c) => findColumnKey(sample, c);

  // WHERE
  const filtered = where ? rows.filter(r => rowMatchesFilter(r, where)) : rows;

  const cappedLimit = Math.min(Math.max(parseInt(limit || 100, 10), 1), 500);

  const hasGroup = Array.isArray(groupBy) && groupBy.length > 0;
  const hasAgg = Array.isArray(aggregates) && aggregates.length > 0;

  // GROUP BY + AGGREGATES
  if (hasGroup || hasAgg) {
    const groupCols = hasGroup ? groupBy.map(resolveCol) : [];
    const groupKey = (row) => groupCols.map(c => String(row[c] ?? '').trim() || '(bo\'sh)').join(' | ');

    const buckets = new Map();
    if (hasGroup) {
      for (const row of filtered) {
        const k = groupKey(row);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(row);
      }
    } else {
      buckets.set('_all', filtered);
    }

    const aggResults = [];
    for (const [k, groupRows] of buckets.entries()) {
      const out = {};
      if (hasGroup) {
        const parts = k.split(' | ');
        groupCols.forEach((c, i) => { out[c] = parts[i]; });
      }
      for (const a of (aggregates || [{ func: 'count' }])) {
        const fn = String(a.func || 'count').toLowerCase();
        const colKey = a.col ? resolveCol(a.col) : null;
        const alias = a.as || `${fn}_${a.col || '_'}`;
        if (fn === 'count' || !colKey) {
          out[alias] = groupRows.length;
          continue;
        }
        const nums = groupRows.map(r => parseNum(r[colKey])).filter(n => !isNaN(n));
        let value = 0;
        if (nums.length > 0) {
          if (fn === 'sum') value = nums.reduce((x, y) => x + y, 0);
          else if (fn === 'avg' || fn === 'mean') value = nums.reduce((x, y) => x + y, 0) / nums.length;
          else if (fn === 'min') value = Math.min(...nums);
          else if (fn === 'max') value = Math.max(...nums);
          else if (fn === 'median') {
            const s = [...nums].sort((a, b) => a - b);
            value = s.length % 2 === 0 ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2 : s[Math.floor(s.length / 2)];
          }
        }
        out[alias] = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
      }
      aggResults.push(out);
    }

    // ORDER BY — avval aggregate-output row ichidan qidiramiz (alias uchun),
    // bo'lmasa asl ustun nomi bilan fuzzy mos keltiramiz
    if (Array.isArray(orderBy) && orderBy.length > 0) {
      const aggSample = aggResults[0] || {};
      const resolveAggCol = (c) => {
        if (c in aggSample) return c;
        return findColumnKey(aggSample, c);
      };
      aggResults.sort((x, y) => {
        for (const o of orderBy) {
          const col = resolveAggCol(o.col);
          const dir = String(o.dir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
          const xn = parseNum(x[col]); const yn = parseNum(y[col]);
          const a = isNaN(xn) ? String(x[col] ?? '') : xn;
          const b = isNaN(yn) ? String(y[col] ?? '') : yn;
          if (a < b) return -1 * dir;
          if (a > b) return 1 * dir;
        }
        return 0;
      });
    }

    return {
      rows: aggResults.slice(0, cappedLimit),
      totalRows: aggResults.length,
      groupedBy: groupCols,
      aggregates: (aggregates || []).map(a => ({ col: a.col, func: a.func, as: a.as })),
      truncated: aggResults.length > cappedLimit,
      matchedInputRows: filtered.length,
    };
  }

  // Plain SELECT (no group, no agg)
  let output = filtered;
  if (Array.isArray(select) && select.length > 0 && select[0] !== '*') {
    const keys = select.map(resolveCol);
    output = output.map(r => {
      const o = {};
      keys.forEach((k, i) => { o[select[i]] = r[k]; });
      return o;
    });
  }
  // ORDER BY
  if (Array.isArray(orderBy) && orderBy.length > 0) {
    const orderKeys = orderBy.map(o => ({ col: resolveCol(o.col), dir: String(o.dir || 'asc').toLowerCase() === 'desc' ? -1 : 1 }));
    output = [...output].sort((x, y) => {
      for (const { col, dir } of orderKeys) {
        const xn = parseNum(x[col]); const yn = parseNum(y[col]);
        const a = isNaN(xn) ? String(x[col] ?? '') : xn;
        const b = isNaN(yn) ? String(y[col] ?? '') : yn;
        if (a < b) return -1 * dir;
        if (a > b) return 1 * dir;
      }
      return 0;
    });
  }
  return {
    rows: output.slice(0, cappedLimit),
    totalRows: output.length,
    truncated: output.length > cappedLimit,
    matchedInputRows: filtered.length,
  };
}

/**
 * Time series — bir ustun bo'yicha vaqt kesimida agregatsiya
 * dateColumn — sana ustuni, aggColumn — raqam ustuni, granularity — day/week/month/year
 */
async function timeSeries({ sourceId, sheet, dateColumn, aggColumn, func = 'sum', filter, granularity = 'month', limit = 60 }) {
  const rows = await getSheetRows(sourceId, sheet);
  if (!rows) return { error: 'Manba topilmadi' };

  const filtered = filter ? rows.filter(r => rowMatchesFilter(r, filter)) : rows;
  const dateKey = findColumnKey(filtered[0] || {}, dateColumn);
  const aggKey = aggColumn ? findColumnKey(filtered[0] || {}, aggColumn) : null;

  const bucketFn = {
    day: d => d.toISOString().slice(0, 10),
    week: d => {
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    },
    month: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    year: d => String(d.getFullYear()),
  }[granularity] || (d => d.toISOString().slice(0, 10));

  const buckets = new Map();
  for (const row of filtered) {
    const raw = row[dateKey];
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    const key = bucketFn(d);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const series = [];
  for (const [bucket, bucketRows] of buckets.entries()) {
    let value;
    if (func === 'count' || !aggKey) value = bucketRows.length;
    else {
      const nums = bucketRows.map(r => parseNum(r[aggKey])).filter(n => !isNaN(n));
      if (nums.length === 0) value = 0;
      else if (func === 'sum') value = nums.reduce((a, b) => a + b, 0);
      else if (func === 'avg') value = nums.reduce((a, b) => a + b, 0) / nums.length;
      else if (func === 'min') value = Math.min(...nums);
      else if (func === 'max') value = Math.max(...nums);
      else value = bucketRows.length;
    }
    series.push({ bucket, value: Math.round(value * 100) / 100, rows: bucketRows.length });
  }

  series.sort((a, b) => a.bucket.localeCompare(b.bucket));
  return {
    series: series.slice(-limit),
    granularity,
    function: func,
    dateColumn: dateKey,
    aggColumn: aggKey,
    totalBuckets: series.length,
  };
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
  timeSeries,
  queryData,
  // Helpers (testing uchun ham foydali)
  parseNum,
  findColumnKey,
  rowMatchesFilter,
};
