/**
 * Internal API — faqat bot-worker tomonidan chaqiriladi (Docker network ichida).
 * Auth: x-internal-secret header (same as bot-worker uses).
 */
const express = require('express');
const pool = require('../db/pool');
const { chatComplete } = require('../services/aiProviders');
const { buildOrgContext } = require('../services/contextBuilder');
const { buildReport } = require('../services/reportBuilder');

const router = express.Router();

const SECRET = process.env.BOT_WORKER_INTERNAL_SECRET || '';

// Auth middleware
router.use((req, res, next) => {
  if (!SECRET) return res.status(500).json({ error: 'Internal secret konfiguratsiya qilinmagan' });
  if (req.headers['x-internal-secret'] !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// POST /api/internal/ai-chat
// Body: { organizationId, userId, message, history? }
router.post('/ai-chat', async (req, res) => {
  try {
    const { organizationId, userId, message, history } = req.body || {};
    if (!organizationId || !message) {
      return res.status(400).json({ error: 'organizationId va message kerak' });
    }

    // Kontekst — tashkilot manbalari
    const ctx = await buildOrgContext(organizationId);

    // AI chaqirish (CEO'ning AI configi yoki global)
    const result = await chatComplete({
      userId: userId || null,
      systemPrompt: ctx.systemPrompt,
      message,
      history: Array.isArray(history) ? history.slice(-6) : [],
      maxTokens: 1500,
    });

    // Chat history saqlash (foydalanuvchi yozuvi va javobi)
    if (userId) {
      await pool.query(
        `INSERT INTO chat_history (user_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
        [userId, message, result.reply]
      ).catch(() => {});
      // AI hisoblagich
      const curMonth = new Date().toISOString().slice(0, 7);
      await pool.query(
        `UPDATE users SET
          ai_requests_used = CASE WHEN ai_requests_month=$2 THEN ai_requests_used+1 ELSE 1 END,
          ai_requests_month = $2
         WHERE id=$1`,
        [userId, curMonth]
      ).catch(() => {});
    }

    res.json({
      ok: true,
      reply: result.reply,
      provider: result.provider,
      model: result.model,
      keySource: result.source,
      sourceCount: ctx.sourceCount,
      summary: ctx.summary,
    });
  } catch (e) {
    console.error('[internal/ai-chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/internal/org-summary?orgId=X — tezkor KPI (sources counts)
router.get('/org-summary', async (req, res) => {
  try {
    const orgId = parseInt(req.query.orgId, 10);
    if (!orgId) return res.status(400).json({ error: 'orgId kerak' });

    const [sources, channels, alerts] = await Promise.all([
      pool.query(
        `SELECT s.type, s.name, sd.row_count
         FROM sources s LEFT JOIN source_data sd ON sd.source_id=s.id
         WHERE s.organization_id=$1 AND s.connected=TRUE AND s.active=TRUE
         ORDER BY s.type`,
        [orgId]
      ),
      pool.query(
        `SELECT title, username, member_count, last_synced_at
         FROM telegram_channels WHERE organization_id=$1 AND active=TRUE`,
        [orgId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS unread
         FROM alerts a
         JOIN users u ON u.id=a.user_id
         WHERE u.organization_id=$1 AND a.read=FALSE`,
        [orgId]
      ),
    ]);

    res.json({
      sources: sources.rows,
      channels: channels.rows,
      unreadAlerts: alerts.rows[0]?.unread || 0,
    });
  } catch (e) {
    console.error('[internal/org-summary]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/internal/build-report
// Body: { organizationId, format, title?, prompt?, userId? }
// Agar `prompt` berilsa — AI matn ham generatsiya qilinadi va hisobotga qo'shiladi.
router.post('/build-report', async (req, res) => {
  try {
    const { organizationId, format, title, prompt, userId } = req.body || {};
    if (!organizationId || !format) return res.status(400).json({ error: 'organizationId va format kerak' });

    let aiText = null;
    if (prompt) {
      try {
        const ctx = await buildOrgContext(organizationId);
        const r = await chatComplete({
          userId: userId || null,
          systemPrompt: ctx.systemPrompt,
          message: prompt,
          maxTokens: 1800,
        });
        aiText = r.reply;
      } catch (e) {
        aiText = `[AI tahlil tayyorlanmadi: ${e.message}]`;
      }
    }

    const { buffer, mime, ext } = await buildReport({ format, organizationId, title, aiText });
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="analix_report.${ext}"`);
    res.send(buffer);
  } catch (e) {
    console.error('[internal/build-report]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/internal/digest-targets — kim uchun dayjest yuborish vaqti keldi (har 5 daq cron tomonidan chaqiriladi)
// Query: nowMin (HH:MM, optional — default server time)
router.get('/digest-targets', async (req, res) => {
  try {
    // Hozirgi soat (Asia/Tashkent default — bot worker scheduler shu zonada)
    const now = req.query.nowMin || new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tashkent', hour12: false }).slice(0, 5);
    // Targetlar: digest_enabled = TRUE, digest_time ±5 daq (asosiy cron 5 daqiqada bir marta ishlaydi)
    const r = await pool.query(
      `SELECT bs.organization_id, bs.digest_time, bs.timezone, bs.quiet_hours_start, bs.quiet_hours_end, bs.enabled_modules,
              bl.chat_id, o.name AS org_name
       FROM telegram_bot_settings bs
       JOIN telegram_bot_links bl ON bl.organization_id = bs.organization_id AND bl.active=TRUE
       JOIN organizations o ON o.id = bs.organization_id
       WHERE bs.digest_enabled = TRUE
         AND bs.digest_time = $1`,
      [now]
    );
    res.json({ now, targets: r.rows });
  } catch (e) {
    console.error('[internal/digest-targets]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
