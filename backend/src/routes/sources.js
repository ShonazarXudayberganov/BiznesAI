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

// ── POST /api/ai/context ── (AI uchun bazadan kontekst tayyorlash)
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
    if (total === 0) return res.json({ context: 'Ma\'lumot yo\'q' });

    const techKeys = new Set(['id','_id','_type','_entity','source_id','webhook_url','created_at','updated_at','__v','_v']);
    const allKeys = Object.keys(data[0] || {}).filter(k => !techKeys.has(k) && !k.startsWith('_'));

    // Sheet lar bo'yicha guruhlash
    const sheets = {};
    data.forEach(row => {
      const sh = row._sheet || 'default';
      if (!sheets[sh]) sheets[sh] = [];
      sheets[sh].push(row);
    });
    const sheetNames = Object.keys(sheets);

    // Raqamli ustunlar
    const numCols = allKeys.filter(k => {
      const vals = data.slice(0, 50).map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, '')));
      return vals.filter(v => !isNaN(v)).length > 10;
    });

    let context = `MANBA: "${source.name}" (${source.type}, ${total} ta yozuv`;
    if (sheetNames.length > 1) context += `, ${sheetNames.length} ta list: ${sheetNames.join(', ')}`;
    context += `)\nUSTUNLAR: ${allKeys.join(', ')}\n`;

    // Har bir list uchun statistika
    sheetNames.forEach(sh => {
      const rows = sheets[sh];
      context += `\n--- ${sh} (${rows.length} qator) ---\n`;
      numCols.slice(0, 10).forEach(col => {
        const vals = rows.map(r => parseFloat(String(r[col]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v) && v >= 0);
        if (vals.length > 0) {
          const sum = vals.reduce((a, b) => a + b, 0);
          context += `  ${col}: o'rtacha=${(sum/vals.length).toFixed(2)}, min=${Math.min(...vals).toFixed(2)}, max=${Math.max(...vals).toFixed(2)}, soni=${vals.length}\n`;
        }
      });
      // 3 ta namuna
      const sample = rows.slice(0, 3).map(row => {
        const clean = {};
        Object.entries(row).forEach(([k, v]) => { if (!techKeys.has(k) && !k.startsWith('_')) clean[k] = v; });
        return clean;
      });
      context += `  Namuna: ${JSON.stringify(sample)}\n`;
    });

    res.json({ context, rowCount: total, sheetCount: sheetNames.length });
  } catch (err) {
    console.error('[SOURCES] ai-context error:', err.message);
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
