/**
 * CRM integratsiya endpoint'lari — Bitrix24 + AmoCRM.
 *
 *   POST   /api/crm/bitrix24/test           — webhook URL'ni tekshirish
 *   POST   /api/crm/bitrix24/connect        — manba sifatida ulash
 *   POST   /api/crm/amocrm/test             — token tekshirish
 *   POST   /api/crm/amocrm/connect          — manba sifatida ulash
 *   POST   /api/crm/sync/:sourceId          — manual sync
 *   GET    /api/crm/source-types            — ro'yxat (UI uchun)
 *
 * Sync har source uchun crm.deal/contact/lead'ni source_data jadvaliga jamlaydi.
 */

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const bitrix24 = require('../services/crm/bitrix24');
const amocrm = require('../services/crm/amocrm');
const facebookAds = require('../services/crm/facebookAds');

const router = express.Router();

router.use(requireAuth);

router.get('/source-types', (req, res) => {
  res.json({
    types: [
      {
        id: 'bitrix24',
        name: 'Bitrix24',
        auth: 'webhook_url',
        instructions: "Bitrix24 portal → Dasturchilar → Inbound webhook → CRM ruxsati. URL'ni nusxalab oling.",
      },
      {
        id: 'amocrm',
        name: 'AmoCRM',
        auth: 'subdomain_token',
        instructions: "AmoCRM → Sozlamalar → Integratsiyalar → Long-lived token yoqing.",
      },
      {
        id: 'facebook_ads',
        name: 'Facebook Ads',
        auth: 'token_account',
        instructions: "developers.facebook.com → My Apps → Marketing API → Long-lived token + Ad Account ID (act_XXXXXX).",
      },
    ],
  });
});

router.post('/bitrix24/test', async (req, res) => {
  try {
    const { webhookUrl } = req.body || {};
    if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl majburiy' });
    const r = await bitrix24.testConnection(webhookUrl);
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/bitrix24/connect', async (req, res) => {
  try {
    const { webhookUrl, name } = req.body || {};
    if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl majburiy' });
    await bitrix24.testConnection(webhookUrl); // validate

    const sourceId = `bitrix24_${req.userId}_${Date.now()}`;
    const orgId = req.user.organization_id;
    const safeName = name || 'Bitrix24 CRM';

    await pool.query(
      `INSERT INTO sources (id, user_id, organization_id, type, name, color, connected, active, config)
       VALUES ($1, $2, $3, 'bitrix24', $4, '#4f8efb', TRUE, TRUE, $5)`,
      [sourceId, req.userId, orgId, safeName, JSON.stringify({ webhookUrl })]
    );

    // Birinchi sync — fon vazifasi sifatida (lekin sync funksiyasi sodda)
    syncBitrix24(sourceId, webhookUrl).catch(e => console.error('[crm] init sync fail:', e.message));

    res.json({ ok: true, sourceId, name: safeName });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/amocrm/test', async (req, res) => {
  try {
    const { subdomain, token } = req.body || {};
    if (!subdomain || !token) return res.status(400).json({ error: 'subdomain va token majburiy' });
    const r = await amocrm.testConnection({ subdomain, token });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/amocrm/connect', async (req, res) => {
  try {
    const { subdomain, token, name } = req.body || {};
    if (!subdomain || !token) return res.status(400).json({ error: 'subdomain va token majburiy' });
    await amocrm.testConnection({ subdomain, token });

    const sourceId = `amocrm_${req.userId}_${Date.now()}`;
    const orgId = req.user.organization_id;
    const safeName = name || `AmoCRM (${subdomain})`;

    await pool.query(
      `INSERT INTO sources (id, user_id, organization_id, type, name, color, connected, active, config)
       VALUES ($1, $2, $3, 'amocrm', $4, '#f7a948', TRUE, TRUE, $5)`,
      [sourceId, req.userId, orgId, safeName, JSON.stringify({ subdomain, token })]
    );

    syncAmocrm(sourceId, { subdomain, token }).catch(e => console.error('[crm] init sync fail:', e.message));

    res.json({ ok: true, sourceId, name: safeName });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/facebook_ads/test', async (req, res) => {
  try {
    const { token, accountId } = req.body || {};
    if (!token || !accountId) return res.status(400).json({ error: 'token va accountId majburiy' });
    const r = await facebookAds.testConnection({ token, accountId });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/facebook_ads/connect', async (req, res) => {
  try {
    const { token, accountId, name } = req.body || {};
    if (!token || !accountId) return res.status(400).json({ error: 'token va accountId majburiy' });
    const test = await facebookAds.testConnection({ token, accountId });
    if (!test.ok) return res.status(400).json({ error: test.error || 'Ulanish xatosi' });

    const sourceId = `facebook_ads_${req.userId}_${Date.now()}`;
    const orgId = req.user.organization_id;
    const safeName = name || `Facebook Ads (${test.account?.name || accountId})`;

    await pool.query(
      `INSERT INTO sources (id, user_id, organization_id, type, name, color, connected, active, config)
       VALUES ($1, $2, $3, 'facebook_ads', $4, '#1877F2', TRUE, TRUE, $5)`,
      [sourceId, req.userId, orgId, safeName, JSON.stringify({ token, accountId, account: test.account })]
    );

    syncFacebookAds(sourceId, { token, accountId }).catch(e => console.error('[crm] FB init sync fail:', e.message));

    res.json({ ok: true, sourceId, name: safeName, account: test.account });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/sync/:sourceId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, type, config FROM sources WHERE id=$1 AND organization_id=$2',
      [req.params.sourceId, req.user.organization_id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Manba topilmadi' });
    const src = r.rows[0];
    const cfg = typeof src.config === 'string' ? JSON.parse(src.config) : src.config;

    let result;
    if (src.type === 'bitrix24') {
      result = await syncBitrix24(src.id, cfg.webhookUrl);
    } else if (src.type === 'amocrm') {
      result = await syncAmocrm(src.id, { subdomain: cfg.subdomain, token: cfg.token });
    } else if (src.type === 'facebook_ads') {
      result = await syncFacebookAds(src.id, { token: cfg.token, accountId: cfg.accountId });
    } else {
      return res.status(400).json({ error: `Bu manba turi sync qo'llab-quvvatlamaydi: ${src.type}` });
    }
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Internal sync helpers ──────────────────────────────────────
async function syncBitrix24(sourceId, webhookUrl) {
  const [deals, contacts, leads] = await Promise.all([
    bitrix24.fetchDeals(webhookUrl).catch(() => []),
    bitrix24.fetchContacts(webhookUrl).catch(() => []),
    bitrix24.fetchLeads(webhookUrl).catch(() => []),
  ]);
  // Birlashtirilgan ko'rinish: deal sifatida saqlaymiz (asosiy entity)
  const flat = deals.map(d => ({
    type: 'deal',
    ID: d.ID,
    Title: d.TITLE,
    Stage: d.STAGE_ID,
    Amount: parseFloat(d.OPPORTUNITY) || 0,
    Currency: d.CURRENCY_ID,
    Date: d.DATE_CREATE?.slice(0, 10),
    Closed: d.CLOSED === 'Y',
    AssignedTo: d.ASSIGNED_BY_ID,
  }));
  await pool.query(
    `INSERT INTO source_data (source_id, data, row_count, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
    [sourceId, JSON.stringify(flat), flat.length]
  );
  try {
    const realtime = require('../services/realtime');
    realtime.broadcast('source.updated', { sourceId, type: 'bitrix24', rowCount: flat.length });
  } catch {}
  return { deals: deals.length, contacts: contacts.length, leads: leads.length, rows: flat.length };
}

async function syncAmocrm(sourceId, creds) {
  const [leads, contacts] = await Promise.all([
    amocrm.fetchLeads(creds).catch(() => []),
    amocrm.fetchContacts(creds).catch(() => []),
  ]);
  const flat = leads.map(l => ({
    type: 'lead',
    ID: l.id,
    Title: l.name,
    Status: l.status_id,
    Amount: parseFloat(l.price) || 0,
    Date: l.created_at ? new Date(l.created_at * 1000).toISOString().slice(0, 10) : null,
    Pipeline: l.pipeline_id,
    Responsible: l.responsible_user_id,
  }));
  await pool.query(
    `INSERT INTO source_data (source_id, data, row_count, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
    [sourceId, JSON.stringify(flat), flat.length]
  );
  try {
    const realtime = require('../services/realtime');
    realtime.broadcast('source.updated', { sourceId, type: 'amocrm', rowCount: flat.length });
  } catch {}
  return { leads: leads.length, contacts: contacts.length, rows: flat.length };
}

async function syncFacebookAds(sourceId, creds) {
  const flat = await facebookAds.fetchAll(creds);
  await pool.query(
    `INSERT INTO source_data (source_id, data, row_count, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
    [sourceId, JSON.stringify(flat), flat.length]
  );
  try {
    const realtime = require('../services/realtime');
    realtime.broadcast('source.updated', { sourceId, type: 'facebook_ads', rowCount: flat.length });
  } catch {}
  const campaigns = flat.filter(x => x.type === 'campaign').length;
  const adsets = flat.filter(x => x.type === 'adset').length;
  const ads = flat.filter(x => x.type === 'ad').length;
  return { campaigns, adsets, ads, rows: flat.length };
}

module.exports = router;
