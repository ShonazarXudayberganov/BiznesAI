const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

// ── GET /api/admin/users ── (barcha foydalanuvchilar)
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.plan, u.phone,
             u.ai_requests_used, u.ai_requests_month,
             u.created_at, u.last_login,
             (SELECT COUNT(*) FROM sources WHERE user_id=u.id) AS source_count,
             (SELECT COALESCE(SUM(sd.row_count),0) FROM source_data sd
              JOIN sources s ON s.id=sd.source_id WHERE s.user_id=u.id) AS total_rows,
             (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.user_id=u.id AND p.status='completed') AS total_paid
      FROM users u
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      plan: u.plan,
      phone: u.phone,
      ai_requests_used: u.ai_requests_used || 0,
      ai_requests_month: u.ai_requests_month || '',
      created: u.created_at,
      lastLogin: u.last_login,
      sourceCount: parseInt(u.source_count) || 0,
      totalRows: parseInt(u.total_rows) || 0,
      totalPaid: parseInt(u.total_paid) || 0,
    })));
  } catch (err) {
    console.error('[ADMIN] users error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── GET /api/admin/users/:id ── (foydalanuvchi tafsilotlari)
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const [userRes, sourcesRes, alertsRes, reportsRes, paymentsRes] = await Promise.all([
      pool.query('SELECT * FROM users WHERE id=$1', [userId]),
      pool.query(`
        SELECT s.*, sd.data, sd.row_count
        FROM sources s
        LEFT JOIN source_data sd ON sd.source_id=s.id
        WHERE s.user_id=$1
        ORDER BY s.created_at DESC
      `, [userId]),
      pool.query('SELECT * FROM alerts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [userId]),
      pool.query('SELECT * FROM reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10', [userId]),
      pool.query('SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC', [userId]),
    ]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Topilmadi' });
    }

    const u = userRes.rows[0];
    res.json({
      user: {
        id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan,
        phone: u.phone, ai_requests_used: u.ai_requests_used,
        ai_requests_month: u.ai_requests_month,
        created: u.created_at, lastLogin: u.last_login,
      },
      sources: sourcesRes.rows.map(s => ({
        id: s.id, type: s.type, name: s.name, connected: s.connected,
        rowCount: s.row_count || 0, createdAt: s.created_at,
      })),
      alerts: alertsRes.rows,
      reports: reportsRes.rows.map(r => ({ id: r.id, label: r.label, createdAt: r.created_at })),
      payments: paymentsRes.rows.map(p => ({
        id: p.id, amount: Number(p.amount), planId: p.plan_id,
        method: p.method, status: p.status, createdAt: p.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/admin/users/:id ── (foydalanuvchini tahrirlash)
router.put('/users/:id', async (req, res) => {
  try {
    const { plan, role } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;

    if (plan) { updates.push(`plan=$${idx++}`); vals.push(plan); }
    if (role) { updates.push(`role=$${idx++}`); vals.push(role); }
    updates.push(`updated_at=NOW()`);

    if (vals.length === 0) return res.json({ ok: true });

    vals.push(req.params.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id=$${idx}`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── DELETE /api/admin/users/:id ── (foydalanuvchini o'chirish)
router.delete('/users/:id', async (req, res) => {
  try {
    // Adminni o'chirmaslik
    const check = await pool.query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (check.rows[0]?.role === 'admin') {
      return res.status(403).json({ error: 'Admin o\'chirib bo\'lmaydi' });
    }
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── GET /api/admin/stats ── (umumiy statistika)
router.get('/stats', async (req, res) => {
  try {
    const [users, sources, rows, payments] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM sources'),
      pool.query('SELECT COALESCE(SUM(row_count),0) as total FROM source_data'),
      pool.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='completed'"),
    ]);

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalSources: parseInt(sources.rows[0].count),
      totalDataRows: parseInt(rows.rows[0].total),
      totalRevenue: parseInt(payments.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
