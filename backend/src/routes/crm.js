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
    const { webhookUrl, name, sourceId: existingId } = req.body || {};
    if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl majburiy' });
    await bitrix24.testConnection(webhookUrl); // validate

    const orgId = req.user.organization_id;
    const safeName = name || 'Bitrix24 CRM';
    let sourceId = existingId;

    if (existingId) {
      // Mavjud placeholder source'ni yangilash
      const exists = await pool.query(
        'SELECT id FROM sources WHERE id=$1 AND organization_id=$2',
        [existingId, orgId]
      );
      if (exists.rowCount > 0) {
        await pool.query(
          `UPDATE sources SET type='bitrix24', connected=TRUE, active=TRUE,
                  config=$1, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify({ webhookUrl }), existingId]
        );
      } else {
        sourceId = null; // yangi yaratamiz
      }
    }
    if (!sourceId) {
      sourceId = `bitrix24_${req.userId}_${Date.now()}`;
      await pool.query(
        `INSERT INTO sources (id, user_id, organization_id, type, name, color, connected, active, config)
         VALUES ($1, $2, $3, 'bitrix24', $4, '#4f8efb', TRUE, TRUE, $5)`,
        [sourceId, req.userId, orgId, safeName, JSON.stringify({ webhookUrl })]
      );
    }

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
    const { subdomain, token, name, sourceId: existingId } = req.body || {};
    if (!subdomain || !token) return res.status(400).json({ error: 'subdomain va token majburiy' });
    await amocrm.testConnection({ subdomain, token });

    const orgId = req.user.organization_id;
    const safeName = name || `AmoCRM (${subdomain})`;
    let sourceId = existingId;

    if (existingId) {
      const exists = await pool.query(
        'SELECT id FROM sources WHERE id=$1 AND organization_id=$2',
        [existingId, orgId]
      );
      if (exists.rowCount > 0) {
        await pool.query(
          `UPDATE sources SET type='amocrm', connected=TRUE, active=TRUE,
                  config=$1, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify({ subdomain, token }), existingId]
        );
      } else {
        sourceId = null;
      }
    }
    if (!sourceId) {
      sourceId = `amocrm_${req.userId}_${Date.now()}`;
      await pool.query(
        `INSERT INTO sources (id, user_id, organization_id, type, name, color, connected, active, config)
         VALUES ($1, $2, $3, 'amocrm', $4, '#f7a948', TRUE, TRUE, $5)`,
        [sourceId, req.userId, orgId, safeName, JSON.stringify({ subdomain, token })]
      );
    }

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
    const { token, accountId, name, sourceId: existingId } = req.body || {};
    if (!token || !accountId) return res.status(400).json({ error: 'token va accountId majburiy' });
    const test = await facebookAds.testConnection({ token, accountId });
    if (!test.ok) return res.status(400).json({ error: test.error || 'Ulanish xatosi' });

    const orgId = req.user.organization_id;
    const safeName = name || `Facebook Ads (${test.account?.name || accountId})`;
    let sourceId = existingId;

    if (existingId) {
      const exists = await pool.query(
        'SELECT id FROM sources WHERE id=$1 AND organization_id=$2',
        [existingId, orgId]
      );
      if (exists.rowCount > 0) {
        await pool.query(
          `UPDATE sources SET type='facebook_ads', connected=TRUE, active=TRUE,
                  config=$1, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify({ token, accountId, account: test.account }), existingId]
        );
      } else {
        sourceId = null;
      }
    }
    if (!sourceId) {
      sourceId = `facebook_ads_${req.userId}_${Date.now()}`;
      await pool.query(
        `INSERT INTO sources (id, user_id, organization_id, type, name, color, connected, active, config)
         VALUES ($1, $2, $3, 'facebook_ads', $4, '#1877F2', TRUE, TRUE, $5)`,
        [sourceId, req.userId, orgId, safeName, JSON.stringify({ token, accountId, account: test.account })]
      );
    }

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
  // Barcha entitylarni parallel olib kelish (xato bo'lsa bo'sh array)
  const [leads, contacts, pipelines, users, tasks, notes] = await Promise.all([
    amocrm.fetchLeads(creds).catch(e => { console.warn('[amo] leads:', e.message); return []; }),
    amocrm.fetchContacts(creds).catch(e => { console.warn('[amo] contacts:', e.message); return []; }),
    amocrm.fetchPipelines(creds).catch(e => { console.warn('[amo] pipelines:', e.message); return []; }),
    amocrm.fetchUsers(creds).catch(e => { console.warn('[amo] users:', e.message); return []; }),
    amocrm.fetchTasks(creds).catch(e => { console.warn('[amo] tasks:', e.message); return []; }),
    amocrm.fetchNotes(creds, 'leads').catch(e => { console.warn('[amo] notes:', e.message); return []; }),
  ]);

  // Pipeline + status name'larni topish uchun map
  const stagesById = {};
  const pipelinesById = {};
  for (const p of pipelines) {
    pipelinesById[p.id] = p;
    const statuses = p?._embedded?.statuses || [];
    for (const s of statuses) {
      stagesById[s.id] = {
        name: s.name,
        sort: s.sort,
        color: s.color,
        type: s.type, // 0=normal, 1=won (142), 2=lost (143)
        pipelineId: s.pipeline_id,
        pipelineName: p.name,
      };
    }
  }
  // AmoCRM standart yopiq statuslari
  const WON_STATUS_ID = 142;
  const LOST_STATUS_ID = 143;
  const userMap = {};
  for (const u of users) userMap[u.id] = u.name || u.email;

  // Lead → flat record
  const flatLeads = leads.map(l => {
    const stage = stagesById[l.status_id] || {};
    const isWon = l.status_id === WON_STATUS_ID || stage.type === 1;
    const isLost = l.status_id === LOST_STATUS_ID || stage.type === 2;
    const isClosed = isWon || isLost;
    const cycleHours = (isClosed && l.created_at && l.closed_at)
      ? Math.max(1, Math.round((l.closed_at - l.created_at) / 3600))
      : null;
    const tags = (l._embedded?.tags || []).map(t => t.name).filter(Boolean);
    const lossReason = l._embedded?.loss_reason?.[0]?.name || null;
    const customFields = {};
    for (const cf of (l.custom_fields_values || [])) {
      const key = cf.field_name || cf.field_code || `cf_${cf.field_id}`;
      const vals = (cf.values || []).map(v => v.value).filter(v => v !== undefined && v !== null);
      customFields[key] = vals.length === 1 ? vals[0] : vals;
    }
    const contactId = l._embedded?.contacts?.[0]?.id || null;
    return {
      type: 'lead',
      ID: l.id,
      Title: l.name,
      Stage: l.status_id,
      StageName: stage.name || null,
      StageColor: stage.color || null,
      StageOrder: stage.sort || 0,
      Pipeline: l.pipeline_id,
      PipelineName: stage.pipelineName || pipelinesById[l.pipeline_id]?.name || null,
      Amount: parseFloat(l.price) || 0,
      Currency: l.account_currency || null,
      Date: l.created_at ? new Date(l.created_at * 1000).toISOString().slice(0, 10) : null,
      CreatedAt: l.created_at ? new Date(l.created_at * 1000).toISOString() : null,
      UpdatedAt: l.updated_at ? new Date(l.updated_at * 1000).toISOString() : null,
      ClosedAt: l.closed_at ? new Date(l.closed_at * 1000).toISOString() : null,
      ClosestTaskAt: l.closest_task_at ? new Date(l.closest_task_at * 1000).toISOString() : null,
      CycleHours: cycleHours,
      Closed: isClosed,
      Won: isWon,
      Lost: isLost,
      LossReason: lossReason,
      Responsible: userMap[l.responsible_user_id] || l.responsible_user_id,
      ResponsibleID: l.responsible_user_id,
      ContactID: contactId,
      Tags: tags,
      Score: l.score || null,
      LaborCost: l.labor_cost || 0,
      CustomFields: customFields,
    };
  });

  // Contacts
  const flatContacts = contacts.map(c => {
    const cfMap = {};
    for (const cf of (c.custom_fields_values || [])) {
      const code = cf.field_code || cf.field_name;
      const vals = (cf.values || []).map(v => v.value);
      cfMap[code] = vals.length === 1 ? vals[0] : vals;
    }
    const phones = (c.custom_fields_values || []).find(f => f.field_code === 'PHONE')?.values?.map(v => v.value) || [];
    const emails = (c.custom_fields_values || []).find(f => f.field_code === 'EMAIL')?.values?.map(v => v.value) || [];
    const linkedLeadIds = (c._embedded?.leads || []).map(l => l.id);
    const wonLeads = flatLeads.filter(l => linkedLeadIds.includes(l.ID) && l.Won);
    const totalSpent = wonLeads.reduce((a, l) => a + (l.Amount || 0), 0);
    return {
      type: 'contact',
      ID: c.id,
      Name: c.name,
      FirstName: c.first_name,
      LastName: c.last_name,
      Phones: phones,
      Emails: emails,
      ResponsibleID: c.responsible_user_id,
      Responsible: userMap[c.responsible_user_id] || c.responsible_user_id,
      CreatedAt: c.created_at ? new Date(c.created_at * 1000).toISOString() : null,
      LeadIDs: linkedLeadIds,
      DealsCount: linkedLeadIds.length,
      WonCount: wonLeads.length,
      LTV: totalSpent,
      CustomFields: cfMap,
    };
  });

  // Tasks
  const flatTasks = tasks.map(t => ({
    type: 'task',
    ID: t.id,
    Text: t.text,
    EntityType: t.entity_type, // 'leads'|'contacts'|'companies'
    EntityID: t.entity_id,
    Type: t.task_type_id,
    ResponsibleID: t.responsible_user_id,
    Responsible: userMap[t.responsible_user_id] || t.responsible_user_id,
    CreatedAt: t.created_at ? new Date(t.created_at * 1000).toISOString() : null,
    CompletedAt: t.complete_till ? new Date(t.complete_till * 1000).toISOString() : null,
    IsCompleted: t.is_completed,
    DueAt: t.complete_till ? new Date(t.complete_till * 1000).toISOString() : null,
    Result: t.result?.text || null,
  }));

  // Notes
  const flatNotes = notes.map(n => ({
    type: 'note',
    ID: n.id,
    EntityID: n.entity_id,
    EntityType: 'lead',
    NoteType: n.note_type, // 'common', 'call_in', 'call_out', 'sms_in', etc.
    Text: n.params?.text || n.params?.phone || JSON.stringify(n.params || {}).slice(0, 200),
    Phone: n.params?.phone || null,
    Duration: n.params?.duration || null,
    CreatedAt: n.created_at ? new Date(n.created_at * 1000).toISOString() : null,
    ResponsibleID: n.responsible_user_id,
    Responsible: userMap[n.responsible_user_id] || n.responsible_user_id,
  }));

  // Calls (notes ichidagi call_in/call_out)
  const flatCalls = flatNotes.filter(n =>
    ['call_in', 'call_out'].includes(n.NoteType)
  ).map(n => ({
    type: 'call',
    ID: n.ID,
    LeadID: n.EntityID,
    Direction: n.NoteType === 'call_in' ? 'in' : 'out',
    Duration: n.Duration || 0,
    Phone: n.Phone,
    Result: n.Text,
    CreatedAt: n.CreatedAt,
    Responsible: n.Responsible,
  }));

  // Pipelines + users — meta sifatida saqlaymiz
  const pipelinesMeta = pipelines.map(p => ({
    type: 'pipeline',
    ID: p.id,
    Name: p.name,
    Sort: p.sort,
    IsMain: p.is_main,
    Statuses: (p._embedded?.statuses || []).map(s => ({
      id: s.id, name: s.name, sort: s.sort, color: s.color, type: s.type,
    })),
  }));
  const usersMeta = users.map(u => ({
    type: 'user',
    ID: u.id,
    Name: u.name,
    Email: u.email,
    Lang: u.lang,
    IsAdmin: u.rights?.is_admin || false,
  }));

  const flat = [
    ...flatLeads,
    ...flatContacts,
    ...flatTasks,
    ...flatCalls,
    ...flatNotes.filter(n => !['call_in', 'call_out'].includes(n.NoteType)),
    ...pipelinesMeta,
    ...usersMeta,
  ];

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
  return {
    leads: flatLeads.length,
    contacts: flatContacts.length,
    tasks: flatTasks.length,
    calls: flatCalls.length,
    notes: flatNotes.length - flatCalls.length,
    pipelines: pipelinesMeta.length,
    users: usersMeta.length,
    rows: flat.length,
  };
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
