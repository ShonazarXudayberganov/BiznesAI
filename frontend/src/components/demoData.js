/**
 * Demo data generator — Instagram, AmoCRM, Facebook Ads dashboardlari uchun.
 *
 * AmoCRM API qaytaradigan ma'lumotlar (real):
 *   - leads, contacts, companies, tasks, notes, calls, events, pipelines,
 *     custom_fields, sources, tags, loss_reasons, users, time_in_pipeline
 *
 * Facebook Ads API qaytaradigan ma'lumotlar (real):
 *   - campaigns, adsets, ads, insights: impressions/reach/frequency,
 *     clicks/CTR, spend/CPC/CPM, conversions, video_views (3sec, 25%, 50%, 75%, 100%),
 *     engagement (likes, comments, shares, saves),
 *     demographic breakdown (age, gender, region),
 *     placement (FB feed, IG feed, Stories, Reels),
 *     device type, hour of day, ROAS, LTV
 */

const seed = 42;
let _rng = seed;
function rnd() { _rng = (_rng * 9301 + 49297) % 233280; return _rng / 233280; }
function rndInt(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }
function rndChoice(arr) { return arr[Math.floor(rnd() * arr.length)]; }

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function dateTimeNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(rndInt(8, 22), rndInt(0, 59), 0, 0);
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────
// INSTAGRAM DEMO
// ─────────────────────────────────────────────────────────────
const IG_CAPTIONS = [
  "Bugun yangi kollektsiya keldi! 🎉 Toshkent filialida qishki qo'lqop va kepkalar mavjud. Yetkazib berish bepul.",
  "Mijozlarimizdan biri: 'Sizning mahsulotingizni 3 yildan beri ishlataman, sifati har doim a'lo!' Rahmat sizga 💚",
  "Eng ko'p sotilgan mahsulot — premium charm sumka. 100% asl charm, Italiyada ishlangan. Buyurtma uchun DM 📩",
  "Yangi reel — qanday qilib mahsulotimizni 30 soniyada o'rab beramiz. Comment'da fikringizni qoldiring!",
  "Tushlik vaqti — jamoamiz Buxoro pizza yeyapti 🍕 Siz bugun nima yedingiz?",
  "Black Friday boshlandi! 50% chegirma — faqat 3 kun. Linkda batafsil 🔥",
  "Mahsulot fotosurati behind-the-scenes — rasm qilish 4 soat davom etdi 📸",
  "Mijozlarimiz fikri: 'Tezkor yetkazib berish, sifatli mahsulot, do'stona xizmat'. Rahmat sizga!",
  "Yangi tag: #sifatlidukon va #biznes_uz — bizni kuzating va do'stlaringizga ulashing.",
  "Eng kuchli sotuvchi: Otabek aka — bu oy 47 ta mijoz xizmat qildi. Tabriklaymiz! 🏆",
];
const IG_HASHTAGS = [
  "#toshkent", "#uzbekistan", "#sifatli", "#online_dukon", "#yetkazib_berish",
  "#brand_uz", "#yangimahsulot", "#chegirma", "#kollektsiya", "#mahsulot",
  "#tashkent", "#shopping", "#fashion", "#style", "#trend",
  "#biznes_uz", "#savdo", "#mijoz", "#sifat", "#premium",
];
const POST_TYPES = ["IMAGE", "CAROUSEL_ALBUM", "VIDEO"];

function generateInstagramSource() {
  const followersBase = 18540;
  const posts = [];
  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(i * 3 + rnd() * 2);
    const date = dateNDaysAgo(daysAgo);
    const type = rndChoice(POST_TYPES);
    const baseEng = type === "VIDEO" ? rndInt(800, 3500) : type === "CAROUSEL_ALBUM" ? rndInt(400, 1800) : rndInt(250, 1200);
    const likes = Math.floor(baseEng * 0.85);
    const comments = Math.floor(baseEng * 0.10);
    const saved = Math.floor(baseEng * 0.04);
    const shares = Math.floor(baseEng * 0.03);
    const reach = Math.floor(baseEng * rndInt(8, 18));
    const impressions = Math.floor(reach * (1 + rnd() * 0.4));
    const captionBase = rndChoice(IG_CAPTIONS);
    const tags = [];
    const tagCount = rndInt(3, 8);
    const shuffled = [...IG_HASHTAGS].sort(() => rnd() - 0.5);
    for (let t = 0; t < tagCount; t++) tags.push(shuffled[t]);
    posts.push({
      _type: "POST", id: `demo_post_${i}`, caption: captionBase + " " + tags.join(" "),
      type, date, time: `${rndInt(8, 22)}:${rndInt(0, 5) * 10}0`.replace(":00", ":00"),
      likes, comments, reach, impressions, saved, shares,
      plays: type === "VIDEO" ? rndInt(reach * 2, reach * 5) : 0,
      engagement: likes + comments + saved + shares,
      engRate: +(((likes + comments + saved + shares) / followersBase) * 100).toFixed(1),
      url: `https://instagram.com/p/demo${i}`,
    });
  }
  const stories = [];
  for (let i = 0; i < 14; i++) {
    stories.push({
      _type: "STORY", id: `demo_story_${i}`, type: rnd() > 0.4 ? "VIDEO" : "IMAGE",
      date: dateNDaysAgo(i),
      reach: rndInt(800, 2500), impressions: rndInt(900, 3000),
      replies: rndInt(0, 25), exits: rndInt(50, 200), taps: rndInt(150, 600),
    });
  }
  const dailyReach = [], dailyImpressions = [], followerDaily = [];
  let curFollowers = followersBase - 280;
  for (let i = 29; i >= 0; i--) {
    const date = dateNDaysAgo(i);
    const baseR = 4000 + rndInt(0, 2500);
    dailyReach.push({ date, value: baseR });
    dailyImpressions.push({ date, value: Math.floor(baseR * 1.35) });
    curFollowers += rndInt(2, 18) - rndInt(0, 4);
    followerDaily.push({ date, value: curFollowers });
  }
  const reach30d = dailyReach.reduce((a, d) => a + d.value, 0);
  const imp30d = dailyImpressions.reduce((a, d) => a + d.value, 0);
  const totalEng = posts.reduce((a, p) => a + p.engagement, 0);
  const profile = {
    _type: "PROFIL_STATISTIKA", username: "demo_brand_uz", name: "Demo Brand · Toshkent",
    biography: "Toshkentdagi premium online do'kon · 5+ yil tajriba · Bepul yetkazib berish · DM orqali buyurtma 📩",
    profile_picture_url: "https://api.dicebear.com/7.x/shapes/svg?seed=demobrand&backgroundColor=E1306C,F8A839,405DE6&backgroundType=gradientLinear",
    followers_count: followersBase, follows_count: 412, media_count: 234,
    is_verified: false, business_category: "Retail",
    avg_likes_per_post: Math.round(posts.reduce((a, p) => a + p.likes, 0) / posts.length),
    avg_comments_per_post: Math.round(posts.reduce((a, p) => a + p.comments, 0) / posts.length),
    avg_reach_per_post: Math.round(posts.reduce((a, p) => a + p.reach, 0) / posts.length),
    avg_impressions_per_post: Math.round(posts.reduce((a, p) => a + p.impressions, 0) / posts.length),
    fetched_posts: posts.length,
    engagement_rate: +((totalEng / posts.length / followersBase) * 100).toFixed(2),
    engagement_rate_str: ((totalEng / posts.length / followersBase) * 100).toFixed(1) + "%",
    profile_insights: { reach: reach30d, impressions: imp30d, profile_views_count: 8420, online_followers: 14200 },
    daily_reach: dailyReach, daily_impressions: dailyImpressions,
    reach_30d: reach30d, impressions_30d: imp30d,
    reach_change_pct: 18.4, impressions_change_pct: 12.7,
    follower_growth: 280, follower_growth_pct: 1.6, follower_daily: followerDaily,
    online_followers: { 19: 320, 20: 410, 21: 520, 22: 480, 18: 280, 17: 240, 16: 210 },
    audience: {
      follower_demographics_city: { Toshkent: 8420, Samarqand: 2100, Buxoro: 1480, Andijon: 1200, "Farg'ona": 980, Namangan: 720 },
      follower_demographics_country: { UZ: 16800, RU: 1200, KZ: 280, US: 120, TR: 80 },
    },
    top_cities: [
      { name: "Toshkent", value: 8420 }, { name: "Samarqand", value: 2100 },
      { name: "Buxoro", value: 1480 }, { name: "Andijon", value: 1200 },
      { name: "Farg'ona", value: 980 }, { name: "Namangan", value: 720 },
    ],
    top_countries: [
      { name: "UZ", value: 16800 }, { name: "RU", value: 1200 }, { name: "KZ", value: 280 },
    ],
    stories_count: stories.length, stories_data: stories,
    top_post_caption: posts[0].caption,
    top_post_engagement: Math.max(...posts.map(p => p.engagement)),
    last_updated: new Date().toLocaleString("uz-UZ"),
  };
  // Instagram Direct (DM) demo
  // ── DIRECT (DM) — boy ma'lumotlar to'plami ──
  // Intent taqsimoti taxminan: narx 38%, buyurtma 24%, mahsulot 18%, shikoyat 11%, boshqa 9%
  const intentDistribution = [
    { id: "narx", weight: 38, label: "Narx so'rash" },
    { id: "buyurtma", weight: 24, label: "Buyurtma holati" },
    { id: "mahsulot", weight: 18, label: "Mahsulot savoli" },
    { id: "shikoyat", weight: 11, label: "Shikoyat" },
    { id: "boshqa", weight: 9, label: "Boshqa" },
  ];
  const channels = [
    { id: "story_reply", label: "Story reply", weight: 38, conv: 31 },
    { id: "direct", label: "Direct DM", weight: 28, conv: 28 },
    { id: "post_comment", label: "Post izohi", weight: 16, conv: 14 },
    { id: "highlight", label: "Highlight", weight: 11, conv: 18 },
    { id: "reels_reply", label: "Reels reply", weight: 7, conv: 9 },
  ];
  const pickWeighted = (list) => {
    const total = list.reduce((a, x) => a + x.weight, 0);
    let r = rnd() * total;
    for (const x of list) { r -= x.weight; if (r <= 0) return x; }
    return list[0];
  };
  const dmFirstNames = ["Otabek", "Aziza", "Bobur", "Maftuna", "Sardor", "Nilufar", "Jamshid", "Madina", "Akmal", "Dilfuza", "Rustam", "Shahnoza", "Muhammad", "Zulfiya", "Jasur", "Saodat", "Diyor", "Lola", "Shoh", "Kamola"];
  const dmTexts = {
    narx: ["Salom, narxi qancha?", "Toptan narx bormi?", "Aksiya bormi?", "Chegirma berasiz mi?", "1 ta uchun narx ayting", "Narxlar saytda yangimi?"],
    buyurtma: ["Buyurtmam qachon yetib boradi?", "Tracking number bering iltimos", "Buyurtmam kelmadi hali", "Mening orderim qayerda?", "Yetkazib berish ertaga bo'ladimi?"],
    mahsulot: ["Razmer bor mi?", "Material qanday?", "Boshqa rang bormi?", "Stock bormi?", "Sifati qanday?", "Original mi?", "Originalmi yoki replikami?"],
    shikoyat: ["Sifati past chiqdi", "Buyurtmam vaqtida kelmadi", "Qaytarib yuborsam bo'ladimi?", "Telefonga javob bermayapsiz", "Mahsulot buzuq chiqdi", "Pulimni qaytaring", "Yetkazib berish juda kechikdi"],
    boshqa: ["Salom!", "Sizdan dasturchi kerakmi?", "Hamkorlik taklif", "Filialingiz qayerda?", "Ish vaqtingiz?", "Yangi mahsulot bormi?"],
  };
  const responses = {
    narx: ["Narxi 285.000 so'm", "Aksiya bor — bu hafta -15%", "Toptan minimum 5 ta", "Bugun maxsus 250.000 so'm", "Chegirma 10% sizga"],
    buyurtma: ["1-2 kun ichida yetib boradi", "Track raqami: TX248391", "Hozir tekshirib aytaman", "Ertaga 14:00gacha kuryer kelaadi", "Buyurtma yo'lda, sabr qiling"],
    mahsulot: ["Hamma o'lcham bor", "100% paxta", "Qora, oq, qizil — 3 rang", "Stock bor 12 ta", "Original, kafolat 6 oy", "Sertifikat bor"],
    shikoyat: ["Uzr so'rayman, almashtirib beraman", "Hozir menejerga aytaman", "Pulingizni qaytarib beramiz", "1-3 kun ichida hal qilamiz", "Boshqa mahsulot yuborsak bo'ladimi?"],
    boshqa: ["Yo'q, hozircha yo'q", "Tashrif buyuring", "Salom, marhamat", "Manzilimiz: Yunusobod 12-uy", "9:00 - 21:00 har kuni"],
  };
  const dmChats = [];
  // 200 ta chat — kattaroq hajm
  const TOTAL_CHATS = 200;
  for (let i = 0; i < TOTAL_CHATS; i++) {
    const intent = pickWeighted(intentDistribution).id;
    const channel = pickWeighted(channels).id;
    const firstName = rndChoice(dmFirstNames);
    const username = (firstName.toLowerCase() + "_" + rndInt(80, 99) + (rnd() > 0.5 ? "uz" : "")).replace(/[^a-z0-9_]/g, "");
    // 30 kun ichida tarqalgan — bugundan eskigacha
    const daysAgo = Math.floor(rnd() * 30);
    const messageCount = rndInt(2, 18);
    const messages = [];
    // Faollik 18-22h cho'qqi
    const hourBase = rnd() < 0.45 ? rndInt(18, 22) : rndInt(9, 23);
    let cur = Date.now() - daysAgo * 86400000;
    cur = new Date(cur).setHours(hourBase, rndInt(0, 59), 0, 0);
    for (let m = 0; m < messageCount; m++) {
      const fromUser = m % 2 === 0;
      const text = fromUser
        ? rndChoice(dmTexts[intent] || dmTexts.boshqa)
        : rndChoice(responses[intent] || responses.boshqa);
      cur += rndInt(1, 30) * 60 * 1000;
      messages.push({ from: fromUser ? "user" : "you", text, time: new Date(cur).toISOString() });
    }
    const lastMsg = messages[messages.length - 1];

    // Sentiment: shikoyat → ko'pincha salbiy, narx/mahsulot → neytral, buyurtma → ijobiy
    let sentiment;
    if (intent === "shikoyat") sentiment = rnd() < 0.75 ? "negative" : "neutral";
    else if (intent === "buyurtma") sentiment = rnd() < 0.55 ? "positive" : "neutral";
    else sentiment = rnd() < 0.5 ? "positive" : (rnd() < 0.6 ? "neutral" : "negative");

    // AI tomonidan hal qilingan: 68% — basit savollarda
    const aiHandled = (intent === "narx" || intent === "mahsulot" || intent === "boshqa")
      ? rnd() < 0.85 : rnd() < 0.45;
    const aiAccuracy = aiHandled ? rndInt(85, 98) : rndInt(70, 90);

    const isResolved = rnd() > 0.30 && intent !== "shikoyat" || rnd() > 0.50;
    const responseTimes = [];
    for (let m = 1; m < messages.length; m++) {
      if (messages[m].from === "you" && messages[m - 1].from === "user") {
        const dt = (new Date(messages[m].time) - new Date(messages[m - 1].time)) / 60000;
        responseTimes.push(dt);
      }
    }
    const avgResponse = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

    // Konversiya: 23% chat sotuvga aylanadi
    const isPurchase = rnd() < 0.23 && (intent === "buyurtma" || intent === "narx" || intent === "mahsulot");
    const orderValue = isPurchase ? rndInt(80, 800) * 1000 : 0;
    const isReturning = rnd() < 0.34;

    // Lead score: 0-100 — chat soni, sotuv, intent
    const leadScore = Math.min(100, Math.round(
      messageCount * 3 +
      (isPurchase ? 30 : 0) +
      (isReturning ? 15 : 0) +
      (intent === "narx" || intent === "buyurtma" ? 20 : 0) +
      rndInt(0, 15)
    ));
    const leadTemp = leadScore >= 70 ? "hot" : leadScore >= 45 ? "warm" : "cold";

    dmChats.push({
      _type: "DM_CHAT",
      chat_id: `dm_${i}`,
      user_username: username,
      user_name: firstName + " " + rndChoice(AMO_LAST_NAMES),
      user_avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      last_message: lastMsg.text,
      last_message_time: lastMsg.time,
      last_from: lastMsg.from,
      unread_count: rnd() > 0.94 ? rndInt(1, 4) : 0,
      total_messages: messageCount,
      messages,
      // ── Yangi metrikalar ──
      intent,
      intent_label: intentDistribution.find(x => x.id === intent)?.label,
      channel,
      channel_label: channels.find(x => x.id === channel)?.label,
      sentiment, // 'positive'|'neutral'|'negative'
      handled_by: aiHandled ? "ai" : "operator",
      ai_accuracy: aiAccuracy,
      lead_score: leadScore,
      lead_temp: leadTemp, // hot/warm/cold
      order_value: orderValue,
      is_returning: isReturning,
      response_time_min: avgResponse,
      is_resolved: isResolved,
      is_purchase: isPurchase,
      first_message_at: messages[0].time,
      // legacy uchun
      category: intent,
    });
  }

  // Top kalit so'zlar (HTML'dan)
  const dmKeywords = {
    _type: "DM_KEYWORDS",
    keywords: [
      { tag: "narx", count: 247, color: "#185FA5" },
      { tag: "yetkazib berish", count: 198, color: "#27500A" },
      { tag: "chegirma", count: 176, color: "#3C3489" },
      { tag: "sifat", count: 134, color: "#633806" },
      { tag: "qaytarish", count: 89, color: "#085041" },
      { tag: "kechikish", count: 72, color: "#791F1F" },
      { tag: "stock bormi", count: 65, color: "#0C447C" },
      { tag: "boshqa rang", count: 54, color: "#444441" },
      { tag: "razmer", count: 48, color: "#185FA5" },
      { tag: "original", count: 42, color: "#3C3489" },
    ],
  };

  // 30 kunlik DM hajm (jami chatlardan kelib chiqib)
  const dmDailyVolume = (() => {
    const map = {};
    for (let d = 29; d >= 0; d--) {
      const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      map[date] = 0;
    }
    for (const c of dmChats) {
      const k = String(c.first_message_at).slice(0, 10);
      if (k in map) map[k] += 1;
    }
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  })();

  const dmTimeline = { _type: "DM_TIMELINE", daily: dmDailyVolume };

  return {
    id: "demo_instagram_main", type: "instagram", name: "Demo Brand Instagram",
    color: "#E1306C", connected: true, active: true,
    data: [profile, ...posts, ...stories, ...dmChats, dmKeywords, dmTimeline], isDemo: true,
    config: { mode: "demo", username: profile.username },
    createdAt: dateNDaysAgo(90), updatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// AMOCRM DEMO — to'liq pipeline + tasks + calls + notes + custom fields
// ─────────────────────────────────────────────────────────────
const AMO_PIPELINE_STAGES = [
  { id: "new", name: "Yangi lid", color: "#94A3B8", order: 1 },
  { id: "contact", name: "Aloqa qilindi", color: "#60A5FA", order: 2 },
  { id: "qualified", name: "Munosib", color: "#A78BFA", order: 3 },
  { id: "proposal", name: "Taklif yuborildi", color: "#F8A839", order: 4 },
  { id: "negotiation", name: "Muzokara", color: "#FBBF24", order: 5 },
  { id: "closed_won", name: "Yutib olindi", color: "#10B981", order: 6 },
  { id: "closed_lost", name: "Yo'qotildi", color: "#EF4444", order: 7 },
];
const AMO_FIRST_NAMES = ["Otabek", "Aziz", "Bobur", "Sardor", "Rustam", "Jamshid", "Komiljon", "Aziza", "Maftuna", "Nilufar", "Muhabbat", "Madina", "Dilfuza", "Shahnoza", "Akmal", "Davron"];
const AMO_LAST_NAMES = ["Abdullayev", "Nazarov", "Karimov", "Yuldashev", "Toshmatov", "Yusupov", "Rahimov", "Ergashev", "Saidov", "Olimov", "Tursunov", "Mirzayev"];
const AMO_PRODUCTS = [
  { name: "MacBook Air M3", category: "Apple", price: 18000000 },
  { name: "iPhone 15 Pro", category: "Apple", price: 14500000 },
  { name: "AirPods Pro", category: "Apple", price: 3200000 },
  { name: "iPad Pro 11", category: "Apple", price: 11000000 },
  { name: "Apple Watch SE", category: "Apple", price: 3800000 },
  { name: "Web sayt yaratish", category: "IT xizmat", price: 8000000 },
  { name: "Mobil ilova", category: "IT xizmat", price: 15000000 },
  { name: "SMM xizmat (oylik)", category: "Marketing", price: 5000000 },
  { name: "Brendbuk va logo", category: "Dizayn", price: 4500000 },
  { name: "SEO optimizatsiya", category: "Marketing", price: 6000000 },
  { name: "PPC kampaniya", category: "Marketing", price: 7500000 },
  { name: "Email marketing", category: "Marketing", price: 3000000 },
];
const AMO_SOURCES = ["Instagram", "Facebook Ads", "Telegram", "Web sayt", "Tavsiya", "Tug'ridan qo'ng'iroq", "Google Ads", "LinkedIn"];
const AMO_LOSS_REASONS = ["Narx qimmat", "Raqobatchini tanladi", "Xohlamadi", "Aloqa yo'qotildi", "Loyiha bekor qilindi", "Vaqti emas", "Boshqa platformani tanladi"];
const AMO_TAGS = ["yuqori-prioritet", "qaytib-keladi", "kreditda", "naqd", "katta-buyurtma", "VIP", "online", "offline", "shoshilinch"];
const AMO_MANAGERS = ["Otabek Rashidov", "Aziza Yusupova", "Sardor Karimov", "Maftuna Olimova", "Bobur Nazarov", "Dilfuza Tursunova"];
const TASK_TYPES = ["Qo'ng'iroq", "Email yuborish", "Uchrashuv", "Taklif tayyorlash", "Hujjat tekshirish", "Follow-up"];

function generateAmoCRMSource() {
  // 100 ta lid (avval 60 edi)
  const leads = [];
  for (let i = 0; i < 100; i++) {
    const daysAgo = rndInt(0, 120);
    const stage = i < 18 ? AMO_PIPELINE_STAGES[5] // closed_won (18%)
      : i < 28 ? AMO_PIPELINE_STAGES[6] // closed_lost (10%)
        : AMO_PIPELINE_STAGES[rndInt(0, 4)];
    const product = rndChoice(AMO_PRODUCTS);
    const variance = 0.7 + rnd() * 0.6;
    const amount = Math.round(product.price * variance);
    const isClosed = stage.id === "closed_won" || stage.id === "closed_lost";
    const isWon = stage.id === "closed_won";
    const closedDaysAgo = isClosed ? rndInt(0, daysAgo) : null;
    const createdAt = dateTimeNDaysAgo(daysAgo);
    const closedAt = isClosed ? dateTimeNDaysAgo(closedDaysAgo) : null;
    const cycleHours = isClosed ? rndInt(2, 240) : null; // 2 soat - 10 kun
    const tagsCount = rndInt(0, 3);
    const shuffled = [...AMO_TAGS].sort(() => rnd() - 0.5);
    leads.push({
      type: "lead",
      ID: 10000 + i,
      Title: `${product.name} — ${rndChoice(AMO_FIRST_NAMES)} ${rndChoice(AMO_LAST_NAMES)}`,
      Stage: stage.id,
      StageName: stage.name,
      StageOrder: stage.order,
      Amount: amount,
      Currency: "UZS",
      Date: createdAt.slice(0, 10),
      CreatedAt: createdAt,
      ClosedAt: closedAt,
      CycleHours: cycleHours,
      Source: rndChoice(AMO_SOURCES),
      Closed: isClosed,
      Won: isWon,
      LossReason: stage.id === "closed_lost" ? rndChoice(AMO_LOSS_REASONS) : null,
      Responsible: rndChoice(AMO_MANAGERS),
      Product: product.name,
      Category: product.category,
      Tags: shuffled.slice(0, tagsCount),
      ContactID: 20000 + (i % 70), // 70 ta uniq contact
      // Custom fields
      ProbabilityPct: !isClosed ? (stage.order * 15 + rndInt(-5, 5)) : (isWon ? 100 : 0),
      FollowUpsCount: rndInt(0, 8),
      Region: rndChoice(["Toshkent", "Samarqand", "Andijon", "Buxoro", "Farg'ona", "Namangan", "Xorazm", "Surxondaryo"]),
    });
  }

  // Contacts (70 ta uniq mijoz)
  const contacts = [];
  const contactRepeats = {};
  for (let i = 0; i < 70; i++) {
    const id = 20000 + i;
    const dealCount = leads.filter(l => l.ContactID === id).length;
    const wonCount = leads.filter(l => l.ContactID === id && l.Won).length;
    const totalSpent = leads.filter(l => l.ContactID === id && l.Won).reduce((a, l) => a + l.Amount, 0);
    contacts.push({
      type: "contact",
      ID: id,
      Name: `${rndChoice(AMO_FIRST_NAMES)} ${rndChoice(AMO_LAST_NAMES)}`,
      Phone: `+998 9${rndInt(0, 9)} ${rndInt(100, 999)}-${rndInt(10, 99)}-${rndInt(10, 99)}`,
      Email: `client${id}@example.uz`,
      Company: rnd() > 0.5 ? rndChoice(["Smart Trade LLC", "TechVision", "BizPro Group", "Brand Studio", "Digital Lab"]) : "",
      Region: rndChoice(["Toshkent", "Samarqand", "Andijon", "Buxoro"]),
      DealsCount: dealCount,
      WonCount: wonCount,
      TotalSpent: totalSpent,
      LTV: totalSpent,
      FirstContact: dateNDaysAgo(rndInt(30, 200)),
      LastActivity: dateNDaysAgo(rndInt(0, 30)),
      Tags: i < 10 ? ["VIP"] : i < 25 ? ["takroriy"] : [],
    });
  }

  // Tasks (180 ta vazifa, har xil status)
  const tasks = [];
  for (let i = 0; i < 180; i++) {
    const daysAgo = rndInt(-7, 30); // -7 = kelajak
    const isCompleted = daysAgo > 2 && rnd() > 0.3;
    const lead = leads[rndInt(0, leads.length - 1)];
    tasks.push({
      type: "task",
      ID: 30000 + i,
      Type: rndChoice(TASK_TYPES),
      Description: `${rndChoice(TASK_TYPES)}: ${lead.Title.slice(0, 40)}`,
      LeadID: lead.ID,
      Manager: lead.Responsible,
      DueDate: dateNDaysAgo(daysAgo),
      Completed: isCompleted,
      CompletedAt: isCompleted ? dateNDaysAgo(daysAgo - rndInt(0, 1)) : null,
      Priority: rndChoice(["low", "medium", "high", "urgent"]),
    });
  }

  // Calls log (140 ta qo'ng'iroq)
  const calls = [];
  for (let i = 0; i < 140; i++) {
    const lead = leads[rndInt(0, leads.length - 1)];
    const daysAgo = rndInt(0, 60);
    const duration = rndInt(30, 900); // 30 sek - 15 daq
    const result = rndChoice(["javob_oldi", "javob_yo'q", "manfaatdor", "qaytib_qo'ng'iroq", "sotuv"]);
    calls.push({
      type: "call",
      ID: 40000 + i,
      LeadID: lead.ID,
      Manager: lead.Responsible,
      Direction: rnd() > 0.4 ? "outgoing" : "incoming",
      Duration: duration,
      Result: result,
      Date: dateTimeNDaysAgo(daysAgo),
    });
  }

  // Notes (90 ta yozuv)
  const notes = [];
  const noteTexts = [
    "Mijoz qaytib qo'ng'iroq qilishni so'radi",
    "Yana bir taklif yuboring — narx ishonarli emas",
    "Ko'rsatma berildi, ertaga uchrashamiz",
    "Naqd to'lov, bugun keladi",
    "Boshqa kompaniyaga ham murojaat qilibdi",
    "Bo'shaganda qayta urinishimiz kerak",
    "Hozir uy almashayotgani uchun keyinroq",
    "Korporativ mijoz, katta buyurtma",
  ];
  for (let i = 0; i < 90; i++) {
    const lead = leads[rndInt(0, leads.length - 1)];
    notes.push({
      type: "note",
      ID: 50000 + i,
      LeadID: lead.ID,
      Author: lead.Responsible,
      Text: rndChoice(noteTexts),
      Date: dateTimeNDaysAgo(rndInt(0, 60)),
    });
  }

  return {
    id: "demo_amocrm_main", type: "amocrm", name: "Demo AmoCRM",
    color: "#FFC400", connected: true, active: true,
    data: [...leads, ...contacts, ...tasks, ...calls, ...notes],
    isDemo: true,
    config: { mode: "demo", subdomain: "demo_company" },
    createdAt: dateNDaysAgo(180), updatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// FACEBOOK ADS DEMO — kampaniyalar + adsets + ads + insights
// ─────────────────────────────────────────────────────────────
const FB_CAMPAIGN_NAMES = [
  "Qishki kollektsiya — Brand awareness",
  "Black Friday — 50% chegirma",
  "Reels view — Yangi mahsulot",
  "Lid yig'ish — Toshkent",
  "Retargeting — Karzinka tashlab ketganlar",
  "Lookalike — Eng yaxshi mijozlar",
  "Boshqa shaharlar — Geo expansion",
  "Stories — Brand storytelling",
  "Carousel — Top 5 mahsulot",
  "Video view — Brand story 60sec",
];
const FB_OBJECTIVES = ["BRAND_AWARENESS", "REACH", "TRAFFIC", "ENGAGEMENT", "VIDEO_VIEWS", "LEAD_GENERATION", "CONVERSIONS", "MESSAGES"];
const FB_PLACEMENTS = ["FB Feed", "FB Stories", "IG Feed", "IG Stories", "IG Reels", "Audience Network", "Marketplace"];
const FB_DEVICES = ["Mobile iOS", "Mobile Android", "Desktop", "Tablet"];
const FB_AGE_GROUPS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const FB_GENDERS = ["male", "female", "unknown"];
const FB_REGIONS = ["Toshkent", "Samarqand", "Andijon", "Buxoro", "Farg'ona", "Namangan", "Xorazm", "Surxondaryo", "Sirdaryo", "Jizzax"];
const FB_CREATIVES = ["Image — Mahsulot fotosurati", "Video 15sec — Demo", "Video 30sec — Story", "Carousel — 5 ta mahsulot", "Slideshow — Trend", "GIF — Animatsiya"];

function generateFacebookAdsSource() {
  // 10 ta kampaniya (avval 8 edi)
  const campaigns = [];
  const adsets = [];
  const ads = [];
  const insights = [];
  const dailySpend = [];

  for (let i = 0; i < FB_CAMPAIGN_NAMES.length; i++) {
    const dailyBudget = rndInt(50, 250) * 1000;
    const days = rndInt(7, 28);
    const reach = dailyBudget * days * rndInt(40, 120) / 100;
    const impressions = reach * (1 + rnd() * 0.5);
    const frequency = +(impressions / reach).toFixed(2);
    const clicks = Math.floor(impressions * (0.8 + rnd() * 2.4) / 100);
    const ctr = +((clicks / impressions) * 100).toFixed(2);
    const cpc = Math.floor((dailyBudget * days) / Math.max(clicks, 1));
    const cpm = Math.floor((dailyBudget * days) / Math.max(impressions / 1000, 1));
    const conversions = Math.floor(clicks * (3 + rnd() * 8) / 100);
    const cpl = Math.floor((dailyBudget * days) / Math.max(conversions, 1));
    const revenue = conversions * rndInt(150000, 800000);
    const spend = dailyBudget * days;
    const roas = +(revenue / spend).toFixed(2);
    const objective = rndChoice(FB_OBJECTIVES);
    const campId = `c${1000 + i}`;
    campaigns.push({
      type: "campaign", ID: campId,
      Title: FB_CAMPAIGN_NAMES[i],
      Objective: objective,
      Status: i < 7 ? "ACTIVE" : "PAUSED",
      Date_start: dateNDaysAgo(days),
      Date_end: i < 7 ? null : dateNDaysAgo(0),
      DailyBudget: dailyBudget,
      LifetimeBudget: dailyBudget * days,
      Spend: spend, Reach: Math.floor(reach), Impressions: Math.floor(impressions),
      Frequency: frequency, Clicks: clicks, CTR: ctr, CPC: cpc, CPM: cpm,
      Conversions: conversions, CPL: cpl, Revenue: revenue, ROAS: roas,
      // Video metrics (faqat VIDEO objective)
      VideoViews_3sec: objective === "VIDEO_VIEWS" ? Math.floor(impressions * 0.6) : 0,
      VideoViews_25pct: objective === "VIDEO_VIEWS" ? Math.floor(impressions * 0.42) : 0,
      VideoViews_50pct: objective === "VIDEO_VIEWS" ? Math.floor(impressions * 0.28) : 0,
      VideoViews_75pct: objective === "VIDEO_VIEWS" ? Math.floor(impressions * 0.18) : 0,
      VideoViews_100pct: objective === "VIDEO_VIEWS" ? Math.floor(impressions * 0.12) : 0,
      AvgWatchTime: objective === "VIDEO_VIEWS" ? rndInt(8, 22) : 0,
      // Engagement metrics
      Likes: Math.floor(clicks * (1 + rnd() * 3)),
      Comments: Math.floor(clicks * (0.05 + rnd() * 0.1)),
      Shares: Math.floor(clicks * (0.02 + rnd() * 0.05)),
      Saves: Math.floor(clicks * (0.03 + rnd() * 0.08)),
    });

    // Adsets (har kampaniyaga 2-3 ta)
    const adsetCount = rndInt(2, 3);
    for (let j = 0; j < adsetCount; j++) {
      const asReach = Math.floor(reach / adsetCount * (0.7 + rnd() * 0.6));
      const asSpend = Math.floor(spend / adsetCount * (0.7 + rnd() * 0.6));
      adsets.push({
        type: "adset", ID: `as${1000 + i}_${j}`, CampaignID: campId,
        Name: `${FB_CAMPAIGN_NAMES[i].split('—')[0].trim()} — ${rndChoice(["18-24", "25-34", "35-44"])} ${rndChoice(FB_REGIONS)}`,
        Targeting: {
          age_min: rndChoice([18, 25, 35]),
          age_max: rndChoice([24, 34, 44, 54]),
          gender: rndChoice(["all", "male", "female"]),
          regions: [rndChoice(FB_REGIONS), rndChoice(FB_REGIONS)],
          interests: rndChoice([["Fashion", "Shopping"], ["Tech", "Apple"], ["Food", "Restaurants"], ["Business", "Marketing"]]),
        },
        Spend: asSpend, Reach: asReach,
        Impressions: Math.floor(asReach * (1 + rnd() * 0.4)),
        Conversions: Math.floor((asSpend / cpl) * (0.8 + rnd() * 0.4)),
        Status: campaigns[campaigns.length - 1].Status,
      });
    }

    // Ads (har kampaniyaga 3-5 ta creative)
    const adCount = rndInt(3, 5);
    for (let k = 0; k < adCount; k++) {
      const adReach = Math.floor(reach / adCount * (0.6 + rnd() * 0.8));
      const adSpend = Math.floor(spend / adCount * (0.6 + rnd() * 0.8));
      const adClicks = Math.floor(clicks / adCount * (0.6 + rnd() * 0.8));
      ads.push({
        type: "ad", ID: `ad${1000 + i}_${k}`, CampaignID: campId,
        Creative: rndChoice(FB_CREATIVES),
        Spend: adSpend, Reach: adReach, Clicks: adClicks,
        CTR: +((adClicks / Math.max(adReach, 1)) * 100).toFixed(2),
        Conversions: Math.floor(adClicks * (0.03 + rnd() * 0.08)),
        Status: campaigns[campaigns.length - 1].Status,
      });
    }

    // Per-day insights (har kampaniya uchun har kun)
    for (let d = 0; d < days; d++) {
      const date = dateNDaysAgo(days - d - 1);
      const daySpend = Math.floor(dailyBudget * (0.8 + rnd() * 0.4));
      dailySpend.push({ date, campaign: FB_CAMPAIGN_NAMES[i], spend: daySpend });
    }
  }

  // Demographics breakdown (placement + device + age + gender + region)
  const demographics = [];

  // Placement
  for (const p of FB_PLACEMENTS) {
    const placementShare = rnd();
    demographics.push({
      type: "demo_placement",
      Placement: p,
      Spend: Math.floor(150000000 * placementShare),
      Reach: Math.floor(500000 * placementShare),
      Impressions: Math.floor(700000 * placementShare),
      Clicks: Math.floor(8000 * placementShare),
      Conversions: Math.floor(400 * placementShare),
    });
  }

  // Device
  for (const d of FB_DEVICES) {
    const share = d.includes("iOS") ? 0.32 : d.includes("Android") ? 0.51 : d === "Desktop" ? 0.10 : 0.07;
    demographics.push({
      type: "demo_device",
      Device: d,
      Spend: Math.floor(150000000 * share),
      Reach: Math.floor(500000 * share),
      Conversions: Math.floor(400 * share),
    });
  }

  // Age + Gender
  for (const age of FB_AGE_GROUPS) {
    for (const gender of FB_GENDERS) {
      if (gender === "unknown" && rnd() < 0.5) continue;
      const ageShare = age === "25-34" ? 0.38 : age === "18-24" ? 0.22 : age === "35-44" ? 0.20 : 0.04 + rnd() * 0.06;
      const genderShare = gender === "female" ? 0.6 : gender === "male" ? 0.35 : 0.05;
      const share = ageShare * genderShare;
      demographics.push({
        type: "demo_age_gender",
        Age: age, Gender: gender,
        Reach: Math.floor(500000 * share),
        Conversions: Math.floor(400 * share),
        ROAS: +(0.5 + rnd() * 3.5).toFixed(2),
      });
    }
  }

  // Region
  for (const r of FB_REGIONS) {
    const share = r === "Toshkent" ? 0.45 : r === "Samarqand" ? 0.13 : r === "Andijon" ? 0.10 : 0.03 + rnd() * 0.05;
    demographics.push({
      type: "demo_region",
      Region: r,
      Reach: Math.floor(500000 * share),
      Conversions: Math.floor(400 * share),
      ROAS: +(1 + rnd() * 2.5).toFixed(2),
    });
  }

  // Hourly breakdown (24h)
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const baseShare = h >= 19 && h <= 22 ? 0.12 : h >= 12 && h <= 18 ? 0.07 : h >= 9 ? 0.05 : 0.01;
    hourly.push({
      type: "demo_hour",
      Hour: h,
      Reach: Math.floor(500000 * baseShare * (0.8 + rnd() * 0.4)),
      Clicks: Math.floor(8000 * baseShare * (0.8 + rnd() * 0.4)),
      Conversions: Math.floor(400 * baseShare * (0.8 + rnd() * 0.4)),
    });
  }

  return {
    id: "demo_facebook_ads", type: "facebook_ads", name: "Demo Facebook Ads",
    color: "#1877F2", connected: true, active: true,
    data: [...campaigns, ...adsets, ...ads, ...demographics, ...hourly, ...dailySpend.map(d => ({ type: "demo_daily", ...d }))],
    isDemo: true,
    config: { mode: "demo", account_id: "act_demo_123" },
    createdAt: dateNDaysAgo(60), updatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
export function generateAllDemoSources() {
  _rng = seed;
  return [generateInstagramSource(), generateAmoCRMSource(), generateFacebookAdsSource()];
}
export function generateInstagramDemo() { _rng = seed; return generateInstagramSource(); }
export function generateAmoCRMDemo() { _rng = seed + 1; return generateAmoCRMSource(); }
export function generateFacebookAdsDemo() { _rng = seed + 2; return generateFacebookAdsSource(); }
