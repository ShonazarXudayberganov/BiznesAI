/**
 * BiznesAI — Super-admin panel (Shonazar)
 *
 * Tizimdagi barcha tashkilotlarni boshqarish:
 *   - Tashkilot yaratish (yangi CEO login/parol bilan)
 *   - Obuna muddatini uzaytirish / bloklash
 *   - Tashkilot tafsilotlari va statistikasi
 *   - CEO parolini yangilash
 *
 * Super-admin ham o'z tashkilotiga CEO bo'lib foydalanishda davom etadi
 * (migratsiya bu imkoniyatni saqlab qoladi).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { CEO_PERMISSIONS } = require('../db/migrate');

const router = express.Router();
router.use(requireAuth);
router.use(requireSuperAdmin);

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function generatePassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

async function audit(req, action, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, target_type, target_id, details, ip)
       VALUES (NULL, $1, $2, 'organization', $3, $4, $5)`,
      [
        req.userId,
        action,
        String(targetId || ''),
        JSON.stringify(details),
        req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
      ]
    );
  } catch (e) { console.warn('[AUDIT] superadmin log failed:', e.message); }
}

async function getOrgDetail(orgId) {
  const r = await pool.query(
    `SELECT o.id, o.name, o.logo_url, o.color, o.subscription_until, o.active,
            o.created_at, o.updated_at,
            (SELECT COUNT(*)::int FROM users u WHERE u.organization_id=o.id AND u.role='employee') AS employee_count,
            (SELECT COUNT(*)::int FROM users u WHERE u.organization_id=o.id AND u.role IN ('ceo','super_admin','employee','admin','user')) AS total_user_count,
            (SELECT COUNT(*)::int FROM departments WHERE organization_id=o.id) AS dept_count,
            (SELECT COUNT(*)::int FROM sources WHERE organization_id=o.id) AS source_count,
            (SELECT COALESCE(SUM(row_count),0)::bigint FROM source_data sd JOIN sources s ON s.id=sd.source_id WHERE s.organization_id=o.id) AS total_rows,
            (SELECT json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role)
             FROM users u WHERE u.organization_id=o.id AND u.role IN ('ceo','super_admin')
             ORDER BY (u.role='ceo') DESC, u.created_at ASC LIMIT 1) AS ceo
     FROM organizations o
     WHERE o.id=$1`,
    [orgId]
  );
  return r.rows[0] || null;
}

// ═══════════════════════════════════════════════════════════
// GET /api/super-admin/organizations — barcha tashkilotlar
// ═══════════════════════════════════════════════════════════
router.get('/organizations', async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim().toLowerCase();
    let sql = `
      SELECT o.id, o.name, o.logo_url, o.color, o.subscription_until, o.active,
             o.created_at,
             (SELECT COUNT(*)::int FROM users u WHERE u.organization_id=o.id AND u.role='employee') AS employee_count,
             (SELECT COUNT(*)::int FROM departments WHERE organization_id=o.id) AS dept_count,
             (SELECT COUNT(*)::int FROM sources WHERE organization_id=o.id) AS source_count,
             (SELECT COALESCE(SUM(row_count),0)::bigint FROM source_data sd JOIN sources s ON s.id=sd.source_id WHERE s.organization_id=o.id) AS total_rows,
             (SELECT json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role, 'plan', u.plan, 'last_login', u.last_login)
              FROM users u WHERE u.organization_id=o.id AND u.role IN ('ceo','super_admin')
              ORDER BY (u.role='ceo') DESC, u.created_at ASC LIMIT 1) AS ceo
      FROM organizations o`;
    const params = [];
    if (search) {
      sql += ` WHERE LOWER(o.name) LIKE $1 OR EXISTS (SELECT 1 FROM users u WHERE u.organization_id=o.id AND (LOWER(u.name) LIKE $1 OR LOWER(u.email) LIKE $1))`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY o.created_at DESC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[SUPERADMIN] GET orgs error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/super-admin/organizations
// Body: { name, ceo_name, ceo_email, ceo_password?, subscription_months?, color? }
// Tranzaksiya: organization + CEO user + "Umumiy" bo'lim
// ═══════════════════════════════════════════════════════════
router.post('/organizations', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, ceo_name, ceo_email, ceo_password, subscription_months, color } = req.body;

    if (!name || !name.trim()) { client.release(); return res.status(400).json({ error: 'Tashkilot nomi kerak' }); }
    if (!ceo_name || !ceo_name.trim()) { client.release(); return res.status(400).json({ error: 'CEO ismi kerak' }); }
    if (!isValidEmail(ceo_email || '')) { client.release(); return res.status(400).json({ error: 'CEO emaili noto\'g\'ri' }); }

    const cleanEmail = ceo_email.toLowerCase().trim();
    const cleanOrg   = name.trim();
    const cleanCeo   = ceo_name.trim();

    // Email band?
    const exists = await client.query('SELECT id FROM users WHERE email=$1', [cleanEmail]);
    if (exists.rows.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    // Parol
    let plainPass = ceo_password;
    if (!plainPass || plainPass.length < 6) plainPass = generatePassword(10);

    // Obuna muddati
    const months = Math.max(1, Math.min(120, parseInt(subscription_months, 10) || 12));

    await client.query('BEGIN');

    const orgRes = await client.query(
      `INSERT INTO organizations (name, color, subscription_until, active, created_by)
       VALUES ($1, $2, NOW() + ($3 || ' months')::interval, TRUE, $4)
       RETURNING id`,
      [cleanOrg, (color || '#00C9BE').substring(0, 20), String(months), req.userId]
    );
    const orgId = orgRes.rows[0].id;

    const hash = await bcrypt.hash(plainPass, 12);
    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, plan, organization_id,
                          permissions, active, created_by_user_id)
       VALUES ($1, $2, $3, 'ceo', 'enterprise', $4, $5, TRUE, $6)
       RETURNING id`,
      [cleanCeo, cleanEmail, hash, orgId, JSON.stringify(CEO_PERMISSIONS), req.userId]
    );
    const newCeoId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO departments (organization_id, name, icon, color, created_by)
       VALUES ($1, 'Umumiy', '🌐', '#6B7280', $2)`,
      [orgId, newCeoId]
    );

    await client.query('COMMIT');

    await audit(req, 'create_organization', orgId, { name: cleanOrg, ceo_email: cleanEmail, months });

    res.status(201).json({
      id: orgId,
      name: cleanOrg,
      subscription_months: months,
      ceo: {
        id: newCeoId,
        name: cleanCeo,
        email: cleanEmail,
      },
      initial_password: plainPass,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[SUPERADMIN] create org error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/super-admin/organizations/:id — tafsilot
// ═══════════════════════════════════════════════════════════
router.get('/organizations/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (!orgId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const org = await getOrgDetail(orgId);
    if (!org) return res.status(404).json({ error: 'Tashkilot topilmadi' });

    // Qo'shimcha: xodimlar ro'yxati (qisqa)
    const members = await pool.query(
      `SELECT id, name, email, role, active, last_login, created_at
       FROM users WHERE organization_id=$1 ORDER BY role, created_at`,
      [orgId]
    );
    const depts = await pool.query(
      `SELECT id, name, icon, color,
              (SELECT COUNT(*)::int FROM user_departments WHERE department_id=d.id) AS emp_count,
              (SELECT COUNT(*)::int FROM source_departments WHERE department_id=d.id) AS src_count
       FROM departments d WHERE organization_id=$1 ORDER BY id`,
      [orgId]
    );

    res.json({ ...org, members: members.rows, departments: depts.rows });
  } catch (err) {
    console.error('[SUPERADMIN] GET org error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/super-admin/organizations/:id
// Body: { name?, color?, logo_url?, subscription_until? (ISO), active? }
// ═══════════════════════════════════════════════════════════
router.put('/organizations/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (!orgId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const existing = await pool.query('SELECT id FROM organizations WHERE id=$1', [orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tashkilot topilmadi' });

    const { name, color, logo_url, subscription_until, active } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;

    if (name !== undefined) {
      const clean = String(name).trim();
      if (!clean) return res.status(400).json({ error: 'Nom bo\'sh bo\'lmasin' });
      updates.push(`name=$${idx++}`); vals.push(clean);
    }
    if (color !== undefined) { updates.push(`color=$${idx++}`); vals.push(String(color).substring(0, 20)); }
    if (logo_url !== undefined) { updates.push(`logo_url=$${idx++}`); vals.push(logo_url); }
    if (subscription_until !== undefined) {
      const dt = subscription_until ? new Date(subscription_until) : null;
      if (dt && isNaN(dt.getTime())) return res.status(400).json({ error: 'subscription_until sana noto\'g\'ri' });
      updates.push(`subscription_until=$${idx++}`); vals.push(dt);
    }
    if (active !== undefined) { updates.push(`active=$${idx++}`); vals.push(active === true || active === 'true'); }
    updates.push(`updated_at=NOW()`);

    if (vals.length === 0) return res.json({ ok: true });

    vals.push(orgId);
    await pool.query(`UPDATE organizations SET ${updates.join(', ')} WHERE id=$${idx}`, vals);

    await audit(req, 'update_organization', orgId, { fields: Object.keys(req.body) });

    const updated = await getOrgDetail(orgId);
    res.json(updated);
  } catch (err) {
    console.error('[SUPERADMIN] PUT org error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/super-admin/organizations/:id/extend-subscription
// Body: { months: N }
// Joriy sanaga yoki mavjud muddatga qo'shiladi (kattasiga)
// ═══════════════════════════════════════════════════════════
router.post('/organizations/:id/extend-subscription', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (!orgId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const months = Math.max(1, Math.min(120, parseInt(req.body?.months, 10) || 1));

    const existing = await pool.query('SELECT subscription_until FROM organizations WHERE id=$1', [orgId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tashkilot topilmadi' });

    await pool.query(
      `UPDATE organizations
       SET subscription_until = GREATEST(COALESCE(subscription_until, NOW()), NOW()) + ($1 || ' months')::interval,
           updated_at = NOW()
       WHERE id = $2`,
      [String(months), orgId]
    );

    await audit(req, 'extend_subscription', orgId, { months });

    const updated = await pool.query('SELECT subscription_until FROM organizations WHERE id=$1', [orgId]);
    res.json({ ok: true, subscription_until: updated.rows[0].subscription_until });
  } catch (err) {
    console.error('[SUPERADMIN] extend-subscription error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/super-admin/organizations/:id/block / unblock
// ═══════════════════════════════════════════════════════════
router.post('/organizations/:id/block', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const r = await pool.query(`UPDATE organizations SET active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id`, [orgId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Topilmadi' });

    // Sessiyalarni ham yopamiz
    await pool.query(`UPDATE sessions SET expired=TRUE WHERE user_id IN (SELECT id FROM users WHERE organization_id=$1)`, [orgId]);

    await audit(req, 'block_organization', orgId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server xatosi' }); }
});

router.post('/organizations/:id/unblock', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const r = await pool.query(`UPDATE organizations SET active=TRUE, updated_at=NOW() WHERE id=$1 RETURNING id`, [orgId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Topilmadi' });
    await audit(req, 'unblock_organization', orgId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server xatosi' }); }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/super-admin/organizations/:id/plan
// Tashkilot CEO'sining tarifini o'zgartirish
// Body: { plan: 'free' | 'starter' | 'pro' | 'enterprise' }
// ═══════════════════════════════════════════════════════════
router.put('/organizations/:id/plan', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const plan = String(req.body?.plan || '').toLowerCase().trim();
    const ALLOWED = ['free', 'starter', 'pro', 'enterprise'];
    if (!ALLOWED.includes(plan)) {
      return res.status(400).json({ error: 'Plan: free | starter | pro | enterprise' });
    }

    // CEO'ni topamiz
    const r = await pool.query(
      `SELECT id FROM users WHERE organization_id=$1 AND role IN ('ceo','super_admin')
       ORDER BY (role='ceo') DESC, created_at ASC LIMIT 1`,
      [orgId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'CEO topilmadi' });

    // Tashkilotdagi barcha foydalanuvchilar (CEO + xodimlar) planini yangilash
    await pool.query(
      `UPDATE users SET plan=$1, updated_at=NOW() WHERE organization_id=$2`,
      [plan, orgId]
    );

    await audit(req, 'change_plan', orgId, { plan });
    res.json({ ok: true, plan, ceo_id: r.rows[0].id });
  } catch (err) {
    console.error('[SUPERADMIN] change-plan error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/super-admin/organizations/:id/impersonate
// Super-admin tashkilot CEO'si sifatida tizimga kiradi (vaqtincha token)
// Response: { token, ceo: {...} }
// ═══════════════════════════════════════════════════════════
router.post('/organizations/:id/impersonate', async (req, res) => {
  try {
    const { signToken } = require('../middleware/auth');
    const orgId = parseInt(req.params.id, 10);
    if (!orgId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    // Tashkilot CEO'sini topamiz
    const r = await pool.query(
      `SELECT id, name, email, role FROM users
       WHERE organization_id=$1 AND role IN ('ceo','super_admin')
       ORDER BY (role='ceo') DESC, created_at ASC LIMIT 1`,
      [orgId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Tashkilotda CEO topilmadi' });
    }
    const ceo = r.rows[0];

    // CEO rolida token yaratamiz (impersonated_by flag bilan)
    const token = signToken(ceo.id, { role: ceo.role, impersonated_by: req.userId });

    await audit(req, 'impersonate_ceo', orgId, { ceo_id: ceo.id, ceo_email: ceo.email });

    res.json({
      ok: true,
      token,
      ceo: { id: ceo.id, name: ceo.name, email: ceo.email, role: ceo.role },
    });
  } catch (err) {
    console.error('[SUPERADMIN] impersonate error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/super-admin/organizations/:id/reset-ceo-password
// CEO parolini yangilash — javobda plain password bir marta
// ═══════════════════════════════════════════════════════════
router.post('/organizations/:id/reset-ceo-password', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const r = await pool.query(
      `SELECT id FROM users WHERE organization_id=$1 AND role='ceo' ORDER BY created_at ASC LIMIT 1`,
      [orgId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tashkilotda CEO topilmadi' });

    const ceoId = r.rows[0].id;
    const newPass = generatePassword(10);
    const hash = await bcrypt.hash(newPass, 12);

    await pool.query(
      `UPDATE users SET password_hash=$1, must_change_password=FALSE, updated_at=NOW() WHERE id=$2`,
      [hash, ceoId]
    );
    await pool.query(`UPDATE sessions SET expired=TRUE WHERE user_id=$1`, [ceoId]);

    await audit(req, 'reset_ceo_password', orgId, { ceo_id: ceoId });
    res.json({ ok: true, ceo_id: ceoId, new_password: newPass });
  } catch (err) {
    console.error('[SUPERADMIN] reset-ceo-password error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/super-admin/organizations/:id
// Xavfsizlik: ?force=true bo'lmasa, ma'lumot borligiga qaramasdan rad etadi
// O'chirganda CASCADE bilan: users, departments, sources, ... hammasi
// Super-admin o'z tashkilotini o'chira olmaydi
// ═══════════════════════════════════════════════════════════
router.delete('/organizations/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const exists = await pool.query('SELECT id FROM organizations WHERE id=$1', [orgId]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Topilmadi' });

    // Super-admin o'z tashkilotini o'chira olmaydi (tasodifiy qulf himoyasi)
    if (req.user?.organization_id === orgId) {
      return res.status(400).json({ error: 'O\'zingiz a\'zo bo\'lgan tashkilotni o\'chirib bo\'lmaydi' });
    }

    const force = req.query.force === 'true';
    if (!force) {
      const usage = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM users WHERE organization_id=$1) AS users,
           (SELECT COUNT(*)::int FROM sources WHERE organization_id=$1) AS sources`,
        [orgId]
      );
      const { users, sources } = usage.rows[0];
      if (users > 0 || sources > 0) {
        return res.status(409).json({
          error: `Tashkilotda ${users} foydalanuvchi va ${sources} manba bor. ?force=true bilan o'chirish mumkin.`,
          code: 'ORGANIZATION_NOT_EMPTY',
          user_count: users,
          source_count: sources,
        });
      }
    }

    await pool.query('DELETE FROM organizations WHERE id=$1', [orgId]);
    await audit(req, 'delete_organization', orgId, { force });
    res.json({ ok: true });
  } catch (err) {
    console.error('[SUPERADMIN] DELETE org error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/super-admin/stats — platforma statistikasi
// ═══════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const [orgs, users, sources, rows, active, expiring] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM organizations'),
      pool.query('SELECT COUNT(*)::int AS c FROM users'),
      pool.query('SELECT COUNT(*)::int AS c FROM sources'),
      pool.query('SELECT COALESCE(SUM(row_count),0)::bigint AS c FROM source_data'),
      pool.query("SELECT COUNT(*)::int AS c FROM users WHERE last_login > NOW() - INTERVAL '7 days'"),
      pool.query(`SELECT COUNT(*)::int AS c FROM organizations WHERE subscription_until IS NOT NULL AND subscription_until < NOW() + INTERVAL '14 days' AND subscription_until > NOW()`),
    ]);

    const [roles, plans] = await Promise.all([
      pool.query(`SELECT role, COUNT(*)::int AS c FROM users GROUP BY role`),
      pool.query(`SELECT plan, COUNT(*)::int AS c FROM users GROUP BY plan`),
    ]);

    res.json({
      total_organizations: orgs.rows[0].c,
      total_users:         users.rows[0].c,
      total_sources:       sources.rows[0].c,
      total_data_rows:     Number(rows.rows[0].c),
      active_users_7d:     active.rows[0].c,
      expiring_soon:       expiring.rows[0].c,   // 14 kun ichida tugaydigan obunalar
      by_role: Object.fromEntries(roles.rows.map(r => [r.role, r.c])),
      by_plan: Object.fromEntries(plans.rows.map(r => [r.plan, r.c])),
    });
  } catch (err) {
    console.error('[SUPERADMIN] stats error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/super-admin/audit-log
// Query: ?limit=50&offset=0&organization_id=N&action=X
// ═══════════════════════════════════════════════════════════
router.get('/audit-log', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const orgId = req.query.organization_id ? parseInt(req.query.organization_id, 10) : null;
    const action = req.query.action ? String(req.query.action) : null;

    const conds = [];
    const params = [];
    if (orgId)  { conds.push(`organization_id=$${params.length + 1}`); params.push(orgId); }
    if (action) { conds.push(`action=$${params.length + 1}`);           params.push(action); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    params.push(limit, offset);
    const r = await pool.query(
      `SELECT a.id, a.organization_id, a.user_id, a.action, a.target_type, a.target_id,
              a.details, a.ip, a.created_at,
              u.name AS user_name, u.email AS user_email,
              o.name AS organization_name
       FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN organizations o ON o.id = a.organization_id
       ${where}
       ORDER BY a.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ limit, offset, rows: r.rows });
  } catch (err) {
    console.error('[SUPERADMIN] audit-log error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
