/**
 * BiznesAI — Auth middleware (v2: multi-organization + role + permissions)
 *
 * req.userId   — joriy foydalanuvchi ID
 * req.userRole — 'super_admin' | 'ceo' | 'employee' | 'admin'(legacy) | 'user'(legacy)
 * req.user     — to'liq profil: id, email, role, organization_id, department_ids[],
 *                permissions, active, must_change_password, organization_name,
 *                org_active, subscription_until
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'biznesai_dev_secret';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'biznesai_dev_secret') {
  console.error('[AUTH] JWT_SECRET env o‘rnatilmagan — production‘da xavfli!');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// JWT token yaratish
// Payload minimal: {id}. Qolgan ma'lumot har requestda DB'dan yangilab o'qiladi
// (role/permissions o'zgarishi darhol aks etadi).
// Eski kod extra argumentlar bersa — saqlaymiz, lekin ishlatilmaydi.
// ─────────────────────────────────────────────────────────────
function signToken(userId, extraOrRole) {
  const payload = { id: userId };
  // Legacy support: signToken(id, role) shaklida chaqirilsa
  if (typeof extraOrRole === 'string') {
    payload.role = extraOrRole;
  } else if (extraOrRole && typeof extraOrRole === 'object') {
    Object.assign(payload, extraOrRole);
  }
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

// ─────────────────────────────────────────────────────────────
// DB dan foydalanuvchi to'liq profilini olish
// Lazy pool require — cache orqali almashtirish mumkin bo'lsin (test uchun)
// ─────────────────────────────────────────────────────────────
async function loadUser(userId) {
  const pool = require('../db/pool');
  const res = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.plan, u.organization_id,
            u.permissions, u.active, u.must_change_password,
            u.ai_requests_used, u.ai_requests_month, u.phone, u.avatar_url,
            u.created_at, u.last_login,
            COALESCE(
              ARRAY_AGG(ud.department_id) FILTER (WHERE ud.department_id IS NOT NULL),
              ARRAY[]::int[]
            ) AS department_ids,
            o.name           AS organization_name,
            o.color          AS organization_color,
            o.logo_url       AS organization_logo,
            o.active         AS org_active,
            o.subscription_until
     FROM users u
       LEFT JOIN user_departments ud ON ud.user_id = u.id
       LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1
     GROUP BY u.id, o.id`,
    [userId]
  );
  return res.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────
// requireAuth — Bearer token tekshirish + user yuklash
// ─────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token kerak' });
  }

  let decoded;
  try {
    decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }

  try {
    const user = await loadUser(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
    }

    // Bloklangan foydalanuvchi
    if (user.active === false) {
      return res.status(403).json({ error: 'Hisobingiz bloklangan. CEO bilan bog\'laning.' });
    }

    // Super_admin uchun tashkilot/obuna tekshiruvi bekor qilinadi
    const isSuperAdmin = user.role === 'super_admin';

    if (!isSuperAdmin) {
      if (user.organization_id && user.org_active === false) {
        return res.status(403).json({ error: 'Tashkilot faoliyati to\'xtatilgan' });
      }
      if (user.subscription_until && new Date(user.subscription_until) < new Date()) {
        return res.status(402).json({
          error: 'Tashkilot obunasi muddati tugagan. Yangilash uchun admin bilan bog\'laning.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
      }
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.user = user;
    next();
  } catch (e) {
    console.error('[AUTH] requireAuth error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
}

// ─────────────────────────────────────────────────────────────
// Super-admin (Shonazar — tizim egasi)
// ─────────────────────────────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (req.userRole === 'super_admin') return next();
  return res.status(403).json({ error: 'Faqat super-admin uchun' });
}

// ─────────────────────────────────────────────────────────────
// CEO (yoki super_admin) — tashkilot sozlamalari uchun
// ─────────────────────────────────────────────────────────────
function requireCeo(req, res, next) {
  if (req.userRole === 'super_admin' || req.userRole === 'ceo') return next();
  return res.status(403).json({ error: 'Faqat CEO yoki super-admin uchun' });
}

// ─────────────────────────────────────────────────────────────
// Legacy admin (eski admin panelini buzmaslik uchun)
// super_admin + eski 'admin' role ikkalasi o'tadi.
// ─────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.userRole === 'super_admin' || req.userRole === 'admin') return next();
  return res.status(403).json({ error: 'Admin huquqi kerak' });
}

// ─────────────────────────────────────────────────────────────
// Tashkilot izolyatsiyasi — ikki user bir organizationga tegishli ekanini tekshirish
// Foydalanish: requireAuth'dan keyin chaqiriladi, req.user.organization_id bilan
// taqqoslash uchun ResourceOrgId ni parametr sifatida uzatish kerak bo'lsa —
// controller o'zida tekshirib chaqiradi.
// ─────────────────────────────────────────────────────────────
function sameOrg(req, resourceOrgId) {
  if (req.userRole === 'super_admin') return true;          // super_admin hamma org
  if (!req.user?.organization_id || !resourceOrgId) return false;
  return Number(req.user.organization_id) === Number(resourceOrgId);
}

// ─────────────────────────────────────────────────────────────
// Ruxsat tekshiruvi (factory)
// Usage: router.post('/', checkPermission('can_add_sources'), handler)
// super_admin va CEO — har doim o'tadi (ular to'liq huquqli)
// Legacy 'admin' ham o'tadi (backward compat)
// ─────────────────────────────────────────────────────────────
function checkPermission(permName) {
  return (req, res, next) => {
    const r = req.userRole;
    if (r === 'super_admin' || r === 'ceo' || r === 'admin') return next();

    const perms = req.user?.permissions || {};
    const val = perms[permName];
    if (val === true || val === 'true') return next();

    return res.status(403).json({
      error: `Sizda '${permName}' ruxsati yo'q. CEO bilan bog'laning.`,
      code: 'PERMISSION_DENIED',
      permission: permName,
    });
  };
}

// ─────────────────────────────────────────────────────────────
// AI oylik limit tekshiruvi (checkPermission dan alohida — limit integer)
// ─────────────────────────────────────────────────────────────
function checkAiLimit(req, res, next) {
  const r = req.userRole;
  if (r === 'super_admin' || r === 'ceo' || r === 'admin') return next();

  const perms = req.user?.permissions || {};
  const limit = perms.ai_monthly_limit;
  if (limit === -1 || limit === undefined || limit === null) return next();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const userMonth = req.user.ai_requests_month;
  const used = (userMonth === currentMonth) ? (req.user.ai_requests_used || 0) : 0;

  if (used >= Number(limit)) {
    return res.status(429).json({
      error: `AI oylik limitingiz tugadi (${used}/${limit}). CEO bilan bog'laning.`,
      code: 'AI_LIMIT_EXCEEDED',
      used, limit,
    });
  }
  next();
}

module.exports = {
  signToken,
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireCeo,
  checkPermission,
  checkAiLimit,
  sameOrg,
  loadUser,
};
