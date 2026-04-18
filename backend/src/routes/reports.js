const express = require('express');
const pool = require('../db/pool');
const { requireAuth, checkPermission } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/reports ──
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.userId]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      label: r.label,
      icon: r.icon,
      cat: r.category,
      text: r.text,
      date: r.created_at?.toLocaleDateString?.('uz-UZ') || '',
      createdAt: r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/reports ──
router.post('/', checkPermission('can_create_reports'), async (req, res) => {
  try {
    const { label, icon, category, text } = req.body;
    const result = await pool.query(
      `INSERT INTO reports (user_id, label, icon, category, text)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [req.userId, label, icon, category, text]
    );
    res.status(201).json({ id: result.rows[0].id, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── DELETE /api/reports/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM reports WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── DELETE /api/reports ── (hammasini o'chirish)
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM reports WHERE user_id=$1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
