const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin, checkPermission, checkAiLimit } = require('../middleware/auth');
const { runAgent } = require('../services/aiAgent');

const router = express.Router();

// ── POST /api/ai/agent ── (sayt chat — multi-turn, tools bilan)
router.post('/agent', requireAuth, checkPermission('can_use_ai'), checkAiLimit, async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message kerak' });
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    const r = await runAgent({
      message,
      organizationId: orgId,
      userId: req.userId,
      history: Array.isArray(history) ? history.slice(-6) : [],
    });

    // Chat history saqlash
    await pool.query(
      `INSERT INTO chat_history (user_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
      [req.userId, message, r.reply]
    ).catch(() => {});
    // AI hisoblagich
    const curMonth = new Date().toISOString().slice(0, 7);
    await pool.query(
      `UPDATE users SET
        ai_requests_used = CASE WHEN ai_requests_month=$2 THEN ai_requests_used+1 ELSE 1 END,
        ai_requests_month = $2
       WHERE id=$1`,
      [req.userId, curMonth]
    ).catch(() => {});

    res.json({
      ok: true,
      reply: r.reply,
      provider: r.provider,
      model: r.model,
      iterations: r.iterations,
      toolCallsCount: r.toolCalls.length,
      tools: r.toolCalls.map(t => ({ name: t.name, input: t.input })),
    });
  } catch (e) {
    console.error('[ai/agent]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ── GET /api/ai/config ── (foydalanuvchi AI sozlamalari)
router.get('/config', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ai_config WHERE user_id=$1',
      [req.userId]
    );
    const cfg = result.rows[0] || {};
    res.json({
      provider: cfg.provider || 'deepseek',
      model: cfg.model || 'deepseek-chat',
      apiKey: cfg.api_key || '',
      allKeys: cfg.all_keys || {},
      autoReport: cfg.auto_report || false,
      reportTime: cfg.report_time || '09:00',
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/ai/config ── (foydalanuvchi AI sozlamalarini saqlash)
router.put('/config', requireAuth, async (req, res) => {
  try {
    const { provider, model, apiKey, allKeys, autoReport, reportTime } = req.body;

    await pool.query(`
      INSERT INTO ai_config (user_id, provider, model, api_key, all_keys, auto_report, report_time, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        provider=COALESCE($2, ai_config.provider),
        model=COALESCE($3, ai_config.model),
        api_key=COALESCE($4, ai_config.api_key),
        all_keys=COALESCE($5, ai_config.all_keys),
        auto_report=COALESCE($6, ai_config.auto_report),
        report_time=COALESCE($7, ai_config.report_time),
        updated_at=NOW()
    `, [
      req.userId,
      provider || 'deepseek',
      model || 'deepseek-chat',
      apiKey || '',
      JSON.stringify(allKeys || {}),
      autoReport || false,
      reportTime || '09:00',
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── GET /api/ai/global ── (global AI config — hammaga ochiq)
router.get('/global', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM global_settings WHERE key='global_ai'"
    );
    res.json(result.rows[0]?.value || {});
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/ai/global ── (admin global AI sozlash)
router.put('/global', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { provider, model, apiKey } = req.body;
    const cfg = { provider, model, apiKey };

    await pool.query(`
      INSERT INTO global_settings (key, value, updated_at)
      VALUES ('global_ai', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()
    `, [JSON.stringify(cfg)]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── POST /api/ai/increment ── (AI so'rov hisoblagich + limit tekshiruvi)
router.post('/increment', requireAuth, checkPermission('can_use_ai'), checkAiLimit, async (req, res) => {
  try {
    const curMonth = new Date().toISOString().slice(0, 7);
    await pool.query(`
      UPDATE users SET
        ai_requests_used = CASE
          WHEN ai_requests_month = $2 THEN ai_requests_used + 1
          ELSE 1
        END,
        ai_requests_month = $2
      WHERE id = $1
    `, [req.userId, curMonth]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── GET /api/ai/plan-prices ── (tarif narxlari)
router.get('/plan-prices', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM global_settings WHERE key='plan_prices'"
    );
    res.json(result.rows[0]?.value || {});
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── PUT /api/ai/plan-prices ── (admin tarif narxlari)
router.put('/plan-prices', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO global_settings (key, value, updated_at)
      VALUES ('plan_prices', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()
    `, [JSON.stringify(req.body)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
