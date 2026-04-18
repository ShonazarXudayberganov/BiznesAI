const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'biznesai_dev_secret';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'biznesai_dev_secret') {
  console.error('[AUTH] JWT_SECRET env o‘rnatilmagan — production‘da xavfli!');
  process.exit(1);
}

/**
 * JWT token yaratish
 * role — 'user' | 'admin'
 */
function signToken(userId, role = 'user') {
  return jwt.sign({ id: userId, role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

/**
 * JWT tekshirish middleware
 * Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token kerak' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role || 'user';
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }
}

/**
 * Admin tekshirish middleware (requireAuth dan keyin ishlatiladi).
 * JWT payload'dagi role'ni tekshiradi — DB so'rovisiz.
 * Eski tokenlar (role siz) uchun DB fallback qoldirildi.
 */
function requireAdmin(req, res, next) {
  if (req.userRole === 'admin') return next();

  // Legacy token fallback — bir marta DB dan o‘qib tekshiramiz
  const pool = require('../db/pool');
  pool.query('SELECT role FROM users WHERE id=$1', [req.userId])
    .then(r => {
      if (r.rows.length === 0 || r.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Admin huquqi kerak' });
      }
      req.userRole = 'admin';
      next();
    })
    .catch(err => {
      console.error('[AUTH] requireAdmin DB error:', err.message);
      res.status(500).json({ error: 'Server xatosi' });
    });
}

module.exports = { signToken, requireAuth, requireAdmin };
