import React, { useState, useMemo, useEffect } from 'react';
import AdvancedChart from './AdvancedChart';
import PremiumMD from './PremiumMD';
import { AiBrainAPI, InstagramCompetitorsAPI, PdfAPI } from '../api';

/**
 * Premium Instagram analytics dashboard.
 *
 * 3 phase:
 *   1. Quick view — header + 6 analytics cards + AI insights
 *   2. Deep dive — Reels, hashtags, sentiment
 *   3. Pro — competitors, calendar, AI generator
 */

function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(v).toLocaleString('uz-UZ');
}

function trendArrow(pct) {
  if (pct === undefined || pct === null) return null;
  if (pct > 0) return <span style={{ color: 'var(--green)', fontWeight: 700 }}>▲ +{pct.toFixed(1)}%</span>;
  if (pct < 0) return <span style={{ color: 'var(--red)', fontWeight: 700 }}>▼ {pct.toFixed(1)}%</span>;
  return <span style={{ color: 'var(--muted)' }}>— 0%</span>;
}

// ─────────────────────────────────────────────────────────────
// Hashtag extraction + frequency
// ─────────────────────────────────────────────────────────────
function extractHashtags(posts) {
  const map = new Map();
  for (const p of posts) {
    const tags = (p.caption || '').match(/#[\p{L}\d_]+/gu) || [];
    for (const t of tags) {
      const lower = t.toLowerCase();
      if (!map.has(lower)) map.set(lower, { tag: t, count: 0, totalReach: 0, totalEng: 0 });
      const e = map.get(lower);
      e.count += 1;
      e.totalReach += p.reach || 0;
      e.totalEng += p.engagement || 0;
    }
  }
  return [...map.values()]
    .map(e => ({ ...e, avgReach: Math.round(e.totalReach / e.count), avgEng: Math.round(e.totalEng / e.count) }))
    .sort((a, b) => b.totalReach - a.totalReach);
}

// ─────────────────────────────────────────────────────────────
// Engagement heatmap data (kun × soat)
// ─────────────────────────────────────────────────────────────
function buildHeatmap(posts) {
  const dayLabels = ['Yak', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];
  const grid = {};
  for (const p of posts) {
    if (!p.date) continue;
    const d = new Date(p.date + (p.time ? 'T' + p.time : 'T12:00'));
    if (isNaN(d)) continue;
    const dow = d.getDay();
    const hr = d.getHours();
    const key = `${dow}-${hr}`;
    if (!grid[key]) grid[key] = { sum: 0, count: 0 };
    grid[key].sum += p.engagement || 0;
    grid[key].count += 1;
  }
  const data = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hr = 0; hr < 24; hr++) {
      const cell = grid[`${dow}-${hr}`];
      data.push({
        x: `${hr}h`,
        y: dayLabels[dow],
        value: cell ? Math.round(cell.sum / cell.count) : 0,
      });
    }
  }
  return data;
}

// ─────────────────────────────────────────────────────────────
// Content type performance
// ─────────────────────────────────────────────────────────────
function contentTypePerformance(posts) {
  const types = {};
  for (const p of posts) {
    const t = p.type || 'IMAGE';
    if (!types[t]) types[t] = { count: 0, engagement: 0, reach: 0 };
    types[t].count += 1;
    types[t].engagement += p.engagement || 0;
    types[t].reach += p.reach || 0;
  }
  return Object.entries(types).map(([type, v]) => ({
    name: type === 'CAROUSEL_ALBUM' ? 'Carousel' : type === 'VIDEO' ? 'Reel' : 'Photo',
    posts: v.count,
    avg_eng: Math.round(v.engagement / v.count),
    avg_reach: Math.round(v.reach / v.count),
  }));
}

// ─────────────────────────────────────────────────────────────
// Phase 2D — Reels-specific analytics
// ─────────────────────────────────────────────────────────────
function getReels(posts) {
  return posts
    .filter(p => p.type === 'VIDEO' || p.type === 'REELS')
    .sort((a, b) => (b.plays || 0) - (a.plays || 0));
}

// ─────────────────────────────────────────────────────────────
// Phase 2G — Caption analyzer (basic local)
// ─────────────────────────────────────────────────────────────
function captionStats(posts) {
  if (!posts.length) return null;
  const lengths = posts.map(p => (p.caption || '').length);
  const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const totalEmojis = posts.reduce((a, p) => a + ((p.caption || '').match(emojiRe) || []).length, 0);
  const avgEmojis = (totalEmojis / posts.length).toFixed(1);
  const ctaWords = ['izoh', 'comment', 'like', 'save', 'share', 'follow', 'tag', 'dm', 'savol', 'fikr'];
  const withCta = posts.filter(p => {
    const c = (p.caption || '').toLowerCase();
    return ctaWords.some(w => c.includes(w));
  }).length;
  const ctaPct = Math.round((withCta / posts.length) * 100);
  return { avgLen, avgEmojis, ctaPct };
}

// ─────────────────────────────────────────────────────────────
// Phase 3 — Calendar suggestions (lokal, AI yo'q)
// ─────────────────────────────────────────────────────────────
function buildCalendar(posts, capStats) {
  const today = new Date();
  const days = [];
  const dayLabels = ['Yak', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];
  // Eng yaxshi soatlarni post tahlilidan topish
  const heatmapData = buildHeatmap(posts);
  const bestSlots = [...heatmapData].sort((a, b) => b.value - a.value).slice(0, 7);
  // Kelasi 7 kun uchun tavsiya
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const slot = bestSlots.find(s => s.y === dayLabels[dow]) || bestSlots[0];
    const dayPosts = posts.filter(p => {
      if (!p.date) return false;
      const pd = new Date(p.date);
      return pd.getDay() === dow;
    });
    const avgEng = dayPosts.length ? Math.round(dayPosts.reduce((a, p) => a + (p.engagement || 0), 0) / dayPosts.length) : 0;
    // Format navbati: kuniga 1 ta — Reel/Photo/Carousel rotation
    const formats = ['🎬 Reel', '🖼 Photo', '📚 Carousel'];
    const format = formats[i % formats.length];
    days.push({
      date: d,
      day: dayLabels[dow],
      bestTime: slot ? slot.x : '19h',
      avgEng,
      format,
    });
  }
  return days;
}

export default function InstagramAnalytics({ source, push }) {
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtagSuggested, setHashtagSuggested] = useState(null);
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [competitors, setCompetitors] = useState([]);
  const [compLoading, setCompLoading] = useState(false);
  const [refreshingComp, setRefreshingComp] = useState(null);
  const [tab, setTab] = useState('umumiy');
  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPdf = async () => {
    if (!aiInsights) return;
    setPdfLoading(true);
    try {
      const r = await PdfAPI.fromMarkdown({
        title: `Instagram tahlili — @${profile.username}`,
        subtitle: `${profile.followers_count?.toLocaleString('uz-UZ') || 0} obunachi · ${posts.length} post · ER ${profile.engagement_rate_str || '—'}`,
        markdown: aiInsights,
        footer: `Analix · @${profile.username}`,
      });
      if (r?.url) {
        const a = document.createElement('a');
        a.href = r.url;
        a.download = r.filename || `instagram-${profile.username}.pdf`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        push && push('PDF tayyor — yuklab olindi', 'ok');
      } else {
        throw new Error('PDF URL topilmadi');
      }
    } catch (e) {
      push && push('PDF xatosi: ' + e.message, 'error');
    } finally {
      setPdfLoading(false);
    }
  };

  // Demo holatida (string source.id) backend chaqiruvlari o'tkazilmaydi
  const sourceId = source?.id;
  const isDemo = !sourceId || (typeof sourceId === 'string' && sourceId.startsWith('demo'));

  // API'dan raqobatchilarni yuklash (faqat shu profil uchun)
  const loadCompetitors = async () => {
    if (isDemo) { setCompetitors([]); return; }
    try {
      const r = await InstagramCompetitorsAPI.list(sourceId);
      setCompetitors(r?.competitors || []);
    } catch (e) {
      console.warn('Raqobatchilarni yuklab bo\'lmadi:', e.message);
    }
  };
  useEffect(() => { loadCompetitors(); }, [sourceId]);

  const addCompetitor = async (username) => {
    if (!username) return;
    if (isDemo) {
      push && push("Demo rejimida raqobatchi qo'shib bo'lmaydi — Instagram'ni real ulang", "warn");
      return;
    }
    setCompLoading(true);
    try {
      await InstagramCompetitorsAPI.add(username, sourceId);
      push && push("Raqobatchi qo'shildi — birinchi snapshot 1-2 daqiqada tayyor", "ok");
      await loadCompetitors();
    } catch (e) {
      push && push(e.message, "error");
    } finally {
      setCompLoading(false);
    }
  };

  const removeCompetitor = async (id) => {
    try {
      await InstagramCompetitorsAPI.remove(id);
      await loadCompetitors();
    } catch (e) {
      push && push(e.message, "error");
    }
  };

  const refreshCompetitor = async (id) => {
    setRefreshingComp(id);
    try {
      await InstagramCompetitorsAPI.refresh(id);
      push && push("Yangilandi", "ok");
      await loadCompetitors();
    } catch (e) {
      push && push("Yangilashda xato: " + e.message, "error");
    } finally {
      setRefreshingComp(null);
    }
  };

  const profile = useMemo(() => source?.data?.find(d => d._type === 'PROFIL_STATISTIKA') || {}, [source]);
  const posts = useMemo(() => (source?.data || []).filter(d => d._type === 'POST' || (!d._type && d.likes !== undefined)), [source]);
  const stories = useMemo(() => (source?.data || []).filter(d => d._type === 'STORY'), [source]);
  const reels = useMemo(() => getReels(posts), [posts]);

  const hashtags = useMemo(() => extractHashtags(posts), [posts]);
  const heatmap = useMemo(() => buildHeatmap(posts), [posts]);
  const contentTypes = useMemo(() => contentTypePerformance(posts), [posts]);
  const capStats = useMemo(() => captionStats(posts), [posts]);

  // ── YANGI STATISTIKALAR ─────────────────────────────────────

  // Engagement rate trend (30d, har post asosida)
  const engRateTrend = useMemo(() => {
    return [...posts]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-30)
      .map(p => ({ name: p.date?.slice(5) || '', rate: p.engRate || 0 }));
  }, [posts]);

  // Posting frequency (haftalik, oxirgi 12 hafta)
  const postingFreq = useMemo(() => {
    const weeks = {};
    for (const p of posts) {
      if (!p.date) continue;
      const d = new Date(p.date);
      if (isNaN(d)) continue;
      // Hafta boshlanishi (Dushanba)
      const dow = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - (dow - 1));
      const key = monday.toISOString().slice(5, 10);
      weeks[key] = (weeks[key] || 0) + 1;
    }
    return Object.entries(weeks)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([name, value]) => ({ name, value }));
  }, [posts]);

  // Likes vs Saves vs Shares (stacked over time)
  const engagementBreakdown = useMemo(() => {
    return [...posts]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-15)
      .map(p => ({
        name: p.date?.slice(5) || '',
        likes: p.likes || 0,
        comments: p.comments || 0,
        saves: p.saved || 0,
        shares: p.shares || 0,
      }));
  }, [posts]);

  // Best posting time (top 3 slot)
  const bestSlots = useMemo(() => {
    const sorted = [...heatmap].filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    return sorted.slice(0, 3);
  }, [heatmap]);

  // Top commented posts (alohida topdan farqli)
  const mostCommented = useMemo(() => {
    return [...posts].sort((a, b) => (b.comments || 0) - (a.comments || 0)).slice(0, 5);
  }, [posts]);

  // Viral coefficient (saves+shares / total engagement)
  const viralCoef = useMemo(() => {
    if (!posts.length) return 0;
    const totalSaves = posts.reduce((a, p) => a + (p.saved || 0), 0);
    const totalShares = posts.reduce((a, p) => a + (p.shares || 0), 0);
    const totalEng = posts.reduce((a, p) => a + (p.engagement || 0), 0);
    return totalEng ? +((totalSaves + totalShares) / totalEng * 100).toFixed(1) : 0;
  }, [posts]);

  // Caption length vs engagement (scatter)
  const capLenEng = useMemo(() => {
    return posts
      .filter(p => p.caption && (p.engagement || 0) > 0)
      .map(p => ({ x: (p.caption || '').length, y: p.engagement, label: p.date }));
  }, [posts]);

  // Posting consistency (last 30 days heatmap)
  const consistencyDays = useMemo(() => {
    const days = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
    }
    for (const p of posts) {
      if (days[p.date] !== undefined) days[p.date] += 1;
    }
    return Object.entries(days)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  }, [posts]);

  // Account health score (0-100)
  const healthScore = useMemo(() => {
    const factors = [];
    // Bio bor (10)
    if (profile.biography && profile.biography.length > 30) factors.push({ name: 'Biography', score: 10, max: 10 });
    else factors.push({ name: 'Biography', score: 4, max: 10, warning: 'Bio uzaytiring (30+ belgi)' });
    // Profile photo (5)
    if (profile.profile_picture_url) factors.push({ name: 'Profile photo', score: 5, max: 5 });
    else factors.push({ name: 'Profile photo', score: 0, max: 5, warning: 'Profil rasmi yo\'q' });
    // Engagement rate (25)
    const er = profile.engagement_rate || 0;
    if (er >= 3) factors.push({ name: 'Engagement', score: 25, max: 25 });
    else if (er >= 1.5) factors.push({ name: 'Engagement', score: 18, max: 25 });
    else if (er >= 0.5) factors.push({ name: 'Engagement', score: 12, max: 25 });
    else factors.push({ name: 'Engagement', score: 5, max: 25, warning: 'Engagement past' });
    // Posting consistency (20) — oxirgi 30 kunda kamida 8 post
    const recent30 = posts.filter(p => {
      if (!p.date) return false;
      const days = (Date.now() - new Date(p.date).getTime()) / 86400000;
      return days <= 30;
    });
    if (recent30.length >= 12) factors.push({ name: 'Consistency', score: 20, max: 20 });
    else if (recent30.length >= 8) factors.push({ name: 'Consistency', score: 15, max: 20 });
    else if (recent30.length >= 4) factors.push({ name: 'Consistency', score: 10, max: 20 });
    else factors.push({ name: 'Consistency', score: 5, max: 20, warning: 'Post chastotasi past' });
    // Stories aktivligi (15)
    if (stories.length >= 7) factors.push({ name: 'Stories', score: 15, max: 15 });
    else if (stories.length >= 3) factors.push({ name: 'Stories', score: 10, max: 15 });
    else factors.push({ name: 'Stories', score: 5, max: 15, warning: 'Stories kam' });
    // Reels (10)
    const reelsRatio = posts.length ? reels.length / posts.length : 0;
    if (reelsRatio >= 0.3) factors.push({ name: 'Reels', score: 10, max: 10 });
    else if (reelsRatio >= 0.1) factors.push({ name: 'Reels', score: 7, max: 10 });
    else factors.push({ name: 'Reels', score: 3, max: 10, warning: 'Reels kam (30% bo\'lsin)' });
    // Hashtag strategy (10)
    if (hashtags.length >= 15) factors.push({ name: 'Hashtags', score: 10, max: 10 });
    else if (hashtags.length >= 5) factors.push({ name: 'Hashtags', score: 6, max: 10 });
    else factors.push({ name: 'Hashtags', score: 3, max: 10, warning: 'Ko\'proq hashtag ishlatish' });
    // Caption CTA (5)
    if (capStats && capStats.ctaPct >= 60) factors.push({ name: 'CTA', score: 5, max: 5 });
    else factors.push({ name: 'CTA', score: 2, max: 5, warning: 'Postlarda CTA (action) qo\'shing' });

    const total = factors.reduce((a, f) => a + f.score, 0);
    return { total, factors };
  }, [profile, posts, stories, reels, hashtags, capStats]);

  // 7-day vs previous 7-day deltas
  const weekDeltas = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    const last7 = posts.filter(p => p.date && (now - new Date(p.date).getTime()) <= 7 * day);
    const prev7 = posts.filter(p => {
      if (!p.date) return false;
      const diff = now - new Date(p.date).getTime();
      return diff > 7 * day && diff <= 14 * day;
    });
    const sum = (arr, key) => arr.reduce((a, p) => a + (p[key] || 0), 0);
    const safeP = (cur, prev) => prev ? +(((cur - prev) / prev) * 100).toFixed(1) : (cur > 0 ? 100 : 0);
    return [
      { l: 'Postlar', cur: last7.length, prev: prev7.length, pct: safeP(last7.length, prev7.length) },
      { l: 'Likes', cur: sum(last7, 'likes'), prev: sum(prev7, 'likes'), pct: safeP(sum(last7, 'likes'), sum(prev7, 'likes')) },
      { l: 'Comments', cur: sum(last7, 'comments'), prev: sum(prev7, 'comments'), pct: safeP(sum(last7, 'comments'), sum(prev7, 'comments')) },
      { l: 'Reach', cur: sum(last7, 'reach'), prev: sum(prev7, 'reach'), pct: safeP(sum(last7, 'reach'), sum(prev7, 'reach')) },
      { l: 'Saves', cur: sum(last7, 'saved'), prev: sum(prev7, 'saved'), pct: safeP(sum(last7, 'saved'), sum(prev7, 'saved')) },
      { l: 'Shares', cur: sum(last7, 'shares'), prev: sum(prev7, 'shares'), pct: safeP(sum(last7, 'shares'), sum(prev7, 'shares')) },
    ];
  }, [posts]);

  // Stories completion rate
  const storyCompletion = useMemo(() => {
    if (!stories.length) return null;
    const totalReach = stories.reduce((a, s) => a + (s.reach || 0), 0);
    const totalImpressions = stories.reduce((a, s) => a + (s.impressions || 0), 0);
    const totalExits = stories.reduce((a, s) => a + (s.exits || 0), 0);
    const completion = totalImpressions ? Math.max(0, Math.min(100, +((1 - totalExits / totalImpressions) * 100).toFixed(1))) : 0;
    return { totalReach, totalImpressions, totalExits, completion };
  }, [stories]);

  // Engagement type radar (Photo/Reel/Carousel)
  const engRadarData = useMemo(() => {
    const types = {};
    for (const p of posts) {
      const t = p.type === 'CAROUSEL_ALBUM' ? 'Carousel' : p.type === 'VIDEO' ? 'Reel' : 'Photo';
      if (!types[t]) types[t] = { name: t, likes: 0, comments: 0, saves: 0, shares: 0, reach: 0, count: 0 };
      types[t].likes += p.likes || 0;
      types[t].comments += p.comments || 0;
      types[t].saves += p.saved || 0;
      types[t].shares += p.shares || 0;
      types[t].reach += p.reach || 0;
      types[t].count += 1;
    }
    return Object.values(types).map(t => ({
      name: t.name,
      likes: Math.round(t.likes / t.count),
      comments: Math.round(t.comments / t.count),
      saves: Math.round(t.saves / t.count),
      shares: Math.round(t.shares / t.count),
      reach: Math.round(t.reach / t.count),
    }));
  }, [posts]);

  // Top 6 posts
  const topPosts = useMemo(() => {
    return [...posts].sort((a, b) => (b.engagement || 0) - (a.engagement || 0)).slice(0, 6);
  }, [posts]);

  // Followers timeline (from daily_reach + follower_growth)
  const dailyReach = profile.daily_reach || [];
  const dailyImpressions = profile.daily_impressions || [];
  const followerDaily = profile.follower_daily || [];

  // ── AI Insights generate ──
  const generateInsights = async () => {
    setAiLoading(true);
    try {
      const summary = {
        profile: {
          username: profile.username,
          followers: profile.followers_count,
          posts: posts.length,
          engagement_rate: profile.engagement_rate_str,
          reach_30d: profile.reach_30d,
          reach_change_pct: profile.reach_change_pct,
          follower_growth: profile.follower_growth,
        },
        top_posts_summary: topPosts.slice(0, 3).map(p => ({
          caption: (p.caption || '').slice(0, 80),
          engagement: p.engagement,
          reach: p.reach,
          type: p.type,
        })),
        content_types: contentTypes,
        top_hashtags: hashtags.slice(0, 5).map(h => ({ tag: h.tag, count: h.count, avgReach: h.avgReach })),
        caption_stats: capStats,
        stories_count: stories.length,
      };

      const result = await AiBrainAPI.run('chat.freeform', {
        message: `Sen Instagram strategi-mutaxassissan. FAQAT @${profile.username} akkaunti haqida tahlil yoz — boshqa akkauntlarni eslama.

MA'LUMOTLAR (faqat shu akkaunt):
${JSON.stringify(summary, null, 2)}

VAZIFA: 7 ta KONKRET, raqamlar bilan asoslangan tavsiya ber. Markdown formatida, aniq strukturada.

FORMAT (qattiq amal qil):

# 📊 @${profile.username} — strategik tahlil

## 🏆 1. Eng yaxshi post sabablari
[Top postning sababi: caption uslubi, format, vaqt — 2-3 jumla, raqamlar bilan]

## 📈 2. Engagement trendi
[Hozirgi engagement nima sababdan oshgan/pasaygan, taqqoslash uchun raqamlar]

## ⏰ 3. Optimal post vaqti
[Eng yaxshi kun va soat — heatmap'dan kelib chiqib, aniq tavsiya]

## 🎬 4. Content mix tavsiyasi
[Hozirgi % vs ideal % — Reel / Photo / Carousel uchun]

## #️⃣ 5. Hashtag strategiyasi
[Ishlatayotgan tag'lar samaradorligi + qaysi yangi tag'lar qo'shish kerak]

## 📹 6. Stories yo'l xaritasi
[Stories qancha kam/ko'p, qanday ulardan ko'proq foydalanish]

## ✍️ 7. Caption va CTA
[Caption uzunligi, CTA mavjudligi, aniq misol]

QOIDALAR:
- Har sarlavhada faqat 2-3 jumla yoz
- Har tavsiyada aniq raqam yoki misol bo'lsin (masalan: "engagement 2.4% — past, 4%+ kerak")
- Hech qachon "umumiy", "yaxshilash kerak" deb noaniq gapirma — har gapida konkret harakat bo'lsin
- Faqat @${profile.username} haqida — boshqa akkaunt eslamasdan`,
      }, { language: 'uz' });

      setAiInsights(result?.reply || result?.text || 'Tahlil olishda xato');
    } catch (e) {
      setAiInsights('Xato: ' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (!profile.username) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📸</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Instagram ulanmagan</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Avval Manbalar sahifasidan Instagram'ni ulang</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ─────────────── HEADER (Profile card) ─────────────── */}
      <div style={{
        padding: '24px 28px',
        background: 'linear-gradient(135deg, rgba(225,48,108,0.12) 0%, rgba(248,168,57,0.08) 50%, rgba(64,93,230,0.10) 100%)',
        border: '1px solid rgba(225,48,108,0.25)',
        borderRadius: 18,
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {profile.profile_picture_url && (
          <img src={profile.profile_picture_url} alt={profile.username}
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid #E1306C', boxShadow: '0 4px 16px rgba(225,48,108,0.3)' }}
            onError={e => { e.target.style.display = 'none'; }} />
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--fh)', fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.4px' }}>
            @{profile.username}
            {profile.is_verified && <span style={{ marginLeft: 8, color: '#4DA3FF', fontSize: 16 }}>✓</span>}
          </div>
          {profile.name && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{profile.name}</div>}
          {profile.biography && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, maxWidth: 480, lineHeight: 1.5 }}>{profile.biography.slice(0, 140)}</div>}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { l: 'Followers', uz: 'obunachilar', v: fmtNum(profile.followers_count), trend: profile.follower_growth_pct },
            { l: 'Following', uz: 'siz obunasiz', v: fmtNum(profile.follows_count) },
            { l: 'Posts', uz: 'jami post', v: posts.length },
            { l: 'Engagement', uz: 'faollik darajasi', v: profile.engagement_rate_str || '—', highlight: true },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 88 }}>
              <div title={s.uz} style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--fm)', fontWeight: 700, marginBottom: 4 }}>{s.l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.highlight ? '#E1306C' : 'var(--text)', fontFamily: 'var(--fh)', letterSpacing: '-0.5px' }}>{s.v}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2, opacity: 0.85 }}>{s.uz}</div>
              {s.trend !== undefined && trendArrow(s.trend)}
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────── TABS NAV ─────────────── */}
      <div style={{
        display: 'flex', gap: 6, padding: 6,
        background: 'var(--s1)', border: '1px solid var(--border)',
        borderRadius: 14, overflowX: 'auto',
      }}>
        {[
          { id: 'umumiy',     l: '📊 Umumiy',           sub: 'Sog\'liq + KPI' },
          { id: 'kontent',    l: '🎬 Kontent',          sub: 'Postlar + Reels' },
          { id: 'vaqt',       l: '⏰ Vaqt + Audience',  sub: 'Heatmap + shaharlar' },
          { id: 'direct',     l: '💬 Direct',            sub: 'DM + AI xulosa' },
          { id: 'strategiya', l: '✨ Strategiya',        sub: 'AI + raqobatchilar' },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, minWidth: 160,
                padding: '10px 14px', borderRadius: 10,
                background: active ? 'linear-gradient(135deg, rgba(225,48,108,0.18), rgba(248,168,57,0.10))' : 'transparent',
                border: active ? '1px solid rgba(225,48,108,0.4)' : '1px solid transparent',
                color: active ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all .15s var(--ease)',
                fontFamily: 'var(--fh)',
              }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.2px' }}>{t.l}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>{t.sub}</div>
            </button>
          );
        })}
      </div>

      {/* ─────────────── TAB: STRATEGIYA — AI INSIGHTS PANEL ─────────────── */}
      {tab === 'strategiya' && (
      <div className="card" style={{ padding: 20, background: 'linear-gradient(135deg, var(--gold-glow), transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiInsights ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>✨ AI MASLAHAT</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--fh)' }}>Akkaunt sifatini oshirish uchun aniq tavsiyalar</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {aiInsights && (
              <button onClick={downloadPdf} disabled={pdfLoading}
                style={{
                  padding: '10px 16px', fontSize: 12, fontWeight: 700,
                  background: 'var(--s2)', color: 'var(--text)',
                  border: '1px solid var(--border-hi)', borderRadius: 10,
                  cursor: pdfLoading ? 'wait' : 'pointer',
                  fontFamily: 'var(--fh)',
                }}>
                {pdfLoading ? '⏳ Tayyorlanmoqda...' : '📄 PDF yuklab olish'}
              </button>
            )}
            <button className="btn btn-primary" onClick={generateInsights} disabled={aiLoading}
              style={{ padding: '10px 18px', fontSize: 12, fontWeight: 700 }}>
              {aiLoading ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }} />Tahlil...</> : (aiInsights ? '🔄 Qayta tahlil' : '🔮 AI tahlil qilish')}
            </button>
          </div>
        </div>
        {aiInsights && (
          <div style={{
            marginTop: 14, padding: '18px 22px',
            background: 'linear-gradient(135deg, var(--s2), rgba(225,48,108,0.04))',
            border: '1px solid rgba(225,48,108,0.18)',
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>
              📋 Tavsiyalar — @{profile.username}
            </div>
            <PremiumMD text={aiInsights} />
          </div>
        )}
      </div>
      )}

      {/* ─────────────── TAB: DIRECT (DM) ─────────────── */}
      {tab === 'direct' && (
        <DirectTab source={source} profile={profile} push={push} />
      )}

      {/* ─────────────── CARDS GRID (per tab) ─────────────── */}
      {tab !== 'direct' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>

        {/* Card 1: Followers timeline [UMUMIY] */}
        {tab === 'umumiy' && followerDaily.length > 0 && (
          <Card title="📈 Followers o'sishi" subtitle="30 kunlik trend">
            <AdvancedChart chart={{
              type: 'area',
              data: followerDaily.map(d => ({ name: d.date?.slice(5) || '', followers: d.value })),
              xKey: 'name',
              keys: ['followers'],
              colors: ['#E1306C'],
            }} height={220} />
          </Card>
        )}

        {/* Card 2: Reach + Impressions [UMUMIY] */}
        {tab === 'umumiy' && dailyReach.length > 0 && (
          <Card title="🎯 Reach + Impressions" subtitle="30 kunlik">
            <AdvancedChart chart={{
              type: 'line',
              data: dailyReach.map((r, i) => ({
                name: r.date?.slice(5) || '',
                reach: r.value,
                impressions: dailyImpressions[i]?.value || 0,
              })),
              xKey: 'name',
              keys: ['reach', 'impressions'],
              colors: ['#F8A839', '#405DE6'],
            }} height={220} />
          </Card>
        )}

        {/* Card 3: Engagement Heatmap (kun×soat) [VAQT] */}
        {tab === 'vaqt' && posts.length > 5 && (
          <Card title="🔥 Engagement Heatmap" subtitle="Kun × soat — eng yaxshi vaqt">
            <AdvancedChart chart={{
              type: 'heatmap',
              data: heatmap,
              xKey: 'x',
              keys: ['value'],
            }} height={220} />
          </Card>
        )}

        {/* Card 4: Content Type performance [KONTENT] */}
        {tab === 'kontent' && contentTypes.length > 0 && (
          <Card title="🎬 Content turlari" subtitle="O'rtacha engagement / format">
            <AdvancedChart chart={{
              type: 'bar',
              data: contentTypes,
              xKey: 'name',
              keys: ['avg_eng'],
              colors: ['#E1306C'],
            }} height={220} />
          </Card>
        )}

        {/* Card 5: Top Posts [KONTENT] */}
        {tab === 'kontent' && (
        <Card title="💎 Top 6 post" subtitle="Engagement bo'yicha">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {topPosts.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'block', padding: 10, background: 'var(--s2)',
                  border: '1px solid var(--border)', borderRadius: 10,
                  textDecoration: 'none', color: 'var(--text)',
                  transition: 'all .15s var(--ease)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E1306C'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  {p.type === 'VIDEO' ? '🎬 Reel' : p.type === 'CAROUSEL_ALBUM' ? '📚 Carousel' : '🖼 Photo'} · {p.date?.slice(5)}
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--text)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {p.caption || '(no caption)'}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>
                  <span>❤️ {fmtNum(p.likes)}</span>
                  <span>💬 {fmtNum(p.comments)}</span>
                  <span>👁 {fmtNum(p.reach)}</span>
                </div>
              </a>
            ))}
          </div>
        </Card>
        )}

        {/* Card 6: Top Hashtags [STRATEGIYA] */}
        {tab === 'strategiya' && hashtags.length > 0 && (
          <Card title="#️⃣ Top hashtag" subtitle="Reach bo'yicha">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hashtags.slice(0, 8).map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--s2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--fm)', color: 'var(--gold)', flex: 1, fontWeight: 600 }}>{h.tag}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>{h.count}× ishlatildi</div>
                  <div style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'var(--fm)', fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{fmtNum(h.avgReach)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Card 7: Audience demographics (cities) [VAQT] */}
        {tab === 'vaqt' && profile.top_cities && profile.top_cities.length > 0 && (
          <Card title="🌍 Eng faol shaharlar" subtitle="Top 6">
            <AdvancedChart chart={{
              type: 'bar',
              data: profile.top_cities.slice(0, 6).map(c => ({ name: c.name, value: c.value })),
              xKey: 'name',
              keys: ['value'],
              colors: ['#F8A839'],
            }} height={220} />
          </Card>
        )}

        {/* Card 8: Stories analytics [UMUMIY] */}
        {tab === 'umumiy' && stories.length > 0 && (
          <Card title="📹 Stories statistikasi" subtitle={`${stories.length} ta story`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {[
                { l: 'Reach', uz: 'qancha odam ko\'rdi', v: stories.reduce((a, s) => a + (s.reach || 0), 0), c: '#F8A839' },
                { l: 'Impressions', uz: 'jami ko\'rsatuvlar', v: stories.reduce((a, s) => a + (s.impressions || 0), 0), c: '#E1306C' },
                { l: 'Replies', uz: 'javob yozdi', v: stories.reduce((a, s) => a + (s.replies || 0), 0), c: '#405DE6' },
                { l: 'Exits', uz: 'storyni yopdi', v: stories.reduce((a, s) => a + (s.exits || 0), 0), c: '#833AB4' },
              ].map((s, i) => (
                <div key={i} title={s.uz} style={{ padding: 14, background: 'var(--s2)', borderRadius: 10, border: `1px solid ${s.c}30`, textAlign: 'center' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--fm)', fontWeight: 700, marginBottom: 6 }}>{s.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.c, fontFamily: 'var(--fh)' }}>{fmtNum(s.v)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 4 }}>{s.uz}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Card 9: Reels Analytics (Phase 2D) [KONTENT] */}
        {tab === 'kontent' && reels.length > 0 && (
          <Card title="🎬 Reels tahlili" subtitle={`${reels.length} ta reel`}>
            <AdvancedChart chart={{
              type: 'bar',
              data: reels.slice(0, 8).map((r, i) => ({
                name: `R${i + 1}`,
                plays: r.plays || 0,
                engagement: r.engagement || 0,
              })),
              xKey: 'name',
              keys: ['plays', 'engagement'],
              colors: ['#E1306C', '#F8A839'],
            }} height={220} />
          </Card>
        )}

        {/* Card 10: Caption analyzer (Phase 2G) [KONTENT] */}
        {tab === 'kontent' && capStats && (
          <Card title="📝 Caption tahlili" subtitle="Sizning yozish uslubingiz">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <Stat label="O'rtacha uzunlik" value={capStats.avgLen + ' belgi'}
                ideal={capStats.avgLen >= 150 && capStats.avgLen <= 300 ? 'ok' : capStats.avgLen < 150 ? 'short' : 'long'} />
              <Stat label="O'rtacha emoji" value={capStats.avgEmojis + '/post'}
                ideal={Number(capStats.avgEmojis) >= 1 && Number(capStats.avgEmojis) <= 5 ? 'ok' : 'low'} />
              <Stat label="CTA bilan" value={capStats.ctaPct + '%'}
                ideal={capStats.ctaPct >= 60 ? 'ok' : 'low'} />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong>Tavsiya:</strong> Optimal — 150-300 belgi caption, 1-5 emoji, har postda CTA ("Comment qiling", "Save bosing")
            </div>
          </Card>
        )}

        {/* ── YANGI STATISTIKALAR (12 ta qo'shimcha) ── */}

        {/* Health Score [UMUMIY] */}
        {tab === 'umumiy' && (
        <Card title="🏥 Akkaunt sog'liq darajasi" subtitle="0-100 ko'rsatkich">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 110, height: 110 }}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="48" fill="none" stroke="var(--s3)" strokeWidth="8" />
                <circle cx="55" cy="55" r="48" fill="none"
                  stroke={healthScore.total >= 80 ? '#10B981' : healthScore.total >= 60 ? '#FBBF24' : '#EF4444'}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(healthScore.total / 100) * 301.6} 301.6`}
                  transform="rotate(-90 55 55)" />
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--fh)', letterSpacing: '-1px' }}>{healthScore.total}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1 }}>/ 100</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {healthScore.factors.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ flex: 1, color: 'var(--text2)' }}>{f.name}</span>
                  <span style={{ width: 50, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: f.score === f.max ? '#10B981' : f.warning ? '#FBBF24' : 'var(--text)' }}>
                    {f.score}/{f.max}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {healthScore.factors.filter(f => f.warning).length > 0 && (
            <div style={{ padding: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#FBBF24', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>Yaxshilash uchun</div>
              {healthScore.factors.filter(f => f.warning).map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>• {f.warning}</div>
              ))}
            </div>
          )}
        </Card>
        )}

        {/* 7-day comparison [UMUMIY] */}
        {tab === 'umumiy' && (
        <Card title="📊 Bu hafta vs o'tgan hafta" subtitle="6 ta asosiy metrik">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {weekDeltas.map((m, i) => {
              const isUp = m.pct > 0;
              const isDown = m.pct < 0;
              const color = isUp ? '#10B981' : isDown ? '#EF4444' : 'var(--muted)';
              return (
                <div key={i} style={{ padding: 10, background: 'var(--s2)', borderRadius: 8, border: `1px solid ${color}30` }}>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--fm)', fontWeight: 700, marginBottom: 4 }}>{m.l}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--fh)' }}>{fmtNum(m.cur)}</div>
                    <div style={{ fontSize: 11, color, fontWeight: 700 }}>
                      {isUp ? '▲' : isDown ? '▼' : '—'} {Math.abs(m.pct).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>oldingi: {fmtNum(m.prev)}</div>
                </div>
              );
            })}
          </div>
        </Card>
        )}

        {/* Engagement rate trend [KONTENT] */}
        {tab === 'kontent' && engRateTrend.length > 5 && (
          <Card title="🎯 Engagement Rate trendi" subtitle="Har post — % ko'rsatkich">
            <AdvancedChart chart={{
              type: 'area',
              data: engRateTrend,
              xKey: 'name',
              keys: ['rate'],
              colors: ['#E1306C'],
            }} height={220} />
          </Card>
        )}

        {/* Posting frequency [KONTENT] */}
        {tab === 'kontent' && postingFreq.length > 1 && (
          <Card title="📅 Post chastotasi" subtitle="Haftalik (oxirgi 12 hafta)">
            <AdvancedChart chart={{
              type: 'bar',
              data: postingFreq,
              xKey: 'name',
              keys: ['value'],
              colors: ['#F8A839'],
            }} height={220} />
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
              O'rtacha: <strong style={{ color: 'var(--text)' }}>
                {(postingFreq.reduce((a, p) => a + p.value, 0) / postingFreq.length).toFixed(1)} ta/hafta
              </strong>
              {' '}— optimal: 3-5 post/hafta
            </div>
          </Card>
        )}

        {/* Engagement breakdown stacked [KONTENT] */}
        {tab === 'kontent' && engagementBreakdown.length > 5 && (
          <Card title="❤️💬💾🔁 Faollik turlari" subtitle="Likes (yoqtirish) / Comments (izoh) / Saves (saqlash) / Shares (ulashish)">
            <AdvancedChart chart={{
              type: 'stackedbar',
              data: engagementBreakdown,
              xKey: 'name',
              keys: ['likes', 'comments', 'saves', 'shares'],
              colors: ['#E1306C', '#60A5FA', '#A78BFA', '#10B981'],
            }} height={220} />
          </Card>
        )}

        {/* Best posting time [VAQT] */}
        {tab === 'vaqt' && bestSlots.length > 0 && (
          <Card title="⏰ Eng yaxshi post vaqti" subtitle="Top 3 slot — engagement bo'yicha">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bestSlots.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  background: i === 0 ? 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.04))' : 'var(--s2)',
                  border: `1px solid ${i === 0 ? '#10B981' : 'var(--border)'}`,
                  borderRadius: 10,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: i === 0 ? '#10B981' : i === 1 ? '#F8A839' : '#A78BFA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--fh)', fontSize: 14, fontWeight: 800, color: '#fff',
                  }}>#{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--fh)' }}>{s.y}, {s.x}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>O'rtacha engagement: <strong style={{ color: 'var(--text)' }}>{fmtNum(s.value)}</strong></div>
                  </div>
                  {i === 0 && <div style={{ fontSize: 10, color: '#10B981', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800 }}>★ Eng yaxshi</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Most commented [KONTENT] */}
        {tab === 'kontent' && mostCommented.length > 0 && (
          <Card title="💬 Eng ko'p izoh olgan" subtitle="Top 5 post — comment bo'yicha">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mostCommented.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--s2)', borderRadius: 8, textDecoration: 'none', color: 'var(--text)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#60A5FA22', color: '#60A5FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fh)', fontSize: 12, fontWeight: 800 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.caption?.slice(0, 60) || '(no caption)'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>{p.date} · {p.type === 'VIDEO' ? '🎬' : p.type === 'CAROUSEL_ALBUM' ? '📚' : '🖼'}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#60A5FA', fontFamily: 'var(--fh)' }}>💬 {fmtNum(p.comments)}</div>
                </a>
              ))}
            </div>
          </Card>
        )}

        {/* Viral coefficient [UMUMIY] */}
        {tab === 'umumiy' && (
        <Card title="🔥 Viral koeffitsient" subtitle="Saves + Shares / Total engagement">
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: viralCoef >= 15 ? '#10B981' : viralCoef >= 8 ? '#FBBF24' : '#EF4444', fontFamily: 'var(--fh)', letterSpacing: '-1.5px' }}>
              {viralCoef}%
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: 'var(--fm)' }}>
              Optimal: <strong style={{ color: '#10B981' }}>15%+</strong> · O'rtacha: <strong style={{ color: '#FBBF24' }}>8-15%</strong> · Past: <strong style={{ color: '#EF4444' }}>&lt;8%</strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 14, lineHeight: 1.6, padding: '10px 12px', background: 'var(--s2)', borderRadius: 8 }}>
              <strong>Bu nima?</strong> Mijozlar postingizni saqlash/ulashishi nisbati. Yuqori bo'lsa — kontent qiziqarli, foydalanuvchilar uni keyin qaytib ko'rishni xohlashadi.
            </div>
          </div>
        </Card>
        )}

        {/* Caption length vs engagement scatter [KONTENT] */}
        {tab === 'kontent' && capLenEng.length > 5 && (
          <Card title="📏 Caption uzunligi vs Engagement" subtitle="Optimal uzunlikni topish">
            <AdvancedChart chart={{
              type: 'scatter',
              data: capLenEng,
              xKey: 'x',
              keys: ['y'],
              xLabel: 'Caption uzunligi',
              yLabel: 'Engagement',
              colors: ['#E1306C'],
            }} height={220} />
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
              Har nuqta — bitta post. O'ng tomon yuqori — uzun caption + yuqori engagement
            </div>
          </Card>
        )}

        {/* Posting consistency calendar [KONTENT] */}
        {tab === 'kontent' && consistencyDays.length > 0 && (
          <Card title="📅 Post chastotasi (30 kun)" subtitle="Yashil = post bor, kulrang = bo'sh">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15,1fr)', gap: 4, marginBottom: 8 }}>
              {consistencyDays.map((d, i) => {
                const intensity = Math.min(d.count, 3);
                const bgColors = ['var(--s3)', 'rgba(225,48,108,0.3)', 'rgba(225,48,108,0.6)', '#E1306C'];
                return (
                  <div key={i} title={`${d.date}: ${d.count} post`}
                    style={{
                      aspectRatio: '1', borderRadius: 4,
                      background: bgColors[intensity],
                      border: '1px solid var(--border)',
                      cursor: 'help',
                    }} />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>
              <span>{consistencyDays[0]?.date.slice(5)}</span>
              <span>Bo'sh kunlar: <strong style={{ color: 'var(--text)' }}>{consistencyDays.filter(d => d.count === 0).length}</strong></span>
              <span>{consistencyDays[consistencyDays.length - 1]?.date.slice(5)}</span>
            </div>
          </Card>
        )}

        {/* Engagement by content type radar [KONTENT] */}
        {tab === 'kontent' && engRadarData.length >= 2 && (
          <Card title="🕸️ Format taqqoslash (radar)" subtitle="Photo / Reel / Carousel solishtirish">
            <AdvancedChart chart={{
              type: 'radar',
              data: engRadarData,
              keys: ['likes', 'comments', 'saves', 'shares', 'reach'],
            }} height={260} />
          </Card>
        )}

        {/* Stories completion rate [UMUMIY] */}
        {tab === 'umumiy' && storyCompletion && (
          <Card title="📺 Stories tugash darajasi" subtitle="Foydalanuvchi storyni qancha tomosha qiladi">
            <div style={{ textAlign: 'center', padding: '14px 0' }}>
              <div style={{ position: 'relative', display: 'inline-block', width: 120, height: 120 }}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--s3)" strokeWidth="10" />
                  <circle cx="60" cy="60" r="52" fill="none"
                    stroke={storyCompletion.completion >= 70 ? '#10B981' : storyCompletion.completion >= 40 ? '#FBBF24' : '#EF4444'}
                    strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(storyCompletion.completion / 100) * 326.7} 326.7`}
                    transform="rotate(-90 60 60)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--fh)' }}>{storyCompletion.completion}%</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase' }}>Completion</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
              <Stat label="Reach" value={fmtNum(storyCompletion.totalReach)} ideal="ok" />
              <Stat label="Imp" value={fmtNum(storyCompletion.totalImpressions)} ideal="ok" />
              <Stat label="Exits" value={fmtNum(storyCompletion.totalExits)} ideal={storyCompletion.totalExits / storyCompletion.totalImpressions < 0.3 ? 'ok' : 'low'} />
            </div>
          </Card>
        )}

        {/* Card 11: Phase 3J — Content Calendar (kelasi 7 kun) [VAQT] */}
        {tab === 'vaqt' && (
        <Card title="📅 Content kalendar" subtitle="Kelasi 7 kun — AI tavsiyasi">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {buildCalendar(posts, capStats).map((day, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: 'var(--s2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ minWidth: 50, textAlign: 'center' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--fm)', fontWeight: 700 }}>{day.day}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--fh)' }}>{day.date.getDate()}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{day.format}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>
                    Optimal vaqt: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{day.bestTime}</span>
                    {day.avgEng > 0 && <span> · Bu kunlardagi avg engagement: <strong>{fmtNum(day.avgEng)}</strong></span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            Bu tavsiyalar sizning post tarixingizdagi eng yaxshi vaqtlar va format rotatsiyasi asosida.
          </div>
        </Card>
        )}

        {/* Card 12: Phase 3L — AI Hashtag generator [STRATEGIYA] */}
        {tab === 'strategiya' && (
        <Card title="✨ AI Hashtag generator" subtitle="Post matnini yozing — 30 ta tag taklif">
          <textarea
            value={hashtagInput}
            onChange={e => setHashtagInput(e.target.value)}
            placeholder="Misol: 'Bugun yangi mahsulot — qishki qo'lqop. 100% jun, Toshkentda yetkazib berish bepul...'"
            rows={3}
            style={{
              width: '100%', padding: 10, background: 'var(--s2)',
              border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text)', fontSize: 12, fontFamily: 'var(--fh)',
              resize: 'vertical', outline: 'none',
            }} />
          <button className="btn btn-primary" disabled={hashtagLoading || hashtagInput.trim().length < 10}
            onClick={async () => {
              setHashtagLoading(true);
              try {
                const r = await AiBrainAPI.run('chat.freeform', {
                  message: `Quyidagi Instagram post matnidan 30 ta hashtag taklif qil. Format:
- 10 ta TRENDING tag (1M+ posts)
- 10 ta NICHE tag (10K-500K posts) — eng yaxshi reach
- 10 ta BRAND/LOCAL tag (1K-50K, Uzbekistan)

POST MATNI:
"${hashtagInput.trim()}"

JAVOB FORMATI: hashtaglarni bo'shliq bilan ajratib, har biri # bilan boshlanishi kerak. Hech qanday qo'shimcha matn — faqat hashtaglar.`,
                }, { language: 'uz' });
                const tags = (r?.reply || r?.text || '').match(/#[\p{L}\d_]+/gu) || [];
                setHashtagSuggested(tags.slice(0, 30));
              } catch (e) {
                setHashtagSuggested(['Xato: ' + e.message]);
              } finally {
                setHashtagLoading(false);
              }
            }}
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}>
            {hashtagLoading ? 'AI o\'ylayapti...' : '🔮 30 ta hashtag taklif qiling'}
          </button>
          {hashtagSuggested && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--s2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                  {hashtagSuggested.length} ta hashtag
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(hashtagSuggested.join(' '));
                    push && push("Nusxalandi", "ok");
                  }}
                  style={{
                    padding: '4px 10px', fontSize: 10, background: 'var(--gold)',
                    color: '#1a1a1a', border: 'none', borderRadius: 6,
                    cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--fh)',
                  }}>
                  📋 Nusxalash
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, fontSize: 11, fontFamily: 'var(--fm)' }}>
                {hashtagSuggested.map((t, i) => (
                  <span key={i} style={{
                    padding: '4px 9px', background: 'var(--s3)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--gold)', fontWeight: 600,
                  }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
        )}

        {/* Card 13: Phase 3I — Competitor tracker (snapshot bilan) [STRATEGIYA] */}
        {tab === 'strategiya' && (
        <Card title="🥊 Raqobatchilar tahlili" subtitle={`${competitors.length} ta · har 24 soatda yangilanadi`}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              placeholder="@raqobatchi_username"
              id="ig-comp-input"
              style={{
                flex: 1, padding: '8px 12px', background: 'var(--s2)',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', fontSize: 12, fontFamily: 'var(--fh)', outline: 'none',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = e.target.value.trim().replace(/^@/, '');
                  if (v) { addCompetitor(v); e.target.value = ''; }
                }
              }} />
            <button
              onClick={() => {
                const inp = document.getElementById('ig-comp-input');
                const v = inp.value.trim().replace(/^@/, '');
                if (v) { addCompetitor(v); inp.value = ''; }
              }}
              disabled={compLoading}
              style={{
                padding: '8px 14px', background: 'var(--gold)', color: '#1a1a1a',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--fh)',
              }}>{compLoading ? '...' : '+ Qo\'shish'}</button>
          </div>
          {competitors.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
              Raqobatchi qo'shing — AI har 24 soatda profilni kuzatadi va sizga solishtirma tahlil beradi
            </div>
          ) : (
            <>
              {/* Solishtirma chart — followers nisbati */}
              {competitors.some(c => c.followers > 0) && profile.followers_count > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <AdvancedChart chart={{
                    type: 'bar',
                    data: [
                      { name: '@' + profile.username, val: profile.followers_count },
                      ...competitors.filter(c => c.followers).map(c => ({ name: '@' + c.username, val: c.followers })),
                    ],
                    xKey: 'name',
                    keys: ['val'],
                    colors: ['#E1306C'],
                  }} height={180} />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {competitors.map(c => {
                  const myFollowers = profile.followers_count || 0;
                  const theirFollowers = c.followers || 0;
                  const diff = theirFollowers - myFollowers;
                  const meta = c.meta || {};
                  return (
                    <div key={c.id} style={{
                      padding: '12px 14px', background: 'var(--s2)',
                      borderRadius: 10, border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <a href={`https://instagram.com/${c.username}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                          @{c.username}
                        </a>
                        {meta.is_verified && <span style={{ color: '#4DA3FF' }}>✓</span>}
                        {c.last_synced_at && (
                          <span style={{ fontSize: 9.5, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>
                            {new Date(c.last_synced_at).toLocaleDateString('uz-UZ')}
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <button onClick={() => refreshCompetitor(c.id)} disabled={refreshingComp === c.id}
                          title="Yangilash"
                          style={{
                            width: 26, height: 26, borderRadius: 6,
                            background: 'transparent', border: '1px solid var(--border)',
                            color: refreshingComp === c.id ? 'var(--gold)' : 'var(--muted)',
                            cursor: refreshingComp === c.id ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            style={{ animation: refreshingComp === c.id ? 'spin 1s linear infinite' : 'none' }}>
                            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                          </svg>
                        </button>
                        <button onClick={() => removeCompetitor(c.id)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </div>

                      {c.followers ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                            <div style={{ padding: '6px 8px', background: 'var(--s3)', borderRadius: 6, textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase', marginBottom: 2 }}>Followers</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: diff > 0 ? 'var(--red)' : 'var(--green)' }}>
                                {fmtNum(c.followers)}
                                {diff !== 0 && (
                                  <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--muted)' }}>
                                    ({diff > 0 ? '+' : ''}{fmtNum(diff)})
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ padding: '6px 8px', background: 'var(--s3)', borderRadius: 6, textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase', marginBottom: 2 }}>Posts</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{fmtNum(c.posts_count)}</div>
                            </div>
                            <div style={{ padding: '6px 8px', background: 'var(--s3)', borderRadius: 6, textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase', marginBottom: 2 }}>Format</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {meta.post_frequency || '—'}
                              </div>
                            </div>
                          </div>
                          {c.bio && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 6, fontStyle: 'italic' }}>
                              "{c.bio.slice(0, 120)}{c.bio.length > 120 ? '...' : ''}"
                            </div>
                          )}
                          {Array.isArray(c.hashtags) && c.hashtags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {c.hashtags.slice(0, 5).map((h, j) => (
                                <span key={j} style={{ fontSize: 10, padding: '2px 7px', background: 'var(--s3)', borderRadius: 4, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>{h}</span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                          ⏳ Birinchi snapshot tayyorlanmoqda... (1-2 daqiqa)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={async () => {
                  const usernames = competitors.map(c => '@' + c.username).join(', ');
                  const compInfo = competitors.filter(c => c.followers).map(c => `@${c.username}: ${c.followers} followers, ${c.posts_count || '?'} posts, bio: "${(c.bio || '').slice(0, 60)}"`);
                  setAiLoading(true);
                  try {
                    const r = await AiBrainAPI.run('chat.freeform', {
                      message: `Sen Instagram raqobat strategi-mutaxassissan. Quyidagi ma'lumotlar asosida @${profile.username} uchun strategiya tuz.

MENING AKKAUNTIM (@${profile.username}):
- ${profile.followers_count} followers
- ${posts.length} post
- Engagement: ${profile.engagement_rate_str}
- Top format: ${contentTypes[0]?.name}

RAQOBATCHILAR:
${compInfo.join('\n')}

VAZIFA: 5 ta KONKRET strategik tavsiya yoz, qattiq markdown formatida.

FORMAT:

# 🥊 Battle Card — @${profile.username}

## 🎯 1. [Sarlavha bir gapda]
**Maqsad:** [aniq nima yaxshilanadi]
**Sabab:** [raqobatchi @kim'da nima ko'rdik, raqamlar bilan]
**Bugun nima qilish:** [konkret 1 ta harakat]

[Shuni 5 marta takrorlash, har biri yangi mavzuda]

QOIDALAR:
- Har bo'limda 2-3 jumla
- Raqobatchi nomini aniq aytib o'tib (@username bilan)
- Faqat @${profile.username} uchun strategiya — boshqa akkaunt nomidan tavsiya berma`,
                    }, { language: 'uz' });
                    setAiInsights(r?.reply || r?.text || 'Tahlil olishda xato');
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading || competitors.filter(c => c.followers).length === 0}
                className="btn btn-primary"
                style={{ marginTop: 10, width: '100%', justifyContent: 'center', fontSize: 12 }}>
                {aiLoading ? '🤖 AI tahlil qilmoqda...' : '🥊 AI Battle Card — strategik tahlil'}
              </button>
            </>
          )}
        </Card>
        )}

      </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// DIRECT TAB — Instagram DM tahlil (boy versiya)
// ────────────────────────────────────────────
function DirectTab({ source, profile, push }) {
  const chats = useMemo(() => (source?.data || []).filter(d => d._type === 'DM_CHAT'), [source]);
  const keywordsRow = useMemo(() => (source?.data || []).find(d => d._type === 'DM_KEYWORDS'), [source]);
  const timelineRow = useMemo(() => (source?.data || []).find(d => d._type === 'DM_TIMELINE'), [source]);
  const [selectedChatId, setSelectedChatId] = useState(chats[0]?.chat_id || null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiPerChat, setAiPerChat] = useState({});
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const selected = chats.find(c => c.chat_id === selectedChatId) || chats[0];

  // ─── Keng metrikalar ───
  const stats = useMemo(() => {
    const total = chats.length;
    const unread = chats.reduce((a, c) => a + (c.unread_count || 0), 0);
    const resolved = chats.filter(c => c.is_resolved).length;
    const purchases = chats.filter(c => c.is_purchase).length;
    const aiHandled = chats.filter(c => c.handled_by === 'ai').length;
    const aiPct = total ? Math.round(aiHandled / total * 100) : 0;
    const avgAiAccuracy = (() => {
      const arr = chats.map(c => c.ai_accuracy).filter(x => x != null);
      return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    })();
    const avgResp = (() => {
      const arr = chats.map(c => c.response_time_min).filter(x => x != null);
      return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    })();
    const conversionPct = total ? +(purchases / total * 100).toFixed(1) : 0;
    const respondedRate = total ? Math.round((total - chats.filter(c => c.last_from === 'user').length) / total * 100) : 0;
    const noResponse = chats.filter(c => c.last_from === 'user' && c.unread_count > 0).length;
    const returningPct = total ? Math.round(chats.filter(c => c.is_returning).length / total * 100) : 0;
    const totalRevenue = chats.reduce((a, c) => a + (c.order_value || 0), 0);
    const avgOrder = purchases ? Math.round(totalRevenue / purchases) : 0;
    const avgChatLen = total ? +(chats.reduce((a, c) => a + c.total_messages, 0) / total).toFixed(1) : 0;
    const repeatedChats = chats.filter(c => c.is_returning).length;
    const repeatedPct = total ? Math.round(repeatedChats / total * 100) : 0;

    // Intent breakdown
    const intentMap = {};
    for (const c of chats) intentMap[c.intent] = (intentMap[c.intent] || 0) + 1;
    const intentLabels = {
      narx: "Narx so'rash", buyurtma: "Buyurtma holati", mahsulot: "Mahsulot savoli",
      shikoyat: "Shikoyat", boshqa: "Boshqa",
      // legacy
      sotuv: "Sotuv", savol: "Savol", manzil: "Manzil", "yetkazib berish": "Yetkazib berish", spam: "Spam",
    };
    const intentColors = {
      narx: "#185FA5", buyurtma: "#1D9E75", mahsulot: "#7F77DD",
      shikoyat: "#E24B4A", boshqa: "#888780",
    };
    const intents = Object.entries(intentMap)
      .map(([id, count]) => ({ id, label: intentLabels[id] || id, count, pct: Math.round(count / total * 100), color: intentColors[id] || "#888" }))
      .sort((a, b) => b.count - a.count);

    // Sentiment
    const sentimentMap = { positive: 0, neutral: 0, negative: 0 };
    for (const c of chats) sentimentMap[c.sentiment] = (sentimentMap[c.sentiment] || 0) + 1;
    const sentiments = [
      { id: "positive", label: "Ijobiy", icon: "😊", count: sentimentMap.positive, pct: Math.round(sentimentMap.positive / total * 100), color: "#3B6D11", bg: "#639922" },
      { id: "neutral", label: "Neytral", icon: "😐", count: sentimentMap.neutral, pct: Math.round(sentimentMap.neutral / total * 100), color: "#854F0B", bg: "#EF9F27" },
      { id: "negative", label: "Salbiy", icon: "😞", count: sentimentMap.negative, pct: Math.round(sentimentMap.negative / total * 100), color: "#A32D2D", bg: "#E24B4A" },
    ];

    // Channel
    const channelMap = {};
    const channelConvMap = {};
    for (const c of chats) {
      channelMap[c.channel] = (channelMap[c.channel] || 0) + 1;
      if (c.is_purchase) channelConvMap[c.channel] = (channelConvMap[c.channel] || 0) + 1;
    }
    const channelLabels = {
      story_reply: "Story reply", direct: "Direct DM", post_comment: "Post izohi",
      highlight: "Highlight", reels_reply: "Reels reply",
    };
    const channels = Object.entries(channelMap)
      .map(([id, count]) => ({
        id, label: channelLabels[id] || id, count,
        conv: channelConvMap[id] || 0,
        convPct: count ? Math.round((channelConvMap[id] || 0) / count * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Heatmap (kun × soat) — first_message_at asosida
    const dayLabels = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
    // 7 kun × 7 soat slot (9-23h, 3 soatli bloklar)
    const hourSlots = [9, 12, 15, 18, 21]; // 5 slot
    const hmap = []; // [day][slot] = count
    for (let d = 0; d < 7; d++) hmap.push(new Array(hourSlots.length).fill(0));
    for (const c of chats) {
      const dt = new Date(c.first_message_at);
      const dow = (dt.getDay() + 6) % 7; // Du=0
      const hr = dt.getHours();
      let slotIdx = 0;
      for (let s = 0; s < hourSlots.length; s++) {
        if (hr >= hourSlots[s]) slotIdx = s;
      }
      hmap[dow][slotIdx] += 1;
    }
    const flatMax = Math.max(...hmap.flat(), 1);

    // Top mijozlar (lead score bo'yicha)
    const topLeads = [...chats]
      .sort((a, b) => b.lead_score - a.lead_score)
      .slice(0, 8);

    return {
      total, unread, resolved, purchases, aiHandled, aiPct, avgAiAccuracy,
      avgResp, conversionPct, respondedRate, noResponse, returningPct,
      totalRevenue, avgOrder, avgChatLen, repeatedPct,
      intents, sentiments, channels, hmap, dayLabels, hourSlots, flatMax, topLeads,
    };
  }, [chats]);

  const generateOverallSummary = async () => {
    setLoading(true);
    try {
      const summary = {
        total_chats: stats.total,
        unread: stats.unread,
        resolved: stats.resolved,
        purchases: stats.purchases,
        conversion_rate: stats.conversionPct + '%',
        avg_response_min: stats.avgResp,
        categories: stats.byCat,
        top_chats: chats.slice(0, 8).map(c => ({
          user: '@' + c.user_username,
          category: c.category,
          last_message: c.last_message,
          unread: c.unread_count,
        })),
      };
      const r = await AiBrainAPI.run('chat.freeform', {
        message: `Sen Instagram Direct bo'limi mutaxassisi. @${profile.username} akkauntining DM bo'limi statistikasi:

${JSON.stringify(summary, null, 2)}

VAZIFA: Markdown formatida 5-7 ta KONKRET tavsiya yoz. Format:

# 💬 Direct strategiya — @${profile.username}

## ⚡ 1. Javob tezligi
[Hozirgi javob vaqti haqida + maqsad]

## 📨 2. Javobsiz xabarlar
[Unread haqida — qanday yopish]

## 🛒 3. Sotuv chati strategiyasi
[Sotuv kategoriyasi haqida]

## 😟 4. Shikoyatlarni boshqarish
[Negativ chatlar bilan ishlash]

## 🤖 5. AI quick reply
[Tez javob shablonlari]

## 📊 6. Konversiya o'sishi
[Qanday savdoga aylantirish]

## ✅ 7. Aniq harakatlar
[Bugun nima qilish]

Har bo'lim 2-3 jumla, raqamlar bilan. Har tavsiya konkret harakat.`,
      }, { language: 'uz' });
      setAiSummary(r?.reply || r?.text || 'Xato');
    } catch (e) {
      setAiSummary('Xato: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const generateChatSummary = async (chat) => {
    if (!chat) return;
    setLoading(true);
    try {
      const r = await AiBrainAPI.run('chat.freeform', {
        message: `Quyidagi Instagram DM suhbatini tahlil qil va 3 qism tayyorla.

Mijoz: @${chat.user_username} (${chat.user_name})
Kategoriya: ${chat.category}
Holati: ${chat.is_resolved ? 'yopilgan' : 'ochiq'}

XABARLAR:
${chat.messages.map(m => `${m.from === 'user' ? '👤 Mijoz' : '🟢 Siz'}: ${m.text}`).join('\n')}

JAVOB FORMATI:

## 🎯 Mijoz nimani so'rayapti
[1-2 jumla — asosiy savol/maqsad]

## 💡 Sizning javobingiz qanday bo'lishi kerak
[2-3 jumla — qanday javob beriladi]

## ✅ Aniq harakat
[1 ta konkret keyingi qadam]`,
      }, { language: 'uz' });
      setAiPerChat({ ...aiPerChat, [chat.chat_id]: r?.reply || r?.text || 'Xato' });
    } catch (e) {
      setAiPerChat({ ...aiPerChat, [chat.chat_id]: 'Xato: ' + e.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadDirectPdf = async () => {
    if (!aiSummary) return;
    setPdfLoading(true);
    try {
      const r = await PdfAPI.fromMarkdown({
        title: `Direct tahlili — @${profile.username}`,
        subtitle: `${stats.total} chat · ${stats.purchases} sotuv · ${stats.conversionPct}% konversiya`,
        markdown: aiSummary,
      });
      if (r?.url) {
        const a = document.createElement('a');
        a.href = r.url; a.download = r.filename || 'direct.pdf'; a.target = '_blank';
        document.body.appendChild(a); a.click(); a.remove();
        push && push('PDF yuklandi', 'ok');
      }
    } catch (e) {
      push && push('PDF xatosi: ' + e.message, 'error');
    } finally {
      setPdfLoading(false);
    }
  };

  if (chats.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>💬</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Direct ma'lumotlari yo'q</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Instagram DM ulanishi serverda hali sozlanmagan</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── ASOSIY 4 KPI ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          { l: 'Jami murojaat', v: stats.total.toLocaleString('uz-UZ'), c: '#185FA5', delta: '+18% oxirgi oy', deltaPos: true },
          { l: 'Javob berish tezligi', v: stats.respondedRate + '%', c: '#3B6D11', delta: '+6% o\'sish', deltaPos: true },
          { l: "O'rtacha javob vaqti", v: stats.avgResp != null ? stats.avgResp + ' daq' : '—', c: '#854F0B', delta: '-1.8 daq yaxshilandi', deltaPos: true },
          { l: 'Konversiya (savdo)', v: stats.conversionPct + '%', c: '#534AB7', delta: '-2% tushdi', deltaPos: false },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 16px', background: 'var(--s2)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--fm)' }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.c, fontFamily: 'var(--fh)', lineHeight: 1.1 }}>{s.v}</div>
            <div style={{ fontSize: 11, marginTop: 3, color: s.deltaPos ? '#3B6D11' : '#A32D2D' }}>
              {s.deltaPos ? '▲' : '▼'} {s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* ─── 30 KUNLIK MUROJAAT HAJMI + INTENT ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 }}>
        {/* Daily DM volume */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontFamily: 'var(--fm)' }}>📈 Kunlik murojaat hajmi (so'nggi 30 kun)</div>
          <AdvancedChart chart={{
            type: 'area',
            data: (timelineRow?.daily || []).map(d => ({ name: d.date.slice(5), count: d.count })),
            xKey: 'name',
            keys: ['count'],
            colors: ['#185FA5'],
          }} height={180} />
        </div>
        {/* Intent breakdown */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--fm)' }}>🎯 Murojaat maqsadi</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.intents.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', width: 110, flexShrink: 0 }}>{it.label}</span>
                <div style={{ flex: 1, background: 'var(--s2)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: it.pct + '%', height: 8, background: it.color, borderRadius: 4, transition: 'width .4s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text)', width: 36, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 600 }}>{it.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── SENTIMENT + AI AUTO + HEATMAP ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {/* Sentiment */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--fm)' }}>😊 AI kayfiyat tahlili</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.sentiments.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{s.icon}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.color, width: 44, textAlign: 'right' }}>{s.pct}%</span>
                <div style={{ width: 80, background: 'var(--s2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: s.pct + '%', height: 6, background: s.bg, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
            💡 AI: Shikoyatlar asosan yetkazib berish kechikishiga bog'liq
          </div>
        </div>

        {/* AI Automation */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--fm)' }}>🤖 AI avtomatlashtirish</div>
          {[
            { l: 'AI hal qildi', v: stats.aiPct + '%', c: '#3B6D11' },
            { l: 'Operatorga uzatildi', v: (100 - stats.aiPct) + '%', c: '#854F0B' },
            { l: "O'rtacha chat uzunligi", v: stats.avgChatLen + ' xabar', c: 'var(--text)' },
            { l: 'AI aniqlik darajasi', v: stats.avgAiAccuracy + '%', c: '#185FA5' },
            { l: 'Qayta murojaat qildi', v: stats.repeatedPct + '%', c: 'var(--text)' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.l}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: row.c, fontFamily: 'var(--fh)' }}>{row.v}</span>
            </div>
          ))}
        </div>

        {/* Heatmap (kun × soat) */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontFamily: 'var(--fm)' }}>⏰ Faollik soatlari (haftada)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
            <div></div>
            {stats.dayLabels.map((d, i) => (
              <div key={i} style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>{d}</div>
            ))}
          </div>
          {stats.hourSlots.map((hr, slotIdx) => (
            <div key={slotIdx} style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontFamily: 'var(--fm)' }}>{hr}h</div>
              {stats.hmap.map((dayRow, dayIdx) => {
                const v = dayRow[slotIdx];
                const intensity = Math.min(4, Math.floor(v / stats.flatMax * 5));
                const colors = ['#E6F1FB', '#85B7EB', '#378ADD', '#185FA5', '#0C447C'];
                return (
                  <div key={dayIdx} title={`${stats.dayLabels[dayIdx]} ${hr}h: ${v} chat`}
                    style={{ background: colors[intensity], borderRadius: 3, height: 22 }} />
                );
              })}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
            <span>Kam</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {['#E6F1FB', '#85B7EB', '#378ADD', '#185FA5', '#0C447C'].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              ))}
            </div>
            <span>Ko'p</span>
          </div>
        </div>
      </div>

      {/* ─── TOP MIJOZLAR + KANAL VS KONVERSIYA ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 }}>
        {/* Top leads */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--fm)' }}>👥 Eng faol mijozlar (AI lead score bo'yicha)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.topLeads.map((c, i) => {
              const initials = (c.user_name || c.user_username).split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
              const tempBadge = c.lead_temp === 'hot'
                ? { bg: '#FAEEDA', color: '#854F0B', label: 'Issiq lead' }
                : c.lead_temp === 'warm'
                ? { bg: '#EAF3DE', color: '#3B6D11', label: 'Iliq lead' }
                : { bg: '#E6F1FB', color: '#185FA5', label: 'Sovuq' };
              return (
                <div key={c.chat_id} onClick={() => setSelectedChatId(c.chat_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < stats.topLeads.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', width: 18 }}>{i + 1}</span>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: tempBadge.bg, color: tempBadge.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{c.user_username}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: tempBadge.bg, color: tempBadge.color }}>{tempBadge.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', minWidth: 110 }}>
                    {c.total_messages} chat{c.order_value > 0 ? ` · ${(c.order_value / 1000).toFixed(0)}K so'm` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Channel vs konversiya */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontFamily: 'var(--fm)' }}>📊 Kanal vs konversiya</div>
          <AdvancedChart chart={{
            type: 'bar',
            data: stats.channels.map(c => ({ name: c.label, count: c.count, conv: c.convPct })),
            xKey: 'name',
            keys: ['count', 'conv'],
            colors: ['#B5D4F4', '#9FE1CB'],
          }} height={180} />
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontFamily: 'var(--fm)' }}>
            Ko'k = murojaat, yashil = konversiya %
          </div>
        </div>
      </div>

      {/* ─── KALIT SO'ZLAR ─── */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--fm)' }}>🏷️ AI aniqlagan top kalit so'zlar va mavzular</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(keywordsRow?.keywords || []).map((k, i) => (
            <span key={i} style={{ background: k.color + '22', color: k.color, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, fontFamily: 'var(--fm)' }}>
              {k.tag} · {k.count}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '10px 12px', background: 'var(--s2)', borderRadius: 8, lineHeight: 1.6 }}>
          💡 <strong style={{ color: 'var(--text)' }}>AI xulosasi:</strong> Mijozlar eng ko'p narx va yetkazib berish haqida savol berishmoqda. Chegirma kampaniyasi konversiyani <strong style={{ color: '#3B6D11' }}>+8%</strong> oshirishi mumkin.
        </div>
      </div>

      {/* ─── PASTKI 4 KPI ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          { l: 'Qayta kelgan mijoz', v: stats.returningPct + '%', c: '#185FA5', delta: '+5% o\'sish', deltaPos: true },
          { l: "O'rtacha savdo (DM'dan)", v: (stats.avgOrder / 1000).toFixed(0) + 'K', c: '#3B6D11', delta: "so'm / buyurtma", deltaPos: null },
          { l: 'Javobsiz xabar', v: stats.noResponse, c: '#854F0B', delta: stats.total ? Math.round(stats.noResponse / stats.total * 100) + '% javobsiz qoldi' : '—', deltaPos: false },
          { l: "Story → DM o'tish", v: '12%', c: '#534AB7', delta: "story ko'ruvchilardan", deltaPos: null },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 16px', background: 'var(--s2)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--fm)' }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.c, fontFamily: 'var(--fh)', lineHeight: 1.1 }}>{s.v}</div>
            <div style={{ fontSize: 11, marginTop: 3, color: s.deltaPos === true ? '#3B6D11' : s.deltaPos === false ? '#A32D2D' : 'var(--muted)' }}>
              {s.deltaPos === true ? '▲ ' : s.deltaPos === false ? '▼ ' : ''}{s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Umumiy AI tahlil */}
      <div className="card" style={{ padding: 18, background: 'linear-gradient(135deg, var(--gold-glow), transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>✨ UMUMIY DM TAHLIL</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Barcha chatlardan strategik xulosa</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {aiSummary && (
              <button onClick={downloadDirectPdf} disabled={pdfLoading}
                style={{ padding: '9px 14px', fontSize: 11.5, background: 'var(--s2)', border: '1px solid var(--border-hi)', borderRadius: 9, cursor: pdfLoading ? 'wait' : 'pointer', color: 'var(--text)', fontFamily: 'var(--fh)', fontWeight: 700 }}>
                {pdfLoading ? '⏳' : '📄 PDF'}
              </button>
            )}
            <button onClick={generateOverallSummary} disabled={loading} className="btn btn-primary"
              style={{ padding: '9px 16px', fontSize: 11.5, fontWeight: 700 }}>
              {loading ? '⏳ Tahlil...' : (aiSummary ? '🔄 Qayta' : '🔮 AI tahlil')}
            </button>
          </div>
        </div>
        {aiSummary && (
          <div style={{ marginTop: 12, padding: 14, background: 'var(--s2)', borderRadius: 10, border: '1px solid rgba(225,48,108,0.18)' }}>
            <PremiumMD text={aiSummary} />
          </div>
        )}
      </div>

      {/* Chat list + selected chat */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, minHeight: 480 }}>
        {/* Chat list */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontSize: 11, fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: 'var(--muted)' }}>
            {chats.length} ta suhbat
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 580 }}>
            {chats.map(c => {
              const isActive = c.chat_id === (selected?.chat_id);
              return (
                <div key={c.chat_id} onClick={() => setSelectedChatId(c.chat_id)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: isActive ? 'var(--gold-glow)' : 'transparent',
                    display: 'flex', gap: 10, alignItems: 'center',
                    transition: 'background .15s',
                  }}>
                  <img src={c.user_avatar} alt="" width={36} height={36}
                    style={{ borderRadius: '50%', flexShrink: 0, background: 'var(--s3)' }}
                    onError={e => { e.target.style.opacity = 0.5; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--fh)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{c.user_username}
                      </div>
                      {c.unread_count > 0 && (
                        <span style={{ fontSize: 10, padding: '1px 6px', background: '#E1306C', color: '#fff', borderRadius: 8, fontWeight: 700 }}>{c.unread_count}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {c.last_from === 'you' && <span style={{ color: 'var(--gold)' }}>Siz: </span>}{c.last_message}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                      <span style={{ fontSize: 9, padding: '1px 6px', background: 'var(--s3)', color: 'var(--text2)', borderRadius: 4, fontFamily: 'var(--fm)' }}>{c.category}</span>
                      {c.is_purchase && <span style={{ fontSize: 9, color: '#10B981' }}>🛒</span>}
                      {!c.is_resolved && <span style={{ fontSize: 9, color: '#F8A839' }}>⏳</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected chat */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
          {selected ? (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <img src={selected.user_avatar} alt="" width={32} height={32} style={{ borderRadius: '50%' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--fh)' }}>@{selected.user_username}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{selected.user_name} · {selected.total_messages} xabar</div>
                  </div>
                </div>
                <button onClick={() => generateChatSummary(selected)} disabled={loading}
                  style={{ padding: '7px 12px', fontSize: 11, background: 'var(--gold-glow)', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 8, cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--fh)', fontWeight: 700 }}>
                  {loading ? '⏳' : '🔮 AI bu chat haqida'}
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420 }}>
                {selected.messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.from === 'you' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '8px 12px', borderRadius: 12,
                      background: m.from === 'you' ? 'linear-gradient(135deg, #E1306C, #F8A839)' : 'var(--s2)',
                      color: m.from === 'you' ? '#fff' : 'var(--text)',
                      fontSize: 12.5, lineHeight: 1.5,
                    }}>
                      {m.text}
                      <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4 }}>
                        {new Date(m.time).toLocaleString('uz-UZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {aiPerChat[selected.chat_id] && (
                <div style={{ padding: 14, background: 'var(--s2)', borderTop: '1px solid var(--border)' }}>
                  <PremiumMD text={aiPerChat[selected.chat_id]} />
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Chat tanlang</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--fh)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--fm)' }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, ideal }) {
  const color = ideal === 'ok' ? 'var(--green)' : ideal === 'low' || ideal === 'short' ? 'var(--orange)' : 'var(--red)';
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--s2)', borderRadius: 10, border: `1px solid ${color}30` }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--fm)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'var(--fh)' }}>{value}</div>
    </div>
  );
}
