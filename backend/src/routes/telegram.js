/**
 * Analix — Telegram Integration Routes
 *
 * Bot ulash (deep-link) va sozlamalar uchun.
 * MTProto qismi (kanal statistika) Phase 2'da qo'shiladi.
 */
const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireCeo } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── Bot username .env dan ──
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'AnalixBot').replace(/^@/, '');

// Default bot_settings — agar yo'q bo'lsa avto-yaratiladi
async function ensureSettings(orgId) {
  await pool.query(
    `INSERT INTO telegram_bot_settings (organization_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [orgId]
  );
}

// ════════════════════════════════════════════════
// GET /api/telegram/status
// Joriy tashkilot uchun bot ulanish holati
// ════════════════════════════════════════════════
router.get('/status', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json({ linked: false });

    const link = await pool.query(
      `SELECT id, chat_id, username, first_name, last_name, language_code, linked_at, last_active_at
       FROM telegram_bot_links
       WHERE organization_id=$1 AND active=TRUE
       LIMIT 1`,
      [orgId]
    );

    res.json({
      botUsername: BOT_USERNAME,
      linked: link.rows.length > 0,
      link: link.rows[0] ? {
        chatId: String(link.rows[0].chat_id),
        username: link.rows[0].username,
        firstName: link.rows[0].first_name,
        lastName: link.rows[0].last_name,
        languageCode: link.rows[0].language_code,
        linkedAt: link.rows[0].linked_at,
        lastActiveAt: link.rows[0].last_active_at,
      } : null,
    });
  } catch (e) {
    console.error('[TG] /status error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════
// POST /api/telegram/link-token
// Deep-link uchun bir martalik token (TTL 10 daq)
// Body: { purpose?: 'bot' | 'channel' }
// Response: { token, url, expiresAt }
// ════════════════════════════════════════════════
router.post('/link-token', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    const purpose = (req.body && req.body.purpose === 'channel') ? 'channel' : 'bot';
    const token = crypto.randomBytes(24).toString('base64url');  // 32 belgi
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);     // 10 daq

    // Eski expired tokenlarni tozalash (best-effort)
    await pool.query(`DELETE FROM telegram_pending_links WHERE expires_at < NOW()`);

    await pool.query(
      `INSERT INTO telegram_pending_links (token, organization_id, user_id, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, orgId, req.userId, purpose, expiresAt]
    );

    const url = purpose === 'channel'
      ? `https://t.me/${BOT_USERNAME}?startchannel=${token}&admin=post_messages`
      : `https://t.me/${BOT_USERNAME}?start=${token}`;

    res.json({ token, url, botUsername: BOT_USERNAME, purpose, expiresAt });
  } catch (e) {
    console.error('[TG] /link-token error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════
// DELETE /api/telegram/bot-link
// Botni uzish (chat_id ni faolsizlantirish)
// ════════════════════════════════════════════════
router.delete('/bot-link', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    await pool.query(
      `UPDATE telegram_bot_links SET active=FALSE WHERE organization_id=$1`,
      [orgId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[TG] DELETE /bot-link error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════
// GET /api/telegram/settings
// ════════════════════════════════════════════════
router.get('/settings', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });

    await ensureSettings(orgId);
    const r = await pool.query(
      `SELECT digest_enabled, digest_time, timezone, quiet_hours_start, quiet_hours_end,
              enabled_modules, anomaly_enabled, anomaly_sensitivity, language, updated_at
       FROM telegram_bot_settings WHERE organization_id=$1`,
      [orgId]
    );
    const s = r.rows[0];
    res.json({
      digestEnabled: s.digest_enabled,
      digestTime: s.digest_time,
      timezone: s.timezone,
      quietHoursStart: s.quiet_hours_start,
      quietHoursEnd: s.quiet_hours_end,
      enabledModules: s.enabled_modules,
      anomalyEnabled: s.anomaly_enabled,
      anomalySensitivity: s.anomaly_sensitivity,
      language: s.language,
      updatedAt: s.updated_at,
    });
  } catch (e) {
    console.error('[TG] /settings GET error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ════════════════════════════════════════════════
// PUT /api/telegram/settings
// ════════════════════════════════════════════════
router.put('/settings', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });
    await ensureSettings(orgId);

    const allowed = ['digestEnabled','digestTime','timezone','quietHoursStart','quietHoursEnd',
      'enabledModules','anomalyEnabled','anomalySensitivity','language'];
    const map = {
      digestEnabled: 'digest_enabled', digestTime: 'digest_time', timezone: 'timezone',
      quietHoursStart: 'quiet_hours_start', quietHoursEnd: 'quiet_hours_end',
      enabledModules: 'enabled_modules', anomalyEnabled: 'anomaly_enabled',
      anomalySensitivity: 'anomaly_sensitivity', language: 'language',
    };
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
      if (k in req.body) {
        const v = req.body[k];
        sets.push(`${map[k]} = $${i++}`);
        params.push(k === 'enabledModules' ? JSON.stringify(v) : v);
      }
    }
    if (!sets.length) return res.json({ ok: true });

    sets.push(`updated_at = NOW()`);
    params.push(orgId);
    await pool.query(
      `UPDATE telegram_bot_settings SET ${sets.join(', ')} WHERE organization_id=$${i}`,
      params
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[TG] /settings PUT error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
