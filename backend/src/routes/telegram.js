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

// ── Bot worker internal API ──
const BOT_WORKER_URL = process.env.BOT_WORKER_URL || 'http://bot-worker:3002';
const BOT_WORKER_SECRET = process.env.BOT_WORKER_INTERNAL_SECRET || '';

async function callWorker(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': BOT_WORKER_SECRET,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(`${BOT_WORKER_URL}${path}`, opts);
  } catch (e) {
    throw new Error('Bot worker bilan aloqa yo\'q');
  }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || `Worker xatosi (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

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

// ════════════════════════════════════════════════
// MTProto — kanal statistikasi
// ════════════════════════════════════════════════

// GET /api/telegram/mtproto/status
router.get('/mtproto/status', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json({ connected: false });

    const sess = await pool.query(
      `SELECT id, phone, account_name, status, last_used_at, created_at
       FROM telegram_mtproto_sessions
       WHERE organization_id=$1 AND status='active'
       ORDER BY id DESC LIMIT 1`,
      [orgId]
    );
    const channels = await pool.query(
      `SELECT id, channel_id, username, title, member_count, last_synced_at, active
       FROM telegram_channels
       WHERE organization_id=$1 AND active=TRUE
       ORDER BY title`,
      [orgId]
    );

    res.json({
      connected: sess.rows.length > 0,
      session: sess.rows[0] ? {
        id: sess.rows[0].id,
        phone: sess.rows[0].phone,
        accountName: sess.rows[0].account_name,
        lastUsedAt: sess.rows[0].last_used_at,
        createdAt: sess.rows[0].created_at,
      } : null,
      channels: channels.rows.map(c => ({
        id: c.id,
        channelId: String(c.channel_id),
        username: c.username,
        title: c.title,
        memberCount: c.member_count,
        lastSyncedAt: c.last_synced_at,
      })),
    });
  } catch (e) {
    console.error('[TG] /mtproto/status error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// POST /api/telegram/mtproto/send-code
// Body: { phone }
router.post('/mtproto/send-code', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });
    const { phone } = req.body || {};
    const r = await callWorker('POST', '/mtproto/send-code', { organizationId: orgId, phone });
    res.json(r);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message, code: e.code });
  }
});

// POST /api/telegram/mtproto/verify
// Body: { code, password? }
router.post('/mtproto/verify', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { code, password } = req.body || {};
    const r = await callWorker('POST', '/mtproto/verify', { organizationId: orgId, code, password });
    res.json(r);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message, code: e.code });
  }
});

// GET /api/telegram/mtproto/admin-channels — login akkauntning admin kanallari
router.get('/mtproto/admin-channels', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const r = await callWorker('GET', `/mtproto/channels?organizationId=${orgId}`);
    res.json(r);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// POST /api/telegram/mtproto/connect-channel
// Body: { channel: { channelId, username, title, memberCount } }
router.post('/mtproto/connect-channel', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const r = await callWorker('POST', '/mtproto/connect-channel', { organizationId: orgId, channel: req.body.channel });
    res.json(r);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// POST /api/telegram/mtproto/sync/:channelDbId — qo'lda sync
router.post('/mtproto/sync/:channelDbId', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = parseInt(req.params.channelDbId, 10);
    // tekshiramiz: bu kanal joriy tashkilotniki ekanini
    const own = await pool.query(
      `SELECT 1 FROM telegram_channels WHERE id=$1 AND organization_id=$2`,
      [id, orgId]
    );
    if (own.rows.length === 0) return res.status(404).json({ error: 'Kanal topilmadi' });
    const r = await callWorker('POST', `/mtproto/sync/${id}`);
    res.json(r);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// DELETE /api/telegram/mtproto — sessionni va kanallarni uzish
router.delete('/mtproto', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const r = await callWorker('POST', '/mtproto/disconnect', { organizationId: orgId });
    res.json(r);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// DELETE /api/telegram/mtproto/channel/:id — bitta kanalni o'chirish
router.delete('/mtproto/channel/:id', requireCeo, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = parseInt(req.params.id, 10);
    await pool.query(
      `UPDATE telegram_channels SET active=FALSE WHERE id=$1 AND organization_id=$2`,
      [id, orgId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// GET /api/telegram/mtproto/channel/:id/stats — kanal statistikasi (frontend dashboard)
router.get('/mtproto/channel/:id/stats', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = parseInt(req.params.id, 10);
    const ch = await pool.query(
      `SELECT id, title, username, member_count FROM telegram_channels
       WHERE id=$1 AND organization_id=$2`,
      [id, orgId]
    );
    if (ch.rows.length === 0) return res.status(404).json({ error: 'Kanal topilmadi' });
    const series = await pool.query(
      `SELECT date, members, views_total, shares_total, reactions_total
       FROM telegram_channel_stats_daily
       WHERE channel_id=$1
       ORDER BY date DESC LIMIT 90`,
      [id]
    );
    res.json({
      channel: ch.rows[0],
      series: series.rows.reverse(),
    });
  } catch (e) {
    console.error('[TG] /mtproto/channel/:id/stats error:', e.message);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
