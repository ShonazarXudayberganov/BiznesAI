/**
 * Instagram raqobatchi snapshot collector — Meta Business Discovery API.
 *
 * Sizning IG Business token bilan har qanday Business/Creator profilni
 * RASMIY API orqali tahlil qiladi. Web search emas — Meta'ning o'zi.
 *
 * API: https://graph.facebook.com/v21.0/{ig-user-id}?fields=business_discovery.username({competitor}){...}
 *
 * Cheklovlar (Meta):
 *   - Maqsadli profil Business yoki Creator akkaunt bo'lishi shart (Personal emas)
 *   - Sizning IG ham Business bo'lishi shart
 *   - Hisoblovchi cheklovi: 200 chaqiruv/soat/IG akkaunt
 */

const pool = require('../db/pool');

const GRAPH = 'https://graph.instagram.com';
const FB_GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Foydalanuvchining birinchi Instagram source'ini topadi (token + igBusinessId).
 */
async function getInstagramCredentials(userId, sourceId = null) {
  let query, params;
  if (sourceId) {
    query = `SELECT config FROM sources WHERE id=$1 AND user_id=$2 AND type='instagram' LIMIT 1`;
    params = [sourceId, userId];
  } else {
    query = `SELECT config FROM sources WHERE user_id=$1 AND type='instagram' AND connected=TRUE ORDER BY created_at DESC LIMIT 1`;
    params = [userId];
  }
  const r = await pool.query(query, params);
  if (r.rowCount === 0) return null;
  const cfg = typeof r.rows[0].config === 'string' ? JSON.parse(r.rows[0].config) : r.rows[0].config;
  if (!cfg?.token || !cfg?.igBusinessId) return null;
  return { token: cfg.token, igBusinessId: cfg.igBusinessId };
}

/**
 * Business Discovery API — raqobatchi profil ma'lumotini olish.
 * Maqsadli profil Business yoki Creator bo'lishi shart.
 */
async function fetchViaBusinessDiscovery({ token, igBusinessId }, username) {
  const cleanUsername = String(username).trim().replace(/^@/, '');
  const fields = [
    'id',
    'username',
    'name',
    'biography',
    'website',
    'followers_count',
    'follows_count',
    'media_count',
    'profile_picture_url',
    'media.limit(12){id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count}',
  ].join(',');
  // Endpoint: graph.instagram.com (IG Business API)
  const url = `${GRAPH}/${igBusinessId}?fields=business_discovery.username(${cleanUsername}){${fields}}&access_token=${token}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    const reason = e?.cause?.code || e?.message;
    throw new Error(`Network: ${reason}`);
  }
  const data = await res.json();
  if (data.error) {
    const code = data.error.code;
    const sub = data.error.error_subcode;
    if (code === 110 || sub === 33) {
      throw new Error(`Profil topilmadi yoki Business/Creator emas: @${cleanUsername}. Faqat Business yoki Creator akkauntlar tahlil qilinadi (Personal emas).`);
    }
    if (code === 190) {
      throw new Error('Instagram token muddati tugagan — Manbalar sahifasida Instagram\'ni qayta ulang.');
    }
    if (code === 100 && data.error.message?.includes('Unsupported get request')) {
      throw new Error(`Profil mavjud emas: @${cleanUsername}. To'g'ri username yozing.`);
    }
    throw new Error(`Meta API: ${data.error.message || 'noma\'lum xato'}`);
  }
  return data?.business_discovery || null;
}

/**
 * Hashtag'larni keladigan postlar caption'idan ekstraksiya qilish.
 */
function extractHashtags(media) {
  const tags = {};
  for (const m of (media || [])) {
    const matches = (m.caption || '').match(/#[\p{L}\d_]+/gu) || [];
    for (const t of matches) {
      const lower = t.toLowerCase();
      tags[lower] = (tags[lower] || 0) + 1;
    }
  }
  return Object.entries(tags)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Top post (engagement bo'yicha).
 */
function topPosts(media) {
  return (media || [])
    .map(m => ({
      caption: (m.caption || '').slice(0, 120),
      type: m.media_type === 'VIDEO' ? 'Reel' : (m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Photo'),
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      engagement: (m.like_count || 0) + (m.comments_count || 0),
      date: m.timestamp ? m.timestamp.slice(0, 10) : null,
      url: m.permalink,
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);
}

/**
 * Post chastotasi (haftada nechta post).
 */
function postFrequency(media) {
  if (!media || media.length < 2) return null;
  const dates = media
    .map(m => m.timestamp ? new Date(m.timestamp).getTime() : null)
    .filter(Boolean)
    .sort((a, b) => b - a);
  if (dates.length < 2) return null;
  const spanDays = (dates[0] - dates[dates.length - 1]) / 86400000;
  if (spanDays <= 0) return null;
  return +(dates.length / spanDays * 7).toFixed(1); // post/hafta
}

/**
 * Asosiy collector — Business Discovery yondashuvi.
 */
async function collectSnapshot(username, userId, organizationId, sourceId = null) {
  const cleanUsername = String(username).trim().replace(/^@/, '');
  console.log(`[IG-COMP] collectSnapshot @${cleanUsername} (userId=${userId})`);

  // 1. User'ning Instagram credential'larini olish
  const creds = await getInstagramCredentials(userId, sourceId);
  if (!creds) {
    return {
      error: 'Instagram ulangan emas. Avval Manbalar sahifasida Instagram Business profilni ulang.',
    };
  }

  // 2. Business Discovery API chaqirish
  try {
    const profile = await fetchViaBusinessDiscovery(creds, cleanUsername);
    if (!profile) {
      return { error: `@${cleanUsername} uchun ma'lumot olinmadi` };
    }

    const media = profile.media?.data || [];
    const hashtags = extractHashtags(media);
    const top = topPosts(media);
    const freq = postFrequency(media);

    // Engagement rate
    const totalEng = media.reduce((a, m) => a + (m.like_count || 0) + (m.comments_count || 0), 0);
    const avgEng = media.length ? Math.round(totalEng / media.length) : 0;
    const er = profile.followers_count ? +((avgEng / profile.followers_count) * 100).toFixed(2) : 0;

    const snapshot = {
      username: profile.username,
      followers: profile.followers_count || 0,
      following: profile.follows_count || 0,
      posts_count: profile.media_count || 0,
      bio: profile.biography || '',
      profile_picture_url: profile.profile_picture_url || null,
      website: profile.website || null,
      name: profile.name || '',
      // Statistik
      avg_engagement: avgEng,
      engagement_rate: er,
      post_frequency: freq ? `${freq}/hafta` : null,
      // Strukturali
      recent_posts: top,
      hashtags_used: hashtags,
      last_post_date: media[0]?.timestamp?.slice(0, 10) || null,
      is_verified: false, // Business Discovery beradigan field emas
      business_category: null,
      _source: 'business_discovery',
    };

    console.log(`[IG-COMP] @${cleanUsername} muvaffaqiyat: ${snapshot.followers} obunachi, ER ${er}%`);
    return { ok: true, snapshot };
  } catch (e) {
    console.warn(`[IG-COMP] @${cleanUsername} xato:`, e.message);
    return { error: e.message };
  }
}

/**
 * Snapshot DB'ga saqlash (UPSERT bo'yicha kun).
 */
async function saveSnapshot(competitorId, snapshot) {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO instagram_competitor_snapshots
       (competitor_id, snapshot_date, followers, following, posts_count, bio, last_post_date, recent_posts, hashtags, meta, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'business_discovery')
     ON CONFLICT (competitor_id, snapshot_date)
     DO UPDATE SET
       followers = EXCLUDED.followers,
       following = EXCLUDED.following,
       posts_count = EXCLUDED.posts_count,
       bio = EXCLUDED.bio,
       last_post_date = EXCLUDED.last_post_date,
       recent_posts = EXCLUDED.recent_posts,
       hashtags = EXCLUDED.hashtags,
       meta = EXCLUDED.meta`,
    [
      competitorId,
      today,
      snapshot.followers ?? null,
      snapshot.following ?? null,
      snapshot.posts_count ?? null,
      snapshot.bio ?? null,
      snapshot.last_post_date ?? null,
      JSON.stringify(snapshot.recent_posts || []),
      JSON.stringify(snapshot.hashtags_used || []),
      JSON.stringify({
        name: snapshot.name,
        profile_picture_url: snapshot.profile_picture_url,
        website: snapshot.website,
        avg_engagement: snapshot.avg_engagement,
        engagement_rate: snapshot.engagement_rate,
        post_frequency: snapshot.post_frequency,
        _source: 'business_discovery',
      }),
    ]
  );
  await pool.query(
    'UPDATE instagram_competitors SET last_synced_at = NOW(), notes = NULL WHERE id = $1',
    [competitorId]
  );
}

/**
 * Cron: barcha raqobatchilarni 24 soatda 1 marta yangilash.
 */
async function dailyJob() {
  console.log('[IG-COMP] Snapshot job boshlandi');
  const r = await pool.query(
    `SELECT c.id, c.user_id, c.source_id, c.username, u.organization_id
     FROM instagram_competitors c
     JOIN users u ON u.id = c.user_id
     WHERE u.active = TRUE
       AND (c.last_synced_at IS NULL OR c.last_synced_at < NOW() - INTERVAL '20 hours')
     ORDER BY c.last_synced_at NULLS FIRST
     LIMIT 50`
  );

  let success = 0, fail = 0;
  for (const row of r.rows) {
    try {
      const snap = await collectSnapshot(row.username, row.user_id, row.organization_id, row.source_id);
      if (snap.ok) {
        await saveSnapshot(row.id, snap.snapshot);
        success++;
      } else {
        await pool.query(
          'UPDATE instagram_competitors SET notes=$1 WHERE id=$2',
          [`Xato: ${snap.error}`, row.id]
        ).catch(() => {});
        fail++;
      }
      // Meta rate limit: 200/soat — 5 sek pauza yetarli
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.warn('[IG-COMP] Xato:', row.username, e.message);
      fail++;
    }
  }
  console.log(`[IG-COMP] Tugadi: ${success} muvaffaqiyat, ${fail} xato`);
  return { success, fail };
}

module.exports = { collectSnapshot, saveSnapshot, dailyJob };
