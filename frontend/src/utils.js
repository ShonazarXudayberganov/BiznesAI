import * as XLSX from 'xlsx';
import {
  Token, AuthAPI, SourcesAPI, AlertsAPI, ReportsAPI,
  ChatAPI, AiAPI, PaymentsAPI, AdminAPI, UploadAPI,
  DepartmentsAPI, EmployeesAPI, SuperAdminAPI, TelegramAPI, SheetsAPI, AiAgentAPI,
  MemoryAPI, UserSettingsAPI,
} from './api.js';

// ─────────────────────────────────────────────────────────────
// SAAS PLANS — Tarif rejalari
// ─────────────────────────────────────────────────────────────
const PLANS = {
  free: {
    id: "free", name: "Free", nameUz: "Bepul",
    price_monthly: 0, price_yearly: 0,
    color: "#6B7280", badge: null,
    limits: { ai_requests: 5, files: 1, connectors: 1, reports: 1, alerts_check: false, export: false, api: false, advanced_charts: false },
    features: [
      { t: "5 AI so'rov / oy", ok: true },
      { t: "1 ta fayl yuklash", ok: true },
      { t: "1 ta konnector", ok: true },
      { t: "3 ta asosiy grafik turi", ok: true },
      { t: "1 ta hisobot", ok: true },
      { t: "Export (PDF/Excel)", ok: false },
      { t: "Proaktiv AI ogohlantirishlar", ok: false },
      { t: "API kirish", ok: false },
    ]
  },
  starter: {
    id: "starter", name: "Starter", nameUz: "Boshlang'ich",
    price_monthly: 99000, price_yearly: 990000,
    color: "#60A5FA", badge: null,
    limits: { ai_requests: 100, files: 10, connectors: 5, reports: 20, alerts_check: true, export: true, api: false, advanced_charts: true },
    features: [
      { t: "100 AI so'rov / oy", ok: true },
      { t: "10 ta fayl yuklash", ok: true },
      { t: "5 ta konnector", ok: true },
      { t: "Barcha 9 grafik turi", ok: true },
      { t: "20 ta hisobot", ok: true },
      { t: "Export (PDF/Excel)", ok: true },
      { t: "Proaktiv AI ogohlantirishlar", ok: true },
      { t: "API kirish", ok: false },
    ]
  },
  pro: {
    id: "pro", name: "Pro", nameUz: "Professional",
    price_monthly: 199000, price_yearly: 1990000,
    color: "#E8B84B", badge: "Eng mashhur",
    limits: { ai_requests: 500, files: -1, connectors: -1, reports: -1, alerts_check: true, export: true, api: false, advanced_charts: true },
    features: [
      { t: "500 AI so'rov / oy", ok: true },
      { t: "Cheksiz fayllar", ok: true },
      { t: "Cheksiz konnectorlar", ok: true },
      { t: "Barcha 9 grafik turi", ok: true },
      { t: "Cheksiz hisobotlar", ok: true },
      { t: "Export (PDF/Excel/CSV)", ok: true },
      { t: "Proaktiv AI ogohlantirishlar", ok: true },
      { t: "API kirish (tez kunda)", ok: false },
    ]
  },
  enterprise: {
    id: "enterprise", name: "Enterprise", nameUz: "Korporativ",
    price_monthly: 399000, price_yearly: 3990000,
    color: "#A78BFA", badge: "To'liq paket",
    limits: { ai_requests: -1, files: -1, connectors: -1, reports: -1, alerts_check: true, export: true, api: true, advanced_charts: true },
    features: [
      { t: "Cheksiz AI so'rovlar", ok: true },
      { t: "Cheksiz fayllar", ok: true },
      { t: "Cheksiz konnectorlar", ok: true },
      { t: "Barcha 9 grafik turi", ok: true },
      { t: "Cheksiz hisobotlar", ok: true },
      { t: "Export (PDF/Excel/CSV)", ok: true },
      { t: "Proaktiv AI ogohlantirishlar", ok: true },
      { t: "API kirish + Webhook", ok: true },
    ]
  }
};

// ─────────────────────────────────────────────────────────────
// AI PROVIDERS
// ─────────────────────────────────────────────────────────────
const AI_PROVIDERS = {
  claude: {
    id: "claude", name: "Claude", icon: "✦", color: "var(--gold)", company: "Anthropic",
    models: [
      { id: "claude-opus-4-7", n: "Opus 4.7", label: "Opus 4.7 (1M)", badge: "1M", ctx: "1M", premium: true, default: true },
      { id: "claude-sonnet-4-6", n: "Sonnet 4.6", label: "Sonnet 4.6", badge: "200K", ctx: "200K", recommended: true },
      { id: "claude-haiku-4-5-20251001", n: "Haiku 4.5", label: "Haiku 4.5", badge: "200K", ctx: "200K", fast: true },
    ],
    pricing: { in: 15, out: 75 }, note: "Eng aqlli agent. 1M context, web search, code execution, kuchli reasoning", streaming: true,
    ph: "sk-ant-api03-...", hint: "console.anthropic.com → API Keys",
    baseUrl: "https://api.anthropic.com/v1/messages",
    features: ["web_search", "code_execution", "extended_thinking", "prompt_caching", "tool_use", "vision"],
  },
  deepseek: {
    id: "deepseek", name: "DeepSeek", icon: "◇", color: "#4D9DE0", company: "DeepSeek AI",
    models: [
      { id: "deepseek-chat", n: "V3.1", label: "DeepSeek V3.1", badge: "128K", ctx: "128K", default: true },
      { id: "deepseek-reasoner", n: "R1", label: "DeepSeek R1 (reasoning)", badge: "128K", ctx: "128K", reasoning: true },
    ],
    pricing: { in: 0.27, out: 1.1 }, note: "10x arzon, matematika + dasturlash kuchli", streaming: true,
    ph: "sk-...", hint: "platform.deepseek.com → API Keys",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    features: ["tool_use", "json_mode"],
  },
  chatgpt: {
    id: "chatgpt", name: "ChatGPT", icon: "◯", color: "#4ADE80", company: "OpenAI",
    models: [
      { id: "gpt-5", n: "GPT-5", label: "GPT-5", badge: "400K", ctx: "400K", premium: true, default: true },
      { id: "gpt-5-mini", n: "GPT-5 mini", label: "GPT-5 mini", badge: "400K", ctx: "400K", fast: true },
      { id: "o3", n: "o3", label: "o3 (reasoning)", badge: "200K", ctx: "200K", reasoning: true },
      { id: "gpt-4o", n: "GPT-4o", label: "GPT-4o (legacy)", badge: "128K", ctx: "128K", legacy: true },
    ],
    pricing: { in: 2.5, out: 10 }, note: "GPT-5 va o3 reasoning bilan", streaming: true,
    ph: "sk-proj-...", hint: "platform.openai.com → API Keys",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    features: ["tool_use", "vision", "json_mode", "web_search"],
  },
  gemini: {
    id: "gemini", name: "Gemini", icon: "✧", color: "#FB923C", company: "Google",
    models: [
      { id: "gemini-2.5-pro", n: "2.5 Pro", label: "Gemini 2.5 Pro", badge: "2M", ctx: "2M", premium: true, default: true },
      { id: "gemini-2.5-flash", n: "2.5 Flash", label: "Gemini 2.5 Flash", badge: "1M", ctx: "1M", recommended: true },
      { id: "gemini-2.5-flash-lite", n: "Flash Lite", label: "Gemini 2.5 Flash Lite", badge: "1M", ctx: "1M", fast: true },
    ],
    pricing: { in: 1.25, out: 5 }, note: "2M context, multimodal (rasm + audio + video)", streaming: true,
    ph: "AIza...", hint: "aistudio.google.com → API Keys",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    features: ["tool_use", "vision", "audio", "video", "json_mode"],
  },
};

const SOURCE_TYPES = {
  excel: { id: "excel", icon: "📊", label: "Excel/CSV", color: "#4ADE80", desc: "xlsx, xls, csv fayllar" },
  sheets: { id: "sheets", icon: "📋", label: "Google Sheets", color: "#60A5FA", desc: "Sheets URL yuklash" },
  restapi: { id: "restapi", icon: "🔗", label: "REST API", color: "#F59E0B", desc: "JSON endpoint" },
  instagram: { id: "instagram", icon: "📸", label: "Instagram", color: "#E879F9", desc: "Business API" },
  telegram: { id: "telegram", icon: "✈️", label: "Telegram Kanal", color: "#38BDF8", desc: "Kanal statistikasi" },
  crm: { id: "crm", icon: "🏢", label: "LC-UP CRM", color: "#8B5CF6", desc: "O'quv markaz CRM tizimi" },
  amocrm: { id: "amocrm", icon: "🟡", label: "AmoCRM", color: "#FFC400", desc: "Lid, mijoz va sotuv pipeline (token)" },
  bitrix24: { id: "bitrix24", icon: "🟦", label: "Bitrix24", color: "#0098CE", desc: "CRM + lid + sotuv (webhook URL)" },
  facebook_ads: { id: "facebook_ads", icon: "📣", label: "Facebook Ads", color: "#1877F2", desc: "Reklama kampaniyalari, ROAS, konversiya" },
  document: { id: "document", icon: "📄", label: "Hujjat (PDF/Word/TXT)", color: "#F87171", desc: "PDF, DOCX, TXT fayllar — AI tahlil qiladi" },
  image: { id: "image", icon: "🖼️", label: "Rasm tahlili", color: "#EC4899", desc: "JPG, PNG rasmlar — AI tavsiflaydi" },
  onec: { id: "onec", icon: "🏦", label: "1C Buxgalteriya", color: "#FF6B35", desc: "1C:Enterprise OData API" },
  yandex: { id: "yandex", icon: "📈", label: "Yandex Metrika", color: "#FC3F1D", desc: "Sayt traffigi va statistikasi" },
  website: { id: "website", icon: "🌐", label: "Veb-sayt tahlili", color: "#00C9BE", desc: "Sayt URL → kontakt, mahsulot, SEO, ijtimoiy tarmoqlar" },
  database: { id: "database", icon: "🗄️", label: "SQL Database", color: "#06B6D4", desc: "MySQL/PostgreSQL ulanish" },
  manual: { id: "manual", icon: "📝", label: "Qo'lda JSON", color: "#94A3B8", desc: "Bevosita JSON kiritish" },
};

// NAV is defined below in MAIN APP section

// ─────────────────────────────────────────────────────────────
// LOCAL STORAGE HELPERS
// ─────────────────────────────────────────────────────────────
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem("bai_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("bai_" + k, JSON.stringify(v)); } catch { } },
  del: (k) => { try { localStorage.removeItem("bai_" + k); } catch { } },
};

// ─────────────────────────────────────────────────────────────
// SOURCE DATA PERSISTENCE
// Dual-write: localStorage (tez cache) + Backend API (doimiy)
// ─────────────────────────────────────────────────────────────
function _getUid() { const s = LS.get("session", null); return s?.id || "anon"; }

function saveSources(sources, uid) {
  const userId = uid || _getUid();
  const pfx = "u_" + userId + "_";

  // ── localStorage ga saqlash (tez, offline) ──
  const meta = sources.map(s => {
    const { data, files, ...rest } = s;
    return rest;
  });
  LS.set(pfx + "sources_meta", meta);
  sources.forEach(s => {
    if (s.data && s.data.length > 0) LS.set(pfx + "src_data_" + s.id, s.data);
    if (s.files && s.files.length > 0) LS.set(pfx + "src_files_" + s.id, s.files);
  });
}

// Backend API ga manbani sinxronlash (background, xato bo'lsa jimgina)
function syncSourceToAPI(source) {
  if (!Token.get()) return;
  const { data, files, ...meta } = source;
  // Manba metadata ni yangilash
  SourcesAPI.update(source.id, meta).catch(() => { });
  // Data ni bazaga saqlash
  // Server tomonidan boshqariladigan manbalar (sheets, telegram, instagram, crm va h.k.) — DB ga qayta yozmaymiz
  // Fayllar (excel, document, image, manual) — DB ga saqlaymiz (_sheet bo'lsa ham)
  if (data && data.length > 0) {
    const SERVER_MANAGED_TYPES = new Set(["sheets", "telegram", "instagram", "crm", "restapi", "website", "scrape"]);
    const isServerManaged = SERVER_MANAGED_TYPES.has(source.type) || (data[0]?._serverManaged === true);
    if (isServerManaged) return;
    console.log(`[Sync] ${source.name} (${source.type}): ${data.length} qator bazaga yuklanmoqda...`);
    SourcesAPI.saveData(source.id, data).catch(e => console.warn("[Sync] Data save error:", e.message));
  }
}

// Backend dan AI kontekst olish (baza orqali)
async function getAiContextFromAPI(sourceId) {
  try {
    if (!Token.get()) return null;
    const result = await SourcesAPI.getAiContext(sourceId);
    return result?.context || null;
  } catch { return null; }
}

// Backend API dan manbalarni yuklash (ixtiyoriy bo'lim filter bilan)
async function loadSourcesFromAPI(departmentId) {
  try {
    if (!Token.get()) return null;
    const result = await SourcesAPI.getAll(departmentId);
    return Array.isArray(result) ? result : null;
  } catch { return null; }
}

function loadSources(uid) {
  const userId = uid || _getUid();
  const pfx = "u_" + userId + "_";

  const meta = LS.get(pfx + "sources_meta", null);
  if (meta) {
    return meta.map(s => ({
      ...s,
      data: LS.get(pfx + "src_data_" + s.id, []),
      files: LS.get(pfx + "src_files_" + s.id, undefined),
    }));
  }

  // Eski global format migratsiya (faqat bir marta — admin uchun)
  const oldMeta = LS.get("sources_meta", null);
  if (oldMeta && userId === "admin") {
    const migrated = oldMeta.map(s => ({
      ...s,
      data: LS.get("src_data_" + s.id, []),
      files: LS.get("src_files_" + s.id, undefined),
    }));
    saveSources(migrated, userId);
    return migrated;
  }

  return [];
}

// ─────────────────────────────────────────────────────────────
// AUTH HELPERS (Backend API + localStorage fallback)
// ─────────────────────────────────────────────────────────────
const Auth = {
  // ── LS-based user storage (fallback + admin panel) ──
  getUsers: () => LS.get("users", []),
  saveUsers: (users) => LS.set("users", users),

  getSession: () => LS.get("session", null),
  setSession: (user) => LS.set("session", user),
  clearSession: () => { LS.del("session"); Token.clear(); },

  // ── Login: API ga urinib ko'radi, ishlamasa LS fallback ──
  login: async (email, password, remember) => {
    // Avval backend API
    try {
      const res = await AuthAPI.login(email, password);
      Token.set(res.token);
      // LS ga ham saqlash (fallback uchun)
      const users = Auth.getUsers();
      const existing = users.find(u => u.email === email);
      if (!existing) Auth.saveUsers([...users, { ...res.user, password, status: "active" }]);
      else Auth.saveUsers(users.map(u => u.email === email ? { ...u, ...res.user, password, lastLogin: new Date().toISOString() } : u));
      Auth.setSession(res.user);
      return { user: res.user };
    } catch (e) {
      // Backend ishlamasa — localStorage fallback
      console.warn("[Auth] API login failed, using LS fallback:", e.message);
      const users = Auth.getUsers();
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) return { error: "Email yoki parol noto'g'ri" };
      if (user.status === "blocked") return { error: "Hisobingiz bloklangan" };
      const updated = users.map(u => u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u);
      Auth.saveUsers(updated);
      const sessionUser = { ...user, lastLogin: new Date().toISOString() };
      Auth.setSession(sessionUser);
      return { user: sessionUser };
    }
  },

  // ── Register: API ga urinib ko'radi, ishlamasa LS fallback ──
  register: async (name, email, password, organizationName) => {
    try {
      const res = await AuthAPI.register(name, email, password, organizationName);
      Token.set(res.token);
      const users = Auth.getUsers();
      Auth.saveUsers([...users, { ...res.user, password, status: "active" }]);
      Auth.setSession(res.user);
      return { user: res.user };
    } catch (e) {
      console.warn("[Auth] API register failed, using LS fallback:", e.message);
      const users = Auth.getUsers();
      if (users.find(u => u.email === email)) return { error: "Bu email allaqachon ro'yxatdan o'tgan" };
      const newUser = {
        id: Date.now().toString(),
        email, name, password, role: "user",
        plan: "free", billing: "monthly",
        created: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        status: "active",
        ai_requests_used: 0,
        ai_requests_month: new Date().toISOString().slice(0, 7),
      };
      Auth.saveUsers([...users, newUser]);
      Auth.setSession(newUser);
      return { user: newUser };
    }
  },

  // ── User CRUD (sinxron — admin panel uchun) ──
  updateUser: (userId, updates) => {
    const users = Auth.getUsers();
    const updated = users.map(u => u.id === userId ? { ...u, ...updates } : u);
    Auth.saveUsers(updated);
    const session = Auth.getSession();
    if (session?.id === userId) Auth.setSession({ ...session, ...updates });
    // Backend ga ham sinxron
    AdminAPI.updateUser(userId, updates).catch(() => { });
    return updated.find(u => u.id === userId);
  },

  checkLimit: (user, limitKey, sources) => {
    if (user?.role === "admin" || user?.role === "super_admin") return true; // Admin va super-admin cheksiz
    const plan = PLANS[user?.plan || "free"];
    const limit = plan?.limits[limitKey];
    if (limit === -1) return true; // Cheksiz
    if (limit === false) return false; // Mutlaqo taqiqlangan

    if (limitKey === "ai_requests") {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const used = user?.ai_requests_month === currentMonth ? (user?.ai_requests_used || 0) : 0;
      return used < limit;
    }
    if (limitKey === "files") {
      // Fayl turidagi manbalar soni (excel, document, image)
      const fileSources = (sources || []).filter(s => s.type === "excel" || s.type === "document" || s.type === "image");
      return fileSources.length < limit;
    }
    if (limitKey === "connectors") {
      // Barcha manbalar soni (excel, manual, image, document bundan tashqari)
      const connectors = (sources || []).filter(s => s.type !== "excel" && s.type !== "document" && s.type !== "image" && s.type !== "manual");
      return connectors.length < limit;
    }
    if (limitKey === "reports") {
      const pfx = "u_" + (user?.id || "anon") + "_reports";
      const reports = LS.get(pfx, []);
      return reports.length < limit;
    }
    return limit === true || limit > 0;
  },

  // Limit haqida batafsil ma'lumot
  getLimitInfo: (user, limitKey, sources) => {
    if (user?.role === "admin" || user?.role === "super_admin") return { allowed: true, used: 0, max: -1, label: "Cheksiz" };
    const plan = PLANS[user?.plan || "free"];
    const limit = plan?.limits[limitKey];
    let used = 0;

    if (limitKey === "ai_requests") {
      const currentMonth = new Date().toISOString().slice(0, 7);
      used = user?.ai_requests_month === currentMonth ? (user?.ai_requests_used || 0) : 0;
    } else if (limitKey === "files") {
      used = (sources || []).filter(s => s.type === "excel" || s.type === "document" || s.type === "image").length;
    } else if (limitKey === "connectors") {
      used = (sources || []).filter(s => s.type !== "excel" && s.type !== "document" && s.type !== "image" && s.type !== "manual").length;
    } else if (limitKey === "reports") {
      const pfx = "u_" + (user?.id || "anon") + "_reports";
      used = LS.get(pfx, []).length;
    }

    return {
      allowed: limit === -1 ? true : limit === false ? false : used < limit,
      used,
      max: limit === -1 ? "Cheksiz" : limit,
      remaining: limit === -1 ? "Cheksiz" : Math.max(0, limit - used),
      label: limit === -1 ? "Cheksiz" : `${used}/${limit}`,
    };
  },

  incrementAI: (userId) => {
    const users = Auth.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const sameMonth = user.ai_requests_month === currentMonth;
    const newUsed = sameMonth ? (user.ai_requests_used || 0) + 1 : 1;
    Auth.updateUser(userId, { ai_requests_used: newUsed, ai_requests_month: currentMonth });
    // Backend ga ham
    AiAPI.incrementUsage().catch(() => { });
  },
};

// ─────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const sheets = {};
        wb.SheetNames.forEach(name => {
          sheets[name] = smartSheetToJson(wb.Sheets[name]);
        });
        resolve(sheets);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// Aqlli Excel parser — merged header, bo'sh ustunlar, bo'sh qatorlarni to'g'ri ishlaydi
function smartSheetToJson(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!raw.length) return [];

  // Header qatorini topish — birinchi bo'sh bo'lmagan qator
  // (faqat butunlay bo'sh qatorlarni o'tkazib ketadi, boshqasini o'zgartirmaydi)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const filled = raw[i].filter(v => v !== "" && v !== null && v !== undefined).length;
    if (filled > 0) { headerRowIdx = i; break; }
  }

  // Header qatoridan ustun nomlarini olish
  // Bo'sh hujayralarni faqat merged cell bo'lsa to'ldirish:
  // merged cell Excel da keyingi hujayralar bo'sh bo'ladi
  const headerRow = raw[headerRowIdx];
  const headers = [];
  let lastHeader = "";
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || "").trim();
    if (h) { lastHeader = h; headers.push(h); }
    else if (i === 0) { headers.push("N"); } // birinchi bo'sh ustun odatda tartib raqami
    else { headers.push(`${lastHeader}_qo'shimcha` || `Ustun_${i}`); }
  }

  // Ma'lumot qatorlarini object ga aylantirish
  const dataRows = raw.slice(headerRowIdx + 1);
  const result = [];
  for (const row of dataRows) {
    const obj = {};
    let hasData = false;
    for (let i = 0; i < headers.length; i++) {
      const val = row[i] !== undefined ? row[i] : "";
      obj[headers[i]] = val;
      if (val !== "" && val !== null && val !== undefined) hasData = true;
    }
    if (hasData) result.push(obj);
  }
  return result;
}

function buildMergedContext(sources) {
  return sources.filter(s => s.connected && s.active).map(s => {
    const st = SOURCE_TYPES[s.type];
    const total = s.data?.length || 0;

    // Instagram uchun — profil statistika + stories + top postlar
    if (s.type === "instagram" && s.data?.length > 0) {
      const summary = s.data.find(d => d._type === "PROFIL_STATISTIKA");
      const stories = s.data.filter(d => d._type === "STORY");
      const posts = s.data.filter(d => !d._type).slice(0, 25);
      return `\n INSTAGRAM MANBA: "${s.name}" (@${s.profileName || "noma'lum"})
${summary ? `PROFIL STATISTIKA: ${JSON.stringify(summary, null, 2)}` : ""}
${stories.length > 0 ? `\nSTORIES (${stories.length} ta):\n${JSON.stringify(stories, null, 2)}` : ""}
\nTOP POSTLAR (${posts.length} ta / ${total - 1 - stories.length} tadan):
${JSON.stringify(posts, null, 2)}`;
    }

    // Telegram uchun — kanal statistika + postlar
    if (s.type === "telegram" && s.data?.length > 0) {
      const summary = s.data.find(d => d._type === "KANAL_STATISTIKA");
      const admins = s.data.find(d => d._type === "ADMINLAR");
      const posts = s.data.filter(d => !d._type).slice(0, 25);
      return `\n TELEGRAM KANAL MANBA: "${s.name}" (${s.profileName || "noma'lum"})
${summary ? `KANAL STATISTIKA: ${JSON.stringify(summary, null, 2)}` : ""}
${admins ? `ADMINLAR: ${JSON.stringify(admins.admins, null, 2)}` : ""}
OXIRGI POSTLAR (${posts.length} ta / ${total - (summary ? 1 : 0) - (admins ? 1 : 0)} tadan):
${JSON.stringify(posts, null, 2)}`;
    }

    // CRM uchun — umumiy statistika + entity bo'yicha sample
    if (s.type === "crm" && s.data?.length > 0) {
      const summary = s.data.find(d => d._type === "CRM_STATISTIKA");
      const lids = s.data.filter(d => d._entity === "lid").slice(0, 15);
      const groups = s.data.filter(d => d._entity === "group").slice(0, 15);
      const students = s.data.filter(d => d._entity === "student").slice(0, 15);
      const teachers = s.data.filter(d => d._entity === "teacher").slice(0, 10);
      return `\n CRM MANBA: "${s.name}" (${s.profileName || "noma'lum"})
${summary ? `CRM STATISTIKA: ${JSON.stringify(summary, null, 2)}` : ""}

LIDLAR (${lids.length} ta namuna / jami ${s.data.filter(d => d._entity === "lid").length}):
${JSON.stringify(lids, null, 2)}

GURUHLAR (${groups.length} ta namuna / jami ${s.data.filter(d => d._entity === "group").length}):
${JSON.stringify(groups, null, 2)}

O'QUVCHILAR (${students.length} ta namuna / jami ${s.data.filter(d => d._entity === "student").length}):
${JSON.stringify(students, null, 2)}

O'QITUVCHILAR (${teachers.length} ta namuna / jami ${s.data.filter(d => d._entity === "teacher").length}):
${JSON.stringify(teachers, null, 2)}`;
    }

    // Document manbasi (PDF, DOCX, TXT) — to'liq matnni AI ga berish
    if (s.type === "document" && s.data?.length > 0) {
      const docs = s.data.filter(d => d._type === "document" || d.toliq_matn || d.content);
      if (docs.length > 0) {
        let docCtx = `\n HUJJAT MANBA: "${s.name}" (${docs.length} ta fayl):\n`;
        docs.forEach((d, i) => {
          const text = d.toliq_matn || d.content || "";
          const fileName = d.fayl_nomi || d.fileName || `Fayl ${i + 1}`;
          const pages = d.sahifalar || d.pages || "";
          docCtx += `\n--- ${fileName}${pages ? ` (${pages} sahifa)` : ""} ---\n${text}\n`;
        });
        return docCtx;
      }
    }

    // Boshqa manbalar uchun (Excel, Sheets, API, Manual) — AQLLI FALLBACK
    const techKeys = new Set(["id", "_id", "_type", "_entity", "source_id", "webhook_url", "created_at", "updated_at", "__v", "_v"]);
    const allData = s.data || [];
    const cleanRow = (row) => { const c = {}; Object.entries(row).forEach(([k, v]) => { if (!techKeys.has(k) && !k.startsWith("_")) c[k] = v; }); return c; };

    // Sheet guruhlash
    const sheets = {};
    allData.forEach(row => { const sh = row._sheet || "default"; if (!sheets[sh]) sheets[sh] = []; sheets[sh].push(row); });
    const sheetNames = Object.keys(sheets);

    let context = `\n MANBA: "${s.name}" (${st?.icon || ""} ${st?.label || s.type}, ${total} ta yozuv`;
    if (sheetNames.length > 1) context += `, ${sheetNames.length} ta list: ${sheetNames.join(", ")}`;
    context += `):\n`;

    // Ustunlar va statistika
    const sampleRow = allData[0] || {};
    const allKeys = Object.keys(sampleRow).filter(k => !techKeys.has(k) && !k.startsWith("_"));
    const numCols = allKeys.filter(k => {
      const vals = allData.slice(0, 50).map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")));
      return vals.filter(v => !isNaN(v)).length > 10;
    });
    context += `Ustunlar: ${allKeys.join(", ")}\n`;

    // Raqamli statistika
    numCols.forEach(col => {
      const vals = allData.map(r => parseFloat(String(r[col] || "").replace(/[^0-9.-]/g, ""))).filter(v => !isNaN(v));
      if (vals.length > 0) {
        const sum = vals.reduce((a, b) => a + b, 0);
        context += `  ${col}: jami=${Math.round(sum * 100) / 100}, o'rtacha=${Math.round(sum / vals.length * 100) / 100}, min=${Math.min(...vals)}, max=${Math.max(...vals)}, soni=${vals.length}\n`;
      }
    });

    // AQLLI STRATEGIYA: kichik → hammasi, katta → namuna + statistika
    if (total <= 500) {
      // Kichik dataset — hammasini yuborish
      sheetNames.forEach(sh => {
        const rows = sheets[sh];
        if (sheetNames.length > 1) context += `\n--- ${sh} (${rows.length} ta qator) ---\n`;
        context += JSON.stringify(rows.map(cleanRow), null, 1);
      });
    } else {
      // Katta dataset — har listdan 10 ta namuna
      context += `\n(Katta dataset — har listdan namuna ko'rsatilmoqda, statistika BARCHA ${total} qator asosida)\n`;
      sheetNames.forEach(sh => {
        const rows = sheets[sh];
        if (sheetNames.length > 1) context += `\n--- ${sh} (${rows.length} ta qator) ---\n`;
        const sample = rows.slice(0, 10).map(cleanRow);
        context += JSON.stringify(sample, null, 1);
        if (rows.length > 10) context += `\n... va yana ${rows.length - 10} ta qator\n`;
      });
    }
    return context;
  }).join("\n\n");
}

// ─────────────────────────────────────────────────────────────
// ANOMALIYA ANIQLASH (matematik/statistik — AI shart emas)
// ─────────────────────────────────────────────────────────────
function detectAnomalies(sources) {
  const raw = []; // Xom anomaliyalar
  const connected = (Array.isArray(sources) ? sources : []).filter(s => s.connected && s.active && s.data?.length > 5);

  connected.forEach(src => {
    const rows = src.data || [];
    const keys = Object.keys(rows[0] || {});
    const numKeys = keys.filter(k => {
      const vals = rows.map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, '')));
      return vals.filter(v => !isNaN(v)).length > rows.length * 0.5;
    });

    numKeys.forEach(key => {
      const vals = rows.map(r => parseFloat(String(r[key]).replace(/[^0-9.-]/g, ''))).filter(v => !isNaN(v));
      if (vals.length < 3) return;

      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      if (std === 0 || mean === 0) return;

      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const fieldName = key.replace(/_/g, " ");

      // Z-score anomaliyalar — BIR USTUN UCHUN BITTA KARTA (eng kuchli anomaliyani tanlash)
      let worstZ = 0, worstVal = 0, anomCount = 0;
      vals.forEach(v => {
        const z = (v - mean) / std;
        if (Math.abs(z) > 2.5) {
          anomCount++;
          if (Math.abs(z) > Math.abs(worstZ)) { worstZ = z; worstVal = v; }
        }
      });

      if (anomCount > 0) {
        const pctDiff = Math.round((worstVal - mean) / mean * 100);
        const isHigh = worstZ > 0;
        raw.push({
          source: src.name, field: key, fieldName,
          value: worstVal,
          mean: Math.round(mean * 100) / 100,
          min: Math.round(min * 100) / 100,
          max: Math.round(max * 100) / 100,
          std: Math.round(std * 100) / 100,
          zScore: Math.round(worstZ * 100) / 100,
          anomCount,
          type: isHigh ? 'yuqori' : 'past',
          severity: Math.abs(worstZ) > 3.5 ? 'danger' : 'warning',
          explanation: isHigh
            ? `"${fieldName}" ko'rsatkichida normadan ${Math.abs(pctDiff)}% yuqori qiymat aniqlandi. O'rtacha ${Math.round(mean).toLocaleString()} bo'lishi kerak, lekin ${worstVal.toLocaleString()} qayd etildi. ${anomCount > 1 ? `Jami ${anomCount} ta g'ayrioddiy qiymat bor.` : ""} Bu kutilmagan o'sish yoki xatolik belgisi bo'lishi mumkin.`
            : `"${fieldName}" ko'rsatkichida normadan ${Math.abs(pctDiff)}% past qiymat aniqlandi. O'rtacha ${Math.round(mean).toLocaleString()} bo'lishi kerak, lekin ${worstVal.toLocaleString()} qayd etildi. ${anomCount > 1 ? `Jami ${anomCount} ta g'ayrioddiy qiymat bor.` : ""} Bu pasayish sababini tekshirish kerak.`,
          recommendation: isHigh
            ? `Nima uchun "${fieldName}" kutilganidan yuqori ekanini tekshiring. Bu ijobiy (masalan, savdo o'sishi) yoki salbiy (masalan, xarajat oshishi) bo'lishi mumkin.`
            : `"${fieldName}" pasayish sababini aniqlang. Agar bu muntazam davom etsa, biznesga ta'sir qilishi mumkin. Tezkor choralar ko'ring.`,
        });
      }

      // Trend anomaliya
      if (vals.length >= 5) {
        const last5 = vals.slice(-5);
        const allDown = last5.every((v, i) => i === 0 || v <= last5[i - 1]);
        const allUp = last5.every((v, i) => i === 0 || v >= last5[i - 1]);
        const totalChange = last5.length > 1 ? (last5[last5.length - 1] - last5[0]) / (Math.abs(last5[0]) || 1) * 100 : 0;

        if (allDown && Math.abs(totalChange) > 15) {
          raw.push({
            source: src.name, field: key, fieldName,
            type: 'trend_down',
            severity: Math.abs(totalChange) > 30 ? 'danger' : 'warning',
            value: last5[last5.length - 1], mean,
            min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100,
            explanation: `"${fieldName}" oxirgi 5 ta yozuvda ketma-ket ${Math.abs(Math.round(totalChange))}% pasaydi. Boshlang'ich qiymat: ${Math.round(last5[0]).toLocaleString()}, hozirgi: ${Math.round(last5[4]).toLocaleString()}. Bu tushish tendensiyasi davom etsa, jiddiy muammoga aylanishi mumkin.`,
            recommendation: `"${fieldName}" pasayish sababini tezda aniqlang. Raqobatchilar, mavsumiylik yoki ichki muammolar bo'lishi mumkin. Hozir choralar ko'rsangiz, yo'qotishni kamaytirish mumkin.`,
          });
        }
        if (allUp && totalChange > 50) {
          raw.push({
            source: src.name, field: key, fieldName,
            type: 'trend_up', severity: 'info',
            value: last5[last5.length - 1], mean,
            min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100,
            explanation: `"${fieldName}" oxirgi 5 ta yozuvda ketma-ket +${Math.round(totalChange)}% o'sdi. Boshlang'ich: ${Math.round(last5[0]).toLocaleString()}, hozirgi: ${Math.round(last5[4]).toLocaleString()}. Bu ijobiy tendensiya — davom ettirish strategiyasini o'ylab ko'ring.`,
            recommendation: `Bu o'sishni ta'minlayotgan omillarni aniqlang va kuchaytiring. Imkoniyatdan maksimal foydalaning.`,
          });
        }
      }
    });
  });

  // DUBLIKATLARNI YO'QOTISH — har bir source+field+type uchun faqat eng kuchlisini qoldirish
  const unique = new Map();
  raw.forEach(a => {
    const key = `${a.source}|${a.field}|${a.type}`;
    const existing = unique.get(key);
    if (!existing || Math.abs(a.zScore || 0) > Math.abs(existing.zScore || 0)) {
      unique.set(key, a);
    }
  });

  return [...unique.values()].sort((a, b) => {
    const sev = { danger: 3, warning: 2, info: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  }).slice(0, 30);
}

function buildChartData(rows = []) {
  if (!rows.length) return { line: [], bar: [], pie: [], lineKeys: [] };
  const keys = Object.keys(rows[0]);
  const numKeys = keys.filter(k => {
    const vals = rows.map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")));
    return vals.filter(v => !isNaN(v) && v !== 0).length > rows.length * 0.4;
  }).slice(0, 3);
  const strKeys = keys.filter(k => !numKeys.includes(k));
  const labelKey = strKeys[0] || "index";
  const slice = rows.slice(0, 20);
  const line = slice.map((r, i) => ({ name: String(r[labelKey] || i).substring(0, 10), ...Object.fromEntries(numKeys.map(k => [k, parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")) || 0])) }));
  const pieKey = strKeys[1] || strKeys[0];
  const pieCounts = {};
  rows.forEach(r => { const v = String(r[pieKey] || "Boshqa"); pieCounts[v] = (pieCounts[v] || 0) + 1; });
  const pie = Object.entries(pieCounts).slice(0, 8).map(([name, value]) => ({ name, value }));
  return { line, bar: line.slice(0, 12), pie, lineKeys: numKeys };
}

function fmt(n) { return typeof n === "number" ? n.toLocaleString("uz-UZ") : n; }
function fmtPrice(p) { return p === 0 ? "Bepul" : p.toLocaleString("uz-UZ") + " so'm"; }

// Dinamik narxlar bilan PLAN olish
function getPlan(planId) {
  const base = PLANS[planId] || PLANS.free;
  const custom = getEffectivePlanPrices();
  if (!custom || !custom[planId]) return base;
  return { ...base, price_monthly: custom[planId].monthly ?? base.price_monthly, price_yearly: custom[planId].yearly ?? base.price_yearly };
}

const CHART_COLORS = ["#00C9BE", "#E8B84B", "#A78BFA", "#4ADE80", "#F87171", "#60A5FA", "#FB923C", "#EC4899"];

// Raqamlarni qisqa formatda ko'rsatish: 1500000 → "1.5M", 23400 → "23.4K"
function fmtNum(n) {
  if (n == null || isNaN(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  if (abs >= 1e3) return n.toLocaleString();
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}

// ─────────────────────────────────────────────────────────────
// GLOBAL AI CONFIG HELPERS
// ─────────────────────────────────────────────────────────────
const GlobalAI = {
  get: () => LS.get("global_ai", null) || LS.get("bai_global_ai", null),
  set: (cfg) => { LS.set("global_ai", cfg); AiAPI.saveGlobal(cfg).catch(() => { }); },
  // Backend dan yuklash
  load: async () => { try { const r = await AiAPI.getGlobal(); if (r?.apiKey) { LS.set("global_ai", r); return r; } } catch { } return GlobalAI.get(); },
};

// Tarif narxlarini admin o'zgartirishi mumkin
const PlanPrices = {
  get: () => LS.get("plan_prices", null) || LS.get("bai_plan_prices", null),
  set: (prices) => { LS.set("plan_prices", prices); AiAPI.savePlanPrices(prices).catch(() => { }); },
  load: async () => { try { const r = await AiAPI.getPlanPrices(); if (r && Object.keys(r).length > 0) { LS.set("plan_prices", r); return r; } } catch { } return PlanPrices.get(); },
};

// Effektiv AI config: shaxsiy kalit bor → uni ishlatadi (cheksiz), aks holda global
function getEffectiveAIConfig(userAiConfig) {
  // Agar foydalanuvchining shaxsiy kaliti bor → uni ishlatadi
  if (userAiConfig.apiKey) {
    return { ...userAiConfig, isPersonal: true };
  }
  // Aks holda global AI config
  const global = GlobalAI.get();
  if (global && global.apiKey) {
    return { provider: global.provider, model: global.model, apiKey: global.apiKey, isPersonal: false };
  }
  return { ...userAiConfig, isPersonal: false };
}

// Effektiv narxlarni olish (admin o'zgartirgan bo'lsa)
function getEffectivePlanPrices() {
  const custom = PlanPrices.get();
  if (!custom) return null;
  return custom;
}

// ─────────────────────────────────────────────────────────────
// AI CALL FUNCTION (SSE streaming for all providers)
// ─────────────────────────────────────────────────────────────
async function callAI(messages, config, onChunk, signal) {
  const prov = AI_PROVIDERS[config.provider];
  if (!prov) throw new Error("Noma'lum provayder: " + config.provider);
  if (!config.apiKey) throw new Error("AI ulangan emas. Admin global AI yoki shaxsiy API kalit kerak.");

  let fullText = "";

  // ── Gemini (different API format) ──
  if (config.provider === "gemini") {
    const url = `${prov.baseUrl}/${config.model}:generateContent?key=${config.apiKey}`;
    const body = {
      contents: messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini xato (${res.status}): ${err.substring(0, 200)}`);
    }
    const data = await res.json();
    fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Javob bo'sh";
    onChunk(fullText);
    return fullText;
  }

  // ── Claude (Anthropic — different format) ──
  if (config.provider === "claude") {
    const systemMsg = messages.find(m => m.role === "system");
    const userMsgs = messages.filter(m => m.role !== "system");
    const body = {
      model: config.model,
      max_tokens: 4096,
      messages: userMsgs.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
      stream: true,
    };
    if (systemMsg) body.system = systemMsg.content;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude xato (${res.status}): ${err.substring(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") break;
        try {
          const parsed = JSON.parse(json);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            fullText += parsed.delta.text;
            onChunk(fullText);
          }
        } catch { }
      }
    }
    return fullText;
  }

  // ── OpenAI-compatible (ChatGPT, DeepSeek) ──
  const url = prov.baseUrl;
  const body = {
    model: config.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
    max_tokens: 4096,
    temperature: 0.7,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${prov.name} xato (${res.status}): ${err.substring(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") break;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk(fullText);
        }
      } catch { }
    }
  }
  return fullText;
}

export {
  PLANS, AI_PROVIDERS, SOURCE_TYPES, LS, _getUid, saveSources, syncSourceToAPI,
  getAiContextFromAPI, loadSourcesFromAPI, loadSources, Auth, parseExcelFile,
  smartSheetToJson, buildMergedContext, detectAnomalies, buildChartData, fmt,
  fmtPrice, getPlan, CHART_COLORS, fmtNum, GlobalAI, PlanPrices,
  getEffectiveAIConfig, getEffectivePlanPrices, callAI
};
