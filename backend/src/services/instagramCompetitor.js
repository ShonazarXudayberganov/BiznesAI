/**
 * Instagram raqobatchi snapshot collector.
 *
 * Web search (Anthropic native) yordamida public IG profil ma'lumotini topib,
 * structured snapshot ga aylantiradi.
 *
 * Hech qanday ToS buzilishi yo'q — faqat public ma'lumot va search engine.
 */

const { runAgent } = require('./aiAgent');
const pool = require('../db/pool');

/**
 * AI orqali raqobatchi profilini chuqur tahlil qilish.
 * web_search yoqilgan, AI Google/Instagram public sahifalardan ma'lumot oladi.
 */
async function collectSnapshot(username, userId, organizationId) {
  const cleanUsername = String(username).trim().replace(/^@/, '');
  const message = `Instagram'dagi public profil "@${cleanUsername}" haqida ma'lumot top.

web_search ishlat: "instagram.com/${cleanUsername}" yoki "@${cleanUsername} instagram followers".

Quyidagi STRUCTURED JSON formatda javob ber (boshqa hech narsa qo'shma):

\`\`\`json
{
  "username": "${cleanUsername}",
  "followers": <number yoki null>,
  "following": <number yoki null>,
  "posts_count": <number yoki null>,
  "bio": "<qisqa biografiya>",
  "is_verified": <true|false>,
  "business_category": "<sanoat masalan: 'Fashion', 'Food'>",
  "recent_posts": [
    {"caption": "qisqa tavsif (max 80 belgi)", "type": "Photo|Reel|Carousel", "date_approx": "2026-04-15"}
  ],
  "hashtags_used": ["#tag1", "#tag2"],
  "post_frequency": "<masalan: 3/hafta yoki 1/kun>",
  "content_style": "<masalan: motivatsion, mahsulot, brand storytelling>",
  "language": "<uz|ru|en>",
  "audience_clue": "<post komentlardan taxminiy auditoriya>",
  "_source_urls": ["topilgan URL'lar"]
}
\`\`\`

Agar topa olmasang — "followers": null, "_note": "topilmadi" qaytar.
JSON dan tashqari hech narsa yozma.`;

  try {
    const result = await runAgent({
      message,
      organizationId,
      userId,
      history: [],
      cache: false,
      thinkingBudget: 0,
      maxIter: 4,
      webSearch: true,
      webSearchMaxUses: 3,
      // Web search faqat Claude'da ishlaydi — server-side ANTHROPIC_API_KEY orqali majbur qil
      forceProvider: process.env.ANTHROPIC_API_KEY ? 'claude' : undefined,
    });

    if (result?.error) {
      return { error: result.error };
    }
    if (!result?.reply || result.reply.trim().length < 10) {
      // ANTHROPIC_API_KEY yo'q yoki provider Claude emas — web_search ishlamadi
      const cfgErr = !process.env.ANTHROPIC_API_KEY
        ? 'Server-side ANTHROPIC_API_KEY topilmadi — raqobatchi tahlili web_search ishlatadi (faqat Claude). Backend env\'ga kalit qo\'shing.'
        : 'AI bo\'sh javob qaytardi';
      return { error: cfgErr };
    }

    const text = result?.reply || '';
    // JSON ekstraksiyasi
    let parsed = null;
    const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenced) {
      try { parsed = JSON.parse(fenced[1]); } catch {}
    }
    if (!parsed) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    if (!parsed) {
      return { error: 'AI strukturali javob qaytarmadi', raw: text.slice(0, 300) };
    }
    return { ok: true, snapshot: parsed };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Snapshotni DB'ga saqlash (UPSERT bo'yicha kun).
 */
async function saveSnapshot(competitorId, snapshot) {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO instagram_competitor_snapshots
       (competitor_id, snapshot_date, followers, following, posts_count, bio, last_post_date, recent_posts, hashtags, meta, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'web_search')
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
      snapshot.recent_posts?.[0]?.date_approx ?? null,
      JSON.stringify(snapshot.recent_posts || []),
      JSON.stringify(snapshot.hashtags_used || []),
      JSON.stringify({
        is_verified: snapshot.is_verified,
        business_category: snapshot.business_category,
        post_frequency: snapshot.post_frequency,
        content_style: snapshot.content_style,
        language: snapshot.language,
        audience_clue: snapshot.audience_clue,
        _source_urls: snapshot._source_urls,
      }),
    ]
  );
  // last_synced_at yangilash
  await pool.query(
    'UPDATE instagram_competitors SET last_synced_at = NOW() WHERE id = $1',
    [competitorId]
  );
}

/**
 * Cron: barcha raqobatchilarni 24 soatda 1 marta yangilash.
 */
async function dailyJob() {
  console.log('[IG-COMP] Snapshot job boshlandi');
  const r = await pool.query(
    `SELECT c.id, c.user_id, c.username, u.organization_id
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
      const snap = await collectSnapshot(row.username, row.user_id, row.organization_id);
      if (snap.ok) {
        await saveSnapshot(row.id, snap.snapshot);
        success++;
      } else {
        fail++;
      }
      // Rate limiting — Anthropic 10/min, Voyage 3/min
      await new Promise(r => setTimeout(r, 8000));
    } catch (e) {
      console.warn('[IG-COMP] Xato:', row.username, e.message);
      fail++;
    }
  }
  console.log(`[IG-COMP] Tugadi: ${success} muvaffaqiyat, ${fail} xato`);
  return { success, fail };
}

module.exports = { collectSnapshot, saveSnapshot, dailyJob };
