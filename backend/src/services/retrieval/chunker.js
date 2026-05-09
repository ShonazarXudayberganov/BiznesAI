/**
 * Chunker — manba qatorlarini semantic chunk'larga bo'ladi.
 *
 * Strategiya:
 *  1. Agar source `data` array ko'rinishida bo'lsa (Excel/Sheets/CRM) — qatorlarni guruhlab matn chunk yaratamiz.
 *  2. Document/text turi bo'lsa — ~300 token oraliqlarda bo'lamiz.
 *
 * Chunk hajmi: ~300-500 token (1200-2000 char). Bu Voyage embedding va Anthropic
 * context window uchun optimal.
 *
 * Har chunk metadata bilan keladi: { sourceId, sourceName, dateFrom, dateTo,
 * category, rowIndices, summary }.
 */

const TARGET_CHUNK_CHARS = 1500; // ~350 token
const MAX_CHUNK_CHARS = 2400;
const HARD_MIN_CHARS = 200;

/**
 * Texnik qator kalitlarini filterlash (id, _meta, va h.k.)
 */
const TECHNICAL_KEYS = new Set([
  'id', '_id', '__id', '_type', '_entity', '_kind',
  'created_at', 'updated_at', 'deleted_at',
  '__v', '_uid', '_meta',
]);

/**
 * Sana ustunini topish (date-like value)
 */
function findDateColumn(rows) {
  if (!rows || rows.length === 0) return null;
  const sample = rows.slice(0, Math.min(20, rows.length));
  const candidates = ['Sana', 'Date', 'date', 'sana', 'CreatedAt', 'created_at', 'Vaqt', 'Oy', 'Created'];
  for (const k of candidates) {
    if (sample.some(r => r[k] != null && /\d{4}|\d{1,2}[./-]\d{1,2}/.test(String(r[k])))) {
      return k;
    }
  }
  // Auto-detect: birinchi ustun date-like
  const keys = Object.keys(sample[0] || {});
  for (const k of keys) {
    let dateCount = 0;
    for (const r of sample) {
      const v = String(r[k] || '');
      if (/\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(v)) dateCount++;
    }
    if (dateCount > sample.length / 2) return k;
  }
  return null;
}

/**
 * Qatorlar groupini tabular matn ko'rinishida formatlash.
 * Ko'p ustunli bo'lsa, faqat eng muhim 6-10 ta ustun.
 */
function formatRowsAsTable(rows, opts = {}) {
  if (!rows || rows.length === 0) return '';
  const allKeys = new Set();
  rows.forEach(r => {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach(k => {
        if (!TECHNICAL_KEYS.has(k) && !k.startsWith('_')) allKeys.add(k);
      });
    }
  });
  // Eng informativ ustunlarni tanlash (har birida noyob qiymat ulushiga qarab)
  const keys = Array.from(allKeys).slice(0, 12);

  const headers = keys.join(' | ');
  const sep = keys.map(() => '---').join(' | ');
  const lines = [headers, sep];
  for (const r of rows) {
    const cells = keys.map(k => {
      const v = r[k];
      if (v == null) return '';
      if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
      return String(v).slice(0, 80);
    });
    lines.push(cells.join(' | '));
  }
  return lines.join('\n');
}

/**
 * Qatorlarni chunk'larga bo'lish.
 *
 * @param {object} source — { id, name, type, data: [...] }
 * @returns {Array<{ chunkIndex, content, metadata, tokenEstimate }>}
 */
function chunkSourceData(source) {
  const data = Array.isArray(source.data) ? source.data : [];
  const sourceName = source.name || source.id;
  const sourceType = source.type || 'unknown';

  // Document/text turi
  if (sourceType === 'document' && data[0]?.content) {
    return chunkDocument(data, source);
  }

  if (data.length === 0) return [];

  // Tabular ma'lumot (Excel, Sheets, CRM, va h.k.)
  const dateCol = findDateColumn(data);
  const groups = [];

  if (dateCol) {
    // Sana bo'yicha guruhlash (oy)
    const byMonth = {};
    data.forEach((row, idx) => {
      const v = String(row[dateCol] || '');
      const m = v.match(/(\d{4})[-./](\d{1,2})/);
      const key = m ? `${m[1]}-${m[2].padStart(2, '0')}` : 'noma_lum';
      if (!byMonth[key]) byMonth[key] = { rows: [], indices: [] };
      byMonth[key].rows.push(row);
      byMonth[key].indices.push(idx);
    });
    for (const [month, g] of Object.entries(byMonth)) {
      groups.push({
        label: month,
        rows: g.rows,
        indices: g.indices,
        metadata: { period: month, dateColumn: dateCol },
      });
    }
  } else {
    // Sana yo'q — N qator bo'yicha bo'lish
    const BATCH = 30;
    for (let i = 0; i < data.length; i += BATCH) {
      const slice = data.slice(i, i + BATCH);
      groups.push({
        label: `qatorlar ${i + 1}-${Math.min(i + BATCH, data.length)}`,
        rows: slice,
        indices: Array.from({ length: slice.length }, (_, k) => i + k),
        metadata: { batch: Math.floor(i / BATCH) },
      });
    }
  }

  // Har guruhni TARGET_CHUNK_CHARS atrofida bitta yoki bir necha chunk'ga aylantiramiz
  const chunks = [];
  let chunkIdx = 0;
  for (const g of groups) {
    const tableText = formatRowsAsTable(g.rows);
    const header = `[${sourceName}] ${g.label} (${g.rows.length} qator)`;
    const fullContent = `${header}\n${tableText}`;

    if (fullContent.length <= MAX_CHUNK_CHARS) {
      // Bitta chunk
      chunks.push({
        chunkIndex: chunkIdx++,
        content: fullContent,
        metadata: {
          sourceId: source.id,
          sourceName,
          rowCount: g.rows.length,
          rowIndices: g.indices,
          ...g.metadata,
        },
        tokenEstimate: Math.ceil(fullContent.length / 4),
      });
    } else {
      // Bir necha chunk'ga bo'lish (tabular qatorlarda)
      const lines = tableText.split('\n');
      const headLine = lines[0];
      const sepLine = lines[1] || '';
      const rowLines = lines.slice(2);
      let cur = [];
      let curLen = header.length + headLine.length + sepLine.length + 4;
      let part = 1;
      const flush = () => {
        if (cur.length === 0) return;
        const partHeader = `${header} (qism ${part})`;
        const content = `${partHeader}\n${headLine}\n${sepLine}\n${cur.join('\n')}`;
        chunks.push({
          chunkIndex: chunkIdx++,
          content,
          metadata: {
            sourceId: source.id,
            sourceName,
            rowCount: cur.length,
            rowIndices: g.indices.slice(part === 1 ? 0 : (part - 1) * 30, part * 30),
            part,
            ...g.metadata,
          },
          tokenEstimate: Math.ceil(content.length / 4),
        });
        cur = [];
        curLen = header.length + headLine.length + sepLine.length + 4;
        part++;
      };
      for (const ln of rowLines) {
        if (curLen + ln.length + 1 > TARGET_CHUNK_CHARS && cur.length > 0) flush();
        cur.push(ln);
        curLen += ln.length + 1;
      }
      flush();
    }
  }

  return chunks;
}

/**
 * Document (PDF/DOCX/TXT) — to'g'ridan-to'g'ri matnni chunk qilish.
 */
function chunkDocument(data, source) {
  const text = data.map(d => d.content || '').filter(Boolean).join('\n\n');
  if (!text) return [];
  const chunks = [];
  let chunkIdx = 0;
  // Paragraflarga bo'lish, keyin TARGET_CHUNK_CHARS atrofida birlashtirish
  const paras = text.split(/\n{2,}/);
  let cur = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length === 0) return;
    const content = `[${source.name || source.id}]\n${cur.join('\n\n')}`;
    chunks.push({
      chunkIndex: chunkIdx++,
      content,
      metadata: { sourceId: source.id, sourceName: source.name },
      tokenEstimate: Math.ceil(content.length / 4),
    });
    cur = [];
    curLen = 0;
  };
  for (const p of paras) {
    if (curLen + p.length > TARGET_CHUNK_CHARS && cur.length > 0) flush();
    cur.push(p);
    curLen += p.length;
  }
  flush();
  return chunks;
}

module.exports = {
  chunkSourceData,
  TARGET_CHUNK_CHARS,
  MAX_CHUNK_CHARS,
};
