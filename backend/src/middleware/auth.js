const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'biznesai_dev_secret';

/**
 * JWT token yaratish
 */
function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, {
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
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }
}

/**
 * Admin tekshirish middleware (requireAuth dan keyin ishlatiladi)
 */
function requireAdmin(req, res, next) {
  // userId allaqachon req da bor (requireAuth dan)
  const pool = require('../db/pool');
  pool.query('SELECT role FROM users WHERE id=$1', [req.userId])
    .then(r => {
      if (r.rows.length === 0 || r.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Admin huquqi kerak' });
      }
      next();
    })
    .catch(() => res.status(500).json({ error: 'Server xatosi' }));
}

module.exports = { signToken, requireAuth, requireAdmin };
