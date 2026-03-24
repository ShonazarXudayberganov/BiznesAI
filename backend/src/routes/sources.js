const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Barcha routelar auth talab qiladi
router.use(requireAuth);

// ── GET /api/sources ── (foydalanuvchi manbalari)
router.get('/', async (req, res) => {
  try {
    const sources = await pool.query(
      `SELECT s.*, sd.data, sd.row_count
       FROM sources s
       LEFT JOIN source_data sd ON sd.source_id = s.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.userId]
    );

    const result = sources.rows.map(s => ({
      id: s.id,
      type: s.type,
      name: s.name,
      color: s.color,
      connected: s.connected,
      active: s.active,
      config: s.config || {},
      data: s.data || [],
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    res.json(result);
  } catch (err) {
    console.error('[SOURCES] GET error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/sources ── (yangi manba)
router.post('/', async (req, res) => {
  try {
    const { id, type, name, color, config } = req.body;
    if (!type || !name) {
      return res.status(400).json({ error: 'type va name kerak' });
    }

    const sourceId = id || Date.now() + '_' + Math.random().toString(36).slice(2);

    await pool.query(
      `INSERT INTO sources (id, user_id, type, name, color, config)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sourceId, req.userId, type, name.trim(), color || 'var(--teal)', JSON.stringify(config || {})]
    );

    // Bo'sh source_data yaratish
    await pool.query(
      `INSERT INTO source_data (source_id, data, row_count) VALUES ($1, '[]', 0)`,
      [sourceId]
    );

    res.status(201).json({ id: sourceId, ok: true });
  } catch (err) {
    console.error('[SOURCES] POST error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/sources/:id ── (manba yangilash)
router.put('/:id', async (req, res) => {
  try {
    const { name, color, connected, active, config } = req.body;

    // Tekshirish: foydalanuvchining manbasi ekanligini
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Manba topilmadi' });
    }

    const updates = [];
    const vals = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name=$${idx++}`); vals.push(name.trim()); }
    if (color !== undefined) { updates.push(`color=$${idx++}`); vals.push(color); }
    if (connected !== undefined) { updates.push(`connected=$${idx++}`); vals.push(connected); }
    if (active !== undefined) { updates.push(`active=$${idx++}`); vals.push(active); }
    if (config !== undefined) { updates.push(`config=$${idx++}`); vals.push(JSON.stringify(config)); }
    updates.push(`updated_at=NOW()`);

    vals.push(req.params.id);
    await pool.query(
      `UPDATE sources SET ${updates.join(', ')} WHERE id=$${idx}`,
      vals
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[SOURCES] PUT error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/sources/:id/data ── (manba ma'lumotlarini saqlash)
router.put('/:id/data', async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'data massiv bo\'lishi kerak' });
    }

    // Tekshirish
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Manba topilmadi' });
    }

    await pool.query(
      `INSERT INTO source_data (source_id, data, row_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
      [req.params.id, JSON.stringify(data), data.length]
    );

    // Manbani connected=true qilish
    await pool.query(
      `UPDATE sources SET connected=TRUE, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );

    res.json({ ok: true, rowCount: data.length });
  } catch (err) {
    console.error('[SOURCES] PUT data error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── GET /api/sources/:id/stats ── (bazadan statistika)
router.get('/:id/stats', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    const result = await pool.query('SELECT data, row_count FROM source_data WHERE source_id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.json({ rowCount: 0, columns: [], stats: {} });

    const data = result.rows[0].data || [];
    if (!Array.isArray(data) || data.length === 0) return res.json({ rowCount: 0, columns: [], stats: {} });

    // Ustunlar va statistika
    const columns = Object.keys(data[0] || {}).filter(k => !k.startsWith('_'));
    const stats = {};
    const sheets = {};

    data.forEach(row => {
      const sh = row._sheet || 'default';
      if (!sheets[sh]) sheets[sh] = 0;
      sheets[sh]++;
    });

    // Raqamli ustunlar uchun statistika
    columns.forEach(col => {
      const vals = data.map(r => parseFloat(String(r[col]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v) && v >= 0);
      if (vals.length > data.length * 0.3) {
        const sum = vals.reduce((a, b) => a + b, 0);
        stats[col] = {
          count: vals.length,
          sum: Math.round(sum * 100) / 100,
          avg: Math.round(sum / vals.length * 100) / 100,
          min: Math.round(Math.min(...vals) * 100) / 100,
          max: Math.round(Math.max(...vals) * 100) / 100,
        };
      }
    });

    res.json({ rowCount: data.length, columns, sheets, stats });
  } catch (err) {
    console.error('[SOURCES] stats error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════════════════════════
// SMART AI CONTEXT — RAG yondashuvi (ChatGPT/Claude kabi)
// Prinsip: BARCHA ma'lumotni emas, faqat KERAKLI qismni AI ga yuborish
// ════════════════════════════════════════════════════════════════════

// Token limitlar (xavfsiz zona — prompt + javob uchun joy qoldirish)
const MAX_CONTEXT_CHARS = 80000; // ~20K token — xavfsiz barcha modellar uchun
const MAX_SEARCH_RESULTS = 200;  // Qidiruv natijasi max
const SAMPLE_PER_SHEET = 5;     // Har listdan namuna

// Texnik kalitlar — AI ga kerak emas
const TECH_KEYS = new Set(['id','_id','_type','_entity','source_id','webhook_url','created_at','updated_at','__v','_v']);

// Qatorni tozalash — texnik kalitlarni olib tashlash
function cleanRow(row) {
  const clean = {};
  Object.entries(row).forEach(([k, v]) => {
    if (!TECH_KEYS.has(k) && !k.startsWith('_')) clean[k] = v;
  });
  return clean;
}

// Raqamli ustunlarni aniqlash
function findNumericColumns(data, allKeys) {
  return allKeys.filter(k => {
    const vals = data.slice(0, 100).map(r => parseFloat(String(r[k] || '').replace(/[^0-9.-]/g, '')));
    return vals.filter(v => !isNaN(v) && v !== 0).length > Math.min(data.length, 100) * 0.3;
  });
}

// Har bir raqamli ustun uchun to'liq statistika hisoblash
function computeFullStats(data, numCols, allKeys) {
  const stats = {};
  numCols.forEach(col => {
    const vals = data.map(r => parseFloat(String(r[col] || '').replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v));
    if (vals.length === 0) return;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    stats[col] = {
      count: vals.length,
      sum: Math.round(sum * 100) / 100,
      avg: Math.round(avg * 100) / 100,
      min: Math.round(Math.min(...vals) * 100) / 100,
      max: Math.round(Math.max(...vals) * 100) / 100,
      median: Math.round(median * 100) / 100,
    };
  });

  // Kategorik ustunlar uchun taqsimot (top 15)
  const catKeys = allKeys.filter(k => !numCols.includes(k));
  catKeys.forEach(col => {
    const freq = {};
    data.forEach(r => {
      const v = String(r[col] || '').trim();
      if (v && v !== 'undefined' && v !== 'null') freq[v] = (freq[v] || 0) + 1;
    });
    const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0 && entries.length <= 100) {
      stats[col] = { type: 'category', uniqueCount: entries.length, top: entries.slice(0, 15).map(([v, c]) => ({ value: v, count: c })) };
    } else if (entries.length > 100) {
      stats[col] = { type: 'category', uniqueCount: entries.length, top: entries.slice(0, 10).map(([v, c]) => ({ value: v, count: c })), note: `Juda ko'p unikal qiymatlar (${entries.length} ta)` };
    }
  });

  return stats;
}

// Savoldan kalit so'zlarni ajratish
function extractSearchWords(query) {
  const stopWords = new Set([
    'haqida','barcha','bilan','uchun','qanday','nima','kerak','ber','berish','ko\'rsat',
    'ayting','ayt','qil','qilish','hisobot','tahlil','malumot','ma\'lumot','to\'liq',
    'bo\'yicha','ning','dan','ga','da','ni','va','ham','esa','bu','shu','men',
    'nechta','qancha','umumiy','asosiy','eng','bor','yoq','about','all','the',
    'show','give','tell','report','analysis','data','information','chiqar','chiqarish',
    'qanday','qilib','analiz','qilish','solishtir','ber','ko\'rsat','jadval','grafik',
    'pro','vse','dai','pokazhi','rasskazhi','o','ob','po','v','na','iz',
  ]);
  return query.toLowerCase().trim().split(/[\s,;.!?]+/).filter(w => w.length > 1 && !stopWords.has(w));
}

// AQLLI QIDIRUV — savolga mos qatorlarni topish
function smartSearch(data, query, maxResults = MAX_SEARCH_RESULTS) {
  const words = extractSearchWords(query);
  if (words.length === 0) return { results: [], words: [] };

  const scored = data.map((row, idx) => {
    const rowText = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
    let score = 0;
    const matched = [];
    words.forEach(w => {
      if (rowText.includes(w)) { score += 2; matched.push(w); }
      // Partial match (3+ harf mos kelsa)
      else if (w.length >= 3) {
        const partial = Object.values(row).some(v => String(v || '').toLowerCase().includes(w.slice(0, 3)));
        if (partial) { score += 1; matched.push(w + '~'); }
      }
    });
    return { row, idx, score, matched };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);

  return { results: scored.map(r => r.row), words, matchCount: scored.length };
}

// Kontekst hajmini tekshirish
function estimateTokens(text) {
  return Math.ceil(text.length / 4); // O'rtacha 1 token = 4 belgi
}

// ── POST /api/sources/:id/ai-context ── (SMART AI CONTEXT)
// Body: { query?: string } — savol bo'lsa qidiruv qiladi, bo'lmasa umumiy kontekst
router.post('/:id/ai-context', async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT s.*, sd.data, sd.row_count FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id WHERE s.id=$1 AND s.user_id=$2',
      [req.params.id, req.userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    const source = check.rows[0];
    const data = source.data || [];
    const total = data.length;
    const query = req.body?.query || '';

    if (total === 0) return res.json({ context: `MANBA: "${source.name}" — ma'lumot hali yuklanmagan (0 ta yozuv).`, rowCount: 0 });

    console.log(`[AI-CTX] Source: "${source.name}" (${total} rows), Query: "${query.slice(0, 80)}"`);

    // ════════════════════════════════════════════════════
    // 1. HUJJAT MANBASI (PDF, DOCX, TXT)
    // ════════════════════════════════════════════════════
    const isDocument = source.type === 'document' || data.some(d => d._type === 'document');
    if (isDocument) {
      let context = `HUJJAT MANBA: "${source.name}" (${total} ta fayl):\n`;
      let totalChars = 0;
      data.forEach((d, i) => {
        const text = d.toliq_matn || d.content || '';
        const fileName = d.fayl_nomi || d.fileName || `Fayl ${i + 1}`;
        const pages = d.sahifalar || d.pages || '';
        // Hajm nazorati — hujjat juda katta bo'lsa qisqartirish
        const maxPerDoc = Math.floor(MAX_CONTEXT_CHARS / Math.max(total, 1));
        const trimmed = text.length > maxPerDoc ? text.substring(0, maxPerDoc) + `\n... (${text.length - maxPerDoc} belgi qisqartirildi)` : text;
        context += `\n--- ${fileName}${pages ? ` (${pages} sahifa)` : ''} ---\n${trimmed}\n`;
        totalChars += trimmed.length;
      });
      console.log(`[AI-CTX] Document context: ${totalChars} chars`);
      return res.json({ context, rowCount: total, sheetCount: 1 });
    }

    // ════════════════════════════════════════════════════
    // 2. JADVAL MANBASI (Sheets, Excel, CRM, API, Manual)
    // ════════════════════════════════════════════════════
    const allKeys = Object.keys(data[0] || {}).filter(k => !TECH_KEYS.has(k) && !k.startsWith('_'));
    const numCols = findNumericColumns(data, allKeys);

    // Sheet bo'yicha guruhlash
    const sheets = {};
    data.forEach(row => {
      const sh = row._sheet || 'default';
      if (!sheets[sh]) sheets[sh] = [];
      sheets[sh].push(row);
    });
    const sheetNames = Object.keys(sheets);

    // ── A. STRUKTURA VA STATISTIKA (har doim yuboriladi) ──
    const fullStats = computeFullStats(data, numCols, allKeys);

    let context = '';
    context += `MANBA: "${source.name}" (${source.type})\n`;
    context += `JAMI: ${total} ta yozuv`;
    if (sheetNames.length > 1) context += `, ${sheetNames.length} ta list: ${sheetNames.map(s => `${s}(${sheets[s].length})`).join(', ')}`;
    context += `\n`;
    context += `USTUNLAR: ${allKeys.join(', ')}\n`;
    context += `RAQAMLI USTUNLAR: ${numCols.length > 0 ? numCols.join(', ') : 'yo\'q'}\n`;

    // Statistika
    context += `\nTO'LIQ STATISTIKA:\n`;
    Object.entries(fullStats).forEach(([col, st]) => {
      if (st.type === 'category') {
        context += `  ${col}: ${st.uniqueCount} ta unikal qiymat`;
        if (st.top) context += ` — top: ${st.top.map(t => `"${t.value}"(${t.count})`).join(', ')}`;
        context += `\n`;
      } else {
        context += `  ${col}: jami=${st.sum}, o'rtacha=${st.avg}, min=${st.min}, max=${st.max}, median=${st.median}, soni=${st.count}\n`;
      }
    });

    // ── B. SAVOL BO'LSA → AQLLI QIDIRUV ──
    if (query && query.trim().length > 1) {
      const { results, words, matchCount } = smartSearch(data, query);

      if (results.length > 0) {
        // Qidiruv natijalari hajmini nazorat qilish
        let searchRows = results.map(cleanRow);
        let searchJSON = JSON.stringify(searchRows, null, 1);

        // Agar hajm katta bo'lsa — qisqartirish
        while (estimateTokens(context + searchJSON) > MAX_CONTEXT_CHARS / 4 * 3 && searchRows.length > 10) {
          searchRows = searchRows.slice(0, Math.floor(searchRows.length * 0.7));
          searchJSON = JSON.stringify(searchRows, null, 1);
        }

        context += `\nQIDIRUV NATIJALARI (so'rov: "${query}", kalit so'zlar: [${words.join(', ')}]):\n`;
        context += `Topildi: ${matchCount} ta mos qator (${searchRows.length} tasi ko'rsatilmoqda)\n`;
        context += searchJSON + '\n';

        console.log(`[AI-CTX] Search: ${words.join(',')} → ${matchCount} matches, sending ${searchRows.length}`);
      } else {
        context += `\nQIDIRUV: "${query}" bo'yicha aniq mos qator topilmadi. Statistika asosida javob ber.\n`;
      }
    }

    // ── C. NAMUNA QATORLAR (har doim — AI strukturani tushunishi uchun) ──
    context += `\nNAMUNA QATORLAR:\n`;
    sheetNames.forEach(sh => {
      const rows = sheets[sh];
      if (sheetNames.length > 1) context += `--- ${sh} ---\n`;
      const sampleRows = rows.slice(0, SAMPLE_PER_SHEET).map(cleanRow);
      context += JSON.stringify(sampleRows, null, 1) + '\n';
    });

    // ── D. AGAR MA'LUMOT KAM BO'LSA (< 500 qator) — hammasini yuborish ──
    if (total <= 500) {
      const allClean = data.map(cleanRow);
      const allJSON = JSON.stringify(allClean, null, 1);
      if (estimateTokens(context + allJSON) < MAX_CONTEXT_CHARS / 4) {
        context += `\nTO'LIQ MA'LUMOT (${total} ta qator — barchasi sig'adi):\n`;
        context += allJSON + '\n';
        console.log(`[AI-CTX] Small dataset — sending all ${total} rows`);
      }
    }

    // ── E. MUHIM ESLATMA ──
    context += `\nMUHIM: Yuqoridagi statistika BARCHA ${total} ta qator asosida hisoblangan. Agar aniq ma'lumot so'ralsa va qidiruv natijasida topilmasa, statistikadan foydalanib javob ber. "Ma'lumot yo'q" DEMA — chunki statistika BARCHANI o'z ichiga oladi!\n`;

    console.log(`[AI-CTX] Final context: ${context.length} chars (~${estimateTokens(context)} tokens)`);
    res.json({ context, rowCount: total, sheetCount: sheetNames.length });
  } catch (err) {
    console.error('[SOURCES] ai-context error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/sources/smart-context ── (BARCHA manbalardan aqlli kontekst)
// Chat sahifasida ishlatiladi — bir nechta manbadan birgalikda
router.post('/smart-context', async (req, res) => {
  try {
    const { sourceIds, query } = req.body;
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: 'sourceIds kerak' });
    }

    const sources = await pool.query(
      `SELECT s.*, sd.data, sd.row_count
       FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id
       WHERE s.id = ANY($1) AND s.user_id=$2 AND s.connected=TRUE`,
      [sourceIds, req.userId]
    );

    if (sources.rows.length === 0) return res.json({ context: 'Ulangan manbalar topilmadi.' });

    let fullContext = '';
    let totalRows = 0;

    for (const source of sources.rows) {
      const data = source.data || [];
      if (data.length === 0) continue;
      totalRows += data.length;

      const isDocument = source.type === 'document' || data.some(d => d._type === 'document');

      if (isDocument) {
        fullContext += `\n═══ HUJJAT: "${source.name}" ═══\n`;
        data.forEach((d, i) => {
          const text = d.toliq_matn || d.content || '';
          const fileName = d.fayl_nomi || d.fileName || `Fayl ${i + 1}`;
          const maxLen = Math.floor(MAX_CONTEXT_CHARS / Math.max(sources.rows.length, 1) / Math.max(data.length, 1));
          fullContext += `${fileName}: ${text.substring(0, maxLen)}\n`;
        });
        continue;
      }

      // Jadval manba
      const allKeys = Object.keys(data[0] || {}).filter(k => !TECH_KEYS.has(k) && !k.startsWith('_'));
      const numCols = findNumericColumns(data, allKeys);
      const stats = computeFullStats(data, numCols, allKeys);

      fullContext += `\n═══ MANBA: "${source.name}" (${source.type}, ${data.length} ta qator) ═══\n`;
      fullContext += `Ustunlar: ${allKeys.join(', ')}\n`;

      // Statistika
      Object.entries(stats).forEach(([col, st]) => {
        if (st.type === 'category') {
          fullContext += `  ${col}: ${st.uniqueCount} xil — ${(st.top || []).slice(0, 8).map(t => `"${t.value}"(${t.count})`).join(', ')}\n`;
        } else {
          fullContext += `  ${col}: jami=${st.sum}, o'rtacha=${st.avg}, min=${st.min}, max=${st.max}\n`;
        }
      });

      // Qidiruv
      if (query && query.trim().length > 1) {
        const { results, words, matchCount } = smartSearch(data, query, 50);
        if (results.length > 0) {
          let searchRows = results.map(cleanRow);
          // Hajm nazorati
          let searchJSON = JSON.stringify(searchRows, null, 1);
          while (searchJSON.length > MAX_CONTEXT_CHARS / sources.rows.length && searchRows.length > 5) {
            searchRows = searchRows.slice(0, Math.floor(searchRows.length * 0.6));
            searchJSON = JSON.stringify(searchRows, null, 1);
          }
          fullContext += `Qidiruv (${words.join(',')}): ${matchCount} ta topildi\n${searchJSON}\n`;
        }
      }

      // Namuna
      const samples = data.slice(0, 3).map(cleanRow);
      fullContext += `Namuna: ${JSON.stringify(samples, null, 1)}\n`;

      // Kichik dataset — hammasini
      if (data.length <= 300) {
        const allJSON = JSON.stringify(data.map(cleanRow), null, 1);
        if (fullContext.length + allJSON.length < MAX_CONTEXT_CHARS) {
          fullContext += `To'liq ma'lumot (${data.length} qator):\n${allJSON}\n`;
        }
      }
    }

    fullContext += `\nJAMI: ${sources.rows.length} ta manba, ${totalRows} ta qator. Statistika BARCHA qatorlar asosida. "Ma'lumot yo'q" DEMA!\n`;

    console.log(`[SMART-CTX] ${sources.rows.length} sources, ${totalRows} rows, query: "${(query || '').slice(0, 50)}", context: ${fullContext.length} chars`);
    res.json({ context: fullContext, totalRows, sourceCount: sources.rows.length });
  } catch (err) {
    console.error('[SOURCES] smart-context error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Stop-words — qidiruvda hisobga olinmaydigan so'zlar
const STOP_WORDS = new Set([
  'haqida','barcha','bilan','uchun','qanday','nima','kerak','ber','berish','ko\'rsat',
  'ayting','ayt','qil','qilish','hisobot','tahlil','malumot','ma\'lumot','to\'liq',
  'bo\'yicha','ning','dan','ga','da','ni','va','ham','esa','bu','shu','men',
  'nechta','qancha','umumiy','asosiy','eng','bor','yoq','about','all','the',
  'show','give','tell','report','analysis','data','information',
  'про','все','дай','покажи','расскажи','о','об','по','в','на','из',
]);

function filterSearchWords(query) {
  return query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

// ── POST /api/sources/:id/search ── (bazadan qidirish)
router.post('/:id/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query kerak' });

    const check = await pool.query(
      'SELECT sd.data FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id WHERE s.id=$1 AND s.user_id=$2',
      [req.params.id, req.userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    const data = check.rows[0].data || [];
    if (!Array.isArray(data)) return res.json({ results: [], total: 0 });

    const words = filterSearchWords(query);
    if (words.length === 0) return res.json({ results: [], total: 0 });
    const techKeys = new Set(['_id','_type','_entity','source_id','webhook_url','__v']);

    // Agar bitta so'z ham topilsa — natija (ANY, EVERY emas)
    const results = data.filter(row => {
      const rowText = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
      return words.some(w => rowText.includes(w));
    }).sort((a, b) => {
      // Ko'proq so'z topilgan qator tepada
      const aText = Object.values(a).map(v => String(v || '').toLowerCase()).join(' ');
      const bText = Object.values(b).map(v => String(v || '').toLowerCase()).join(' ');
      const aScore = words.filter(w => aText.includes(w)).length;
      const bScore = words.filter(w => bText.includes(w)).length;
      return bScore - aScore;
    }).slice(0, 20).map(row => {
      const clean = {};
      Object.entries(row).forEach(([k, v]) => { if (!techKeys.has(k)) clean[k] = v; });
      return clean;
    });

    res.json({ results, total: results.length, query, searchWords: words });
  } catch (err) {
    console.error('[SOURCES] search error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/sources/search-all ── (barcha manbalardan AQLLI qidirish)
router.post('/search-all', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query kerak' });

    const sources = await pool.query(
      'SELECT s.name, s.type, sd.data FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id WHERE s.user_id=$1 AND s.connected=TRUE',
      [req.userId]
    );

    const q = query.toLowerCase();
    const words = filterSearchWords(query);
    const techKeys = new Set(['_id','_type','_entity','source_id','webhook_url','__v']);
    
    // Savol turini aniqlash
    const isCountQ = /nechta|qancha|soni|count|jami soni/i.test(q);
    const isAvgQ = /o'rtacha|ortacha|average|avg|mean/i.test(q);
    const isMaxQ = /eng (yaxshi|katta|yuqori|baland|ko'p)|best|top|max|birinchi/i.test(q);
    const isMinQ = /eng (yomon|kichik|past|kam)|worst|min|oxirgi/i.test(q);
    const isSumQ = /jami|umumiy|total|sum|hammasi/i.test(q);
    const isListQ = /ro'yxat|royxat|list|barcha|hammasi.*kim/i.test(q);
    
    let allData = [];
    sources.rows.forEach(src => {
      const data = src.data || [];
      if (!Array.isArray(data)) return;
      data.forEach(row => {
        const clean = { _source: src.name };
        Object.entries(row).forEach(([k, v]) => { if (!techKeys.has(k)) clean[k] = v; });
        allData.push(clean);
      });
    });

    let results = [];
    let summary = '';

    // 1. ISM bo'yicha qidirish
    if (words.length > 0) {
      const matched = allData.filter(row => {
        const rowText = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
        return words.some(w => rowText.includes(w));
      }).sort((a, b) => {
        const aText = Object.values(a).map(v => String(v || '').toLowerCase()).join(' ');
        const bText = Object.values(b).map(v => String(v || '').toLowerCase()).join(' ');
        return words.filter(w => bText.includes(w)).length - words.filter(w => aText.includes(w)).length;
      });
      if (matched.length > 0 && matched.length <= 20) {
        results = matched;
      }
    }

    // 2. Raqamli ustunlarni topish
    const numCols = {};
    if (allData.length > 0) {
      Object.keys(allData[0]).forEach(k => {
        if (k.startsWith('_')) return;
        const vals = allData.slice(0, 50).map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v));
        if (vals.length > 10) numCols[k] = true;
      });
    }

    // 3. ENG YAXSHI / ENG YOMON
    if ((isMaxQ || isMinQ) && results.length === 0) {
      // Qaysi ustun bo'yicha — savoldan topish
      let targetCol = Object.keys(numCols)[0];
      for (const col of Object.keys(numCols)) {
        if (q.includes(col.toLowerCase().replace(/_/g, ' '))) { targetCol = col; break; }
      }
      if (targetCol) {
        const sorted = [...allData].filter(r => {
          const v = parseFloat(String(r[targetCol]).replace(/[^0-9.-]/g, ''));
          return !isNaN(v) && v > 0;
        }).sort((a, b) => {
          const va = parseFloat(String(a[targetCol]).replace(/[^0-9.-]/g, '')) || 0;
          const vb = parseFloat(String(b[targetCol]).replace(/[^0-9.-]/g, '')) || 0;
          return isMinQ ? va - vb : vb - va;
        });
        results = sorted.slice(0, 10);
        summary = `${isMaxQ ? 'Eng yuqori' : 'Eng past'} ${targetCol} bo'yicha top 10`;
      }
    }

    // 4. NECHTA / SONI
    if (isCountQ && results.length === 0) {
      const sheets = {};
      allData.forEach(r => { const s = r._sheet || r._source || 'default'; sheets[s] = (sheets[s] || 0) + 1; });
      summary = `Jami: ${allData.length} ta qator. ` + Object.entries(sheets).map(([k, v]) => `${k}: ${v} ta`).join(', ');
      results = [{ _summary: summary }];
    }

    // 5. O'RTACHA
    if (isAvgQ && results.length === 0) {
      const stats = {};
      Object.keys(numCols).slice(0, 8).forEach(col => {
        const vals = allData.map(r => parseFloat(String(r[col]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v) && v >= 0);
        if (vals.length > 0) stats[col] = { avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2), count: vals.length };
      });
      summary = 'O\'rtacha ko\'rsatkichlar: ' + Object.entries(stats).map(([k, v]) => `${k}: ${v.avg}`).join(', ');
      results = [{ _summary: summary, _stats: stats }];
    }

    // 6. JAMI / SUM
    if (isSumQ && results.length === 0) {
      const stats = {};
      Object.keys(numCols).slice(0, 8).forEach(col => {
        const vals = allData.map(r => parseFloat(String(r[col]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v) && v >= 0);
        if (vals.length > 0) stats[col] = { sum: vals.reduce((a, b) => a + b, 0).toFixed(0), count: vals.length };
      });
      summary = 'Jami: ' + Object.entries(stats).map(([k, v]) => `${k}: ${v.sum}`).join(', ');
      results = [{ _summary: summary, _stats: stats }];
    }

    // 7. RO'YXAT
    if (isListQ && results.length === 0) {
      results = allData.slice(0, 30);
      summary = `Barcha yozuvlardan namuna (${allData.length} tadan 30 tasi)`;
    }

    // Agar hech narsa topilmasa — umumiy statistika
    if (results.length === 0) {
      const sheets = {};
      allData.forEach(r => { const s = r._sheet || r._source || 'default'; sheets[s] = (sheets[s] || 0) + 1; });
      const stats = {};
      Object.keys(numCols).slice(0, 6).forEach(col => {
        const vals = allData.map(r => parseFloat(String(r[col]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v) && v >= 0);
        if (vals.length > 0) {
          const sum = vals.reduce((a, b) => a + b, 0);
          stats[col] = { avg: (sum / vals.length).toFixed(2), min: Math.min(...vals).toFixed(2), max: Math.max(...vals).toFixed(2), count: vals.length };
        }
      });
      summary = `Jami ${allData.length} qator. Listlar: ${Object.entries(sheets).map(([k,v]) => k+': '+v).join(', ')}`;
      results = [{ _summary: summary, _stats: stats, _sheets: sheets }];
    }

    res.json({ results: results.slice(0, 30), total: results.length, query, searchWords: words, summary });
  } catch (err) {
    console.error('[SOURCES] search-all error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── DELETE /api/sources/:id ── (manba o'chirish)
router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Manba topilmadi' });
    }

    // CASCADE o'chiradi: source_data, source_files ham o'chadi
    await pool.query('DELETE FROM sources WHERE id=$1', [req.params.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[SOURCES] DELETE error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
