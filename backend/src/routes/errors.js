/**
 * Error log endpoint'lari.
 *
 *   POST /api/errors/client     — frontend xatolarni yuboradi (auth ixtiyoriy)
 *   GET  /api/errors            — admin: so'nggi xato'lar
 *   GET  /api/errors/groups     — admin: fingerprint bo'yicha guruhlangan
 *   POST /api/errors/:id/resolve — admin: xato'ni hal qilingan deb belgilash
 */
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const errorLogger = require('../services/errorLogger');

const router = express.Router();

// ── POST /api/errors/client ── frontend yuboradi (auth ixtiyoriy)
router.post('/client', async (req, res) => {
  try {
    const { message, stack, url, userAgent, context, level } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message kerak' });
    }
    // Auth bo'lsa user info qo'shamiz (lekin majburiy emas)
    let userId = null;
    let organizationId = null;
    try {
      // Soft auth — token bo'lsa yaxshi, bo'lmasa ham OK
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev');
        userId = decoded?.id || null;
      }
    } catch {}

    errorLogger.logError({
      source: 'frontend',
      level: level || 'error',
      message: String(message).slice(0, 5000),
      stack: stack ? String(stack).slice(0, 10000) : null,
      userId,
      organizationId,
      url: url ? String(url).slice(0, 500) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 300) : (req.headers['user-agent'] || null),
      context: context && typeof context === 'object' ? context : null,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/errors — admin only ──
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const errors = await errorLogger.getRecentErrors({
      limit: parseInt(req.query.limit || '50', 10),
      source: req.query.source,
      level: req.query.level,
      days: parseInt(req.query.days || '7', 10),
    });
    res.json({ ok: true, errors, count: errors.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/errors/groups — top fingerprints ──
router.get('/groups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const groups = await errorLogger.getErrorGroups({
      days: parseInt(req.query.days || '7', 10),
      limit: parseInt(req.query.limit || '20', 10),
    });
    res.json({ ok: true, groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/errors/:id/resolve ──
router.post('/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE error_log SET resolved = TRUE WHERE id = $1`, [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/errors/old — eski xato'larni tozalash (30 kun+) ──
router.delete('/old', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const r = await pool.query(
      `DELETE FROM error_log WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [days]
    );
    res.json({ ok: true, deleted: r.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
