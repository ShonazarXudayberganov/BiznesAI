/**
 * Analix — Instagram Business Login Integration
 *
 * OAuth flow (Instagram Business Login):
 *   GET /api/instagram/auth?sourceId=X    → api.instagram.com OAuth redirect
 *   GET /api/instagram/callback            → token exchange + sync
 *
 * Data:
 *   POST /api/instagram/sync/:sourceId    → to'liq ma'lumotlarni yangilash
 *   GET  /api/instagram/status/:sourceId  → token holati
 */

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const APP_ID       = process.env.INSTAGRAM_APP_ID;
const APP_SECRET   = process.env.INSTAGRAM_APP_SECRET;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'https://analix.uz/api/instagram/callback';

// Instagram Business Login endpoints (yangi flow)
const IG_AUTH_URL  = 'https://api.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH        = 'https://graph.instagram.com';

// ── Instagram Graph API helper ────────────────────────────────
async function igFetch(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${GRAPH}/${path}${token ? `${sep}access_token=${token}` : ''}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    const msg = data.error.message || 'Instagram API xato';
    const err = new Error(msg);
    err.code = data.error.code;
    throw err;
  }
  return data;
}

// ── Source tekshirish helper ──────────────────────────────────
async function getSource(sourceId, orgId) {
  const r = await pool.query(
    `SELECT id, config, organization_id FROM sources WHERE id=$1 AND organization_id=$2`,
    [sourceId, orgId]
  );
  return r.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────
// GET /api/instagram/auth?sourceId=X
// Foydalanuvchini Instagram OAuth ga yo'naltiradi
// ─────────────────────────────────────────────────────────────
router.get('/auth', requireAuth, async (req, res) => {
  const { sourceId } = req.query;
  if (!sourceId) return res.status(400).json({ error: 'sourceId kerak' });
  if (!APP_ID)   return res.status(500).json({ error: 'INSTAGRAM_APP_ID sozlanmagan' });

  const src = await getSource(sourceId, req.user.organization_id);
  if (!src) return res.status(404).json({ error: 'Manba topilmadi' });

  // CSRF state: random + sourceId
  const state = `${Math.random().toString(36).slice(2)}_${sourceId}`;
  await pool.query(
    `UPDATE sources SET config = COALESCE(config,'{}') || $2::jsonb WHERE id=$1`,
    [sourceId, JSON.stringify({ oauth_state: state, oauth_user: req.userId })]
  );

  // Instagram Business Login scopes (yangi API)
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ].join(',');

  const authUrl =
    `${IG_AUTH_URL}` +
    `?client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`;

  res.redirect(authUrl);
});

// ─────────────────────────────────────────────────────────────
// GET /api/instagram/callback
// Meta qaytgan code ni tokenga almashtiradi va sync boshlaydi
// ─────────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const frontendBase = process.env.FRONTEND_URL || 'https://analix.uz';

  if (error) {
    return res.redirect(`${frontendBase}/?ig_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${frontendBase}/?ig_error=invalid_callback`);
  }

  // State dan sourceId ajratib olish
  const parts = decodeURIComponent(state).split('_');
  const sourceId = parts[parts.length - 1];
  if (!sourceId || isNaN(Number(sourceId))) {
    return res.redirect(`${frontendBase}/?ig_error=invalid_state`);
  }

  try {
    // 1. State verify
    const srcRes = await pool.query(`SELECT config, organization_id FROM sources WHERE id=$1`, [sourceId]);
    if (!srcRes.rows.length) return res.redirect(`${frontendBase}/?ig_error=source_not_found`);
    const saved = srcRes.rows[0].config?.oauth_state;
    if (saved !== decodeURIComponent(state)) {
      return res.redirect(`${frontendBase}/?ig_error=state_mismatch`);
    }

    // 2. Code → Short-lived Token (POST — yangi flow)
    const tokenBody = new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code,
    });
    const tokenRes = await fetch(IG_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    const shortData = await tokenRes.json();
    if (shortData.error_type || shortData.error) {
      throw new Error(shortData.error_message || shortData.error_description || 'Token olishda xato');
    }
    const shortToken = shortData.access_token;
    const igUserId   = String(shortData.user_id);

    // 3. Short → Long-lived Token (60 kun, graph.instagram.com)
    const longData = await igFetch(
      `access_token?grant_type=ig_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&access_token=${shortToken}`
    );
    const longToken = longData.access_token;

    // 4. Config saqlash (oauth_state tozalanadi)
    await pool.query(
      `UPDATE sources SET
        config = COALESCE(config,'{}') || $2::jsonb,
        connected = TRUE,
        updated_at = NOW()
       WHERE id=$1`,
      [sourceId, JSON.stringify({
        token: longToken,
        igBusinessId: igUserId,
        tokenType: 'long-lived',
        tokenExtendedAt: Date.now(),
        oauth_state: null,
        lastSync: null,
      })]
    );

    // 5. Background sync
    syncInstagramData(sourceId, longToken, igUserId)
      .catch(e => console.error('[IG SYNC]', sourceId, e.message));

    res.redirect(`${frontendBase}/?ig_connected=1&sourceId=${sourceId}`);
  } catch (e) {
    console.error('[IG CALLBACK]', e.message);
    res.redirect(`${frontendBase}/?ig_error=${encodeURIComponent(e.message.slice(0, 120))}`);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/instagram/sync/:sourceId
// ─────────────────────────────────────────────────────────────
router.post('/sync/:sourceId', requireAuth, async (req, res) => {
  const src = await getSource(req.params.sourceId, req.user.organization_id);
  if (!src) return res.status(404).json({ error: 'Manba topilmadi' });

  const { token, igBusinessId } = src.config || {};
  if (!token)         return res.status(400).json({ error: 'Token yo\'q. Instagram qayta ulang.' });
  if (!igBusinessId)  return res.status(400).json({ error: 'Instagram User ID yo\'q.' });

  res.json({ ok: true, message: 'Sync boshlandi, biroz kuting...' });
  syncInstagramData(src.id, token, igBusinessId)
    .catch(e => console.error('[IG SYNC]', src.id, e.message));
});

// ─────────────────────────────────────────────────────────────
// GET /api/instagram/status/:sourceId
// ─────────────────────────────────────────────────────────────
router.get('/status/:sourceId', requireAuth, async (req, res) => {
  const src = await getSource(req.params.sourceId, req.user.organization_id);
  if (!src) return res.status(404).json({ error: 'Manba topilmadi' });

  const cfg = src.config || {};
  if (!cfg.token) return res.json({ connected: false });

  try {
    const me = await igFetch(`v21.0/me?fields=id,username,name`, cfg.token);
    res.json({
      connected: true,
      tokenType: cfg.tokenType || 'unknown',
      tokenExtendedAt: cfg.tokenExtendedAt,
      igBusinessId: cfg.igBusinessId,
      lastSync: cfg.lastSync,
      username: me.username || '',
      metaUser: me.name || me.username || me.id,
    });
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SYNC — barcha Instagram ma'lumotlarini yuklaydi
// graph.instagram.com API orqali
// ─────────────────────────────────────────────────────────────
async function syncInstagramData(sourceId, token, igUserId) {
  console.log(`[IG SYNC] sourceId=${sourceId} igUserId=${igUserId}`);
  const t  = token;
  const id = igUserId; // /me yoki /{id} — ikkalasi ham ishlaydi

  // ── 1. Profil ──
  const profile = await igFetch(
    `v21.0/me?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website`, t
  );

  // ── 2. Postlar + har post uchun insights ──
  let posts = [];
  try {
    let rawPosts = [];
    try {
      const m = await igFetch(`v21.0/me/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=50`, t);
      rawPosts = m.data || [];
    } catch {
      const m2 = await igFetch(`v21.0/me/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=50`, t);
      rawPosts = m2.data || [];
    }

    for (const p of rawPosts) {
      let reach = 0, impressions = 0, saved = 0, shares = 0, plays = 0;
      try {
        const isVideo = p.media_type === 'VIDEO';
        const isReel  = p.media_product_type === 'REELS';
        const metrics = (isVideo || isReel) ? 'reach,saved,shares,plays' : 'reach,saved,shares';
        const ins = await igFetch(`v21.0/${p.id}/insights?metric=${metrics}`, t);
        for (const m of (ins.data || [])) {
          const val = m.values?.[0]?.value || m.total_value?.value || 0;
          if (m.name === 'reach')                         reach       = val;
          if (m.name === 'impressions')                   impressions = val;
          if (m.name === 'saved' || m.name === 'saves')  saved       = val;
          if (m.name === 'shares')                        shares      = val;
          if (m.name === 'plays' || m.name === 'video_views') plays  = val;
        }
      } catch { /* insights ruxsatsiz bo'lishi mumkin */ }

      const postType = p.media_product_type === 'REELS' ? 'REEL' : p.media_type;
      const engagement = (p.like_count || 0) + (p.comments_count || 0) + saved + shares;
      posts.push({
        id: p.id,
        caption: (p.caption || '').substring(0, 200),
        type: postType,
        date: p.timestamp?.slice(0, 10) || '',
        time: p.timestamp?.slice(11, 16) || '',
        likes: p.like_count || 0,
        comments: p.comments_count || 0,
        reach, impressions, saved, shares, plays, engagement,
        engRate: profile.followers_count > 0
          ? +((engagement / profile.followers_count) * 100).toFixed(2) : 0,
        url: p.permalink || '',
      });
      await new Promise(r => setTimeout(r, 150));
    }
  } catch (e) { console.warn('[IG SYNC] posts:', e.message); }

  // ── 3. Profil insights (30 kunlik) ──
  let profileInsights = {};
  let dailyReach = [], dailyImpressions = [];
  try {
    const d30  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const metrics = ['reach','impressions','accounts_engaged','total_interactions',
                     'likes','comments','shares','saves','replies','follower_count'];
    for (const metric of metrics) {
      try {
        const pIns = await igFetch(
          `v21.0/${id}/insights?metric=${metric}&period=day&metric_type=total_value&since=${d30}&until=${today}`, t
        );
        for (const m of (pIns.data || [])) {
          const entries = (m.values || []).map(v => ({
            date: (v.end_time || '').slice(0, 10),
            value: typeof v.value === 'object'
              ? Object.values(v.value).reduce((a, b) => a + b, 0)
              : (v.value || 0),
          }));
          const vals  = entries.map(e => e.value);
          const total = vals.reduce((a, b) => a + b, 0);
          profileInsights[m.name] = { total, avg: vals.length ? Math.round(total / vals.length) : 0, daily: entries };
          if (m.name === 'reach')       dailyReach       = entries;
          if (m.name === 'impressions') dailyImpressions = entries;
        }
      } catch { }
    }
  } catch { }

  // ── 4. Online followers ──
  let onlineFollowers = {};
  try {
    const onl = await igFetch(`v21.0/${id}/insights?metric=online_followers&period=lifetime`, t);
    for (const m of (onl.data || [])) {
      const val = m.values?.[0]?.value || {};
      if (typeof val === 'object') onlineFollowers = val;
    }
  } catch { }

  // ── 5. Audience demographics ──
  let audience = {};
  try {
    for (const metric of ['follower_demographics','reached_audience_demographics','engaged_audience_demographics']) {
      for (const breakdown of ['country','city','age','gender','age,gender']) {
        try {
          const r = await igFetch(
            `v21.0/${id}/insights?metric=${metric}&period=lifetime&metric_type=total_value&breakdown=${breakdown}`, t
          );
          for (const m of (r.data || [])) {
            const val = m.total_value?.breakdowns?.[0]?.results || [];
            if (Array.isArray(val)) {
              const obj = {};
              val.forEach(x => { obj[x.dimension_values?.join(' ') || 'unknown'] = x.value || 0; });
              audience[`${metric}_${breakdown.replace(',', '_')}`] = obj;
            }
          }
        } catch { }
      }
    }
  } catch { }

  // ── 6. Stories ──
  let stories = [];
  try {
    const sRes = await igFetch(`v21.0/${id}/stories?fields=id,media_type,timestamp,permalink`, t);
    for (const s of (sRes.data || [])) {
      let sReach = 0, sImpressions = 0, sReplies = 0, sExits = 0, sTaps = 0;
      try {
        const sIns = await igFetch(`v21.0/${s.id}/insights?metric=reach,impressions,replies,exits,taps_forward,taps_back`, t);
        for (const m of (sIns.data || [])) {
          const val = m.values?.[0]?.value || 0;
          if (m.name === 'reach')                             sReach       = val;
          if (m.name === 'impressions')                       sImpressions = val;
          if (m.name === 'replies')                           sReplies     = val;
          if (m.name === 'exits')                             sExits       = val;
          if (m.name === 'taps_forward' || m.name === 'taps_back') sTaps += val;
        }
      } catch { }
      stories.push({
        _type: 'STORY', id: s.id, type: s.media_type,
        date: s.timestamp?.slice(0, 10) || '',
        reach: sReach, impressions: sImpressions,
        replies: sReplies, exits: sExits, taps: sTaps,
      });
      await new Promise(r => setTimeout(r, 150));
    }
  } catch { }

  // ── 7. Statistika hisoblash ──
  const tl = (k) => posts.reduce((a, p) => a + (p[k] || 0), 0);
  const totalLikes      = tl('likes');
  const totalComments   = tl('comments');
  const totalReach      = tl('reach');
  const totalImpressions= tl('impressions');
  const totalSaved      = tl('saved');
  const totalShares     = tl('shares');
  const totalPlays      = tl('plays');
  const totalEngagement = totalLikes + totalComments + totalSaved + totalShares;
  const avg = (k) => posts.length ? Math.round(tl(k) / posts.length) : 0;

  const piReachTotal  = profileInsights.reach?.total || totalReach;
  const piImpTotal    = profileInsights.impressions?.total || totalImpressions;
  const piReachDaily  = profileInsights.reach?.daily || [];
  const piImpDaily    = profileInsights.impressions?.daily || [];
  const halfLen       = Math.floor(piReachDaily.length / 2);
  const rFirst  = piReachDaily.slice(0, halfLen).reduce((a,d) => a + d.value, 0);
  const rSecond = piReachDaily.slice(halfLen).reduce((a,d) => a + d.value, 0);
  const reachChange = rFirst > 0 ? +((rSecond - rFirst) / rFirst * 100).toFixed(1) : 0;
  const iFirst  = piImpDaily.slice(0, halfLen).reduce((a,d) => a + d.value, 0);
  const iSecond = piImpDaily.slice(halfLen).reduce((a,d) => a + d.value, 0);
  const impChange = iFirst > 0 ? +((iSecond - iFirst) / iFirst * 100).toFixed(1) : 0;

  const followerDaily     = profileInsights.follower_count?.daily || [];
  const followerFirst     = followerDaily[0]?.value || 0;
  const followerLast      = followerDaily[followerDaily.length - 1]?.value || profile.followers_count || 0;
  const followerGrowth    = followerFirst > 0 ? followerLast - followerFirst : 0;
  const followerGrowthPct = followerFirst > 0 ? +((followerGrowth / followerFirst) * 100).toFixed(1) : 0;
  const sortedPosts = [...posts].sort((a, b) => (b.reach || 0) - (a.reach || 0));
  const topPost     = sortedPosts[0];
  const typeCount   = posts.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {});

  // ── 8. Summary object ──
  const summary = {
    _type: 'PROFIL_STATISTIKA',
    username: profile.username,
    name: profile.name || '',
    biography: (profile.biography || '').substring(0, 200),
    profile_picture_url: profile.profile_picture_url || '',
    website: profile.website || '',
    followers_count: profile.followers_count || 0,
    follows_count: profile.follows_count || 0,
    total_posts: profile.media_count || 0,
    fetched_posts: posts.length,
    post_types: typeCount,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_reach: totalReach,
    total_impressions: totalImpressions,
    total_saved: totalSaved,
    total_shares: totalShares,
    total_plays: totalPlays,
    total_engagement: totalEngagement,
    avg_likes_per_post: avg('likes'),
    avg_comments_per_post: avg('comments'),
    avg_reach_per_post: avg('reach'),
    avg_impressions_per_post: avg('impressions'),
    engagement_rate: profile.followers_count > 0 && posts.length > 0
      ? +((totalEngagement / posts.length / profile.followers_count) * 100).toFixed(2) : 0,
    engagement_rate_str: profile.followers_count > 0 && posts.length > 0
      ? ((totalEngagement / posts.length / profile.followers_count) * 100).toFixed(1) + '%' : '0%',
    profile_insights: profileInsights,
    daily_reach: dailyReach,
    daily_impressions: dailyImpressions,
    reach_30d: piReachTotal,
    impressions_30d: piImpTotal,
    reach_change_pct: reachChange,
    impressions_change_pct: impChange,
    follower_growth: followerGrowth,
    follower_growth_pct: followerGrowthPct,
    follower_daily: followerDaily,
    online_followers: onlineFollowers,
    audience,
    top_cities: audience.follower_demographics_city
      ? Object.entries(audience.follower_demographics_city).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([n,v])=>({name:n,value:v}))
      : [],
    top_countries: audience.follower_demographics_country
      ? Object.entries(audience.follower_demographics_country).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,v])=>({name:n,value:v}))
      : [],
    stories_count: stories.length,
    stories_data: stories,
    top_post_caption: topPost?.caption || '—',
    top_post_engagement: topPost?.engagement || 0,
    last_updated: new Date().toISOString(),
  };

  // ── 9. DB ga saqlash ──
  const data = [summary, ...stories, ...posts];
  await pool.query(
    `INSERT INTO source_data (source_id, data, row_count, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
    [sourceId, JSON.stringify(data), data.length]
  );

  await pool.query(
    `UPDATE sources SET
      connected = TRUE,
      config = COALESCE(config,'{}') || $2::jsonb,
      updated_at = NOW()
     WHERE id=$1`,
    [sourceId, JSON.stringify({ lastSync: new Date().toISOString() })]
  );

  console.log(`[IG SYNC] ✓ sourceId=${sourceId} @${profile.username} — ${posts.length} post, ${stories.length} story`);
  return summary;
}

// ────────────────────────────────────────────────────────────
// COMPETITOR ANALYSIS (Variant A — snapshot tracker)
// ────────────────────────────────────────────────────────────
const igCompetitor = require('../services/instagramCompetitor');

// GET /api/instagram/competitors?source_id=X — bitta profil uchun ro'yxat
router.get('/competitors', requireAuth, async (req, res) => {
  try {
    const sourceId = req.query.source_id ? Number(req.query.source_id) : null;
    const params = [req.userId];
    let where = 'c.user_id = $1';
    if (sourceId) {
      params.push(sourceId);
      where += ' AND c.source_id = $2';
    } else {
      where += ' AND c.source_id IS NULL';
    }
    const r = await pool.query(
      `SELECT c.id, c.source_id, c.username, c.added_at, c.last_synced_at, c.notes,
              s.followers, s.posts_count, s.bio, s.recent_posts, s.hashtags, s.meta, s.snapshot_date
       FROM instagram_competitors c
       LEFT JOIN LATERAL (
         SELECT * FROM instagram_competitor_snapshots
         WHERE competitor_id = c.id
         ORDER BY snapshot_date DESC LIMIT 1
       ) s ON true
       WHERE ${where}
       ORDER BY c.added_at DESC`,
      params
    );
    res.json({ ok: true, competitors: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/instagram/competitors — qo'shish (avtomatik birinchi snapshot)
router.post('/competitors', requireAuth, async (req, res) => {
  try {
    const { username, source_id } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username kerak' });
    const clean = String(username).trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/i.test(clean)) {
      return res.status(400).json({ error: 'Noto\'g\'ri username format' });
    }
    const sourceId = source_id ? Number(source_id) : null;
    // Per-source dedup tekshiruv (NULL bo'lsa global dedup)
    const existing = await pool.query(
      sourceId
        ? `SELECT id FROM instagram_competitors WHERE user_id=$1 AND source_id=$2 AND username=$3`
        : `SELECT id FROM instagram_competitors WHERE user_id=$1 AND source_id IS NULL AND username=$2`,
      sourceId ? [req.userId, sourceId, clean] : [req.userId, clean]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Bu raqobatchi allaqachon qo\'shilgan' });
    }
    const ins = await pool.query(
      `INSERT INTO instagram_competitors (user_id, source_id, username) VALUES ($1, $2, $3)
       RETURNING id, username, source_id, added_at`,
      [req.userId, sourceId, clean]
    );
    if (ins.rows.length === 0) {
      return res.status(409).json({ error: 'Bu raqobatchi allaqachon qo\'shilgan' });
    }
    const competitor = ins.rows[0];
    // Birinchi snapshot — fon vazifasi sifatida
    igCompetitor.collectSnapshot(clean, req.userId, req.user.organization_id)
      .then(r => {
        if (r.ok) return igCompetitor.saveSnapshot(competitor.id, r.snapshot);
      })
      .catch(e => console.warn('[IG-COMP] Birinchi snapshot xato:', e.message));
    res.json({ ok: true, competitor });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/instagram/competitors/:id
router.delete('/competitors/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM instagram_competitors WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/instagram/competitors/:id/refresh — manual snapshot
router.post('/competitors/:id/refresh', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, username FROM instagram_competitors WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Raqobatchi topilmadi' });
    const c = r.rows[0];
    const result = await igCompetitor.collectSnapshot(c.username, req.userId, req.user.organization_id);
    if (!result.ok) {
      return res.status(502).json({ error: result.error || 'Snapshot xatosi' });
    }
    await igCompetitor.saveSnapshot(c.id, result.snapshot);
    res.json({ ok: true, snapshot: result.snapshot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/instagram/competitors/:id/history — 30 kunlik trend
router.get('/competitors/:id/history', requireAuth, async (req, res) => {
  try {
    const own = await pool.query(
      'SELECT 1 FROM instagram_competitors WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    if (own.rowCount === 0) return res.status(404).json({ error: 'Raqobatchi topilmadi' });
    const r = await pool.query(
      `SELECT snapshot_date, followers, following, posts_count, last_post_date
       FROM instagram_competitor_snapshots
       WHERE competitor_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 90`,
      [req.params.id]
    );
    res.json({ ok: true, history: r.rows.reverse() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.syncInstagramData = syncInstagramData;
