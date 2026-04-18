/**
 * Bot worker'ning ichki HTTP API'si.
 * Faqat Docker network ichidan kirish (backend → bot-worker:3002).
 * Shared secret bilan himoyalangan.
 */
const express = require('express');
const mtproto = require('./services/mtproto');

const SECRET = process.env.BOT_WORKER_INTERNAL_SECRET || '';
const PORT = parseInt(process.env.BOT_WORKER_PORT || '3002', 10);

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Auth middleware
  app.use((req, res, next) => {
    if (!SECRET) {
      return res.status(500).json({ error: 'Bot worker secret konfiguratsiya qilinmagan' });
    }
    if (req.headers['x-internal-secret'] !== SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ── MTProto ──
  app.post('/mtproto/send-code', async (req, res) => {
    try {
      const { organizationId, phone } = req.body;
      if (!organizationId || !phone) return res.status(400).json({ error: 'organizationId va phone kerak' });
      const r = await mtproto.sendCode(organizationId, phone);
      res.json(r);
    } catch (e) {
      console.error('[internal] send-code:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/mtproto/verify', async (req, res) => {
    try {
      const { organizationId, code, password } = req.body;
      if (!organizationId || !code) return res.status(400).json({ error: 'organizationId va code kerak' });
      const r = await mtproto.verifyCode(organizationId, code, password);
      res.json(r);
    } catch (e) {
      if (e.code === 'PASSWORD_REQUIRED') {
        return res.status(409).json({ error: 'PASSWORD_REQUIRED', code: 'PASSWORD_REQUIRED' });
      }
      console.error('[internal] verify:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/mtproto/channels', async (req, res) => {
    try {
      const orgId = parseInt(req.query.organizationId, 10);
      if (!orgId) return res.status(400).json({ error: 'organizationId kerak' });
      const channels = await mtproto.listAdminChannels(orgId);
      res.json({ channels });
    } catch (e) {
      console.error('[internal] channels:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/mtproto/connect-channel', async (req, res) => {
    try {
      const { organizationId, channel } = req.body;
      if (!organizationId || !channel) return res.status(400).json({ error: 'organizationId va channel kerak' });
      const r = await mtproto.connectChannel(organizationId, channel);
      res.json(r);
    } catch (e) {
      console.error('[internal] connect-channel:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/mtproto/sync/:channelDbId', async (req, res) => {
    try {
      const id = parseInt(req.params.channelDbId, 10);
      const r = await mtproto.getChannelStats(id);
      res.json(r);
    } catch (e) {
      console.error('[internal] sync:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/mtproto/disconnect', async (req, res) => {
    try {
      const { organizationId } = req.body;
      const r = await mtproto.disconnectSession(organizationId);
      res.json(r);
    } catch (e) {
      console.error('[internal] disconnect:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  return app;
}

function startInternalApi() {
  const app = makeApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BOT] Internal API tayyor: 0.0.0.0:${PORT}`);
  });
}

module.exports = { startInternalApi };
