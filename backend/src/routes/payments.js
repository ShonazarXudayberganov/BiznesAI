const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/payments ── (foydalanuvchi to'lovlari)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      planId: p.plan_id,
      method: p.method,
      status: p.status,
      reference: p.reference,
      createdAt: p.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/payments ── (yangi to'lov)
router.post('/', async (req, res) => {
  try {
    const { amount, planId, method, reference } = req.body;
    if (!amount || !planId) {
      return res.status(400).json({ error: 'amount va planId kerak' });
    }

    const result = await pool.query(
      `INSERT INTO payments (user_id, amount, plan_id, method, status, reference)
       VALUES ($1, $2, $3, $4, 'completed', $5) RETURNING id`,
      [req.userId, amount, planId, method || 'manual', reference]
    );

    // Tarifni yangilash
    await pool.query('UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2', [planId, req.userId]);

    res.status(201).json({ id: result.rows[0].id, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
