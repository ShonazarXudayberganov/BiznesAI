/**
 * Admin AI usage endpoint'lari — cost telemetry va monitoring.
 *
 *   GET /api/admin/ai/usage              — barcha foydalanuvchilar (admin only)
 *   GET /api/admin/ai/usage/me           — o'zining cost statistikasi
 *   GET /api/admin/ai/usage/today        — bugungi total
 *   GET /api/admin/ai/usage/intents      — intent breakdown
 *   GET /api/admin/ai/usage/top          — top users (admin only)
 */
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getTodayCost,
  getDailyUsage,
  getIntentBreakdown,
  getTopUsers,
} = require('../services/telemetry/logger');
const { formatCost } = require('../services/telemetry/costCalc');
const { getUserCap, DEFAULT_CAP } = require('../middleware/costCap');

const router = express.Router();

// ── GET /api/admin/ai/usage/me — joriy user statistikasi ──
router.get('/usage/me', requireAuth, async (req, res) => {
  try {
    const today = await getTodayCost(req.userId);
    const daily = await getDailyUsage({ userId: req.userId, days: 7 });
    const intents = await getIntentBreakdown({ userId: req.userId, days: 30 });
    const cap = await getUserCap(req.userId);
    const isUnlimited = cap < 0 || req.user.role === 'admin' || req.user.role === 'super_admin';
    res.json({
      ok: true,
      today: {
        ...today,
        formatted: formatCost(today.total_cost),
      },
      last_7_days: daily,
      by_intent_30d: intents,
      cap: {
        daily_usd: isUnlimited ? null : cap,
        spent_today: today.total_cost,
        remaining: isUnlimited ? null : Math.max(0, cap - today.total_cost),
        unlimited: isUnlimited,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/ai/cap/:userId — admin uchun foydalanuvchi cap'ini ko'rish ──
router.get('/cap/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const r = await pool.query(`SELECT id, name, email, daily_cost_cap_usd FROM users WHERE id = $1`, [userId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'User topilmadi' });
    const u = r.rows[0];
    res.json({
      user_id: u.id,
      name: u.name,
      email: u.email,
      daily_cost_cap_usd: u.daily_cost_cap_usd,
      effective_cap: u.daily_cost_cap_usd != null ? parseFloat(u.daily_cost_cap_usd) : DEFAULT_CAP,
      default: DEFAULT_CAP,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/admin/ai/cap/:userId — admin: per-user cap'ni yangilash ──
//   { cap_usd: 5.00 }   — kunlik $5
//   { cap_usd: null }   — global default'ga qaytarish
//   { cap_usd: -1 }     — cheksiz
//   { cap_usd: 0 }      — to'liq blok
router.put('/cap/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { cap_usd } = req.body || {};
    if (cap_usd !== null && cap_usd !== undefined && typeof cap_usd !== 'number') {
      return res.status(400).json({ error: 'cap_usd raqam yoki null bo\'lishi kerak' });
    }
    await pool.query(`UPDATE users SET daily_cost_cap_usd = $1 WHERE id = $2`, [cap_usd, userId]);
    res.json({ ok: true, user_id: userId, daily_cost_cap_usd: cap_usd });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/ai/usage/today — bugungi (joriy user) ──
router.get('/usage/today', requireAuth, async (req, res) => {
  try {
    const today = await getTodayCost(req.userId);
    res.json({
      ok: true,
      ...today,
      formatted: formatCost(today.total_cost),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/ai/usage — barcha (admin only) ──
router.get('/usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const orgId = req.user.organization_id;
    const daily = await getDailyUsage({ organizationId: orgId, days });
    const intents = await getIntentBreakdown({ organizationId: orgId, days });
    const topUsers = await getTopUsers({ days, limit: 10 });
    res.json({
      ok: true,
      days,
      organization_id: orgId,
      daily,
      by_intent: intents,
      top_users: topUsers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/ai/usage/intents — intent bo'yicha ──
router.get('/usage/intents', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const userId = req.user.role === 'admin' || req.user.role === 'super_admin' ? null : req.userId;
    const intents = await getIntentBreakdown({
      userId,
      organizationId: req.user.organization_id,
      days,
    });
    res.json({ ok: true, days, intents });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/ai/usage/top — top users (admin only) ──
router.get('/usage/top', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const top = await getTopUsers({ days, limit });
    res.json({ ok: true, days, top });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
