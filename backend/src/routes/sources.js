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
