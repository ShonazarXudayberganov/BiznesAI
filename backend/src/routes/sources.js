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

    const words = query.toLowerCase().trim().split(/\s+/);
    const techKeys = new Set(['_id','_type','_entity','source_id','webhook_url','__v']);

    const results = data.filter(row => {
      const rowText = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
      return words.every(w => rowText.includes(w));
    }).slice(0, 20).map(row => {
      const clean = {};
      Object.entries(row).forEach(([k, v]) => { if (!techKeys.has(k)) clean[k] = v; });
      return clean;
    });

    res.json({ results, total: results.length, query });
  } catch (err) {
    console.error('[SOURCES] search error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/sources/search-all ── (barcha manbalardan qidirish)
router.post('/search-all', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query kerak' });

    const sources = await pool.query(
      'SELECT s.name, sd.data FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id WHERE s.user_id=$1 AND s.connected=TRUE',
      [req.userId]
    );

    const words = query.toLowerCase().trim().split(/\s+/);
    const techKeys = new Set(['_id','_type','_entity','source_id','webhook_url','__v']);
    const allResults = [];

    sources.rows.forEach(src => {
      const data = src.data || [];
      if (!Array.isArray(data)) return;
      data.forEach(row => {
        const rowText = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
        if (words.every(w => rowText.includes(w))) {
          const clean = { _source: src.name };
          Object.entries(row).forEach(([k, v]) => { if (!techKeys.has(k)) clean[k] = v; });
          allResults.push(clean);
        }
      });
    });

    res.json({ results: allResults.slice(0, 30), total: allResults.length, query });
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
