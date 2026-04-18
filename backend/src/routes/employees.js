/**
 * BiznesAI — Employees (xodimlar) CRUD
 *
 * CEO (yoki super_admin) o'z tashkilotining xodimlarini boshqaradi.
 * Xodim ko'p bo'limga tegishli bo'lishi mumkin (many-to-many).
 * Har xodim uchun ruxsatlar (permissions) CEO tomonidan sozlanadi.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireCeo, sameOrg } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireCeo);

// ═══════════════════════════════════════════════════════════
// Permissions shablonlari
// ═══════════════════════════════════════════════════════════
const PERMISSION_TEMPLATES = {
  viewer: {
    can_add_sources:      false,
    can_delete_sources:   false,
    can_use_ai:           false,
    ai_monthly_limit:     0,
    can_export:           false,
    can_create_reports:   false,
    can_invite_employees: false,
  },
  analyst: {
    can_add_sources:      false,
    can_delete_sources:   false,
    can_use_ai:           true,
    ai_monthly_limit:     100,
    can_export:           true,
    can_create_reports:   true,
    can_invite_employees: false,
  },
  head: {
    can_add_sources:      true,
    can_delete_sources:   true,
    can_use_ai:           true,
    ai_monthly_limit:     500,
    can_export:           true,
    can_create_reports:   true,
    can_invite_employees: false,
  },
};

// Permissions'ni standart qilib normalize qilish (null/undefined → false, raqamlar to'g'ri)
function normalizePermissions(input = {}, template = 'analyst') {
  const base = { ...(PERMISSION_TEMPLATES[template] || PERMISSION_TEMPLATES.analyst) };
  const keys = ['can_add_sources', 'can_delete_sources', 'can_use_ai',
                'can_export', 'can_create_reports', 'can_invite_employees'];
  for (const k of keys) {
    if (input[k] !== undefined) base[k] = input[k] === true || input[k] === 'true';
  }
  if (input.ai_monthly_limit !== undefined) {
    const n = Number(input.ai_monthly_limit);
    base.ai_monthly_limit = isNaN(n) ? 0 : Math.max(-1, Math.min(100000, n));
  }
  return base;
}

// Tasodifiy parol (8 belgi, o'qilishi oson)
function generatePassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

// Email validatsiyasi (oddiy)
function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// Audit helper
async function audit(req, action, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, target_type, target_id, details, ip)
       VALUES ($1, $2, $3, 'employee', $4, $5, $6)`,
      [
        req.user?.organization_id || null,
        req.userId,
        action,
        String(targetId || ''),
        JSON.stringify(details),
        req.headers['x-forwarded-for']?.split(',')[0] || req.ip || null,
      ]
    );
  } catch (e) {
    console.warn('[AUDIT] employee log failed:', e.message);
  }
}

// Xodim DTO (parol_hash yo'q)
async function employeeDTO(empId) {
  const r = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.active, u.permissions,
            u.must_change_password, u.last_login, u.created_at,
            u.ai_requests_used, u.ai_requests_month,
            COALESCE(ARRAY_AGG(ud.department_id) FILTER (WHERE ud.department_id IS NOT NULL), ARRAY[]::int[]) AS department_ids,
            COALESCE(ARRAY_AGG(d.name) FILTER (WHERE d.name IS NOT NULL), ARRAY[]::text[]) AS department_names
     FROM users u
       LEFT JOIN user_departments ud ON ud.user_id = u.id
       LEFT JOIN departments d ON d.id = ud.department_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [empId]
  );
  if (r.rows.length === 0) return null;
  const u = r.rows[0];
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active !== false,
    permissions: u.permissions || {},
    must_change_password: u.must_change_password === true,
    last_login: u.last_login,
    created_at: u.created_at,
    ai_requests_used: u.ai_requests_used || 0,
    ai_requests_month: u.ai_requests_month || '',
    department_ids: u.department_ids || [],
    department_names: u.department_names || [],
  };
}

// ═══════════════════════════════════════════════════════════
// GET /api/employees/permission-templates
// UI uchun tayyor shablonlar
// ═══════════════════════════════════════════════════════════
router.get('/permission-templates', (req, res) => {
  res.json({
    templates: [
      { id: 'viewer',  name: 'Ko\'ruvchi',     description: 'Faqat ko\'radi — AI/eksport yo\'q', permissions: PERMISSION_TEMPLATES.viewer },
      { id: 'analyst', name: 'Tahlilchi',      description: 'AI + hisobot + eksport (100 AI so\'rov/oy)', permissions: PERMISSION_TEMPLATES.analyst },
      { id: 'head',    name: 'Bo\'lim boshlig\'i', description: 'To\'liq boshqaruv (manba qo\'shish, AI 500/oy)', permissions: PERMISSION_TEMPLATES.head },
    ]
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/employees — tashkilot xodimlari ro'yxati
// CEO'ning o'zi va super_admin'lar ro'yxatga kirmaydi (faqat xodimlar)
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const orgId = req.user?.organization_id;
    if (!orgId) return res.json([]);

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.active, u.last_login, u.created_at,
              u.ai_requests_used, u.ai_requests_month, u.must_change_password,
              u.permissions,
              COALESCE(ARRAY_AGG(ud.department_id) FILTER (WHERE ud.department_id IS NOT NULL), ARRAY[]::int[]) AS department_ids,
              COALESCE(ARRAY_AGG(d.name) FILTER (WHERE d.name IS NOT NULL), ARRAY[]::text[]) AS department_names
       FROM users u
         LEFT JOIN user_departments ud ON ud.user_id = u.id
         LEFT JOIN departments d ON d.id = ud.department_id
       WHERE u.organization_id = $1
         AND u.role = 'employee'
       GROUP BY u.id
       ORDER BY u.active DESC, u.created_at DESC`,
      [orgId]
    );

    res.json(result.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active !== false,
      permissions: u.permissions || {},
      must_change_password: u.must_change_password === true,
      last_login: u.last_login,
      created_at: u.created_at,
      ai_requests_used: u.ai_requests_used || 0,
      ai_requests_month: u.ai_requests_month || '',
      department_ids: u.department_ids || [],
      department_names: u.department_names || [],
    })));
  } catch (err) {
    console.error('[EMPLOYEES] GET error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/employees/:id — bitta xodim tafsiloti
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    if (!empId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const check = await pool.query('SELECT organization_id FROM users WHERE id=$1', [empId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Xodim topilmadi' });
    if (!sameOrg(req, check.rows[0].organization_id)) {
      return res.status(403).json({ error: 'Boshqa tashkilotning xodimi' });
    }

    const dto = await employeeDTO(empId);
    if (!dto) return res.status(404).json({ error: 'Xodim topilmadi' });
    res.json(dto);
  } catch (err) {
    console.error('[EMPLOYEES] GET /:id error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/employees — yangi xodim qo'shish
// Body: { name, email, password?, department_ids:[], permissions, template? }
// password berilmasa — avtomatik yaratiladi va javobda bir marta ko'rsatiladi
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, email, password, department_ids = [], permissions, template, require_password_change } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Ism kerak' });
    if (!isValidEmail(email || '')) return res.status(400).json({ error: 'Email noto\'g\'ri formatda' });

    const cleanEmail = email.toLowerCase().trim();
    const cleanName  = name.trim();
    const orgId      = req.user?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    // Email band emasmi?
    const exists = await client.query('SELECT id FROM users WHERE email=$1', [cleanEmail]);
    if (exists.rows.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    // Bo'limlar shu tashkilotga tegishlimi?
    let deptIds = Array.isArray(department_ids)
      ? [...new Set(department_ids.map(x => parseInt(x, 10)).filter(x => !isNaN(x)))]
      : [];
    if (deptIds.length > 0) {
      const deptCheck = await client.query(
        `SELECT id FROM departments WHERE id = ANY($1::int[]) AND organization_id = $2`,
        [deptIds, orgId]
      );
      if (deptCheck.rows.length !== deptIds.length) {
        client.release();
        return res.status(400).json({ error: 'Ba\'zi bo\'limlar shu tashkilotga tegishli emas' });
      }
    }

    // Ruxsatlar — shablon yoki o'zgartirilgan
    const perms = normalizePermissions(permissions || {}, template);

    // Parol
    let plainPassword = password;
    if (!plainPassword || plainPassword.length < 6) {
      plainPassword = generatePassword(8);
    }
    const hash = await bcrypt.hash(plainPassword, 12);

    await client.query('BEGIN');

    // must_change_password majburiy emas — faqat CEO xohlaganda opt-in qiladi.
    const forceChange = require_password_change === true || require_password_change === 'true';

    // Yangi xodim CEO tarifini meros qilib oladi (tashkilot darajasidagi plan)
    const ceoRow = await client.query(
      `SELECT plan FROM users WHERE organization_id=$1 AND role='ceo' ORDER BY created_at ASC LIMIT 1`,
      [orgId]
    );
    const orgPlan = ceoRow.rows[0]?.plan || 'free';

    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, plan, organization_id,
                          permissions, must_change_password, active, created_by_user_id)
       VALUES ($1, $2, $3, 'employee', $4, $5, $6, $7, TRUE, $8)
       RETURNING id`,
      [cleanName, cleanEmail, hash, orgPlan, orgId, JSON.stringify(perms), forceChange, req.userId]
    );
    const newEmpId = userRes.rows[0].id;

    // Bo'limlarga biriktirish
    if (deptIds.length === 0) {
      // Standart "Umumiy" bo'limga
      const umumiy = await client.query(
        `SELECT id FROM departments WHERE organization_id=$1 AND name='Umumiy' LIMIT 1`,
        [orgId]
      );
      if (umumiy.rows.length > 0) deptIds = [umumiy.rows[0].id];
    }

    for (const dId of deptIds) {
      await client.query(
        `INSERT INTO user_departments (user_id, department_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [newEmpId, dId]
      );
    }

    await client.query('COMMIT');

    await audit(req, 'create_employee', newEmpId, { name: cleanName, email: cleanEmail, departments: deptIds });

    const dto = await employeeDTO(newEmpId);
    res.status(201).json({
      ...dto,
      initial_password: plainPassword, // bir marta ko'rsatish uchun
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[EMPLOYEES] POST error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/employees/:id — tahrirlash (ism, bo'limlar, ruxsatlar)
// ═══════════════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const empId = parseInt(req.params.id, 10);
    if (!empId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const check = await client.query('SELECT organization_id, role FROM users WHERE id=$1', [empId]);
    if (check.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Xodim topilmadi' });
    }
    if (!sameOrg(req, check.rows[0].organization_id)) {
      client.release();
      return res.status(403).json({ error: 'Boshqa tashkilot xodimi' });
    }
    if (check.rows[0].role !== 'employee') {
      client.release();
      return res.status(400).json({ error: 'Faqat xodimlarni shu endpoint orqali tahrirlash mumkin' });
    }

    const { name, department_ids, permissions, template } = req.body;

    await client.query('BEGIN');

    const updates = [];
    const vals = [];
    let idx = 1;

    if (name !== undefined) {
      const clean = String(name).trim();
      if (!clean) { client.release(); return res.status(400).json({ error: 'Ism bo\'sh bo\'lmasin' }); }
      updates.push(`name=$${idx++}`); vals.push(clean);
    }

    if (permissions !== undefined || template !== undefined) {
      const perms = normalizePermissions(permissions || {}, template);
      updates.push(`permissions=$${idx++}`); vals.push(JSON.stringify(perms));
    }

    updates.push(`updated_at=NOW()`);

    if (vals.length > 0) {
      vals.push(empId);
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id=$${idx}`,
        vals
      );
    }

    // Bo'limlar yangilash
    if (Array.isArray(department_ids)) {
      const newDepts = [...new Set(department_ids.map(x => parseInt(x, 10)).filter(x => !isNaN(x)))];

      // Tashkilot bo'limi ekanligini tekshirish
      if (newDepts.length > 0) {
        const deptCheck = await client.query(
          `SELECT id FROM departments WHERE id = ANY($1::int[]) AND organization_id = $2`,
          [newDepts, check.rows[0].organization_id]
        );
        if (deptCheck.rows.length !== newDepts.length) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ error: 'Ba\'zi bo\'limlar shu tashkilotga tegishli emas' });
        }
      }

      // Eski bog'lanishlarni o'chirib, yangilarini qo'yamiz
      await client.query('DELETE FROM user_departments WHERE user_id=$1', [empId]);
      for (const dId of newDepts) {
        await client.query(
          `INSERT INTO user_departments (user_id, department_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [empId, dId]
        );
      }
    }

    await client.query('COMMIT');

    await audit(req, 'update_employee', empId, { fields: Object.keys(req.body) });

    const dto = await employeeDTO(empId);
    res.json(dto);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[EMPLOYEES] PUT error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/employees/:id/reset-password
// Yangi vaqtinchalik parol yaratadi, must_change_password=TRUE
// Javobda plain password bir marta ko'rsatiladi
// ═══════════════════════════════════════════════════════════
router.post('/:id/reset-password', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    if (!empId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const check = await pool.query('SELECT organization_id, role FROM users WHERE id=$1', [empId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Xodim topilmadi' });
    if (!sameOrg(req, check.rows[0].organization_id)) return res.status(403).json({ error: 'Boshqa tashkilot' });
    if (check.rows[0].role !== 'employee') return res.status(400).json({ error: 'Faqat xodim uchun' });

    const newPass = generatePassword(8);
    const hash = await bcrypt.hash(newPass, 12);

    // must_change_password — CEO xohlaganda opt-in (body.require_change=true)
    const forceChange = req.body?.require_change === true;

    await pool.query(
      `UPDATE users SET password_hash=$1, must_change_password=$2, updated_at=NOW() WHERE id=$3`,
      [hash, forceChange, empId]
    );
    // Sessiyalarni yopamiz — majburan yangi parol bilan kirsin
    await pool.query('UPDATE sessions SET expired=TRUE WHERE user_id=$1', [empId]);

    await audit(req, 'reset_password', empId, {});

    res.json({ ok: true, new_password: newPass });
  } catch (err) {
    console.error('[EMPLOYEES] reset-password error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/employees/:id/block
// ═══════════════════════════════════════════════════════════
router.post('/:id/block', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    const check = await pool.query('SELECT organization_id, role FROM users WHERE id=$1', [empId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Xodim topilmadi' });
    if (!sameOrg(req, check.rows[0].organization_id)) return res.status(403).json({ error: 'Boshqa tashkilot' });
    if (check.rows[0].role !== 'employee') return res.status(400).json({ error: 'Faqat xodim uchun' });

    await pool.query('UPDATE users SET active=FALSE, updated_at=NOW() WHERE id=$1', [empId]);
    await pool.query('UPDATE sessions SET expired=TRUE WHERE user_id=$1', [empId]);

    await audit(req, 'block_employee', empId, {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[EMPLOYEES] block error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/employees/:id/unblock
// ═══════════════════════════════════════════════════════════
router.post('/:id/unblock', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    const check = await pool.query('SELECT organization_id, role FROM users WHERE id=$1', [empId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Xodim topilmadi' });
    if (!sameOrg(req, check.rows[0].organization_id)) return res.status(403).json({ error: 'Boshqa tashkilot' });
    if (check.rows[0].role !== 'employee') return res.status(400).json({ error: 'Faqat xodim uchun' });

    await pool.query('UPDATE users SET active=TRUE, updated_at=NOW() WHERE id=$1', [empId]);
    await audit(req, 'unblock_employee', empId, {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[EMPLOYEES] unblock error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/employees/:id — butunlay o'chirish
// ?force=true bo'lmasa, xodim sources/alert yaratgan bo'lsa rad etadi
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    const check = await pool.query('SELECT organization_id, role, email FROM users WHERE id=$1', [empId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Xodim topilmadi' });
    if (!sameOrg(req, check.rows[0].organization_id)) return res.status(403).json({ error: 'Boshqa tashkilot' });
    if (check.rows[0].role !== 'employee') return res.status(400).json({ error: 'Faqat xodimni bu endpoint orqali o\'chirish mumkin' });

    const force = req.query.force === 'true';
    const usage = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM sources WHERE user_id=$1) AS srcs,
              (SELECT COUNT(*)::int FROM reports WHERE user_id=$1) AS rpts`,
      [empId]
    );
    const { srcs, rpts } = usage.rows[0];
    if ((srcs > 0 || rpts > 0) && !force) {
      return res.status(409).json({
        error: `Xodim ${srcs} ta manba va ${rpts} ta hisobot yaratgan. Avval ularni ko'chiring yoki ?force=true ishlating.`,
        code: 'EMPLOYEE_HAS_DATA',
        source_count: srcs,
        report_count: rpts,
      });
    }

    await pool.query('DELETE FROM users WHERE id=$1', [empId]);

    await audit(req, 'delete_employee', empId, {
      email: check.rows[0].email,
      force,
      had_sources: srcs,
      had_reports: rpts,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[EMPLOYEES] DELETE error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
module.exports.PERMISSION_TEMPLATES = PERMISSION_TEMPLATES;
