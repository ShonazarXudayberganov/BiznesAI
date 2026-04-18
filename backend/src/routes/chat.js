const express = require('express');
const pool = require('../db/pool');
const { requireAuth, checkPermission } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/chat ── (oxirgi 24 ta xabar)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chat_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 24',
      [req.userId]
    );
    // Teskari tartibda qaytarish (eskisidan yangisiga)
    const msgs = result.rows.reverse().map(m => ({
      role: m.role,
      content: m.content,
      srcNames: m.src_names || [],
    }));
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/chat ── (yangi xabar(lar) qo'shish)
router.post('/', checkPermission('can_use_ai'), async (req, res) => {
  try {
    const { messages } = req.body; // [{role, content, srcNames}]
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages massiv kerak' });
    }

    for (const msg of messages) {
      await pool.query(
        `INSERT INTO chat_history (user_id, role, content, src_names)
         VALUES ($1, $2, $3, $4)`,
        [req.userId, msg.role, msg.content, msg.srcNames || null]
      );
    }

    // Eski xabarlarni tozalash (faqat oxirgi 48 ta qolsin)
    await pool.query(`
      DELETE FROM chat_history WHERE id IN (
        SELECT id FROM chat_history WHERE user_id=$1
        ORDER BY created_at DESC OFFSET 48
      )
    `, [req.userId]);

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── DELETE /api/chat ── (chatni tozalash)
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM chat_history WHERE user_id=$1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
