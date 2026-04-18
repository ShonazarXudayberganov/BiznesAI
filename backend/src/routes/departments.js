/**
 * BiznesAI — Departments (bo'limlar) CRUD
 *
 * CEO yoki super_admin o'z tashkilotining bo'limlarini boshqaradi.
 * Xodimlar — faqat o'z bo'limlarini ko'radi (GET).
 */
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireCeo, sameOrg } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Audit log yozish (silent — xato bo'lsa ishni to'xtatmaydi)
async function audit(req, action, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, target_type, target_id, details, ip)
       VALUES ($1, $2, $3, 'department', $4, $5, $6)`,
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
    console.warn('[AUDIT] department log failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/departments — bo'limlar ro'yxati
// CEO/super_admin → o'z tashkilotining barcha bo'limlari
// Xodim → faqat tegishli bo'limlari
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const orgId = req.user?.organization_id;
    if (!orgId) return res.json([]);

    const isCeo = req.userRole === 'ceo' || req.userRole === 'super_admin' || req.userRole === 'admin';

    let result;
    if (isCeo) {
      result = await pool.query(
        `SELECT d.id, d.name, d.icon, d.color, d.created_at,
                (SELECT COUNT(*)::int FROM user_departments ud WHERE ud.department_id = d.id) AS employee_count,
                (SELECT COUNT(*)::int FROM source_departments sd WHERE sd.department_id = d.id) AS source_count
         FROM departments d
         WHERE d.organization_id = $1
         ORDER BY d.id ASC`,
        [orgId]
      );
    } else {
      result = await pool.query(
        `SELECT d.id, d.name, d.icon, d.color, d.created_at,
                (SELECT COUNT(*)::int FROM user_departments ud WHERE ud.department_id = d.id) AS employee_count,
                (SELECT COUNT(*)::int FROM source_departments sd WHERE sd.department_id = d.id) AS source_count
         FROM departments d
         JOIN user_departments ud ON ud.department_id = d.id
         WHERE d.organization_id = $1 AND ud.user_id = $2
         ORDER BY d.id ASC`,
        [orgId, req.userId]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('[DEPARTMENTS] GET error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/departments — yangi bo'lim (CEO only)
// ═══════════════════════════════════════════════════════════
router.post('/', requireCeo, async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Bo\'lim nomi kerak' });
    }
    const cleanName = name.trim();
    if (cleanName.length > 100) {
      return res.status(400).json({ error: 'Bo\'lim nomi 100 belgidan oshmasin' });
    }

    const orgId = req.user?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    // Dublikat nom tekshiruvi
    const dup = await pool.query(
      'SELECT id FROM departments WHERE organization_id=$1 AND LOWER(name)=LOWER($2)',
      [orgId, cleanName]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Bu nom bilan bo\'lim allaqachon mavjud' });
    }

    const result = await pool.query(
      `INSERT INTO departments (organization_id, name, icon, color, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, icon, color, created_at`,
      [orgId, cleanName, (icon || '📁').substring(0, 10), (color || '#6B7280').substring(0, 20), req.userId]
    );

    const dept = result.rows[0];
    await audit(req, 'create_department', dept.id, { name: cleanName });

    res.status(201).json({
      ...dept,
      employee_count: 0,
      source_count: 0,
    });
  } catch (err) {
    console.error('[DEPARTMENTS] POST error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/departments/:id — tahrirlash (CEO only)
// ═══════════════════════════════════════════════════════════
router.put('/:id', requireCeo, async (req, res) => {
  try {
    const deptId = parseInt(req.params.id, 10);
    if (!deptId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    // Bo'lim mavjudmi va shu tashkilotga tegishlimi?
    const check = await pool.query(
      'SELECT organization_id FROM departments WHERE id=$1',
      [deptId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Bo\'lim topilmadi' });
    }
    if (!sameOrg(req, check.rows[0].organization_id)) {
      return res.status(403).json({ error: 'Boshqa tashkilotning bo\'limi' });
    }

    const { name, icon, color } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;

    if (name !== undefined) {
      const clean = name.trim();
      if (!clean) return res.status(400).json({ error: 'Bo\'lim nomi bo\'sh bo\'lmasin' });
      if (clean.length > 100) return res.status(400).json({ error: 'Bo\'lim nomi 100 belgidan oshmasin' });
      // Dublikat
      const dup = await pool.query(
        'SELECT id FROM departments WHERE organization_id=$1 AND LOWER(name)=LOWER($2) AND id<>$3',
        [check.rows[0].organization_id, clean, deptId]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Bu nom bilan boshqa bo\'lim mavjud' });
      }
      updates.push(`name=$${idx++}`); vals.push(clean);
    }
    if (icon !== undefined) { updates.push(`icon=$${idx++}`); vals.push(String(icon).substring(0, 10)); }
    if (color !== undefined) { updates.push(`color=$${idx++}`); vals.push(String(color).substring(0, 20)); }

    if (vals.length === 0) return res.json({ ok: true });

    vals.push(deptId);
    await pool.query(
      `UPDATE departments SET ${updates.join(', ')} WHERE id=$${idx}`,
      vals
    );

    await audit(req, 'update_department', deptId, { fields: Object.keys(req.body) });

    const updated = await pool.query(
      `SELECT id, name, icon, color, created_at,
              (SELECT COUNT(*)::int FROM user_departments ud WHERE ud.department_id=$1) AS employee_count,
              (SELECT COUNT(*)::int FROM source_departments sd WHERE sd.department_id=$1) AS source_count
       FROM departments WHERE id=$1`,
      [deptId]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[DEPARTMENTS] PUT error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/departments/:id — o'chirish (CEO only)
// Xavfsizlik: agar bo'limda xodim yoki manba bor bo'lsa —
// ?force=true bo'lmasa rad etadi
// ═══════════════════════════════════════════════════════════
router.delete('/:id', requireCeo, async (req, res) => {
  try {
    const deptId = parseInt(req.params.id, 10);
    if (!deptId) return res.status(400).json({ error: 'ID noto\'g\'ri' });

    const check = await pool.query(
      'SELECT organization_id, name FROM departments WHERE id=$1',
      [deptId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Bo\'lim topilmadi' });
    }
    if (!sameOrg(req, check.rows[0].organization_id)) {
      return res.status(403).json({ error: 'Boshqa tashkilotning bo\'limi' });
    }

    // "Umumiy" bo'limni o'chirishga ruxsat yo'q (standart, tashkilot faoliyati asosi)
    if (check.rows[0].name === 'Umumiy') {
      return res.status(400).json({ error: '"Umumiy" bo\'limni o\'chirib bo\'lmaydi' });
    }

    // Foydalanish tekshiruvi
    const usage = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_departments WHERE department_id=$1) AS emp,
         (SELECT COUNT(*)::int FROM source_departments WHERE department_id=$1) AS src`,
      [deptId]
    );
    const { emp, src } = usage.rows[0];

    const force = req.query.force === 'true';
    if ((emp > 0 || src > 0) && !force) {
      return res.status(409).json({
        error: `Bu bo'limda ${emp} xodim va ${src} ta manba bor. Avval ularni boshqa bo'limga ko'chiring yoki ?force=true ishlating.`,
        code: 'DEPARTMENT_NOT_EMPTY',
        employee_count: emp,
        source_count: src,
      });
    }

    // force=true bo'lsa, bog'lanishlar kaskad bilan o'chadi (FK ON DELETE CASCADE)
    // Lekin source_departments/user_departments CASCADE bilan belgilangan
    // → manba yoki xodim o'chmaydi, faqat bog'lanish uziladi
    await pool.query('DELETE FROM departments WHERE id=$1', [deptId]);

    await audit(req, 'delete_department', deptId, {
      name: check.rows[0].name,
      force,
      had_employees: emp,
      had_sources: src,
    });

    res.json({ ok: true, deleted_name: check.rows[0].name });
  } catch (err) {
    console.error('[DEPARTMENTS] DELETE error:', err.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
