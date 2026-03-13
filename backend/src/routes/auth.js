const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/register ──
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password kerak' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Parol kamida 6 ta belgi bo\'lishi kerak' });
    }

    // Email tekshirish
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, plan, last_login)
       VALUES ($1, $2, $3, 'user', 'free', NOW())
       RETURNING id, name, email, role, plan, created_at`,
      [name.trim(), email.toLowerCase().trim(), hash]
    );

    const user = result.rows[0];
    const token = signToken(user.id);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        created: user.created_at,
      }
    });
  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email va password kerak' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email=$1',
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    // Update last_login
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);

    const token = signToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        phone: user.phone,
        avatar_url: user.avatar_url,
        ai_requests_used: user.ai_requests_used || 0,
        ai_requests_month: user.ai_requests_month || '',
        created: user.created_at,
        lastLogin: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── GET /api/auth/me ── (joriy foydalanuvchi)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, plan, phone, avatar_url, ai_requests_used, ai_requests_month, created_at, last_login FROM users WHERE id=$1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }
    const u = result.rows[0];
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      plan: u.plan,
      phone: u.phone,
      avatar_url: u.avatar_url,
      ai_requests_used: u.ai_requests_used || 0,
      ai_requests_month: u.ai_requests_month || '',
      created: u.created_at,
      lastLogin: u.last_login,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/auth/profile ── (profil yangilash)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;

    if (name) { updates.push(`name=$${idx++}`); vals.push(name.trim()); }
    if (phone !== undefined) { updates.push(`phone=$${idx++}`); vals.push(phone); }
    updates.push(`updated_at=NOW()`);

    if (vals.length === 0) return res.json({ ok: true });

    vals.push(req.userId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id=$${idx}`,
      vals
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/auth/password ── (parol o'zgartirish)
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Joriy va yangi parol kerak' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Yangi parol kamida 6 belgi' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Topilmadi' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Joriy parol noto\'g\'ri' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
