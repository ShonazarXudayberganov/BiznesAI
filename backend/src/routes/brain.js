/**
 * AI Brain endpoint'lari — barcha sahifalar uchun yagona kirish nuqtasi.
 *
 *   POST /api/ai/brain         — sinxron (kichik so'rovlar uchun)
 *   POST /api/ai/brain/stream  — SSE streaming (UI'da real-time tool/delta/thinking)
 *
 * Body schema:
 *   {
 *     intent: "dashboard.summary",
 *     payload: { ... },          // intent-spetsifik vars
 *     message?: "...",            // payload.user bo'lmasa
 *     history?: [...],
 *     thinkingBudget?: number,   // override (default intent.thinkingBudget)
 *     language?: "uz"|"ru"|"en"
 *   }
 */
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, checkPermission, checkAiLimit, checkAiRateLimit } = require('../middleware/auth');
const { checkCostCap } = require('../middleware/costCap');
const { runBrain } = require('../services/aiBrain');
const { listIntents } = require('../services/intents');

const router = express.Router();

// ── GET /api/ai/brain/intents ── debug: mavjud intent'lar
router.get('/intents', requireAuth, (req, res) => {
  res.json({ intents: listIntents() });
});

// ── POST /api/ai/brain ── sinxron
router.post('/', requireAuth, checkPermission('can_use_ai'), checkAiRateLimit, checkAiLimit, checkCostCap, async (req, res) => {
  try {
    const { intent, payload, message, history, thinkingBudget, language, source_ids } = req.body || {};
    if (!intent) return res.status(400).json({ error: 'intent kerak' });
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    const result = await runBrain({
      intent,
      payload: payload || {},
      message,
      history: Array.isArray(history)
        ? history.slice(-6).map(h => ({ ...h, content: String(h.content || '').slice(0, 4000) }))
        : [],
      userId: req.userId,
      organizationId: orgId,
      language,
      thinkingBudgetOverride: typeof thinkingBudget === 'number' ? thinkingBudget : undefined,
      allowedSourceIds: Array.isArray(source_ids) && source_ids.length > 0 ? source_ids : null,
    });

    // AI hisoblagich
    const curMonth = new Date().toISOString().slice(0, 7);
    pool.query(
      `UPDATE users SET
        ai_requests_used = CASE WHEN ai_requests_month=$2 THEN ai_requests_used+1 ELSE 1 END,
        ai_requests_month = $2
       WHERE id=$1`,
      [req.userId, curMonth]
    ).catch(() => {});

    res.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    console.error('[ai/brain]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/ai/brain/stream ── SSE streaming
router.post('/stream', requireAuth, checkPermission('can_use_ai'), checkAiRateLimit, checkAiLimit, checkCostCap, async (req, res) => {
  try {
    const { intent, payload, message, history, thinkingBudget, language, source_ids } = req.body || {};
    if (!intent) return res.status(400).json({ error: 'intent kerak' });
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event, data) => {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    const onTool = (payload) => sendEvent('tool', payload);
    const onDelta = (text) => sendEvent('delta', { text });
    const onThinking = (text) => sendEvent('thinking', { text });

    try {
      sendEvent('start', { ts: Date.now(), intent });

      const result = await runBrain({
        intent,
        payload: payload || {},
        message,
        history: Array.isArray(history)
          ? history.slice(-6).map(h => ({ ...h, content: String(h.content || '').slice(0, 4000) }))
          : [],
        userId: req.userId,
        organizationId: orgId,
        language,
        thinkingBudgetOverride: typeof thinkingBudget === 'number' ? thinkingBudget : undefined,
        allowedSourceIds: Array.isArray(source_ids) && source_ids.length > 0 ? source_ids : null,
        onTool,
        onDelta,
        onThinking,
      });

      sendEvent('done', {
        intent: result.intent,
        outputSchema: result.outputSchema,
        reply: result.reply,
        parsed: result.parsed || null,
        parseError: result.parseError || null,
        confidence: result.confidence,
        sourcesUsed: result.sourcesUsed,
        iterations: result.iterations,
        toolCallsCount: Array.isArray(result.toolCalls) ? result.toolCalls.length : 0,
        provider: result.provider,
        model: result.model,
        usage: result.usage || null,
      });

      // AI hisoblagich (best-effort)
      const curMonth = new Date().toISOString().slice(0, 7);
      pool.query(
        `UPDATE users SET
          ai_requests_used = CASE WHEN ai_requests_month=$2 THEN ai_requests_used+1 ELSE 1 END,
          ai_requests_month = $2
         WHERE id=$1`,
        [req.userId, curMonth]
      ).catch(() => {});
    } catch (e) {
      console.error('[ai/brain/stream]', e.message);
      sendEvent('error', { error: e.message });
    } finally {
      try { res.end(); } catch {}
    }
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else { try { res.end(); } catch {} }
  }
});

module.exports = router;
