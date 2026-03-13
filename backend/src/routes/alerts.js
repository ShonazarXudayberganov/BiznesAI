const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/alerts ──
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM alerts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.userId]
    );
    res.json(result.rows.map(a => ({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      icon: a.icon,
      read: a.read,
      sourceName: a.source_name,
      createdAt: a.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/alerts ──
router.post('/', async (req, res) => {
  try {
    const { title, message, type, icon, sourceName } = req.body;
    const result = await pool.query(
      `INSERT INTO alerts (user_id, title, message, type, icon, source_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [req.userId, title, message, type || 'info', icon, sourceName]
    );
    res.status(201).json({ id: result.rows[0].id, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/alerts/read-all ──
router.put('/read-all', async (req, res) => {
  try {
    await pool.query('UPDATE alerts SET read=TRUE WHERE user_id=$1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── DELETE /api/alerts/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM alerts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
