/**
 * Facebook Ads (Meta Marketing API) integratsiya.
 *
 * Foydalanuvchi:
 *   1. https://developers.facebook.com → My Apps → Create app
 *   2. Add Marketing API product
 *   3. Tools → Access Token Tool → "Get Long-Lived Token" (60 kun)
 *      yoki System User → Permanent token
 *   4. Ad Account ID: Business Manager → Ad Accounts → ID (act_XXXXXX)
 *   5. Required permissions: ads_read, business_management
 *
 * API endpoints:
 *   GET /act_{id}/campaigns?fields=id,name,status,objective,daily_budget,...
 *   GET /act_{id}/insights?level=campaign&date_preset=last_30d&fields=spend,impressions,reach,clicks,actions,...
 *   GET /act_{id}/adsets
 *   GET /act_{id}/ads
 */

const API_VERSION = 'v22.0';
const API_BASE = `https://graph.facebook.com/${API_VERSION}`;

function cleanAccountId(id) {
  if (!id) return '';
  let s = String(id).trim();
  if (!s.startsWith('act_')) s = 'act_' + s;
  return s;
}

async function callFb({ token, accountId }, path, params = {}) {
  if (!token) throw new Error('Facebook Ads: token kerak');
  const acc = cleanAccountId(accountId);
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const url = `${API_BASE}/${acc}${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    let msg = t.slice(0, 250);
    try {
      const j = JSON.parse(t);
      msg = j?.error?.message || msg;
    } catch {}
    throw new Error(`FB Ads ${path}: HTTP ${res.status} — ${msg}`);
  }
  return await res.json();
}

async function callFbRaw({ token }, path, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString();
  const url = `${API_BASE}${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`FB ${path}: HTTP ${res.status} — ${t.slice(0, 200)}`);
  }
  return await res.json();
}

async function testConnection({ token, accountId }) {
  if (!token) return { ok: false, error: 'Token bo\'sh' };
  if (!accountId) return { ok: false, error: 'Ad Account ID bo\'sh' };
  try {
    const acc = cleanAccountId(accountId);
    const data = await callFb({ token, accountId: acc }, '', { fields: 'id,name,currency,account_status,timezone_name' });
    return {
      ok: true,
      account: {
        id: data.id,
        name: data.name,
        currency: data.currency,
        status: data.account_status,
        timezone: data.timezone_name,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchCampaigns(creds) {
  const fields = ['id', 'name', 'status', 'effective_status', 'objective',
    'daily_budget', 'lifetime_budget', 'budget_remaining', 'created_time', 'start_time', 'stop_time']
    .join(',');
  const data = await callFb(creds, '/campaigns', { fields, limit: 100 });
  return (data?.data || []).map(c => ({
    type: 'campaign',
    ID: c.id,
    Title: c.name,
    Status: c.status,
    EffectiveStatus: c.effective_status,
    Objective: c.objective,
    DailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : 0,
    LifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : 0,
    BudgetRemaining: c.budget_remaining ? Number(c.budget_remaining) / 100 : 0,
    CreatedAt: c.created_time,
    StartTime: c.start_time,
    StopTime: c.stop_time,
  }));
}

/**
 * Insights — 30 kunlik metrikalar (impressions/reach/spend/clicks/conversions).
 * Har campaign uchun.
 */
async function fetchInsights(creds, level = 'campaign') {
  const fields = [
    'campaign_id', 'campaign_name', 'spend', 'impressions', 'reach', 'clicks',
    'cpm', 'cpc', 'ctr', 'frequency', 'actions', 'action_values',
    'video_p25_watched_actions', 'video_p50_watched_actions',
    'video_p75_watched_actions', 'video_p100_watched_actions',
    'video_3_sec_watched_actions',
  ].join(',');
  const data = await callFb(creds, '/insights', {
    level,
    date_preset: 'last_30d',
    fields,
    limit: 200,
  });
  return (data?.data || []).map(r => {
    const conversions = (r.actions || []).filter(a =>
      a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
      a.action_type === 'purchase' ||
      a.action_type === 'lead'
    ).reduce((a, b) => a + Number(b.value || 0), 0);
    const revenue = (r.action_values || []).filter(a =>
      a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
      a.action_type === 'purchase'
    ).reduce((a, b) => a + Number(b.value || 0), 0);
    const v3sec = (r.video_3_sec_watched_actions || [])[0]?.value || 0;
    const v25 = (r.video_p25_watched_actions || [])[0]?.value || 0;
    const v50 = (r.video_p50_watched_actions || [])[0]?.value || 0;
    const v75 = (r.video_p75_watched_actions || [])[0]?.value || 0;
    const v100 = (r.video_p100_watched_actions || [])[0]?.value || 0;
    return {
      type: 'insight',
      CampaignID: r.campaign_id,
      CampaignName: r.campaign_name,
      Spend: Number(r.spend || 0),
      Impressions: Number(r.impressions || 0),
      Reach: Number(r.reach || 0),
      Clicks: Number(r.clicks || 0),
      CPM: Number(r.cpm || 0),
      CPC: Number(r.cpc || 0),
      CTR: Number(r.ctr || 0),
      Frequency: Number(r.frequency || 0),
      Conversions: conversions,
      Revenue: revenue,
      ROAS: revenue && r.spend ? +(revenue / Number(r.spend)).toFixed(2) : 0,
      VideoViews_3sec: Number(v3sec),
      VideoViews_25: Number(v25),
      VideoViews_50: Number(v50),
      VideoViews_75: Number(v75),
      VideoViews_100: Number(v100),
    };
  });
}

async function fetchAdsets(creds) {
  const fields = 'id,name,campaign_id,status,daily_budget,targeting,optimization_goal,billing_event';
  const data = await callFb(creds, '/adsets', { fields, limit: 100 });
  return (data?.data || []).map(a => ({
    type: 'adset',
    ID: a.id,
    Title: a.name,
    CampaignID: a.campaign_id,
    Status: a.status,
    DailyBudget: a.daily_budget ? Number(a.daily_budget) / 100 : 0,
    OptimizationGoal: a.optimization_goal,
    BillingEvent: a.billing_event,
    Targeting: a.targeting || {},
  }));
}

async function fetchAds(creds) {
  const fields = 'id,name,adset_id,campaign_id,status,creative{id,thumbnail_url,object_type}';
  const data = await callFb(creds, '/ads', { fields, limit: 200 });
  return (data?.data || []).map(a => ({
    type: 'ad',
    ID: a.id,
    Title: a.name,
    AdsetID: a.adset_id,
    CampaignID: a.campaign_id,
    Status: a.status,
    Creative: a.creative || {},
  }));
}

async function fetchAll(creds) {
  // Parallel fetch — har biri xato bo'lsa bo'sh array qaytaradi
  const [campaigns, insights, adsets, ads] = await Promise.all([
    fetchCampaigns(creds).catch(e => { console.warn('[FB] campaigns:', e.message); return []; }),
    fetchInsights(creds, 'campaign').catch(e => { console.warn('[FB] insights:', e.message); return []; }),
    fetchAdsets(creds).catch(e => { console.warn('[FB] adsets:', e.message); return []; }),
    fetchAds(creds).catch(e => { console.warn('[FB] ads:', e.message); return []; }),
  ]);

  // Insights'ni campaigns'ga merge qilish
  const insightsByCamp = {};
  for (const ins of insights) insightsByCamp[ins.CampaignID] = ins;
  const enrichedCampaigns = campaigns.map(c => ({
    ...c,
    ...(insightsByCamp[c.ID] || {}),
    type: 'campaign', // override
  }));

  return [...enrichedCampaigns, ...adsets, ...ads];
}

module.exports = { callFb, testConnection, fetchCampaigns, fetchInsights, fetchAdsets, fetchAds, fetchAll };
