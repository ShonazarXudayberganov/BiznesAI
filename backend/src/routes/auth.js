const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { signToken, requireAuth, loadUser } = require('../middleware/auth');
const { CEO_PERMISSIONS } = require('../db/migrate');

const router = express.Router();

// Ochiq ro'yxatdan o'tish: default yoqilgan. .env da ALLOW_PUBLIC_REGISTRATION=false qo'yib o'chirish mumkin.
const ALLOW_PUBLIC_REGISTRATION = (process.env.ALLOW_PUBLIC_REGISTRATION || 'true').toLowerCase() !== 'false';

// ═══════════════════════════════════════════════════════════
// POST /api/auth/register
// Har yangi user → o'z tashkiloti + "Umumiy" bo'lim + CEO bo'ladi
// ═══════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  if (!ALLOW_PUBLIC_REGISTRATION) {
    return res.status(403).json({
      error: 'Yangi ro\'yxatdan o\'tish o\'chirilgan. Tashkilot olish uchun admin bilan bog\'laning.',
      code: 'REGISTRATION_DISABLED',
    });
  }

  const client = await pool.connect();
  try {
    const { name, email, password, organizationName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password kerak' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Parol kamida 6 ta belgi bo\'lishi kerak' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName  = name.trim();
    const orgName    = (organizationName && organizationName.trim()) || cleanName;

    // Email tekshirish
    const exists = await client.query('SELECT id FROM users WHERE email=$1', [cleanEmail]);
    if (exists.rows.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const hash = await bcrypt.hash(password, 12);

    // Tranzaksiya: user + org + dept birgalikda
    await client.query('BEGIN');

    // 1. User yaratish (avval org'siz)
    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, plan, last_login, permissions, active)
       VALUES ($1, $2, $3, 'ceo', 'free', NOW(), $4, TRUE)
       RETURNING id`,
      [cleanName, cleanEmail, hash, JSON.stringify(CEO_PERMISSIONS)]
    );
    const newUserId = userRes.rows[0].id;

    // 2. Tashkilot yaratish (1 yillik obuna — keyin super-admin o'zgartiradi)
    const orgRes = await client.query(
      `INSERT INTO organizations (name, subscription_until, active, created_by)
       VALUES ($1, NOW() + INTERVAL '1 year', TRUE, $2)
       RETURNING id`,
      [orgName, newUserId]
    );
    const orgId = orgRes.rows[0].id;

    // 3. "Umumiy" bo'lim
    await client.query(
      `INSERT INTO departments (organization_id, name, icon, color, created_by)
       VALUES ($1, 'Umumiy', '🌐', '#6B7280', $2)`,
      [orgId, newUserId]
    );

    // 4. User'ga org biriktirish
    await client.query(
      `UPDATE users SET organization_id=$1 WHERE id=$2`,
      [orgId, newUserId]
    );

    await client.query('COMMIT');

    const full = await loadUser(newUserId);
    const token = signToken(full.id, full.role);

    res.status(201).json({
      token,
      user: toUserDTO(full),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email va password kerak' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, active FROM users WHERE email=$1',
      [email.toLowerCase().trim()]
    );

    const device = req.headers['user-agent']?.substring(0, 200) || 'Unknown';
    const ip     = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'Unknown';

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const row = result.rows[0];

    if (row.active === false) {
      return res.status(403).json({ error: 'Hisobingiz bloklangan. CEO bilan bog\'laning.' });
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      try {
        await pool.query(
          'INSERT INTO login_history (user_id,device,ip,status) VALUES ($1,$2,$3,$4)',
          [row.id, device, ip, 'failed']
        );
      } catch (e) {
        console.warn('[AUTH] login_history insert failed:', e.message);
      }
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    // Session va login_history
    await pool.query('UPDATE sessions SET expired=TRUE WHERE user_id=$1 AND expired=FALSE', [row.id]);
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    await pool.query(
      'INSERT INTO sessions (id,user_id,device,ip,remember,last_active) VALUES ($1,$2,$3,$4,$5,NOW())',
      [sessionId, row.id, device, ip, !!remember]
    );
    await pool.query(
      'INSERT INTO login_history (user_id,device,ip,status) VALUES ($1,$2,$3,$4)',
      [row.id, device, ip, 'success']
    );
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [row.id]);

    const full = await loadUser(row.id);
    const token = signToken(full.id, full.role);

    res.json({
      token,
      sessionId,
      user: toUserDTO(full),
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/auth/me
// ═══════════════════════════════════════════════════════════
router.get('/me', requireAuth, async (req, res) => {
  res.json(toUserDTO(req.user));
});

// ═══════════════════════════════════════════════════════════
// GET /api/auth/context
// Xodim/CEO UI uchun batafsil kontekst: profil + tashkilot + bo'limlar + ruxsatlar
// + oylik AI ishlatish holati
// ═══════════════════════════════════════════════════════════
router.get('/context', requireAuth, async (req, res) => {
  try {
    const u = req.user;
    const orgId = u.organization_id;

    // Bo'limlar (ismi, ikonka, rang bilan)
    let depts = [];
    if (orgId) {
      const isElevated = u.role === 'ceo' || u.role === 'super_admin' || u.role === 'admin';
      let r;
      if (isElevated) {
        // CEO — tashkilotning barcha bo'limlari
        r = await pool.query(
          `SELECT id, name, icon, color FROM departments WHERE organization_id=$1 ORDER BY id`,
          [orgId]
        );
      } else {
        // Xodim — faqat tegishli bo'limlar
        r = await pool.query(
          `SELECT d.id, d.name, d.icon, d.color
           FROM departments d
             JOIN user_departments ud ON ud.department_id = d.id
           WHERE d.organization_id = $1 AND ud.user_id = $2
           ORDER BY d.id`,
          [orgId, u.id]
        );
      }
      depts = r.rows;
    }

    const month = new Date().toISOString().slice(0, 7);
    const aiUsed = u.ai_requests_month === month ? (u.ai_requests_used || 0) : 0;
    const aiLimit = u.permissions?.ai_monthly_limit;

    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active !== false,
        must_change_password: u.must_change_password === true,
        avatar_url: u.avatar_url,
      },
      organization: orgId ? {
        id: orgId,
        name: u.organization_name,
        color: u.organization_color,
        logo_url: u.organization_logo,
        active: u.org_active !== false,
        subscription_until: u.subscription_until,
      } : null,
      departments: depts,
      my_department_ids: u.department_ids || [],
      permissions: u.permissions || {},
      ai_usage: {
        used: aiUsed,
        limit: aiLimit === undefined ? null : aiLimit,
        month,
        remaining: (aiLimit === -1 || aiLimit === null || aiLimit === undefined) ? -1 : Math.max(0, Number(aiLimit) - aiUsed),
      },
    });
  } catch (err) {
    console.error('[AUTH] /context error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/auth/profile — ism/telefon yangilash
// ═══════════════════════════════════════════════════════════
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;

    if (name)              { updates.push(`name=$${idx++}`);  vals.push(name.trim()); }
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
    console.error('[AUTH] profile error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/auth/password — parol o'zgartirish
// ═══════════════════════════════════════════════════════════
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
    // must_change_password flag'ni ham o'chiramiz — xodim ilk parolni yangilaganda
    await pool.query(
      `UPDATE users
       SET password_hash=$1, must_change_password=FALSE, updated_at=NOW()
       WHERE id=$2`,
      [hash, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] password error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// Sessions (o'zgarishsiz, mavjud API)
// ═══════════════════════════════════════════════════════════
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, device, ip, remember, last_active, created_at FROM sessions WHERE user_id=$1 AND expired=FALSE ORDER BY last_active DESC',
      [req.userId]
    );
    res.json(result.rows.map(s => ({
      id: s.id,
      device: s.device?.substring(0, 60) || 'Noma\'lum',
      ip: s.ip,
      remember: s.remember,
      lastActive: s.last_active,
      createdAt: s.created_at,
    })));
  } catch (err) { res.status(500).json({ error: 'Server xatosi' }); }
});

router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE sessions SET expired=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server xatosi' }); }
});

router.delete('/sessions', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE sessions SET expired=TRUE WHERE user_id=$1', [req.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server xatosi' }); }
});

router.get('/login-history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT device, ip, status, created_at FROM login_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.userId]
    );
    res.json(result.rows.map(h => ({
      device: h.device?.substring(0, 60) || 'Noma\'lum',
      ip: h.ip,
      status: h.status,
      time: h.created_at,
    })));
  } catch (err) { res.status(500).json({ error: 'Server xatosi' }); }
});

// ═══════════════════════════════════════════════════════════
// Helper: user profili DTO — frontend uchun yagona struktura
// ═══════════════════════════════════════════════════════════
function toUserDTO(u) {
  if (!u) return null;
  return {
    id:       u.id,
    name:     u.name,
    email:    u.email,
    role:     u.role,
    plan:     u.plan,
    phone:    u.phone,
    avatar_url: u.avatar_url,
    active:   u.active !== false,
    must_change_password: u.must_change_password === true,
    ai_requests_used:  u.ai_requests_used || 0,
    ai_requests_month: u.ai_requests_month || '',
    created:  u.created_at,
    lastLogin: u.last_login,
    // Yangi ma'lumot (v2):
    organization: u.organization_id ? {
      id:   u.organization_id,
      name: u.organization_name,
      color: u.organization_color,
      logo_url: u.organization_logo,
      active: u.org_active !== false,
      subscription_until: u.subscription_until,
    } : null,
    department_ids: u.department_ids || [],
    permissions: u.permissions || {},
  };
}

module.exports = router;
