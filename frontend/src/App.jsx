import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, ScatterChart, Scatter, ZAxis
} from "recharts";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import {
  Token, AuthAPI, SourcesAPI, AlertsAPI, ReportsAPI,
  ChatAPI, AiAPI, PaymentsAPI, AdminAPI, UploadAPI,
  DepartmentsAPI, EmployeesAPI, SuperAdminAPI, TelegramAPI, SheetsAPI, AiAgentAPI,
  MemoryAPI, UserSettingsAPI,
} from "./api.js";

// XSS himoya — barcha dangerouslySetInnerHTML uchun
const sanitize = (html) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'code', 'span', 'br', 'div', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'p', 'h1', 'h2', 'h3', 'hr'], ALLOWED_ATTR: ['style', 'class', 'href', 'target', 'title'] });

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
    id: "claude", name: "Claude", icon: "", color: "var(--gold)", company: "Anthropic",
    models: [{ id: "claude-sonnet-4-20250514", n: "Sonnet 4", label: "Sonnet 4", badge: "200K", ctx: "200K" }, { id: "claude-haiku-4-5-20251001", n: "Haiku 4.5", label: "Haiku 4.5", badge: "200K", ctx: "200K" }, { id: "claude-opus-4-6", n: "Opus 4.6", label: "Opus 4.6", badge: "200K", ctx: "200K" }],
    pricing: { in: 3, out: 15 }, note: "Eng aqlli agent, Uzbek tushunadi", streaming: true,
    ph: "sk-ant-api03-...", hint: "console.anthropic.com → API Keys",
    baseUrl: "https://api.anthropic.com/v1/messages"
  },
  deepseek: {
    id: "deepseek", name: "DeepSeek", icon: "◇", color: "#4D9DE0", company: "DeepSeek AI",
    models: [{ id: "deepseek-chat", n: "V3", label: "DeepSeek V3", badge: "64K", ctx: "64K" }, { id: "deepseek-reasoner", n: "R1", label: "DeepSeek R1", badge: "64K", ctx: "64K" }],
    pricing: { in: 0.27, out: 1.1 }, note: "Arzon va tez, matematik kuchli", streaming: true,
    ph: "sk-...", hint: "platform.deepseek.com → API Keys",
    baseUrl: "https://api.deepseek.com/v1/chat/completions"
  },
  chatgpt: {
    id: "chatgpt", name: "ChatGPT", icon: "◯", color: "#4ADE80", company: "OpenAI",
    models: [{ id: "gpt-4o", n: "GPT-4o", label: "GPT-4o", badge: "128K", ctx: "128K" }, { id: "gpt-4o-mini", n: "GPT-4o mini", label: "GPT-4o mini", badge: "128K", ctx: "128K" }, { id: "o1-mini", n: "o1-mini", label: "o1-mini", badge: "128K", ctx: "128K" }],
    pricing: { in: 2.5, out: 10 }, note: "Universal, keng qo'llaniladi", streaming: true,
    ph: "sk-proj-...", hint: "platform.openai.com → API Keys",
    baseUrl: "https://api.openai.com/v1/chat/completions"
  },
  gemini: {
    id: "gemini", name: "Gemini", icon: "", color: "#FB923C", company: "Google",
    models: [{ id: "gemini-2.0-flash", n: "2.0 Flash", label: "Gemini 2.0 Flash", badge: "1M", ctx: "1M" }, { id: "gemini-1.5-pro", n: "1.5 Pro", label: "Gemini 1.5 Pro", badge: "1M", ctx: "1M" }],
    pricing: { in: 0.075, out: 0.3 }, note: "Google ekotizimi, tasvir tahlil", streaming: true,
    ph: "AIza...", hint: "aistudio.google.com → API Keys",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models"
  },
};

const SOURCE_TYPES = {
  excel: { id: "excel", icon: "📊", label: "Excel/CSV", color: "#4ADE80", desc: "xlsx, xls, csv fayllar" },
  sheets: { id: "sheets", icon: "📋", label: "Google Sheets", color: "#60A5FA", desc: "Sheets URL yuklash" },
  restapi: { id: "restapi", icon: "🔗", label: "REST API", color: "#F59E0B", desc: "JSON endpoint" },
  instagram: { id: "instagram", icon: "📸", label: "Instagram", color: "#E879F9", desc: "Business API" },
  telegram: { id: "telegram", icon: "✈️", label: "Telegram Kanal", color: "#38BDF8", desc: "Kanal statistikasi" },
  crm: { id: "crm", icon: "🏢", label: "LC-UP CRM", color: "#8B5CF6", desc: "O'quv markaz CRM tizimi" },
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
// ─────────────────────────────────────────────────────────────
// CSS STYLES
// ─────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ═══════════════════════════════════════════════════════
   ANALIX DESIGN TOKENS — 4 mavzu
   Dark: Obsidian (premium gold), Midnight (cyan tech)
   Light: Sandstone (warm editorial), Porcelain (cool minimalist)
   ═══════════════════════════════════════════════════════ */

:root,[data-theme="obsidian"]{
  /* ─── OBSIDIAN — Premium dark gold ─── */
  --bg:#0a0d0c;--s1:#0f1411;--s2:#141a17;--s3:#1a211d;--s4:#1f2925;
  --glass:rgba(15,20,17,0.92);
  --border:rgba(232,240,234,0.08);--border2:rgba(232,240,234,0.04);--border-hi:rgba(212,169,82,0.25);
  --gold:#d4a952;--gold2:#e8c47a;--gold-glow:rgba(212,169,82,0.15);
  --teal:#2fbf71;--teal2:#34d399;--teal-glow:rgba(47,191,113,0.12);
  --green:#2fbf71;--red:#ef5a5a;--purple:#9d7aff;--blue:#60A5FA;--orange:#f2a93b;
  --accent1:#d4a952;--accent2:#2fbf71;
  --text:#e8f0ea;--text2:#c5d2c8;--muted:#8a9690;--muted2:#5a6560;
  --fh:'Manrope',system-ui,-apple-system,sans-serif;
  --fm:'JetBrains Mono','Fira Code',monospace;
  --fs:'Manrope',sans-serif;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.3),0 1px 2px rgba(0,0,0,0.2);
  --shadow-md:0 4px 16px rgba(0,0,0,0.4),0 2px 4px rgba(0,0,0,0.2);
  --shadow-lg:0 10px 40px rgba(0,0,0,0.5),0 4px 12px rgba(0,0,0,0.3);
  --shadow-glow-gold:0 0 20px rgba(212,169,82,0.15),0 0 60px rgba(212,169,82,0.05);
  --shadow-glow-teal:0 0 20px rgba(47,191,113,0.12),0 0 60px rgba(47,191,113,0.04);
  --radius:10px;--radius-lg:14px;--radius-xl:20px;
  --ease:cubic-bezier(0.4,0,0.2,1);
  --ease-spring:cubic-bezier(0.175,0.885,0.32,1.275);
  --chart-grid:rgba(100,160,180,0.06);--chart-label:#64748B;--chart-tip-bg:rgba(15,23,42,0.95);--chart-tip-border:rgba(212,169,82,0.2);
  --bg-pattern:none;
  --is-light:0;
}

/* ═══ MIDNIGHT — Tech cyan dark ═══ */
[data-theme="midnight"]{
  --bg:#0b1220;--s1:#111a2e;--s2:#1a2540;--s3:#233052;--s4:#2c3b63;
  --glass:rgba(17,26,46,0.94);
  --border:rgba(56,189,248,0.08);--border2:rgba(56,189,248,0.04);--border-hi:rgba(56,189,248,0.18);
  --gold:#38BDF8;--gold2:#7DD3FC;--gold-glow:rgba(56,189,248,0.14);
  --teal:#34D399;--teal2:#6EE7B7;--teal-glow:rgba(52,211,153,0.12);
  --green:#34D399;--red:#FB7185;--purple:#818CF8;--blue:#38BDF8;--orange:#FB923C;
  --accent1:#38BDF8;--accent2:#34D399;
  --text:#E2E8F0;--text2:#CBD5E1;--muted:#94A3B8;--muted2:#64748B;
  --shadow-sm:0 1px 3px rgba(0,15,40,0.45);--shadow-md:0 4px 16px rgba(0,15,40,0.4);--shadow-lg:0 10px 40px rgba(0,15,40,0.5);
  --shadow-glow-gold:0 0 24px rgba(56,189,248,0.12);--shadow-glow-teal:0 0 24px rgba(52,211,153,0.1);
  --chart-grid:rgba(56,189,248,0.06);--chart-label:#5A8BAA;--chart-tip-bg:rgba(17,26,46,0.96);--chart-tip-border:rgba(52,211,153,0.25);
  --bg-pattern:
    radial-gradient(circle at 15% 85%,rgba(56,189,248,0.04) 0%,transparent 40%),
    radial-gradient(circle at 85% 15%,rgba(52,211,153,0.03) 0%,transparent 40%);
  --is-light:0;
}

/* ═══ SANDSTONE — Warm editorial light (YANGI) ═══ */
[data-theme="sandstone"]{
  --bg:#fafaf7;--s1:#ffffff;--s2:#f5f4ef;--s3:#eeece4;--s4:#e5dfd1;
  --glass:rgba(255,255,255,0.85);
  --border:#e8e5da;--border2:#ede9dd;--border-hi:#c4a55a;
  --gold:#c4a55a;--gold2:#e8d7a0;--gold-glow:rgba(196,165,90,0.15);
  --teal:#16a764;--teal2:#a8e6c7;--teal-glow:rgba(22,167,100,0.12);
  --green:#16a764;--red:#e8614d;--purple:#7c5cd4;--blue:#3a7ac4;--orange:#e89530;
  --accent1:#c4a55a;--accent2:#16a764;
  --text:#1a1f1c;--text2:#3d4640;--muted:#5c665f;--muted2:#8a9690;
  --shadow-sm:0 1px 2px rgba(28,24,15,0.04);
  --shadow-md:0 4px 12px rgba(28,24,15,0.06),0 2px 4px rgba(28,24,15,0.04);
  --shadow-lg:0 12px 32px rgba(28,24,15,0.08),0 4px 8px rgba(28,24,15,0.04);
  --shadow-glow-gold:0 0 20px rgba(196,165,90,0.12);
  --shadow-glow-teal:0 0 20px rgba(22,167,100,0.1);
  --chart-grid:rgba(196,165,90,0.12);--chart-label:#8a9690;--chart-tip-bg:rgba(255,255,255,0.98);--chart-tip-border:rgba(196,165,90,0.25);
  --bg-pattern:
    radial-gradient(circle at 92% 8%,rgba(196,165,90,0.08) 0%,transparent 45%),
    radial-gradient(circle at 8% 92%,rgba(22,167,100,0.06) 0%,transparent 45%);
  --is-light:1;
}

/* ═══ PORCELAIN — Cool minimalist light (YANGI) ═══ */
[data-theme="porcelain"]{
  --bg:#f8f9fb;--s1:#ffffff;--s2:#f1f3f7;--s3:#e8ecf2;--s4:#dde3ec;
  --glass:rgba(255,255,255,0.88);
  --border:#dde3ec;--border2:#e8ecf2;--border-hi:#1e3a5f;
  --gold:#1e3a5f;--gold2:#2e5186;--gold-glow:rgba(30,58,95,0.15);
  --teal:#6b9080;--teal2:#95b9ab;--teal-glow:rgba(107,144,128,0.12);
  --green:#6b9080;--red:#c84a5b;--purple:#8b7ab8;--blue:#3a7ac4;--orange:#d4896a;
  --accent1:#1e3a5f;--accent2:#6b9080;
  --text:#0f1a2e;--text2:#2a3548;--muted:#4a5973;--muted2:#8a95a8;
  --shadow-sm:0 1px 2px rgba(15,26,46,0.04);
  --shadow-md:0 4px 12px rgba(15,26,46,0.06),0 2px 4px rgba(15,26,46,0.04);
  --shadow-lg:0 12px 32px rgba(15,26,46,0.08),0 4px 8px rgba(15,26,46,0.04);
  --shadow-glow-gold:0 0 20px rgba(30,58,95,0.10);
  --shadow-glow-teal:0 0 20px rgba(107,144,128,0.08);
  --chart-grid:rgba(30,58,95,0.08);--chart-label:#8a95a8;--chart-tip-bg:rgba(255,255,255,0.98);--chart-tip-border:rgba(30,58,95,0.2);
  --bg-pattern:
    radial-gradient(circle at 88% 12%,rgba(30,58,95,0.05) 0%,transparent 45%),
    radial-gradient(circle at 12% 88%,rgba(107,144,128,0.05) 0%,transparent 45%);
  --is-light:1;
}
html,body,#root{height:100%;overflow:hidden}
body{background:var(--bg);color:var(--text);font-family:var(--fh);font-size:14px;line-height:1.65;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:'cv02','cv03','cv04','cv11';letter-spacing:-0.01em;transition:background .3s,color .3s}
body::before{content:'';position:fixed;inset:0;background:var(--bg-pattern,none);pointer-events:none;z-index:0;}


/* ═══ LAYOUT ═══ */
.app{position:relative;z-index:1;display:flex;height:100vh;width:100vw;overflow:hidden}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* ═══ SIDEBAR ═══ */
.sidebar{width:256px;min-width:256px;background:var(--s1);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transition:transform .3s var(--ease);position:relative;}
.sidebar::after{content:'';position:absolute;top:0;right:0;width:1px;height:100%;background:linear-gradient(180deg,transparent 5%,rgba(212,168,83,0.1) 25%,rgba(0,212,200,0.08) 75%,transparent 95%);pointer-events:none;}
.logo-wrap{padding:22px 20px 18px;border-bottom:1px solid var(--border);position:relative;}
.logo-main{font-family:var(--fh);font-size:19px;font-weight:800;letter-spacing:-0.5px;color:var(--text);line-height:1;}
.logo-main span{background:linear-gradient(135deg,var(--gold) 20%,var(--teal2) 80%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.logo-sub{font-size:9.5px;color:var(--muted);margin-top:6px;letter-spacing:3px;text-transform:uppercase;font-family:var(--fm);font-weight:400;}
.nav{padding:10px 10px;flex:1;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.nav::-webkit-scrollbar{display:none}
.nav-group-label{font-family:var(--fh);font-size:9.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:3px;padding:16px 10px 6px;}
.ni{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;cursor:pointer;font-family:var(--fh);font-size:13px;font-weight:500;color:var(--text2);transition:all .2s var(--ease);position:relative;border:1px solid transparent;}
.ni:hover{color:var(--text);background:var(--s3);border-color:var(--border)}
.ni.active{color:var(--gold);background:rgba(212,168,83,0.06);border-color:rgba(212,168,83,0.15);font-weight:600;}
.ni.active::before{content:'';position:absolute;left:-1px;top:20%;bottom:20%;width:3px;border-radius:0 3px 3px 0;background:linear-gradient(180deg,var(--gold),var(--gold2));}
.ni-ico{width:22px;text-align:center;font-size:15px;flex-shrink:0;opacity:0.7}
.ni.active .ni-ico{opacity:1}
.ni-badge{margin-left:auto;font-size:9px;padding:2px 8px;border-radius:20px;background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.2);font-family:var(--fm);font-weight:500;}
.ni-badge.warn{background:rgba(212,168,83,0.1);color:var(--gold);border-color:rgba(212,168,83,0.2);}
.prov-pill{margin:8px 10px;padding:11px 14px;border-radius:12px;border:1px solid var(--border);background:var(--s2);display:flex;align-items:center;gap:11px;cursor:pointer;transition:all .2s var(--ease);}
.prov-pill:hover{border-color:var(--border-hi);background:var(--s3);box-shadow:var(--shadow-sm)}
.pulse-dot{width:8px;height:8px;border-radius:50%;animation:blink 2.5s ease infinite;flex-shrink:0;}
@keyframes blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(0.75)}}
.sidebar-footer{padding:12px 16px;border-top:1px solid var(--border);font-size:10.5px;color:var(--muted);font-family:var(--fm);transition:background .2s;}
.sidebar-footer:hover{background:var(--s2)}

/* ═══ TOPBAR ═══ */
.topbar{height:56px;background:var(--s1);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 28px;flex-shrink:0;backdrop-filter:blur(12px);}
.page-title{font-family:var(--fh);font-size:16px;font-weight:700;color:var(--text);letter-spacing:-0.3px;}
.topbar-right{display:flex;align-items:center;gap:12px}
.model-chip{display:flex;align-items:center;gap:8px;padding:6px 14px;background:var(--s2);border-radius:10px;font-size:11px;cursor:pointer;border:1px solid var(--border);transition:all .2s var(--ease);font-family:var(--fm);height:34px}
.tb-item{display:flex;align-items:center;gap:6px;padding:0 12px;background:var(--s2);border-radius:10px;border:1px solid var(--border);height:34px;font-size:11px;font-family:var(--fh);cursor:pointer;transition:all .2s;color:var(--text2);flex-shrink:0}
.tb-item:hover{border-color:var(--border-hi);background:var(--s3)}
.model-chip:hover{border-color:var(--border-hi);box-shadow:var(--shadow-sm)}

/* ═══ CONTENT ═══ */
.content{flex:1;overflow-y:auto;padding:28px;scroll-behavior:smooth}
.content::-webkit-scrollbar{width:4px}
.content::-webkit-scrollbar-track{background:transparent}
.content::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px}
.content::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.14)}

/* ═══ CARDS ═══ */
.card{background:var(--s1);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 22px;position:relative;overflow:visible;margin-bottom:16px;transition:all .25s var(--ease);}
.card:hover{border-color:var(--border-hi);box-shadow:var(--shadow-sm)}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 10%,rgba(212,168,83,0.12) 35%,rgba(0,212,200,0.08) 65%,transparent 90%);pointer-events:none;}
.card-title{font-family:var(--fh);font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:14px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}

/* ═══ BUTTONS ═══ */
.btn{padding:9px 18px;border-radius:10px;border:none;cursor:pointer;font-size:12.5px;font-family:var(--fh);font-weight:600;transition:all .2s var(--ease);display:inline-flex;align-items:center;gap:7px;white-space:nowrap;letter-spacing:-0.01em;}
.btn-primary{background:linear-gradient(135deg,var(--gold) 0%,#C4912F 100%);color:#0a0c14;box-shadow:0 2px 16px rgba(212,168,83,0.25),inset 0 1px 0 rgba(255,255,255,0.15);}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(212,168,83,0.35),inset 0 1px 0 rgba(255,255,255,0.2);filter:brightness(1.06);}
.btn-primary:active{transform:translateY(0);box-shadow:0 1px 8px rgba(212,168,83,0.2)}
.btn-primary:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none;filter:none}
.btn-teal{background:linear-gradient(135deg,var(--teal) 0%,#009990 100%);color:#0a0c14;box-shadow:0 2px 16px rgba(0,212,200,0.2),inset 0 1px 0 rgba(255,255,255,0.12);}
.btn-teal:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:0 6px 24px rgba(0,212,200,0.3)}
.btn-ghost{background:var(--s3);border:1.5px solid var(--border-hi);color:var(--text);font-weight:600;}
.btn-ghost:hover{border-color:var(--gold);color:var(--gold);background:var(--s2);box-shadow:0 0 0 3px rgba(212,168,83,0.10)}
.btn-danger{background:transparent;border:1px solid rgba(251,113,133,0.2);color:var(--red);}
.btn-danger:hover{background:rgba(251,113,133,0.06);border-color:rgba(251,113,133,0.35);box-shadow:0 0 12px rgba(251,113,133,0.08)}
.btn-sm{padding:6px 14px;font-size:11.5px;border-radius:8px}
.btn-xs{padding:4px 10px;font-size:10.5px;border-radius:7px}
.btn-lg{padding:13px 30px;font-size:14.5px;border-radius:12px}

/* ═══ FORMS ═══ */
.field{width:100%;background:var(--s3);border:1.5px solid var(--border-hi);border-radius:10px;padding:11px 14px;color:var(--text);font-family:var(--fm);font-size:13px;outline:none;transition:all .25s var(--ease);}
.field:focus{border-color:var(--gold);box-shadow:0 0 0 4px rgba(212,168,83,0.12);background:var(--s2);}
.field:hover{border-color:rgba(255,255,255,0.32);}
.field::placeholder{color:var(--muted);font-weight:400}
.field-label{font-family:var(--fh);font-size:11px;font-weight:800;color:var(--text);margin-bottom:8px;display:block;text-transform:uppercase;letter-spacing:1.8px;}
textarea.field{resize:vertical;min-height:90px;line-height:1.7}
select.field{cursor:pointer;-webkit-appearance:none}

/* ═══ BADGES ═══ */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10.5px;font-weight:500;font-family:var(--fm);letter-spacing:0.02em;}
.b-ok{background:rgba(52,211,153,0.08);color:var(--green);border:1px solid rgba(52,211,153,0.18)}
.b-no{background:rgba(71,85,105,0.15);color:var(--muted);border:1px solid var(--border)}
.b-load{background:rgba(0,212,200,0.08);color:var(--teal);border:1px solid rgba(0,212,200,0.18)}
.b-warn{background:rgba(212,168,83,0.08);color:var(--gold);border:1px solid rgba(212,168,83,0.2)}
.b-red{background:rgba(251,113,133,0.08);color:var(--red);border:1px solid rgba(251,113,133,0.18)}

/* ═══ SECTION HEADER ═══ */
.section-hd{font-family:var(--fh);font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:3.5px;margin-bottom:16px;display:flex;align-items:center;gap:12px;}
.section-hd::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--border-hi),transparent 80%);}
.divider{height:1px;background:var(--border);margin:16px 0}

/* ═══ LANDING PAGE ═══ */
.landing{height:100vh;overflow-y:auto;background:var(--bg);}
.landing::-webkit-scrollbar{width:4px}
.landing::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:4px}

.land-nav{position:sticky;top:0;z-index:100;background:rgba(5,6,12,0.8);backdrop-filter:blur(20px) saturate(1.5);border-bottom:1px solid var(--border);padding:0 48px;height:64px;display:flex;align-items:center;justify-content:space-between;}
.land-logo{font-family:var(--fh);font-size:21px;font-weight:800;letter-spacing:-0.5px;}
.land-logo span{background:linear-gradient(135deg,var(--gold) 20%,var(--teal2) 80%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

.land-hero{padding:100px 48px 70px;text-align:center;position:relative;overflow:hidden;}
.land-hero::before{content:'';position:absolute;top:-150px;left:50%;transform:translateX(-50%);width:800px;height:800px;background:radial-gradient(ellipse,rgba(212,168,83,0.06) 0%,rgba(0,212,200,0.02) 40%,transparent 70%);pointer-events:none;}
.hero-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border:1px solid rgba(212,168,83,0.2);border-radius:24px;font-size:11.5px;color:var(--gold);font-family:var(--fm);margin-bottom:28px;background:rgba(212,168,83,0.04);backdrop-filter:blur(8px);font-weight:500;}
.hero-title{font-family:var(--fh);font-size:clamp(34px,5.5vw,62px);font-weight:800;line-height:1.08;letter-spacing:-2px;color:var(--text);margin-bottom:22px;}
.hero-title .grad{background:linear-gradient(135deg,var(--gold) 0%,var(--teal) 45%,var(--purple) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.hero-sub{font-size:17px;color:var(--text2);line-height:1.75;max-width:600px;margin:0 auto 40px;font-weight:400;}
.hero-btns{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;}

.land-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;margin:60px 48px;}
.stat-block{padding:32px 28px;text-align:center;background:var(--s1);border-right:1px solid var(--border);transition:background .3s}
.stat-block:hover{background:var(--s2)}
.stat-block:last-child{border-right:none}
.stat-num{font-family:var(--fh);font-size:32px;font-weight:800;color:var(--text);letter-spacing:-1.5px;}
.stat-lbl{font-size:11.5px;color:var(--muted);margin-top:5px;font-weight:400;}

.land-section{padding:70px 48px;}
.land-section-title{font-family:var(--fh);font-size:clamp(24px,3.5vw,36px);font-weight:800;text-align:center;margin-bottom:10px;letter-spacing:-0.8px;}
.land-section-sub{text-align:center;color:var(--text2);margin-bottom:48px;font-size:15px;font-weight:400;}

.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.feat-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px;transition:all .25s var(--ease);position:relative;overflow:hidden;}
.feat-card:hover{border-color:var(--border-hi);transform:translateY(-3px);box-shadow:var(--shadow-md)}
.feat-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--fc,var(--gold));opacity:0;transition:opacity .3s;}
.feat-card:hover::after{opacity:.7}
.feat-ico{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
.feat-title{font-family:var(--fh);font-size:16px;font-weight:700;margin-bottom:8px;letter-spacing:-0.2px;}
.feat-desc{font-size:13px;color:var(--text2);line-height:1.75;font-weight:400;}

/* ═══ PRICING ═══ */
.pricing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;max-width:1150px;margin:0 auto;}
.plan-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--radius-xl);padding:28px;position:relative;transition:all .3s var(--ease);display:flex;flex-direction:column;}
.plan-card:hover{transform:translateY(-4px);border-color:var(--border-hi);box-shadow:var(--shadow-md)}
.plan-card.popular{border-color:rgba(212,168,83,0.3);box-shadow:var(--shadow-glow-gold);}
.plan-badge{position:absolute;top:-1px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--gold),#C4912F);color:#0a0c14;font-size:9.5px;font-weight:700;font-family:var(--fh);padding:4px 14px;border-radius:0 0 10px 10px;white-space:nowrap;letter-spacing:0.5px;}
.plan-name{font-family:var(--fh);font-size:13px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:10px;}
.plan-price{font-family:var(--fh);font-size:28px;font-weight:800;color:var(--text);letter-spacing:-1.5px;line-height:1;}
.plan-price span{font-size:13px;color:var(--muted);font-weight:400;letter-spacing:0;}
.plan-period{font-size:10.5px;color:var(--muted);margin-top:4px;font-family:var(--fm);}
.plan-divider{height:1px;background:var(--border);margin:20px 0;}
.plan-feat{display:flex;align-items:flex-start;gap:9px;margin-bottom:10px;font-size:12.5px;font-weight:400;}
.plan-feat-ico{flex-shrink:0;margin-top:2px;font-size:11px;}
.plan-btn{margin-top:auto;padding-top:20px;}
.billing-toggle{display:flex;align-items:center;gap:14px;justify-content:center;margin-bottom:40px;}
.billing-pill{display:flex;background:var(--s2);border:1px solid var(--border);border-radius:30px;padding:4px;}
.billing-opt{padding:7px 20px;border-radius:22px;font-size:12.5px;font-family:var(--fh);cursor:pointer;transition:all .25s var(--ease);font-weight:600;}
.billing-opt.active{background:var(--gold);color:#0a0c14;box-shadow:0 2px 8px rgba(212,168,83,0.3)}
.billing-opt.active.teal{background:var(--teal);color:#0a0c14;box-shadow:0 2px 8px rgba(0,212,200,0.25)}
.billing-save{background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.18);border-radius:20px;padding:4px 12px;font-size:10.5px;font-family:var(--fm);}

/* ═══ AUTH PAGES ═══ */
.auth-wrap{height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;}
.auth-wrap::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 35%,rgba(212,168,83,0.05) 0%,transparent 70%),radial-gradient(ellipse 50% 40% at 50% 80%,rgba(0,212,200,0.03) 0%,transparent 60%);pointer-events:none;}
.auth-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--radius-xl);padding:40px;width:440px;max-width:calc(100vw - 32px);position:relative;overflow:hidden;box-shadow:var(--shadow-lg);}
.auth-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),var(--teal),transparent);}
.auth-logo{font-family:var(--fh);font-size:24px;font-weight:800;text-align:center;margin-bottom:8px;letter-spacing:-0.5px;}
.auth-logo span{background:linear-gradient(135deg,var(--gold) 20%,var(--teal2) 80%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.auth-sub{text-align:center;font-size:13px;color:var(--muted);margin-bottom:32px;font-weight:400;}
.auth-link{color:var(--gold);cursor:pointer;font-family:var(--fh);font-weight:600;transition:color .2s}
.auth-link:hover{color:var(--gold2);}
.auth-err{background:rgba(251,113,133,0.06);border:1px solid rgba(251,113,133,0.18);border-radius:10px;padding:11px 16px;font-size:12.5px;color:var(--red);margin-bottom:16px;}
.auth-field-wrap{margin-bottom:16px;}
.auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0;font-size:11.5px;color:var(--muted);}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border);}

/* ═══ PAYMENT MODAL ═══ */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);animation:fadeIn .25s var(--ease);}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.modal-box{background:var(--s1);border:1px solid var(--border-hi);border-radius:var(--radius-xl);padding:36px;width:480px;max-width:calc(100vw - 32px);max-height:90vh;overflow-y:auto;position:relative;animation:slideUp .3s var(--ease-spring);box-shadow:var(--shadow-lg);}
@keyframes slideUp{from{opacity:0;transform:translateY(24px) scale(0.98)}to{opacity:1;transform:none}}
.modal-close{position:absolute;top:16px;right:16px;background:var(--s3);border:1px solid var(--border);color:var(--muted);cursor:pointer;font-size:14px;padding:5px 8px;border-radius:8px;transition:all .2s}
.modal-close:hover{color:var(--text);border-color:var(--border-hi);background:var(--s4)}
.payment-method{border:1px solid var(--border);border-radius:12px;padding:15px 18px;cursor:pointer;display:flex;align-items:center;gap:14px;transition:all .2s var(--ease);margin-bottom:10px;}
.payment-method:hover{border-color:var(--border-hi);background:var(--s2);box-shadow:var(--shadow-sm)}
.payment-method.selected{border-color:var(--gold);background:rgba(212,168,83,0.04);box-shadow:0 0 16px rgba(212,168,83,0.08)}
.payment-logo{width:52px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;font-family:var(--fh);}

/* ═══ PROFILE & BILLING ═══ */
.usage-bar-wrap{background:var(--s3);border-radius:5px;height:7px;overflow:hidden;margin-top:6px;}
.usage-bar{height:100%;border-radius:5px;transition:width .5s var(--ease);}

/* ═══ ADMIN PANEL ═══ */
.admin-table{width:100%;border-collapse:collapse;}
.admin-table th{padding:10px 14px;text-align:left;font-family:var(--fh);font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid var(--border);white-space:nowrap;}
.admin-table td{padding:12px 14px;border-bottom:1px solid var(--border2);font-size:12.5px;color:var(--text2);}
.admin-table tr:hover td{background:rgba(255,255,255,0.015);}
.admin-table tr:last-child td{border-bottom:none}
.admin-stat{background:var(--s1);border:1px solid var(--border);border-radius:14px;padding:20px 22px;position:relative;overflow:hidden;transition:all .25s var(--ease)}
.admin-stat:hover{border-color:var(--border-hi);box-shadow:var(--shadow-sm)}
.admin-stat::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--ac,var(--gold));opacity:.4;}
.search-field{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:9px 14px;color:var(--text);font-family:var(--fm);font-size:12.5px;outline:none;width:240px;transition:all .25s var(--ease);}
.search-field:focus{border-color:rgba(212,168,83,0.3);box-shadow:0 0 0 4px rgba(212,168,83,0.04);background:var(--s3)}
.search-field::placeholder{color:var(--muted)}

/* ═══ DATA HUB ═══ */
.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
.type-card{border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 14px;cursor:pointer;transition:all .25s var(--ease);background:var(--s2);text-align:center;position:relative;overflow:hidden}
.type-card:hover{border-color:var(--border-hi);background:var(--s3);transform:translateY(-2px);box-shadow:var(--shadow-sm)}
.type-card.selected{border-color:var(--gold);background:rgba(212,168,83,0.04);box-shadow:0 0 20px rgba(212,168,83,0.06)}
.type-card-ico{font-size:26px;margin-bottom:10px}
.type-card-lbl{font-family:var(--fh);font-size:12px;font-weight:700;margin-bottom:4px;letter-spacing:-0.01em}
.type-card-desc{font-size:10px;color:var(--muted);font-weight:400}
.source-item{background:var(--s2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px 18px;margin-bottom:12px;transition:all .25s var(--ease);position:relative;overflow:hidden;}
.source-item:hover{border-color:var(--border-hi);box-shadow:var(--shadow-sm)}
.source-item.active-src{
  border:1.5px solid #4ADE80;
  background:linear-gradient(135deg,rgba(74,222,128,0.10) 0%,rgba(74,222,128,0.03) 50%,var(--s2) 100%);
  box-shadow:0 0 24px rgba(74,222,128,0.18),inset 0 0 0 1px rgba(74,222,128,0.20);
}
.source-item.active-src::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:5px;
  background:linear-gradient(180deg,#34D399,#4ADE80,#22C55E);
  box-shadow:0 0 16px rgba(74,222,128,0.7);
}
.source-item.active-src .src-color-dot{
  background:#4ADE80!important;
  box-shadow:0 0 16px #4ADE80,0 0 6px #4ADE80;
  animation:srcPulse 1.8s ease-in-out infinite;
}
.source-item.active-src .src-name{color:#F1F5FA;font-weight:700;}
.source-item.inactive-src{opacity:.5;filter:grayscale(0.3);}
@keyframes srcPulse{
  0%,100%{box-shadow:0 0 16px #4ADE80,0 0 6px #4ADE80;transform:scale(1)}
  50%{box-shadow:0 0 24px #4ADE80,0 0 12px #4ADE80;transform:scale(1.15)}
}
.src-header{display:flex;align-items:center;gap:12px}
.src-color-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor}
.src-name{font-family:var(--fh);font-size:14px;font-weight:600;color:var(--text);letter-spacing:-0.01em}
.src-meta{font-size:10.5px;color:var(--muted);margin-top:3px;font-family:var(--fm)}
.src-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.src-toggle{width:38px;height:22px;border-radius:11px;cursor:pointer;position:relative;transition:background .25s var(--ease);border:none;flex-shrink:0}
.src-body{margin-top:16px;padding-top:16px;border-top:1px solid var(--border2)}
.preview-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:10px}
.preview-tbl th{padding:7px 12px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border);font-family:var(--fh);font-size:9.5px;text-transform:uppercase;letter-spacing:1.5px;white-space:nowrap;font-weight:700}
.preview-tbl td{padding:7px 12px;border-bottom:1px solid var(--border2);white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;color:var(--text2);}
.preview-tbl tr:hover td{background:rgba(255,255,255,0.015)}
.add-panel{background:var(--s2);border:1px dashed rgba(212,168,83,0.15);border-radius:var(--radius-xl);padding:22px;margin-bottom:16px;transition:border-color .3s}
.add-panel:hover{border-color:rgba(212,168,83,0.3)}
.drop-zone{border:2px dashed rgba(0,201,190,0.25);border-radius:16px;padding:40px 24px;text-align:center;cursor:pointer;transition:all .3s var(--ease);background:linear-gradient(135deg,rgba(0,201,190,0.03),rgba(0,201,190,0.06));position:relative;overflow:hidden;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.drop-zone::before{content:'';position:absolute;inset:0;border-radius:16px;background:radial-gradient(circle at 50% 50%,rgba(0,201,190,0.06),transparent 70%);pointer-events:none}
.drop-zone:hover{border-color:rgba(0,201,190,0.5);background:linear-gradient(135deg,rgba(0,201,190,0.05),rgba(0,201,190,0.1));transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,201,190,0.1)}
.drop-zone.drag{border-color:var(--teal);background:linear-gradient(135deg,rgba(0,201,190,0.08),rgba(0,201,190,0.15));transform:scale(1.02);box-shadow:0 12px 40px rgba(0,201,190,0.2)}
.drop-zone.drop-img{border-color:rgba(236,72,153,0.25);background:linear-gradient(135deg,rgba(236,72,153,0.03),rgba(236,72,153,0.06))}
.drop-zone.drop-img::before{background:radial-gradient(circle at 50% 50%,rgba(236,72,153,0.06),transparent 70%)}
.drop-zone.drop-img:hover{border-color:rgba(236,72,153,0.5);background:linear-gradient(135deg,rgba(236,72,153,0.05),rgba(236,72,153,0.1));box-shadow:0 8px 32px rgba(236,72,153,0.1)}
.drop-zone.drop-img.drag{border-color:#EC4899;background:linear-gradient(135deg,rgba(236,72,153,0.08),rgba(236,72,153,0.15));box-shadow:0 12px 40px rgba(236,72,153,0.2)}
.drop-zone.drop-doc{border-color:rgba(248,113,113,0.25);background:linear-gradient(135deg,rgba(248,113,113,0.03),rgba(248,113,113,0.06))}
.drop-zone.drop-doc::before{background:radial-gradient(circle at 50% 50%,rgba(248,113,113,0.06),transparent 70%)}
.drop-zone.drop-doc:hover{border-color:rgba(248,113,113,0.5);background:linear-gradient(135deg,rgba(248,113,113,0.05),rgba(248,113,113,0.1));box-shadow:0 8px 32px rgba(248,113,113,0.1)}
.drop-zone.drop-doc.drag{border-color:#F87171;background:linear-gradient(135deg,rgba(248,113,113,0.08),rgba(248,113,113,0.15));box-shadow:0 12px 40px rgba(248,113,113,0.2)}

/* ═══ CHAT ═══ */
.chat-wrap{display:flex;flex-direction:column;height:calc(100vh - 56px - 56px);overflow:hidden}
.chat-msgs-wrap{flex:1;position:relative;overflow:hidden;min-height:0;}
.chat-msgs{height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding:6px 2px 14px;}
.chat-msgs::-webkit-scrollbar{width:3px}
.hide-scroll{scrollbar-width:none;-ms-overflow-style:none}.hide-scroll::-webkit-scrollbar{display:none}
.chat-float-btns{position:absolute;right:8px;top:10px;bottom:10px;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none;z-index:5;}
.chat-float-btn{width:32px;height:32px;border-radius:50%;border:1px solid var(--border-hi);background:var(--glass);backdrop-filter:blur(10px);color:var(--text2);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .25s var(--ease);pointer-events:all;box-shadow:var(--shadow-md);opacity:.7;}
.chat-float-btn:hover{opacity:1;color:var(--gold);border-color:rgba(212,168,83,0.3);transform:scale(1.1);box-shadow:var(--shadow-glow-gold)}
.msg{display:flex;gap:12px;animation:pop .25s var(--ease-spring)}
@keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.msg.user{flex-direction:row-reverse}
.ava{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;border:1px solid var(--border);}
.ava.ai{background:rgba(212,168,83,0.06);color:var(--gold);border-color:rgba(212,168,83,0.12)}
.ava.user{background:rgba(0,212,200,0.06);color:var(--teal);border-color:rgba(0,212,200,0.12)}
.bubble{max-width:72%;padding:13px 17px;border-radius:14px;font-size:13.5px;line-height:1.8;border:1px solid var(--border);background:var(--s2);color:var(--text);}
.msg.user .bubble{background:rgba(0,212,200,0.04);border-color:rgba(0,212,200,0.15);}
.bubble-meta{font-family:var(--fh);font-size:9.5px;font-weight:700;color:var(--muted);display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:2px;}
.chat-src-tags{display:flex;flex-wrap:wrap;gap:7px;padding:10px 14px;background:var(--s2);border-radius:12px;border:1px solid var(--border);flex-shrink:0;}
.src-tag{padding:4px 12px;border-radius:20px;font-size:10px;cursor:pointer;border:1px solid;font-family:var(--fm);transition:all .2s var(--ease);font-weight:500}
.chat-input-row{display:flex;gap:8px;align-items:stretch;flex-shrink:0;padding-top:4px;}
.chat-ta{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:12px;padding:11px 16px;color:var(--text);font-family:var(--fh);font-size:13.5px;outline:none;resize:none;max-height:100px;transition:all .25s var(--ease);font-weight:400;line-height:1.5;flex:1;}
.chat-ta:focus{border-color:rgba(0,201,190,0.35);box-shadow:0 0 0 3px rgba(0,201,190,0.06);background:var(--s3)}
.chat-ta::placeholder{color:var(--muted);font-weight:400}
.chat-cat-row{display:flex;gap:5px;flex-shrink:0;padding:6px 0;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none;}
.chat-cat-row::-webkit-scrollbar{display:none}
.chat-q-wrap{display:flex;align-items:center;gap:6px;flex-shrink:0;padding:4px 0;}
.chat-q-arrow{width:26px;height:26px;border-radius:50%;border:1px solid var(--border);background:var(--s2);color:var(--muted);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s var(--ease);flex-shrink:0;}
.chat-q-arrow:hover{border-color:var(--teal);color:var(--teal);background:var(--s3)}
.chat-q-scroll{display:flex;gap:5px;overflow-x:auto;flex:1;padding:2px 0;scroll-behavior:smooth;-ms-overflow-style:none;scrollbar-width:none;min-width:0;}
.chat-q-scroll::-webkit-scrollbar{display:none}
.qchip{padding:5px 11px 5px 7px;border-radius:9px;font-size:10.5px;font-family:var(--fh);border:1px solid var(--border);background:var(--s2);color:var(--text2);cursor:pointer;transition:all .2s var(--ease);font-weight:500;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0;}
.qchip-icon{font-size:12px;flex-shrink:0;}
.qchip:hover{border-color:var(--qc,rgba(212,168,83,0.4));color:var(--qc,var(--gold));background:rgba(255,255,255,0.03);box-shadow:0 2px 8px rgba(0,0,0,0.12)}
.qchip:active{transform:scale(0.97)}
.qcat{padding:4px 9px;border-radius:7px;font-size:9px;font-family:var(--fh);border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:all .2s;font-weight:600;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;flex-shrink:0;}
.qcat:hover{border-color:rgba(0,201,190,0.3);color:var(--teal)}
.chat-send-btn{min-width:44px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--teal),#00A89E);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;font-weight:700;}
.chat-send-btn:hover:not(:disabled){transform:scale(1.05);box-shadow:0 4px 16px rgba(0,201,190,0.3)}
.chat-send-btn:active:not(:disabled){transform:scale(0.95)}
.chat-send-btn:disabled{opacity:.35;cursor:not-allowed;background:var(--s3)}
@keyframes pulse-voice{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0.4)}50%{box-shadow:0 0 0 8px rgba(248,113,113,0)}}
@keyframes dashProg{0%{width:10%;opacity:.7}50%{width:80%;opacity:1}100%{width:10%;opacity:.7}}
@keyframes aiSweep{0%{left:-30%;width:30%}50%{width:45%}100%{left:100%;width:30%}}
@keyframes aiPulse{0%,100%{opacity:0.65}50%{opacity:1}}
.chat-export-btn{background:transparent;border:1px solid var(--border);color:var(--muted);padding:4px 8px;border-radius:8px;cursor:pointer;font-size:12px;transition:all .2s var(--ease);display:flex;align-items:center;gap:4px;font-family:var(--fh);font-size:10px;font-weight:500;}
.chat-export-btn:hover{border-color:var(--border-hi);color:var(--text);background:var(--s3)}
.typing-ind{display:flex;gap:5px;align-items:center}
.typing-ind span{width:6px;height:6px;border-radius:50%;background:var(--gold);animation:tdot 1.4s ease infinite;}
.typing-ind span:nth-child(2){animation-delay:.2s}
.typing-ind span:nth-child(3){animation-delay:.4s}
@keyframes tdot{0%,60%,100%{transform:none;opacity:.35}30%{transform:translateY(-6px);opacity:1}}

/* ═══ CHARTS ═══ */
.chart-tabs{display:flex;gap:7px;margin-bottom:20px;flex-wrap:wrap}

/* ═══ ANALYTICS / REPORTS ═══ */
.ana-btn{padding:12px 18px;border-radius:12px;border:1px solid var(--border);background:var(--s2);cursor:pointer;font-family:var(--fh);font-size:12.5px;font-weight:600;color:var(--text2);transition:all .25s var(--ease);}
.ana-btn:hover{border-color:rgba(212,168,83,0.3);color:var(--gold);background:rgba(212,168,83,0.04);box-shadow:0 0 16px rgba(212,168,83,0.06);transform:translateY(-1px)}
.ana-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}
.report-row{display:flex;align-items:center;gap:16px;padding:18px 20px;background:var(--s2);border-radius:var(--radius-lg);border:1px solid var(--border);margin-bottom:10px;cursor:pointer;transition:all .25s var(--ease);}
.report-row:hover{border-color:rgba(212,168,83,0.25);background:var(--s3);transform:translateX(3px);box-shadow:var(--shadow-sm)}

/* ═══ SETTINGS ═══ */
.model-opt{padding:11px 15px;border-radius:10px;border:1px solid var(--border);background:var(--s2);cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-family:var(--fh);margin-bottom:8px;transition:all .2s var(--ease);font-weight:500}
.model-opt:hover{border-color:var(--border-hi);background:var(--s3);box-shadow:var(--shadow-sm)}
.model-opt.sel{border-color:rgba(212,168,83,0.3);background:rgba(212,168,83,0.04);color:var(--gold);box-shadow:0 0 12px rgba(212,168,83,0.06)}

/* ═══ NOTIFICATION ═══ */
.notif-stack{position:fixed;top:18px;right:18px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;}
.notif{padding:13px 18px;background:var(--s1);border:1px solid var(--border-hi);border-radius:12px;font-size:12.5px;font-family:var(--fh);font-weight:500;max-width:340px;box-shadow:var(--shadow-lg);animation:notifIn .3s var(--ease-spring);pointer-events:all;backdrop-filter:blur(12px);}
@keyframes notifIn{from{opacity:0;transform:translateX(18px) scale(0.95)}to{opacity:1;transform:none}}

/* ═══ MISC ═══ */
.flex{display:flex}.aic{align-items:center}.jb{justify-content:space-between}.f1{flex:1}.fc{flex-direction:column}
.gap4{gap:4px}.gap5{gap:5px}.gap6{gap:6px}.gap8{gap:8px}.gap10{gap:10px}.gap12{gap:12px}.gap16{gap:16px}.gap20{gap:20px}
.flex-wrap{flex-wrap:wrap}
.notice{padding:10px 14px;background:var(--s3);border:1px solid var(--border);border-radius:8px}
.mb6{margin-bottom:6px}.mb8{margin-bottom:8px}.mb10{margin-bottom:10px}.mb12{margin-bottom:12px}.mb14{margin-bottom:14px}.mb16{margin-bottom:16px}.mb20{margin-bottom:20px}.mb24{margin-bottom:24px}
.mt4{margin-top:4px}.mt6{margin-top:6px}.mt8{margin-top:8px}.mt10{margin-top:10px}.mt16{margin-top:16px}
.ml-auto{margin-left:auto}.mr8{margin-right:8px}
.text-gold{color:var(--gold)}.text-teal{color:var(--teal)}.text-green{color:var(--green)}.text-red{color:var(--red)}.text-muted{color:var(--muted)}.text-cyan{color:var(--teal)}
.text-xs{font-size:10.5px}.text-sm{font-size:12px}.text-base{font-size:13.5px}.text-center{text-align:center}
.font-hd{font-family:var(--fh)}.fw6{font-weight:600}.fw7{font-weight:700}.fw8{font-weight:800}
.rounded{border-radius:10px}.overflow-x{overflow-x:auto}
::selection{background:rgba(212,168,83,0.2);color:var(--text)}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.12)}

/* ═══ MOBILE ═══ */
.hamburger-btn{display:none;background:transparent;border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:16px;line-height:1;transition:all .2s var(--ease);}
.hamburger-btn:hover{border-color:var(--border-hi);background:var(--s2)}
.sidebar-close-btn{display:none;background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:16px;position:absolute;top:18px;right:16px;transition:color .2s}
.sidebar-close-btn:hover{color:var(--text)}
.mob-overlay{display:none}.hide-mobile{display:inline}

/* ═══ THEME-SPECIFIC STYLES ═══ */

/* MIDNIGHT — neon glow kartalar, ko'k borderlar */
[data-theme="midnight"] .logo-main span{color:#38BDF8}
[data-theme="midnight"] .grad{background:linear-gradient(135deg,#38BDF8,#34D399);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
[data-theme="midnight"] .btn-primary{background:linear-gradient(135deg,#0EA5E9,#0284C7);box-shadow:0 2px 12px rgba(14,165,233,0.3)}
[data-theme="midnight"] .card{border-color:rgba(56,189,248,0.08);box-shadow:0 0 20px rgba(56,189,248,0.03),0 4px 16px rgba(0,0,0,0.3)}
[data-theme="midnight"] .card:hover{box-shadow:0 0 30px rgba(56,189,248,0.06),0 8px 24px rgba(0,0,0,0.3)}
[data-theme="midnight"] .sidebar{border-right-color:rgba(56,189,248,0.06)}
[data-theme="midnight"] .nav-btn.active{border-left-color:#38BDF8}

/* ═══ SANDSTONE — Warm editorial light ═══ */
[data-theme="sandstone"] .logo-main span{color:#c4a55a}
[data-theme="sandstone"] .grad{background:linear-gradient(135deg,#c4a55a,#16a764);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
[data-theme="sandstone"] .btn-primary{background:linear-gradient(135deg,#c4a55a,#a8873f);color:#fff;box-shadow:0 2px 12px rgba(196,165,90,0.3)}
[data-theme="sandstone"] .card{background:#ffffff;border-color:#e8e5da;box-shadow:0 1px 3px rgba(28,24,15,0.04),0 2px 8px rgba(28,24,15,0.03)}
[data-theme="sandstone"] .card:hover{border-color:#d6d2c2;box-shadow:0 4px 12px rgba(28,24,15,0.06)}
[data-theme="sandstone"] .sidebar{background:#ffffff;border-right-color:#e8e5da}
[data-theme="sandstone"] .topbar{background:rgba(255,255,255,0.85);backdrop-filter:blur(10px);border-bottom-color:#e8e5da}
[data-theme="sandstone"] .field{background:#f5f4ef;border-color:#e8e5da;color:#1a1f1c}
[data-theme="sandstone"] .field:focus{border-color:#c4a55a;box-shadow:0 0 0 3px rgba(196,165,90,0.15)}
[data-theme="sandstone"] .nav-btn{color:#5c665f}
[data-theme="sandstone"] .nav-btn:hover{background:#f5f4ef;color:#1a1f1c}
[data-theme="sandstone"] .nav-btn.active{background:rgba(196,165,90,0.12);color:#8a7230;border-left-color:#c4a55a}
[data-theme="sandstone"] .btn-ghost{border-color:#e8e5da;color:#3d4640}
[data-theme="sandstone"] .btn-ghost:hover{background:#f5f4ef;border-color:#d6d2c2}
[data-theme="sandstone"] .msg .bubble{background:#f5f4ef;border-color:#e8e5da}
[data-theme="sandstone"] .msg.user .bubble{background:#faf5e6;border-color:#e8d7a0}
[data-theme="sandstone"] .landing{background:#fafaf7}
[data-theme="sandstone"] .land-nav{background:rgba(250,250,247,0.92)}
[data-theme="sandstone"] .modal-overlay{background:rgba(28,24,15,0.35)}
[data-theme="sandstone"] .modal-box{background:#ffffff;border-color:#e8e5da;box-shadow:0 24px 64px rgba(28,24,15,0.12)}
[data-theme="sandstone"] .notif{background:#ffffff;border-color:#e8e5da;box-shadow:0 4px 12px rgba(28,24,15,0.06)}
[data-theme="sandstone"] .drop-zone{border-color:#d6d2c2;background:linear-gradient(135deg,rgba(196,165,90,0.03),rgba(196,165,90,0.06))}

/* ═══ PORCELAIN — Cool minimalist light ═══ */
[data-theme="porcelain"] .logo-main span{color:#1e3a5f}
[data-theme="porcelain"] .grad{background:linear-gradient(135deg,#1e3a5f,#6b9080);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
[data-theme="porcelain"] .btn-primary{background:linear-gradient(135deg,#1e3a5f,#2e5186);color:#fff;box-shadow:0 2px 12px rgba(30,58,95,0.25)}
[data-theme="porcelain"] .card{background:#ffffff;border-color:#dde3ec;box-shadow:0 1px 3px rgba(15,26,46,0.04),0 2px 8px rgba(15,26,46,0.03)}
[data-theme="porcelain"] .card:hover{border-color:#c4cbd9;box-shadow:0 4px 12px rgba(15,26,46,0.06)}
[data-theme="porcelain"] .sidebar{background:#ffffff;border-right-color:#dde3ec}
[data-theme="porcelain"] .topbar{background:rgba(255,255,255,0.88);backdrop-filter:blur(10px);border-bottom-color:#dde3ec}
[data-theme="porcelain"] .field{background:#f1f3f7;border-color:#dde3ec;color:#0f1a2e}
[data-theme="porcelain"] .field:focus{border-color:#1e3a5f;box-shadow:0 0 0 3px rgba(30,58,95,0.12)}
[data-theme="porcelain"] .nav-btn{color:#4a5973}
[data-theme="porcelain"] .nav-btn:hover{background:#f1f3f7;color:#0f1a2e}
[data-theme="porcelain"] .nav-btn.active{background:rgba(30,58,95,0.08);color:#1e3a5f;border-left-color:#1e3a5f}
[data-theme="porcelain"] .btn-ghost{border-color:#dde3ec;color:#2a3548}
[data-theme="porcelain"] .btn-ghost:hover{background:#f1f3f7;border-color:#c4cbd9}
[data-theme="porcelain"] .msg .bubble{background:#f1f3f7;border-color:#dde3ec}
[data-theme="porcelain"] .msg.user .bubble{background:rgba(30,58,95,0.06);border-color:rgba(30,58,95,0.15)}
[data-theme="porcelain"] .landing{background:#f8f9fb}
[data-theme="porcelain"] .land-nav{background:rgba(248,249,251,0.92)}
[data-theme="porcelain"] .modal-overlay{background:rgba(15,26,46,0.4)}
[data-theme="porcelain"] .modal-box{background:#ffffff;border-color:#dde3ec;box-shadow:0 24px 64px rgba(15,26,46,0.15)}
[data-theme="porcelain"] .notif{background:#ffffff;border-color:#dde3ec;box-shadow:0 4px 12px rgba(15,26,46,0.08)}
[data-theme="porcelain"] .drop-zone{border-color:#c4cbd9;background:linear-gradient(135deg,rgba(30,58,95,0.03),rgba(107,144,128,0.04))}

@media(max-width:768px){
  .hamburger-btn{display:flex;align-items:center}
  .sidebar-close-btn{display:block}
  .hide-mobile{display:none}
  .sidebar{position:fixed;top:0;left:0;height:100vh;z-index:1000;transform:translateX(0);box-shadow:8px 0 40px rgba(0,0,0,0.7);backdrop-filter:blur(20px)}
  .sidebar.sidebar-closed{transform:translateX(-100%)}
  .mob-overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999;backdrop-filter:blur(4px);}
  .g4{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr}.g2{grid-template-columns:1fr}
  .pricing-grid{grid-template-columns:1fr 1fr}.feat-grid{grid-template-columns:1fr 1fr}
  .land-stats{grid-template-columns:repeat(3,1fr)}.land-hero{padding:60px 20px 48px;}
  .land-nav,.land-section,.land-stats{padding-left:16px;padding-right:16px}
  .chat-wrap{height:calc(100vh - 56px - 32px)}.bubble{max-width:92%}
  .type-grid{grid-template-columns:repeat(2,1fr)}.content{padding:12px}.topbar{padding:0 12px}
  .topbar-right{gap:4px}
  .tb-item{height:30px;padding:0 8px;font-size:10px;border-radius:8px}
  .page-title{font-size:14px}
  .card{padding:14px;border-radius:12px}
  .chat-ta{font-size:13px}
  .chat-send-btn{min-width:38px;height:38px;border-radius:10px}
  .chat-voice-btn{min-width:38px;height:38px;border-radius:10px}
  .drop-zone{min-height:120px;padding:24px 16px}
  .modal-box{padding:20px;width:calc(100vw - 16px);max-height:85vh}
}
@media(max-width:480px){
  .g4{grid-template-columns:1fr}.pricing-grid{grid-template-columns:1fr}.feat-grid{grid-template-columns:1fr}
  .land-stats{grid-template-columns:1fr 1fr}.stat-block{border-bottom:1px solid var(--border)}
  .hero-title{font-size:28px;letter-spacing:-1px}
  .hero-sub{font-size:13px}
  .land-nav{flex-wrap:wrap;gap:8px}
  .content{padding:8px}
  .card{padding:12px}
  .bubble{max-width:95%}
}
/* ═══ SKELETON LOADING ═══ */
@keyframes skPulse{0%,100%{opacity:.06}50%{opacity:.12}}
.sk{background:var(--s3);border-radius:8px;animation:skPulse 1.5s ease-in-out infinite}
.sk-card{height:80px;border-radius:var(--radius-lg);margin-bottom:10px}
.sk-line{height:12px;border-radius:4px;margin-bottom:8px}
.sk-line.w60{width:60%}.sk-line.w80{width:80%}.sk-line.w40{width:40%}
.sk-circle{width:40px;height:40px;border-radius:50%}
.sk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
`;
// ─────────────────────────────────────────────────────────────
// NOTIFICATION HOOK
// ─────────────────────────────────────────────────────────────
function useNotifs() {
  const [notifs, setNotifs] = useState([]);
  const remove = useCallback((id) => setNotifs(p => p.filter(n => n.id !== id)), []);
  const push = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setNotifs(p => [...p, { id, msg, type }]);
    setTimeout(() => remove(id), 3000);
  }, [remove]);
  return { notifs, push, remove };
}
function NotifBanner({ notifs, remove }) {
  const colors = { ok: "var(--green)", error: "var(--red)", info: "var(--text2)", warn: "var(--gold)" };
  return (
    <div className="notif-stack">
      {notifs.map(n => (
        <div key={n.id} className="notif"
          onClick={() => remove(n.id)}
          style={{ borderLeftColor: colors[n.type] || colors.info, borderLeftWidth: 3, cursor: "pointer" }}>
          {n.msg}
        </div>
      ))}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────────────────────
function LandingPage({ onLogin, onRegister }) {
  const [billing, setBilling] = useState("monthly");
  const [openFaq, setOpenFaq] = useState(null);
  const { theme, setTheme, toggle: toggleTheme } = useTheme();
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  // SVG icon helper — gradient rangdor iconlar
  const I = (paths, c1, c2, id) => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor={c1} /><stop offset="1" stopColor={c2} />
      </linearGradient></defs>
      {paths}
    </svg>
  );
  const feats = [
    { ico: I(<><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" stroke={`url(#fi0)`} strokeWidth="1.8" /><path d="M9 14h6l2 8H7l2-8z" stroke={`url(#fi0)`} strokeWidth="1.8" /><circle cx="12" cy="6" r="1.5" fill={`url(#fi0)`} /></>, "#E8B84B", "#D4A853", "fi0"), title: "4 ta AI Provayder", desc: "Claude, ChatGPT, DeepSeek, Gemini — bitta joydan boshqaring. SSE streaming bilan real-vaqt javoblar. O'zbek tilida to'liq qo'llab-quvvatlanadi.", c: "var(--gold)" },
    { ico: I(<><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8" /></>, "#00C9BE", "#00A89E", "fi1"), title: "12 ta Ma'lumot Manbasi", desc: "Excel, Google Sheets, REST API, Instagram, Telegram, CRM, PDF, Rasm, 1C Buxgalteriya, Yandex Metrika, SQL Database — barchasini ulang.", c: "var(--teal)" },
    { ico: I(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke={`url(#fi2)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>, "#4ADE80", "#22C55E", "fi2"), title: "9 xil Grafik Turi", desc: "Chiziq, ustun, doira, maydon, tarqoq, gauge va boshqalar. AI avtomatik mos grafikni tanlaydi.", c: "var(--green)" },
    { ico: I(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={`url(#fi3)`} strokeWidth="1.8" strokeLinecap="round" /><line x1="12" y1="9" x2="12" y2="13" stroke={`url(#fi3)`} strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16.5" r="1" fill={`url(#fi3)`} /></>, "#F87171", "#EF4444", "fi3"), title: "Anomaliya Aniqlash", desc: "Matematik va AI tahlil orqali g'ayrioddiy o'zgarishlarni avtomatik topadi. Siz so'ramasdan xabar beradi.", c: "var(--red)" },
    { ico: I(<><rect x="9" y="2" width="6" height="11" rx="3" stroke={`url(#fi4)`} strokeWidth="1.8" /><path d="M5 10a7 7 0 0 0 14 0" stroke={`url(#fi4)`} strokeWidth="1.8" strokeLinecap="round" /><line x1="12" y1="17" x2="12" y2="22" stroke={`url(#fi4)`} strokeWidth="1.8" strokeLinecap="round" /><line x1="8" y1="22" x2="16" y2="22" stroke={`url(#fi4)`} strokeWidth="1.8" strokeLinecap="round" /></>, "#A78BFA", "#7C3AED", "fi4"), title: "Ovozli Kiritish", desc: "Mikrofon orqali savol bering — O'zbek va Rus tilida ishlaydi. Qo'l bilan yozish shart emas.", c: "var(--purple)" },
    { ico: I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={`url(#fi5)`} strokeWidth="1.8" strokeLinecap="round" /><polyline points="14 2 14 8 20 8" stroke={`url(#fi5)`} strokeWidth="1.8" strokeLinecap="round" /><line x1="8" y1="13" x2="16" y2="13" stroke={`url(#fi5)`} strokeWidth="1.5" strokeLinecap="round" /><line x1="8" y1="17" x2="13" y2="17" stroke={`url(#fi5)`} strokeWidth="1.5" strokeLinecap="round" /></>, "#F87171", "#DC2626", "fi5"), title: "Hujjat Tahlili", desc: "PDF, Word, TXT fayllarni yuklang — AI mazmunni o'qib, tahlil qiladi va javob beradi.", c: "#F87171" },
    { ico: I(<><rect x="3" y="3" width="18" height="18" rx="3" stroke={`url(#fi6)`} strokeWidth="1.8" /><circle cx="8.5" cy="8.5" r="2" stroke={`url(#fi6)`} strokeWidth="1.5" /><path d="M21 15l-5-5L5 21" stroke={`url(#fi6)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>, "#EC4899", "#DB2777", "fi6"), title: "Rasm Tahlili", desc: "Rasm yuklang — AI rasm tarkibini tavsiflaydi, diagrammalarni o'qiydi va ma'lumot ajratadi.", c: "#EC4899" },
    { ico: I(<><path d="M4 4h16v16H4z" stroke={`url(#fi7)`} strokeWidth="0" /><rect x="3" y="3" width="18" height="18" rx="2" stroke={`url(#fi7)`} strokeWidth="1.8" /><path d="M8 12h8M8 8h8M8 16h5" stroke={`url(#fi7)`} strokeWidth="1.8" strokeLinecap="round" /></>, "#60A5FA", "#3B82F6", "fi7"), title: "Avtomatik Hisobotlar", desc: "PDF, Excel, TXT formatida professional hisobotlar. 8 xil modul — bir tugma bilan tayyor.", c: "#60A5FA" },
    { ico: I(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={`url(#fi8)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><polyline points="9 22 9 12 15 12 15 22" stroke={`url(#fi8)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>, "#8B5CF6", "#6D28D9", "fi8"), title: "CRM Integratsiya", desc: "LC-UP CRM dan lidlar, guruhlar, o'quvchilar, o'qituvchilar ma'lumotlarini tortib, AI bilan tahlil qiling.", c: "#8B5CF6" },
  ];

  const howItWorks = [
    { step: "01", title: "Ma'lumot ulang", desc: "Data Hub da Excel, CRM, Instagram yoki boshqa manbani ulang. Drag & drop bilan fayl tashlang.", ico: I(<><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke={`url(#hw0)`} strokeWidth="1.8" strokeLinecap="round" /></>, "#00C9BE", "#00A89E", "hw0"), c: "var(--teal)" },
    { step: "02", title: "AI savol bering", desc: "Chat sahifasida savolingizni yozing yoki mikrofon bosib ayting. AI ma'lumotlaringiz asosida javob beradi.", ico: I(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={`url(#hw1)`} strokeWidth="1.8" strokeLinecap="round" /></>, "#E8B84B", "#D4A853", "hw1"), c: "var(--gold)" },
    { step: "03", title: "Natija oling", desc: "Grafiklar, hisobotlar, ogohlantirishlar — barchasi avtomatik. Bir tugma bilan PDF ga eksport qiling.", ico: I(<><line x1="18" y1="20" x2="18" y2="10" stroke={`url(#hw2)`} strokeWidth="2.5" strokeLinecap="round" /><line x1="12" y1="20" x2="12" y2="4" stroke={`url(#hw2)`} strokeWidth="2.5" strokeLinecap="round" /><line x1="6" y1="20" x2="6" y2="14" stroke={`url(#hw2)`} strokeWidth="2.5" strokeLinecap="round" /></>, "#4ADE80", "#22C55E", "hw2"), c: "var(--green)" },
  ];

  const whyCards = [
    { title: "Vaqtingizni tejang", desc: "Soatlab Excel bilan o'tirib hisobot yozish o'rniga — AI 30 soniyada tayyor qiladi. Siz biznesga e'tibor bering, hisobotni AI ga qoldiring.", ico: I(<><circle cx="12" cy="12" r="10" stroke={`url(#wc0)`} strokeWidth="1.8" /><polyline points="12 6 12 12 16 14" stroke={`url(#wc0)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>, "#E8B84B", "#D4A853", "wc0"), c: "#E8B84B" },
    { title: "Raqamlarga asoslaning", desc: "Sezgi bilan emas, aniq raqamlar bilan qaror qabul qiling. Qayerda pul yo'qolayotganini, qayerda o'sayotganini real-vaqtda ko'ring.", ico: I(<><line x1="18" y1="20" x2="18" y2="10" stroke={`url(#wc1)`} strokeWidth="2.5" strokeLinecap="round" /><line x1="12" y1="20" x2="12" y2="4" stroke={`url(#wc1)`} strokeWidth="2.5" strokeLinecap="round" /><line x1="6" y1="20" x2="6" y2="14" stroke={`url(#wc1)`} strokeWidth="2.5" strokeLinecap="round" /></>, "#4ADE80", "#22C55E", "wc1"), c: "#4ADE80" },
    { title: "Muammolarni oldindan ko'ring", desc: "AI sizning ma'lumotlaringizda anomaliyalarni avtomatik topadi. Savdo tushayotganini siz bilmasdan — tizim ogohlantiradi.", ico: I(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={`url(#wc2)`} strokeWidth="1.8" /><line x1="12" y1="9" x2="12" y2="13" stroke={`url(#wc2)`} strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16.5" r="1" fill={`url(#wc2)`} /></>, "#F87171", "#EF4444", "wc2"), c: "#F87171" },
    { title: "Barcha ma'lumot bir joyda", desc: "Excel, CRM, Instagram, Telegram — turli joylardagi ma'lumotlar bitta ekranda. Boshqa tab almashish, fayl qidirish yo'q.", ico: I(<><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8" /></>, "#00C9BE", "#00A89E", "wc3"), c: "#00C9BE" },
    { title: "Xodimga to'lamang — AI qiladi", desc: "Tahlilchi yollash oyiga 5-10 mln so'm. Analix bilan professional tahlilni 99 ming so'mdan oling. 50 barobar arzon.", ico: I(<><line x1="12" y1="1" x2="12" y2="23" stroke={`url(#wc4)`} strokeWidth="1.8" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke={`url(#wc4)`} strokeWidth="1.8" strokeLinecap="round" /></>, "#A78BFA", "#7C3AED", "wc4"), c: "#A78BFA" },
    { title: "Ovozingiz bilan so'rang", desc: "Yozishga vaqt yo'qmi? Mikrofon bosing va savol bering. AI O'zbek tilida tushunadi va javob beradi. Mashina haydab ketayotganda ham ishlaydi.", ico: I(<><rect x="9" y="2" width="6" height="11" rx="3" stroke={`url(#wc5)`} strokeWidth="1.8" /><path d="M5 10a7 7 0 0 0 14 0" stroke={`url(#wc5)`} strokeWidth="1.8" strokeLinecap="round" /><line x1="12" y1="17" x2="12" y2="22" stroke={`url(#wc5)`} strokeWidth="1.8" strokeLinecap="round" /><line x1="8" y1="22" x2="16" y2="22" stroke={`url(#wc5)`} strokeWidth="1.8" strokeLinecap="round" /></>, "#EC4899", "#DB2777", "wc5"), c: "#EC4899" },
  ];

  const faqs = [
    { q: "Analix qanday ishlaydi?", a: "Siz ma'lumot manbangizni (Excel, CRM, Instagram va h.k.) ulaysiz. AI shu ma'lumotlar asosida savollaringizga javob beradi, grafiklar yaratadi, hisobotlar yozadi va anomaliyalarni aniqlaydi." },
    { q: "Qaysi AI provayderlarni qo'llab-quvvatlaydi?", a: "Claude (Anthropic), ChatGPT (OpenAI), DeepSeek va Gemini (Google). Admin bitta global kalit o'rnatadi — barcha foydalanuvchilar bepul foydalanadi. Yoki o'z shaxsiy kalitingizni ulang." },
    { q: "Ma'lumotlarim xavfsizmi?", a: "Ha. Ma'lumotlar PostgreSQL serverda shifrlangan holda saqlanadi. Boshqa foydalanuvchilar sizning ma'lumotlaringizni ko'ra olmaydi. Har bir foydalanuvchi uchun alohida izolyatsiya." },
    { q: "Qancha turadi?", a: "Bepul tarif bor — 5 ta AI so'rov, 1 ta fayl. Boshlang'ich tarif 99,000 so'm/oy dan boshlanadi. Yillik to'lovda 2 oy bepul." },
    { q: "Qanday ma'lumot manbalarini ulash mumkin?", a: "Excel/CSV fayllar, Google Sheets, REST API, Instagram Business, Telegram kanal, LC-UP CRM, PDF/Word hujjatlar, rasmlar, 1C Buxgalteriya, Yandex Metrika, SQL Database — jami 12 ta manba turi." },
    { q: "O'zbek tilida ishlashi mumkinmi?", a: "Ha! Interfeys 100% O'zbek tilida. AI ham O'zbek tilida javob beradi. Ovozli kiritish ham O'zbek va Rus tilini qo'llab-quvvatlaydi." },
  ];

  const planList = Object.keys(PLANS).map(k => getPlan(k));
  const testimonials = [
    { name: "Aziz Karimov", role: "O'quv markaz direktori", text: "CRM ni ulagan kunoq o'quvchilar tahlili tayyor bo'ldi. Endi har oylik hisobotni 2 daqiqada olaman.", ava: "AK" },
    { name: "Nilufar Rahimova", role: "Marketing mutaxassisi", text: "Instagram postlarimni AI tahlil qiladi — qaysi kontent ishlashini ko'rsatadi. Engagement 40% oshdi.", ava: "NR" },
    { name: "Jasur Toshmatov", role: "Kichik biznes egasi", text: "Excel hisobotlarimni yuklayman, AI savdo prognozini beradi. Endi qaror qabul qilish osonlashdi.", ava: "JT" },
  ];

  return (
    <div className="landing">
      {/* NAV */}
      <nav className="land-nav">
        <div className="land-logo">ANA<span>LIX</span></div>
        <div className="flex gap8 aic" style={{ flexWrap: "wrap" }}>
          {[{ l: "Xususiyatlar", id: "features" }, { l: "Qanday ishlaydi", id: "howitworks" }, { l: "Narxlar", id: "pricing" }, { l: "FAQ", id: "faq" }].map(n => (
            <button key={n.id} onClick={() => scrollTo(n.id)} style={{ fontSize: 13, color: "var(--text2)", background: "none", border: "none", fontFamily: "var(--fh)", fontWeight: 500, padding: "6px 12px", cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={e => e.target.style.color = "var(--teal)"} onMouseLeave={e => e.target.style.color = "var(--text2)"}>{n.l}</button>
          ))}
          <ThemeToggle theme={theme} toggle={toggleTheme} setTheme={setTheme} size="sm" />
          <button className="btn btn-ghost btn-sm" onClick={onLogin}>Kirish</button>
          <button className="btn btn-primary btn-sm" onClick={onRegister}>Bepul boshlash</button>
        </div>
      </nav>

      {/* HERO */}
      <div className="land-hero">
        <div className="hero-badge"><span style={{ color: "var(--teal)" }}>&#9670;</span> Tizim doimiy yangilanib boradi — har hafta yangi imkoniyatlar</div>
        <h1 className="hero-title">
          Biznesingizni<br />
          <span className="grad">Sun'iy Intellekt</span><br />
          bilan boshqaring
        </h1>
        <p className="hero-sub">
          Excel, CRM, Instagram, Telegram, PDF, rasmlar va 12 ta boshqa manbani AI ga ulang.
          Savol bering — tahlil, grafik, hisobot tayyor. Hatto ovozingiz bilan so'rang.
        </p>
        <div className="hero-btns">
          <button className="btn btn-primary btn-lg" onClick={onRegister} style={{ padding: "14px 36px", fontSize: 15 }}>
            Bepul boshlang →
          </button>
          <button className="btn btn-ghost btn-lg" onClick={onLogin} style={{ padding: "14px 28px", fontSize: 15 }}>
            Kirish
          </button>
        </div>
        <div style={{ marginTop: 28, display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", fontSize: 12, color: "var(--muted)", fontFamily: "var(--fm)" }}>
          <span>✓ Kredit karta shart emas</span>
          <span>✓ 30 soniyada ro'yxatdan o'ting</span>
          <span>✓ 5 ta AI so'rov bepul</span>
        </div>
      </div>

      {/* STATS */}
      <div className="land-stats">
        {[{ n: "4+", l: "AI Provayder" }, { n: "12", l: "Ma'lumot manbasi" }, { n: "9", l: "Grafik turi" }, { n: "Voice", l: "Ovozli kiritish" }, { n: "100%", l: "O'zbek tilida" }].map((s, i) => (
          <div key={i} className="stat-block">
            <div className="stat-num">{s.n}</div>
            <div className="stat-lbl">{s.l}</div>
          </div>
        ))}
      </div>

      {/* HOW IT WORKS */}
      <div id="howitworks" className="land-section">
        <h2 className="land-section-title">Qanday ishlaydi?</h2>
        <p className="land-section-sub">3 ta oddiy qadamda biznes tahlilga ega bo'ling</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, maxWidth: 960, margin: "0 auto" }}>
          {howItWorks.map((h, i) => (
            <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 16, padding: "32px 28px", textAlign: "center", position: "relative", transition: "all .25s", cursor: "default" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = h.c + "50"; e.currentTarget.style.transform = "translateY(-4px)" }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none" }}>
              <div style={{ position: "absolute", top: 16, left: 20, fontFamily: "var(--fh)", fontSize: 42, fontWeight: 900, color: h.c, opacity: 0.08 }}>{h.step}</div>
              <div style={{ marginBottom: 16, width: 48, height: 48, borderRadius: 14, background: `${h.c}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>{h.ico}</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 17, fontWeight: 700, marginBottom: 8, color: h.c }}>{h.title}</div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>{h.desc}</div>
              {i < 2 && <div style={{ position: "absolute", right: -16, top: "50%", fontSize: 20, color: "var(--muted)", display: window.innerWidth > 800 ? "block" : "none" }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div id="features" className="land-section" style={{ background: "var(--s1)", margin: 0, padding: "70px 48px" }}>
        <h2 className="land-section-title">Kuchli imkoniyatlar</h2>
        <p className="land-section-sub">Biznes tahlili uchun zarur bo'lgan barcha vositalar — bitta platformada</p>
        <div className="feat-grid">
          {feats.map((f, i) => (
            <div key={i} className="feat-card" style={{ "--fc": f.c }}>
              <div className="feat-ico">{f.ico}</div>
              <div className="feat-title" style={{ color: f.c }}>{f.title}</div>
              <div className="feat-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* WHY ANALIX — Sotuvga undovchi */}
      <div className="land-section">
        <h2 className="land-section-title">Nega aynan Analix?</h2>
        <p className="land-section-sub">Biznesingizni tushunish uchun soatlab vaqt sarflamang — AI buni soniyalarda qiladi</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, maxWidth: 1100, margin: "0 auto" }}>
          {whyCards.map((w, i) => (
            <div key={i} style={{ padding: "28px 24px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--s1)", transition: "all .3s var(--ease)", cursor: "default", position: "relative", overflow: "hidden" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = w.c + "50"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 16px 40px ${w.c}15` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: `linear-gradient(90deg,transparent,${w.c}60,transparent)`, opacity: 0.6 }} />
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${w.c}10`, border: `1px solid ${w.c}20`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>{w.ico}</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 17, fontWeight: 700, marginBottom: 8, color: w.c, letterSpacing: "-0.3px" }}>{w.title}</div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8 }}>{w.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div className="land-section" style={{ background: "var(--s1)", margin: 0, padding: "70px 48px" }}>
        <h2 className="land-section-title">Foydalanuvchilar fikri</h2>
        <p className="land-section-sub">Analix ishlatayotgan mutaxassislar nima deydi</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20, maxWidth: 1000, margin: "0 auto" }}>
          {testimonials.map((t, i) => (
            <div key={i} style={{ padding: "28px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)", position: "relative" }}>
              <div style={{ fontSize: 40, color: "var(--gold)", opacity: 0.12, position: "absolute", top: 12, right: 20, fontFamily: "Georgia,serif", fontWeight: 700 }}>&ldquo;</div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8, marginBottom: 20, fontStyle: "italic" }}>"{t.text}"</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,var(--gold),var(--teal))", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fh)", fontWeight: 800, fontSize: 13, color: "#000" }}>{t.ava}</div>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing" className="land-section" style={{ padding: "70px 40px" }}>
        <h2 className="land-section-title">Qulay narxlar</h2>
        <p className="land-section-sub">Biznesingiz hajmiga mos tarif tanlang. Istalgan vaqtda yangilash mumkin.</p>
        <div className="billing-toggle">
          <div className="billing-pill">
            <div className={`billing-opt ${billing === "monthly" ? "active" : ""}`} onClick={() => setBilling("monthly")}>Oylik</div>
            <div className={`billing-opt ${billing === "yearly" ? "active teal" : ""}`} onClick={() => setBilling("yearly")}>Yillik</div>
          </div>
          {billing === "yearly" && <span className="billing-save">2 oy bepul!</span>}
        </div>
        <div className="pricing-grid">
          {planList.map(plan => (
            <div key={plan.id} className={`plan-card ${plan.badge ? "popular" : ""}`}>
              {plan.badge && <div className="plan-badge">{plan.badge}</div>}
              <div className="plan-name" style={{ color: plan.color }}>{plan.nameUz}</div>
              <div className="plan-price" style={{ color: plan.price_monthly === 0 ? "var(--text)" : plan.color }}>
                {billing === "yearly" && plan.price_yearly > 0
                  ? <>{Math.round(plan.price_yearly / 12).toLocaleString("uz-UZ")}<span> so'm</span></>
                  : plan.price_monthly === 0 ? "Bepul" : <>{plan.price_monthly.toLocaleString("uz-UZ")}<span> so'm</span></>}
              </div>
              <div className="plan-period">{plan.price_monthly === 0 ? "Doimo bepul" : billing === "yearly" ? "oyiga (yillik hisob)" : "oyiga"}</div>
              <div className="plan-divider" />
              {plan.features.map((f, i) => (
                <div key={i} className="plan-feat">
                  <span className="plan-feat-ico" style={{ color: f.ok ? "var(--green)" : "var(--muted)" }}>{f.ok ? "✓" : "✗"}</span>
                  <span style={{ color: f.ok ? "var(--text2)" : "var(--muted)", fontSize: 11 }}>{f.t}</span>
                </div>
              ))}
              <div className="plan-btn">
                <button className="btn btn-primary" style={{ width: "100%", background: plan.price_monthly === 0 ? "var(--s3)" : undefined, color: plan.price_monthly === 0 ? "var(--text2)" : undefined, boxShadow: plan.price_monthly === 0 ? "none" : undefined, border: plan.price_monthly === 0 ? "1px solid var(--border)" : "none" }}
                  onClick={onRegister}>{plan.price_monthly === 0 ? "Bepul boshlash" : "Tanlash →"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div id="faq" className="land-section" style={{ background: "var(--s1)", margin: 0, padding: "70px 48px" }}>
        <h2 className="land-section-title">Ko'p so'raladigan savollar</h2>
        <p className="land-section-sub">Savolingiz bormi? Javoblar shu yerda</p>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "0" }}>
              <div onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ padding: "20px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "color .2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--teal)"} onMouseLeave={e => e.currentTarget.style.color = "var(--text)"}>
                <span style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 600 }}>{f.q}</span>
                <span style={{ fontSize: 18, color: "var(--muted)", transition: "transform .3s", transform: openFaq === i ? "rotate(45deg)" : "none", flexShrink: 0, marginLeft: 16 }}>+</span>
              </div>
              {openFaq === i && (
                <div style={{ padding: "0 0 20px", fontSize: 13, color: "var(--text2)", lineHeight: 1.8, animation: "fadeIn .3s ease" }}>{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="land-section" style={{ textAlign: "center", padding: "80px 48px" }}>
        <h2 className="land-section-title">Biznesingizni AI bilan boshqarishni boshlang</h2>
        <p className="land-section-sub" style={{ marginBottom: 32 }}>Ro'yxatdan o'tish 30 soniya — kredit karta shart emas</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={onRegister} style={{ padding: "16px 40px", fontSize: 16 }}>Bepul boshlash →</button>
          <button className="btn btn-ghost btn-lg" onClick={() => scrollTo("features")} style={{ padding: "16px 32px", fontSize: 16 }}>Batafsil →</button>
        </div>
        <div style={{ marginTop: 32, display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
          <span>&#9670; 4 ta AI provayder</span>
          <span>&#9670; 12 ta manba turi</span>
          <span>&#9670; Ovozli kiritish</span>
          <span>&#9670; Hujjat tahlili</span>
          <span>&#9670; Xavfsiz</span>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "32px 48px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 32 }}>
        <div>
          <div style={{ fontFamily: "var(--fh)", fontWeight: 800, fontSize: 18, marginBottom: 12 }}>ANA<span style={{ color: "var(--gold)" }}>LIX</span></div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>O'zbekiston uchun AI-powered biznes tahlil platformasi. Barcha ma'lumotlaringizni bitta joyda tahlil qiling.</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Sahifalar</div>
          {[{ l: "Xususiyatlar", id: "features" }, { l: "Narxlar", id: "pricing" }, { l: "FAQ", id: "faq" }, { l: "Qanday ishlaydi", id: "howitworks" }].map(n => (
            <div key={n.id} style={{ fontSize: 12, color: "var(--text2)", cursor: "pointer", padding: "4px 0", transition: "color .2s" }}
              onClick={() => scrollTo(n.id)} onMouseEnter={e => e.target.style.color = "var(--teal)"} onMouseLeave={e => e.target.style.color = "var(--text2)"}>{n.l}</div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Ma'lumot manbalari</div>
          {["Excel/CSV", "Google Sheets", "Instagram", "Telegram", "CRM", "PDF/Word", "Rasmlar", "1C Buxgalteriya", "Yandex Metrika", "SQL Database"].map(s => (
            <div key={s} style={{ fontSize: 11, color: "var(--text2)", padding: "3px 0" }}>{s}</div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Aloqa</div>
          <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.8 }}>
            <div>info@analix.uz</div>
            <div>Telegram: @analix_uz</div>
            <div>analix.uz</div>
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", padding: "16px 48px", textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
        © 2025-2026 Analix. Barcha huquqlar himoyalangan. O'zbekistonda ishlab chiqilgan.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN PAGE
// ─────────────────────────────────────────────────────────────
function LoginPage({ onAuth, onGoRegister, onGoLanding }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { setError("Hamma maydonlarni to'ldiring"); return; }
    setLoading(true); setError("");
    try {
      const res = await Auth.login(email, password, remember);
      if (res.error) { setError(res.error); setLoading(false); }
      else { localStorage.setItem("bai_session_remember", remember ? "1" : ""); onAuth(res.user); }
    } catch (e) { setError(e.message || "Xatolik yuz berdi"); setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <style>{CSS}</style>
      <div className="auth-card">
        <div className="auth-logo">ANA<span>LIX</span></div>
        <div className="auth-sub">Hisobingizga kiring</div>
        {error && <div className="auth-err">{error}</div>}
        <div className="auth-field-wrap">
          <label className="field-label">Email</label>
          <input className="field" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div className="auth-field-wrap">
          <label className="field-label">Parol</label>
          <input className="field" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div className="flex aic jb" style={{ marginTop: 4, marginBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text2)", cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: "var(--teal)" }} />
            Eslab qolish
          </label>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit} disabled={loading}>
          {loading ? "Kirilmoqda..." : "Kirish"}
        </button>
        <div className="auth-divider">yoki</div>
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
          Hisob yo'qmi? <span className="auth-link" onClick={onGoRegister}>Ro'yxatdan o'ting</span>
        </div>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <span className="auth-link" style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }} onClick={onGoLanding}>Bosh sahifaga qaytish</span>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REGISTER PAGE
// ─────────────────────────────────────────────────────────────
function RegisterPage({ onAuth, onGoLogin, onGoLanding }) {
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name || !organizationName || !email || !password) { setError("Hamma maydonlarni to'ldiring"); return; }
    if (password.length < 6) { setError("Parol kamida 6 ta belgi bo'lishi kerak"); return; }
    if (password !== password2) { setError("Parollar mos emas"); return; }
    setLoading(true); setError("");
    try {
      const res = await Auth.register(name, email, password, organizationName);
      if (res.error) { setError(res.error); setLoading(false); }
      else onAuth(res.user);
    } catch (e) { setError(e.message || "Xatolik yuz berdi"); setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <style>{CSS}</style>
      <div className="auth-card">
        <div className="auth-logo">ANA<span>LIX</span></div>
        <div className="auth-sub">Yangi hisob yarating — bepul tarifda boshlang</div>
        {error && <div className="auth-err">{error}</div>}
        {[
          { l: "Ism familiya", v: name, s: setName, t: "text", p: "Abdullayev Bobur", key: "name" },
          { l: "Kompaniya / Tashkilot nomi", v: organizationName, s: setOrganizationName, t: "text", p: "Masalan: Abdullayev Trade", key: "org", hint: "Siz CEO bo'lasiz, keyin xodim qo'sha olasiz" },
          { l: "Email", v: email, s: setEmail, t: "email", p: "email@example.com", key: "email" },
          { l: "Parol", v: password, s: setPassword, t: "password", p: "Kamida 6 ta belgi", key: "password" },
          { l: "Parolni takrorlang", v: password2, s: setPassword2, t: "password", p: "••••••••", key: "password2" },
        ].map(f => (
          <div key={f.key} className="auth-field-wrap">
            <label className="field-label">{f.l}</label>
            <input className="field" type={f.t} placeholder={f.p} value={f.v} onChange={e => f.s(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
            {f.hint && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{f.hint}</div>}
          </div>
        ))}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 4, justifyContent: "center" }} onClick={submit} disabled={loading}>
          {loading ? "Yaratilmoqda..." : "Hisob yaratish"}
        </button>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
          Hisob bormi? <span className="auth-link" onClick={onGoLogin}>Kiring</span>
        </div>
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <span className="auth-link" style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }} onClick={onGoLanding}>Bosh sahifaga</span>
        </div>
        <div style={{ marginTop: 14, fontSize: 10, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
          Ro'yxatdan o'tish orqali siz <span style={{ color: "var(--teal)" }}>Foydalanish shartlari</span> va <span style={{ color: "var(--teal)" }}>Maxfiylik siyosati</span>ga rozilik bildirasiz.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAYMENT MODAL
// ─────────────────────────────────────────────────────────────
function PaymentModal({ plan, billing, user, onClose, onSuccess, push }) {
  const [method, setMethod] = useState("payme");
  const [step, setStep] = useState("select"); // select | confirm | processing | done
  const [card, setCard] = useState({ num: "", exp: "", cvv: "" });
  const price = billing === "yearly" ? plan.price_yearly : plan.price_monthly;

  const methods = [
    { id: "payme", label: "Payme", color: "#1470CC", desc: "Payme kartasi yoki hisobi orqali to'lang", logo: "P" },
    { id: "click", label: "Click", color: "#FF6600", desc: "Click ilovasi yoki bank kartasi orqali", logo: "C" },
    { id: "uzum", label: "Uzum Bank", color: "#9333EA", desc: "Uzum Bank (Apelsin) orqali to'lang", logo: "U" },
  ];

  const pay = () => {
    setStep("processing");
    setTimeout(() => {
      // Simulate payment success
      const newExpiry = billing === "yearly"
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : new Date(Date.now() + 30 * 86400000).toISOString();
      Auth.updateUser(user.id, { plan: plan.id, billing, plan_expiry: newExpiry });
      // Save payment to history
      const pmts = LS.get("payments_" + String(user.id || ""), []);
      pmts.unshift({ id: Date.now(), plan: plan.id, amount: price, method, date: new Date().toISOString(), billing, status: "paid" });
      LS.set("payments_" + String(user.id || ""), pmts.slice(0, 50));
      setStep("done");
      setTimeout(() => { onSuccess(plan); }, 1200);
    }, 2200);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>✕</button>

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>To'lov qabul qilindi!</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{plan.nameUz} tarifi faollashtirildi</div>
          </div>
        )}

        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div className="typing-ind" style={{ justifyContent: "center", marginBottom: 16 }}>
              <span /><span /><span />
            </div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 15, color: "var(--text2)" }}>To'lov qayta ishlanmoqda...</div>
          </div>
        )}

        {(step === "select" || step === "confirm") && (
          <>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "var(--fh)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Tarif: {plan.nameUz}</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 28, fontWeight: 800, color: plan.color }}>
                {price.toLocaleString("uz-UZ")} <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 400 }}>so'm / {billing === "yearly" ? "yil" : "oy"}</span>
              </div>
              {billing === "yearly" && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 3 }}>✓ Yillik — 2 oy bepul!</div>}
            </div>

            {/* Method */}
            <div style={{ marginBottom: 16 }}>
              <div className="field-label" style={{ marginBottom: 10 }}>To'lov usulini tanlang</div>
              {methods.map(m => (
                <div key={m.id} className={`payment-method ${method === m.id ? "selected" : ""}`} onClick={() => setMethod(m.id)}>
                  <div className="payment-logo" style={{ background: m.color + "22", color: m.color, fontSize: 14, fontWeight: 700, fontFamily: "var(--fh)" }}>
                    {m.id === "payme" ? "P" : m.id === "click" ? "C" : "U"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--fh)", fontWeight: 600, fontSize: 13, color: method === m.id ? m.color : "var(--text)" }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{m.desc}</div>
                  </div>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${method === m.id ? m.color : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {method === m.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Card details */}
            <div style={{ marginBottom: 20 }}>
              <label className="field-label">Karta raqami</label>
              <input className="field mb8" placeholder="0000 0000 0000 0000" value={card.num}
                onChange={e => setCard(c => ({ ...c, num: e.target.value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19) }))} />
              <div className="flex gap8">
                <div style={{ flex: 1 }}>
                  <label className="field-label">Muddati</label>
                  <input className="field" placeholder="MM/YY" value={card.exp}
                    onChange={e => setCard(c => ({ ...c, exp: e.target.value.replace(/\D/g, "").replace(/^(\d{2})(\d)/, "$1/$2").slice(0, 5) }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">CVV</label>
                  <input className="field" placeholder="•••" type="password" maxLength={3} value={card.cvv}
                    onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />
                </div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: "100%" }} onClick={pay}
              disabled={!card.num || card.num.replace(/\s/g, "").length < 16}>
              {price.toLocaleString("uz-UZ")} so'm to'lash
            </button>
            <div style={{ textAlign: "center", marginTop: 10, fontSize: 10, color: "var(--muted)" }}>
              256-bit SSL shifrlash · Xavfsiz to'lov
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROFILE & BILLING PAGE
// ─────────────────────────────────────────────────────────────
function ProfilePage({ user, onPlanChange, push, sources }) {
  if (!user) return <div className="card" style={{ textAlign: "center", padding: 32 }}>Foydalanuvchi topilmadi</div>;
  const [tab, setTab] = useState("profile");
  const [billing, setBilling] = useState("monthly");
  const [editName, setEditName] = useState(user.name || "");
  const [payModal, setPayModal] = useState(null);
  const [payments] = useState(() => LS.get("payments_" + String(user.id || ""), []));

  const currentPlan = PLANS[user?.plan] || PLANS.free;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const aiUsed = user.ai_requests_month === currentMonth ? (user.ai_requests_used || 0) : 0;
  const aiLimit = currentPlan.limits.ai_requests;
  const aiPct = aiLimit === -1 ? 10 : Math.min(100, Math.round(aiUsed / aiLimit * 100));

  const saveName = () => {
    Auth.updateUser(user.id, { name: editName.trim() });
    push("Ism saqlandi", "ok");
  };

  const handlePlanPurchase = (plan) => {
    Auth.updateUser(user.id, { plan: plan.id, billing });
    onPlanChange({ ...user, plan: plan.id, billing });
    push(`✓ ${plan.nameUz} tarifi faollashtirildi`, "ok");
    setPayModal(null);
  };

  return (
    <div>
      {payModal && <PaymentModal plan={payModal} billing={billing} user={user} onClose={() => setPayModal(null)} onSuccess={handlePlanPurchase} push={push} />}

      {/* Tab navigation */}
      <div className="flex gap6 mb20">
        {[{ id: "profile", l: "◐ Profil" }, { id: "billing", l: " Tarif & To'lov" }, { id: "history", l: "◰ To'lov tarixi" }].map(t => (
          <button key={t.id} className="btn btn-ghost btn-sm"
            style={tab === t.id ? { borderColor: "var(--gold)", color: "var(--gold)", background: "rgba(232,184,75,0.08)" } : {}}
            onClick={() => setTab(t.id)}>{t.l}</button>
        ))}
      </div>

      {/* PROFILE TAB */}
      {tab === "profile" && (
        <div className="g2">
          <div>
            <div className="card">
              <div className="card-title">Shaxsiy ma'lumotlar</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${currentPlan.color}30,${currentPlan.color}10)`, border: `1px solid ${currentPlan.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: currentPlan.color }}>
                  {(user.name || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 15, fontWeight: 700 }}>{user.name || "Foydalanuvchi"}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{user.email || ""}</div>
                  <span className="badge b-ok mt4" style={{ borderColor: currentPlan.color + "40", color: currentPlan.color, background: currentPlan.color + "12" }}>{currentPlan.nameUz}</span>
                </div>
              </div>
              <div className="mb12">
                <label className="field-label">Ism</label>
                <input className="field" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="mb12">
                <label className="field-label">Email</label>
                <input className="field" value={user.email} disabled style={{ opacity: .6 }} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveName}>Saqlash</button>
            </div>
          </div>
          <div>
            <div className="card">
              <div className="card-title">Tarif limitleri</div>
              {[
                { l: "AI So'rovlar (oy)", used: aiUsed, max: aiLimit, pct: aiPct, c: "var(--gold)" },
                { l: "Fayllar", used: (sources || []).filter(s => s.type === "excel").length, max: currentPlan.limits.files, pct: Math.min(100, Math.round((sources || []).filter(s => s.type === "excel").length / (currentPlan.limits.files > 0 ? currentPlan.limits.files : 1) * 100)), c: "var(--teal)" },
              ].map((lim, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div className="flex jb mb6">
                    <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: "var(--fh)" }}>{lim.l}</span>
                    <span style={{ fontSize: 11, color: lim.c, fontFamily: "var(--fm)" }}>{lim.used} / {lim.max === -1 ? "∞" : lim.max}</span>
                  </div>
                  <div className="usage-bar-wrap">
                    <div className="usage-bar" style={{ width: `${lim.max === -1 ? 15 : lim.pct}%`, background: lim.pct > 85 ? "var(--red)" : lim.c }} />
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { l: "Export", v: currentPlan.limits.export },
                  { l: "Proaktiv AI", v: currentPlan.limits.alerts_check },
                  { l: "Kengaytirilgan grafiklar", v: currentPlan.limits.advanced_charts },
                  { l: "API kirish", v: currentPlan.limits.api },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <span style={{ color: f.v ? "var(--green)" : "var(--muted)" }}>{f.v ? "✓" : "✗"}</span>
                    <span style={{ color: f.v ? "var(--text2)" : "var(--muted)" }}>{f.l}</span>
                  </div>
                ))}
              </div>
              {user.plan === "free" && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 14, width: "100%" }} onClick={() => setTab("billing")}>
                  Yangilash
                </button>
              )}
            </div>
            <div className="card">
              <div className="card-title">Hisob ma'lumotlari va xavfsizlik</div>
              {[
                { l: "Ro'yxatdan o'tgan", v: user.created ? new Date(user.created).toLocaleDateString("uz-UZ") : "—" },
                { l: "Oxirgi kirish", v: (user.lastLogin || user.created) ? new Date(user.lastLogin || user.created).toLocaleDateString("uz-UZ") : "—" },
                { l: "Foydalanuvchi ID", v: String(user.id || "").slice(0, 8) + "..." },
              ].map((r, i) => (
                <div key={i} className="flex jb mb8">
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.l}</span>
                  <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: "var(--fm)" }}>{r.v}</span>
                </div>
              ))}

              {/* Sessiya boshqaruv */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Aktiv sessiyalar</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Boshqa qurilmadan kirgan bo'lsangiz, shu yerdan tugatishingiz mumkin.</div>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)", borderColor: "rgba(248,113,113,0.2)", fontSize: 10 }}
                  onClick={async () => {
                    try { await AuthAPI.changePassword("", ""); } catch { }
                    // Serverda barcha sessiyalarni tugatish
                    try {
                      const headers = { 'Content-Type': 'application/json' };
                      const token = localStorage.getItem('bai_token');
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      await fetch('/api/auth/sessions', { method: 'DELETE', headers });
                      push("Barcha sessiyalar tugatildi. Qayta kiring.", "warn");
                      setTimeout(() => { Auth.clearSession(); window.location.reload(); }, 1500);
                    } catch { push("Server bilan aloqa yo'q", "warn"); }
                  }}>
                  Barcha sessiyalarni tugatish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BILLING TAB */}
      {tab === "billing" && (
        <div>
          <div className="card mb16" style={{ borderColor: currentPlan.color + "40" }}>
            <div className="flex aic jb">
              <div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 5 }}>Joriy tarif</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: currentPlan.color }}>{currentPlan.nameUz}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{getPlan(user.plan).price_monthly === 0 ? "Bepul" : "Oylik: " + getPlan(user.plan).price_monthly.toLocaleString("uz-UZ") + " so'm"}</div>
              </div>
              {user.plan !== "enterprise" && (
                <button className="btn btn-primary btn-sm" onClick={() => setTab("billing")}>Yangilash</button>
              )}
            </div>
          </div>

          <div className="billing-toggle">
            <div className="billing-pill">
              <div className={`billing-opt ${billing === "monthly" ? "active" : ""}`} onClick={() => setBilling("monthly")}>Oylik</div>
              <div className={`billing-opt ${billing === "yearly" ? "active teal" : ""}`} onClick={() => setBilling("yearly")}>Yillik</div>
            </div>
            {billing === "yearly" && <span className="billing-save">2 oy bepul!</span>}
          </div>

          <div className="pricing-grid">
            {Object.keys(PLANS).map(k => getPlan(k)).map(plan => (
              <div key={plan.id} className={`plan-card ${plan.badge ? "popular" : ""} ${user.plan === plan.id ? "" : ""}`}
                style={user.plan === plan.id ? { borderColor: plan.color, boxShadow: `0 0 20px ${plan.color}18` } : {}}>
                {plan.badge && <div className="plan-badge">{plan.badge}</div>}
                {user.plan === plan.id && <div style={{ position: "absolute", top: 9, right: 9, fontSize: 9, color: plan.color, fontFamily: "var(--fh)", fontWeight: 700, background: plan.color + "15", padding: "2px 7px", borderRadius: 20 }}>Joriy</div>}
                <div className="plan-name" style={{ color: plan.color }}>{plan.nameUz}</div>
                <div className="plan-price" style={{ color: plan.color }}>
                  {billing === "yearly" && plan.price_yearly > 0
                    ? <>{Math.round(plan.price_yearly / 12).toLocaleString("uz-UZ")}<span> so'm/oy</span></>
                    : plan.price_monthly === 0 ? "Bepul" : <>{plan.price_monthly.toLocaleString("uz-UZ")}<span> so'm/oy</span></>}
                </div>
                <div className="plan-divider" />
                {plan.features.slice(0, 4).map((f, i) => (
                  <div key={i} className="plan-feat">
                    <span style={{ color: f.ok ? "var(--green)" : "var(--muted)", fontSize: 10 }}>{f.ok ? "✓" : "✗"}</span>
                    <span style={{ color: f.ok ? "var(--text2)" : "var(--muted)", fontSize: 11 }}>{f.t}</span>
                  </div>
                ))}
                <div className="plan-btn">
                  {user.plan === plan.id
                    ? <button className="btn btn-ghost" style={{ width: "100%", cursor: "default" }} disabled>✓ Faol</button>
                    : plan.price_monthly === 0
                      ? <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => { Auth.updateUser(user.id, { plan: "free" }); onPlanChange({ ...user, plan: "free" }); push("Free tarifga qaytdingiz", "info") }}>Tanlash</button>
                      : <button className="btn btn-primary" style={{ width: "100%", background: `linear-gradient(135deg,${plan.color},${plan.color}cc)` }} onClick={() => setPayModal(plan)}>
                        To'lov qilish
                      </button>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="card">
          <div className="card-title">To'lov tarixi</div>
          {payments.length === 0
            ? <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>To'lovlar tarixi yo'q</div>
            : <div className="overflow-x">
              <table className="admin-table">
                <thead><tr>
                  <th>Sana</th><th>Tarif</th><th>Miqdor</th><th>Usul</th><th>Holat</th>
                </tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td>{new Date(p.date).toLocaleDateString("uz-UZ")}</td>
                      <td style={{ color: PLANS[p.plan]?.color || "var(--text)" }}>{PLANS[p.plan]?.nameUz || p.plan}</td>
                      <td style={{ fontFamily: "var(--fm)", color: "var(--gold)" }}>{p.amount.toLocaleString("uz-UZ")} so'm</td>
                      <td style={{ textTransform: "capitalize" }}>{p.method}</td>
                      <td><span className="badge b-ok">✓ To'landi</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────────────────────
function AdminPanel({ currentUser, push, sources: adminSources, initialTab, hideTabs }) {
  const [tab, setTab] = useState(initialTab || "overview");

  // Agar tashqaridan initialTab o'zgarsa (masalan, Super Admin sidebarda tab almashtirilsa) — sinxronlash
  useEffect(() => {
    if (initialTab && initialTab !== tab) setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [userTab, setUserTab] = useState("info"); // info | data | payments
  const [serverStats, setServerStats] = useState(null);

  // AI config tab state
  const [globalCfg, setGlobalCfg] = useState(() => GlobalAI.get() || { provider: "deepseek", model: "deepseek-chat", apiKey: "" });
  const [gSaved, setGSaved] = useState(false);
  const [gKeyVisible, setGKeyVisible] = useState(false);

  // Tariffs tab state
  const [editPrices, setEditPrices] = useState(() => {
    const custom = getEffectivePlanPrices() || {};
    return Object.fromEntries(Object.keys(PLANS).map(k => ([k, {
      monthly: custom[k]?.monthly ?? PLANS[k].price_monthly,
      yearly: custom[k]?.yearly ?? PLANS[k].price_yearly
    }])));
  });
  const [tSaved, setTSaved] = useState(false);

  // ── Backend API dan foydalanuvchilarni yuklash ──
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const apiUsers = await AdminAPI.getUsers();
      if (Array.isArray(apiUsers) && apiUsers.length > 0) {
        // API dan kelgan status yo'q bo'lsa "active" deb belgilash
        setUsers(apiUsers.map(u => ({ ...u, status: u.status || "active" })));
      } else {
        // API ishlamasa localStorage fallback
        setUsers(Auth.getUsers());
      }
    } catch (e) {
      console.warn("[AdminPanel] API failed, using LS fallback:", e.message);
      setUsers(Auth.getUsers());
    }
    // Server statistikasini olish
    try {
      const stats = await AdminAPI.getStats();
      if (stats) setServerStats(stats);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const refresh = () => fetchUsers();

  // ── Analytics calculations ──
  const total = users.length;
  const blocked = users.filter(u => u.status === "blocked").length;
  const activeToday = users.filter(u => u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 86400000).length;
  const activeWeek = users.filter(u => u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 7 * 86400000).length;
  const planDist = Object.entries(users.reduce((acc, u) => { acc[u.plan] = (acc[u.plan] || 0) + 1; return acc; }, {}));
  // To'lovlarni API dan kelgan users.totalPaid dan olish
  const allPayments = users.filter(u => (u.totalPaid || 0) > 0).map(u => ({ userName: u.name, userEmail: u.email, amount: u.totalPaid || 0, plan: u.plan, method: "payme", date: u.created }));
  const totalRevenue = users.reduce((a, u) => a + (u.totalPaid || 0), 0);
  const curMonth = new Date().toISOString().slice(0, 7);
  const prevMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);
  const thisMonthRevenue = allPayments.filter(p => p.date?.startsWith(curMonth)).reduce((a, p) => a + p.amount, 0);
  const lastMonthRevenue = allPayments.filter(p => p.date?.startsWith(prevMonth)).reduce((a, p) => a + p.amount, 0);
  const revenueGrowth = lastMonthRevenue > 0 ? Math.round((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100) : 0;

  // Revenue by method chart
  const byMethod = allPayments.reduce((acc, p) => { acc[p.method] = (acc[p.method] || 0) + p.amount; return acc; }, {});
  const methodChart = Object.entries(byMethod).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

  // Monthly signups for last 6 months
  const signupChart = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.now() - i * 30 * 86400000);
    const m = d.toISOString().slice(0, 7);
    return { name: d.toLocaleString("uz-UZ", { month: "short" }), count: users.filter(u => u.created?.startsWith(m)).length };
  }).reverse();

  // Plan revenue breakdown
  const planRevChart = Object.values(PLANS).map(p => ({
    name: p.nameUz,
    value: allPayments.filter(pay => pay.plan === p.id).reduce((a, pay) => a + pay.amount, 0),
    color: p.color,
  })).filter(p => p.value > 0);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || u.plan === planFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  const blockUser = async (uid, block) => {
    try {
      await AdminAPI.updateUser(uid, { status: block ? "blocked" : "active" });
    } catch { }
    Auth.updateUser(uid, { status: block ? "blocked" : "active" });
    refresh();
    push(block ? "Foydalanuvchi bloklandi" : "Foydalanuvchi aktivlashtirildi", block ? "warn" : "ok");
  };
  const changePlan = async (uid, plan) => {
    try {
      await AdminAPI.updateUser(uid, { plan });
    } catch { }
    Auth.updateUser(uid, { plan });
    refresh();
    if (selectedUser?.id === uid) setSelectedUser(prev => ({ ...prev, plan }));
    push(`Tarif ${PLANS[plan]?.nameUz} ga o'zgartirildi`, "ok");
  };
  const deleteUser = async (uid) => {
    try {
      await AdminAPI.deleteUser(uid);
    } catch { }
    const updated = Auth.getUsers().filter(u => u.id !== uid);
    Auth.saveUsers(updated);
    refresh(); setSelectedUser(null); setConfirmDelete(null);
    push("Foydalanuvchi o'chirildi", "warn");
  };

  // ── Yangi foydalanuvchi qo'shish ──
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", plan: "free", role: "user" });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState("");

  const handleAddUser = async () => {
    const { name, email, password, plan, role } = newUser;
    if (!name.trim() || !email.trim() || !password.trim()) {
      setAddUserError("Ism, email va parol to'ldirilishi shart");
      return;
    }
    if (password.length < 6) {
      setAddUserError("Parol kamida 6 ta belgi bo'lishi kerak");
      return;
    }
    if (!email.includes("@")) {
      setAddUserError("Email formati noto'g'ri");
      return;
    }
    if (users.find(u => u.email?.toLowerCase() === email.toLowerCase())) {
      setAddUserError("Bu email allaqachon ro'yxatda bor");
      return;
    }
    setAddUserLoading(true); setAddUserError("");

    let apiSuccess = false;
    try {
      // Backend API — admin maxsus endpoint (admin sessiyasini buzmaydi)
      const res = await AdminAPI.createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        plan,
        role,
      });
      if (res?.id) apiSuccess = true;
    } catch (e) {
      console.warn("[Admin] API createUser failed:", e.message);
      // API ishlamasa — xato ko'rsatmaymiz, LS ga saqlaymiz
    }

    // LS ga ham qo'shish (fallback + tez ko'rinish uchun)
    const lsUsers = Auth.getUsers();
    if (!lsUsers.find(u => u.email === email.toLowerCase())) {
      Auth.saveUsers([...lsUsers, {
        id: Date.now().toString(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        plan,
        billing: "monthly",
        created: new Date().toISOString(),
        lastLogin: null,
        status: "active",
        ai_requests_used: 0,
        ai_requests_month: new Date().toISOString().slice(0, 7),
      }]);
    }

    refresh();
    setShowAddUser(false);
    setNewUser({ name: "", email: "", password: "", plan: "free", role: "user" });
    setAddUserLoading(false);
    push(`Foydalanuvchi ${name} qo'shildi` + (apiSuccess ? " (serverga saqlandi)" : " (lokal saqlandi)"), "ok");
  };

  const exportCSV = () => {
    const rows = [
      "ID,Ism,Email,Tarif,Holat,Ro'yxat sanasi,Oxirgi kirish,Jami to'lov",
      ...users.map(u => {
        const uid = String(u.id);
        return `${uid.slice(0, 8)},${u.name},${u.email},${PLANS[u.plan]?.nameUz || u.plan},${u.status || "active"},${u.created?.slice(0, 10) || ""},${u.lastLogin?.slice(0, 10) || ""},${u.totalPaid || 0}`;
      })
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv;charset=utf-8;" }));
    a.download = `biznesai_users_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    push("CSV yuklab olindi", "ok");
  };
  const exportPaymentCSV = () => {
    const rows = [
      "Sana,Foydalanuvchi,Email,Tarif,Miqdor,Usul",
      ...allPayments.sort((a, b) => b.id - a.id).map(p => `${p.date?.slice(0, 10) || ""},${p.userName || ""},${p.userEmail || ""},${PLANS[p.plan]?.nameUz || p.plan},${p.amount},${p.method}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv;charset=utf-8;" }));
    a.download = `biznesai_payments_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    push("To'lovlar CSV yuklab olindi", "ok");
  };

  const COLORS = ["#E8B84B", "#00C9BE", "#4ADE80", "#A78BFA", "#F87171", "#60A5FA"];

  // Tizim statistikasi — API dan yoki users array dan
  const totalSources = serverStats?.totalSources ?? users.reduce((a, u) => a + (u.sourceCount || 0), 0);
  const totalDataRows = serverStats?.totalDataRows ?? users.reduce((a, u) => a + (u.totalRows || 0), 0);
  const paidUsers = users.filter(u => u.plan !== "free").length;
  const conversionRate = total > 0 ? Math.round(paidUsers / total * 100) : 0;
  const avgRevPerUser = paidUsers > 0 ? Math.round(totalRevenue / paidUsers) : 0;

  const statCards = [
    { l: "Jami foydalanuvchi", v: total, sub: `${activeToday} bugun faol`, c: "var(--teal)", ac: "#00C9BE", i: "" },
    { l: "Haftalik faol", v: activeWeek, sub: `${blocked} bloklangan`, c: "var(--green)", ac: "#4ADE80", i: "" },
    { l: "Jami daromad", v: totalRevenue.toLocaleString("uz-UZ") + " so'm", sub: allPayments.length + " ta to'lov", c: "var(--gold)", ac: "#E8B84B", i: "" },
    { l: "Bu oylik daromad", v: thisMonthRevenue.toLocaleString("uz-UZ") + " so'm", sub: revenueGrowth > 0 ? `↑ ${revenueGrowth}% o'sish` : revenueGrowth < 0 ? `↓ ${Math.abs(revenueGrowth)}% kamayish` : "Yangi oy", c: "var(--purple)", ac: "#A78BFA", i: "" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div style={{ fontFamily: "var(--fh)", fontSize: 13, color: "var(--muted)" }}>Ma'lumotlar yuklanmoqda...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div>
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-box" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}></div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Foydalanuvchini o'chirish</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}><strong style={{ color: "var(--text)" }}>{confirmDelete.name}</strong> — barcha ma'lumotlari o'chadi. Bu amalni qaytarib bo'lmaydi.</div>
              <div className="flex gap10" style={{ justifyContent: "center" }}>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Bekor qilish</button>
                <button className="btn btn-danger" onClick={() => deleteUser(confirmDelete.id)}>Ha, o'chirilsin</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Yangi foydalanuvchi qo'shish modali ── */}
      {showAddUser && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
          <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 20, padding: "32px", width: "100%", maxWidth: 480, position: "relative", animation: "fadeIn .2s ease" }}>
            <button onClick={() => { setShowAddUser(false); setAddUserError(""); }} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
            <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Yangi foydalanuvchi</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>Ma'lumotlarni to'ldiring va tarifni tanlang</div>

            {addUserError && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", fontSize: 12, marginBottom: 14 }}>{addUserError}</div>}

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Ism *</label>
                <input className="field" placeholder="Ism Familiya" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Email *</label>
                <input className="field" type="email" placeholder="email@example.com" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Parol *</label>
                <input className="field" type="text" placeholder="Kamida 6 ta belgi" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Tarif</label>
                  <select className="field" value={newUser.plan} onChange={e => setNewUser(p => ({ ...p, plan: e.target.value }))}>
                    {Object.values(PLANS).map(p => (
                      <option key={p.id} value={p.id}>{p.nameUz} — {p.price_monthly === 0 ? "Bepul" : p.price_monthly.toLocaleString() + " so'm/oy"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Rol</label>
                  <select className="field" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                    <option value="user">Foydalanuvchi</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tanlangan tarif limiti */}
            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "var(--s2)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Tarif limiti: {PLANS[newUser.plan]?.nameUz}</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--text2)" }}>
                <span>AI: <strong style={{ color: PLANS[newUser.plan]?.color }}>{PLANS[newUser.plan]?.limits.ai_requests === -1 ? "Cheksiz" : PLANS[newUser.plan]?.limits.ai_requests}</strong>/oy</span>
                <span>Fayllar: <strong>{PLANS[newUser.plan]?.limits.files === -1 ? "Cheksiz" : PLANS[newUser.plan]?.limits.files}</strong></span>
                <span>Konnektorlar: <strong>{PLANS[newUser.plan]?.limits.connectors === -1 ? "Cheksiz" : PLANS[newUser.plan]?.limits.connectors}</strong></span>
                <span>Hisobotlar: <strong>{PLANS[newUser.plan]?.limits.reports === -1 ? "Cheksiz" : PLANS[newUser.plan]?.limits.reports}</strong></span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowAddUser(false); setAddUserError(""); }}>Bekor qilish</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddUser} disabled={addUserLoading}>
                {addUserLoading ? "Qo'shilmoqda..." : "Foydalanuvchi qo'shish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Header */}
      <div className="flex aic jb mb20" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--red)" }}></span> Admin Panel
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{currentUser.email} · {new Date().toLocaleString("uz-UZ")}</div>
        </div>
        <div className="flex gap8" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}>+ Yangi foydalanuvchi</button>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>↻ Yangilash</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ Foydalanuvchilar CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={exportPaymentCSV}>↓ To'lovlar CSV</button>
        </div>
      </div>

      {/* Tabs — Super Admin panel ichida hideTabs bilan yashiriladi */}
      {!hideTabs && (
        <div className="flex gap6 mb20" style={{ flexWrap: "wrap" }}>
          {[
            { id: "overview", l: " Statistika" },
            { id: "analytics", l: " Analytics" },
            { id: "users", l: `◐ Foydalanuvchilar (${total})` },
            { id: "payments", l: `◰ To'lovlar (${allPayments.length})` },
            { id: "ai_config", l: " AI Sozlama" },
            { id: "tariffs", l: " Tariflar" },
            { id: "system", l: " Tizim" },
          ].map(t => (
            <button key={t.id} className="btn btn-ghost btn-sm"
              style={tab === t.id ? { borderColor: "var(--red)", color: "var(--red)", background: "rgba(248,113,133,0.07)" } : {}}
              onClick={() => setTab(t.id)}>{t.l}</button>
          ))}
        </div>
      )}

      {/* ═══ OVERVIEW ═══ */}
      {tab === "overview" && (
        <>
          <div className="g4 mb16">
            {statCards.map((s, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", transition: "all .25s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = s.ac + "50"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${s.ac}15`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.ac}80,transparent)` }} />
                <div className="flex aic jb">
                  <div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{s.l}</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 800, color: s.c, lineHeight: 1, marginBottom: 5 }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fm)" }}>{s.sub}</div>
                  </div>
                  <div style={{ fontSize: 28, opacity: .3 }}>{s.i}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Qo'shimcha ko'rsatkichlar */}
          <div className="g4 mb16">
            {[
              { l: "Pullik foydalanuvchilar", v: paidUsers, sub: `${conversionRate}% konversiya`, c: "var(--gold)", i: "" },
              { l: "O'rtacha daromad (har biri)", v: avgRevPerUser.toLocaleString("uz-UZ") + " so'm", sub: "Pullik foydalanuvchilar", c: "var(--teal)", i: "" },
              { l: "Jami manbalar", v: totalSources, sub: "Barcha foydalanuvchilar", c: "var(--green)", i: "" },
              { l: "Jami yozuvlar", v: totalDataRows.toLocaleString(), sub: "Ma'lumotlar", c: "var(--purple)", i: "" },
            ].map((s, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.c}80,transparent)` }} />
                <div className="flex aic jb">
                  <div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>{s.l}</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: s.c, lineHeight: 1, marginBottom: 4 }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>{s.sub}</div>
                  </div>
                  <div style={{ fontSize: 24, opacity: .3 }}>{s.i}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="g2">
            {/* Plan distribution */}
            <div className="card">
              <div className="card-title">Tarif taqsimoti</div>
              {planDist.map(([planId, count]) => {
                const plan = PLANS[planId] || PLANS.free;
                const pct = total > 0 ? Math.round(count / total * 100) : 0;
                return (
                  <div key={planId} style={{ marginBottom: 13 }}>
                    <div className="flex jb mb6">
                      <span style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 600, color: plan.color }}>{plan.nameUz}</span>
                      <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: "var(--fm)" }}>{count} foydalanuvchi · {pct}%</span>
                    </div>
                    <div className="usage-bar-wrap">
                      <div className="usage-bar" style={{ width: `${pct}%`, background: plan.color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick stats */}
            <div className="card">
              <div className="card-title">Tizim holati</div>
              {[
                { l: "Aktiv foydalanuvchilar", v: users.filter(u => u.status !== "blocked").length, c: "var(--green)" },
                { l: "Bloklangan", v: blocked, c: "var(--red)" },
                { l: "Admin hisoblar", v: users.filter(u => u.role === "admin").length, c: "var(--purple)" },
                { l: "Jami to'lovlar", v: allPayments.length + " ta", c: "var(--gold)" },
                { l: "Payme orqali", v: allPayments.filter(p => p.method === "payme").length + " ta", c: "#1470CC" },
                { l: "Click orqali", v: allPayments.filter(p => p.method === "click").length + " ta", c: "#FF6600" },
                { l: "Uzum orqali", v: allPayments.filter(p => p.method === "uzum").length + " ta", c: "#9333EA" },
              ].map((r, i) => (
                <div key={i} className="flex jb" style={{ padding: "8px 0", borderBottom: "1px solid var(--border2)" }}>
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>{r.l}</span>
                  <span style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: r.c }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent users */}
          <div className="card mt16">
            <div className="card-title">Oxirgi ro'yxatdan o'tganlar</div>
            <div className="overflow-x">
              <table className="admin-table">
                <thead><tr><th>Ism</th><th>Email</th><th>Tarif</th><th>Sana</th></tr></thead>
                <tbody>
                  {[...users].sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0)).slice(0, 5).map(u => (
                    <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => { setSelectedUser(u); setUserTab("info"); }}>
                      <td style={{ fontFamily: "var(--fh)", fontWeight: 600 }}>{u.name}</td>
                      <td style={{ color: "var(--muted)" }}>{u.email}</td>
                      <td><span style={{ color: PLANS[u.plan]?.color || "var(--text)", fontFamily: "var(--fh)", fontSize: 11, fontWeight: 600 }}>{PLANS[u.plan]?.nameUz || u.plan}</span></td>
                      <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{u.created ? new Date(u.created).toLocaleDateString("uz-UZ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ ANALYTICS ═══ */}
      {tab === "analytics" && (
        <>
          <div className="g2 mb14">
            {/* Monthly signups chart */}
            <div className="card">
              <div className="card-title">Oylik ro'yxatdan o'tishlar (so'nggi 6 oy)</div>
              {signupChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={signupChart} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#4E566E" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#4E566E" }} />
                    <Tooltip contentStyle={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, fontFamily: "DM Mono" }} />
                    <Bar dataKey="count" name="Yangi foydalanuvchi" fill="#00C9BE" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>Ma'lumot yo'q</div>}
            </div>

            {/* Revenue by plan pie */}
            <div className="card">
              <div className="card-title">Tariflar bo'yicha daromad</div>
              {planRevChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={planRevChart} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                      {planRevChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={v => v.toLocaleString("uz-UZ") + " so'm"} contentStyle={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>To'lov yo'q</div>}
            </div>
          </div>

          {/* Revenue by payment method */}
          <div className="card mb14">
            <div className="card-title">To'lov usullari bo'yicha</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[
                { id: "payme", label: "Payme", color: "#1470CC" },
                { id: "click", label: "Click", color: "#FF6600" },
                { id: "uzum", label: "Uzum", color: "#9333EA" },
              ].map(m => {
                const rev = allPayments.filter(p => p.method === m.id).reduce((a, p) => a + p.amount, 0);
                const cnt = allPayments.filter(p => p.method === m.id).length;
                const pct = totalRevenue > 0 ? Math.round(rev / totalRevenue * 100) : 0;
                return (
                  <div key={m.id} style={{ flex: 1, minWidth: 150, background: "var(--s2)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${m.color}25` }}>
                    <div style={{ fontFamily: "var(--fh)", fontWeight: 700, fontSize: 13, color: m.color, marginBottom: 6 }}>{m.label}</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{rev.toLocaleString("uz-UZ")}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{cnt} ta to'lov · {pct}% ulush</div>
                    <div className="usage-bar-wrap" style={{ marginTop: 8 }}>
                      <div className="usage-bar" style={{ width: `${pct}%`, background: m.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversion funnel */}
          <div className="card">
            <div className="card-title">Konversiya funnel</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { l: "Jami ro'yxat", v: total, c: "var(--text2)", w: "100%" },
                { l: "Hech bo'lmasa 1 ta to'lov", v: new Set(allPayments.map(p => p.userName)).size, c: "var(--gold)", w: `${total > 0 ? Math.round(new Set(allPayments.map(p => p.userName)).size / total * 100) : 0}%` },
                { l: "Joriy oyda faol", v: activeToday, c: "var(--green)", w: `${total > 0 ? Math.round(activeToday / total * 100) : 0}%` },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, minWidth: 140, background: "var(--s2)", borderRadius: 10, padding: "12px 14px", position: "relative", overflow: "hidden" }}>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>{s.l}</div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{s.w} ulush</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ USERS ═══ */}
      {tab === "users" && (
        <>
          <div className="flex gap10 mb14" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <input className="search-field" placeholder=" Ism yoki email..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="field" style={{ width: "auto", padding: "7px 10px", fontSize: 12 }} value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
              <option value="all">Barcha tariflar</option>
              {Object.values(PLANS).map(p => <option key={p.id} value={p.id}>{p.nameUz}</option>)}
            </select>
            <select className="field" style={{ width: "auto", padding: "7px 10px", fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Barcha holat</option>
              <option value="active">Aktiv</option>
              <option value="blocked">Bloklangan</option>
            </select>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{filtered.length} ta topildi</span>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="overflow-x">
              <table className="admin-table">
                <thead><tr>
                  <th>Foydalanuvchi</th><th>Tarif</th><th>Holat</th><th>AI So'rov</th><th>Ro'yxat</th><th>Oxirgi kirish</th><th>Amallar</th>
                </tr></thead>
                <tbody>
                  {filtered.map(u => {
                    const plan = PLANS[u.plan] || PLANS.free;
                    const isBlocked = u.status === "blocked";
                    const curM = new Date().toISOString().slice(0, 7);
                    const aiUsed = u.ai_requests_month === curM ? (u.ai_requests_used || 0) : 0;
                    const aiLim = plan.limits.ai_requests;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: plan.color + "20", border: `1px solid ${plan.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fh)", fontSize: 12, fontWeight: 800, color: plan.color, flexShrink: 0 }}>
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 600 }}>{u.name}</div>
                              <div style={{ fontSize: 10, color: "var(--muted)" }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><span style={{ color: plan.color, fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700 }}>{plan.nameUz}</span></td>
                        <td>
                          {u.role === "admin"
                            ? <span className="badge b-warn">Admin</span>
                            : isBlocked
                              ? <span className="badge b-red">Bloklangan</span>
                              : <span className="badge b-ok">Aktiv</span>}
                        </td>
                        <td>
                          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: aiLim !== -1 && aiUsed / aiLim > 0.8 ? "var(--red)" : "var(--text2)" }}>
                            {aiUsed}/{aiLim === -1 ? "∞" : aiLim}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{u.created ? new Date(u.created).toLocaleDateString("uz-UZ") : "—"}</td>
                        <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("uz-UZ") : "—"}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex gap5">
                            <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedUser(u); setUserTab("info"); }}>Ko'rish</button>
                            {u.id !== currentUser.id && u.role !== "admin" && (
                              <button className={`btn btn-xs ${isBlocked ? "btn-teal" : "btn-danger"}`}
                                onClick={() => blockUser(u.id, !isBlocked)}>
                                {isBlocked ? "Ochish" : "Blok"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ PAYMENTS ═══ */}
      {tab === "payments" && (
        <>
          {/* Summary cards */}
          <div className="g3 mb14">
            {[
              { l: "Jami daromad", v: totalRevenue.toLocaleString("uz-UZ") + " so'm", c: "var(--gold)" },
              { l: "Bu oy", v: thisMonthRevenue.toLocaleString("uz-UZ") + " so'm", sub: revenueGrowth !== 0 ? `${revenueGrowth > 0 ? "↑" : "↓"} ${Math.abs(revenueGrowth)}% o'tgan oyga nisbatan` : null, c: "var(--teal)" },
              { l: "Jami tranzaksiyalar", v: allPayments.length + " ta", c: "var(--purple)" },
            ].map((s, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>{s.l}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                {s.sub && <div style={{ fontSize: 10, color: "var(--green)", marginTop: 3 }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700 }}>Barcha to'lovlar</div>
              <button className="btn btn-ghost btn-xs" onClick={exportPaymentCSV}>↓ CSV Export</button>
            </div>
            <div className="overflow-x">
              <table className="admin-table">
                <thead><tr><th>Sana</th><th>Foydalanuvchi</th><th>Email</th><th>Tarif</th><th>Miqdor</th><th>Usul</th><th>Holat</th></tr></thead>
                <tbody>
                  {allPayments.sort((a, b) => b.id - a.id).slice(0, 100).map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{p.date?.slice(0, 10) || "—"}</td>
                      <td style={{ fontFamily: "var(--fh)", fontWeight: 600, fontSize: 12 }}>{p.userName || "—"}</td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{p.userEmail || "—"}</td>
                      <td><span style={{ color: PLANS[p.plan]?.color || "var(--text)", fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700 }}>{PLANS[p.plan]?.nameUz || p.plan}</span></td>
                      <td style={{ fontFamily: "var(--fm)", color: "var(--gold)", fontSize: 12, fontWeight: 600 }}>{p.amount?.toLocaleString("uz-UZ")} so'm</td>
                      <td>
                        <span style={{
                          background: p.method === "payme" ? "#1470CC15" : p.method === "click" ? "#FF660015" : "#9333EA15",
                          color: p.method === "payme" ? "#1470CC" : p.method === "click" ? "#FF6600" : "#9333EA",
                          border: `1px solid ${p.method === "payme" ? "#1470CC30" : p.method === "click" ? "#FF660030" : "#9333EA30"}`,
                          borderRadius: 20, padding: "2px 8px", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 600, textTransform: "capitalize"
                        }}>{p.method}</span>
                      </td>
                      <td><span className="badge b-ok">✓ To'landi</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ AI CONFIG TAB ═══ */}
      {tab === "ai_config" && (() => {
        const gProv = AI_PROVIDERS[globalCfg.provider];
        const currentGlobal = GlobalAI.get();

        const saveGlobalAI = () => {
          if (!globalCfg.apiKey.trim()) { push("API kalit kiriting", "error"); return; }
          GlobalAI.set({ provider: globalCfg.provider, model: globalCfg.model, apiKey: globalCfg.apiKey.trim() });
          setGSaved(true); setTimeout(() => setGSaved(false), 3000);
          push(`✓ Global AI sifatida ${gProv.name} saqlandi — barcha foydalanuvchilar foydalanadi`, "ok");
        };
        const removeGlobalAI = () => {
          GlobalAI.set(null);
          setGlobalCfg(c => ({ ...c, apiKey: "" }));
          push("Global AI o'chirildi", "warn");
        };

        return (
          <>
            <div className="section-hd mb12">Global AI Sozlamasi</div>
            <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8, marginBottom: 16 }}>
                Bu yerda siz tizim uchun <strong style={{ color: "var(--teal)" }}>global AI provayder</strong> ulaysiz.
                Barcha foydalanuvchilar bu AI dan <strong style={{ color: "var(--gold)" }}>bepul</strong> foydalanadi (tarif limitiga qarab).
                Agar foydalanuvchi o'z shaxsiy API kalitini kiritsa — u <strong style={{ color: "var(--green)" }}>cheksiz</strong> foydalanadi.
              </div>

              {/* Joriy holat */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: currentGlobal?.apiKey ? "rgba(0,201,190,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${currentGlobal?.apiKey ? "rgba(0,201,190,0.25)" : "rgba(248,113,113,0.25)"}`, borderRadius: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 20 }}>{currentGlobal?.apiKey ? "" : ""}</span>
                <div className="f1">
                  <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: currentGlobal?.apiKey ? "var(--green)" : "var(--red)" }}>
                    {currentGlobal?.apiKey ? `${AI_PROVIDERS[currentGlobal.provider]?.name || currentGlobal.provider} ulangan — tizim ishlaydi` : "Global AI ulanmagan — foydalanuvchilar AI ishlatib bo'lmaydi"}
                  </div>
                  {currentGlobal?.apiKey && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Model: {currentGlobal.model} · Barcha foydalanuvchilar bepul foydalanadi</div>}
                </div>
                {currentGlobal?.apiKey && <button className="btn btn-danger btn-xs" onClick={removeGlobalAI}>O'chirish</button>}
              </div>

              {/* Provayder tanlash */}
              <div style={{ fontFamily: "var(--fh)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>AI Provayder Tanlash</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
                {Object.values(AI_PROVIDERS).map(p => {
                  const isActive = globalCfg.provider === p.id;
                  return (
                    <div key={p.id} onClick={() => setGlobalCfg(c => ({ ...c, provider: p.id, model: p.models[0].id }))}
                      style={{ border: `2px solid ${isActive ? p.color : "var(--border)"}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", background: isActive ? `${p.color}0D` : "var(--s2)", transition: "all .2s", textAlign: "center" }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{p.icon}</div>
                      <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: isActive ? p.color : "var(--text)" }}>{p.name}</div>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 3 }}>{p.company}</div>
                      <div style={{ fontSize: 9, color: "var(--green)", marginTop: 4 }}>↓${p.pricing.in}/1M ↑${p.pricing.out}/1M</div>
                    </div>
                  );
                })}
              </div>

              {/* Model tanlash */}
              <div style={{ fontFamily: "var(--fh)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Model</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {gProv.models.map(m => (
                  <button key={m.id} className="btn btn-ghost btn-sm" onClick={() => setGlobalCfg(c => ({ ...c, model: m.id }))}
                    style={globalCfg.model === m.id ? { borderColor: gProv.color, color: gProv.color, background: gProv.color + "10" } : {}}>
                    {m.label} <span style={{ fontSize: 8, opacity: .6, marginLeft: 4 }}>{m.badge}</span>
                  </button>
                ))}
              </div>

              {/* API Kalit */}
              <div style={{ fontFamily: "var(--fh)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>API Kalit</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input className="field f1" type={gKeyVisible ? "text" : "password"} placeholder={gProv.ph}
                  value={globalCfg.apiKey} onChange={e => setGlobalCfg(c => ({ ...c, apiKey: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveGlobalAI()} />
                <button className="btn btn-ghost btn-sm" onClick={() => setGKeyVisible(v => !v)}>{gKeyVisible ? "◑" : "◐"}</button>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 14 }}> <span style={{ color: "var(--teal)" }}>{gProv.hint}</span></div>

              <div className="flex aic gap10">
                <button className="btn btn-primary" onClick={saveGlobalAI}>{gSaved ? "✓ Saqlandi!" : " Global AI Saqlash"}</button>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>Bu kalit barcha foydalanuvchilar uchun ishlaydi</span>
              </div>
            </div>

            {/* Qanday ishlaydi */}
            <div className="card">
              <div className="card-title mb10"> Qanday Ishlaydi</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { icon: "", title: "Bepul Foydalanish", desc: "Siz ulagan global AI dan hamma bepul foydalanadi. Tarif limitlariga qarab — Free: 5, Starter: 100, Pro: 500, Enterprise: ∞ so'rov/oy", c: "var(--green)" },
                  { icon: "", title: "Shaxsiy API Kalit", desc: "Foydalanuvchi o'z API kalitini kiritsa — u cheksiz so'rov yuboradi, limit hisoblanmaydi. Istalgan provayderdan foydalanadi", c: "var(--gold)" },
                  { icon: "", title: "Tarif Sotish", desc: "Foydalanuvchilar yuqori tarif olsa — ko'proq AI so'rov limiti oladi. Enterprise — cheksiz. Yoki o'z API kaliti bilan cheksiz", c: "var(--purple)" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "var(--s2)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${s.c}20` }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 700, color: s.c, marginBottom: 6 }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.7 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* ═══ TARIFFS TAB ═══ */}
      {tab === "tariffs" && (() => {
        const savePrices = () => {
          PlanPrices.set(editPrices);
          setTSaved(true); setTimeout(() => setTSaved(false), 3000);
          push("✓ Tarif narxlari saqlandi", "ok");
        };
        const resetPrices = () => {
          const defaults = Object.fromEntries(Object.keys(PLANS).map(k => ([k, { monthly: PLANS[k].price_monthly, yearly: PLANS[k].price_yearly }])));
          setEditPrices(defaults);
          PlanPrices.set(null);
          push("Narxlar standart holatga qaytarildi", "ok");
        };
        const updatePrice = (planId, field, val) => {
          const num = parseInt(val.replace(/\D/g, "")) || 0;
          setEditPrices(p => ({ ...p, [planId]: { ...p[planId], [field]: num } }));
        };

        return (
          <>
            <div className="section-hd mb12">Tarif Narxlarini Boshqarish</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
              Bu yerda tarif narxlarini o'zgartirishingiz mumkin. O'zgarishlar <strong style={{ color: "var(--teal)" }}>Landing Page</strong> va <strong style={{ color: "var(--gold)" }}>Profil</strong> sahifalarida ko'rinadi.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
              {Object.values(PLANS).map(plan => {
                const p = editPrices[plan.id] || { monthly: plan.price_monthly, yearly: plan.price_yearly };
                return (
                  <div key={plan.id} style={{ background: "var(--s1)", border: `2px solid ${plan.color}30`, borderRadius: 14, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: plan.color }} />
                    <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 800, color: plan.color, marginBottom: 4 }}>{plan.nameUz}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 14 }}>{plan.name}</div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.5, display: "block", marginBottom: 4 }}>Oylik narx (so'm)</label>
                      <input className="field" type="text" value={p.monthly === 0 ? "0" : p.monthly.toLocaleString("uz-UZ")}
                        onChange={e => updatePrice(plan.id, "monthly", e.target.value)}
                        style={{ fontSize: 14, fontFamily: "var(--fh)", fontWeight: 700, color: plan.color, textAlign: "right" }}
                        disabled={plan.id === "free"} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.5, display: "block", marginBottom: 4 }}>Yillik narx (so'm)</label>
                      <input className="field" type="text" value={p.yearly === 0 ? "0" : p.yearly.toLocaleString("uz-UZ")}
                        onChange={e => updatePrice(plan.id, "yearly", e.target.value)}
                        style={{ fontSize: 14, fontFamily: "var(--fh)", fontWeight: 700, color: plan.color, textAlign: "right" }}
                        disabled={plan.id === "free"} />
                    </div>

                    {/* Limits summary */}
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Limitlar</div>
                      {[
                        { l: "AI so'rov/oy", v: plan.limits.ai_requests === -1 ? "Cheksiz" : plan.limits.ai_requests },
                        { l: "Fayllar", v: plan.limits.files === -1 ? "Cheksiz" : plan.limits.files },
                        { l: "Konnektorlar", v: plan.limits.connectors === -1 ? "Cheksiz" : plan.limits.connectors },
                        { l: "Hisobotlar", v: plan.limits.reports === -1 ? "Cheksiz" : plan.limits.reports },
                      ].map((r, i) => (
                        <div key={i} className="flex jb" style={{ fontSize: 10, padding: "3px 0" }}>
                          <span style={{ color: "var(--muted)" }}>{r.l}</span>
                          <span style={{ color: plan.color, fontFamily: "var(--fm)", fontWeight: 600 }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex aic gap10">
              <button className="btn btn-primary" onClick={savePrices}>{tSaved ? "✓ Saqlandi!" : " Narxlarni Saqlash"}</button>
              <button className="btn btn-ghost" onClick={resetPrices}>↺ Standartga Qaytarish</button>
            </div>
          </>
        );
      })()}

      {/* ═══ SYSTEM TAB ═══ */}
      {tab === "system" && (
        <>
          <div className="section-hd mb12">Tizim Ma'lumotlari</div>
          <div className="g3 mb16">
            {[
              { l: "Jami Foydalanuvchilar", v: total, c: "var(--teal)", i: "" },
              { l: "Jami Manbalar", v: totalSources, c: "var(--green)", i: "" },
              { l: "Jami Yozuvlar", v: totalDataRows.toLocaleString(), c: "var(--gold)", i: "" },
              { l: "Pullik Foydalanuvchilar", v: paidUsers, c: "var(--purple)", i: "" },
              { l: "Konversiya", v: conversionRate + "%", c: "var(--teal)", i: "" },
              { l: "O'rtacha Daromad", v: avgRevPerUser.toLocaleString() + " so'm", c: "var(--gold)", i: "" },
            ].map((s, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.c}80,transparent)` }} />
                <div className="flex aic jb">
                  <div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>{s.l}</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.v}</div>
                  </div>
                  <div style={{ fontSize: 26, opacity: .3 }}>{s.i}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Har bir foydalanuvchi manbalar va yozuvlar */}
          <div className="card">
            <div className="card-title mb10">Foydalanuvchilar Bo'yicha Ma'lumotlar</div>
            <div className="overflow-x">
              <table className="admin-table">
                <thead><tr><th>Foydalanuvchi</th><th>Tarif</th><th>Manbalar</th><th>Yozuvlar</th><th>AI So'rov</th><th>To'lovlar</th></tr></thead>
                <tbody>
                  {users.map(u => {
                    const plan = PLANS[u.plan] || PLANS.free;
                    const curMm = new Date().toISOString().slice(0, 7);
                    const aiU = u.ai_requests_month === curMm ? (u.ai_requests_used || 0) : 0;
                    return (
                      <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => { setSelectedUser(u); setUserTab("info"); }}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: plan.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: plan.color, flexShrink: 0 }}>{u.name.charAt(0).toUpperCase()}</div>
                            <div><div style={{ fontWeight: 600, fontSize: 12 }}>{u.name}</div><div style={{ fontSize: 9, color: "var(--muted)" }}>{u.email}</div></div>
                          </div>
                        </td>
                        <td><span style={{ color: plan.color, fontWeight: 700, fontSize: 11 }}>{plan.nameUz}</span></td>
                        <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{u.sourceCount || 0}</td>
                        <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{(u.totalRows || 0).toLocaleString()}</td>
                        <td style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{aiU}</td>
                        <td style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--gold)" }}>{(u.totalPaid || 0) > 0 ? (u.totalPaid || 0).toLocaleString() + " so'm" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* LocalStorage hajmi */}
          <div className="card mt16">
            <div className="card-title mb10">LocalStorage Holati</div>
            <div className="g2">
              {(() => {
                let totalSize = 0;
                try { for (let k in localStorage) { if (localStorage.hasOwnProperty(k)) { totalSize += localStorage[k].length * 2; } } } catch { }
                const usedKB = Math.round(totalSize / 1024);
                const maxKB = 5120;
                const pct = Math.round(usedKB / maxKB * 100);
                return [
                  <div key="used" style={{ background: "var(--s2)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Ishlatilgan</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: pct > 80 ? "var(--red)" : "var(--teal)" }}>{usedKB} KB</div>
                    <div className="usage-bar-wrap" style={{ marginTop: 8 }}><div className="usage-bar" style={{ width: `${pct}%`, background: pct > 80 ? "var(--red)" : "var(--teal)" }} /></div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>{pct}% / {maxKB} KB</div>
                  </div>,
                  <div key="keys" style={{ background: "var(--s2)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Kalitlar Soni</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: "var(--gold)" }}>{Object.keys(localStorage).length}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>localStorage entries</div>
                  </div>
                ];
              })()}
            </div>
          </div>
        </>
      )}

      {/* ═══ USER DETAIL MODAL ═══ */}
      {selectedUser && (() => {
        try {
          const u = users.find(uu => uu.id === selectedUser.id) || selectedUser;
          const plan = PLANS[u?.plan] || PLANS.free;
          const uRevenue = u.totalPaid || 0;
          const curM = new Date().toISOString().slice(0, 7);
          const aiUsed = u.ai_requests_month === curM ? (u.ai_requests_used || 0) : 0;
          // Foydalanuvchi manbalar — API dan kelgan sourceCount/totalRows
          const uSourceCount = u.sourceCount || 0;
          const uTotalRows = u.totalRows || 0;
          const daysSinceReg = u.created ? Math.floor((Date.now() - new Date(u.created).getTime()) / 86400000) : 0;
          const isActive = u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 7 * 86400000;

          return (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedUser(null)}>
              <div className="modal-box" style={{ maxWidth: 640, maxHeight: "92vh" }}>
                <button className="modal-close" onClick={() => setSelectedUser(null)}>✕</button>

                {/* User header */}
                <div style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: plan.color + "20", border: `2px solid ${plan.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fh)", fontSize: 24, fontWeight: 800, color: plan.color, flexShrink: 0 }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="f1">
                    <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{u.email}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <span className="badge" style={{ borderColor: plan.color + "40", color: plan.color, background: plan.color + "12", border: "1px solid" }}>{plan.nameUz}</span>
                      {u.status === "blocked" ? <span className="badge b-red">Bloklangan</span> : isActive ? <span className="badge b-ok">Faol</span> : <span className="badge b-no">Nofaol</span>}
                      {u.role === "admin" && <span className="badge b-warn">Admin</span>}
                      <span style={{ fontSize: 9, color: "var(--muted)", alignSelf: "center", fontFamily: "var(--fm)" }}>{daysSinceReg} kun a'zo</span>
                    </div>
                  </div>
                </div>

                {/* Modal tabs */}
                <div className="flex gap5 mb14" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                  {[
                    { id: "info", l: " Ma'lumotlar" },
                    { id: "data", l: ` Manbalar (${uSourceCount})` },
                    { id: "payments", l: ` To'lovlar (${uRevenue > 0 ? "✓" : "0"})` },
                  ].map(t => (
                    <button key={t.id} className="qcat" onClick={() => setUserTab(t.id)}
                      style={userTab === t.id ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.1)", padding: "5px 12px", fontSize: 10 } : { padding: "5px 12px", fontSize: 10 }}>
                      {t.l}
                    </button>
                  ))}
                </div>

                {/* ── INFO TAB ── */}
                {userTab === "info" && (<div>
                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      { l: "Ro'yxat sanasi", v: new Date(u.created || Date.now()).toLocaleDateString("uz-UZ"), c: "var(--text2)" },
                      { l: "Oxirgi kirish", v: u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("uz-UZ") : "Hech qachon", c: isActive ? "var(--green)" : "var(--muted)" },
                      { l: "AI so'rovlar", v: `${aiUsed} / ${plan.limits.ai_requests === -1 ? "∞" : plan.limits.ai_requests}`, c: plan.limits.ai_requests > 0 && aiUsed / plan.limits.ai_requests > 0.8 ? "var(--red)" : "var(--text2)" },
                      { l: "Manbalar", v: uSourceCount + " ta", c: "var(--green)" },
                      { l: "Yozuvlar", v: uTotalRows.toLocaleString(), c: "var(--teal)" },
                      { l: "Jami to'lov", v: uRevenue > 0 ? uRevenue.toLocaleString("uz-UZ") + " so'm" : "0", c: "var(--gold)" },
                    ].map((r, i) => (
                      <div key={i} style={{ background: "var(--s2)", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 8.5, color: "var(--muted)", fontFamily: "var(--fh)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>{r.l}</div>
                        <div style={{ fontSize: 13, fontFamily: "var(--fm)", color: r.c, fontWeight: 600 }}>{r.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* AI usage bar */}
                  {plan.limits.ai_requests > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div className="flex jb mb6">
                        <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)" }}>AI SO'ROV LIMITI</span>
                        <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: "var(--fm)" }}>{aiUsed}/{plan.limits.ai_requests}</span>
                      </div>
                      <div className="usage-bar-wrap">
                        <div className="usage-bar" style={{ width: `${Math.min(100, Math.round(aiUsed / plan.limits.ai_requests * 100))}%`, background: aiUsed / plan.limits.ai_requests > 0.8 ? "var(--red)" : "var(--gold)" }} />
                      </div>
                    </div>
                  )}

                  {/* Manbalar xulosa */}
                  {uSourceCount > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Ulangan Manbalar</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--s2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 10 }}>
                          <span></span>
                          <span style={{ fontWeight: 600 }}>{uSourceCount} ta manba</span>
                          <span className="badge b-ok" style={{ fontSize: 7 }}>{uTotalRows} yozuv</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Change plan */}
                  {u.id !== currentUser.id && (
                    <>
                      <div className="divider" />
                      <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Tarifni o'zgartirish</div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                        {Object.values(PLANS).map(p => (
                          <button key={p.id} className="btn btn-ghost btn-xs"
                            style={u.plan === p.id ? { borderColor: p.color, color: p.color, background: p.color + "10" } : {}}
                            onClick={() => changePlan(u.id, p.id)}>
                            {u.plan === p.id ? "✓ " : ""}{p.nameUz}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Actions */}
                  {u.id !== currentUser.id && u.role !== "admin" && (
                    <>
                      <div className="divider" />
                      <div className="flex gap8">
                        <button className={`btn btn-sm ${u.status === "blocked" ? "btn-teal" : "btn-danger"}`}
                          onClick={() => { blockUser(u.id, u.status !== "blocked"); setSelectedUser(null); }}>
                          {u.status === "blocked" ? "✓ Blokdan chiqarish" : "✗ Bloklash"}
                        </button>
                        <button className="btn btn-danger btn-sm ml-auto"
                          onClick={() => { setSelectedUser(null); setConfirmDelete(u); }}>
                          O'chirish
                        </button>
                      </div>
                    </>
                  )}
                </div>)}

                {/* ── DATA TAB — Foydalanuvchi biznes ma'lumotlari ── */}
                {userTab === "data" && (<div>
                  {uSourceCount === 0 && (
                    <div style={{ textAlign: "center", padding: 32 }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}></div>
                      <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Ma'lumot manbasi yo'q</div>
                      <div className="text-muted text-sm">Bu foydalanuvchi hali hech qanday manba ulamagan</div>
                    </div>
                  )}
                  {uSourceCount > 0 && (
                    <div style={{ textAlign: "center", padding: 20 }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}></div>
                      <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{uSourceCount} ta manba</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Jami {uTotalRows.toLocaleString()} ta yozuv</div>
                    </div>
                  )}
                </div>)}

                {/* ── PAYMENTS TAB ── */}
                {userTab === "payments" && (<div>
                  {/* Payment stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      { l: "Jami to'lov", v: uRevenue > 0 ? uRevenue.toLocaleString("uz-UZ") + " so'm" : "0", c: "var(--gold)" },
                      { l: "Holat", v: uRevenue > 0 ? "To'langan" : "To'lov yo'q", c: "var(--teal)" },
                      { l: "Tarif", v: plan.nameUz, c: "var(--purple)" },
                    ].map((r, i) => (
                      <div key={i} style={{ background: "var(--s2)", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 8.5, color: "var(--muted)", fontFamily: "var(--fh)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>{r.l}</div>
                        <div style={{ fontSize: 14, fontFamily: "var(--fm)", color: r.c, fontWeight: 700 }}>{r.v}</div>
                      </div>
                    ))}
                  </div>

                  {uRevenue === 0 && (
                    <div style={{ textAlign: "center", padding: 32 }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}></div>
                      <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>To'lov yo'q</div>
                      <div className="text-muted text-sm">Bu foydalanuvchi hali to'lov qilmagan</div>
                    </div>
                  )}

                  {uRevenue > 0 && (
                    <div style={{ textAlign: "center", padding: 20 }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}></div>
                      <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: "var(--gold)" }}>{uRevenue.toLocaleString("uz-UZ")} so'm</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Jami to'lov miqdori</div>
                    </div>
                  )}
                </div>)}
              </div>
            </div>
          );
        } catch (e) {
          console.error("[AdminPanel] User modal error:", e);
          return <div className="modal-overlay" onClick={() => setSelectedUser(null)}><div className="modal-box" style={{ textAlign: "center", padding: 32 }}><div style={{ color: "var(--red)", marginBottom: 12 }}>Xato yuz berdi</div><button className="btn btn-ghost" onClick={() => setSelectedUser(null)}>Yopish</button></div></div>;
        }
      })()}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
// DATA HUB PAGE (Constructor)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// GOOGLE SHEETS — backend API key orqali (barcha varaqlar)
// ─────────────────────────────────────────────────────────────
function GoogleSheetsSource({ src, updateConfig, push, onUpdate }) {
  const [url, setUrl] = useState(src.config?.url || "");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const doPreview = async () => {
    if (!url.trim()) { push("URL kiriting", "warn"); return; }
    setBusy(true); setPreview(null);
    try {
      const r = await SheetsAPI.preview(url.trim());
      setPreview(r);
      push(`✓ Topildi: "${r.title}" — ${r.sheetCount} varaq`, "ok");
    } catch (e) {
      push(e.message, "error");
    } finally { setBusy(false); }
  };

  const doFetch = async () => {
    setBusy(true);
    try {
      const r = await SheetsAPI.fetch(url.trim(), src.id);
      // Backend allaqachon connected=TRUE va config'ni yozdi.
      // Frontend lokal state'ni ham darhol yangilab qo'yamiz —
      // bir bosishda manba "ulangan" ko'rinishi uchun.
      const newConfig = {
        ...(src.config || {}),
        url: url.trim(),
        workbookTitle: r.workbookTitle,
        sheetCount: r.sheetCount,
        totalRows: r.totalRows,
        lastFetch: new Date().toISOString(),
      };
      // Server'da source_data alohida jadval — local data orientation faqat
      // count uchun ishlatiladi. Backend'dan keyingi kontekstga avtomatik tortiladi.
      const dataPlaceholder = (r.sheets || []).map(s => ({ _sheet: s.title, _rowCount: s.rowCount }));
      onUpdate?.({
        ...src,
        connected: true,
        active: true,
        config: newConfig,
        data: dataPlaceholder,
        spreadsheetName: r.workbookTitle,
        updatedAt: new Date().toLocaleString("uz-UZ"),
      });
      push(`✓ ${r.sheetCount} varaq · ${r.totalRows.toLocaleString()} qator yuklandi`, "ok");
      setPreview(null);
    } catch (e) {
      push(e.message, "error");
    } finally { setBusy(false); }
  };

  const isConnected = src.connected && src.config?.url;

  return (
    <div>
      {/* Yo'riqnoma */}
      <div style={{ background: "var(--s3)", borderRadius: 10, padding: "12px 14px", fontSize: 11.5, lineHeight: 1.7, color: "var(--text2)", marginBottom: 12, border: "1px solid var(--border-hi)" }}>
        <div style={{ color: "#60A5FA", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>Google Sheets ulash:</div>
        <div>1. Sheet'da <strong style={{ color: "var(--gold)" }}>"Share"</strong> tugmasi → <span style={{ color: "var(--text)" }}>"General access"</span> → <strong style={{ color: "var(--green)" }}>"Anyone with the link"</strong> → Viewer</div>
        <div>2. URL'ni nusxa olib quyiga joylashtiring</div>
        <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(96,165,250,0.08)", borderRadius: 6, border: "1px solid rgba(96,165,250,0.2)" }}>
          ✓ Barcha varaqlar (sheet'lar) avtomatik olinadi · ✓ Formula qiymatlar to'g'ri keladi · ✓ Qator chegarasi yo'q
        </div>
      </div>

      <label className="field-label">Google Sheets URL</label>
      <input
        className="field mb8"
        placeholder="https://docs.google.com/spreadsheets/d/..."
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === "Enter" && (preview ? doFetch() : doPreview())}
      />

      <div className="flex gap8 mb10">
        {!preview ? (
          <button className="btn btn-primary btn-sm" onClick={doPreview} disabled={busy || !url.trim()}>
            {busy ? "Tekshirilmoqda..." : "🔍 Tekshirish"}
          </button>
        ) : (
          <>
            <button className="btn btn-primary btn-sm" onClick={doFetch} disabled={busy}>
              {busy ? "Yuklanmoqda..." : `✓ ${preview.sheetCount} varaqni ulash`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)} disabled={busy}>
              Bekor
            </button>
          </>
        )}
        {isConnected && !preview && (
          <button className="btn btn-ghost btn-sm" onClick={doFetch} disabled={busy}>
            ↻ Yangilash
          </button>
        )}
      </div>

      {/* Preview natija */}
      {preview && (
        <div style={{ background: "var(--s2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border-hi)", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📊 {preview.title}</div>
          <div style={{ display: "grid", gap: 4, maxHeight: 280, overflow: "auto" }}>
            {preview.sheets.map(s => (
              <div key={s.title} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--s3)", borderRadius: 6, fontSize: 11 }}>
                <span>{s.hidden ? "🔒 " : "📄 "}{s.title}{s.hidden && <span style={{ color: "var(--muted)" }}> (yashirin)</span>}</span>
                <span style={{ color: "var(--muted)" }}>{(s.rowCount || 0).toLocaleString()} × {s.colCount || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ulangan holat */}
      {isConnected && !preview && (
        <div style={{ background: "rgba(96,165,250,0.06)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(96,165,250,0.2)", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18 }}>📊</div>
            <div className="f1">
              <div style={{ fontSize: 12, fontWeight: 700, color: "#60A5FA" }}>{src.config?.workbookTitle || "Ulangan"}</div>
              <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>
                {src.config?.sheetCount || 0} varaq · {(src.config?.totalRows || 0).toLocaleString()} qator
                {src.config?.lastFetch && <> · Oxirgi: {new Date(src.config.lastFetch).toLocaleString("uz-UZ")}</>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Avtomatik yangilash */}
      {isConnected && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--s3)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div className="flex aic jb">
            <label className="field-label" style={{ marginBottom: 0 }}>Avtomatik Yangilash</label>
            <select className="field" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}
              value={src.config?.autoRefresh || 0}
              onChange={e => updateConfig("autoRefresh", Number(e.target.value))}>
              <option value={0}>O'chirilgan</option>
              <option value={60}>Har 1 soat</option>
              <option value={360}>Har 6 soat</option>
              <option value={1440}>Har 24 soat</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TELEGRAM KANAL — manba ichida MTProto orqali ulash
// ─────────────────────────────────────────────────────────────
function TelegramChannelSource({ src, updateConfig, push, onSyncDone }) {
  const [status, setStatus] = useState(null);
  const [admin, setAdmin] = useState([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const reload = useCallback(async () => {
    try {
      const s = await TelegramAPI.mtprotoStatus();
      setStatus(s);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const linkedChannelId = src.config?.channelDbId;
  const linkedChannel = status?.channels?.find(c => c.id === linkedChannelId);

  const loadAdmin = async () => {
    setBusy(true);
    try {
      const r = await TelegramAPI.adminChannels();
      setAdmin(r.channels || []);
      setPicking(true);
    } catch (e) {
      push(e.message, "error");
    } finally { setBusy(false); }
  };

  const pickChannel = async (ch) => {
    setBusy(true);
    try {
      const r = await TelegramAPI.connectChannel(ch);
      // source.config ga channel referensiyasini saqlash
      updateConfig("mode", "mtproto");
      updateConfig("channelDbId", r.id);
      updateConfig("channelId", String(ch.channelId));
      updateConfig("channelUsername", ch.username || null);
      updateConfig("channelTitle", ch.title);
      // Manbani darhol ulangan deb belgilash (bir bosishda active bo'lsin)
      onSyncDone?.({
        ...src,
        connected: true,
        active: true,
        config: {
          ...(src.config || {}),
          mode: "mtproto",
          channelDbId: r.id,
          channelId: String(ch.channelId),
          channelUsername: ch.username || null,
          channelTitle: ch.title,
        },
        spreadsheetName: ch.title,
        updatedAt: new Date().toLocaleString("uz-UZ"),
      });
      push(`✓ "${ch.title}" ulandi`, "ok");
      setPicking(false);
      // Birinchi sync (orqa fonda)
      try {
        const sync = await TelegramAPI.syncChannel(r.id);
        if (sync?.note) push(sync.note, "warn");
      } catch (e) { /* ignore initial sync error */ }
      await reload();
    } catch (e) {
      push(e.message, "error");
    } finally { setBusy(false); }
  };

  const sync = async () => {
    if (!linkedChannelId) return;
    setBusy(true);
    try {
      const r = await TelegramAPI.syncChannel(linkedChannelId);
      if (r?.note) push(r.note, "warn");
      else push(`Yangilandi · ${r?.members?.toLocaleString() || "?"} a'zo`, "ok");
      await reload();
      onSyncDone?.();
    } catch (e) {
      push(e.message, "error");
    } finally { setBusy(false); }
  };

  // ── Render ──
  // 1. MTProto akkaunt ulanmagan
  if (!status?.connected) {
    return (
      <div style={{ background: "var(--s3)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "var(--muted)", marginBottom: 10 }}>
          <div style={{ color: "#38BDF8", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>Telegram kanal statistikasi uchun:</div>
          <div>1. Avval <strong style={{ color: "var(--gold)" }}>Sozlamalar → 📺 Telegram Kanal Statistikasi</strong> bo'limidan akkauntni ulang</div>
          <div>2. Kanal admining telefoni orqali kirgandan keyin shu yerga qaytib kanalni tanlang</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={reload} disabled={busy}>↻ Holatni tekshirish</button>
      </div>
    );
  }

  // 2. Akkaunt ulangan, kanal tanlanmagan
  if (!linkedChannelId) {
    return (
      <div>
        <div style={{ background: "rgba(74,222,128,0.06)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(74,222,128,0.2)", marginBottom: 10, fontSize: 11 }}>
          <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ Akkaunt ulangan:</span>{" "}
          <span style={{ color: "var(--text)" }}>{status.session?.accountName || status.session?.phone}</span>
        </div>

        {!picking ? (
          <button className="btn btn-primary btn-sm" onClick={loadAdmin} disabled={busy}>
            {busy ? "Yuklanmoqda..." : "📺 Kanal tanlash"}
          </button>
        ) : (
          <div style={{ background: "var(--s2)", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)" }}>
            <div className="flex aic jb mb8">
              <div style={{ fontSize: 11, fontWeight: 600 }}>Admin kanallari ({admin.length})</div>
              <button className="btn btn-ghost btn-xs" onClick={() => setPicking(false)}>Yopish</button>
            </div>
            {admin.length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--muted)" }}>Admin kanallar topilmadi</div>
            ) : (
              <div style={{ display: "grid", gap: 4, maxHeight: 300, overflow: "auto" }}>
                {admin.map(c => {
                  const already = (status.channels || []).some(x => String(x.channelId) === String(c.channelId));
                  return (
                    <div key={c.channelId}
                      onClick={() => !already && !busy && pickChannel(c)}
                      style={{ cursor: already || busy ? "default" : "pointer", opacity: already ? 0.5 : 1, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--s3)", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 16 }}>📺</div>
                      <div className="f1">
                        <div style={{ fontSize: 11, fontWeight: 600 }}>
                          {c.title} {c.creator && <span style={{ fontSize: 9, color: "var(--gold)" }}>· egasi</span>}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--muted)" }}>
                          {c.username && <>@{c.username} · </>}
                          {c.memberCount?.toLocaleString() || "?"} a'zo
                          {already && <> · <span style={{ color: "var(--green)" }}>boshqa manbada ulangan</span></>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 3. Kanal tanlangan
  return (
    <div>
      <div style={{ background: "rgba(56,189,248,0.06)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(56,189,248,0.2)", marginBottom: 10 }}>
        <div className="flex aic gap8">
          <div style={{ fontSize: 18 }}>📺</div>
          <div className="f1">
            <div style={{ fontSize: 12, fontWeight: 700, color: "#38BDF8" }}>{src.config?.channelTitle || linkedChannel?.title}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {src.config?.channelUsername && <>@{src.config.channelUsername} · </>}
              {(linkedChannel?.memberCount || 0).toLocaleString()} a'zo
              {linkedChannel?.lastSyncedAt
                ? <> · Oxirgi: {new Date(linkedChannel.lastSyncedAt).toLocaleString("uz-UZ")}</>
                : <> · <span style={{ color: "var(--orange)" }}>Hali sinxronlanmagan</span></>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex aic gap8">
        <button className="btn btn-primary btn-sm" onClick={sync} disabled={busy}>
          {busy ? "..." : "↻ Yangilash"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          if (!confirm("Kanalni almashtirmoqchimisiz?")) return;
          updateConfig("channelDbId", null);
          updateConfig("channelId", null);
          updateConfig("channelTitle", null);
          updateConfig("channelUsername", null);
        }}>Boshqa kanal tanlash</button>
      </div>
    </div>
  );
}

function SourceItem({ src, onUpdate, onDelete, push, bulkExpand }) {
  const [expanded, setExpanded] = useState(false);

  // Tashqaridan "Hammasini ochish/yig'ish" bosilsa — sinxronlash
  useEffect(() => {
    if (bulkExpand && typeof bulkExpand.v === "boolean") setExpanded(bulkExpand.v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkExpand?.ts]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(src.name);
  const [drag, setDrag] = useState(false);
  const st = SOURCE_TYPES[src.type];
  const fileRef = useRef(null);

  const [activeSheet, setActiveSheet] = useState(null);

  // When sheet tab changes, update active data
  const switchSheet = (sheetName) => {
    setActiveSheet(sheetName);
    const fileWithSheet = src.files?.find(f => f.sheetData && f.sheetData[sheetName]);
    if (fileWithSheet) {
      const sheetRows = fileWithSheet.sheetData[sheetName];
      onUpdate({ ...src, data: sheetRows, activeSheet: sheetName });
    }
  };

  const handleExcelFiles = async (files) => {
    const results = [];
    for (const file of files) {
      setLoading(true);
      try {
        const sheets = await parseExcelFile(file);
        const allRows = Object.values(sheets).flat();
        results.push({
          fileName: file.name,
          sheets: Object.keys(sheets),
          data: allRows,
          sheetData: sheets,
        });
      } catch (e) { push("Fayl o'qishda xato: " + e.message, "error"); }
      setLoading(false);
    }
    if (results.length) {
      const combined = results.flatMap(r => r.data);
      onUpdate({ ...src, connected: true, active: true, data: combined, files: results, updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ ${results.length} ta fayl yuklandi — ${combined.length} qator`, "ok");
    }
  };

  // ── Google Sheets — XLSX export orqali barcha listlarni yuklash ──
  const handleSheetsFetch = async () => {
    const url = (src.config?.url || "").trim();
    if (!url) { push("Google Sheets URL kiriting", "warn"); return; }
    setLoading(true);

    const extractId = (u) => {
      const m = u.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
      if (/^[a-zA-Z0-9_-]{20,}$/.test(u)) return u;
      return null;
    };

    const spreadsheetId = extractId(url);
    if (!spreadsheetId) {
      push("Google Sheets URL noto'g'ri.", "error");
      setLoading(false); return;
    }

    try {
      // ── XLSX sifatida yuklab olish — BARCHA listlar avtomatik ──
      push("Google Sheets yuklanmoqda...", "info");
      const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error("Sheet ochiq (public) emas yoki URL noto'g'ri. Share → Anyone with link → Viewer qiling.");

      const buf = await res.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });

      if (!workbook.SheetNames?.length) throw new Error("Sheets bo'sh — hech qanday list topilmadi");

      // Barcha listlarni parse qilish
      const allRows = [];
      const sheetInfo = [];

      workbook.SheetNames.forEach(sheetName => {
        const ws = workbook.Sheets[sheetName];
        // Aqlli parser — merged header, bo'sh ustunlar, bo'sh qatorlarni to'g'ri ishlaydi
        const cleanRows = smartSheetToJson(ws);
        if (cleanRows.length > 0) {
          cleanRows.forEach(row => {
            row._sheet = sheetName;
            allRows.push(row);
          });
          sheetInfo.push({ name: sheetName, rows: cleanRows.length });
        }
      });

      if (allRows.length === 0) throw new Error("Barcha listlar bo'sh");

      const totalSheets = sheetInfo.length;
      const totalRows = allRows.length;

      onUpdate({
        ...src,
        connected: true, active: true,
        data: allRows,
        updatedAt: new Date().toLocaleString("uz-UZ"),
        spreadsheetName: "Google Sheet",
        config: { ...src.config, url, spreadsheetId, lastFetch: Date.now(), sheetCount: totalSheets, sheetInfo },
      });
      // Avtomatik yangilash default 15 daqiqa
      if (!src.config?.autoRefresh) updateConfig("autoRefresh", 15);
      push(`✓ Google Sheets — ${totalSheets} ta list, ${totalRows} ta qator yuklandi. Har 15 daqiqada yangilanadi.`, "ok");

    } catch (e) {
      push("Sheets xato: " + e.message, "error");
    }
    setLoading(false);
  };

  const handleAPIFetch = async () => {
    const { url, token, dataPath } = src.config || {};
    if (!url) { push("API URL kiriting", "warn"); return; }
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const raw = await res.json();
      let data = Array.isArray(raw) ? raw : raw.data || raw.results || raw.items || [raw];
      if (dataPath) {
        const parts = dataPath.split(".");
        let cur = raw;
        for (const p of parts) { if (cur && p in cur) cur = cur[p]; }
        if (Array.isArray(cur)) data = cur;
      }
      onUpdate({ ...src, connected: true, active: true, data, updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ ${data.length} ta yozuv olindi`, "ok");
    } catch (e) { push("API xato: " + e.message, "error"); }
    setLoading(false);
  };

  const handleManual = () => {
    try {
      const raw = src.config?.data || "[]";
      const parsed = JSON.parse(raw);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      onUpdate({ ...src, connected: true, active: true, data, updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ ${data.length} ta yozuv saqlandi`, "ok");
    } catch (e) { push("JSON xato: " + e.message, "error"); }
  };

  // ── DOCUMENT (PDF/Word/TXT) — faylni backend orqali parse qilib bazaga saqlash ──
  const docFileRef = useRef(null);
  const handleDocumentFiles = async (files) => {
    setLoading(true);
    let successCount = 0;
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      push(`"${file.name}" yuklanmoqda...`, "info");
      try {
        // Backend API orqali parse — PDF, DOCX, TXT, CSV, Excel barchasi
        const result = await UploadAPI.uploadAndParse(src.id, file);
        // Backend bazaga saqladi — barcha manbalarni qayta yuklab, shu manba data sini olamiz
        const allSources = await SourcesAPI.getAll();
        const updated = allSources.find(s => s.id === src.id);
        if (updated) {
          onUpdate({
            ...src,
            connected: true,
            active: true,
            data: updated.data || [],
            files: [...(src.files || []), { fileName: file.name, type: ext, size: file.size }],
            updatedAt: new Date().toLocaleString("uz-UZ"),
          });
        }
        push(`✓ "${file.name}" — ${result.textLength || 0} belgi (${result.rowCount || 1} yozuv) bazaga saqlandi`, "ok");
        successCount++;
      } catch (e) {
        // Backend xato — frontend fallback (faqat txt/csv uchun)
        if (ext === 'txt' || ext === 'csv' || ext === 'log' || ext === 'md') {
          try {
            const text = await file.text();
            const fallbackData = [{
              id: 1,
              fayl_nomi: file.name,
              tur: ext,
              hajm_kb: Math.round(file.size / 1024),
              qatorlar: text.split('\n').length,
              matn: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
              toliq_matn: text.substring(0, 100000),
            }];
            onUpdate({ ...src, connected: true, active: true, data: fallbackData, files: [...(src.files || []), { fileName: file.name, type: ext, size: file.size }], updatedAt: new Date().toLocaleString("uz-UZ") });
            push(`✓ "${file.name}" (matn sifatida yuklandi)`, "ok");
            successCount++;
          } catch (e2) { push(`Fayl o'qishda xato (${file.name}): ${e2.message}`, "error"); }
        } else {
          push(`"${file.name}" yuklashda xato: ${e.message}`, "error");
        }
      }
    }
    if (successCount === 0) push("Hech bir fayl yuklanmadi", "warn");
    setLoading(false);
  };

  // ── IMAGE — rasm yuklash (base64 + AI tahlil uchun) ──
  const imgFileRef = useRef(null);
  const handleImageFiles = async (files) => {
    setLoading(true);
    const results = [];
    for (const file of files) {
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
          push(`${file.name} — qo'llab-quvvatlanmaydigan format`, "warn"); continue;
        }
        // Base64 ga aylantirish
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        // Rasm o'lchami
        const img = new Image();
        const dims = await new Promise(resolve => {
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 0, h: 0 });
          img.src = b64;
        });
        results.push({
          fileName: file.name, type: ext, size: file.size,
          width: dims.w, height: dims.h,
          dataUrl: b64,
          description: `Rasm: ${file.name} (${dims.w}x${dims.h}, ${(file.size / 1024).toFixed(1)}KB)`,
        });
      } catch (e) { push(`Rasm xato (${file.name}): ${e.message}`, "error"); }
    }
    if (results.length) {
      const data = results.map((r, i) => ({
        id: i + 1,
        fayl_nomi: r.fileName,
        tur: r.type,
        hajm_kb: Math.round(r.size / 1024),
        kenglik: r.width,
        balandlik: r.height,
        tavsif: r.description,
        rasm_url: r.dataUrl,
      }));
      onUpdate({ ...src, connected: true, active: true, data, files: results.map(r => ({ fileName: r.fileName, type: r.type, size: r.size, width: r.width, height: r.height })), updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ ${results.length} ta rasm yuklandi`, "ok");
    }
    setLoading(false);
  };

  // ── 1C Buxgalteriya (OData API) ──
  const handle1CFetch = async () => {
    const baseUrl = (src.config?.onecUrl || "").trim();
    const login = (src.config?.onecLogin || "").trim();
    const pass = (src.config?.onecPassword || "").trim();
    if (!baseUrl) { push("1C server URL kiriting", "warn"); return; }
    if (!login || !pass) { push("Login va parol kiriting", "warn"); return; }
    setLoading(true);
    try {
      const headers = { 'Authorization': 'Basic ' + btoa(login + ':' + pass), 'Accept': 'application/json' };
      // OData endpoint
      const url = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      const res = await fetch(url + 'odata/standard.odata?$format=json', { headers });
      if (!res.ok) throw new Error(`1C server xato: ${res.status} ${res.statusText}`);
      const json = await res.json();
      const entities = json.value || json.d || [];
      if (entities.length === 0) throw new Error("1C dan ma'lumot kelmadi");
      const data = Array.isArray(entities) ? entities : [entities];
      onUpdate({ ...src, connected: true, active: true, data, updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ 1C dan ${data.length} ta yozuv yuklandi`, "ok");
    } catch (e) { push("1C xato: " + e.message, "error"); }
    setLoading(false);
  };

  // ── Yandex Metrika ──
  const handleYandexFetch = async () => {
    const counterId = (src.config?.ymCounter || "").trim();
    const token = (src.config?.ymToken || "").trim();
    if (!counterId) { push("Yandex Metrika counter ID kiriting", "warn"); return; }
    if (!token) { push("OAuth token kiriting", "warn"); return; }
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const metricsUrl = `https://api-metrika.yandex.net/stat/v1/data?id=${counterId}&metrics=ym:s:visits,ym:s:pageviews,ym:s:users,ym:s:bounceRate,ym:s:avgVisitDurationSeconds&dimensions=ym:s:date&date1=${d30}&date2=${today}&sort=ym:s:date&limit=30`;
      const res = await fetch(metricsUrl, { headers: { 'Authorization': `OAuth ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Yandex API xato: ${res.status}`);
      }
      const json = await res.json();
      const data = (json.data || []).map(row => ({
        sana: row.dimensions?.[0]?.name || '',
        tashriflar: row.metrics?.[0] || 0,
        sahifa_korishlar: row.metrics?.[1] || 0,
        foydalanuvchilar: row.metrics?.[2] || 0,
        qaytish_foizi: Math.round((row.metrics?.[3] || 0) * 100) / 100,
        ortacha_vaqt_sek: Math.round(row.metrics?.[4] || 0),
      }));
      onUpdate({ ...src, connected: true, active: true, data, updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ Yandex Metrika: ${data.length} kunlik statistika yuklandi`, "ok");
    } catch (e) { push("Yandex Metrika xato: " + e.message, "error"); }
    setLoading(false);
  };

  // ── SQL Database ──
  const handleDatabaseTest = () => {
    push("SQL Database ulanish hozircha backend orqali ishlaydi. Backend API ni sozlang.", "info");
  };

  // ── Facebook Graph API orqali so'rov (Instagram Business) ──
  // Dev: Vite proxy /igbizproxy → graph.facebook.com
  // Prod: Nginx proxy /igbizproxy → graph.facebook.com
  const fbFetch = async (endpoint) => {
    const url = `/igbizproxy/${endpoint}`;
    console.log("[IG]", endpoint.split("?")[0]);
    const res = await fetch(url);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error("API javob xato: " + text.substring(0, 120)); }
    if (json.error) {
      console.warn("[IG] Error:", json.error.message, json.error.code);
      let errMsg = json.error.message || "Facebook API xato";
      const m = errMsg.toLowerCase();
      if (m.includes("session is invalid because the user logged out")) errMsg = "Sessiya yaroqsiz: Siz Facebook/Instagram dan chiqib ketgansiz yoxud parolni o'zgartirgansiz. Iltimos yaroqli (yangi) Access Token oling.";
      else if (m.includes("error validating access token")) errMsg = "Token yaroqsiz, eskirgan yoki login qilinmagan. Yangi Token kerak.";
      else if (m.includes("an active access token must be used")) errMsg = "Faol Access Token kiritilmadi.";
      else if (m.includes("rate limit") || m.includes("too many calls") || json.error.code === 4) errMsg = "So'rovlar limitdan oshib ketdi. Iltimos birozdan so'ng (yoki 1 soatdan keyin) urinib ko'ring.";
      else if (m.includes("unsupported get request") || m.includes("not visible")) errMsg = "Ma'lumot topilmadi yoxud bu akkauntni o'qishga sizda ruxsat yo'q.";
      else if (m.includes("permissions") || m.includes("access_denied")) errMsg = "Tokenda ushbu amal uchun yetarli ruxsat (permissions) yo'q.";
      throw new Error(errMsg);
    }
    return json;
  };

  // ── Instagram Token uzaytirish (1 soat → 60 kun → muddatsiz) ──
  const handleTokenExtend = async () => {
    const token = (src.config?.token || "").trim();
    const appId = (src.config?.appId || "").trim();
    const appSecret = (src.config?.appSecret || "").trim();
    if (!token) { push("Avval Access Token kiriting", "warn"); return; }
    if (!appId || !appSecret) { push("App ID va App Secret kiriting", "warn"); return; }
    setLoading(true);
    try {
      // 1-bosqich: Short-lived → Long-lived User Token (60 kun)
      push("Token uzaytirilmoqda (60 kunlik)...", "info");
      const llRes = await fbFetch(`v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`);
      const longToken = llRes.access_token;
      if (!longToken) throw new Error("Long-lived token olib bo'lmadi");
      push("60 kunlik token olindi. Page token olinmoqda...", "ok");

      // 2-bosqich: Long-lived User Token → Page Token (muddatsiz)
      const pagesRes = await fbFetch(`v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longToken}`);
      const pages = pagesRes.data || [];
      // Instagram ulangan page ni topish
      const igPage = pages.find(p => p.instagram_business_account);
      if (igPage?.access_token) {
        // Page token — muddatsiz
        const pageToken = igPage.access_token;
        const igId = igPage.instagram_business_account?.id || "";
        onUpdate({
          ...src,
          config: { ...src.config, token: pageToken, igBusinessId: igId || src.config?.igBusinessId, tokenType: "page", tokenExtendedAt: Date.now() }
        });
        push(`Muddatsiz Page Token olindi (${igPage.name}). Endi token eskirmaydi!`, "ok");
      } else {
        // Page token topilmadi — 60 kunlik token ni saqlash
        onUpdate({ ...src, config: { ...src.config, token: longToken, tokenType: "long-lived", tokenExtendedAt: Date.now() } });
        push("60 kunlik token saqlandi. Instagram ulangan Facebook Page topilmadi — Page token uchun Instagram ni Facebook Page ga ulang.", "warn");
      }
    } catch (e) {
      push("Token uzaytirish xato: " + e.message, "error");
    }
    setLoading(false);
  };

  // ── Instagram Business Account ma'lumotlarini tortish ──
  const handleInstagramFetch = async () => {
    const token = (src.config?.token || "").trim();
    if (!token) { push("Instagram Access Token kiriting", "warn"); return; }
    setLoading(true);
    try {
      // 1. Instagram Business Account ID — config dan yoki avtomatik topish
      let igId = (src.config?.igBusinessId || "").trim();
      if (!igId) {
        const pages = await fbFetch(`v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${token}`);
        const igAccount = pages.data?.find(p => p.instagram_business_account);
        if (!igAccount?.instagram_business_account?.id) {
          throw new Error("Instagram Business Account topilmadi. Instagram Business ID ni qo'lda kiriting yoki Token Facebook sahifasiga ulangan bo'lishi kerak.");
        }
        igId = igAccount.instagram_business_account.id;
      }
      push("Instagram profilni yuklamoqda...", "info");

      // 2. Profil ma'lumotlari (followers, bio, va h.k.)
      const profile = await fbFetch(`v21.0/${igId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url&access_token=${token}`);

      // 3. Postlar — like, comments + INSIGHTS (reach, impressions, saved, shares, plays)
      let posts = [];
      try {
        // Avval media_product_type bilan, xato bo'lsa oddiy fields bilan
        let rawPosts = [];
        try {
          const mediaJson = await fbFetch(`v21.0/${igId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=50&access_token=${token}`);
          rawPosts = mediaJson.data || [];
        } catch {
          const mediaJson2 = await fbFetch(`v21.0/${igId}/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=50&access_token=${token}`);
          rawPosts = mediaJson2.data || [];
        }
        if (rawPosts.length === 0) push("Postlar topilmadi — akkauntda post yo'q yoki token ruxsati yetarli emas", "warn");
        else push(`${rawPosts.length} ta post insights yuklanmoqda...`, "info");
        let insightErrors = 0;
        for (let pi = 0; pi < rawPosts.length; pi++) {
          const p = rawPosts[pi];
          let reach = 0, impressions = 0, saved = 0, shares = 0, plays = 0;
          try {
            const isVideo = p.media_type === "VIDEO";
            const isReel = p.media_product_type === "REELS";
            const metrics = isVideo || isReel
              ? "reach,saved,shares,plays"
              : "reach,saved,shares";
            const ins = await fbFetch(`v21.0/${p.id}/insights?metric=${metrics}&access_token=${token}`);
            (ins.data || []).forEach(m => {
              const val = m.values?.[0]?.value || m.total_value?.value || 0;
              if (m.name === "reach") reach = val;
              if (m.name === "impressions") impressions = val;
              if (m.name === "saved" || m.name === "saves") saved = val;
              if (m.name === "shares") shares = val;
              if (m.name === "plays" || m.name === "video_views") plays = val;
            });
          } catch (insErr) { insightErrors++; if (insightErrors === 1) push("Post insights xato: " + insErr.message, "warn"); }
          const postType = p.media_product_type === "REELS" ? "REEL" : p.media_type;
          posts.push({
            id: p.id,
            caption: (p.caption || "").substring(0, 200),
            type: postType,
            date: p.timestamp?.slice(0, 10) || "",
            time: p.timestamp?.slice(11, 16) || "",
            likes: p.like_count || 0,
            comments: p.comments_count || 0,
            reach, impressions, saved, shares, plays,
            engagement: (p.like_count || 0) + (p.comments_count || 0) + saved + shares,
            engRate: profile.followers_count > 0 ? +(((p.like_count || 0) + (p.comments_count || 0) + saved + shares) / profile.followers_count * 100).toFixed(1) : 0,
            url: p.permalink || "",
          });
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (e2) { push("Postlarni yuklab bo'lmadi: " + e2.message, "warn"); }

      // 4. PROFIL INSIGHTS — reach, impressions, follower o'sishi (kunlik, 30 kun)
      let profileInsights = {};
      let dailyReach = [], dailyImpressions = [];
      push("Profil insights yuklanmoqda (30 kunlik)...", "info");
      try {
        const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        for (const metric of ["reach", "impressions", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "replies", "follower_count"]) {
          try {
            const pIns = await fbFetch(`v21.0/${igId}/insights?metric=${metric}&period=day&metric_type=total_value&since=${d30}&until=${today}&access_token=${token}`);
            (pIns.data || []).forEach(m => {
              const entries = (m.values || []).map(v => ({
                date: (v.end_time || "").slice(0, 10),
                value: v.value || (typeof v.value === "object" ? Object.values(v.value).reduce((a, b) => a + b, 0) : 0)
              }));
              const vals = entries.map(e => e.value);
              const total = vals.reduce((a, b) => a + b, 0);
              profileInsights[m.name] = { total, avg: vals.length ? Math.round(total / vals.length) : 0, daily: entries };
              if (m.name === "reach") dailyReach = entries;
              if (m.name === "impressions") dailyImpressions = entries;
            });
          } catch { }
        }
        const pKeys = Object.keys(profileInsights);
        push(`Profil insights: ${pKeys.length > 0 ? pKeys.join(", ") : "ruxsat kerak"}`, pKeys.length > 0 ? "ok" : "warn");
      } catch { }

      // 4b. ONLINE FOLLOWERS — eng faol soatlar
      let onlineFollowers = {};
      try {
        const onl = await fbFetch(`v21.0/${igId}/insights?metric=online_followers&period=lifetime&access_token=${token}`);
        (onl.data || []).forEach(m => {
          const val = m.values?.[0]?.value || {};
          if (typeof val === "object") onlineFollowers = val;
        });
      } catch { }

      // 5. AUDIENCE — shahar, mamlakat, yosh-jins (100+ follower kerak)
      let audience = {};
      try {
        for (const metric of ["follower_demographics", "reached_audience_demographics", "engaged_audience_demographics"]) {
          // Country breakdown
          try {
            const audCountry = await fbFetch(`v21.0/${igId}/insights?metric=${metric}&period=lifetime&metric_type=total_value&breakdown=country&access_token=${token}`);
            (audCountry.data || []).forEach(m => {
              const val = m.total_value?.breakdowns?.[0]?.results || [];
              if (Array.isArray(val)) {
                const obj = {}; val.forEach(r => { obj[r.dimension_values?.join(", ") || "unknown"] = r.value || 0; });
                audience[metric + "_country"] = obj;
              }
            });
          } catch { }
          // City breakdown
          try {
            const aud = await fbFetch(`v21.0/${igId}/insights?metric=${metric}&period=lifetime&metric_type=total_value&breakdown=city&access_token=${token}`);
            (aud.data || []).forEach(m => {
              const val = m.total_value?.breakdowns?.[0]?.results || m.values?.[0]?.value || {};
              if (Array.isArray(val)) {
                const obj = {}; val.forEach(r => { obj[r.dimension_values?.join(", ") || "unknown"] = r.value || 0; });
                audience[metric + "_city"] = obj;
              } else { audience[metric] = val; }
            });
          } catch { }
          // Age breakdown (faqat yosh)
          try {
            const audAge = await fbFetch(`v21.0/${igId}/insights?metric=${metric}&period=lifetime&metric_type=total_value&breakdown=age&access_token=${token}`);
            (audAge.data || []).forEach(m => {
              const val = m.total_value?.breakdowns?.[0]?.results || [];
              if (Array.isArray(val)) {
                const obj = {}; val.forEach(r => { obj[r.dimension_values?.join(", ") || "unknown"] = r.value || 0; });
                audience[metric + "_age"] = obj;
              }
            });
          } catch { }
          // Gender breakdown
          try {
            const audGender = await fbFetch(`v21.0/${igId}/insights?metric=${metric}&period=lifetime&metric_type=total_value&breakdown=gender&access_token=${token}`);
            (audGender.data || []).forEach(m => {
              const val = m.total_value?.breakdowns?.[0]?.results || [];
              if (Array.isArray(val)) {
                const obj = {}; val.forEach(r => { obj[r.dimension_values?.join(", ") || "unknown"] = r.value || 0; });
                audience[metric + "_gender"] = obj;
              }
            });
          } catch { }
          // Age+gender breakdown
          try {
            const aud2 = await fbFetch(`v21.0/${igId}/insights?metric=${metric}&period=lifetime&metric_type=total_value&breakdown=age,gender&access_token=${token}`);
            (aud2.data || []).forEach(m => {
              const val = m.total_value?.breakdowns?.[0]?.results || [];
              if (Array.isArray(val)) {
                const obj = {}; val.forEach(r => { obj[r.dimension_values?.join(" ") || "unknown"] = r.value || 0; });
                audience[metric + "_age_gender"] = obj;
              }
            });
          } catch { }
        }
        const aKeys = Object.keys(audience);
        push(`Audience: ${aKeys.length > 0 ? aKeys.length + " ta metrik" : "ruxsat kerak (100+ follower)"}`, aKeys.length > 0 ? "ok" : "warn");
      } catch { }

      // 5b. STORIES — oxirgi stories va ularning insightlari
      let stories = [];
      try {
        push("Stories yuklanmoqda...", "info");
        const storiesJson = await fbFetch(`v21.0/${igId}/stories?fields=id,media_type,timestamp,permalink&access_token=${token}`);
        const rawStories = storiesJson.data || [];
        for (let si = 0; si < rawStories.length; si++) {
          const s = rawStories[si];
          let sReach = 0, sImpressions = 0, sReplies = 0, sExits = 0, sTaps = 0;
          try {
            const sIns = await fbFetch(`v21.0/${s.id}/insights?metric=reach,impressions,replies,exits,taps_forward,taps_back&access_token=${token}`);
            (sIns.data || []).forEach(m => {
              const val = m.values?.[0]?.value || 0;
              if (m.name === "reach") sReach = val;
              if (m.name === "impressions") sImpressions = val;
              if (m.name === "replies") sReplies = val;
              if (m.name === "exits") sExits = val;
              if (m.name === "taps_forward" || m.name === "taps_back") sTaps += val;
            });
          } catch { }
          stories.push({
            _type: "STORY",
            id: s.id,
            type: s.media_type,
            date: s.timestamp?.slice(0, 10) || "",
            reach: sReach, impressions: sImpressions,
            replies: sReplies, exits: sExits, taps: sTaps,
          });
          await new Promise(r => setTimeout(r, 200));
        }
        if (stories.length > 0) push(`${stories.length} ta story yuklandi`, "ok");
      } catch { }

      // 6. Statistika hisoblash
      const totalLikes = posts.reduce((a, p) => a + (p.likes || 0), 0);
      const totalComments = posts.reduce((a, p) => a + (p.comments || 0), 0);
      const totalReach = posts.reduce((a, p) => a + (p.reach || 0), 0);
      const totalImpressions = posts.reduce((a, p) => a + (p.impressions || 0), 0);
      const totalSaved = posts.reduce((a, p) => a + (p.saved || 0), 0);
      const totalShares = posts.reduce((a, p) => a + (p.shares || 0), 0);
      const totalPlays = posts.reduce((a, p) => a + (p.plays || 0), 0);
      const totalEngagement = totalLikes + totalComments + totalSaved + totalShares;
      const avgLikes = posts.length ? Math.round(totalLikes / posts.length) : 0;
      const avgComments = posts.length ? Math.round(totalComments / posts.length) : 0;
      const avgReach = posts.length ? Math.round(totalReach / posts.length) : 0;
      const avgImpressions = posts.length ? Math.round(totalImpressions / posts.length) : 0;
      const sortedPosts = [...posts].sort((a, b) => (b.reach || 0) - (a.reach || 0));
      const topPost = sortedPosts[0];
      const typeCount = posts.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {});

      // Profil insights dan 30 kunlik reach/impressions hisoblash (trend uchun)
      const piReachTotal = profileInsights.reach?.total || totalReach;
      const piImpTotal = profileInsights.impressions?.total || totalImpressions;
      // O'tgan oydagi reach/impressions (taqqoslash uchun)
      const piReachDaily = profileInsights.reach?.daily || [];
      const piImpDaily = profileInsights.impressions?.daily || [];
      const halfLen = Math.floor(piReachDaily.length / 2);
      const reachFirstHalf = piReachDaily.slice(0, halfLen).reduce((a, d) => a + (d.value || 0), 0);
      const reachSecondHalf = piReachDaily.slice(halfLen).reduce((a, d) => a + (d.value || 0), 0);
      const reachChange = reachFirstHalf > 0 ? +((reachSecondHalf - reachFirstHalf) / reachFirstHalf * 100).toFixed(1) : 0;
      const impFirstHalf = piImpDaily.slice(0, halfLen).reduce((a, d) => a + (d.value || 0), 0);
      const impSecondHalf = piImpDaily.slice(halfLen).reduce((a, d) => a + (d.value || 0), 0);
      const impChange = impFirstHalf > 0 ? +((impSecondHalf - impFirstHalf) / impFirstHalf * 100).toFixed(1) : 0;

      // Follower o'sish hisoblash
      const followerDaily = profileInsights.follower_count?.daily || [];
      const followerFirst = followerDaily[0]?.value || 0;
      const followerLast = followerDaily[followerDaily.length - 1]?.value || profile.followers_count || 0;
      const followerGrowth = followerFirst > 0 ? followerLast - followerFirst : 0;
      const followerGrowthPct = followerFirst > 0 ? +((followerGrowth / followerFirst) * 100).toFixed(1) : 0;

      // 7. Profil summary (KENGAYTIRILGAN)
      const summary = {
        _type: "PROFIL_STATISTIKA",
        username: profile.username,
        name: profile.name || "",
        biography: (profile.biography || "").substring(0, 200),
        profile_picture_url: profile.profile_picture_url || "",
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
        avg_likes_per_post: avgLikes,
        avg_comments_per_post: avgComments,
        avg_reach_per_post: avgReach,
        avg_impressions_per_post: avgImpressions,
        engagement_rate: profile.followers_count > 0 ? +((totalEngagement / posts.length / profile.followers_count) * 100).toFixed(2) : 0,
        engagement_rate_str: profile.followers_count > 0 ? ((totalEngagement / posts.length / profile.followers_count) * 100).toFixed(1) + "%" : "0%",
        // Profil insights (30 kunlik kunlik ma'lumotlar)
        profile_insights: profileInsights,
        daily_reach: dailyReach,
        daily_impressions: dailyImpressions,
        // Reach/Impressions 30 kunlik jami
        reach_30d: piReachTotal,
        impressions_30d: piImpTotal,
        reach_change_pct: reachChange,
        impressions_change_pct: impChange,
        // Follower o'sishi
        follower_growth: followerGrowth,
        follower_growth_pct: followerGrowthPct,
        follower_daily: followerDaily,
        // Online followers (faol soatlar)
        online_followers: onlineFollowers,
        // Audience
        audience: audience,
        top_cities: audience.follower_demographics_city
          ? Object.entries(audience.follower_demographics_city).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ name: k, value: v }))
          : [],
        top_countries: audience.follower_demographics_country
          ? Object.entries(audience.follower_demographics_country).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ name: k, value: v }))
          : [],
        // Stories
        stories_count: stories.length,
        stories_data: stories,
        top_post_caption: topPost?.caption || "—",
        top_post_engagement: topPost?.engagement || 0,
        last_updated: new Date().toLocaleString("uz-UZ"),
      };

      const data = [summary, ...stories, ...posts];
      onUpdate({
        ...src,
        connected: true, active: true, data,
        updatedAt: new Date().toLocaleString("uz-UZ"),
        profileName: profile.username,
        config: { ...src.config, token, igId, lastFetch: Date.now() },
      });
      const hasInsights = totalReach > 0 || totalSaved > 0;
      push(`✓ @${profile.username} — ${profile.followers_count?.toLocaleString()} followers, ${posts.length} post, ${stories.length} story${hasInsights ? `, reach: ${piReachTotal.toLocaleString()}, impressions: ${piImpTotal.toLocaleString()}` : ""}`, "ok");
    } catch (e) {
      push("Instagram xato: " + e.message, "error");
    }
    setLoading(false);
  };

  // ── Telegram Kanal Statistikasi (Bot API orqali) ──
  const handleTelegramFetch = async () => {
    const token = src.config?.token;
    const channelId = src.config?.channelId; // @username yoki -100xxxxx
    if (!token) { push("Telegram Bot Token kiriting", "warn"); return; }
    if (!channelId) { push("Kanal username yoki ID kiriting (masalan @kanal_nomi)", "warn"); return; }
    setLoading(true);
    try {
      const base = `https://api.telegram.org/bot${token}`;
      const chatId = channelId.startsWith("@") ? channelId : channelId.startsWith("-") ? channelId : `@${channelId}`;

      // 1. Bot tekshiruvi
      const botRes = await fetch(`${base}/getMe`);
      const botJson = await botRes.json();
      if (!botJson.ok) throw new Error("Token noto'g'ri: " + (botJson.description || ""));
      const bot = botJson.result;

      // 2. Kanal ma'lumotlari
      const chatRes = await fetch(`${base}/getChat?chat_id=${encodeURIComponent(chatId)}`);
      const chatJson = await chatRes.json();
      if (!chatJson.ok) throw new Error("Kanal topilmadi. Bot kanalga admin sifatida qo'shilganmi? Xato: " + (chatJson.description || ""));
      const chat = chatJson.result;

      // 3. Obunachilar soni
      let memberCount = 0;
      try {
        const mcRes = await fetch(`${base}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`);
        const mcJson = await mcRes.json();
        if (mcJson.ok) memberCount = mcJson.result;
      } catch { }

      // 4. Adminlar ro'yxati
      let admins = [];
      try {
        const admRes = await fetch(`${base}/getChatAdministrators?chat_id=${encodeURIComponent(chatId)}`);
        const admJson = await admRes.json();
        if (admJson.ok) admins = admJson.result.map(a => ({
          name: (a.user.first_name || "") + (a.user.last_name ? " " + a.user.last_name : ""),
          username: a.user.username || "—",
          status: a.status, // creator | administrator
          is_bot: a.user.is_bot,
        }));
      } catch { }

      // 5. Kanal postlarini olish (getUpdates orqali channel_post)
      // Avval webhook o'chirilishi kerak, keyin getUpdates ishlaydi
      let posts = [];
      try {
        // Webhook tekshirish
        const whRes = await fetch(`${base}/getWebhookInfo`);
        const whJson = await whRes.json();
        const hasWebhook = whJson.ok && whJson.result.url;

        if (hasWebhook) {
          // Webhook bor — deleteWebhook qilib getUpdates olish
          await fetch(`${base}/deleteWebhook`);
          // Biroz kutish
          await new Promise(r => setTimeout(r, 500));
        }

        const updRes = await fetch(`${base}/getUpdates?limit=100&allowed_updates=["channel_post"]&timeout=3`);
        const updJson = await updRes.json();
        const updates = updJson.result || [];

        // channel_post larni parse qilish
        posts = updates
          .filter(u => u.channel_post)
          .map(u => {
            const p = u.channel_post;
            const caption = p.caption || p.text || "";
            return {
              id: p.message_id,
              text: caption.substring(0, 300),
              date: new Date((p.date || 0) * 1000).toLocaleDateString("uz-UZ"),
              time: new Date((p.date || 0) * 1000).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }),
              views: p.views || 0,
              forwards: p.forward_count || 0,
              has_photo: !!(p.photo && p.photo.length),
              has_video: !!p.video,
              has_document: !!p.document,
              has_poll: !!p.poll,
              has_audio: !!p.audio || !!p.voice,
              media_type: p.video ? "video" : p.photo ? "photo" : p.document ? "document" : p.poll ? "poll" : p.audio || p.voice ? "audio" : "text",
              reply_markup: p.reply_markup ? "ha" : "yo'q",
            };
          })
          .sort((a, b) => b.id - a.id); // Eng yangi birinchi

        // Agar webhook bor edi — qayta o'rnatish
        if (hasWebhook) {
          await fetch(`${base}/setWebhook?url=${encodeURIComponent(whJson.result.url)}`);
        }
      } catch (e) {
        // getUpdates ishlamasa davom etamiz (webhook sabab bo'lishi mumkin)
        console.warn("getUpdates xato:", e.message);
      }

      // 6. Statistika hisoblash
      const totalViews = posts.reduce((a, p) => a + p.views, 0);
      const totalForwards = posts.reduce((a, p) => a + p.forwards, 0);
      const avgViews = posts.length > 0 ? Math.round(totalViews / posts.length) : 0;
      const avgForwards = posts.length > 0 ? Math.round(totalForwards / posts.length) : 0;
      const photoCount = posts.filter(p => p.has_photo).length;
      const videoCount = posts.filter(p => p.has_video).length;
      const textCount = posts.filter(p => p.media_type === "text").length;
      const engagementRate = memberCount > 0 && posts.length > 0 ? ((avgViews / memberCount) * 100).toFixed(1) : 0;

      const summary = {
        _type: "KANAL_STATISTIKA",
        channel_name: chat.title || "—",
        channel_username: chat.username ? "@" + chat.username : "—",
        channel_type: chat.type || "channel",
        channel_description: (chat.description || "").substring(0, 200),
        member_count: memberCount,
        total_posts: posts.length,
        total_views: totalViews,
        total_forwards: totalForwards,
        avg_views: avgViews,
        avg_forwards: avgForwards,
        engagement_rate: parseFloat(engagementRate),
        photo_posts: photoCount,
        video_posts: videoCount,
        text_posts: textCount,
        admins_count: admins.length,
        linked_chat: chat.linked_chat_id ? "Ha" : "Yo'q",
        has_stories: chat.has_visible_history ? "Ha" : "Yo'q",
        last_updated: new Date().toLocaleString("uz-UZ"),
      };

      // Adminlar ma'lumotini qo'shish
      const adminsData = admins.length > 0 ? { _type: "ADMINLAR", admins } : null;

      const data = [summary, ...(adminsData ? [adminsData] : []), ...posts];
      const channelName = chat.username ? "@" + chat.username : chat.title;
      onUpdate({
        ...src,
        connected: true, active: true, data,
        updatedAt: new Date().toLocaleString("uz-UZ"),
        profileName: channelName,
        config: { ...src.config, token, channelId, lastFetch: Date.now() },
      });
      push(`✓ ${channelName} — ${memberCount.toLocaleString()} obunachi, ${posts.length} post, ${totalViews.toLocaleString()} ko'rish yuklandi`, "ok");
    } catch (e) {
      push("Telegram xato: " + e.message, "error");
    }
    setLoading(false);
  };

  // ── LC-UP CRM Ma'lumotlarini Tortish ──
  const handleCrmFetch = async () => {
    const phone = (src.config?.crmPhone || "").trim();
    const pass = (src.config?.crmPassword || "").trim();
    const domain = (src.config?.crmDomain || "").trim();
    if (!phone || !pass || !domain) { push("Telefon, parol va domen kiriting", "warn"); return; }
    setLoading(true);
    try {
      // 1. LOGIN — token olish
      const loginForm = new FormData();
      loginForm.append("mobile_number", phone);
      loginForm.append("password", pass);
      loginForm.append("domain", domain);

      const loginRes = await fetch("/lcuplogin/api/dev/login", { method: "POST", body: loginForm });
      if (!loginRes.ok) throw new Error("Login xato: HTTP " + loginRes.status);
      const loginJson = await loginRes.json();
      if (!loginJson.status || !loginJson.data?.access_token) throw new Error("Login muvaffaqiyatsiz: " + (loginJson.message || "Token olinmadi"));
      const token = loginJson.data.access_token;
      const crmUser = loginJson.data.user;
      push(`✓ CRM ga ulandi: ${crmUser.name}`, "ok");

      // 2. PAGINATED FETCH funksiyasi (delay + retry bilan)
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      const fetchWithRetry = async (url, headers, label, retries = 5) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          const res = await fetch(url, { headers });
          if (res.status === 429) {
            const waitMs = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
            push(` ${label} — server band, ${Math.round(waitMs / 1000)}s kutilmoqda... (${attempt}/${retries})`, "info");
            await delay(waitMs);
            continue;
          }
          return res;
        }
        return null; // barcha urinishlar tugadi
      };

      const fetchAllPages = async (endpoint, label) => {
        const all = [];
        let page = 1;
        let lastPage = 1;
        let failed = false;
        while (page <= lastPage) {
          const res = await fetchWithRetry(
            `/lcupapi/api/v1/${endpoint}?page=${page}`,
            { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
            `${label} ${page}-sahifa`
          );
          if (!res || !res.ok) {
            push(` ${label}: ${page}-sahifada xato (HTTP ${res?.status || "timeout"}), ${all.length} ta yuklandi`, "warn");
            failed = true;
            break;
          }
          const json = await res.json();
          const items = json.data?.data || json.data || [];
          if (Array.isArray(items)) all.push(...items);
          lastPage = json.data?.last_page || 1;
          page++;
          // Sahifalar orasida pauza (rate limit oldini olish)
          if (page <= lastPage) await delay(500);
        }
        if (!failed) push(`✓ ${label}: ${all.length} ta yuklandi`, "ok");
        return all;
      };

      // 3. BARCHA ENDPOINTLARNI KETMA-KET YUKLASH (rate limit uchun)
      push(" Lidlar yuklanmoqda...", "info");
      const lids = await fetchAllPages("lids", "Lidlar");
      await delay(1000);
      push(" Guruhlar yuklanmoqda...", "info");
      const groups = await fetchAllPages("groups", "Guruhlar");
      await delay(1000);
      push(" O'quvchilar yuklanmoqda...", "info");
      const students = await fetchAllPages("students", "O'quvchilar");
      await delay(1000);
      push(" O'qituvchilar yuklanmoqda...", "info");
      const teachers = await fetchAllPages("teachers", "O'qituvchilar");
      await delay(1000);
      const trashedStudents = await fetchAllPages("trashedStudents", "O'chirilgan").catch(() => []);

      // 4. MA'LUMOTLARNI FLATTEN QILISH
      // Lidlar
      const flatLids = lids.map(l => ({
        _entity: "lid",
        id: l.id,
        fullname: l.fullname || "",
        phone: l.mobile_number || "",
        created_at: l.created_at?.slice(0, 10) || "",
        updated_at: l.updated_at?.slice(0, 10) || "",
        roads_count: (l.roads || []).length,
        last_road: (l.roads || []).slice(-1)[0]?.category?.name || "—",
        last_road_admin: (l.roads || []).slice(-1)[0]?.admin?.name || "—",
        extra_fields: (l.extra_options || []).length,
      }));

      // Guruhlar
      const flatGroups = groups.map(g => ({
        _entity: "group",
        id: g.id,
        name: g.name || "",
        cost: g.cost || 0,
        students_count: g.students_count || 0,
        start_time: g.start_time || "",
        finish_time: g.finish_time || "",
        start_course: g.start_course || "",
        end_course: g.end_course || "",
        filial: (g.filial?.name || "—"),
        fan: (g.fan?.name || "—"),
        dars_count: g.fan?.dars_count || 0,
        room: (g.room?.name || "—"),
        days: (g.days || []).map(d => d.name || d).join(", "),
        teachers: (g.teachers || []).map(t => t.name || t).join(", "),
      }));

      // O'quvchilar
      const flatStudents = students.map(s => ({
        _entity: "student",
        id: s.id,
        name: s.name || "",
        phone: s.user?.mobile_number || "",
        gender: s.gender || "",
        birth_date: s.birth_date || "",
        created_at: s.created_at?.slice(0, 10) || "",
        active_groups_count: (s.active_groups || []).length,
        groups_list: (s.active_groups || []).map(g => g.name).join(", "),
        filials: [...new Set((s.active_groups || []).map(g => g.filial?.name).filter(Boolean))].join(", "),
        fans: [...new Set((s.active_groups || []).map(g => g.fan?.name).filter(Boolean))].join(", "),
      }));

      // O'qituvchilar
      const flatTeachers = teachers.map(t => ({
        _entity: "teacher",
        id: t.id,
        name: t.name || "",
        birth_date: t.birth_date || "",
        filial: t.filial?.name || "—",
        salary: t.salary || 0,
        status: t.status || "",
        groups_count: (t.groups || []).length,
        groups_list: (t.groups || []).map(g => g.name).join(", "),
        fans: [...new Set((t.groups || []).map(g => g.fan?.name).filter(Boolean))].join(", "),
      }));

      // 5. CRM SUMMARY
      // Filiallar bo'yicha taqsimot
      const filialMap = {};
      flatStudents.forEach(s => {
        const fils = s.filials.split(", ").filter(Boolean);
        fils.forEach(f => { filialMap[f] = (filialMap[f] || 0) + 1; });
      });
      const fanMap = {};
      flatGroups.forEach(g => {
        if (g.fan && g.fan !== "—") fanMap[g.fan] = (fanMap[g.fan] || 0) + g.students_count;
      });
      const totalRevenue = flatGroups.reduce((a, g) => a + (g.cost || 0) * (g.students_count || 0), 0);
      const totalSalary = flatTeachers.reduce((a, t) => a + (t.salary || 0), 0);

      const summary = {
        _type: "CRM_STATISTIKA",
        crm_domain: domain,
        crm_user: crmUser.name,
        total_lids: lids.length,
        total_groups: groups.length,
        total_students: students.length,
        total_teachers: teachers.length,
        trashed_students: trashedStudents.length,
        filials: filialMap,
        fans: fanMap,
        total_monthly_revenue: totalRevenue,
        total_monthly_salary: totalSalary,
        avg_group_size: groups.length > 0 ? Math.round(students.length / groups.length) : 0,
        avg_group_cost: groups.length > 0 ? Math.round(flatGroups.reduce((a, g) => a + g.cost, 0) / groups.length) : 0,
        last_updated: new Date().toLocaleString("uz-UZ"),
      };

      // 6. BIRLASHTIRILGAN DATA
      const data = [summary, ...flatLids, ...flatGroups, ...flatStudents, ...flatTeachers];

      // CRM raw data — alohida saqlash (dashboard uchun)
      const crmRaw = { lids: flatLids, groups: flatGroups, students: flatStudents, teachers: flatTeachers, summary };

      onUpdate({
        ...src,
        connected: true, active: true, data,
        updatedAt: new Date().toLocaleString("uz-UZ"),
        profileName: `${domain}.lc-up.com`,
        crmRaw,
        config: { ...src.config, crmPhone: phone, crmPassword: pass, crmDomain: domain, crmToken: token, crmUser: crmUser.name, lastFetch: Date.now() },
      });
      push(`✓ CRM yuklandi: ${lids.length} lid, ${groups.length} guruh, ${students.length} o'quvchi, ${teachers.length} o'qituvchi`, "ok");
    } catch (e) {
      push("CRM xato: " + e.message, "error");
    }
    setLoading(false);
  };

  // ── Veb-sayt tahlil qilish ──
  const handleWebsiteScrape = async (deepScan = false) => {
    const url = (src.config?.siteUrl || "").trim();
    if (!url) { push("Sayt URL manzilini kiriting", "warn"); return; }
    setLoading(true);
    push(`Sayt yuklanmoqda: ${url} ...`, "info");
    try {
      const token = Token.get();
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url, sourceId: src.id, deepScan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Nomalum xato");
      push(`✓ ${json.pagesScanned} ta sahifa tahlil qilindi, ${json.rowCount} ta ma'lumot bazaga saqlandi`, "ok");
      if (json.summary?.phones?.length) push(`Telefon: ${json.summary.phones.slice(0, 3).join(", ")}`, "info");
      if (json.summary?.emails?.length) push(`Email: ${json.summary.emails.slice(0, 3).join(", ")}`, "info");
      const soc = json.summary?.socials || {};
      if (Object.keys(soc).length) push(`Ijtimoiy: ${Object.keys(soc).join(", ")}`, "info");
      // Manbani yangilash — backenddan yangi data yuklash
      const allSources = await SourcesAPI.getAll();
      if (Array.isArray(allSources)) {
        const fresh = allSources.find(s => s.id === src.id);
        if (fresh) {
          onUpdate({ ...src, ...fresh, connected: true, active: true });
          setTimeout(() => setExpanded(false), 2000); // 2 soniyadan so'ng yopish
        }
      }
    } catch (e) {
      let msg = e.message;
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) msg = "Serverga ulanib bo'lmadi. Internet yoki server tekshiring.";
      push("Sayt xato: " + msg, "error");
    }
    setLoading(false);
  };

  // ── Manba turaga qarab yangilash ──
  const handleRefreshData = async () => {
    if (src.type === "instagram") return handleInstagramFetch();
    if (src.type === "telegram") {
      // Yangi MTProto rejimi
      if (src.config?.mode === "mtproto" && src.config?.channelDbId) {
        try {
          const r = await TelegramAPI.syncChannel(src.config.channelDbId);
          if (r?.note) push(r.note, "warn");
          else push(`Yangilandi · ${r?.members?.toLocaleString() || "?"} a'zo`, "ok");
        } catch (e) { push(e.message, "error"); }
        return;
      }
      // Eski Bot API (mavjud sourcelar uchun fallback)
      return handleTelegramFetch();
    }
    if (src.type === "sheets") {
      // Yangi: backend API key orqali — barcha varaqlar
      if (src.config?.url) {
        try {
          const r = await SheetsAPI.fetch(src.config.url, src.id);
          push(`✓ ${r.sheetCount} varaq · ${r.totalRows.toLocaleString()} qator yangilandi`, "ok");
        } catch (e) { push(e.message, "error"); }
        return;
      }
      // Eski client-side fallback
      return handleSheetsFetch();
    }
    if (src.type === "restapi") return handleAPIFetch();
    if (src.type === "crm") return handleCrmFetch();
    if (src.type === "onec") return handle1CFetch();
    if (src.type === "yandex") return handleYandexFetch();
    if (src.type === "website") return handleWebsiteScrape(false);
    push("Bu manba turini qo'lda yangilash kerak", "info");
  };

  // ── Avtomatik yangilash (interval) ──
  useEffect(() => {
    const interval = src.config?.autoRefresh;
    if (!interval || !src.connected || !src.active) return;
    const ms = interval * 60 * 1000; // minutdan ms ga
    const timer = setInterval(() => {
      handleRefreshData();
    }, ms);
    return () => clearInterval(timer);
  }, [src.config?.autoRefresh, src.connected, src.active, src.config?.token]);

  const updateConfig = (key, val) => onUpdate({ ...src, config: { ...src.config, [key]: val } });

  // ── Manba sog'ligi hisoblash ──
  const healthScore = (() => {
    if (!src.connected) return { score: 0, color: "#64748B", label: "Ulanmagan", icon: "○" };
    const rows = src.data?.length || 0;
    const lastUpd = src.updatedAt || src.config?.lastFetch;
    // Oxirgi yangilanishdan qancha vaqt o'tgan
    const lastFetchMs = src.config?.lastFetch ? Date.now() - src.config.lastFetch : null;
    const stale = lastFetchMs ? lastFetchMs > 24 * 60 * 60 * 1000 : false; // 24 soatdan eski
    if (rows === 0) return { score: 1, color: "#F87171", label: "Ma'lumot yo'q", icon: "!" };
    if (stale) return { score: 2, color: "#E8B84B", label: "Eskirgan (24s+)", icon: "~" };
    if (rows < 3) return { score: 3, color: "#E8B84B", label: "Kam ma'lumot", icon: "~" };
    if (!src.active) return { score: 2, color: "#64748B", label: "Nofaol", icon: "—" };
    return { score: 4, color: "#4ADE80", label: "Sog'lom", icon: "✓" };
  })();

  return (
    <div className={`source-item ${src.active && src.connected ? "active-src" : "inactive-src"}`}>
      {/* Header */}
      <div className="src-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <div className="src-color-dot" style={{ background: src.color || st.color }} />
        <div className="f1">
          <div className="src-name">{src.name}</div>
          <div className="src-meta">
            <span style={{ color: st.color }}>{st.icon} {st.label}</span>
            {src.connected && <span style={{ marginLeft: 8, color: "var(--green)" }}>· {src.data?.length || 0} qator</span>}
            {src.updatedAt && <span style={{ marginLeft: 8, color: "var(--muted)" }}>· {src.updatedAt}</span>}
            {/* Health indicator */}
            {src.connected && (
              <span title={healthScore.label} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 9, fontWeight: 700, fontFamily: "var(--fh)", background: healthScore.color + "18", color: healthScore.color, border: `1px solid ${healthScore.color}30` }}>
                <span style={{ fontSize: 8 }}>{healthScore.icon}</span> {healthScore.label}
              </span>
            )}
          </div>
        </div>
        <div className="src-actions" onClick={e => e.stopPropagation()}>
          {src.connected && (
            <span className="badge b-ok text-xs">{src.data?.length || 0}</span>
          )}
          {src.connected && ["instagram", "telegram", "sheets", "restapi", "crm", "website"].includes(src.type) && (
            <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); handleRefreshData(); }} disabled={loading} title="Yangilash">{loading ? "" : "↻"}</button>
          )}
          {/* active toggle */}
          <button className="src-toggle" style={{ background: src.active ? "var(--green)" : "var(--s4)" }}
            onClick={(e) => { e.stopPropagation(); onUpdate({ ...src, active: !src.active }); }}>
            <div style={{ width: 13, height: 13, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: src.active ? 18 : 2, transition: "left .2s" }} />
          </button>
          <button className="btn btn-ghost btn-xs"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            title={expanded ? "Yig'ish" : "Kengaytirish"}
            style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: "transform .2s var(--ease)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span style={{ fontSize: 10 }}>{expanded ? "Yig'ish" : "Kengaytirish"}</span>
          </button>
          <button className="btn btn-danger btn-xs" onClick={(e) => { e.stopPropagation(); onDelete(src.id); }} title="O'chirish">✕</button>
        </div>
      </div>

      {/* Body — expanded */}
      {expanded && (
        <div className="src-body">
          {/* Name edit */}
          <div className="mb10">
            <label className="field-label">Manba Nomi</label>
            <div className="flex gap6">
              <input className="field f1" value={name} onChange={e => setName(e.target.value)} placeholder="Manba nomi..." />
              <button className="btn btn-ghost btn-sm" onClick={() => onUpdate({ ...src, name })}>Saqlash</button>
            </div>
          </div>

          {/* EXCEL */}
          {src.type === "excel" && (
            <div>
              <div className={`drop-zone ${drag ? "drag" : ""}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleExcelFiles([...e.dataTransfer.files]); }}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                  onChange={e => handleExcelFiles([...e.target.files])} />
                <div style={{ fontSize: 52, marginBottom: 12, filter: "drop-shadow(0 4px 12px rgba(74,222,128,0.3))" }}>{loading ? "⏳" : "📊"}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>{loading ? "Yuklanmoqda..." : "Excel fayllarni bu yerga tashlang"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>yoki bosib tanlang</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {["XLSX", "XLS", "CSV"].map(t => (
                    <span key={t} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(74,222,128,0.1)", color: "#4ADE80", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 600, border: "1px solid rgba(74,222,128,0.15)" }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>Bir vaqtda ko'p fayl yuklash mumkin</div>
              </div>
              {src.files?.map((f, i) => (
                <div key={i} className="flex aic gap8 mb6" style={{ padding: "6px 10px", background: "var(--s3)", borderRadius: 6, fontSize: 11 }}>
                  <span> {f.fileName}</span>
                  <span className="text-muted ml-auto">{f.data.length} qator</span>
                  {f.sheets.length > 1 && <span className="badge b-ok">{f.sheets.length} varaq</span>}
                </div>
              ))}
              {/* Multi-sheet tabs */}
              {src.files?.some(f => f.sheets?.length > 1) && (
                <div>
                  <div className="field-label mt8 mb6">Varaqni tanlang:</div>
                  <div className="flex gap4" style={{ flexWrap: "wrap" }}>
                    {src.files?.flatMap(f => f.sheets || []).map(sheet => (
                      <button key={sheet} className="btn btn-ghost btn-xs"
                        style={(src.activeSheet || src.files?.[0]?.sheets?.[0]) === sheet ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.07)" } : {}}
                        onClick={() => switchSheet(sheet)}>
                        {sheet}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>
                    Faol: <span style={{ color: "var(--teal)" }}>{src.activeSheet || src.files?.[0]?.sheets?.[0]}</span> — {src.data?.length || 0} qator
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SHEETS — backend API key orqali */}
          {src.type === "sheets" && (
            <GoogleSheetsSource
              src={src}
              updateConfig={updateConfig}
              push={push}
              onUpdate={(updated) => onUpdate(updated || src)}
            />
          )}

          {/* REST API */}
          {src.type === "restapi" && (
            <div>
              <div className="g2 mb8">
                <div>
                  <label className="field-label">API Endpoint</label>
                  <input className="field" placeholder="https://api.example.com/v1/..." value={src.config?.url || ""} onChange={e => updateConfig("url", e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Bearer Token</label>
                  <input className="field" type="password" placeholder="sk-..." value={src.config?.token || ""} onChange={e => updateConfig("token", e.target.value)} />
                </div>
              </div>
              <div className="mb8">
                <label className="field-label">Ma'lumot Joyi (ixtiyoriy)</label>
                <input className="field" placeholder="data.results yoki items — bo'sh qoldirsa root ishlatiladi" value={src.config?.dataPath || ""} onChange={e => updateConfig("dataPath", e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleAPIFetch} disabled={loading}>{loading ? " So'rov yuborilmoqda..." : "API Ulash"}</button>
            </div>
          )}

          {/* INSTAGRAM */}
          {src.type === "instagram" && (
            <div>
              {/* ── Ulangan holat ── */}
              {src.connected && src.config?.token ? (
                <div>
                  {/* Profil info */}
                  {src.data?.find(d => d._type === "PROFIL_STATISTIKA") && (() => {
                    const p = src.data.find(d => d._type === "PROFIL_STATISTIKA");
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "12px 14px", background: "rgba(232,121,249,0.06)", borderRadius: 10, border: "1px solid rgba(232,121,249,0.15)" }}>
                        {p.profile_picture_url && <img src={p.profile_picture_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: "#E879F9", fontSize: 13 }}>@{p.username}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                            {p.followers_count?.toLocaleString()} followers · {p.fetched_posts} post · ER {p.engagement_rate_str}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "right" }}>
                          {src.config?.tokenType === "page"
                            ? <span style={{ color: "#4ADE80" }}>✓ Muddatsiz token</span>
                            : <span style={{ color: "#FBBF24" }}>⏱ 60 kunlik token</span>}
                          {src.config?.lastSync && <div style={{ marginTop: 2 }}>Oxirgi sync: {new Date(src.config.lastSync).toLocaleString("uz-UZ")}</div>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tugmalar */}
                  <div className="flex gap8 mb10">
                    <button className="btn btn-primary btn-sm" onClick={handleInstagramFetch} disabled={loading}>
                      {loading ? "Yuklanmoqda..." : "↻ Ma'lumotlarni yangilash"}
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { if (confirm("Instagram ni uzish va qayta ulash?")) { updateConfig("token", ""); updateConfig("tokenType", ""); } }}>
                      Qayta ulash
                    </button>
                  </div>

                  {/* Avtomatik yangilash */}
                  <div style={{ padding: "10px 12px", background: "var(--s3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div className="flex aic jb">
                      <label className="field-label" style={{ marginBottom: 0 }}>Avtomatik Yangilash</label>
                      <select className="field" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }} value={src.config?.autoRefresh || 0} onChange={e => updateConfig("autoRefresh", Number(e.target.value))}>
                        <option value={0}>O'chirilgan</option>
                        <option value={360}>Har 6 soat</option>
                        <option value={720}>Har 12 soat</option>
                        <option value={1440}>Har 24 soat</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Ulanmagan holat — OAuth tugmasi ── */
                <div>
                  {/* OAuth tugmasi */}
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%", background: "linear-gradient(135deg, #E879F9, #A78BFA)", border: "none", padding: "12px", fontSize: 14, fontWeight: 700, borderRadius: 10, marginBottom: 14 }}
                    onClick={() => {
                      if (!src.id) { push("Avval manbani saqlang", "warn"); return; }
                      const tok = Token.get();
                      window.location.href = `/api/instagram/auth?sourceId=${src.id}&_t=${tok}`;
                    }}
                    disabled={!src.id}
                  >
                     Instagram bilan ulash
                  </button>

                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 10, marginBottom: 14 }}>— yoki qo'lda token kiriting —</div>

                  {/* Manual token (fallback) */}
                  <label className="field-label">Access Token (qo'lda)</label>
                  <input className="field mb6" type="password" placeholder="EAAVBMeBfo..." value={src.config?.token || ""} onChange={e => updateConfig("token", e.target.value)} />

                  {src.config?.token && (
                    <div className="flex gap8 mb10">
                      <button className="btn btn-primary btn-sm" onClick={handleInstagramFetch} disabled={loading || !src.config?.token}>
                        {loading ? "Yuklanmoqda..." : "Ulash"}
                      </button>
                    </div>
                  )}

                  <div style={{ background: "var(--s3)", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: "var(--muted)", lineHeight: 1.8, border: "1px solid var(--border)" }}>
                    <strong style={{ color: "var(--text2)" }}>Talab:</strong> Instagram Business yoki Creator akkaunt + Facebook Page<br/>
                    <strong style={{ color: "var(--text2)" }}>Ruxsatlar:</strong> instagram_basic, instagram_manage_insights, pages_show_list
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TELEGRAM — MTProto orqali rasmiy statistika */}
          {src.type === "telegram" && (
            <TelegramChannelSource
              src={src}
              updateConfig={updateConfig}
              push={push}
              onSyncDone={(updated) => onUpdate(updated || src)}
            />
          )}

          {/* CRM (LC-UP) */}
          {src.type === "crm" && (
            <div>
              <div style={{ background: "var(--s3)", borderRadius: 8, padding: "12px 14px", fontSize: 10.5, lineHeight: 1.9, color: "var(--muted)", marginBottom: 12, border: "1px solid var(--border)" }}>
                <div style={{ color: "#8B5CF6", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>LC-UP CRM Ulash:</div>
                <div>1. <span style={{ color: "var(--text2)" }}>lc-up.com</span> dagi o'quv markaz CRM tizimiga kirish ma'lumotlari kerak</div>
                <div>2. <strong style={{ color: "var(--gold)" }}>Telefon raqam</strong>, <strong style={{ color: "var(--gold)" }}>Parol</strong> va <strong style={{ color: "var(--gold)" }}>Domen</strong> kiriting</div>
                <div>3. Tizim avtomatik: <span style={{ color: "var(--green)" }}>Lidlar, Guruhlar, O'quvchilar, O'qituvchilar</span> ni yuklaydi</div>
                <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(139,92,246,0.08)", borderRadius: 6, border: "1px solid rgba(139,92,246,0.15)" }}>
                  <span style={{ color: "#8B5CF6", fontWeight: 600 }}>Masalan:</span> <span style={{ color: "var(--muted)", fontSize: 9, fontFamily: "var(--fm)" }}>domen: data, tel: 998880900448</span>
                </div>
              </div>
              <div className="g2 mb8" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div>
                  <label className="field-label">Telefon Raqam</label>
                  <input className="field" placeholder="998901234567" value={src.config?.crmPhone || ""} onChange={e => updateConfig("crmPhone", e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Parol</label>
                  <input className="field" type="password" placeholder="••••••" value={src.config?.crmPassword || ""} onChange={e => updateConfig("crmPassword", e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Domen</label>
                  <input className="field" placeholder="data" value={src.config?.crmDomain || ""} onChange={e => updateConfig("crmDomain", e.target.value)} />
                </div>
              </div>
              <div className="flex gap8 mb10">
                <button className="btn btn-primary btn-sm" onClick={handleCrmFetch} disabled={loading || !src.config?.crmPhone || !src.config?.crmPassword || !src.config?.crmDomain}>
                  {loading ? " Yuklanmoqda..." : " Ulash va Yuklash"}
                </button>
                {src.connected && src.data?.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleCrmFetch} disabled={loading}>↻ Yangilash</button>
                )}
              </div>
              {src.profileName && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#8B5CF6", marginBottom: 8, padding: "8px 12px", background: "rgba(139,92,246,0.06)", borderRadius: 8, border: "1px solid rgba(139,92,246,0.15)" }}>
                  <span style={{ fontSize: 18 }}></span>
                  <div className="f1">
                    <strong>{src.profileName}</strong> ulangan
                    {src.config?.crmUser && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· {src.config.crmUser}</span>}
                    {src.config?.lastFetch && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· oxirgi: {new Date(src.config.lastFetch).toLocaleString("uz-UZ")}</span>}
                  </div>
                  {src.crmRaw && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className="badge" style={{ fontSize: 8, background: "rgba(139,92,246,0.1)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.2)" }}>{src.crmRaw.lids?.length || 0} lid</span>
                      <span className="badge" style={{ fontSize: 8, background: "rgba(74,222,128,0.1)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.2)" }}>{src.crmRaw.groups?.length || 0} guruh</span>
                      <span className="badge" style={{ fontSize: 8, background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)" }}>{src.crmRaw.students?.length || 0} o'quvchi</span>
                      <span className="badge" style={{ fontSize: 8, background: "rgba(251,191,36,0.1)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.2)" }}>{src.crmRaw.teachers?.length || 0} o'qituvchi</span>
                    </div>
                  )}
                </div>
              )}
              {/* Avtomatik yangilash */}
              {src.connected && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--s3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div className="flex aic jb">
                    <label className="field-label" style={{ marginBottom: 0 }}>Avtomatik Yangilash</label>
                    <select className="field" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }} value={src.config?.autoRefresh || 0} onChange={e => updateConfig("autoRefresh", Number(e.target.value))}>
                      <option value={0}>O'chirilgan</option>
                      <option value={30}>Har 30 daqiqa</option>
                      <option value={60}>Har 1 soat</option>
                      <option value={360}>Har 6 soat</option>
                      <option value={1440}>Har 24 soat</option>
                    </select>
                  </div>
                  {src.config?.autoRefresh > 0 && <div style={{ fontSize: 9.5, color: "var(--teal)", marginTop: 5 }}>⟳ Har {src.config.autoRefresh >= 60 ? Math.round(src.config.autoRefresh / 60) + " soat" : src.config.autoRefresh + " daqiqa"}da avtomatik yangilanadi</div>}
                </div>
              )}
            </div>
          )}

          {/* MANUAL */}
          {src.type === "manual" && (
            <div>
              <label className="field-label">JSON Ma'lumot</label>
              <textarea className="field mb8" rows={5} placeholder='[{"sana":"2024-01","savdo":1500,"xarajat":900},...]' value={src.config?.data || ""} onChange={e => updateConfig("data", e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={handleManual}>Saqlash va Yuklash</button>
            </div>
          )}

          {/* DOCUMENT (PDF/Word/TXT) */}
          {src.type === "document" && (
            <div>
              <input ref={docFileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.csv,.md,.log,.rtf" style={{ display: "none" }}
                onChange={e => { if (e.target.files.length) handleDocumentFiles(Array.from(e.target.files)); e.target.value = ""; }} />
              <div className={`drop-zone drop-doc ${drag ? "drag" : ""}`}
                onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleDocumentFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => docFileRef.current?.click()}>
                <div style={{ fontSize: 52, marginBottom: 12, filter: "drop-shadow(0 4px 12px rgba(248,113,113,0.3))" }}>📄</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>Hujjatlarni bu yerga tashlang</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>yoki bosib tanlang</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {["PDF", "DOCX", "TXT", "CSV", "MD"].map(t => (
                    <span key={t} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(248,113,113,0.1)", color: "#F87171", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 600, border: "1px solid rgba(248,113,113,0.15)" }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🤖</span> AI hujjat mazmunini o'qib tahlil qiladi
                </div>
              </div>
              {src.files?.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, background: "var(--s2)", borderRadius: 12, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Yuklangan fayllar ({src.files.length})</div>
                  {src.files.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, padding: "8px 12px", background: "var(--s1)", borderRadius: 8, marginBottom: 4, display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border2)" }}>
                      <span style={{ fontSize: 18 }}>{f.type === 'pdf' ? '📕' : f.type === 'docx' ? '📘' : f.type === 'txt' ? '📝' : '📋'}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>{f.fileName}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 12, background: "rgba(248,113,113,0.1)", color: "#F87171", fontSize: 9, fontFamily: "var(--fh)", fontWeight: 700 }}>{f.type?.toUpperCase()}</span>
                      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fm)" }}>{Math.round((f.size || 0) / 1024)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* IMAGE (Rasm tahlili) */}
          {src.type === "image" && (
            <div>
              <input ref={imgFileRef} type="file" multiple accept="image/*" style={{ display: "none" }}
                onChange={e => { if (e.target.files.length) handleImageFiles(Array.from(e.target.files)); e.target.value = ""; }} />
              <div className={`drop-zone drop-img ${drag ? "drag" : ""}`}
                onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleImageFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => imgFileRef.current?.click()}>
                <div style={{ fontSize: 52, marginBottom: 12, filter: "drop-shadow(0 4px 12px rgba(236,72,153,0.3))" }}>🖼️</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>Rasmlarni bu yerga tashlang</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>yoki bosib tanlang</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {["JPG", "PNG", "GIF", "WebP", "SVG"].map(t => (
                    <span key={t} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(236,72,153,0.1)", color: "#EC4899", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 600, border: "1px solid rgba(236,72,153,0.15)" }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🤖</span> AI rasm mazmunini tavsiflaydi va tahlil qiladi
                </div>
              </div>
              {src.data?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Yuklangan rasmlar ({src.data.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 10 }}>
                    {src.data.slice(0, 12).map((r, i) => (
                      <div key={i} style={{ borderRadius: 12, overflow: "hidden", border: "2px solid var(--border)", aspectRatio: "1", position: "relative", transition: "all .2s", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(236,72,153,0.4)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                        {r.rasm_url ? <img src={r.rasm_url} alt={r.fayl_nomi} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--s2)", fontSize: 24 }}>🖼️</div>}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 6px", background: "linear-gradient(transparent,rgba(0,0,0,0.7))", fontSize: 8, color: "#fff", fontFamily: "var(--fm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.fayl_nomi}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 1C BUXGALTERIYA */}
          {src.type === "onec" && (
            <div>
              <label className="field-label">1C Server URL</label>
              <input className="field mb8" placeholder="http://server:8080/base" value={src.config?.onecUrl || ""} onChange={e => updateConfig("onecUrl", e.target.value)} />
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">Login</label>
                  <input className="field" placeholder="Administrator" value={src.config?.onecLogin || ""} onChange={e => updateConfig("onecLogin", e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">Parol</label>
                  <input className="field" type="password" value={src.config?.onecPassword || ""} onChange={e => updateConfig("onecPassword", e.target.value)} />
                </div>
              </div>
              <div className="notice text-xs text-muted mb8" style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}>
                1C:Enterprise OData API yoqilgan bo'lishi kerak. Sozlamalar → Umumiy → HTTP xizmatlar → OData
              </div>
              <button className="btn btn-primary btn-sm" onClick={handle1CFetch} disabled={loading}>
                {loading ? "Yuklanmoqda..." : "🏦 1C dan yuklash"}
              </button>
            </div>
          )}

          {/* YANDEX METRIKA */}
          {src.type === "yandex" && (
            <div>
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">Counter ID</label>
                  <input className="field" placeholder="12345678" value={src.config?.ymCounter || ""} onChange={e => updateConfig("ymCounter", e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">OAuth Token</label>
                  <input className="field" type="password" placeholder="y0_AgA..." value={src.config?.ymToken || ""} onChange={e => updateConfig("ymToken", e.target.value)} />
                </div>
              </div>
              <div className="notice text-xs text-muted mb8" style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}>
                Token olish: <a href="https://oauth.yandex.com/authorize?response_type=token&client_id=764adcc8e4774061bafdd1e1b1751e82" target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>Yandex OAuth →</a>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleYandexFetch} disabled={loading}>
                {loading ? "Yuklanmoqda..." : "📈 Metrika yuklash"}
              </button>
            </div>
          )}

          {/* SQL DATABASE */}
          {src.type === "database" && (
            <div>
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">DB turi</label>
                  <select className="field" value={src.config?.dbType || "postgresql"} onChange={e => updateConfig("dbType", e.target.value)}>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>
                <div className="f1">
                  <label className="field-label">Host</label>
                  <input className="field" placeholder="localhost" value={src.config?.dbHost || ""} onChange={e => updateConfig("dbHost", e.target.value)} />
                </div>
                <div style={{ width: 80 }}>
                  <label className="field-label">Port</label>
                  <input className="field" placeholder="5432" value={src.config?.dbPort || ""} onChange={e => updateConfig("dbPort", e.target.value)} />
                </div>
              </div>
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">Database</label>
                  <input className="field" placeholder="mydb" value={src.config?.dbName || ""} onChange={e => updateConfig("dbName", e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">Login</label>
                  <input className="field" placeholder="user" value={src.config?.dbUser || ""} onChange={e => updateConfig("dbUser", e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">Parol</label>
                  <input className="field" type="password" value={src.config?.dbPass || ""} onChange={e => updateConfig("dbPass", e.target.value)} />
                </div>
              </div>
              <label className="field-label">SQL Query</label>
              <textarea className="field mb8" rows={3} placeholder="SELECT * FROM sales ORDER BY date DESC LIMIT 100" value={src.config?.dbQuery || ""} onChange={e => updateConfig("dbQuery", e.target.value)} style={{ fontFamily: "var(--fm)", fontSize: 12 }} />
              <div className="notice text-xs text-muted mb8" style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}>
                SQL ulanish backend API orqali ishlaydi. Xavfsizlik uchun to'g'ridan-to'g'ri brauzerdan ulanib bo'lmaydi.
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleDatabaseTest} disabled={loading}>
                {loading ? "Ulanmoqda..." : "🗄️ Ulanish va yuklash"}
              </button>
            </div>
          )}

          {/* Data preview */}
          {src.connected && src.data?.length > 0 && (
            <div className="mt10">
              <div className="divider" />
              <div className="text-xs text-muted mb6">Ko'rinish (dastlabki 5 ta):</div>
              <div className="overflow-x">
                <table className="preview-tbl">
                  <thead>
                    <tr>{Object.keys(src.data[0] || {}).slice(0, 6).map(k => <th key={k}>{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {src.data.slice(0, 5).map((row, i) => (
                      <tr key={i}>{Object.values(row).slice(0, 6).map((v, j) => <td key={j}>{String(v).substring(0, 25)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ WEBSITE TAHLILI ══ */}
      {src.type === "website" && (
        <div className="src-config">
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.6, padding: "8px 10px", background: "rgba(0,201,190,0.06)", borderRadius: 6, border: "1px solid rgba(0,201,190,0.15)" }}>
            🌐 Sayt URL ni kiriting — tizim avtomatik ravishda saytning barcha kontaktlari, mahsulot/xizmatlar, narxlar, ijtimoiy tarmoqlar va SEO ma'lumotlarini yig'ib bazaga saqlaydi.
          </div>

          <label className="field-label">Sayt URL manzili</label>
          <input
            className="field mb8"
            placeholder="https://biznesingiz.uz"
            value={src.config?.siteUrl || ""}
            onChange={e => updateConfig("siteUrl", e.target.value)}
          />

          <div className="flex gap8 mb8" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              id={"deepScan_" + src.id}
              checked={!!src.config?.deepScan}
              onChange={e => updateConfig("deepScan", e.target.checked)}
              style={{ width: 14, height: 14 }}
            />
            <label htmlFor={"deepScan_" + src.id} style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
              Chuqur skanerlash — ichki sahifalarni ham tahlil qilish (uzoqroq, lekin to'liqroq)
            </label>
          </div>

          <div className="flex gap8">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleWebsiteScrape(!!src.config?.deepScan)}
              disabled={loading || !src.config?.siteUrl}
            >
              {loading ? "Tahlil qilinmoqda..." : "🌐 Saytni tahlil qilish"}
            </button>
            {src.connected && (
              <button className="btn btn-sm" onClick={() => handleWebsiteScrape(!!src.config?.deepScan)} disabled={loading} style={{ opacity: 0.7 }}>
                Yangilash
              </button>
            )}
          </div>

          {/* Natija ko'rinishi */}
          {src.connected && src.data?.length > 0 && (() => {
            const summary = src.data.find(d => d._type === "SAYT_STATISTIKA");
            if (!summary) return null;
            return (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--s3)", borderRadius: 8, border: "1px solid rgba(0,201,190,0.15)" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#00C9BE", marginBottom: 8 }}>✓ Tahlil natijalari</div>
                <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.8 }}>
                  {summary.bosh_sahifa_sarlavhasi && <div><b>Sarlavha:</b> {summary.bosh_sahifa_sarlavhasi}</div>}
                  {summary.meta_tavsif && <div><b>Tavsif:</b> {summary.meta_tavsif.substring(0, 100)}...</div>}
                  <div><b>Tahlil qilingan:</b> {summary.tahlil_qilingan_sahifalar} ta sahifa</div>
                  {summary.telefon_raqamlar?.length > 0 && <div><b>Telefon:</b> {summary.telefon_raqamlar.join(", ")}</div>}
                  {summary.email_manzillar?.length > 0 && <div><b>Email:</b> {summary.email_manzillar.join(", ")}</div>}
                  {Object.keys(summary.ijtimoiy_tarmoqlar || {}).length > 0 && (
                    <div><b>Ijtimoiy:</b> {Object.entries(summary.ijtimoiy_tarmoqlar).map(([k, v]) => (
                      <a key={k} href={v} target="_blank" rel="noreferrer" style={{ color: "var(--teal)", marginRight: 8 }}>{k}</a>
                    ))}</div>
                  )}
                  {summary.narxlar_soni > 0 && <div><b>Narxlar:</b> {summary.narxlar_soni} ta ({summary.min_narx?.toLocaleString()} — {summary.max_narx?.toLocaleString()} so'm)</div>}
                  {summary.asosiy_sarlavhalar?.length > 0 && <div><b>Bo'limlar:</b> {summary.asosiy_sarlavhalar.slice(0, 5).join(" · ")}</div>}
                  <div style={{ color: "var(--muted)", marginTop: 4 }}>Yangilangan: {summary.oxirgi_tekshiruv}</div>
                </div>
              </div>
            );
          })()}

          {/* Yopish tugmasi — body oxirida */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(false)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DATA HUB PAGE (Constructor)
// ─────────────────────────────────────────────────────────────

function DataHubPage({ sources, setSources, push, user, orgContext, activeDepartmentId }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(null);
  const [showMoreTypes, setShowMoreTypes] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("var(--teal)");
  // Tanlangan bo'limlar (ko'p tanlash mumkin) — default: faol bo'lim
  const [newDeptIds, setNewDeptIds] = useState(
    activeDepartmentId ? [activeDepartmentId] : []
  );
  // Hammasini ochish/yig'ish — {v: boolean, ts: timestamp} (ts — useEffect trigger uchun)
  const [bulkExpand, setBulkExpand] = useState(null);

  // Faol bo'lim o'zgarsa — yangi manba formasida ham default aktiv bo'lsin
  useEffect(() => {
    if (activeDepartmentId && !newDeptIds.includes(activeDepartmentId)) {
      setNewDeptIds([activeDepartmentId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDepartmentId]);

  const availableDepts = orgContext?.departments || [];

  const SOURCE_COLORS = ["var(--teal)", "var(--green)", "#FF6B35", "#FFD166", "#A855F7", "#FF3366", "#4D9DE0", "var(--gold)", "var(--teal)", "#F72585"];

  const toggleDept = (id) => {
    setNewDeptIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const addSource = () => {
    if (!newType || !newName.trim()) { push("Nomi va turini tanlang", "warn"); return; }
    if (availableDepts.length > 0 && newDeptIds.length === 0) {
      push("Kamida bitta bo'lim tanlang", "warn"); return;
    }

    // ── LIMIT TEKSHIRUV ──
    const isFile = newType === "excel" || newType === "document" || newType === "image";
    const isConnector = !isFile && newType !== "manual";
    const plan = PLANS[user?.plan || "free"];

    if (isFile && !Auth.checkLimit(user, "files", sources)) {
      const info = Auth.getLimitInfo(user, "files", sources);
      push(`Fayl limiti tugadi (${info.label}). Tarifni yangilang.`, "warn");
      return;
    }
    if (isConnector && !Auth.checkLimit(user, "connectors", sources)) {
      const info = Auth.getLimitInfo(user, "connectors", sources);
      push(`Konnector limiti tugadi (${info.label}). Tarifni yangilang.`, "warn");
      return;
    }

    const src = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2),
      type: newType,
      name: newName.trim(),
      color: newColor,
      connected: false,
      active: true,
      data: [],
      config: {},
      department_ids: newDeptIds,
      createdAt: new Date().toLocaleDateString("uz-UZ"),
    };
    const updated = [...sources, src];
    setSources(updated); saveSources(updated, user?.id);
    SourcesAPI.create({
      id: src.id, type: src.type, name: src.name, color: src.color, config: src.config,
      department_ids: newDeptIds,
    }).catch(e => push(e.message || "Manba yaratishda xato", "error"));
    setAdding(false); setNewType(null); setNewName("");
    setNewDeptIds(activeDepartmentId ? [activeDepartmentId] : []);
    push("✓ Yangi manba qo'shildi", "ok");
  };

  const updateSource = (updated) => {
    const list = sources.map(s => s.id === updated.id ? updated : s);
    setSources(list); saveSources(list, user?.id);
    // API ga sinxronlash
    syncSourceToAPI(updated);
  };

  const deleteSource = (id) => {
    const pfx = "u_" + (user?.id || "anon") + "_";
    LS.del(pfx + "src_data_" + id); LS.del(pfx + "src_files_" + id);
    const list = sources.filter(s => s.id !== id);
    setSources(list); saveSources(list, user?.id);
    SourcesAPI.delete(id).catch(() => { });
    push("Manba o'chirildi", "info");
  };

  const connectedSources = sources.filter(s => s.connected && s.active);
  const totalRows = connectedSources.reduce((a, s) => a + (s.data?.length || 0), 0);

  return (
    <div>
      {/* Stats */}
      <div className="g4 mb20">
        {[
          { l: "Jami Manbalar", v: sources.length, c: "var(--teal)", i: "" },
          { l: "Aktiv Manbalar", v: connectedSources.length, c: "var(--green)", i: "✓" },
          { l: "Jami Yozuvlar", v: totalRows.toLocaleString(), c: "var(--gold)", i: "" },
          { l: "Manba Turlari", v: [...new Set(sources.map(s => s.type))].length, c: "var(--purple)", i: "" },
        ].map((c, i) => (
          <div key={i} className="card" style={{ marginBottom: 0 }}>
            <div className="card-title">{c.i} {c.l}</div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 700, color: c.c }}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* Manba qo'shish */}
      {!adding ? (
        <button className="btn btn-primary mb16" onClick={() => setAdding(true)}>+ Yangi Manba Qo'shish</button>
      ) : (
        <div className="add-panel mb16" style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="section-hd" style={{ margin: 0 }}>Manba Turi Tanlang</div>
            <button onClick={() => { setAdding(false); setNewType(null); setNewName(""); }}
              title="Yopish"
              style={{
                background: "var(--s3)", border: "1px solid var(--border)",
                color: "var(--muted)", cursor: "pointer",
                width: 28, height: 28, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--border-hi)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >×</button>
          </div>
          {(() => {
            const primary = ["excel", "sheets", "instagram", "crm", "document", "manual"];
            const secondary = Object.keys(SOURCE_TYPES).filter(k => !primary.includes(k));
            const [showMore, setShowMore2] = [showMoreTypes, setShowMoreTypes];
            const visibleTypes = showMore ? Object.values(SOURCE_TYPES) : primary.map(k => SOURCE_TYPES[k]);
            return (<>
              <div className="type-grid">
                {visibleTypes.map(st => (
                  <div key={st.id} className={`type-card ${newType === st.id ? "selected" : ""}`} onClick={() => setNewType(st.id)}
                    style={newType === st.id ? { borderColor: st.color, background: `${st.color}0F` } : {}}>
                    {newType === st.id && <div style={{ position: "absolute", top: 6, right: 6, width: 14, height: 14, borderRadius: 7, background: st.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#000", fontWeight: 700 }}>✓</div>}
                    <div className="type-card-ico">{st.icon}</div>
                    <div className="type-card-lbl" style={newType === st.id ? { color: st.color } : {}}>{st.label}</div>
                    <div className="type-card-desc">{st.desc}</div>
                  </div>
                ))}
              </div>
              {secondary.length > 0 && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => setShowMoreTypes(v => !v)}
                  style={{ width: "100%", marginTop: 8, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transition: "transform .2s var(--ease)", transform: showMore ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {showMore ? "Kamroq ko'rsat" : `+ Ko'proq manba turlari (${secondary.length} ta)`}
                </button>
              )}
            </>);
          })()}
          {newType && (() => {
            const pickedType = SOURCE_TYPES[newType] || {};
            return (
              <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                {/* Mini "preview" card — tanlangan manba tipini ko'rsatadi */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: `linear-gradient(135deg, ${newColor}12 0%, ${newColor}04 100%)`,
                  border: `1px solid ${newColor}25`,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: newColor + "20", border: `1px solid ${newColor}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20,
                  }}>{pickedType.icon || "📁"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {newName.trim() || pickedType.label || "Yangi manba"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {pickedType.label} · {newDeptIds.length > 0 ? `${newDeptIds.length} bo'lim` : "bo'lim tanlanmagan"}
                    </div>
                  </div>
                </div>

                {/* Nom + rang — alohida bloklar */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                  <div style={{ padding: 14, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
                    <label className="field-label">Manba nomi</label>
                    <input className="field"
                      style={{ fontSize: 13, padding: "10px 14px" }}
                      placeholder={`Masalan: Aprel savdo, Filial 1 CRM`}
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSource()} />
                  </div>
                  <div style={{ padding: 14, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
                    <label className="field-label">Rang</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {SOURCE_COLORS.map(c => (
                        <div key={c}
                          onClick={() => setNewColor(c)}
                          title={c}
                          style={{
                            width: 26, height: 26, borderRadius: 8,
                            background: c, cursor: "pointer",
                            border: newColor === c ? "3px solid var(--text)" : "2px solid transparent",
                            boxShadow: newColor === c ? `0 0 0 2px var(--bg), 0 2px 8px ${c}` : "none",
                            transition: "transform .15s",
                            transform: newColor === c ? "scale(1.05)" : "scale(1)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bo'limlar bloki */}
                {availableDepts.length > 0 ? (
                  <div style={{ padding: 14, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <label className="field-label" style={{ marginBottom: 0 }}>
                        Bo'limlar
                        <span style={{
                          marginLeft: 8,
                          padding: "2px 9px", borderRadius: 10,
                          background: newDeptIds.length === 0 ? "rgba(248,113,133,0.1)" : "rgba(212,168,83,0.1)",
                          color: newDeptIds.length === 0 ? "var(--red)" : "var(--gold)",
                          border: `1px solid ${newDeptIds.length === 0 ? "rgba(248,113,133,0.2)" : "rgba(212,168,83,0.2)"}`,
                          fontSize: 10, fontWeight: 700, textTransform: "none", letterSpacing: 0,
                        }}>
                          {newDeptIds.length} tanlangan
                        </span>
                      </label>
                      {availableDepts.length > 2 && (
                        <button
                          onClick={() => setNewDeptIds(newDeptIds.length === availableDepts.length ? [] : availableDepts.map(d => d.id))}
                          style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: 11, fontFamily: "var(--fh)", fontWeight: 600 }}
                        >
                          {newDeptIds.length === availableDepts.length ? "Hech qaysi" : "Hammasi"}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                      {availableDepts.map(d => {
                        const on = newDeptIds.includes(d.id);
                        const c = d.color || "#6B7280";
                        return (
                          <div key={d.id} onClick={() => toggleDept(d.id)}
                            style={{
                              padding: "10px 12px", borderRadius: 10,
                              border: `1px solid ${on ? c : "var(--border)"}`,
                              background: on ? c + "12" : "var(--s3)",
                              cursor: "pointer", transition: "all .15s",
                              display: "flex", alignItems: "center", gap: 9,
                              boxShadow: on ? `0 2px 8px ${c}20` : "none",
                            }}
                            onMouseEnter={e => { if (!on) e.currentTarget.style.background = c + "08"; }}
                            onMouseLeave={e => { if (!on) e.currentTarget.style.background = "var(--s3)"; }}
                          >
                            <div style={{
                              width: 28, height: 28, borderRadius: 8,
                              background: on ? c + "25" : "var(--s2)",
                              border: `1px solid ${on ? c + "40" : "var(--border)"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 15, flexShrink: 0,
                            }}>{d.icon || "📁"}</div>
                            <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--fh)", fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? c : "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.name}
                            </div>
                            <div style={{
                              width: 18, height: 18, borderRadius: 5,
                              border: `1.5px solid ${on ? c : "var(--border)"}`,
                              background: on ? c : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0, transition: "all .15s",
                            }}>
                              {on && <span style={{ fontSize: 10, color: "#0a0c14", fontWeight: 900 }}>✓</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: 12, borderRadius: 10,
                    background: "rgba(212,168,83,0.06)", border: "1px solid rgba(212,168,83,0.15)",
                    fontSize: 12, color: "var(--gold)", textAlign: "center",
                  }}>
                    ⚠ Avval Jamoam → Bo'limlar bo'limida kamida bitta bo'lim yarating
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                  <button className="btn btn-ghost" onClick={() => { setAdding(false); setNewType(null); setNewName(""); }}>
                    Bekor qilish
                  </button>
                  <button className="btn btn-primary" onClick={addSource}
                    disabled={!newName.trim() || (availableDepts.length > 0 && newDeptIds.length === 0)}>
                    + Manba qo'shish
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Source list */}
      {sources.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}></div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 15, marginBottom: 6 }}>Ma'lumot Manbasi Yo'q</div>
          <div className="text-muted text-sm">"+ Yangi Manba Qo'shish" tugmasini bosing</div>
        </div>
      ) : (
        <>
          {/* Bulk expand/collapse tugmalari */}
          {sources.length > 1 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
              <button className="btn btn-ghost btn-xs"
                onClick={() => setBulkExpand({ v: true, ts: Date.now() })}
                style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                Hammasini ochish
              </button>
              <button className="btn btn-ghost btn-xs"
                onClick={() => setBulkExpand({ v: false, ts: Date.now() })}
                style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                Hammasini yig'ish
              </button>
            </div>
          )}
          {sources.map(src => (
            <SourceItem
              key={src.id}
              src={src}
              onUpdate={updateSource}
              onDelete={deleteSource}
              push={push}
              bulkExpand={bulkExpand}
            />
          ))}
        </>
      )}

      {/* Type summary */}
      {sources.length > 0 && (
        <div className="card mt10">
          <div className="card-title mb12">Manbalar Xaritasi</div>
          <div className="flex gap8" style={{ flexWrap: "wrap" }}>
            {Object.entries(
              sources.reduce((acc, s) => { acc[s.type] = (acc[s.type] || []).concat(s); return acc; }, {})
            ).map(([type, srcs]) => {
              const st = SOURCE_TYPES[type];
              return (
                <div key={type} style={{ padding: "8px 13px", borderRadius: 8, border: `1px solid ${st.color}33`, background: `${st.color}08` }}>
                  <div style={{ color: st.color, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{st.icon} {st.label}</div>
                  {srcs.map(s => (
                    <div key={s.id} style={{ fontSize: 10, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 5, height: 5, borderRadius: 3, background: s.connected ? "var(--green)" : "var(--muted)" }} /> {s.name} {s.connected ? `(${s.data?.length || 0})` : ""}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GAUGE COMPONENT (SVG)
// ─────────────────────────────────────────────────────────────
function GaugeChart({ value = 0, max = 100, label = "", color = "var(--teal)" }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const angle = -135 + pct * 270;
  const r = 55, cx = 90, cy = 75;
  const toXY = (deg) => { const rad = (deg - 90) * Math.PI / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; };
  const start = toXY(-135), end = toXY(angle);
  const large = pct * 270 > 180 ? 1 : 0;
  const startFull = toXY(-135), endFull = toXY(135);
  return (
    <svg viewBox="0 0 180 130" style={{ width: "100%", maxWidth: 220, display: "block", margin: "0 auto" }}>
      {/* Fon arc */}
      <path d={`M ${startFull.x} ${startFull.y} A ${r} ${r} 0 1 1 ${endFull.x} ${endFull.y}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" strokeLinecap="round" />
      {/* Glow effekt */}
      {pct > 0 && <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.15" filter="url(#gaugeGlow)" />}
      {/* Asosiy arc */}
      {pct > 0 && <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />}
      <defs><filter id="gaugeGlow"><feGaussianBlur stdDeviation="4" /></filter></defs>
      {/* Markaziy raqam */}
      <text x={cx} y={cy - 2} textAnchor="middle" fill={color} fontSize="24" fontWeight="800" fontFamily="Space Grotesk,sans-serif">{fmtNum(value)}</text>
      {/* Label */}
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748B" fontSize="9.5" fontFamily="Space Grotesk,sans-serif">{label}</text>
      {/* Min */}
      <text x={cx - 46} y={cy + 34} textAnchor="middle" fill="#475569" fontSize="8.5" fontFamily="Space Grotesk,sans-serif">0</text>
      {/* Foiz */}
      <text x={cx} y={cy + 34} textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{(pct * 100).toFixed(0)}%</text>
      {/* Max */}
      <text x={cx + 46} y={cy + 34} textAnchor="middle" fill="#475569" fontSize="8.5" fontFamily="Space Grotesk,sans-serif">{fmtNum(max)}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// CHARTS PAGE — AI-powered analytics dashboard
// Instagram/Telegram → auto-dashboard
// Boshqa manbalar → foydalanuvchi so'rov yozadi, AI raqamlar hisoblaydi + chartlar qaytaradi
// ─────────────────────────────────────────────────────────────
function ChartsPage({ sources, aiConfig, user, hasPersonalKey, onAiUsed, runBackgroundAI }) {
  const [selectedSrc, setSelectedSrc] = useState(null);
  const [filter, setFilter] = useState("all");
  const [chartOverrides, setChartOverrides] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");

  const connectedSources = sources.filter(s => s.connected && s.active && s.data?.length > 0);
  const workingSource = selectedSrc ? sources.find(s => s.id === selectedSrc) : connectedSources[0];
  const setChartOverride = (cardId, type) => setChartOverrides(prev => ({ ...prev, [cardId]: type }));
  const isSpecialSource = workingSource && (workingSource.type === "instagram" || workingSource.type === "telegram");

  // ── Cache: har bir manba uchun AI kartalarni localStorage da saqlash ──
  const srcId = workingSource?.id || "none";
  const cacheKey = "u_" + (user?.id || "anon") + "_charts_" + srcId;
  const srcIdRef = useRef(srcId);
  const [aiCards, setAiCards] = useState(() => {
    try { return LS.get(cacheKey, []); } catch { return []; }
  });

  // Manba o'zgarganda — YANGI manba cache dan yuklash
  useEffect(() => {
    srcIdRef.current = srcId;
    const key = "u_" + (user?.id || "anon") + "_charts_" + srcId;
    const cached = LS.get(key, []);
    setAiCards(Array.isArray(cached) ? cached : []);
    setAiError("");
    setLastQuery("");
  }, [srcId]);

  // Cache ga yozish — FAQAT joriy manba uchun
  useEffect(() => {
    if (aiCards.length > 0 && srcIdRef.current === srcId) {
      LS.set(cacheKey, aiCards);
    }
  }, [aiCards]);

  // Tayyor so'rovlar (barcha manba turlari uchun)
  const QUICK_CHARTS = useMemo(() => {
    if (!workingSource) return [];
    if (workingSource.type === "instagram") return [
      { icon: "", text: "Post turlari bo'yicha engagement solishtirish: rasm, video, carousel", c: "#E879F9" },
      { icon: "", text: "Eng ko'p like va comment olgan top 10 post tahlili", c: "#F87171" },
      { icon: "", text: "Hafta kunlari bo'yicha post samaradorligi: qaysi kunda ko'proq engagement", c: "#60A5FA" },
      { icon: "", text: "Follower o'sish dinamikasi va engagement rate trendi", c: "#4ADE80" },
      { icon: "", text: "Hashtag va caption tahlili: qaysi hashtaglar ko'proq reach oladi", c: "#FBBF24" },
      { icon: "", text: "Umumiy Instagram statistikasi: postlar, like, comment, reach, engagement rate", c: "#00C9BE" },
    ];
    if (workingSource.type === "telegram") return [
      { icon: "", text: "Kanal o'sish dinamikasi: a'zolar soni, kunlik o'sish trendi", c: "#38BDF8" },
      { icon: "", text: "Post ko'rishlar tahlili: o'rtacha, eng yuqori, eng past ko'rishlar", c: "#4ADE80" },
      { icon: "", text: "Kontent turi bo'yicha samaradorlik: matn, rasm, video, forward", c: "#E879F9" },
      { icon: "", text: "Faollik vaqti: qaysi soatlarda ko'proq ko'rish va reaksiya", c: "#FBBF24" },
      { icon: "", text: "Umumiy kanal statistikasi: a'zolar, postlar, ko'rishlar, o'sish %", c: "#00C9BE" },
    ];
    if (workingSource.type === "crm") return [
      { icon: "", text: "O'quv markaz umumiy ko'rsatkichlari: lidlar, guruhlar, o'quvchilar, o'qituvchilar, daromad, maosh", c: "#8B5CF6" },
      { icon: "", text: "Moliyaviy tahlil: daromad, maosh xarajati, foyda foizi, guruh narxlari, top daromadli guruhlar", c: "#4ADE80" },
      { icon: "", text: "Lidlar pipeline tahlili: qaysi bosqichda nechta lid, kunlik yangi lidlar trendi, konversiya", c: "#F87171" },
      { icon: "", text: "Guruhlar to'liqligi: har bir guruhda nechta o'quvchi, to'la/bo'sh guruhlar, filial bo'yicha", c: "#60A5FA" },
      { icon: "", text: "O'qituvchilar yuklama: nechtadan guruh, maosh, samaradorlik, fan bo'yicha taqsimot", c: "#FBBF24" },
      { icon: "", text: "Filiallar solishtirma: o'quvchi soni, guruh soni, daromad, o'qituvchilar — har bir filial", c: "#A78BFA" },
      { icon: "", text: "O'quvchilar demografi: jinsi, yoshi, fanlar bo'yicha, ko'p guruhli o'quvchilar", c: "#E879F9" },
      { icon: "", text: "O'sish tendensiyasi: kunlik yangi lidlar, o'quvchilar qo'shilish dinamikasi", c: "#00C9BE" },
    ];
    return [
      { icon: "", text: "Umumiy statistika: jami, o'rtacha, min, max", c: "#00C9BE" },
      { icon: "", text: "Trend: vaqt bo'yicha o'sish yoki pasayish", c: "#4ADE80" },
      { icon: "", text: "Top ko'rsatkichlar: eng yuqori, reyting", c: "#FBBF24" },
      { icon: "", text: "Solishtirish: kategoriyalar bo'yicha", c: "#60A5FA" },
      { icon: "", text: "Prognoz: kelgusi 30 kun uchun bashorat", c: "#A78BFA" },
      { icon: "", text: "Solishtirish: bu oyni o'tgan oy bilan taqqosla", c: "#EC4899" },
    ];
  }, [workingSource?.id, workingSource?.type]);

  // Source type ga qarab aqlli agregatsiya konteksti
  const buildChartContext = (source) => {
    const data = source.data || [];
    if (!data.length) return { ctx: "", meta: {} };
    const tp = source.type || "generic";

    const f = (n) => { n = Number(n)||0; return n>=1e9?(n/1e9).toFixed(1)+"B":n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(Math.round(n)); };
    const sh = (v, n=18) => String(v??"-").replace(/\s+/g," ").slice(0,n);
    const numVals = (arr, col) => arr.map(r=>parseFloat(r[col])).filter(v=>!isNaN(v)&&v>=0);
    const stats = (vals) => { if(!vals.length) return null; const sum=vals.reduce((a,b)=>a+b,0); return {sum,avg:sum/vals.length,max:Math.max(...vals),min:Math.min(...vals),n:vals.length}; };
    const topCnt = (arr, col, n=7) => { const c={}; arr.forEach(r=>{const v=sh(r[col]);if(v&&v!=="-"&&v!=="null"&&v!=="undefined")c[v]=(c[v]||0)+1;}); return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n); };
    const topSum = (arr, catCol, numCol, n=7) => { const c={}; arr.forEach(r=>{const k=sh(r[catCol]);const v=parseFloat(r[numCol]);if(k&&k!=="-"&&k!=="null"&&!isNaN(v)&&v>=0)c[k]=(c[k]||0)+v;}); return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n); };
    const monthTrend = (arr, dateCol, valFn, n=8) => { const m={}; arr.forEach(r=>{const d=String(r[dateCol]||"").slice(0,7);if(/^\d{4}-\d{2}$/.test(d)){if(!m[d])m[d]=0;m[d]+=valFn(r);}}); return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).slice(-n); };
    const cap = (s) => s.length>3500?s.slice(0,3500)+"\n...[qisqartirildi]":s;

    // ── INSTAGRAM ──
    if (tp === "instagram") {
      const profile = data.find(d=>d._type==="PROFIL_STATISTIKA")||{};
      const posts = data.filter(d=>!d._type&&!d._entity).slice(0,60);
      const L = [`INSTAGRAM: "@${source.profileName||source.name}" | ${posts.length} post`];
      if (profile.followers) L.push(`Followers:${f(profile.followers)} | Following:${f(profile.following||0)} | Media:${f(profile.media_count||posts.length)}`);
      if (posts.length) {
        const lk = numVals(posts,"like_count"); const cm = numVals(posts,"comments_count"); const vw = numVals(posts.filter(p=>p.video_views>0),"video_views");
        const sl = stats(lk); const sc = stats(cm); const sv = stats(vw);
        L.push(`\nPOST METRIKALAR (${posts.length} ta):`);
        if(sl) L.push(`Like: jami=${f(sl.sum)} | o'rtacha=${f(sl.avg)} | max=${f(sl.max)}`);
        if(sc) L.push(`Comment: jami=${f(sc.sum)} | o'rtacha=${f(sc.avg)} | max=${f(sc.max)}`);
        if(sv) L.push(`Views: jami=${f(sv.sum)} | o'rtacha=${f(sv.avg)} | max=${f(sv.max)}`);
        const top7 = [...posts].map(p=>({...p,eng:(p.like_count||0)+(p.comments_count||0)})).sort((a,b)=>b.eng-a.eng).slice(0,7);
        L.push(`\nTOP 7 POST:`);
        top7.forEach((p,i)=>L.push(`${i+1}. like=${f(p.like_count||0)} comment=${f(p.comments_count||0)} | "${sh(p.caption||"",25)}" | ${String(p.timestamp||"").slice(0,10)}`));
        const mTrend = monthTrend(posts,"timestamp",p=>(p.like_count||0)+(p.comments_count||0));
        if(mTrend.length>1){L.push(`\nOYLIK ENGAGEMENT TREND:`);L.push(mTrend.map(([m,v])=>`${m.slice(5)}=${f(v)}`).join(" | "));}
        const mPost = monthTrend(posts,"timestamp",()=>1);
        if(mPost.length>1) L.push(`Post soni: ${mPost.map(([m,v])=>`${m.slice(5)}=${v}`).join(" | ")}`);
        const types={}; posts.forEach(p=>{const t=p.media_type||"IMAGE";types[t]=(types[t]||0)+1;});
        if(Object.keys(types).length>1) L.push(`Media turi: ${Object.entries(types).map(([k,v])=>`${k}=${v}`).join(", ")}`);
      }
      return { ctx:cap(L.join("\n")), meta:{type:"instagram"} };
    }

    // ── TELEGRAM ──
    if (tp === "telegram") {
      const chStat = data.find(d=>d._type==="KANAL_STATISTIKA")||{};
      const posts = data.filter(d=>!d._type&&!d._entity).slice(0,60);
      const L = [`TELEGRAM: "${source.name||source.profileName}"`];
      const subs = chStat.subscribers||chStat.members_count||chStat.members;
      if(subs) L.push(`Obunachi: ${f(subs)}`);
      if(posts.length){
        const vw=numVals(posts,"views"); const rc=numVals(posts,"reactions");
        const sv=stats(vw); const sr=stats(rc);
        L.push(`\nPOST METRIKALAR (${posts.length} ta):`);
        if(sv) L.push(`Views: jami=${f(sv.sum)} | o'rtacha=${f(sv.avg)} | max=${f(sv.max)}`);
        if(sr) L.push(`Reactions: jami=${f(sr.sum)} | o'rtacha=${f(sr.avg)} | max=${f(sr.max)}`);
        const top7=[...posts].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,7);
        L.push(`\nTOP 7 POST (views):`);
        top7.forEach((p,i)=>L.push(`${i+1}. views=${f(p.views||0)} reactions=${f(p.reactions||0)} | "${sh(p.text||p.message||"",25)}" | ${String(p.date||"").slice(0,10)}`));
        const mTrend=monthTrend(posts,"date",p=>p.views||0);
        if(mTrend.length>1){L.push(`\nOYLIK VIEWS TREND:`);L.push(mTrend.map(([m,v])=>`${m.slice(5)}=${f(v)}`).join(" | "));}
        const mPost=monthTrend(posts,"date",()=>1);
        if(mPost.length>1) L.push(`Post soni: ${mPost.map(([m,v])=>`${m.slice(5)}=${v}`).join(" | ")}`);
      }
      return { ctx:cap(L.join("\n")), meta:{type:"telegram"} };
    }

    // ── CRM ──
    if (tp === "crm") {
      const summary = data.find(d=>d._type==="CRM_STATISTIKA")||{};
      const students = data.filter(d=>d._entity==="student");
      const groups   = data.filter(d=>d._entity==="group");
      const teachers = data.filter(d=>d._entity==="teacher");
      const leads    = data.filter(d=>d._entity==="lid");
      const L = [`CRM: "${source.name}" | o'quvchi:${students.length} guruh:${groups.length} o'qituvchi:${teachers.length} lid:${leads.length}`];
      const smKeys = Object.keys(summary).filter(k=>!["_type","id","_id"].includes(k)&&summary[k]!=null);
      if(smKeys.length) L.push(`Umumiy: ${smKeys.slice(0,8).map(k=>`${k}=${f(summary[k])}`).join(" | ")}`);
      if(students.length){
        L.push(`\nO'QUVCHILAR (${students.length}):`);
        const bySt=topCnt(students,"status"); if(bySt.length) L.push(`Status: ${bySt.map(([k,v])=>`${k}=${v}`).join(" | ")}`);
        const byTe=topCnt(students,"teacher"||"o_qituvchi"); if(byTe.length) L.push(`O'qituvchi: ${byTe.map(([k,v])=>`${k}=${v}`).join(" | ")}`);
        const byGr=topCnt(students,"group"||"guruh"); if(byGr.length) L.push(`Guruh: ${byGr.map(([k,v])=>`${k}=${v}`).join(" | ")}`);
        const payCol=["payment","to'lov","summa","amount"].find(c=>students[0]?.[c]!=null);
        if(payCol){const ps=stats(numVals(students,payCol));if(ps)L.push(`To'lov: jami=${f(ps.sum)} | o'rtacha=${f(ps.avg)}`);}
        const dateCol=["created_at","sana","date"].find(c=>students[0]?.[c]!=null);
        if(dateCol){const mT=monthTrend(students,dateCol,()=>1);if(mT.length>1)L.push(`Oylik qabul: ${mT.map(([m,v])=>`${m.slice(5)}=${v}`).join(" | ")}`);}
      }
      if(groups.length){
        L.push(`\nGURUHLAR (${groups.length}):`);
        const bySt=topCnt(groups,"status"); if(bySt.length) L.push(`Status: ${bySt.map(([k,v])=>`${k}=${v}`).join(" | ")}`);
        const byTe=topCnt(groups,"teacher"||"teacher_name"); if(byTe.length) L.push(`O'qituvchi: ${byTe.map(([k,v])=>`${k}=${v}`).join(" | ")}`);
      }
      if(leads.length){
        L.push(`\nLIDLAR (${leads.length}):`);
        const bySt=topCnt(leads,"status"); if(bySt.length) L.push(`Holat: ${bySt.map(([k,v])=>`${k}=${v}`).join(" | ")}`);
        const dateLead=["created_at","sana","date"].find(c=>leads[0]?.[c]!=null);
        if(dateLead){const mT=monthTrend(leads,dateLead,()=>1);if(mT.length>1)L.push(`Oylik lid: ${mT.map(([m,v])=>`${m.slice(5)}=${v}`).join(" | ")}`);}
      }
      return { ctx:cap(L.join("\n")), meta:{type:"crm",students:students.length,groups:groups.length,leads:leads.length} };
    }

    // ── GENERIC (Sheets / Excel / CSV / Document) ──
    const SKIP = new Set(["id","_id","_type","_entity","webhook_url","source_id","__v","token","password"]);
    const firstRow = data.find(r=>typeof r==="object"&&r!==null)||{};
    const allCols = Object.keys(firstRow).filter(k=>!SKIP.has(k));

    // Excel/Sheets fayl tuzilmasi (sheet metadata) ni aniqla
    const FILE_META = new Set(["row_count","rows","is_hidden","sheet_name","sheet_index","header_rows","column_count"]);
    const metaHit = allCols.filter(c=>FILE_META.has(c.toLowerCase())).length;
    if (metaHit >= 2) return { ctx:"", meta:{ isFileMeta:true, sheetNames: data.map(r=>r.sheet_name||r.list_nomi||"").filter(Boolean).slice(0,24) } };

    const numCols=[], dateCols=[], catCols=[];
    allCols.forEach(col=>{
      const vals=data.slice(0,100).map(r=>r[col]).filter(v=>v!=null&&v!=="");
      if(!vals.length) return;
      const isDate=vals.filter(v=>/\d{4}-\d{2}/.test(String(v))).length>vals.length*0.5;
      const isNum=vals.filter(v=>!isNaN(parseFloat(v))&&isFinite(String(v))).length>vals.length*0.6;
      if(isDate) dateCols.push(col);
      else if(isNum) numCols.push(col);
      else catCols.push(col);
    });
    const L=[];
    L.push(`MANBA: "${source.name}" | ${data.length} yozuv | ustunlar:[${allCols.slice(0,10).join(",")}]`);
    L.push(`Raqamli:[${numCols.join(",")}] | Sana:[${dateCols.join(",")}] | Kategoriya:[${catCols.join(",")}]`);
    L.push("");
    if(numCols.length){
      L.push("## RAQAMLI STATISTIKA:");
      numCols.slice(0,5).forEach(col=>{const st=stats(numVals(data,col));if(st)L.push(`${col}: jami=${f(st.sum)} | o'rtacha=${f(st.avg)} | max=${f(st.max)} | min=${f(st.min)} | n=${st.n}`);});
      L.push("");
    }
    if(catCols.length){
      L.push("## KATEGORIYA TAQSIMOTI:");
      catCols.slice(0,3).forEach(col=>{const top=topCnt(data,col);if(top.length>1)L.push(`${col}: ${top.map(([k,v])=>`${k}=${v}`).join(" | ")}`);});
      L.push("");
    }
    if(catCols.length&&numCols.length){
      L.push("## KATEGORIYA × RAQAM (bar chart):");
      catCols.slice(0,2).forEach(cc=>numCols.slice(0,2).forEach(nc=>{const top=topSum(data,cc,nc);if(top.length>1)L.push(`${cc}→${nc}: ${top.map(([k,v])=>`${k}=${f(v)}`).join(" | ")}`); }));
      L.push("");
    }
    if(dateCols.length&&numCols.length){
      L.push("## OYLIK TREND:");
      const dc=dateCols[0];
      numCols.slice(0,2).forEach(nc=>{const tr=monthTrend(data,dc,r=>parseFloat(r[nc])||0);if(tr.length>1)L.push(`${nc}: ${tr.map(([m,v])=>`${m.slice(5)}=${f(v)}`).join(" | ")}`);});
      const mCnt=monthTrend(data,dc,()=>1);if(mCnt.length>1)L.push(`yozuv_soni: ${mCnt.map(([m,v])=>`${m.slice(5)}=${v}`).join(" | ")}`);
      L.push("");
    }
    const raw=L.join("\n");
    return { ctx:cap(raw), meta:{numCols,dateCols,catCols,total:data.length,type:"generic"} };
  };

  // Avtomatik chart generatsiya
  const autoGenerateCharts = async () => { await runAiCharts("__auto__"); };

  // AI CHART GENERATSIYA
  const runAiCharts = async (queryText) => {
    const isAuto = queryText === "__auto__";
    const query = isAuto ? "" : (queryText || userQuery);
    if (!isAuto && !query.trim()) return;
    if (!workingSource?.data?.length) return;

    if (!hasPersonalKey && user && !Auth.checkLimit(user, "ai_requests", sources)) {
      const info = Auth.getLimitInfo(user, "ai_requests", sources);
      setAiError(`AI so'rov limiti tugadi (${info.label}). Tarifni yangilang yoki shaxsiy API kalit ulang.`);
      return;
    }
    setAiLoading(true); setAiError(""); setLastQuery(query || "Avtomatik tahlil");

    try {
      // Foydalanuvchi so'rovi bo'lsa — backend sheet ma'lumotlaridan qidiradi (RAG)
      // Auto rejim bo'lsa — hisoblangan aggregatsiya ishlatiladi
      let ctx = "";
      let meta = {};

      if (!isAuto && Token.get()) {
        try {
          const r = await SourcesAPI.getAiContext(workingSource.id, query);
          if (r?.context) { ctx = r.context; }
        } catch (e) { console.warn("[CHART-CTX]", e.message); }
      }

      // getAiContext ishlamasa yoki auto rejim — aggregatsiya
      if (!ctx) {
        const built = buildChartContext(workingSource);
        ctx = built.ctx;
        meta = built.meta;
      }

      // Excel fayl tuzilmasi aniqlandi — foydalanuvchiga yo'naltirish
      if (meta.isFileMeta) {
        const sheets = meta.sheetNames?.length ? `\n\nMavjud varaqlar: ${meta.sheetNames.map(s=>`"${s}"`).join(", ")}` : "";
        setAiError(`📊 Bu manba Excel fayl tuzilmasini ko'rsatmoqda (sheet ro'yxati — nechta qator, yashirin yoki yo'q).${sheets}\n\n💡 Haqiqiy biznes ma'lumotlari uchun quyidagi qidiruv maydoniga murojaat qiling:\n• "Kassa I oylik daromad trend"\n• "Guruh bo'yicha o'quvchilar soni"\n• "Umumiy savdo statistikasi"`);
        setAiLoading(false);
        return;
      }

      // Qattiq chek — token limit uchun
      if (ctx.length > 3500) ctx = ctx.slice(0, 3500) + "\n...[qisqartirildi]";

      const hasNum  = meta.numCols?.length > 0;
      const hasCat  = meta.catCols?.length > 0;
      const hasDate = meta.dateCols?.length > 0;

      const autoRules = `VAZIFA: Quyidagi qoidalarga amal qilib chart yarat (faqat mavjud ma'lumot uchun):
${hasNum  ? "✅ Raqamli ma'lumot bor → STATS karta (jami, o'rtacha, max, min — haqiqiy raqamlar)" : ""}
${hasCat && hasNum ? "✅ Kategoriya × Raqam bor → BAR chart (top-7 kategoriya)" : ""}
${hasDate && hasNum ? "✅ Oylik trend bor → LINE yoki AREA chart" : ""}
${hasCat ? "✅ Kategoriya taqsimoti bor → PIE chart" : ""}
✅ Oxirida → HIGHLIGHT karta (3-5 ta muhim xulosa + 1 ta tavsiya)

Agar biror ma'lumot YO'Q bo'lsa — o'sha chart turini CHIQARMA.`;

      const userQueryRule = `VAZIFA: Foydalanuvchi so'rovi: "${query}"

So'rovni tahlil qil:
- Oddiy savol ("nechta", "jami", "qancha") → FAQAT 1 ta stats karta
- Tahlil so'rovi ("trend", "o'sish", "taqqoslash") → 1-2 chart + stats
- Umumiy tahlil → stats + 1-2 chart + highlight
Ortiqcha chart YARATMA — faqat so'ralganini qaytar.`;

      const prompt = `Sen professional biznes tahlilchisan. Quyidagi HISOBLANGAN statistika asosida vizual chartlar tayyorla.

${ctx}

${isAuto ? autoRules : userQueryRule}

MUHIM QOIDALAR:
1. Faqat yuqoridagi MA'LUMOTDAGI raqamlarni ishlatasan — O'YLAB CHIQARMA
2. Har chart uchun "analysis" — biznes insight: trend + sabab + tavsiya (masalan: "📈 Mart +34% — bahor mavsumi ta'siri, shu yo'nalishni kuchaytiring")
3. Stats kartasida "analysis" — eng muhim raqamni sharhlash + 1 ta amaliy qaror
4. Highlight kartasida har "v" — konkret raqam + ta'sir + nima qilish kerak
5. MANFIY raqam → 0 yoz
6. Raqam formati: 1500000→"1.5M", 1500→"1.5K", 150→"150"
7. Chart sarlavhasi ANIQ: "Menejer bo'yicha savdo" (EMAS: "Tahlil", "Dinamika")
8. JSON keys ANIQ: ["savdo_sum"] (EMAS: ["qiymat","value","data"])
9. Texnik ustunlar (id, _id, webhook_url) → IGNOR

JSON SCHEMA (FAQAT JSON qaytarasan, boshqa hech narsa yozma):
{"cards":[
{"type":"stats","title":"Sarlavha","icon":"📊","analysis":"insight...","stats":[{"l":"Ko'rsatkich","v":"1.2M","c":"#00C9BE","i":"📈"},{"l":"O'rtacha","v":"36K","c":"#E8B84B","i":"📊"}]},
{"type":"chart","title":"Sarlavha","icon":"📊","chartType":"bar","analysis":"insight...","data":[{"name":"Kat","savdo":100}],"keys":["savdo"],"xKey":"name","colors":["#00C9BE","#E8B84B","#A78BFA","#4ADE80","#F87171","#60A5FA","#FB923C"]},
{"type":"chart","title":"Sarlavha","icon":"📈","chartType":"line","analysis":"insight...","data":[{"name":"01","daromad":500}],"keys":["daromad"],"xKey":"name","colors":["#00C9BE"]},
{"type":"chart","title":"Sarlavha","icon":"🥧","chartType":"pie","analysis":"insight...","data":[{"name":"Kat","value":50}],"colors":["#00C9BE","#E8B84B","#A78BFA","#4ADE80","#F87171","#60A5FA"]},
{"type":"highlight","title":"Xulosa va Amaliy Qarorlar","icon":"💡","items":[{"l":"🟢 Kuchli tomon","v":"[raqam] — sababi nima","c":"#00C9BE"},{"l":"🔴 Muammo","v":"[raqam] — ta'sir: XM so'm","c":"#F87171"},{"l":"💡 Qaror 1","v":"[Aniq harakat] → [Kutilgan natija]","c":"#4ADE80"},{"l":"💡 Qaror 2","v":"[Aniq harakat] → [muddat]","c":"#A78BFA"}]}
]}`;

      // Backend orqali AI chaqiruv (CORS/network muammolarini oldini olish)
      const curCacheKey = cacheKey;
      let result = "";
      if (Token.get()) {
        const resp = await fetch("/api/ai/complete", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": `Bearer ${Token.get()}` },
          body: JSON.stringify({ prompt }),
        });
        const text = await resp.text();
        let d;
        try { d = JSON.parse(text); } catch { throw new Error(`Server xato (${resp.status}). AI javob qaytarmadi — qayta urinib ko'ring.`); }
        if (!resp.ok) throw new Error(d.error || `Server xato ${resp.status}`);
        result = d.result || "";
      } else {
        await callAI([{ role: "user", content: prompt }], aiConfig, (chunk) => { result = chunk; });
      }

      // JSON parse + validatsiya (markdown blok, qisman javob ham ishlaydi)
      let parsed = null;
      const stripped = result.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch {
          // Kesilgan JSON — oxirgi to'liq ] gacha qisqartirib urinish
          const fixed = jsonMatch[0].replace(/,\s*$/, '').replace(/,\s*\]/, ']');
          try { parsed = JSON.parse(fixed + (fixed.endsWith('}') ? '' : ']}') ); } catch {}
        }
      }
      if (!parsed) throw new Error("AI javob noto'g'ri formatda qaytdi. Qayta urinib ko'ring.");
      const rawCards = parsed.cards || [];

      if (rawCards.length === 0) throw new Error("AI hech qanday chart yarata olmadi. Manba ma'lumotlarini tekshiring.");

      const cards = rawCards.map((c, i) => {
        const card = { ...c, id: `ai_${Date.now()}_${i}` };
        if (card.stats) card.stats = card.stats.map(s => {
          const num = parseFloat(String(s.v).replace(/[^0-9.-]/g, ""));
          if (!isNaN(num) && num < 0) return { ...s, v: "0" };
          return s;
        });
        if (card.data && card.type === "chart") {
          card.data = card.data.map(row => {
            const clean = { ...row };
            Object.keys(clean).forEach(k => {
              if (k !== "name" && k !== "xKey" && typeof clean[k] === "number" && clean[k] < 0) clean[k] = 0;
            });
            return clean;
          });
        }
        return card;
      }).filter(c => {
        if (!c.type) return false;
        if (c.type === "stats" && (!Array.isArray(c.stats) || c.stats.length === 0)) return false;
        if (c.type === "chart") {
          if (!Array.isArray(c.data) || c.data.length === 0) return false;
          if (c.chartType === "pie" && !c.data.every(d => d.value != null || d.name != null)) return false;
          if (["bar", "line", "area", "stackedbar"].includes(c.chartType) && (!Array.isArray(c.keys) || c.keys.length === 0)) return false;
          if (c.chartType !== "pie") {
            const k = c.keys?.[0];
            if (k && c.data.every(d => isNaN(parseFloat(d[k])))) return false;
          }
        }
        if (c.type === "highlight" && (!Array.isArray(c.items) || c.items.length === 0)) return false;
        if (c.type === "gauge" && (c.value == null || isNaN(c.value))) return false;
        return true;
      });

      if (!cards.length) throw new Error("Yaratilgan chartlar validatsiyadan o'tmadi. Qayta urinib ko'ring.");

      const prev = LS.get(curCacheKey, []);
      const updated = [...cards, ...(Array.isArray(prev) ? prev : [])];
      LS.set(curCacheKey, updated);
      setAiCards(updated);

      if (!hasPersonalKey && user && onAiUsed) onAiUsed();
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("exceeded")) {
        setAiError("⚠️ " + (aiConfig.provider === "gemini" ? "Gemini" : aiConfig.provider) + " quota limiti tugadi. Sozlamalar → boshqa provayder tanlang (DeepSeek yoki Claude tavsiya etiladi).");
      } else if (msg.includes("401") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("unauthorized")) {
        setAiError("🔑 API kalit noto'g'ri. Sozlamalar → API kalitni tekshiring.");
      } else {
        setAiError(msg || "AI tahlil xatosi. Qayta urinib ko'ring.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  // Instagram/Telegram uchun avvalgi auto-dashboard
  const specialCards = useMemo(() => {
    if (!workingSource || !isSpecialSource) return [];
    return generateDashboards(workingSource);
  }, [workingSource?.id, workingSource?.data?.length, workingSource?.updatedAt, isSpecialSource]);

  // Instagram/Telegram: avval auto-dashboard, keyin AI yaratganlar. Boshqalar: faqat AI
  const allCards = useMemo(() => isSpecialSource ? [...specialCards, ...aiCards] : aiCards, [isSpecialSource, specialCards, aiCards]);

  // Jadval uchun data
  const tableData = useMemo(() => {
    if (!workingSource?.data?.length) return [];
    return workingSource.data.filter(d => !d._type && !d.webhook_url);
  }, [workingSource?.id, workingSource?.data?.length]);

  const [chartTypeFilter, setChartTypeFilter] = useState("all");
  const CHART_TYPE_FILTERS = [
    { id: "all", l: "Hammasi" },
    { id: "line", l: "📈 Trend" },
    { id: "bar", l: "📊 Bar" },
    { id: "pie", l: "🥧 Donut" },
    { id: "area", l: "📉 Area" },
    { id: "stats", l: "🔢 KPI" },
    { id: "highlight", l: "💡 Xulosa" },
  ];

  const filteredByType = chartTypeFilter === "all" ? allCards
    : chartTypeFilter === "stats" ? allCards.filter(c => c.type === "stats" || c.type === "gauge")
    : chartTypeFilter === "highlight" ? allCards.filter(c => c.type === "highlight")
    : allCards.filter(c => c.type === "chart" && c.chartType === chartTypeFilter);

  const filteredCards = filter === "table" ? allCards : filteredByType;
  const filters = [
    { id: "all", l: "Hammasi", count: allCards.length },
    { id: "chart", l: "Grafiklar", count: allCards.filter(c => c.type === "chart").length },
    { id: "stats", l: "Statistika", count: allCards.filter(c => c.type === "stats" || c.type === "highlight" || c.type === "gauge").length },
  ].filter(f => f.count > 0 || f.id === "all");

  if (!connectedSources.length) return (
    <div className="card" style={{ textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}></div>
      <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Grafiklar avtomatik yaratiladi</div>
      <div className="text-muted text-sm">Data Hub dan manba ulang — Excel, Instagram, Telegram yoki API</div>
    </div>
  );

  return (
    <div>
      {/* ── HEADER: Manba tabs + Yangilash tugma ── */}
      <div className="flex aic jb mb12 flex-wrap gap8">
        <div className="flex gap6 aic flex-wrap">
          <span className="text-xs text-muted" style={{ fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2 }}>Manba:</span>
          {connectedSources.map(s => {
            const st = SOURCE_TYPES[s.type];
            const active = workingSource?.id === s.id;
            return (
              <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { setSelectedSrc(s.id); setChartOverrides({}); setFilter("all"); setChartTypeFilter("all"); }}
                style={active ? { borderColor: s.color || st.color, color: s.color || st.color, background: `${s.color || st.color}12`, fontWeight: 700 } : {}}>
                {st.icon} {s.name}
                <span className="badge b-ok" style={{ fontSize: 8, marginLeft: 4, background: active ? `${s.color || st.color}25` : undefined }}>{s.data?.length}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap8 aic">
          {aiCards.length > 0 && (
            <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
              onClick={() => { if (confirm("Barcha chartlarni tozalash?")) { setAiCards([]); LS.del(cacheKey); } }}>
              🗑 Tozalash
            </button>
          )}
          <button className="btn btn-primary" onClick={autoGenerateCharts}
            disabled={aiLoading || !workingSource}
            style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            {aiLoading ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Tahlil...</> : "🔄 Yangilash"}
          </button>
        </div>
      </div>

      {/* ── AI SO'ROV: qo'shimcha savol ── */}
      {workingSource && (
        <div className="mb12" style={{ background: "var(--s1)", border: "1px solid rgba(0,201,190,0.1)", borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="field f1" placeholder="Qo'shimcha grafik so'rash: masalan 'Top 10 mijoz bar chart'"
              value={userQuery} onChange={e => setUserQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !aiLoading) runAiCharts(); }}
              disabled={aiLoading} style={{ fontSize: 11, padding: "8px 12px" }} />
            <button className="btn btn-primary" onClick={() => runAiCharts()} disabled={aiLoading || !userQuery.trim() || !aiConfig?.apiKey}
              style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
              {aiLoading ? "..." : "➕ Qo'shish"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }} className="hide-scroll">
            {QUICK_CHARTS.map((q, i) => (
              <button key={i} onClick={() => { setUserQuery(q.text); runAiCharts(q.text); }} disabled={aiLoading}
                style={{ background: `${q.c}08`, border: `1px solid ${q.c}22`, borderRadius: 7, padding: "4px 10px", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 9.5, color: q.c, whiteSpace: "nowrap", flexShrink: 0, fontWeight: 600, transition: "all .15s" }}
                onMouseEnter={e => { if (!aiLoading) { e.currentTarget.style.borderColor = q.c + "55"; e.currentTarget.style.background = q.c + "16"; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = q.c + "22"; e.currentTarget.style.background = q.c + "08"; }}>
                {q.text.length > 35 ? q.text.substring(0, 33) + "…" : q.text}
              </button>
            ))}
          </div>
          {!aiConfig?.apiKey && <div className="text-muted" style={{ fontSize: 10, marginTop: 6 }}>⚠️ AI ulangan emas. Sozlamalar → API kalit.</div>}
          {aiError && <div style={{ color: "var(--red)", fontSize: 10, marginTop: 6 }}>❌ {aiError}</div>}
        </div>
      )}

      {/* ── LOADING ── */}
      <AiProgressBar loading={aiLoading} />

      {/* ── CHART TYPE FILTER ── */}
      {allCards.length > 0 && (
        <div className="flex gap5 mb12 flex-wrap aic">
          {CHART_TYPE_FILTERS.map(f => {
            const count = f.id === "all" ? allCards.length
              : f.id === "stats" ? allCards.filter(c => c.type === "stats" || c.type === "gauge").length
              : f.id === "highlight" ? allCards.filter(c => c.type === "highlight").length
              : allCards.filter(c => c.type === "chart" && c.chartType === f.id).length;
            if (f.id !== "all" && count === 0) return null;
            const active = chartTypeFilter === f.id;
            return (
              <button key={f.id} className="btn btn-ghost btn-sm" onClick={() => setChartTypeFilter(f.id)}
                style={active ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.08)", fontWeight: 700 } : { fontSize: 11 }}>
                {f.l} {count > 0 && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>{count}</span>}
              </button>
            );
          })}
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setFilter(filter === "table" ? "all" : "table")}
            style={filter === "table" ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.08)" } : {}}>
            📋 Jadval
          </button>
        </div>
      )}

      {/* ── JADVAL ── */}
      {filter === "table" && tableData.length > 0 && (
        <div className="card">
          <div className="card-title mb12">📋 Jadval — {workingSource?.name} ({tableData.length} qator)</div>
          <div className="overflow-x">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>{Object.keys(tableData[0] || {}).map(k => <th key={k} style={{ padding: "7px 12px", textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap", background: "var(--s2)" }}>{k}</th>)}</tr></thead>
              <tbody>{tableData.slice(0, 50).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  {Object.values(row).map((v, j) => <td key={j} style={{ padding: "6px 12px", borderBottom: "1px solid rgba(0,201,190,0.04)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "").substring(0, 40)}</td>)}
                </tr>
              ))}</tbody>
            </table>
            {tableData.length > 50 && <div className="text-muted text-xs mt8" style={{ textAlign: "center" }}>... va yana {tableData.length - 50} ta qator</div>}
          </div>
        </div>
      )}

      {/* ── CHARTLAR GRID ── */}
      {filter !== "table" && filteredCards.length > 0 && (
        <CardGrid cards={filteredCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride}
          layoutKey={"u_" + (user?.id || "anon") + "_layout_charts_" + (workingSource?.id || "")}
          onDeleteCard={(id) => { const updated = aiCards.filter(c => c.id !== id); setAiCards(updated); LS.set(cacheKey, updated); }} />
      )}

      {/* ── EMPTY STATE ── */}
      {filter !== "table" && allCards.length === 0 && !aiLoading && workingSource && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            {workingSource.name} tayyor
          </div>
          <div className="text-muted text-sm mb16">{workingSource.data?.length?.toLocaleString()} ta yozuv • AI tahlil qilib 5-8 ta grafik yaratadi</div>
          <button className="btn btn-primary" onClick={autoGenerateCharts} disabled={!aiConfig?.apiKey}
            style={{ padding: "12px 28px", fontSize: 13, fontWeight: 700 }}>
            🔄 Avtomatik grafik yaratish
          </button>
          {!aiConfig?.apiKey && <div className="text-muted text-xs mt8">Sozlamalar → API kalit ulang</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VOICE INPUT BUTTON (Web Speech API)
// ─────────────────────────────────────────────────────────────
function VoiceButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggle = () => {
    if (!supported) { alert("Bu brauzer ovozli kiritishni qo'llab-quvvatlamaydi. Chrome yoki Edge ishlatib ko'ring."); return; }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = 'uz-UZ'; // O'zbek tili
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (text) onResult(text);
      setListening(false);
    };
    rec.onerror = (e) => {
      // Agar uz-UZ ishlamasa — ru-RU bilan qayta urinish
      if (e.error === 'language-not-supported' || e.error === 'no-speech') {
        rec.lang = 'ru-RU';
        rec.start();
        return;
      }
      console.warn('[Voice] Error:', e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  if (!supported) return null;

  return (
    <button
      className="chat-voice-btn"
      onClick={toggle}
      title={listening ? "To'xtatish" : "Ovozli kiritish (🎤)"}
      style={{
        minWidth: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        transition: 'all .2s',
        background: listening
          ? 'linear-gradient(135deg, #F87171, #EF4444)'
          : 'linear-gradient(135deg, #A78BFA, #7C3AED)',
        boxShadow: listening
          ? '0 4px 16px rgba(248,113,113,0.4)'
          : '0 4px 16px rgba(167,139,250,0.3)',
        animation: listening ? 'pulse-voice 1.5s ease infinite' : 'none',
      }}>
      {listening ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="17" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// CHAT PAGE
// ─────────────────────────────────────────────────────────────
function ChatPage({ aiConfig, sources, user, hasPersonalKey, onAiUsed }) {
  const prov = AI_PROVIDERS[aiConfig.provider];
  const uid = user?.id || "anon";
  const sessionsKey = "u_" + uid + "_chat_sessions";
  const connectedSources = sources.filter(s => s.connected && s.active && s.data?.length > 0);
  const [activeSrcIds, setActiveSrcIds] = useState(() => connectedSources.map(s => s.id));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [qCat, setQCat] = useState("all");
  const abortRef = useRef(null);

  const stopAI = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
    }
  };
  const [showSessions, setShowSessions] = useState(false);

  // ── Chat sessiyalar tizimi ──
  const nowTS = () => new Date().toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const hour = new Date().getHours();
  const timeSalom = hour < 6 ? "Xayrli tun" : hour < 12 ? "Xayrli tong" : hour < 18 ? "Xayrli kun" : "Xayrli kech";
  const firstName = (user?.name || "").split(" ")[0] || "";
  const greetLines = [
    `### ${timeSalom}${firstName ? ", " + firstName : ""}! 👋`,
    '',
    connectedSources.length > 0
      ? `Sizda **${connectedSources.length} ta** manba ulangan va tahlilga tayyor.`
      : '⚠️ Hali birorta manba ulanmagan — **Data Hub** bo\'limidan boshlang.',
    '',
    '**Men qila olaman:**',
    '- 📊 Ma\'lumotlaringiz bo\'yicha tahlil (sotuv, mijoz, moliya)',
    '- 📈 Trend va solishtirish (oy/chorak/yil)',
    '- ⚠️ Anomaliya va ogohlantirishlar',
    '- 💡 Tavsiya va keyingi qadamlar',
    '',
    '_Tezkor savollardan tanlang yoki o\'zingiz yozing._',
  ].join('\n');
  const defaultMsg = [{ role: "assistant", content: greetLines, time: nowTS() }];

  const [sessions, setSessions] = useState(() => {
    const saved = LS.get(sessionsKey, []);
    // 3 kundan eski sessiyalarni o'chirish
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const fresh = saved.filter(s => s.createdAt > threeDaysAgo);
    if (fresh.length !== saved.length) LS.set(sessionsKey, fresh);
    if (!fresh.length) {
      const first = { id: Date.now(), title: "Yangi suhbat", createdAt: Date.now(), messages: defaultMsg };
      LS.set(sessionsKey, [first]);
      return [first];
    }
    return fresh;
  });
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0]?.id || Date.now());

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || defaultMsg;

  const setMessages = (updater) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === activeSessionId ? { ...s, messages: typeof updater === "function" ? updater(s.messages) : updater } : s);
      LS.set(sessionsKey, updated);
      return updated;
    });
  };

  // Yangi sessiya yaratish
  const newSession = () => {
    // Joriy sessiya sarlavhasini yangilash
    const curMsgs = activeSession?.messages || [];
    const firstUserMsg = curMsgs.find(m => m.role === "user");
    if (firstUserMsg && activeSession) {
      const title = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title } : s));
    }
    const s = { id: Date.now(), title: "Yangi suhbat", createdAt: Date.now(), messages: defaultMsg };
    setSessions(prev => { const u = [s, ...prev].slice(0, 20); LS.set(sessionsKey, u); return u; });
    setActiveSessionId(s.id);
    setShowSessions(false);
  };

  // ── Fayl yuklash ──
  const chatFileRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);

  const handleChatFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    let content = "";
    let preview = null;

    try {
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        // Rasm — base64
        const b64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        preview = b64;
        content = `[RASM YUKLANDI: ${file.name}, ${(file.size / 1024).toFixed(1)}KB. Rasmni tavsiflab bering va savolga javob bering]`;
      } else if (['txt', 'csv', 'md', 'log'].includes(ext)) {
        content = await file.text();
        content = `[FAYL: ${file.name}]\n${content.substring(0, 15000)}`;
      } else if (ext === 'pdf') {
        // Backend orqali PDF matnini ajratish
        try {
          const parsed = await UploadAPI.parseOnly(file);
          content = `[PDF FAYL: ${file.name}, ${(file.size / 1024).toFixed(1)}KB]\n${parsed.text || "[PDF dan matn ajratib bo'lmadi]"}`;
        } catch {
          // Fallback: frontend regex
          const buf = await file.arrayBuffer();
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const raw = decoder.decode(buf);
          const chunks = [];
          const matches = raw.match(/\(([^)]{2,})\)\s*Tj/g) || [];
          matches.forEach(m => { const t = m.match(/\(([^)]+)\)/); if (t) chunks.push(t[1]); });
          content = `[PDF FAYL: ${file.name}, ${(file.size / 1024).toFixed(1)}KB]\n${chunks.join(' ').substring(0, 15000) || "[PDF dan matn ajratib bo'lmadi]"}`;
        }
      } else if (ext === 'docx') {
        const buf = await file.arrayBuffer();
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const raw = decoder.decode(buf);
        const xmlContent = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
        const text = xmlContent.map(t => t.replace(/<[^>]+>/g, '')).join(' ');
        content = `[WORD FAYL: ${file.name}]\n${text.substring(0, 15000) || "[Word dan matn ajratib bo'lmadi]"}`;
      } else if (['xlsx', 'xls'].includes(ext)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" }).slice(0, 50);
        content = `[EXCEL FAYL: ${file.name}, ${data.length} qator]\n${JSON.stringify(data.slice(0, 20), null, 2)}`;
      } else {
        content = `[FAYL: ${file.name}, ${(file.size / 1024).toFixed(1)}KB — bu format qo'llab-quvvatlanmaydi]`;
      }
    } catch (e) {
      content = `[FAYL: ${file.name} — o'qishda xato: ${e.message}]`;
    }

    setAttachedFile({ name: file.name, ext, size: file.size, content, preview });
  };

  // Sessiya tanlash
  const selectSession = (id) => { setActiveSessionId(id); setShowSessions(false); };

  // Sessiya o'chirish
  const deleteSession = (id) => {
    setSessions(prev => {
      const u = prev.filter(s => s.id !== id);
      if (!u.length) { const n = { id: Date.now(), title: "Yangi suhbat", createdAt: Date.now(), messages: defaultMsg }; LS.set(sessionsKey, [n]); setActiveSessionId(n.id); return [n]; }
      LS.set(sessionsKey, u);
      if (id === activeSessionId) setActiveSessionId(u[0].id);
      return u;
    });
  };

  // Sessiya sarlavhasini yangilash (birinchi user xabaridan)
  useEffect(() => {
    const firstUser = messages.find(m => m.role === "user");
    if (firstUser && activeSession?.title === "Yangi suhbat") {
      const title = firstUser.content.substring(0, 40) + (firstUser.content.length > 40 ? "..." : "");
      setSessions(prev => { const u = prev.map(s => s.id === activeSessionId ? { ...s, title } : s); LS.set(sessionsKey, u); return u; });
    }
  }, [messages.length]);

  const chatKey = "u_" + uid + "_chat_h"; // Legacy uchun
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const qScrollRef = useRef(null);
  const pendingSendRef = useRef(null);

  // Sync activeSrcIds when sources change
  useEffect(() => {
    setActiveSrcIds(prev => {
      const validIds = connectedSources.map(s => s.id);
      const existing = prev.filter(id => validIds.includes(id));
      const newOnes = validIds.filter(id => !prev.includes(id));
      return [...existing, ...newOnes];
    });
  }, [sources]);

  const toggleSrc = (id) => setActiveSrcIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // send funksiyasi — inputdan yoki to'g'ridan-to'g'ri textdan
  const sendMsg = useCallback(async (directText) => {
    const text = directText || input;
    if (!text.trim() || loading) return;
    if (!aiConfig.apiKey) { alert("AI ulanmagan. Admin global AI sozlashi yoki siz shaxsiy API kalit kiritishingiz kerak (AI Sozlamalar sahifasida)."); return; }
    // Limit tekshirish — shaxsiy kalit bo'lsa limit yo'q
    if (!hasPersonalKey && user) {
      const canUse = Auth.checkLimit(user, "ai_requests");
      if (!canUse) {
        const plan = PLANS[user.plan || "free"];
        alert(`AI so'rov limitiga yetdingiz (${plan.limits.ai_requests} so'rov/oy). Yuqori tarifga o'ting yoki shaxsiy API kalit ulang.`);
        return;
      }
    }
    const chosenSrcs = sources.filter(s => activeSrcIds.includes(s.id) && s.connected && s.data?.length > 0);

    // ══ SMART CONTEXT — Backend da aqlli qidiruv (RAG) ══
    let ctx = "";
    if (Token.get() && chosenSrcs.length > 0) {
      try {
        // Backend ga savol yuboramiz — u bazadan aqlli qidiruv qiladi
        const smartResult = await SourcesAPI.getSmartContext(
          chosenSrcs.map(s => s.id),
          text // foydalanuvchi savoli — backend shu asosda qidiradi
        );
        if (smartResult?.context) {
          ctx = smartResult.context;
          console.log(`[SMART-CTX] ${smartResult.sourceCount || 0} manba, ${smartResult.totalRows || 0} qator, context: ${ctx.length} chars`);
        }
      } catch (e) {
        console.warn("[SMART-CTX] Backend xato, fallback ishlatiladi:", e.message);
        // Fallback — agar backend ishlamasa, local buildMergedContext
        ctx = buildMergedContext(chosenSrcs);
      }
    }
    if (!ctx && chosenSrcs.length > 0) ctx = buildMergedContext(chosenSrcs);

    const allCtx = ctx ? `\n\n━━━ MANBA MA'LUMOTLARI ━━━\n${ctx}\n━━━━━━━━━━━━━━━━━━━━━━━━━━` : "";
    const fileCtx = attachedFile ? `\n\n━━━ YUKLANGAN FAYL ━━━\n${attachedFile.content}\n━━━━━━━━━━━━━━━━━━━━━━━━━━` : "";
    const fullMsg = text + allCtx + fileCtx;
    const disp = text + (attachedFile ? ` 📎 ${attachedFile.name}` : "");
    setInput(""); setAttachedFile(null);
    const hist = messages.map(m => ({ role: m.role, content: m.content }));
    const ts = new Date().toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const newMsgs = [...messages, { role: "user", content: disp, srcNames: chosenSrcs.map(s => s.name), time: ts }, { role: "assistant", content: "", time: ts }];
    setMessages(newMsgs); setLoading(true);

    // Professional system prompt — onboarding ma'lumotlari bilan moslashtirilgan
    const onbPfx = "u_" + (user?.id || "anon") + "_onboarding";
    const onb = LS.get(onbPfx, {});
    const userLang = LS.get("u_" + (user?.id || "anon") + "_lang", "uz");
    const langMap = { uz: "O'ZBEK TILIDA", ru: "RUSCHA (на русском языке)", en: "INGLIZ TILIDA (in English)" };
    const bizContext = (onb.bizName ? `\n\nFOYDALANUVCHI HAQIDA: Biznes nomi: "${onb.bizName}", Soha: ${onb.bizType || "noma'lum"}, Jamoa: ${onb.employees || "noma'lum"}, Asosiy qiziqish: ${onb.interest || "umumiy"}, Maqsad: ${onb.goal || "tahlil"}. Javoblarni SHU BIZNESGA MOSLASHTIRIB ber!` : "") + `\n\nJAVOB TILI: Barcha javoblarni ${langMap[userLang] || langMap.uz} yoz!`;

    const systemPrompt = {
      role: "system",
      content: `Sen — Analix, yuqori malakali biznes tahlilchi. Biznes egasiga HAYRATLANTIRADIGAN darajada foydali javoblar ber.${bizContext}

JAVOB FORMATI — bu juda MUHIM:
1. Javobni STRUKTURALI yoz — sarlavhalar, nuqtalar bilan
2. Har bir muhim raqamni BOLD qil: **1,247 ta**, **23.5%**, **3.2M so'm**
3. Har bir bo'limga mos EMOJI qo'y: 📊 Statistika, 📈 O'sish, ⚠️ Muammo, 💡 Tavsiya, 🎯 Maqsad, 💰 Moliya, 👥 Mijozlar
4. Raqamlarni JADVAL ko'rinishida ber (markdown table):
   | Ko'rsatkich | Qiymat | O'zgarish |
   |-------------|--------|-----------|
   | Savdo       | 1.2M   | +15%      |
5. Muhim xulosalarni > blockquote bilan ajrat
6. Ro'yxatlarni • bullet bilan yoz

MAZMUN QOIDALARI:
- ANIQ RAQAMLAR — "ko'p" emas, "1,247 ta". "o'sdi" emas, "+23.5%"
- AMALIY TAVSIYA — har bir topilmaga "nima qilish kerak" yoz
- MUAMMO + YECHIM — faqat muammo emas, yechim ham ber
- SOLISHTIRISH — o'rtacha bilan, maqsad bilan
- Agar ma'lumot YO'Q — "Bu ma'lumot manbada mavjud emas" de, o'ylab chiqarma
- Agar fayl yuklangan bo'lsa — fayl mazmunini TAHLIL QIL va savollarga shu asosda javob ber
- Agar BAZADAN TOPILGAN NATIJALAR bo'lsa — bu ANIQ ma'lumot, shu asosda TO'LIQ va BATAFSIL javob ber. Raqamlarni jadval qilib ko'rsat.
- O'ZBEK TILIDA, 200-400 so'z`
    };

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      // YANGI — backend agent (vositalar bilan, real ma'lumot)
      // Agent multi-turn, streaming yo'q lekin javob aniqroq
      const useAgent = LS.get("ai_use_agent_" + (user?.id || "anon"), true);
      if (useAgent && user) {
        try {
          const agentMsg = text + (attachedFile ? `\n\n━━━ YUKLANGAN FAYL: ${attachedFile.name} ━━━\n${attachedFile.content}` : "");
          const trimmedHist = hist.slice(-4).map(h => ({
            role: h.role,
            content: String(h.content || '').slice(0, 2000),
          }));

          // Streaming: tool-call'larni real-time ko'rsatamiz
          const getToolLabel = (name, input = {}) => {
            const src = input.sourceId || input.source_id || '';
            const col = input.column || input.dateColumn || '';
            const op  = input.operation || '';
            const q   = input.query || input.searchQuery || '';
            const grp = input.groupBy || input.group_by || '';
            const lim = input.limit ? `top ${input.limit}` : '';
            const srcLabel = src ? ` · ${src}` : '';
            switch (name) {
              case 'list_sources':        return `📚 Manbalar ro'yxati`;
              case 'get_source_schema':   return `🗂 Sxema${srcLabel}`;
              case 'search_rows':         return `🔎 Qidiruv${srcLabel}${q ? `: "${q.slice(0,20)}"` : ''}`;
              case 'aggregate':           return `🧮 ${op||'Hisob'}${srcLabel}${col ? ` [${col}]` : ''}`;
              case 'group_by':            return `📊 Guruhlash${srcLabel}${grp ? ` [${grp}]` : ''}`;
              case 'get_distinct_values': return `🔣 Noyob${srcLabel}${col ? ` [${col}]` : ''}`;
              case 'cross_source_search': return `🌐 Umumiy qidiruv${q ? `: "${q.slice(0,20)}"` : ''}`;
              case 'time_series':         return `📈 Trend${srcLabel}${col ? ` [${col}]` : ''}`;
              case 'query_data':          return `⚡ So'rov${srcLabel}${grp ? ` [${grp}]` : col ? ` [${col}]` : ''}${lim ? ` ${lim}` : ''}`;
              case 'save_memory':         return `💾 Eslab qolish`;
              default:                    return `🔧 ${name}`;
            }
          };
          const seenTools = [];
          let pendingText = '';   // server'dan kelayotgan, lekin hali ekranda ko'rsatilmagan
          let displayedText = ''; // hozir ekranda ko'rsatilgan
          let streamEnded = false;
          let streaming = false;
          let typingTimer = null;

          // Typing animatsiyasi: har tick ~30ms da 3-10 belgi qo'shamiz
          // Agar buffer katta bo'lsa tezroq, kichik bo'lsa sekinroq
          const tickTyping = () => {
            if (!streaming) return;
            const remaining = pendingText.length - displayedText.length;
            if (remaining > 0) {
              // Buffer katta bo'lsa katta qadam (tez yetkazish), kichik bo'lsa 1-2 belgi
              const step = remaining > 200 ? Math.ceil(remaining / 20)
                         : remaining > 50 ? 6
                         : remaining > 10 ? 3 : 1;
              displayedText = pendingText.slice(0, displayedText.length + step);
              setMessages(m => {
                const c = [...m];
                c[c.length - 1] = {
                  role: "assistant",
                  content: displayedText,
                  streaming: true,
                  toolsUsed: seenTools.map(t => t.label),
                  time: c[c.length - 1]?.time,
                };
                return c;
              });
            }
            if (streamEnded && displayedText.length >= pendingText.length) {
              clearInterval(typingTimer);
              typingTimer = null;
            }
          };

          const final = await AiAgentAPI.stream(agentMsg, trimmedHist, (evt) => {
            if (evt.type === 'tool') {
              const label = getToolLabel(evt.data.name, evt.data.input || {});
              seenTools.push({ name: evt.data.name, label, input: evt.data.input });
              if (streaming) return;
              setMessages(m => {
                const c = [...m];
                c[c.length - 1] = {
                  role: "assistant",
                  content: "_Tahlil qilayapman..._\n\n" + seenTools.map(t => `• ${t.label}`).join('\n'),
                  toolProgress: true,
                  time: c[c.length - 1]?.time,
                };
                return c;
              });
            } else if (evt.type === 'delta' && typeof evt.data?.text === 'string') {
              pendingText += evt.data.text;
              if (!streaming) {
                streaming = true;
                typingTimer = setInterval(tickTyping, 25);
              }
            }
          }, { signal: controller.signal });

          streamEnded = true;
          // Buffer qolganini sekin drainlash o'rniga darhol ko'rsatamiz
          if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }

          setMessages(m => {
            const c = [...m];
            c[c.length - 1] = {
              role: "assistant",
              content: final?.reply || "(bo'sh javob)",
              confidence: final?.confidence,
              sourcesUsed: final?.sourcesUsed || [],
              toolsUsed: seenTools.map(t => t.label),
              time: c[c.length - 1]?.time,
            };
            return c;
          });
          if (!hasPersonalKey && user && onAiUsed) onAiUsed();
        } catch (e) {
          if (e.name === 'AbortError') {
            setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "⏹ To'xtatildi" }; return c; });
          } else {
            console.warn('[chat] agent xato:', e.message);
            setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "❌ AI xato: " + e.message + "\n\nQayta urinib ko'ring yoki Sozlamalar → AI kalitini tekshiring." }; return c; });
          }
        }
      } else {
        await callAI([systemPrompt, ...hist, { role: "user", content: fullMsg }], aiConfig, (chunk) => {
          setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: chunk }; return c; });
        }, controller.signal);
        if (!hasPersonalKey && user && onAiUsed) onAiUsed();
      }
      setMessages(m => m); // Sessions tizimi avtomatik saqlaydi
    } catch (e) {
      if (e.name === 'AbortError') {
        setMessages(m => { const c = [...m]; if (c[c.length - 1]?.content) c[c.length - 1].content += "\n\n⏹ *To'xtatildi*"; return c; });
      } else {
        setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: " Xato: " + e.message }; return c; });
      }
    }
    abortRef.current = null;
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [input, loading, aiConfig, sources, activeSrcIds, messages, hasPersonalKey, user]);

  // pendingSendRef bilan avtomatik yuborish (qchip bosilganda)
  useEffect(() => {
    if (pendingSendRef.current && !loading) {
      const txt = pendingSendRef.current;
      pendingSendRef.current = null;
      sendMsg(txt);
    }
  }, [input, loading, sendMsg]);

  // Quick question scroll arrows
  const scrollQ = (dir) => {
    if (!qScrollRef.current) return;
    const amount = 220;
    qScrollRef.current.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  // ── Chat export funksiyalari ──
  const chatToText = () => {
    const onlyChat = messages.filter(m => m.content && m.content.trim());
    return onlyChat.map(m => {
      const role = m.role === "user" ? "Siz" : `${prov.name} AI`;
      const srcs = m.srcNames?.length ? ` [${m.srcNames.join(", ")}]` : "";
      return `[${role}${srcs}]\n${m.content}`;
    }).join("\n\n────────────────────\n\n");
  };

  const downloadChat = () => {
    const text = chatToText();
    if (!text.trim()) { alert("Chat bo'sh"); return; }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Analix_chat_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const copyChat = async () => {
    const text = chatToText();
    if (!text.trim()) { alert("Chat bo'sh"); return; }
    try { await navigator.clipboard.writeText(text); alert("Chat nusxalandi!"); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      alert("Chat nusxalandi!");
    }
  };

  const shareChat = async () => {
    const text = chatToText();
    if (!text.trim()) { alert("Chat bo'sh"); return; }
    if (navigator.share) {
      try { await navigator.share({ title: "Analix Chat", text }); } catch { }
    } else {
      await copyChat();
    }
  };

  // Excel eksport
  const downloadChatExcel = () => {
    const rows = messages.filter(m => m.content).map(m => ({
      Rol: m.role === "user" ? "Siz" : "AI",
      Xabar: m.content.substring(0, 500),
      Vaqt: m.time || "",
      Manbalar: m.srcNames?.join(", ") || ""
    }));
    if (!rows.length) { alert("Chat bo'sh"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chat");
    XLSX.writeFile(wb, `Analix_chat_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Manba turiga qarab aqlli savollar
  const QUICK_BASE = [
    { icon: "📊", text: "Bugungi moliyaviy holat — asosiy raqamlar", cat: "tahlil", c: "#00C9BE" },
    { icon: "💰", text: "Jami kirim, chiqim va sof foyda", cat: "tahlil", c: "#4ADE80" },
    { icon: "📈", text: "Oylik daromad trendi — so'nggi 6 oy", cat: "tahlil", c: "#FBBF24" },
    { icon: "🏆", text: "Top 10 mijoz — eng ko'p to'lov qilganlar", cat: "tahlil", c: "#A78BFA" },
    { icon: "⚠️", text: "Anomaliyalar va xavfli tendensiyalar", cat: "tahlil", c: "#F87171" },
    { icon: "💡", text: "Biznes o'sishi uchun 3 ta strategik tavsiya", cat: "strategiya", c: "#60A5FA" },
    { icon: "🔮", text: "Keyingi 3 oy daromad prognozi", cat: "prognoz", c: "#E879F9" },
    { icon: "📋", text: "To'liq moliyaviy hisobot yoz", cat: "hisobot", c: "#FB923C" },
  ];
  const QUICK_INSTAGRAM = [
    { icon: "", text: "Instagram engagement tahlili", cat: "instagram", c: "#E879F9" },
    { icon: "", text: "Qaysi postlar eng ko'p like olgan?", cat: "instagram", c: "#F87171" },
    { icon: "", text: "Izohlar tahlili — auditoriya qiziqishi", cat: "instagram", c: "#FBBF24" },
    { icon: "", text: "Qaysi kunlarda post eng yaxshi ishlaydi?", cat: "instagram", c: "#4ADE80" },
    { icon: "", text: "Video vs Rasm — qaysi biri samaraliroq?", cat: "instagram", c: "#60A5FA" },
    { icon: "", text: "Haftalik engagement dinamikasi", cat: "instagram", c: "#00C9BE" },
    { icon: "", text: "Top 5 eng yaxshi post va sabablari", cat: "instagram", c: "#FB923C" },
    { icon: "", text: "Auditoriya o'sish tezligini baholash", cat: "instagram", c: "#A78BFA" },
    { icon: "", text: "Kontent strategiyasi tavsiyalari", cat: "strategiya", c: "#EC4899" },
    { icon: "", text: "Eng yaxshi post vaqtini aniqlash", cat: "instagram", c: "#38BDF8" },
  ];
  const QUICK_TELEGRAM = [
    { icon: "", text: "Telegram kanal statistikasini tahlil qil", cat: "telegram", c: "#38BDF8" },
    { icon: "", text: "Obunachilar o'sishi va dinamikasi", cat: "telegram", c: "#E879F9" },
    { icon: "", text: "Qaysi postlar eng ko'p ko'rilgan?", cat: "telegram", c: "#4ADE80" },
    { icon: "", text: "Qaysi soatlarda post chiqarish samarali?", cat: "telegram", c: "#FBBF24" },
    { icon: "", text: "Eng ko'p ulashilgan postlar tahlili", cat: "telegram", c: "#F87171" },
    { icon: "", text: "Kanal engagement rate va tavsiyalar", cat: "telegram", c: "#00C9BE" },
  ];
  const QUICK_DATA = [
    { icon: "💰", text: "Jami kirim va chiqim — barcha manbalar", cat: "tahlil", c: "#00C9BE" },
    { icon: "📊", text: "Oylik trend — so'nggi 6 oy grafigi", cat: "tahlil", c: "#4ADE80" },
    { icon: "🏆", text: "Top mahsulotlar va kategoriyalar — daromad bo'yicha", cat: "tahlil", c: "#A78BFA" },
    { icon: "👥", text: "Top mijozlar — eng ko'p to'lov qilganlar", cat: "tahlil", c: "#F87171" },
    { icon: "⚠️", text: "Anomaliyalar — g'ayritabiiy raqamlarni aniqla", cat: "tahlil", c: "#FBBF24" },
    { icon: "📉", text: "Xarajatlar tuzilmasi — qayerga eng ko'p ketmoqda?", cat: "moliya", c: "#60A5FA" },
    { icon: "🔮", text: "3 oylik daromad va foyda prognozi", cat: "prognoz", c: "#EC4899" },
    { icon: "💡", text: "Real raqamlarga asoslangan o'sish strategiyasi", cat: "strategiya", c: "#FB923C" },
  ];
  const QUICK_CRM = [
    { icon: "", text: "CRM umumiy tahlili — lidlar, guruhlar, o'quvchilar", cat: "crm", c: "#8B5CF6" },
    { icon: "", text: "Lidlar konversiyasi va pipeline tahlili", cat: "crm", c: "#F87171" },
    { icon: "", text: "Qaysi guruhlar eng ko'p o'quvchiga ega?", cat: "crm", c: "#4ADE80" },
    { icon: "", text: "O'qituvchilar yuklamasi va samaradorligi", cat: "crm", c: "#FBBF24" },
    { icon: "", text: "Filiallar bo'yicha solishtirma tahlil", cat: "crm", c: "#60A5FA" },
    { icon: "", text: "Daromad va maosh nisbati — foyda tahlili", cat: "crm", c: "#4ADE80" },
    { icon: "", text: "O'quvchilar o'sish tendensiyasi", cat: "crm", c: "#00C9BE" },
    { icon: "", text: "Qaysi fanlar eng mashhur?", cat: "crm", c: "#A78BFA" },
    { icon: "", text: "O'quvchilar demografi tahlili (jins, yosh)", cat: "crm", c: "#E879F9" },
    { icon: "", text: "CRM samaradorlik hisoboti yoz", cat: "crm", c: "#FB923C" },
  ];

  // Tanlangan manbalarga qarab savollar
  const chosenSources = sources.filter(s => activeSrcIds.includes(s.id) && s.connected && s.data?.length > 0);
  const hasIG = chosenSources.some(s => s.type === "instagram");
  const hasTG = chosenSources.some(s => s.type === "telegram");
  const hasCRM = chosenSources.some(s => s.type === "crm");
  const quickQuestions = [
    ...QUICK_BASE,
    ...(hasIG ? QUICK_INSTAGRAM : []),
    ...(hasTG ? QUICK_TELEGRAM : []),
    ...(hasCRM ? QUICK_CRM : []),
    ...(!hasIG && !hasTG && !hasCRM ? QUICK_DATA : []),
  ];

  const cats = [...new Set(quickQuestions.map(q => q.cat))];
  const CAT_LABELS = { all: "Hammasi", tahlil: "Tahlil", strategiya: "Strategiya", moliya: "Moliya", prognoz: "Prognoz", instagram: "Instagram", telegram: "Telegram", crm: "CRM", hisobot: "Hisobot" };
  const filteredQ = qCat === "all" ? quickQuestions : quickQuestions.filter(q => q.cat === qCat);

  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="chat-wrap">
      {/* ── AI provayder info + export tugmalari ── */}
      <div className="flex aic gap8" style={{ padding: "8px 12px", background: "var(--s2)", borderRadius: 10, border: `1px solid ${prov.color}25`, flexShrink: 0 }}>
        <span style={{ color: prov.color, fontSize: 15 }}>{prov.icon}</span>
        <span className="text-xs text-muted">Faol:</span>
        <span style={{ fontSize: 11.5, color: prov.color, fontFamily: "var(--fh)", fontWeight: 600 }}>{prov.name} — {aiConfig.model}</span>
        {!(aiConfig.apiKey || GlobalAI.get()?.apiKey) && <span className="badge b-warn ml-auto"> Kalit kerak</span>}
        {(aiConfig.apiKey || GlobalAI.get()?.apiKey) && <span className="badge b-ok ml-auto">✓ Ulangan</span>}
        <div style={{ marginLeft: aiConfig.apiKey ? "8px" : "auto", display: "flex", gap: 4 }}>
          <button className="chat-export-btn" onClick={copyChat} title="Nusxalash">Nusxa</button>
          <button className="chat-export-btn" onClick={downloadChat} title="TXT yuklab olish">TXT</button>
          <button className="chat-export-btn" onClick={downloadChatExcel} title="Excel yuklab olish">Excel</button>
          <button className="chat-export-btn" onClick={shareChat} title="Ulashish"> Ulash</button>
        </div>
        <button onClick={newSession}
          style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(0,201,190,0.3)", background: "rgba(0,201,190,0.08)", color: "var(--teal)", fontSize: 11, fontFamily: "var(--fh)", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,201,190,0.15)" }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,201,190,0.08)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Yangi
        </button>
        <button onClick={() => setShowSessions(p => !p)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: showSessions ? "var(--s3)" : "var(--s2)", color: "var(--text2)", fontSize: 11, fontFamily: "var(--fh)", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .2s" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
          Tarix ({sessions.length})
        </button>
      </div>

      {/* ── Manbalar tanlash ── */}
      {connectedSources.length > 0 && (
        <div className="chat-src-tags" style={{ marginTop: 8 }}>
          <span className="text-xs text-muted" style={{ alignSelf: "center", flexShrink: 0 }}>Manbalar:</span>
          {connectedSources.map(s => (
            <span key={s.id} className="src-tag" onClick={() => toggleSrc(s.id)}
              style={{ borderColor: activeSrcIds.includes(s.id) ? s.color : "var(--border)", color: activeSrcIds.includes(s.id) ? s.color : "var(--muted)", background: activeSrcIds.includes(s.id) ? `${s.color}12` : "transparent" }}>
              {SOURCE_TYPES[s.type]?.icon} {s.name} ({s.data.length})
            </span>
          ))}
          {activeSrcIds.length === 0 && <span className="text-xs text-muted">Hech bir manba tanlanmagan</span>}
        </div>
      )}
      {connectedSources.length === 0 && <div className="notice text-xs text-muted" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", flexShrink: 0, marginTop: 8 }}>Data Hub da manba ulang — AI shu ma'lumotlar asosida javob beradi</div>}

      {/* ── Kategoriya filtrlari ── */}
      <div className="chat-cat-row">
        {["all", ...cats].map(c => (
          <button key={c} className="qcat" onClick={() => setQCat(c)}
            style={qCat === c ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.1)" } : {}}>
            {CAT_LABELS[c] || c}
          </button>
        ))}
      </div>

      {/* ── Chat xabarlar (wrapper with floating scroll buttons) ── */}
      {/* ── Sessiyalar paneli (ixcham, 1 qator scroll) ── */}
      {showSessions && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8, flexShrink: 0 }} className="hide-scroll">
          {sessions.map(s => {
            const isActive = s.id === activeSessionId;
            const age = Math.floor((Date.now() - s.createdAt) / 86400000);
            return (
              <div key={s.id} onClick={() => selectSession(s.id)}
                style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: isActive ? "var(--s3)" : "var(--s1)", border: `1px solid ${isActive ? "var(--teal)" : "var(--border)"}`, transition: "all .15s", flexShrink: 0, minWidth: 120, maxWidth: 180, display: "flex", alignItems: "center", gap: 6 }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = "var(--border-hi)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = "var(--border)"; }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, color: isActive ? "var(--teal)" : "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ fontSize: 8, color: "var(--muted)", fontFamily: "var(--fm)" }}>{s.messages?.length || 0} xabar {age > 0 ? `· ${age}k` : ""}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: 0, flexShrink: 0, lineHeight: 1 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="chat-msgs-wrap">
        <div className="chat-msgs">
          <div ref={topRef} />
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === "user" ? "user" : ""}`}>
              <div className={`ava ${m.role === "user" ? "user" : "ai"}`} style={m.role === "assistant" ? { color: prov.color } : {}}>{m.role === "user" ? "U" : prov.icon}</div>
              <div className="bubble">
                <div className="flex aic jb">
                  <span className="bubble-meta">{m.role === "user" ? "Siz" : `${prov.name} AI`}</span>
                  {m.time && <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>{m.time}</span>}
                </div>
                {m.role === "user" && m.srcNames?.length > 0 && (
                  <div className="flex gap4 mb6" style={{ flexWrap: "wrap" }}>
                    {m.srcNames.map((n, j) => <span key={j} style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: "rgba(0,201,190,0.1)", color: "var(--teal)" }}> {n}</span>)}
                  </div>
                )}
                {m.role === "assistant" ? <RenderMD text={m.content} /> : <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>}
                {m.role === "assistant" && (m.confidence || m.sourcesUsed?.length > 0 || m.toolsUsed?.length > 0) && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 10 }}>
                    {m.confidence && (
                      <span title="Javob ishonchliligi" style={{
                        padding: "2px 8px", borderRadius: 10, fontWeight: 600, fontFamily: "var(--fm)",
                        background: m.confidence === 'high' ? 'rgba(16,185,129,0.15)' : m.confidence === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                        color: m.confidence === 'high' ? '#10B981' : m.confidence === 'medium' ? '#CA8A04' : '#EF4444',
                      }}>
                        {m.confidence === 'high' ? '✓ Yuqori ishonch' : m.confidence === 'medium' ? '~ O\'rtacha ishonch' : '? Past ishonch'}
                      </span>
                    )}
                    {m.sourcesUsed?.map((s, j) => (
                      <span key={j} title="Ishlatilgan manba" style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(0,201,190,0.12)", color: "var(--teal)", fontWeight: 600 }}>📎 {s}</span>
                    ))}
                    {m.toolsUsed && m.toolsUsed.length > 0 && !m.toolProgress && (
                      <span title="Bajarilgan amallar" style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(148,163,184,0.12)", color: "var(--muted)" }}>
                        🔧 {m.toolsUsed.length} ta amal
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="msg"><div className="ava ai" style={{ color: prov.color }}>{prov.icon}</div><div className="bubble"><div className="typing-ind"><span /><span /><span /></div></div></div>}
          <div ref={bottomRef} />
        </div>
        {/* ── Floating scroll tugmalari (o'ng tomonda yuqorida/pastda) ── */}
        {messages.length > 3 && (
          <div className="chat-float-btns">
            <button className="chat-float-btn" onClick={scrollToTop} title="Yuqoriga">↑</button>
            <button className="chat-float-btn" onClick={scrollToBottom} title="Pastga">↓</button>
          </div>
        )}
      </div>

      {/* ── Tezkor savollar (chap/o'ng strelkalar bilan) ── */}
      <div className="chat-q-wrap">
        <button className="chat-q-arrow" onClick={() => scrollQ(-1)} title="Chapga">‹</button>
        <div className="chat-q-scroll" ref={qScrollRef}>
          {filteredQ.map((q, i) => (
            <button key={i} className="qchip" onClick={() => { pendingSendRef.current = q.text; setInput(q.text); }} style={{ "--qc": q.c }} disabled={loading}>
              <span className="qchip-icon">{q.icon}</span>
              {q.text}
            </button>
          ))}
        </div>
        <button className="chat-q-arrow" onClick={() => scrollQ(1)} title="O'ngga">›</button>
      </div>

      {/* ── Attached file preview ── */}
      {attachedFile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "var(--s2)", borderRadius: "10px 10px 0 0", borderBottom: "none", margin: "0 0 -1px 0" }}>
          {attachedFile.preview ? (
            <img src={attachedFile.preview} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {attachedFile.ext === "pdf" ? "📕" : attachedFile.ext === "xlsx" || attachedFile.ext === "xls" ? "📊" : attachedFile.ext === "docx" ? "📘" : "📄"}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedFile.name}</div>
            <div style={{ fontSize: 9, color: "var(--muted)" }}>{(attachedFile.size / 1024).toFixed(1)} KB</div>
          </div>
          <button onClick={() => setAttachedFile(null)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}
      {/* ── Input ── */}
      <div className="chat-input-row">
        <input ref={chatFileRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.txt,.csv,.md,.pdf,.docx,.doc,.xlsx,.xls,.json" style={{ display: "none" }}
          onChange={e => { if (e.target.files[0]) handleChatFile(e.target.files[0]); e.target.value = ""; }} />
        <button onClick={() => chatFileRef.current?.click()} title="Fayl yuklash (rasm, PDF, Excel, Word)"
          style={{ minWidth: 44, height: 44, borderRadius: 12, border: "1px solid var(--border)", background: attachedFile ? "linear-gradient(135deg,rgba(0,201,190,0.15),rgba(0,201,190,0.08))" : "var(--s2)", color: attachedFile ? "var(--teal)" : "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.color = "var(--teal)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = attachedFile ? "var(--teal)" : "var(--muted)"; }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        </button>
        <textarea className="chat-ta" rows={1} placeholder={attachedFile ? `${attachedFile.name} haqida savol bering...` : "Savolingizni yozing, fayl paste qiling yoki 🎤 bosing..."} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
          onPaste={e => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.kind === "file") {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) handleChatFile(file);
                return;
              }
            }
          }} />
        <VoiceButton onResult={(text) => { setInput(prev => prev ? prev + ' ' + text : text); }} />
        {loading ? (
          <button className="chat-send-btn" onClick={stopAI} title="To'xtatish"
            style={{ background: "linear-gradient(135deg,#F87171,#EF4444)", boxShadow: "0 4px 16px rgba(248,113,113,0.4)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
        ) : (
          <button className="chat-send-btn" onClick={() => sendMsg()} disabled={!input.trim() && !attachedFile}>➤</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS PAGE — Tayyor tahlillar + aloqador chartlar
// ─────────────────────────────────────────────────────────────
function AnalyticsPage({ aiConfig, sources, user, onAiUsed }) {
  const prov = AI_PROVIDERS[aiConfig.provider];
  const connectedSources = sources.filter(s => s.connected && s.active && s.data?.length > 0);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeLabel, setActiveLabel] = useState("");
  const [activeMod, setActiveMod] = useState(null);
  const [selectedSrc, setSelectedSrc] = useState(null);
  const [anaTab, setAnaTab] = useState("tahlil"); // tahlil | chartlar
  const [chartOverrides, setChartOverrides] = useState({});

  const workingSource = selectedSrc ? sources.find(s => s.id === selectedSrc) : connectedSources[0];

  // generateDashboards dan aloqador chartlar
  const allCards = useMemo(() => workingSource ? generateDashboards(workingSource) : [], [workingSource?.id, workingSource?.data?.length, workingSource?.updatedAt]);

  const setChartOverride = (cardId, type) => setChartOverrides(prev => ({ ...prev, [cardId]: type }));

  const isPersonal = !!aiConfig.isPersonal;
  const run = async (mod) => {
    if (!aiConfig.apiKey) { alert("AI ulanmagan. Admin global AI sozlashi yoki AI Sozlamalardan shaxsiy API kalit kiriting."); return; }
    // AI limit tekshirish
    if (!isPersonal && user && !Auth.checkLimit(user, "ai_requests", sources)) {
      const info = Auth.getLimitInfo(user, "ai_requests", sources);
      alert(`AI so'rov limiti tugadi (${info.label}). Tarifni yangilang yoki shaxsiy API kalit ulang.`);
      return;
    }
    setLoading(true); setResult(""); setActiveLabel(mod.l); setActiveMod(mod);
    // SMART CONTEXT — Backend dan aqlli qidiruv
    let ctx = "";
    if (Token.get() && connectedSources.length > 0) {
      try {
        const smartResult = await SourcesAPI.getSmartContext(connectedSources.map(s => s.id), mod.p);
        if (smartResult?.context) ctx = smartResult.context;
      } catch (e) { console.warn("[TAHLIL-CTX] fallback:", e.message); ctx = buildMergedContext(connectedSources); }
    }
    if (!ctx) ctx = buildMergedContext(connectedSources);
    const srcInfo = connectedSources.map(s => `${s.name} (${SOURCE_TYPES[s.type]?.label || s.type}, ${s.data?.length || 0} ta yozuv)`).join(", ");
    const enrichedPrompt = mod.p + `\n\nUlangan manbalar: ${srcInfo || "hech qanday manba ulanmagan"}` + (ctx ? `\n\nMA'LUMOTLAR:\n${ctx}` : "\n\n[Ma'lumot ulash uchun Data Hub dan manba qo'shing]") + `

JAVOB FORMATI (QATIY):

## 📊 Executive Xulosa
> Eng muhim 2-3 topilma — Boss birinchi ko'rsin (masalan: Daromad 3.77B ↑12%, Muammo: Xarajat ↑18%)

## 📈 KPI Jadvali
| Ko'rsatkich | Joriy | O'tgan davr | O'zgarish | Holat |
|-------------|-------|-------------|-----------|-------|
| [Real raqam] | [qiymat] | [qiymat] | +X% ↑ / -X% ↓ | 🟢/🟡/🔴 |

## 🔍 Chuqur Tahlil
[Segment/kategoriya/vaqt bo'yicha breakdown — aniq raqamlar bilan]

## ⚠️ Muammolar *(faqat mavjud bo'lsa)*
> 🔴 [Muammo] — [raqam] — ta'sir: [XM so'm / X%]

## 💡 Amaliy Qarorlar
| # | Tavsiya | Asoslanishi | Natija | Muddat |
|---|---------|-------------|--------|--------|
| 1 | Aniq harakat | Real raqam | +X% | 2 hafta |

## 🔮 Prognoz *(trend bo'lsa)*
[Keyingi oy/kvartal — optimistik / realistik / pessimistik senariy raqamlar bilan]

QOIDALAR: O'zbek tilida | Faqat haqiqiy raqamlar (O'YLAB CHIQARMA) | 1.5M/2.3B so'm formati | Tahlil chuqurligi: CEO darajasi`;
    try {
      await callAI([{ role: "user", content: enrichedPrompt }], aiConfig, setResult);
      if (!isPersonal && onAiUsed) onAiUsed();
    }
    catch (e) { setResult(" Xato: " + e.message); }
    setLoading(false);
  };

  // ── Manba turiga qarab tahlil modullari ──
  const hasIG = connectedSources.some(s => s.type === "instagram");
  const hasTG = connectedSources.some(s => s.type === "telegram");

  const BASE_MODS = [
    { l: "📊 Moliyaviy Dashboard", p: "Biznesning to'liq moliyaviy holatini tahlil qil. Jami kirim, jami chiqim, sof foyda, foyda foizi — barchasi KPI jadval va trend bilan. Eng muhim 5 ko'rsatkich uchun holat (🟢🟡🔴) belgilash. Kirim manbalarini aniqlash. Xarajat tuzilmasini ko'rsatish. 2 ta eng muhim moliyaviy muammo + 2 ta aniq yechim.", cat: "biznes", color: "#4ADE80", icon: "📊" },
    { l: "💰 Kirim-Chiqim Tahlili", p: "Barcha manbalardan kirim va chiqimni tahlil qil. Oylik dinamika (o'tgan oy bilan solishtir). Eng ko'p xarajat kategoriyalari top-5 jadval bilan. Daromad manbalari ulushi (%). Foyda marginini hisoblash. Qayerda pul yo'qolayapti — aniq raqam + sabab + tavsiya.", cat: "moliya", color: "#60A5FA", icon: "💰" },
    { l: "🏆 Top Mijozlar & Mahsulotlar", p: "Top 10 mijoz (to'lov summasi bo'yicha) va top 10 mahsulot/xizmat (daromad bo'yicha) — jadval formatida raqamlar bilan. Har birining umumiy daromadga ulushi (%). Eng foydali segment vs eng kam foydali segment farqi. Qaysi mijoz/mahsulotni kuchaytirish kerak — aniq tavsiya.", cat: "biznes", color: "#FB923C", icon: "🏆" },
    { l: "📈 Daromad Trendi", p: "So'nggi oylar bo'yicha daromad trendi tahlili — har oy uchun raqam. O'sish/kamayish foizi ↑↓. Mavsumiylik aniqlash. Eng yaxshi va eng yomon oylar + sababi. Agar trend salbiy — nima sababdan, nima qilish kerak. Trend davom etsa kelgusi 3 oy prognozi (optimistik/realistik/pessimistik).", cat: "tahlil", color: "#A78BFA", icon: "📈" },
    { l: "⚠️ Anomaliya & Xavflar", p: "Barcha ma'lumotlarda anomaliyalarni top: kutilmagan kirim/chiqim o'zgarishlari (±20% dan ortiq), g'ayritabiiy raqamlar, keskin tushish. Har anomaliya uchun: [raqam] → [sabab taxmini] → [moliyaviy ta'sir XM so'm] → [darhol chora]. Risklar jadvali: Risk | Ehtimollik | Ta'sir | Yechim.", cat: "tahlil", color: "#F87171", icon: "⚠️" },
    { l: "💡 O'sish Strategiyasi", p: "Real biznes raqamlariga asoslangan o'sish strategiyasi. Eng yuqori marja va potensial yo'nalishlarni aniqlash. Zaif tomonlar — har biri uchun aniq yechim + kutilgan natija. 3 ta harakat rejasi: [Nima qilish] → [Qanday] → [Qachon] → [Kutilgan +X% yoki +XM so'm]. 90 kunlik o'sish yo'l xaritasi.", cat: "strategiya", color: "#E879F9", icon: "💡" },
    { l: "🔮 3 Oy Prognozi", p: "Mavjud trend va mavsumiylik asosida keyingi 3 oy uchun moliyaviy prognoz jadval: Oy | Optimistik | Realistik | Pessimistik. Har senariy uchun asoslanish. Qanday omillar prognozni o'zgartirishi mumkin (ichki/tashqi). Maqsadga yetish uchun nima kerak.", cat: "prognoz", color: "#38BDF8", icon: "🔮" },
    { l: "📋 To'liq Hisobot", p: "Oylik to'liq biznes hisoboti yoz. Bo'limlar: 1) Executive Xulosa (top 3 raqam) 2) Moliyaviy natijalar KPI jadval bilan 3) Top mijozlar/mahsulotlar 4) Trend tahlili va prognoz 5) Anomaliyalar va xavflar 6) Keyingi davr strategiyasi — 3 ta aniq maqsad va KPI.", cat: "hisobot", color: "#00C9BE", icon: "📋" },
    { l: "⚡ Tezkor KPI", p: "Eng muhim 7 ta KPI ni qisqa va aniq ko'rsat jadvalda: Ko'rsatkich | Raqam | O'zgarish | Holat. KPIlar: Jami Kirim, Jami Chiqim, Sof Foyda, Foyda Foizi, Top Mahsulot Daromadi, Top Mijoz Ulushi, O'sish Trendi. Holat: 🟢 yaxshi / 🟡 e'tibor / 🔴 muammo. Eng muhim 1 ta darhol chora.", cat: "tezkor", color: "#FBBF24", icon: "⚡" },

    { l: "💸 Narx Optimizatsiyasi", p: "Narx strategiyasini tahlil qil. Mahsulot/xizmatlar bo'yicha marja jadval: Tovar/Xizmat | Narx | Tannarx | Marja | Marja%. Qaysi tovar eng yuqori, qaysi eng past marja bermoqda. Raqobat bilan narx taqqoslama (agar ma'lumot bo'lsa). Narxni oshirish mumkin bo'lgan pozitsiyalar — +X% oshirsa +XM so'm qo'shimcha foyda. Chegirma samaradorligini baholash.", cat: "strategiya", color: "#A78BFA", icon: "💸" },
    { l: "🔄 Mijoz Saqlab Qolish", p: "Retention va churn tahlili. Qayta kelgan vs birinchi marta kelgan mijozlar nisbati (%). Churn rate (ketgan mijozlar foizi). LTV (Lifetime Value) hisoblash: o'rtacha chek × o'rtacha sotib olish chastotasi × davr. Qaysi segment eng ko'p ketmoqda — sababi. Retention oshirish uchun 3 ta amaliy strategiya — har biri +X% natija bilan.", cat: "tahlil", color: "#38BDF8", icon: "🔄" },
    { l: "💳 Qarzdorlar & To'lovlar", p: "To'lov va qarzdorlik tahlili: umumiy qarzdorlik summasi, muddati o'tgan qarzlar, qarzdorlar ro'yxati top-10 (Mijoz | Summa | Muddat | Kechikish kunlari). To'lov usullari bo'yicha taqsimot (naqd/karta/click/payme). Kechikkan to'lovlarning cash flow ga ta'siri. Inkasso strategiyasi — qaysi qarzdordan qanday yondashish kerak.", cat: "moliya", color: "#F87171", icon: "💳" },
    { l: "👥 Xodimlar Samaradorligi", p: "Xodimlar produktivligi tahlili: Xodim | Lavozim | Daromad (yaratgan) | Maosh | ROI% jadval. Bir xodim uchun o'rtacha daromad. Eng samarali va kam samarali xodimlar. Maosh/daromad nisbati anomaliyalari. Xodim boshiga yuk taqsimlash optimalmi. Rag'batlantirish tizimi tavsiyasi — natijaga yo'naltirilgan KPI.", cat: "strategiya", color: "#4ADE80", icon: "👥" },
    { l: "🎯 Maqsad vs Haqiqat", p: "KPI maqsadlari va haqiqiy natijalar solishtirmasi jadval: KPI | Maqsad | Haqiqiy | Farq | Bajarilish% | Holat(🟢🟡🔴). Bajarilmagan maqsadlar — sababi va keyingi davr chorasi. Bajarilgan maqsadlar — nima to'g'ri qilindi. Keyingi davr uchun realisiik maqsad taklifi — trend asosida.", cat: "tahlil", color: "#FBBF24", icon: "🎯" },
    { l: "📦 Mahsulot Portfeli", p: "Mahsulot/xizmat portfeli tahlili BCG matritsa bo'yicha: Yulduzlar (yuqori o'sish, yuqori ulush), Naqd sigirlari (past o'sish, yuqori ulush), Savol belgilari, Itlar. Har tovarning daromad ulushi va o'sish trendi. Bekor qilish yoki kuchaytirish kerak bo'lgan pozitsiyalar. Yangi mahsulot/xizmat taklifi imkoniyati.", cat: "strategiya", color: "#EC4899", icon: "📦" },
    { l: "📱 Marketing Samaradorligi", p: "Marketing kanallari samaradorligi: Kanal (Instagram/Telegram/SMS/Referral) | Xarajat | Yangi mijozlar | CPL (xarajat/lead) | CAC (xarajat/mijoz) | ROI% jadval. Eng arzon va qimmat mijoz keltiruvchi kanal. Marketing byudjetini qayta taqsimlash tavsiyasi — qayerga ko'proq, qayerga kam. O'sish uchun yangi kanal taklifi.", cat: "tahlil", color: "#FB923C", icon: "📱" },
    { l: "⏱️ Operatsion Samaradorlik", p: "Operatsion jarayonlar samaradorligi tahlili. Asosiy jarayonlar: Buyurtma → To'lov → Yetkazib berish — har bosqich vaqti va muammolari. Bottleneck (eng sekin bosqich) aniqlash. Xarajat tuzilmasida tejash imkoniyatlari — aniq summa. Avtomatlashtirish tavsiyalari — nima qo'lda qilinmoqda, AI/tizim bilan almashtirilsa qancha tejash.", cat: "strategiya", color: "#00C9BE", icon: "⏱️" },
    { l: "🌱 Investitsiya & ROI", p: "Investitsiyalar rentabelligi tahlili: Investitsiya | Miqdor | Qaytim | ROI% | Muddat jadval (mashina, jihozlar, xodim, marketing, IT). Eng samarali va kam samarali investitsiyalar. Keyingi investitsiya tavsiyasi — qayerga, qancha, qachon, kutilgan ROI. 12 oylik investitsiya rejasi.", cat: "moliya", color: "#60A5FA", icon: "🌱" },
    { l: "🏪 Inventar & Zahira", p: "Tovar zahirasi va inventar tahlili: Tovar | Qoldiq | O'rtacha sotuv/oy | Tugash muddati | Holat jadval. Haddan ortiq zahirada yotgan kapital (XM so'm). Yetishmay qolish xavfi bor tovarlar. Optimal buyurtma miqdori (EOQ). Inventar aylanma koeffitsienti va bozor o'rtacha bilan solishtirish.", cat: "tahlil", color: "#A78BFA", icon: "🏪" },
    { l: "🔑 Unit Economics", p: "Biznesning unit economics tahlili: CAC (mijoz jalb qilish xarajati), LTV (umr bo'yi qiymat), LTV/CAC nisbati (3+ bo'lishi kerak), Payback period (xarajat qoplash muddati), Gross margin%, Contribution margin. Har ko'rsatkich sanoat o'rtacha bilan solishtirish. LTV/CAC 1 dan past bo'lsa — darhol chora taklifi.", cat: "moliya", color: "#E879F9", icon: "🔑" },
  ];

  const IG_MODS = [
    { l: " Instagram Tahlil", p: "Instagram akkaunt to'liq tahlili: Followers soni va o'sish trendi, o'rtacha engagement rate (likes+comments/followers×100%), eng yaxshi 5 post (raqamlar bilan), auditoriya faolligi qaysi vaqtda yuqori. KPI jadval: Followers | Reach | Engagement% | O'sish%. Kontent strategiyasi — nima ishlayapti, nima ishlamayapti.", cat: "instagram", color: "#E879F9", icon: "" },
    { l: " Engagement Tahlil", p: "Har bir post uchun engagement rate hisoblash va jadval: Post | Likes | Comments | Views | ER%. Qaysi turdagi postlar (rasm, video, karusel) eng yuqori ER% beradi — solishtirma jadval. Eng yaxshi 3 post vs eng yomon 3 post — farq sababi. Engagement oshirish uchun 3 ta aniq tavsiya.", cat: "instagram", color: "#F87171", icon: "" },
    { l: " Post Vaqti Tahlil", p: "Postlar chiqarilgan kun va soat bo'yicha engagement tahlili. Qaysi kunlar (Dushanba-Yakshanba) eng ko'p like/izoh oladi — jadval. Qaysi soatlar eng samarali. Optimal haftalik post jadvalini tavsiya qil: Kun | Soat | Kontent turi.", cat: "instagram", color: "#4ADE80", icon: "" },
    { l: " Kontent Strategiya", p: "Kontent turlarini tahlil qil — raqamlar asosida qaysi mavzular va formatlar eng ko'p engagement beradi. Top 5 mavzu engagement bo'yicha. 30 kunlik kontent kalendar: Sana | Mavzu | Format | Maqsad. O'sish uchun 3 ta darhol amaliy qaror.", cat: "instagram", color: "#EC4899", icon: "" },
    { l: " Followers O'sish", p: "Followers o'sish trendi tahlili — oylar bo'yicha jadval. Qanday postlardan keyin ko'proq obunachilar qo'shilgan? Eng samarali kontent toifasi. Keyingi 3 oyda followers maqsadiga yetish rejasi — raqamlar bilan.", cat: "instagram", color: "#FB923C", icon: "" },
  ];

  const TG_MODS = [
    { l: " Kanal Tahlili", p: "Telegram kanal to'liq tahlili: obunachilar soni va o'sish trendi, o'rtacha ko'rishlar, engagement rate (views/subscribers%), eng ko'p ko'rilgan 5 post. KPI jadval: Subscribers | Avg Views | ER% | O'sish%. Qaysi kontent turi (matn/rasm/video/anketa) samaraliroq — raqamlar bilan. 3 ta o'sish tavsiyasi.", cat: "telegram", color: "#38BDF8", icon: "" },
    { l: " Post Samaradorligi", p: "Kanal postlarini tahlil qil: top-10 post ko'rishlar bo'yicha jadval (Post | Ko'rishlar | Reaktsiya | ER%). Kontent turlari bo'yicha o'rtacha ko'rish solishtirmasi. Optimal post uzunligi (qisqa/o'rta/uzun) qaysi biri ko'proq o'qiladi. Eng samarali post chiqarish vaqti.", cat: "telegram", color: "#4ADE80", icon: "" },
    { l: " Auditoriya Tahlili", p: "Telegram kanal auditoriyasi tahlili: obunachilar oylik o'sish jadvali (Oy | Obunachilar | O'zgarish | ER%). Ko'rish/obunachi nisbati trendi. Qaysi postlardan keyin o'sish bo'lgan. Auditoriyani ushlab turish uchun 3 ta amaliy strategiya — har biri kutilgan natija bilan.", cat: "telegram", color: "#E879F9", icon: "" },
  ];

  const CRM_MODS = [
    { l: " CRM Umumiy Tahlil", p: "O'quv markaz CRM to'liq tahlili. KPI jadval: Jami lidlar | Konversiya% | Faol o'quvchilar | Guruhlar to'liqligi% | Umumiy daromad. Lidlar pipeline — qaysi bosqichda to'xtab qolmoqda. Guruhlar to'liqligi holati (🟢🟡🔴). Eng samarali va past samarali o'qituvchilar. Filiallar solishtirmasi. Top-3 muammo + har biriga aniq yechim.", cat: "crm", color: "#8B5CF6", icon: "" },
    { l: " Lidlar Pipeline", p: "CRM lidlar tahlili: Bosqich | Lidlar soni | Konversiya% | O'rtacha vaqt jadval. Qaysi bosqichda eng ko'p lid to'xtab qolmoqda — sababi va yechimi. Qaysi manba (Instagram/Telegram/Referral) eng sifatli lid bermoqda. Liddan o'quvchiga aylantirish konversiyasini oshirish — 3 ta aniq tavsiya + kutilgan +X% natija.", cat: "crm", color: "#F87171", icon: "" },
    { l: " Guruhlar Tahlili", p: "Guruhlar to'liqligi tahlili: Guruh | Fan | O'qituvchi | O'quvchilar | Kapasite | To'liqlik% jadval. Qaysi guruhlar to'la (🟢), o'rta (🟡), bo'sh (🔴). Eng ko'p talab bo'lgan fan va filial. Bo'sh guruhlarni to'ldirish uchun 3 ta aniq chora. Yangi guruh ochish tavsiyasi — qaysi fanda, qaysi filialda.", cat: "crm", color: "#4ADE80", icon: "" },
    { l: " O'qituvchilar KPI", p: "O'qituvchilar samaradorligi jadvali: O'qituvchi | Guruhlar | O'quvchilar | Daromad | Maosh | Rentabellik%. Eng samarali (yuksak rentabellik) va kam yukli o'qituvchilarni aniqlash. Maosh/o'quvchi nisbati anomaliyalari. Yuk taqsimlash tavsiyasi — kim ko'proq guruh olishi mumkin. Rag'batlantirish tizimi taklifi.", cat: "crm", color: "#FBBF24", icon: "" },
    { l: " Moliyaviy Tahlil", p: "O'quv markaz moliyaviy tahlili: Umumiy daromad, maosh xarajatlari, ijara, foyda, foyda foizi — KPI jadval. Filiallar bo'yicha rentabellik solishtirma: Filial | Daromad | Xarajat | Foyda | Marja%. Qaysi filial zarar ko'rmoqda — sababi. To'lov qilinmagan qarzlar (nasiya) holati. Narx optimizatsiya — qaysi guruhlar narxini oshirish mumkin.", cat: "crm", color: "#4ADE80", icon: "" },
    { l: " Filiallar Solishtirma", p: "Filiallar bo'yicha to'liq solishtirma tahlil jadvali: Filial | O'quvchilar | Guruhlar | O'qituvchilar | Daromad | Marja% | O'sish%. Eng yaxshi filial nima qilyapti to'g'ri — boshqalar uchun dars. Eng yomon filial muammosi — sababi + yechimi. Filiallar reytingi + har birining 1 ta prioritet vazifasi.", cat: "crm", color: "#60A5FA", icon: "" },
  ];

  const hasCRM = connectedSources.some(s => s.type === "crm");

  const allMods = [
    ...BASE_MODS,
    ...(hasIG ? IG_MODS : []),
    ...(hasTG ? TG_MODS : []),
    ...(hasCRM ? CRM_MODS : []),
  ];

  const modCats = [...new Set(allMods.map(m => m.cat))];
  const [modCat, setModCat] = useState("all");
  const MOD_CAT_LABELS = { all: "Hammasi", biznes: "Biznes", moliya: "Moliya", tahlil: "Tahlil", strategiya: "Strategiya", prognoz: "Prognoz", tezkor: "Tezkor", instagram: "Instagram", telegram: "Telegram", crm: "CRM" };
  const filteredMods = modCat === "all" ? allMods : allMods.filter(m => m.cat === modCat);

  // Tahlil natijasi uchun mos chartlar
  const relatedCharts = useMemo(() => {
    if (!activeMod || !allCards.length) return [];
    const cat = activeMod.cat;
    // Instagram tahlil uchun instagram chartlarni, aks holda hammasini ko'rsat
    if (cat === "instagram") return allCards.filter(c => c.type === "chart" || c.type === "gauge").slice(0, 4);
    if (cat === "telegram") return allCards.filter(c => c.type === "chart" || c.type === "gauge").slice(0, 4);
    return allCards.filter(c => c.type === "chart").slice(0, 3);
  }, [activeMod, allCards]);

  return (
    <div>
      {/* ── Tab tanlash: Tahlil / Chartlar ── */}
      <div className="flex gap8 mb16 aic">
        <button className={`btn ${anaTab === "tahlil" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAnaTab("tahlil")}>
          AI Tahlil Modullari
        </button>
        <button className={`btn ${anaTab === "chartlar" ? "btn-teal" : "btn-ghost"}`} onClick={() => setAnaTab("chartlar")}>
          Vizual Tahlil (Grafiklar)
        </button>
        {connectedSources.length > 0 && (
          <span className="badge b-ok ml-auto">{connectedSources.length} ta manba ulangan</span>
        )}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 1: AI TAHLIL MODULLARI ══ */}
      {/* ════════════════════════════════════════════ */}
      {anaTab === "tahlil" && (<div>
        {/* Ogohlantirish */}
        {connectedSources.length === 0 && <div className="notice" style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>Data Hub</b> dan manba ulang — tahlil shu ma'lumotlar asosida ishlaydi</div>
        </div>}
        {!aiConfig.apiKey && <div className="notice" style={{ padding: "12px 16px", border: "1px solid rgba(255,209,102,0.3)", borderRadius: 10, color: "var(--gold)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>AI Sozlamalar</b> sahifasida API kalitni kiriting</div>
        </div>}

        {/* Ulangan manbalar xulosa */}
        {connectedSources.length > 0 && (
          <div className="card" style={{ marginBottom: 14, background: "var(--s1)" }}>
            <div className="card-title mb10"> Ulangan Manbalar</div>
            <div className="flex gap8 flex-wrap">
              {connectedSources.map(s => {
                const st = SOURCE_TYPES[s.type];
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--s2)", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }}>
                    <span style={{ fontSize: 16 }}>{st.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{st.label} — {s.data?.length || 0} ta yozuv</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kategoriya filtrlari */}
        <div className="flex gap5 mb12 flex-wrap">
          {["all", ...modCats].map(c => (
            <button key={c} className="qcat" onClick={() => setModCat(c)}
              style={modCat === c ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.1)", padding: "5px 12px", fontSize: 10 } : { padding: "5px 12px", fontSize: 10 }}>
              {MOD_CAT_LABELS[c] || c}
            </button>
          ))}
        </div>

        {/* ── Tahlil modullari grid ── */}
        <div className="section-hd mb10">Tayyor Tahlil Modullari</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10, marginBottom: 18 }}>
          {filteredMods.map((m, i) => (
            <button key={i} disabled={loading} onClick={() => run(m)}
              style={{
                background: loading && activeLabel === m.l ? `${m.color}15` : "var(--s2)",
                border: `1px solid ${loading && activeLabel === m.l ? m.color + "50" : "var(--border)"}`,
                borderRadius: 12, padding: "16px 18px", cursor: loading ? "not-allowed" : "pointer",
                textAlign: "left", transition: "all .25s var(--ease)", position: "relative", overflow: "hidden",
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = m.color + "50"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${m.color}15`; } }}
              onMouseLeave={e => { if (!loading) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
            >
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${m.color}60,transparent)` }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: loading && activeLabel === m.l ? m.color : "var(--text)" }}>{m.l.replace(/^[^\s]+\s/, "")}</div>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.6 }}>{m.p.substring(0, 80)}...</div>
              {loading && activeLabel === m.l && (
                <div style={{ position: "absolute", top: 10, right: 12 }}><div className="typing-ind"><span /><span /><span /></div></div>
              )}
            </button>
          ))}
        </div>

        {/* ── Loading holati ── */}
        <AiProgressBar loading={loading} />

        {/* ── Tahlil natijasi + aloqador chartlar ── */}
        {result && !loading && (
          <div>
            {/* AI natijasi */}
            <div className="card" style={{ borderColor: `${activeMod?.color || prov.color}20`, marginBottom: 14 }}>
              <div className="flex aic jb mb12" style={{ flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{activeMod?.icon || ""}</span>
                  <div>
                    <div className="card-title" style={{ marginBottom: 0 }}>{activeLabel}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>{new Date().toLocaleDateString("uz-UZ")} | {prov.name}</div>
                  </div>
                </div>
                <div className="flex gap4 flex-wrap">
                  <button className="chat-export-btn" title="Nusxalash" onClick={async () => {
                    try { await navigator.clipboard.writeText(result); alert("Nusxalandi!"); } catch { alert("Nusxalab bo'lmadi"); }
                  }}> Nusxa</button>
                  <button className="chat-export-btn" title="Yuklab olish" onClick={() => {
                    const blob = new Blob([`${activeLabel}\n${"═".repeat(40)}\n\n${result}`], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob); const a = document.createElement("a");
                    a.href = url; a.download = `Analix_${activeLabel.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
                    a.click(); URL.revokeObjectURL(url);
                  }}> TXT</button>
                  <button className="chat-export-btn" title="PDF chop etish" onClick={() => {
                    // Tahlil uchun PDF — ReportsPage dagi pdf funksiyani qayta ishlatish
                    const mdToH = (text) => String(text).split("\n").map(line => {
                      const t = line.trim();
                      if (!t) return '<div style="height:8px"></div>';
                      if (t === "---" || t === "***") return '<hr style="border:none;border-top:2px solid #E0E0E0;margin:16px 0">';
                      if (t.startsWith("### ")) return `<h3 style="font-size:13px;font-weight:700;color:#4A5568;margin:14px 0 6px;border-left:3px solid #805AD5;padding-left:10px">${t.slice(4)}</h3>`;
                      if (t.startsWith("## ")) return `<h2 style="font-size:15px;font-weight:800;color:#0D9488;margin:18px 0 8px;border-left:4px solid #0D9488;padding-left:10px">${t.slice(3)}</h2>`;
                      if (t.startsWith("# ")) return `<h1 style="font-size:18px;font-weight:800;color:#1A202C;margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid;border-image:linear-gradient(90deg,#0D9488,#B8860B,transparent) 1">${t.slice(2)}</h1>`;
                      if (t.startsWith("> ")) return `<div style="border-left:3px solid #0D9488;padding:10px 14px;margin:8px 0;background:#F0FDFA;border-radius:0 8px 8px 0;color:#2D3748">${t.slice(2).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`;
                      if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) return `<div style="padding-left:16px;margin:3px 0"><span style="color:#0D9488;font-weight:bold;margin-right:6px">●</span>${t.slice(2).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`;
                      const nm = t.match(/^(\d+)\.\s(.+)/);
                      if (nm) return `<div style="padding-left:22px;margin:3px 0;position:relative"><span style="position:absolute;left:0;color:#B8860B;font-weight:800">${nm[1]}.</span>${nm[2].replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`;
                      if (t.startsWith("|") && t.endsWith("|")) { if (t.replace(/[|\-\s:]/g, "").length === 0) return ""; const cells = t.split("|").filter(c => c.trim()).map(c => c.trim()); return `<tr>${cells.map(c => `<td style="padding:8px 14px;border-bottom:1px solid #EDF2F7;font-size:12px">${c.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</td>`).join("")}</tr>`; }
                      return `<div style="margin:3px 0;line-height:1.75">${t.replace(/\*\*(.+?)\*\*/g, '<b style="color:#1A202C">$1</b>')}</div>`;
                    }).join("\n");
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;font-size:13px;line-height:1.75;color:#2D3748;padding:48px 56px;max-width:820px;margin:0 auto}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;border:1px solid #E2E8F0;border-radius:8px}table tr:first-child td{font-weight:700;color:#0D9488;border-bottom:2px solid #0D9488;background:#F0FDFA;text-transform:uppercase;font-size:10px;letter-spacing:1px}table tr:nth-child(even){background:#F7FAFC}@media print{body{padding:24px 32px}}</style></head><body><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid;border-image:linear-gradient(90deg,#0D9488,#B8860B,transparent) 1"><div><div style="font-size:24px;font-weight:800;color:#1A202C">ANA<span style="color:#B8860B">LIX</span></div><div style="font-size:9px;color:#A0AEC0;text-transform:uppercase;letter-spacing:3px">AI Tahlil</div></div><div style="text-align:right"><div style="font-size:17px;font-weight:700;color:#2D3748">${activeLabel}</div><div style="font-size:10px;color:#718096">${new Date().toLocaleDateString("uz-UZ")} · ${prov.name}</div></div></div><div>${mdToH(result)}</div><div style="margin-top:36px;padding-top:16px;border-top:2px solid #EDF2F7;font-size:9px;color:#A0AEC0;text-align:center">Analix · analix.uz</div></body></html>`;
                    const iframe = document.createElement("iframe");
                    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:820px;height:1100px";
                    document.body.appendChild(iframe);
                    iframe.contentDocument.write(html); iframe.contentDocument.close();
                    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000); }, 800);
                  }} style={{ borderColor: "rgba(251,113,133,0.3)", color: "var(--red)" }}> PDF</button>
                </div>
              </div>
              <RenderMD text={result} />
            </div>

            {/* Aloqador chartlar */}
            {relatedCharts.length > 0 && (
              <div>
                <div className="section-hd mb10"> Aloqador Grafiklar</div>
                <CardGrid cards={relatedCharts} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_ana_rel"} />
              </div>
            )}
          </div>
        )}
      </div>)}

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 2: VIZUAL TAHLIL (GRAFIKLAR) ══ */}
      {/* ════════════════════════════════════════════ */}
      {anaTab === "chartlar" && (<div>
        {/* Manba tanlash */}
        {connectedSources.length > 0 && (
          <div className="flex gap6 mb14 aic flex-wrap">
            <span className="text-xs text-muted" style={{ fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2 }}>Manba:</span>
            {connectedSources.map(s => {
              const st = SOURCE_TYPES[s.type];
              return (
                <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { setSelectedSrc(s.id); setChartOverrides({}); }}
                  style={workingSource?.id === s.id ? { borderColor: s.color || st.color, color: s.color || st.color, background: `${s.color || st.color}0F` } : {}}>
                  {st.icon} {s.name} <span className="badge b-ok" style={{ fontSize: 8, marginLeft: 4 }}>{s.data?.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {connectedSources.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}></div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Grafiklar avtomatik yaratiladi</div>
            <div className="text-muted text-sm">Data Hub dan manba ulang — Excel, Instagram, Telegram yoki API</div>
          </div>
        )}

        {/* Umumiy ko'rsatkichlar */}
        {workingSource && (
          <div className="g4 mb14">
            {[
              { l: "Yozuvlar", v: (workingSource.data?.length || 0).toLocaleString(), c: "var(--teal)", i: "" },
              { l: "Grafiklar", v: allCards.filter(c => c.type === "chart").length, c: "var(--green)", i: "" },
              { l: "Statistika", v: allCards.filter(c => c.type === "stats").length, c: "var(--gold)", i: "" },
              { l: "Jami Kartalar", v: allCards.length, c: "var(--purple)", i: "" },
            ].map((c, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.c}80,transparent)` }} />
                <div style={{ fontSize: 16, marginBottom: 6, color: c.c }}>{c.i}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: c.c, lineHeight: 1 }}>{c.v}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 5 }}>{c.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Barcha kartalar */}
        {allCards.length > 0 && (
          <CardGrid cards={allCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_ana_all"} />
        )}
      </div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REPORTS PAGE (PDF + Excel + TXT eksport)
// ─────────────────────────────────────────────────────────────
function ReportsPage({ aiConfig, sources, user, onAiUsed }) {
  const prov = AI_PROVIDERS[aiConfig.provider];
  const connectedSources = sources.filter(s => s.connected && s.active && s.data?.length > 0);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [activeMod, setActiveMod] = useState(null);
  const [repTab, setRepTab] = useState("hisobotlar"); // hisobotlar | tarix | vizual
  const [selectedSrc, setSelectedSrc] = useState(null);
  const [chartOverrides, setChartOverrides] = useState({});
  const [repCat, setRepCat] = useState("all");
  const repKey = "u_" + (user?.id || "anon") + "_reports";

  const savedReports = LS.get(repKey, []);
  const workingSource = selectedSrc ? sources.find(s => s.id === selectedSrc) : connectedSources[0];
  const allCards = useMemo(() => workingSource ? generateDashboards(workingSource) : [], [workingSource?.id, workingSource?.data?.length, workingSource?.updatedAt]);
  const setChartOverride = (cardId, type) => setChartOverrides(prev => ({ ...prev, [cardId]: type }));

  const hasIG = connectedSources.some(s => s.type === "instagram");
  const hasTG = connectedSources.some(s => s.type === "telegram");

  const isPersonal = !!aiConfig.isPersonal;
  const gen = async (mod) => {
    if (!aiConfig.apiKey) { alert("AI ulanmagan. Admin global AI sozlashi yoki AI Sozlamalardan shaxsiy API kalit kiriting."); return; }
    // Hisobot limiti
    if (!isPersonal && user?.role !== "admin" && user?.role !== "super_admin" && !Auth.checkLimit(user, "reports", sources)) {
      const info = Auth.getLimitInfo(user, "reports", sources);
      alert(`Hisobot limiti tugadi (${info.label}). Eski hisobotlarni o'chiring yoki tarifni yangilang.`);
      return;
    }
    // AI so'rov limiti
    if (!isPersonal && user && !Auth.checkLimit(user, "ai_requests", sources)) {
      const info = Auth.getLimitInfo(user, "ai_requests", sources);
      alert(`AI so'rov limiti tugadi (${info.label}). Tarifni yangilang yoki shaxsiy API kalit ulang.`);
      return;
    }
    setLoading(true); setReport(""); setLabel(mod.l); setActiveMod(mod);
    const today = new Date().toLocaleDateString("uz-UZ");
    // SMART CONTEXT — Backend dan aqlli qidiruv
    let ctx = "";
    if (Token.get() && connectedSources.length > 0) {
      try {
        const smartResult = await SourcesAPI.getSmartContext(connectedSources.map(s => s.id), mod.l);
        if (smartResult?.context) ctx = smartResult.context;
      } catch (e) { console.warn("[HISOBOT-CTX] fallback:", e.message); ctx = buildMergedContext(connectedSources); }
    }
    if (!ctx) ctx = buildMergedContext(connectedSources);
    const srcInfo = connectedSources.map(s => `${s.name} (${SOURCE_TYPES[s.type]?.label || s.type}, ${s.data?.length || 0} ta yozuv)`).join(", ");
    const prompt = mod.fn(today) + `\n\nUlangan manbalar: ${srcInfo || "hech qanday manba ulanmagan"}` + (ctx ? `\n\nMA'LUMOTLAR:\n${ctx}` : "") + `

HISOBOT FORMATI (QATIY AMAL QILINSIN):

## 📊 Executive Xulosa
> 3 ta eng muhim raqam — birinchi ko'rish uchun (masalan: Daromad 3.77B ↑12%, Xarajat 2.1B ↑10%, Sof foyda 1.67B ↑14%)

## 📈 KPI Jadvali
| Ko'rsatkich | Joriy davr | O'tgan davr | O'zgarish | Holat |
|-------------|-----------|-------------|-----------|-------|
| [Real raqam] | [qiymat] | [qiymat] | +X% ↑ / -X% ↓ | 🟢/🟡/🔴 |

## 🔍 Chuqur Tahlil
[Segment / kategoriya / vaqt bo'yicha breakdown — aniq raqamlar bilan]

## ⚠️ Muammolar va Xavflar *(faqat muammo bo'lsa)*
> 🔴 [Muammo] — [raqam] — sabab: [...] — ta'sir: [XM so'm yo'qotish]

## 💡 Amaliy Qarorlar
| # | Tavsiya | Asoslanishi | Kutilgan natija |
|---|---------|-------------|-----------------|
| 1 | Aniq harakat | Real raqam | +X% yoki XM so'm |

## 🔮 Prognoz
[Keyingi oy/kvartal bashorat — trend asosida, raqam bilan]

---
QOIDALAR: O'zbek tilida | Faqat haqiqiy raqamlar (O'YLAB CHIQARMA) | Raqam formati: 1500000→"1.5M so'm" | Holat: 🟢 yaxshi / 🟡 e'tibor / 🔴 muammo | Har tavsiya = harakat + natija + muddat`;
    try {
      let full = "";
      await callAI([{ role: "user", content: prompt }], aiConfig, c => { full = c; setReport(c); });
      if (!isPersonal && onAiUsed) onAiUsed();
      // Tarixga saqlash
      const entry = { id: Date.now(), text: full, date: today, label: mod.l, icon: mod.icon, cat: mod.cat, createdAt: new Date().toISOString() };
      const prev = LS.get(repKey, []);
      const updated = [entry, ...prev].slice(0, 20); // Oxirgi 20 ta
      LS.set(repKey, updated);
      LS.set("u_" + (user?.id || "anon") + "_last_report", { text: full, date: today, label: mod.l });
    } catch (e) { setReport("\u274C " + e.message); }
    setLoading(false);
  };

  // ── Eksport funksiyalari ──
  const checkExportLimit = () => {
    if (user?.role === "admin" || user?.role === "super_admin") return true;
    const plan = PLANS[user?.plan || "free"];
    if (!plan?.limits?.export) {
      alert("Export funksiyasi faqat Boshlang'ich tarifdan boshlab ishlaydi. Tarifni yangilang.");
      return false;
    }
    return true;
  };
  const exportTXT = (text, lbl) => {
    if (!checkExportLimit()) return;
    const t = text || report; const l = lbl || label;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`${l}\n${"═".repeat(50)}\nSana: ${new Date().toLocaleDateString("uz-UZ")}\nAI: ${prov.name}\n${"═".repeat(50)}\n\n${t}`], { type: "text/plain;charset=utf-8" }));
    a.download = `Analix_${l.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
  };

  const exportExcel = (text, lbl) => {
    const t = text || report; const l = lbl || label;
    const lines = t.split("\n").filter(ln => ln.trim());
    const rows = lines.map(line => {
      const isHeader = line.startsWith("#") || line.match(/^[A-Z0-9\u0400-\u04FF ]{5,}:/) || line.match(/^[\d]+\./) || line.match(/^[-\u2022*]/);
      return { Tur: isHeader ? "Sarlavha" : "Matn", Matn: line.replace(/^[#\-\u2022*\d.]\s*/, "").trim() };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 120 }];
    XLSX.utils.sheet_add_aoa(ws, [[`${l} — ${new Date().toLocaleDateString("uz-UZ")} — Analix`]], { origin: "A1" });
    XLSX.utils.book_append_sheet(wb, ws, "Hisobot");
    const wsRaw = XLSX.utils.aoa_to_sheet([[t]]);
    XLSX.utils.book_append_sheet(wb, wsRaw, "To'liq Matn");
    XLSX.writeFile(wb, `Analix_${l.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Markdown ni HTML ga aylantirish (PDF uchun)
  const mdToHtml = (text) => {
    return String(text).split("\n").map(line => {
      const t = line.trim();
      if (!t) return '<div style="height:8px"></div>';
      if (t === "---" || t === "***") return '<hr style="border:none;border-top:2px solid #E0E0E0;margin:16px 0">';
      if (t.startsWith("### ")) return `<h3 style="font-size:14px;font-weight:700;color:#2D3748;margin:16px 0 6px;border-left:3px solid #805AD5;padding-left:10px">${t.slice(4)}</h3>`;
      if (t.startsWith("## ")) return `<h2 style="font-size:16px;font-weight:800;color:#0D9488;margin:18px 0 8px;border-left:4px solid #0D9488;padding-left:10px">${t.slice(3)}</h2>`;
      if (t.startsWith("# ")) return `<h1 style="font-size:18px;font-weight:800;color:#1A202C;margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid #0D9488">${t.slice(2)}</h1>`;
      if (t.startsWith("> ")) return `<div style="border-left:3px solid #0D9488;padding:8px 14px;margin:8px 0;background:#F0FDFA;border-radius:0 6px 6px 0;color:#2D3748;font-style:italic">${fmtPdf(t.slice(2))}</div>`;
      if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) return `<div style="padding-left:16px;margin:3px 0;position:relative"><span style="position:absolute;left:4px;color:#0D9488;font-weight:bold">●</span>${fmtPdf(t.slice(2))}</div>`;
      const numM = t.match(/^(\d+)\.\s(.+)/);
      if (numM) return `<div style="padding-left:20px;margin:3px 0;position:relative"><span style="position:absolute;left:0;color:#B8860B;font-weight:800;font-size:12px">${numM[1]}.</span>${fmtPdf(numM[2])}</div>`;
      // Table
      if (t.startsWith("|") && t.endsWith("|")) {
        if (t.replace(/[|\-\s:]/g, "").length === 0) return "";
        const cells = t.split("|").filter(c => c.trim()).map(c => c.trim());
        return `<tr>${cells.map(c => `<td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;font-size:12px">${fmtPdf(c)}</td>`).join("")}</tr>`;
      }
      return `<div style="margin:3px 0;line-height:1.7">${fmtPdf(t)}</div>`;
    }).join("\n");
  };
  const fmtPdf = (s) => {
    let r = s.replace(/\*\*(.+?)\*\*/g, '<b style="color:#1A202C">$1</b>');
    r = r.replace(/\*(.+?)\*/g, '<i>$1</i>');
    r = r.replace(/`(.+?)`/g, '<code style="background:#EDF2F7;padding:2px 6px;border-radius:4px;font-size:11px;color:#0D9488">$1</code>');
    return r;
  };

  const exportPDF = (text, lbl) => {
    if (!checkExportLimit()) return;
    const t = text || report; const l = lbl || label;
    const contentHtml = mdToHtml(t);
    const today = new Date();
    const dateStr = today.toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = today.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Inter,sans-serif;font-size:13px;line-height:1.75;color:#2D3748;padding:0;max-width:100%}
      .page{padding:48px 56px;max-width:820px;margin:0 auto}
      table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;border-radius:8px;overflow:hidden;border:1px solid #E2E8F0}
      table tr:first-child td,table thead th{font-weight:700;color:#0D9488;border-bottom:2px solid #0D9488;text-transform:uppercase;font-size:10px;letter-spacing:1px;padding:10px 14px;background:#F0FDFA}
      table td{padding:8px 14px;border-bottom:1px solid #EDF2F7}
      table tr:nth-child(even){background:#F7FAFC}
      table tr:hover{background:#EDF2F7}
      h1{font-size:18px;font-weight:800;color:#1A202C;margin:24px 0 10px;padding-bottom:8px;border-bottom:2px solid;border-image:linear-gradient(90deg,#0D9488,#B8860B,transparent) 1}
      h2{font-size:15px;font-weight:800;color:#0D9488;margin:20px 0 8px;padding-left:12px;border-left:4px solid #0D9488}
      h3{font-size:13px;font-weight:700;color:#4A5568;margin:16px 0 6px;padding-left:10px;border-left:3px solid #805AD5}
      @media print{body{padding:0}.page{padding:24px 32px}.header{break-after:avoid}.footer{break-before:avoid;margin-top:20px}}
    </style></head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header" style="margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #0D9488;position:relative">
          <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0D9488,#B8860B,transparent)"></div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between">
            <div>
              <div style="font-size:24px;font-weight:800;color:#1A202C;letter-spacing:-0.5px">ANA<span style="color:#B8860B">LIX</span></div>
              <div style="font-size:9px;color:#A0AEC0;text-transform:uppercase;letter-spacing:3px;margin-top:2px">AI Biznes Tahlil Platformasi</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:17px;font-weight:700;color:#2D3748;margin-bottom:4px">${l}</div>
              <div style="font-size:10px;color:#718096">${dateStr} · ${timeStr}</div>
              <div style="font-size:9px;color:#A0AEC0;margin-top:2px">${prov.name} orqali yaratilgan</div>
            </div>
          </div>
        </div>
        <!-- Content -->
        <div style="min-height:600px">${contentHtml}</div>
        <!-- Footer -->
        <div class="footer" style="margin-top:36px;padding-top:16px;border-top:2px solid #EDF2F7">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:9px;color:#A0AEC0">Analix · analix.uz · AI-powered biznes tahlil</div>
            <div style="font-size:9px;color:#A0AEC0">${dateStr}</div>
          </div>
        </div>
      </div>
    </body></html>`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:820px;height:1100px";
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html); iframe.contentDocument.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000); }, 800);
  };

  const copyText = async (text) => {
    const t = text || report;
    try { await navigator.clipboard.writeText(t); alert("Nusxalandi!"); } catch { alert("Nusxalab bo'lmadi"); }
  };

  // ── Hisobot modullari ──
  const BASE_TYPES = [
    {
      icon: "", l: "Kundalik Hisobot", d: "Bugungi ko'rsatkichlar, muammolar va tavsiyalar", cat: "davr", color: "#4ADE80",
      fn: d => `Bugun ${d} uchun kundalik biznes hisobot yoz. Bo'limlar: 1) Bugungi asosiy ko'rsatkichlar (jadval) 2) Muammolar va xatarlar 3) Imkoniyatlar 4) Ertangi kun uchun aniq tavsiyalar. Har bo'limni raqamla.`
    },
    {
      icon: "", l: "Haftalik Hisobot", d: "Haftalik tendensiya, maqsadlarga erishish", cat: "davr", color: "#60A5FA",
      fn: () => "Haftalik biznes hisobot yoz. Bo'limlar: 1) Haftalik asosiy natijalar (jadval) 2) O'tgan hafta bilan taqqoslash (+/-%) 3) Maqsadlarga erishish foizi 4) Muammoli sohalar 5) Kelgusi hafta rejalari va maqsadlar."
    },
    {
      icon: "", l: "Oylik Hisobot", d: "Moliyaviy natijalar va strategik rejalar", cat: "davr", color: "#A78BFA",
      fn: () => "Oylik moliyaviy va operatsion hisobot yoz. Bo'limlar: 1) Moliyaviy natijalar (jadval) 2) Mijozlar ko'rsatkichlari 3) Jamoaviy unumdorlik 4) Oy maqsadlari bajarilishi (%) 5) Keyingi oy strategiyasi va KPI maqsadlari."
    },
    {
      icon: "", l: "Choraklik Hisobot", d: "3 oylik natijalar va yo'nalish", cat: "davr", color: "#E879F9",
      fn: () => "Choraklik (3 oylik) hisobot yoz. Bo'limlar: 1) Chorak davomidagi umumiy natijalar 2) Eng muhim yutuqlar va muvaffaqiyatsizliklar 3) KPI jadval (maqsad vs haqiqiy) 4) Keyingi chorak strategiyasi."
    },
    {
      icon: "", l: "Xavf va Risk Tahlili", d: "Xatarlar, ehtimollik va oldini olish", cat: "tahlil", color: "#F87171",
      fn: () => "Biznes xatarlari va risk tahlili. Har xatar uchun jadval: Xatar nomi | Ehtimolligi (1-10) | Ta'sir darajasi (1-10) | Risk balli | Oldini olish chorasi | Mas'ul shaxs. Kamida 8 ta xatarni ko'rsat."
    },
    {
      icon: "", l: "Imkoniyat va O'sish", d: "Yangi yo'nalishlar va daromad imkoniyatlari", cat: "tahlil", color: "#00C9BE",
      fn: () => "Biznes imkoniyatlari va o'sish yo'nalishlari. Har imkoniyat uchun: Tavsif, Potensial daromad ($), Amalga oshirish muddati, Zarur investitsiya, ROI bashorat (%), Ustuvorlik darajasi (Yuqori/O'rta/Past)."
    },
    {
      icon: "", l: "Moliyaviy Tahlil", d: "Daromad, xarajat, foyda tuzilmasi", cat: "moliya", color: "#FB923C",
      fn: () => "To'liq moliyaviy tahlil hisoboti. Bo'limlar: 1) Daromad tuzilmasi (jadval) 2) Xarajatlar taqsimoti 3) Foyda marginlari 4) Cash flow bashorat 5) Tejash imkoniyatlari (aniq summa bilan) 6) Investitsiya tavsiyalari."
    },
    {
      icon: "", l: "Mijozlar Hisoboti", d: "Segmentatsiya, LTV va retention", cat: "tahlil", color: "#38BDF8",
      fn: () => "Mijozlar tahlili hisoboti. Bo'limlar: 1) Mijozlar segmentatsiyasi (jadval) 2) Har segment uchun LTV 3) Retention rate 4) Churn risk 5) Eng qimmatli mijozlar profili 6) Mijoz jalb qilish strategiyasi."
    },
    {
      icon: "", l: "Raqobat Tahlili", d: "Bozor holati va raqobatchilar", cat: "strategiya", color: "#EC4899",
      fn: () => "Raqobat tahlili hisoboti. Bo'limlar: 1) Bozor umumiy holati 2) Asosiy raqobatchilar va ularning kuchli/zaif tomonlari (jadval) 3) Bizning ustunliklarimiz 4) Bozor ulushi bashorat 5) Raqobat strategiyasi."
    },
    {
      icon: "", l: "Strategik Reja", d: "Qisqa va uzoq muddatli strategiya", cat: "strategiya", color: "#FBBF24",
      fn: () => "Strategik reja hisoboti. Bo'limlar: 1) Hozirgi holat (SWOT jadval) 2) Qisqa muddatli maqsadlar (1-3 oy) 3) O'rta muddatli maqsadlar (3-6 oy) 4) Uzoq muddatli strategiya (6-12 oy) 5) Har maqsad uchun KPI va mas'ul shaxs."
    },
    {
      icon: "💸", l: "Narx Strategiyasi", d: "Narxlar, marja va raqobat tahlili", cat: "moliya", color: "#A78BFA",
      fn: (today) => `Narx strategiyasi hisoboti (${today}). Bo'limlar: 1) Mahsulot/xizmatlar narx-marja jadvali: Tovar | Narx | Tannarx | Marja | Marja% 2) Qaysi pozitsiyada narxni oshirish mumkin — +X% oshirsa +XM so'm qo'shimcha foyda 3) Chegirma va aksiyalar samaradorligi tahlili 4) Raqobatchilar narxlari bilan solishtirma (sanoat o'rtacha) 5) Optimal narx modeli tavsiyasi.`
    },
    {
      icon: "💳", l: "Qarzdorlar Hisoboti", d: "To'lovlar, qarzlar va muddatlar", cat: "moliya", color: "#F87171",
      fn: (today) => `Qarzdorlar va to'lovlar hisoboti (${today}). Bo'limlar: 1) Umumiy qarzdorlik summasi va dinamikasi 2) Qarzdorlar ro'yxati top-10: Mijoz | Summa | Muddat | Kechikish kunlari | Holat(🟢🟡🔴) 3) Muddati o'tgan qarzlar — jami summa, ulushi % 4) To'lov usullari bo'yicha taqsimot (naqd/karta/online) 5) Inkasso harakatlari rejasi — qaysi qarzdordan qanday yondashuv.`
    },
    {
      icon: "👥", l: "HR & Xodimlar", d: "Xodimlar samaradorligi va maosh tahlili", cat: "tahlil", color: "#4ADE80",
      fn: (today) => `HR va xodimlar hisoboti (${today}). Bo'limlar: 1) Xodimlar KPI jadvali: Xodim | Lavozim | Yaratgan daromad | Maosh | ROI% 2) O'rtacha bir xodim uchun daromad va xarajat nisbati 3) Eng samarali va kam samarali xodimlar tahlili 4) Yuk taqsimoti optimalmi — kimda haddan ortiq, kimda kam yuk 5) Rag'batlantirish tizimi taklifi — natijaga yo'naltirilgan.`
    },
    {
      icon: "🎯", l: "OKR & Maqsadlar", d: "Maqsad vs haqiqiy natijalar", cat: "strategiya", color: "#00C9BE",
      fn: (today) => `OKR va KPI maqsadlar hisoboti (${today}). Bo'limlar: 1) KPI bajarilish jadvali: Maqsad | Ko'rsatkich | Haqiqiy | Bajarilish% | Holat(🟢🟡🔴) 2) To'liq bajarilgan maqsadlar — nima to'g'ri qilindi 3) Bajarilmagan maqsadlar — har birining sababi va keyingi davr chorasi 4) Keyingi davr uchun realistik maqsadlar — trend asosida 5) Jamoa uchun ustuvor 3 ta vazifa.`
    },
    {
      icon: "🌱", l: "Investitsiya & ROI", d: "Investitsiyalar samaradorligi va reja", cat: "moliya", color: "#60A5FA",
      fn: (today) => `Investitsiya va ROI hisoboti (${today}). Bo'limlar: 1) Investitsiyalar jadvali: Soha | Summa | Qaytim | ROI% | Payback muddati 2) Eng samarali va zarar investitsiyalar tahlili 3) Yangi investitsiya imkoniyatlari — har biri uchun kutilgan ROI va muddat 4) Kapital taqsimlash optimalmi — qayerga ko'proq yo'naltirish kerak 5) 12 oylik investitsiya rejasi.`
    },
    {
      icon: "🔄", l: "Retention & Churn", d: "Mijozlar saqlab qolish tahlili", cat: "tahlil", color: "#38BDF8",
      fn: (today) => `Mijozlar retention va churn hisoboti (${today}). Bo'limlar: 1) Retention rate (saqlab qolish foizi) va churn rate (ketish foizi) oylik dinamikasi 2) LTV hisoblash: o'rtacha chek × chastota × muddat 3) Qaysi segment ko'p ketmoqda — sababi tahlili 4) Qaytmagan mijozlar — qancha summa yo'qotildi 5) Retention oshirish strategiyasi — 3 ta amaliy chora + har biri kutilgan +X% natija.`
    },
    {
      icon: "📱", l: "Marketing Samaradorligi", d: "Kanallar, CAC va ROI tahlili", cat: "tahlil", color: "#FB923C",
      fn: (today) => `Marketing samaradorligi hisoboti (${today}). Bo'limlar: 1) Kanallar jadvali: Kanal | Xarajat | Lidlar | CPL | Mijozlar | CAC | ROI% 2) Eng arzon va qimmat mijoz keltiruvchi kanal 3) Marketing byudjeti taqsimlash optimalmi — qayerga ko'proq yo'naltirish 4) O'sish uchun yangi kanal imkoniyatlari 5) Keyingi oy marketing rejasi — byudjet bilan.`
    },
    {
      icon: "📦", l: "Mahsulot Portfeli", d: "BCG matritsa va portfel tahlili", cat: "strategiya", color: "#EC4899",
      fn: (today) => `Mahsulot/xizmat portfeli hisoboti (${today}). Bo'limlar: 1) Portfel jadvali: Tovar/Xizmat | Daromad | Ulush% | O'sish% | Marja% 2) BCG matritsa: Yulduzlar / Naqd sigirlari / Savol belgilari / Itlar 3) Bekor qilish yoki kuchaytirish kerak bo'lgan pozitsiyalar 4) Yangi mahsulot/xizmat imkoniyati — bozor talab tahlili 5) Portfelni optimallashtirish rejasi.`
    },
    {
      icon: "🏆", l: "Yillik Yakun", d: "Yillik natijalar va keyingi yil rejasi", cat: "davr", color: "#FBBF24",
      fn: (today) => `Yillik yakun hisoboti (${today}). Bo'limlar: 1) Yillik moliyaviy natijalar: Daromad | Xarajat | Foyda | Foyda% — oylar bo'yicha jadval 2) Eng muhim 5 ta yutuq va 3 ta muvaffaqiyatsizlik + sababi 3) KPI maqsadlar vs haqiqiy natijalar jadvali 4) Mijozlar, xodimlar, mahsulotlar bo'yicha yillik dinamika 5) Keyingi yil strategik maqsadlari — OKR formatida 6) Keyingi yil moliyaviy prognoz (3 senariy).`
    },
    {
      icon: "⏱️", l: "Operatsion Samaradorlik", d: "Jarayonlar, bottlenecklar va tejash", cat: "tahlil", color: "#E879F9",
      fn: (today) => `Operatsion samaradorlik hisoboti (${today}). Bo'limlar: 1) Asosiy biznes jarayonlari xaritasi — har bosqich vaqti va xarajati 2) Bottleneck (eng sekin/qimmat bosqich) tahlili — ta'sir XM so'm 3) Ortiqcha xarajatlar va tejash imkoniyatlari — har biri aniq summa bilan 4) Avtomatlashtirish mumkin jarayonlar — qo'lda vs tizim, tejash foizi 5) Operatsion samaradorlikni oshirish — 90 kunlik reja.`
    },
  ];

  const IG_TYPES = [
    {
      icon: "", l: "Instagram Hisobot", d: "Profil, engagement va kontent tahlili", cat: "instagram", color: "#E879F9",
      fn: () => "Instagram akkaunt uchun to'liq hisobot. Bo'limlar: 1) Profil statistikasi (jadval) 2) Engagement rate va trend 3) Kontent turlari samaradorligi 4) Eng yaxshi/yomon postlar tahlili 5) Auditoriya xulq-atvori 6) 30 kunlik kontent reja."
    },
    {
      icon: "", l: "Instagram Kontent Reja", d: "30 kunlik kontent kalendar", cat: "instagram", color: "#EC4899",
      fn: () => "Instagram uchun 30 kunlik kontent kalendar yarat. Jadval formatida: Sana | Kontent turi (Rasm/Video/Karusel/Reels) | Mavzu | Caption g'oyasi | Hashteglar | Post vaqti. Haftada kamida 4-5 ta post."
    },
  ];

  const TG_TYPES = [
    {
      icon: "", l: "Telegram Kanal Hisobot", d: "Kanal statistikasi, postlar samaradorligi, auditoriya tahlili", cat: "telegram", color: "#38BDF8",
      fn: () => "Telegram kanal uchun to'liq hisobot. Bo'limlar: 1) Kanal statistikasi — obunachilar, postlar, ko'rishlar (jadval) 2) Post samaradorligi — eng ko'p ko'rilgan va ulashilgan postlar 3) Kontent tahlili — qaysi tur (matn/rasm/video) samaraliroq 4) Optimal post vaqti — qaysi soat va kunlarda chiqarish yaxshi 5) Engagement tahlili — ko'rish/obunachi nisbati 6) Kanal rivojlantirish tavsiyalari."
    },
  ];

  const allTypes = [
    ...BASE_TYPES,
    ...(hasIG ? IG_TYPES : []),
    ...(hasTG ? TG_TYPES : []),
  ];

  const typeCats = [...new Set(allTypes.map(t => t.cat))];
  const CAT_LABELS = { all: "Hammasi", davr: "Davriy", tahlil: "Tahlil", moliya: "Moliya", strategiya: "Strategiya", instagram: "Instagram", telegram: "Telegram", crm: "CRM" };
  const filteredTypes = repCat === "all" ? allTypes : allTypes.filter(t => t.cat === repCat);

  // Aloqador chartlar
  const relatedCharts = useMemo(() => {
    if (!activeMod || !allCards.length) return [];
    const cat = activeMod.cat;
    if (cat === "instagram") return allCards.filter(c => c.type === "chart" || c.type === "gauge").slice(0, 4);
    if (cat === "telegram") return allCards.filter(c => c.type === "chart" || c.type === "gauge").slice(0, 4);
    if (cat === "moliya") return allCards.filter(c => c.type === "chart").slice(0, 3);
    return allCards.filter(c => c.type === "chart" || c.type === "stats").slice(0, 3);
  }, [activeMod, allCards]);

  return (
    <div>
      {/* ── Tab tanlash ── */}
      <div className="flex gap8 mb16 aic flex-wrap">
        <button className={`btn ${repTab === "hisobotlar" ? "btn-primary" : "btn-ghost"}`} onClick={() => setRepTab("hisobotlar")}>
          Hisobot Yaratish
        </button>
        <button className={`btn ${repTab === "tarix" ? "btn-teal" : "btn-ghost"}`} onClick={() => setRepTab("tarix")}>
          Tarix ({savedReports.length})
        </button>
        <button className={`btn ${repTab === "vizual" ? "btn-teal" : "btn-ghost"}`} onClick={() => setRepTab("vizual")}>
          Vizual Grafiklar
        </button>
        {connectedSources.length > 0 && (
          <span className="badge b-ok ml-auto">{connectedSources.length} ta manba</span>
        )}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 1: HISOBOT YARATISH ══ */}
      {/* ════════════════════════════════════════════ */}
      {repTab === "hisobotlar" && (<div>
        {/* Ogohlantirish */}
        {connectedSources.length === 0 && <div className="notice" style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>Data Hub</b> dan manba ulang — hisobotlar shu ma'lumotlar asosida yaratiladi</div>
        </div>}
        {!aiConfig.apiKey && <div className="notice" style={{ padding: "12px 16px", border: "1px solid rgba(255,209,102,0.3)", borderRadius: 10, color: "var(--gold)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>AI Sozlamalar</b> sahifasida API kalitni kiriting</div>
        </div>}

        {/* Ulangan manbalar info */}
        {connectedSources.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {connectedSources.map(s => {
              const st = SOURCE_TYPES[s.type];
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--s2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 11 }}>
                  <span>{st.icon}</span>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="badge b-ok" style={{ fontSize: 8 }}>{s.data?.length}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Kategoriya filtrlari */}
        <div className="flex gap5 mb12 flex-wrap">
          {["all", ...typeCats].map(c => (
            <button key={c} className="qcat" onClick={() => setRepCat(c)}
              style={repCat === c ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.1)", padding: "5px 12px", fontSize: 10 } : { padding: "5px 12px", fontSize: 10 }}>
              {CAT_LABELS[c] || c}
            </button>
          ))}
        </div>

        {/* ── Hisobot modullari grid ── */}
        <div className="section-hd mb10">Tayyor Hisobot Shablonlari</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10, marginBottom: 18 }}>
          {filteredTypes.map((m, i) => (
            <button key={i} disabled={loading} onClick={() => gen(m)}
              style={{
                background: loading && label === m.l ? `${m.color}15` : "var(--s2)",
                border: `1px solid ${loading && label === m.l ? m.color + "50" : "var(--border)"}`,
                borderRadius: 14, padding: "18px 20px", cursor: loading ? "not-allowed" : "pointer",
                textAlign: "left", transition: "all .25s", position: "relative", overflow: "hidden",
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = m.color + "50"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${m.color}15`; } }}
              onMouseLeave={e => { if (!loading) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
            >
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${m.color}60,transparent)` }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{m.icon}</span>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 13.5, fontWeight: 700, color: loading && label === m.l ? m.color : "var(--text)" }}>{m.l}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fm)", marginTop: 2 }}>
                    {CAT_LABELS[m.cat] || m.cat}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>{m.d}</div>
              {loading && label === m.l && (
                <div style={{ position: "absolute", top: 12, right: 14 }}><div className="typing-ind"><span /><span /><span /></div></div>
              )}
            </button>
          ))}
        </div>

        {/* ── Loading ── */}
        <AiProgressBar loading={loading} />

        {/* ── Hisobot natijasi + aloqador chartlar ── */}
        {report && !loading && (
          <div>
            {/* Hisobot matni */}
            <div className="card" style={{ borderColor: `${activeMod?.color || prov.color}20`, marginBottom: 14 }}>
              <div className="flex aic jb mb12" style={{ flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{activeMod?.icon || ""}</span>
                  <div>
                    <div className="card-title" style={{ marginBottom: 0 }}>{label}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>{new Date().toLocaleDateString("uz-UZ")} | {prov.name}</div>
                  </div>
                </div>
                <div className="flex gap4 flex-wrap">
                  <button className="chat-export-btn" onClick={() => copyText()} title="Nusxalash"> Nusxa</button>
                  <button className="chat-export-btn" onClick={() => exportTXT()} title="TXT yuklab olish"> TXT</button>
                  <button className="chat-export-btn" onClick={() => exportExcel()} title="Excel yuklab olish" style={{ borderColor: "rgba(0,201,190,0.3)", color: "var(--teal)" }}> Excel</button>
                  <button className="chat-export-btn" onClick={() => exportPDF()} title="PDF chop etish" style={{ borderColor: "rgba(251,113,133,0.3)", color: "var(--red)" }}> PDF</button>
                  <button className="chat-export-btn" onClick={() => setReport("")} title="Yopish">✕</button>
                </div>
              </div>
              <RenderMD text={report} />
            </div>

            {/* Aloqador chartlar */}
            {relatedCharts.length > 0 && (
              <div>
                <div className="section-hd mb10"> Aloqador Grafiklar</div>
                <CardGrid cards={relatedCharts} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_rep_rel"} />
              </div>
            )}
          </div>
        )}
      </div>)}

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 2: TARIX ══ */}
      {/* ════════════════════════════════════════════ */}
      {repTab === "tarix" && (<div>
        <div className="section-hd mb10">Saqlangan Hisobotlar</div>
        {savedReports.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}></div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Hali hisobot yaratilmagan</div>
            <div className="text-muted text-sm">"Hisobot Yaratish" tabiga o'ting va birinchi hisobotni yarating</div>
          </div>
        )}
        {savedReports.length > 0 && (
          <div>
            {/* Statistika */}
            <div className="g3 mb16">
              {[
                { l: "Jami Hisobotlar", v: savedReports.length, c: "var(--teal)", i: "" },
                { l: "So'nggi Sana", v: savedReports[0]?.date || "—", c: "var(--gold)", i: "" },
                { l: "Turlar", v: [...new Set(savedReports.map(r => r.cat))].length, c: "var(--purple)", i: "" },
              ].map((s, i) => (
                <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.c}80,transparent)` }} />
                  <div style={{ fontSize: 14, marginBottom: 4, color: s.c }}>{s.i}</div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 8.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 3 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Hisobotlar ro'yxati */}
            {savedReports.map((r, i) => (
              <div key={r.id || i} className="report-row" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{r.icon || ""}</div>
                <div className="f1" style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div className="flex gap8 mt4 aic">
                    <span className="text-xs text-muted">{r.date}</span>
                    {r.cat && <span className="badge b-ok" style={{ fontSize: 8 }}>{CAT_LABELS[r.cat] || r.cat}</span>}
                    <span className="text-xs text-muted">{r.text?.length || 0} belgi</span>
                  </div>
                </div>
                <div className="flex gap4" style={{ flexShrink: 0 }}>
                  <button className="chat-export-btn" onClick={() => { setReport(r.text); setLabel(r.label); setRepTab("hisobotlar"); }} title="Ko'rish"> Ko'rish</button>
                  <button className="chat-export-btn" onClick={() => exportTXT(r.text, r.label)} title="TXT"></button>
                  <button className="chat-export-btn" onClick={() => exportExcel(r.text, r.label)} title="Excel"></button>
                  <button className="chat-export-btn" onClick={() => exportPDF(r.text, r.label)} title="PDF"></button>
                  <button className="chat-export-btn" onClick={() => {
                    const updated = savedReports.filter(x => x.id !== r.id);
                    LS.set(repKey, updated);
                    window.location.reload();
                  }} title="O'chirish" style={{ borderColor: "rgba(251,113,133,0.3)", color: "var(--red)" }}></button>
                </div>
              </div>
            ))}

            {/* Hammasini tozalash */}
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Barcha hisobotlarni o'chirish?")) { LS.set(repKey, []); window.location.reload(); } }}>
                Barcha tarixni tozalash
              </button>
            </div>
          </div>
        )}
      </div>)}

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 3: VIZUAL GRAFIKLAR ══ */}
      {/* ════════════════════════════════════════════ */}
      {repTab === "vizual" && (<div>
        {/* Manba tanlash */}
        {connectedSources.length > 0 && (
          <div className="flex gap6 mb14 aic flex-wrap">
            <span className="text-xs text-muted" style={{ fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2 }}>Manba:</span>
            {connectedSources.map(s => {
              const st = SOURCE_TYPES[s.type];
              return (
                <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { setSelectedSrc(s.id); setChartOverrides({}); }}
                  style={workingSource?.id === s.id ? { borderColor: s.color || st.color, color: s.color || st.color, background: `${s.color || st.color}0F` } : {}}>
                  {st.icon} {s.name} <span className="badge b-ok" style={{ fontSize: 8, marginLeft: 4 }}>{s.data?.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {connectedSources.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}></div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Grafiklar avtomatik yaratiladi</div>
            <div className="text-muted text-sm">Data Hub dan manba ulang</div>
          </div>
        )}

        {/* Ko'rsatkichlar */}
        {workingSource && (
          <div className="g4 mb14">
            {[
              { l: "Yozuvlar", v: (workingSource.data?.length || 0).toLocaleString(), c: "var(--teal)", i: "" },
              { l: "Grafiklar", v: allCards.filter(c => c.type === "chart").length, c: "var(--green)", i: "" },
              { l: "Statistika", v: allCards.filter(c => c.type === "stats").length, c: "var(--gold)", i: "" },
              { l: "Jami", v: allCards.length, c: "var(--purple)", i: "" },
            ].map((c, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.c}80,transparent)` }} />
                <div style={{ fontSize: 16, marginBottom: 6, color: c.c }}>{c.i}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: c.c, lineHeight: 1 }}>{c.v}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 5 }}>{c.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Barcha kartalar */}
        {allCards.length > 0 && (
          <CardGrid cards={allCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_rep_all"} />
        )}
      </div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// ALERTS PAGE (AI Proaktiv Ogohlantirishlar)
// ─────────────────────────────────────────────────────────────
const ALERT_TYPES = {
  danger: { label: "Xavfli", color: "#FB7185", bg: "rgba(251,113,133,0.06)", border: "rgba(251,113,133,0.22)", icon: "", glow: "rgba(251,113,133,0.08)" },
  warning: { label: "Ogohlantirish", color: "#D4A853", bg: "rgba(212,168,83,0.06)", border: "rgba(212,168,83,0.22)", icon: "", glow: "rgba(212,168,83,0.08)" },
  info: { label: "Ma'lumot", color: "#00D4C8", bg: "rgba(0,212,200,0.06)", border: "rgba(0,212,200,0.18)", icon: "", glow: "rgba(0,212,200,0.06)" },
  success: { label: "Ijobiy", color: "#34D399", bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.18)", icon: "", glow: "rgba(52,211,153,0.06)" },
};

function AlertsPage({ aiConfig, sources, alerts, addAlert, markAllRead, deleteAlert, push, user, onAiUsed }) {
  const prov = AI_PROVIDERS[aiConfig.provider];
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [alertTab, setAlertTab] = useState("ogohlantirishlar"); // ogohlantirishlar | tekshirish | vizual
  const [checkType, setCheckType] = useState(null);
  const [checkResult, setCheckResult] = useState("");
  const [selectedSrc, setSelectedSrc] = useState(null);
  const [chartOverrides, setChartOverrides] = useState({});
  const connectedSources = sources.filter(s => s.connected && s.active && s.data?.length > 0);
  const unread = alerts.filter(a => !a.read).length;

  const workingSource = selectedSrc ? sources.find(s => s.id === selectedSrc) : connectedSources[0];
  const allCards = useMemo(() => workingSource ? generateDashboards(workingSource) : [], [workingSource?.id, workingSource?.data?.length, workingSource?.updatedAt]);
  const setChartOverride = (cardId, type) => setChartOverrides(prev => ({ ...prev, [cardId]: type }));

  const hasIG = connectedSources.some(s => s.type === "instagram");
  const hasTG = connectedSources.some(s => s.type === "telegram");

  // ── AI tekshirish (umumiy) ──
  const isPersonal = !!aiConfig.isPersonal;
  const runCheck = async (checkMod) => {
    if (!aiConfig.apiKey) { alert("AI ulanmagan. Admin global AI sozlashi yoki AI Sozlamalardan shaxsiy API kalit kiriting."); return; }
    if (!connectedSources.length) { push("Data Hub da manba ulang", "warn"); return; }
    // AI ogohlantirish limiti (free tarifda taqiqlangan)
    const isPersonalKey = !!aiConfig.isPersonal;
    if (!isPersonalKey && user?.role !== "admin" && user?.role !== "super_admin") {
      const plan = PLANS[user?.plan || "free"];
      if (!plan?.limits?.alerts_check) {
        push("AI ogohlantirishlar faqat Boshlang'ich tarifdan boshlab ishlaydi. Tarifni yangilang.", "warn");
        return;
      }
      if (!Auth.checkLimit(user, "ai_requests", sources)) {
        const info = Auth.getLimitInfo(user, "ai_requests", sources);
        push(`AI so'rov limiti tugadi (${info.label}). Tarifni yangilang.`, "warn");
        return;
      }
    }
    setLoading(true); setCheckResult(""); setCheckType(checkMod || null);
    // SMART CONTEXT — Backend dan aqlli qidiruv
    let ctx = "";
    if (Token.get() && connectedSources.length > 0) {
      try {
        const baseQ = checkMod ? checkMod.prompt : "biznes anomaliya muammo ogohlantirish";
        const smartResult = await SourcesAPI.getSmartContext(connectedSources.map(s => s.id), baseQ);
        if (smartResult?.context) ctx = smartResult.context;
      } catch (e) { console.warn("[ALERT-CTX] fallback:", e.message); ctx = buildMergedContext(connectedSources); }
    }
    if (!ctx) ctx = buildMergedContext(connectedSources);
    const srcInfo = connectedSources.map(s => `${s.name} (${SOURCE_TYPES[s.type]?.label || s.type}, ${s.data?.length || 0} yozuv)`).join(", ");

    // Agar maxsus tekshirish turi bo'lsa, uning promptini ishlatish
    const basePrompt = checkMod ? checkMod.prompt : `Quyidagi biznes ma'lumotlarini tahlil qilib, proaktiv ogohlantirishlar ber.`;
    const prompt = `${basePrompt}

Ulangan manbalar: ${srcInfo}
MA'LUMOTLAR:\n${ctx}

Quyidagi formatda JSON qaytarish SHART (boshqa hech narsa yozma):
{
  "alerts": [
    {
      "type": "danger|warning|info|success",
      "title": "Qisqa sarlavha (max 60 belgi)",
      "message": "Batafsil tavsif va tavsiya (max 200 belgi)",
      "metric": "Qaysi ko'rsatkich (masalan: Savdo -23%)"
    }
  ],
  "summary": "Umumiy 2-3 gaplik xulosa"
}

Muhim: Faqat ma'lumotlarda ko'rinadigan haqiqiy muammolar va imkoniyatlarni ko'rsat. ${checkMod ? checkMod.count : "3-6"} ta ogohlantirish ber.`;

    let full = "";
    try {
      await callAI([{ role: "user", content: prompt }], aiConfig, (c) => { full = c; });
      if (!isPersonal && onAiUsed) onAiUsed();
      const jsonMatch = full.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON topilmadi");
      const parsed = JSON.parse(jsonMatch[0]);
      const newAlerts = parsed.alerts || [];
      if (parsed.summary) setCheckResult(parsed.summary);
      if (!newAlerts.length) { push("Hozircha muhim ogohlantirish yo'q ✓", "ok"); setLoading(false); return; }
      newAlerts.forEach(a => addAlert(a));
      push(`✓ ${newAlerts.length} ta yangi ogohlantirish qo'shildi`, "ok");
    } catch (e) {
      if (full.length > 20) {
        addAlert({ type: "info", title: "AI Tahlil Natijasi", message: full.substring(0, 200), metric: "Umumiy" });
        setCheckResult(full.substring(0, 300));
        push("✓ Tahlil saqlandi", "ok");
      } else {
        push("Tahlil xatosi: " + e.message, "error");
      }
    }
    setLoading(false);
  };

  const handleDelete = (id) => { deleteAlert(id); push("O'chirildi", "info"); };

  const filtered = filter === "all" ? alerts : filter === "unread" ? alerts.filter(a => !a.read) : alerts.filter(a => a.type === filter);

  // ── Tayyor tekshirish modullari ──
  const CHECK_MODS = [
    {
      icon: "", l: "Umumiy Tekshirish", d: "Barcha ko'rsatkichlarni tahlil qilish", color: "#00D4C8", count: "3-6", cat: "umumiy",
      prompt: "Biznes ma'lumotlarini har tomonlama tahlil qilib, muhim ogohlantirishlar ber. Xavflar, imkoniyatlar, anomaliyalar va ijobiy tendensiyalarni aniqlash."
    },
    {
      icon: "", l: "Tushish va Anomaliyalar", d: "Pasayish tendensiyalari va g'ayrioddiy o'zgarishlar", color: "#FB7185", count: "2-5", cat: "xavf",
      prompt: "Ma'lumotlarda tushish tendensiyalari, anomaliyalar va kutilmagan o'zgarishlarni aniqlash. Har bir muammo uchun sabab va tavsiya."
    },
    {
      icon: "", l: "O'sish Imkoniyatlari", d: "Ijobiy trend va yashirin imkoniyatlar", color: "#34D399", count: "3-5", cat: "imkoniyat",
      prompt: "Ma'lumotlarda o'sish imkoniyatlari, ijobiy tendensiyalar va foydalanilmagan potentsialni aniqlash. Har bir imkoniyat uchun aniq tavsiya."
    },
    {
      icon: "", l: "Moliyaviy Risk", d: "Xarajat anomaliyalari va byudjet xatarlari", color: "#FB923C", count: "2-4", cat: "moliya",
      prompt: "Moliyaviy ko'rsatkichlarni tahlil qilib, xarajat anomaliyalari, byudjet xatarlari, noto'g'ri tendensiyalarni aniqlash."
    },
    {
      icon: "", l: "Mijoz Sifati", d: "Mijozlar faolligi va yo'qolish riski", color: "#60A5FA", count: "2-4", cat: "mijoz",
      prompt: "Mijozlar bilan bog'liq ko'rsatkichlarni tahlil qilib, yo'qolish riski, faollik pasayishi, takroriy xarid tendensiyalarini aniqlash."
    },
    {
      icon: "", l: "Operatsion Muammolar", d: "Samaradorlik va bottleneck lar", color: "#A78BFA", count: "2-4", cat: "operatsion",
      prompt: "Operatsion samaradorlik ko'rsatkichlarini tahlil qilib, bottleneck, kechikish, samaradorlik pasayishini aniqlash."
    },
  ];

  const IG_CHECKS = [
    {
      icon: "", l: "Instagram Monitoring", d: "Engagement tushishi va kontent muammolari", color: "#E879F9", count: "2-4", cat: "instagram",
      prompt: "Instagram ko'rsatkichlarini monitoring qilish: engagement tushishi, like/izoh pasayishi, kontent samaradorligi muammolari, auditoriya o'zgarishi."
    },
  ];
  const TG_CHECKS = [
    {
      icon: "", l: "Telegram Kanal Monitoring", d: "Kanal ko'rishlar tushishi, engagement kamayishi va post samaradorligi", color: "#38BDF8", count: "2-3", cat: "telegram",
      prompt: "Telegram kanal ko'rsatkichlarini monitoring: post ko'rishlar kamayishi, engagement rate tushishi, obunachi o'sishi sekinlashishi, kontent samaradorligi anomaliyalari. Postlarning o'rtacha ko'rish va ulashish nisbatini tekshir."
    },
  ];

  const CRM_CHECKS = [
    {
      icon: "", l: "CRM Monitoring", d: "O'quv markaz ko'rsatkichlari: to'lmagan guruhlar, lid konversiya, maosh/daromad nisbati", color: "#8B5CF6", count: "3-5", cat: "crm",
      prompt: "O'quv markaz CRM ma'lumotlarini monitoring qilish: kam to'lgan guruhlar (o'rtachadan past o'quvchi), lidlar konversiya muammolari, yuqori maoshli lekin kam yukli o'qituvchilar, filiallar orasida katta farqlar, foyda foizi pasayishi. Har bir muammo uchun aniq tavsiya."
    },
  ];
  const hasCRM = connectedSources.some(s => s.type === "crm");

  const allChecks = [...CHECK_MODS, ...(hasIG ? IG_CHECKS : []), ...(hasTG ? TG_CHECKS : []), ...(hasCRM ? CRM_CHECKS : [])];

  // ── Statistika ──
  const dangerCount = alerts.filter(a => a.type === "danger").length;
  const warnCount = alerts.filter(a => a.type === "warning").length;
  const infoCount = alerts.filter(a => a.type === "info").length;
  const successCount = alerts.filter(a => a.type === "success").length;

  // Aloqador chartlar (tekshirish turiga qarab)
  const relatedCharts = useMemo(() => {
    if (!checkType || !allCards.length) return [];
    return allCards.filter(c => c.type === "chart" || c.type === "gauge").slice(0, 3);
  }, [checkType, allCards]);

  return (
    <div>
      {/* ── Tab tanlash ── */}
      <div className="flex gap8 mb16 aic flex-wrap">
        <button className={`btn ${alertTab === "ogohlantirishlar" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAlertTab("ogohlantirishlar")}>
          Ogohlantirishlar {unread > 0 && <span style={{ background: "rgba(251,113,133,0.9)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 9, marginLeft: 4, fontWeight: 700 }}>{unread}</span>}
        </button>
        <button className={`btn ${alertTab === "tekshirish" ? "btn-teal" : "btn-ghost"}`} onClick={() => setAlertTab("tekshirish")}>
          AI Tekshirish
        </button>
        <button className={`btn ${alertTab === "vizual" ? "btn-teal" : "btn-ghost"}`} onClick={() => setAlertTab("vizual")}>
          Vizual Monitoring
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fm)" }}>{prov.icon} {prov.name}</span>
          {connectedSources.length > 0 && <span className="badge b-ok">{connectedSources.length} manba</span>}
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 1: OGOHLANTIRISHLAR ══ */}
      {/* ════════════════════════════════════════════ */}
      {alertTab === "ogohlantirishlar" && (<div>
        {/* Statistika kartalar */}
        <div className="g4 mb16">
          {[
            { l: "Jami", v: alerts.length, c: "var(--text)", i: "", bg: "var(--s1)" },
            { l: "O'qilmagan", v: unread, c: "var(--gold)", i: "", bg: unread > 0 ? "rgba(212,168,83,0.04)" : "var(--s1)" },
            { l: "Xavfli", v: dangerCount, c: "var(--red)", i: "", bg: dangerCount > 0 ? "rgba(251,113,133,0.04)" : "var(--s1)" },
            { l: "Ijobiy", v: successCount, c: "var(--green)", i: "", bg: "var(--s1)" },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", position: "relative", overflow: "hidden", transition: "all .25s" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.c}80,transparent)` }} />
              <div className="flex aic jb">
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>{s.l}</div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 26, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.v}</div>
                </div>
                <div style={{ fontSize: 28, opacity: .4 }}>{s.i}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tezkor harakatlar */}
        <div className="flex gap8 mb14 aic flex-wrap">
          <button className="btn btn-primary btn-sm" onClick={() => runCheck()} disabled={loading || !aiConfig.apiKey || !connectedSources.length}>
            {loading && !checkType ? " Tekshirilmoqda..." : " Tezkor AI Tekshirish"}
          </button>
          {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAllRead}>✓ Barchasini o'qildi</button>}
          {alerts.length > 0 && <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Barcha ogohlantirishlarni o'chirish?")) { alerts.forEach(a => deleteAlert(a.id)); } }}> Hammasini tozalash</button>}
        </div>

        {/* Ogohlantirish */}
        {!aiConfig.apiKey && <div className="notice" style={{ padding: "12px 16px", border: "1px solid rgba(212,168,83,0.3)", borderRadius: 10, color: "var(--gold)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>AI Sozlamalar</b> sahifasida API kalitni kiriting</div>
        </div>}
        {aiConfig.apiKey && !connectedSources.length && <div className="notice" style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>Data Hub</b> dan manba ulang — AI monitoring shu ma'lumotlar asosida ishlaydi</div>
        </div>}

        {/* Filtrlar */}
        <div className="flex gap5 mb12 flex-wrap">
          {[
            { id: "all", l: "Hammasi", count: alerts.length },
            { id: "unread", l: "O'qilmagan", count: unread },
            { id: "danger", l: "Xavfli", count: dangerCount },
            { id: "warning", l: "Ogohlantirish", count: warnCount },
            { id: "info", l: "Ma'lumot", count: infoCount },
            { id: "success", l: "Ijobiy", count: successCount },
          ].filter(f => f.count > 0 || f.id === "all").map(f => {
            const at = ALERT_TYPES[f.id];
            return (
              <button key={f.id} className="qcat" onClick={() => setFilter(f.id)}
                style={filter === f.id ? { borderColor: at?.color || "var(--teal)", color: at?.color || "var(--teal)", background: (at?.bg || "rgba(0,201,190,0.1)"), padding: "5px 12px", fontSize: 10 } : { padding: "5px 12px", fontSize: 10 }}>
                {at?.icon || ""} {f.l} ({f.count})
              </button>
            );
          })}
        </div>

        {/* Bo'sh holat */}
        {alerts.length === 0 && aiConfig.apiKey && connectedSources.length > 0 && (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}></div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Hali ogohlantirish yo'q</div>
            <div className="text-muted text-sm mb16">AI Tekshirish boshlang — ma'lumotlaringizni tahlil qilib, muhim ogohlantirishlarni yaratadi</div>
            <button className="btn btn-primary" onClick={() => runCheck()} disabled={loading}> Hozir Tekshirish</button>
          </div>
        )}

        {/* Filtrdagi bo'sh holat */}
        {filtered.length === 0 && alerts.length > 0 && (
          <div className="text-muted text-sm" style={{ padding: "24px 0", textAlign: "center" }}>Bu filtriga mos ogohlantirish yo'q</div>
        )}

        {/* ── Ogohlantirish ro'yxati ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(al => {
            const at = ALERT_TYPES[al.type] || ALERT_TYPES.info;
            return (
              <div key={al.id} style={{
                background: al.read ? "var(--s1)" : at.bg,
                border: `1px solid ${al.read ? "var(--border)" : at.border}`,
                borderRadius: 16, padding: "20px 22px", transition: "all .25s", position: "relative", overflow: "hidden",
                boxShadow: al.read ? "none" : `0 2px 16px ${at.glow}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 6px 24px ${at.glow}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = al.read ? "none" : `0 2px 16px ${at.glow}`; }}
              >
                {/* Chap rang chizig'i */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: `linear-gradient(180deg, ${at.color}, ${at.color}60)`, borderRadius: "4px 0 0 4px" }} />
                {/* Yuqori gradient chiziq */}
                <div style={{ position: "absolute", top: 0, left: 4, right: 0, height: 1, background: `linear-gradient(90deg, ${at.color}30, transparent)` }} />
                {/* O'qilmagan nuqta */}
                {!al.read && <div style={{ position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: "50%", background: at.color, boxShadow: `0 0 10px ${at.color}` }} />}

                {/* Sarlavha qatori */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: at.bg, border: `1px solid ${at.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{at.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, color: al.read ? "var(--text)" : at.color, lineHeight: 1.3, marginBottom: 4 }}>{al.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fm)" }}>{al.createdAt}</span>
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: at.bg, color: at.color, border: `1px solid ${at.border}`, fontFamily: "var(--fh)", fontWeight: 700, letterSpacing: 0.5 }}>{at.label}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(al.id)} title="O'chirish"
                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 11, transition: "all .2s", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(251,113,133,0.4)"; e.currentTarget.style.color = "var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}>
                    ✕
                  </button>
                </div>

                {/* Xabar matni */}
                <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text2)", marginLeft: 50, marginBottom: al.metric ? 10 : 0 }}>{al.message}</div>

                {/* Metrika badge — kattaroq va ko'rinarliroq */}
                {al.metric && (
                  <div style={{ marginLeft: 50, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 10, background: `linear-gradient(135deg, ${at.color}08, ${at.color}15)`, border: `1px solid ${at.color}25` }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={at.color} strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                    <span style={{ fontSize: 12, fontFamily: "var(--fm)", fontWeight: 700, color: at.color }}>{al.metric}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>)}

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 2: AI TEKSHIRISH MODULLARI ══ */}
      {/* ════════════════════════════════════════════ */}
      {alertTab === "tekshirish" && (<div>
        {/* Ogohlantirish */}
        {connectedSources.length === 0 && <div className="notice" style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>Data Hub</b> dan manba ulang — tekshirish shu ma'lumotlar asosida ishlaydi</div>
        </div>}
        {!aiConfig.apiKey && <div className="notice" style={{ padding: "12px 16px", border: "1px solid rgba(212,168,83,0.3)", borderRadius: 10, color: "var(--gold)", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}></span><div><b>AI Sozlamalar</b> sahifasida API kalitni kiriting</div>
        </div>}

        {/* Ulangan manbalar */}
        {connectedSources.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {connectedSources.map(s => {
              const st = SOURCE_TYPES[s.type];
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--s2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 11 }}>
                  <span>{st.icon}</span>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="badge b-ok" style={{ fontSize: 8 }}>{s.data?.length}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tekshirish modullari grid ── */}
        <div className="section-hd mb10">Tayyor Tekshirish Modullari</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginBottom: 18 }}>
          {allChecks.map((m, i) => (
            <button key={i} disabled={loading} onClick={() => runCheck(m)}
              style={{
                background: loading && checkType?.l === m.l ? `${m.color}15` : "var(--s2)",
                border: `1px solid ${loading && checkType?.l === m.l ? m.color + "50" : "var(--border)"}`,
                borderRadius: 14, padding: "18px 20px", cursor: loading ? "not-allowed" : "pointer",
                textAlign: "left", transition: "all .25s", position: "relative", overflow: "hidden",
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = m.color + "50"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${m.color}15`; } }}
              onMouseLeave={e => { if (!loading) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
            >
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${m.color}60,transparent)` }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{m.icon}</span>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 13.5, fontWeight: 700, color: loading && checkType?.l === m.l ? m.color : "var(--text)" }}>{m.l}</div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)", marginTop: 2 }}>{m.count} ta ogohlantirish</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>{m.d}</div>
              {loading && checkType?.l === m.l && (
                <div style={{ position: "absolute", top: 12, right: 14 }}><div className="typing-ind"><span /><span /><span /></div></div>
              )}
            </button>
          ))}
        </div>

        {/* Loading holati */}
        <AiProgressBar loading={loading} />

        {/* Natija xulosa */}
        {checkResult && !loading && (
          <div className="card" style={{ borderColor: `${checkType?.color || prov.color}20`, marginBottom: 14 }}>
            <div className="flex aic gap8 mb10">
              <span style={{ fontSize: 20 }}>{checkType?.icon || ""}</span>
              <div>
                <div className="card-title" style={{ marginBottom: 0 }}>{checkType?.l || "AI Tekshirish"} — Xulosa</div>
                <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>{new Date().toLocaleDateString("uz-UZ")} | {prov.name}</div>
              </div>
              <button className="chat-export-btn ml-auto" onClick={() => setCheckResult("")}>✕</button>
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.85, color: "var(--text)" }}>{checkResult}</div>
          </div>
        )}

        {/* Aloqador chartlar */}
        {checkResult && !loading && relatedCharts.length > 0 && (
          <div>
            <div className="section-hd mb10"> Aloqador Grafiklar</div>
            <CardGrid cards={relatedCharts} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_alert_rel"} />
          </div>
        )}

        {/* Oxirgi ogohlantirishlar */}
        {alerts.length > 0 && !loading && (
          <div style={{ marginTop: 18 }}>
            <div className="section-hd mb10">Oxirgi Ogohlantirishlar</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {alerts.slice(0, 5).map(al => {
                const at = ALERT_TYPES[al.type] || ALERT_TYPES.info;
                return (
                  <div key={al.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--s2)", borderRadius: 10, border: "1px solid var(--border)", borderLeft: `3px solid ${at.color}`, fontSize: 12 }}>
                    <span style={{ fontSize: 16 }}>{at.icon}</span>
                    <div className="f1" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: at.color }}>{al.title}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.message}</div>
                    </div>
                    {al.metric && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: at.bg, color: at.color, border: `1px solid ${at.border}`, fontFamily: "var(--fm)", flexShrink: 0 }}>{al.metric}</span>}
                  </div>
                );
              })}
              {alerts.length > 5 && <div className="text-muted text-xs" style={{ textAlign: "center", padding: 6 }}>... va yana {alerts.length - 5} ta</div>}
            </div>
          </div>
        )}
      </div>)}

      {/* ════════════════════════════════════════════ */}
      {/* ══ TAB 3: VIZUAL MONITORING ══ */}
      {/* ════════════════════════════════════════════ */}
      {alertTab === "vizual" && (<div>
        {/* Manba tanlash */}
        {connectedSources.length > 0 && (
          <div className="flex gap6 mb14 aic flex-wrap">
            <span className="text-xs text-muted" style={{ fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2 }}>Manba:</span>
            {connectedSources.map(s => {
              const st = SOURCE_TYPES[s.type];
              return (
                <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { setSelectedSrc(s.id); setChartOverrides({}); }}
                  style={workingSource?.id === s.id ? { borderColor: s.color || st.color, color: s.color || st.color, background: `${s.color || st.color}0F` } : {}}>
                  {st.icon} {s.name} <span className="badge b-ok" style={{ fontSize: 8, marginLeft: 4 }}>{s.data?.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {connectedSources.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}></div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Vizual monitoring</div>
            <div className="text-muted text-sm">Data Hub dan manba ulang</div>
          </div>
        )}

        {/* Ogohlantirish turlari bo'yicha mini statistika */}
        {alerts.length > 0 && (
          <div className="g4 mb14">
            {Object.entries(ALERT_TYPES).map(([key, at]) => {
              const count = alerts.filter(a => a.type === key).length;
              return (
                <div key={key} style={{ background: count > 0 ? at.bg : "var(--s1)", border: `1px solid ${count > 0 ? at.border : "var(--border)"}`, borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${at.color}80,transparent)` }} />
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{at.icon}</div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 800, color: at.color, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 5 }}>{at.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ko'rsatkichlar */}
        {workingSource && (
          <div className="g4 mb14">
            {[
              { l: "Yozuvlar", v: (workingSource.data?.length || 0).toLocaleString(), c: "var(--teal)", i: "" },
              { l: "Grafiklar", v: allCards.filter(c => c.type === "chart").length, c: "var(--green)", i: "" },
              { l: "Statistika", v: allCards.filter(c => c.type === "stats").length, c: "var(--gold)", i: "" },
              { l: "Jami", v: allCards.length, c: "var(--purple)", i: "" },
            ].map((c, i) => (
              <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.c}80,transparent)` }} />
                <div style={{ fontSize: 16, marginBottom: 6, color: c.c }}>{c.i}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: c.c, lineHeight: 1 }}>{c.v}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 8.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 5 }}>{c.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Barcha kartalar */}
        {allCards.length > 0 && (
          <CardGrid cards={allCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_alert_all"} />
        )}
      </div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// TELEGRAM SETTINGS PANEL — Bot ulash + sozlamalar (Phase 1)
// ─────────────────────────────────────────────────────────────
function TelegramSettingsPanel({ push, user }) {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState(null); // { url, expiresAt }
  const [busy, setBusy] = useState(false);

  const isCeo = user?.role === "ceo" || user?.role === "super_admin";

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [st, se] = await Promise.all([
        TelegramAPI.status().catch(() => null),
        TelegramAPI.getSettings().catch(() => null),
      ]);
      setStatus(st);
      setSettings(se);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const generateLink = async () => {
    if (!isCeo) { push("Faqat tashkilot egasi botni ulashi mumkin", "warn"); return; }
    setBusy(true);
    try {
      const r = await TelegramAPI.createLinkToken("bot");
      setLinkData(r);
      // Avtomatik Telegram'ni ochish
      window.open(r.url, "_blank", "noopener");
      push("Havola yaratildi. Telegram oynasida 'START' tugmasini bosing.", "ok");
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!confirm("Botni uzishni tasdiqlaysizmi?")) return;
    setBusy(true);
    try {
      await TelegramAPI.unlinkBot();
      push("Bot uzildi", "ok");
      setLinkData(null);
      await reload();
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const updateSetting = async (patch) => {
    setSettings(s => ({ ...s, ...patch }));
    try {
      await TelegramAPI.updateSettings(patch);
    } catch (e) {
      push("Sozlama saqlanmadi: " + e.message, "error");
      reload();
    }
  };

  const toggleModule = (key) => {
    const mods = { ...(settings?.enabledModules || {}) };
    mods[key] = !mods[key];
    updateSetting({ enabledModules: mods });
  };

  if (loading) {
    return <div className="card mb14"><div className="text-muted text-sm">Yuklanmoqda...</div></div>;
  }

  return (
    <div className="card mb14">
      <div className="flex aic jb mb12">
        <div>
          <div className="card-title" style={{ marginBottom: 3 }}>✈️ Telegram Yordamchi Bot</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>
            Hisobot, tahlil va ogohlantirishlarni Telegram orqali oling
          </div>
        </div>
        {status?.linked && <span className="badge b-ok">Ulangan</span>}
      </div>

      {/* ── BOT ULASH HOLATI ── */}
      {!status?.linked ? (
        <div style={{ background: "var(--s2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>
            <div style={{ color: "#38BDF8", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>
              Qanday ulash:
            </div>
            <div>1. <strong>"Telegram bilan ulash"</strong> tugmasini bosing</div>
            <div>2. Telegram avtomatik ochiladi — <strong style={{ color: "var(--gold)" }}>START</strong> bosing</div>
            <div>3. Tayyor — bot tashkilotingizga bog'landi</div>
          </div>
          {!isCeo && (
            <div style={{ fontSize: 10, color: "var(--orange)", marginBottom: 10 }}>
              ⚠️ Faqat tashkilot egasi (CEO) botni ulashi mumkin
            </div>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={generateLink}
            disabled={busy || !isCeo}
            style={{ background: "linear-gradient(135deg, #38BDF8, #0EA5E9)", borderColor: "transparent" }}
          >
            {busy ? "Yaratilmoqda..." : "✈️ Telegram bilan ulash"}
          </button>
          {linkData && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(56,189,248,0.06)", borderRadius: 8, fontSize: 10.5, color: "var(--muted)" }}>
              Telegram ochilmadi? <a href={linkData.url} target="_blank" rel="noopener" style={{ color: "#38BDF8", fontWeight: 600 }}>Bu yerga bosing</a>
              {" — "} havola 10 daqiqa amal qiladi.
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "rgba(74,222,128,0.06)", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid rgba(74,222,128,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div className="f1">
              <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
                Bot ulangan
                {status.link?.username && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · @{status.link.username}</span>}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                {status.link?.firstName} {status.link?.lastName || ""}
                {status.link?.linkedAt && <> · {new Date(status.link.linkedAt).toLocaleString("uz-UZ")}</>}
              </div>
            </div>
            {isCeo && (
              <button className="btn btn-ghost btn-sm" onClick={unlink} disabled={busy}>
                Uzish
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── BOT SOZLAMALARI (faqat ulangan bo'lsa) ── */}
      {status?.linked && settings && (
        <>
          <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 14, marginBottom: 8 }}>
            Avtomatik dayjest
          </div>
          <div className="flex aic jb mb10" style={{ background: "var(--s2)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)" }}>
            <div className="f1">
              <div style={{ fontSize: 12, fontWeight: 600 }}>Har kuni hisobot yuborish</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>Belgilangan vaqtda barcha bo'limlar bo'yicha qisqa hisobot</div>
            </div>
            <input
              type="time"
              className="field"
              style={{ width: 100, marginRight: 10 }}
              value={settings.digestTime || "09:00"}
              onChange={e => updateSetting({ digestTime: e.target.value })}
              disabled={!settings.digestEnabled}
            />
            <div
              style={{ width: 36, height: 20, borderRadius: 10, background: settings.digestEnabled ? "var(--green)" : "var(--s4)", border: "1px solid var(--border)", cursor: "pointer", position: "relative", transition: "all .2s" }}
              onClick={() => updateSetting({ digestEnabled: !settings.digestEnabled })}
            >
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: settings.digestEnabled ? 19 : 2, transition: "left .2s" }} />
            </div>
          </div>

          <div className="flex aic jb mb10" style={{ background: "var(--s2)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)" }}>
            <div className="f1">
              <div style={{ fontSize: 12, fontWeight: 600 }}>Anomaliya ogohlantirishlari</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>Muhim o'zgarishlarda darhol xabar</div>
            </div>
            <select
              className="field"
              style={{ width: 110, marginRight: 10 }}
              value={settings.anomalySensitivity || "medium"}
              onChange={e => updateSetting({ anomalySensitivity: e.target.value })}
              disabled={!settings.anomalyEnabled}
            >
              <option value="low">Past</option>
              <option value="medium">O'rta</option>
              <option value="high">Yuqori</option>
            </select>
            <div
              style={{ width: 36, height: 20, borderRadius: 10, background: settings.anomalyEnabled ? "var(--gold)" : "var(--s4)", border: "1px solid var(--border)", cursor: "pointer", position: "relative", transition: "all .2s" }}
              onClick={() => updateSetting({ anomalyEnabled: !settings.anomalyEnabled })}
            >
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: settings.anomalyEnabled ? 19 : 2, transition: "left .2s" }} />
            </div>
          </div>

          <div style={{ background: "var(--s2)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Jim soatlar</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>Bu vaqtda xabar yubormaymiz (faqat critical anomaliya)</div>
            <div className="flex aic gap8">
              <input type="time" className="field" style={{ width: 100 }} value={settings.quietHoursStart || "23:00"} onChange={e => updateSetting({ quietHoursStart: e.target.value })} />
              <span style={{ color: "var(--muted)" }}>—</span>
              <input type="time" className="field" style={{ width: 100 }} value={settings.quietHoursEnd || "08:00"} onChange={e => updateSetting({ quietHoursEnd: e.target.value })} />
            </div>
          </div>

          <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 14, marginBottom: 8 }}>
            Dayjestga kiritilsin
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
            {[
              { k: "sales", l: "Savdo", c: "#4ADE80" },
              { k: "finance", l: "Moliya", c: "#FBBF24" },
              { k: "crm", l: "CRM", c: "#A78BFA" },
              { k: "channel", l: "Telegram kanal", c: "#38BDF8" },
              { k: "instagram", l: "Instagram", c: "#E879F9" },
            ].map(m => {
              const on = !!(settings.enabledModules || {})[m.k];
              return (
                <div
                  key={m.k}
                  onClick={() => toggleModule(m.k)}
                  style={{ cursor: "pointer", padding: "8px 10px", borderRadius: 8, border: `1px solid ${on ? m.c + "60" : "var(--border)"}`, background: on ? m.c + "10" : "var(--s2)", display: "flex", alignItems: "center", gap: 8, transition: "all .15s" }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${on ? m.c : "var(--border)"}`, background: on ? m.c : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#000", fontWeight: 800 }}>
                    {on ? "✓" : ""}
                  </div>
                  <div style={{ fontSize: 11, color: on ? m.c : "var(--text)", fontWeight: 600 }}>{m.l}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MTPROTO KANAL PANEL — Telegram kanal statistika (Phase 2)
// ─────────────────────────────────────────────────────────────
function MtprotoChannelPanel({ push, user }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("idle");  // idle | code | password | listing
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminChannels, setAdminChannels] = useState([]);
  const [selected, setSelected] = useState({});

  const isCeo = user?.role === "ceo" || user?.role === "super_admin";

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await TelegramAPI.mtprotoStatus();
      setStatus(s);
      if (s?.connected) setStep("idle");
    } catch (e) {
      console.warn("[mtproto/status]", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const sendCode = async () => {
    if (!phone.trim()) { push("Telefon raqamini kiriting", "warn"); return; }
    setBusy(true);
    try {
      await TelegramAPI.sendCode(phone.trim());
      push("Telegram orqali kod yuborildi", "ok");
      setStep("code");
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) { push("Kodni kiriting", "warn"); return; }
    setBusy(true);
    try {
      await TelegramAPI.verifyCode(code.trim());
      push("Kirildi! Endi kanallarni tanlang", "ok");
      setStep("idle"); setCode(""); setPassword("");
      await reload();
      await loadAdmin();
    } catch (e) {
      if (e.message === "PASSWORD_REQUIRED" || (e.message || "").includes("PASSWORD_REQUIRED")) {
        setStep("password");
        push("2FA paroli kerak", "warn");
      } else {
        push(e.message, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyPassword = async () => {
    if (!password) { push("Parolni kiriting", "warn"); return; }
    setBusy(true);
    try {
      await TelegramAPI.verifyCode(code.trim(), password);
      push("Kirildi! Endi kanallarni tanlang", "ok");
      setStep("idle"); setCode(""); setPassword("");
      await reload();
      await loadAdmin();
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const loadAdmin = async () => {
    setBusy(true);
    try {
      const r = await TelegramAPI.adminChannels();
      setAdminChannels(r.channels || []);
      setStep("listing");
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const connectSelected = async () => {
    const chs = adminChannels.filter(c => selected[c.channelId]);
    if (chs.length === 0) { push("Kamida bitta kanal tanlang", "warn"); return; }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const c of chs) {
      try { await TelegramAPI.connectChannel(c); ok++; }
      catch (e) { fail++; console.warn(e); }
    }
    push(`✓ ${ok} kanal ulandi${fail ? `, ✗ ${fail} xato` : ""}`, ok ? "ok" : "error");
    setSelected({}); setStep("idle");
    await reload();
    setBusy(false);
  };

  const syncChannel = async (id) => {
    setBusy(true);
    try {
      const r = await TelegramAPI.syncChannel(id);
      if (r?.note) {
        push(r.note, "warn");
      } else {
        push(`Statistika yangilandi · ${r?.members?.toLocaleString() || "?"} a'zo`, "ok");
      }
      await reload();
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const removeChannel = async (id, title) => {
    if (!confirm(`"${title}" kanalini o'chirasizmi?`)) return;
    try {
      await TelegramAPI.removeChannel(id);
      push("Kanal o'chirildi", "ok");
      await reload();
    } catch (e) {
      push(e.message, "error");
    }
  };

  const disconnectAll = async () => {
    if (!confirm("Telegram akkauntni va barcha kanallarni uzasizmi?")) return;
    setBusy(true);
    try {
      await TelegramAPI.disconnectMtproto();
      push("Akkaunt uzildi", "ok");
      await reload();
    } catch (e) {
      push(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="card mb14"><div className="text-muted text-sm">Yuklanmoqda...</div></div>;
  }

  return (
    <div className="card mb14">
      <div className="flex aic jb mb12">
        <div>
          <div className="card-title" style={{ marginBottom: 3 }}>📺 Telegram Kanal Statistikasi</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>
            Rasmiy Telegram statistikasi (a'zolar tarixi, ko'rishlar, ERR) — kanal admin akkaunti orqali
          </div>
        </div>
        {status?.connected && <span className="badge b-ok">Ulangan</span>}
      </div>

      {/* AKKAUNT — ulangan holati */}
      {status?.connected ? (
        <div style={{ background: "rgba(74,222,128,0.06)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: "1px solid rgba(74,222,128,0.2)" }}>
          <div className="flex aic gap8">
            <div style={{ fontSize: 18 }}>✅</div>
            <div className="f1">
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>{status.session?.accountName || status.session?.phone}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                Telefon: {status.session?.phone}
                {status.session?.lastUsedAt && <> · Oxirgi: {new Date(status.session.lastUsedAt).toLocaleString("uz-UZ")}</>}
              </div>
            </div>
            {isCeo && (
              <button className="btn btn-ghost btn-xs" onClick={disconnectAll} disabled={busy}>Uzish</button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--s2)", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>
            <div style={{ color: "#38BDF8", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>Qanday ishlaydi:</div>
            <div>1. <strong>Kanal admining</strong> Telegram akkaunti telefonini kiriting (CEO bo'lishi shart emas)</div>
            <div>2. Telegram'ga kelgan kodni tasdiqlang (agar 2FA bor — parolni ham)</div>
            <div>3. Admin kanallari ro'yxati chiqadi — qaysilarini tanlang</div>
            <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(56,189,248,0.08)", borderRadius: 6, border: "1px solid rgba(56,189,248,0.15)" }}>
              <span style={{ color: "#38BDF8", fontWeight: 600 }}>Xavfsizlik:</span> akkaunt ma'lumotlari faqat <strong>o'qish</strong> uchun ishlatiladi (xabar yubormaymiz, kontaktlarni ko'rmaymiz). Session shifrlanib saqlanadi.
            </div>
          </div>

          {!isCeo && (
            <div style={{ fontSize: 10, color: "var(--orange)", marginBottom: 10 }}>
              ⚠️ Faqat tashkilot egasi (CEO) bu sozlamani o'zgartira oladi
            </div>
          )}

          {step === "idle" && (
            <div className="flex aic gap8">
              <input className="field f1" type="tel" placeholder="+998 90 123 45 67"
                value={phone} onChange={e => setPhone(e.target.value)}
                disabled={!isCeo || busy} onKeyDown={e => e.key === "Enter" && sendCode()} />
              <button className="btn btn-primary btn-sm" onClick={sendCode} disabled={busy || !isCeo}>
                {busy ? "..." : "Kod yuborish"}
              </button>
            </div>
          )}

          {step === "code" && (
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
                Kod Telegram ilovangizga yuborildi. <strong style={{ color: "var(--gold)" }}>{phone}</strong>
              </div>
              <div className="flex aic gap8">
                <input className="field f1" type="text" inputMode="numeric" placeholder="12345"
                  value={code} onChange={e => setCode(e.target.value)}
                  disabled={busy} autoFocus onKeyDown={e => e.key === "Enter" && verifyCode()} />
                <button className="btn btn-primary btn-sm" onClick={verifyCode} disabled={busy}>
                  {busy ? "..." : "Tasdiqlash"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setStep("idle"); setCode(""); }} disabled={busy}>
                  ← Boshqa raqam
                </button>
              </div>
            </div>
          )}

          {step === "password" && (
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
                Akkauntda 2-bosqichli tasdiq bor. Parolni kiriting:
              </div>
              <div className="flex aic gap8">
                <input className="field f1" type="password" placeholder="2FA parol"
                  value={password} onChange={e => setPassword(e.target.value)}
                  disabled={busy} autoFocus onKeyDown={e => e.key === "Enter" && verifyPassword()} />
                <button className="btn btn-primary btn-sm" onClick={verifyPassword} disabled={busy}>
                  {busy ? "..." : "Davom etish"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setStep("idle"); setCode(""); setPassword(""); }} disabled={busy}>
                  ← Bekor
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ULANGAN KANALLAR */}
      {status?.connected && status.channels && status.channels.length > 0 && (
        <>
          <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginTop: 14, marginBottom: 8 }}>
            Ulangan kanallar
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {status.channels.map(c => (
              <div key={c.id} style={{ background: "var(--s2)", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 16 }}>📺</div>
                <div className="f1">
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>
                    {c.username && <>@{c.username} · </>}
                    {c.memberCount?.toLocaleString() || "?"} a'zo
                    {c.lastSyncedAt
                      ? <> · Oxirgi: {new Date(c.lastSyncedAt).toLocaleString("uz-UZ")}</>
                      : <> · <span style={{ color: "var(--orange)" }}>Hali sinxronlanmagan</span></>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => syncChannel(c.id)} disabled={busy}>↻ Yangilash</button>
                {isCeo && (
                  <button className="btn btn-ghost btn-xs" onClick={() => removeChannel(c.id, c.title)} disabled={busy}>O'chirish</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* YANGI KANAL TANLASH */}
      {status?.connected && (
        <div style={{ marginTop: 12 }}>
          {step !== "listing" ? (
            <button className="btn btn-ghost btn-sm" onClick={loadAdmin} disabled={busy || !isCeo}>
              {busy ? "Yuklanmoqda..." : "+ Kanal qo'shish"}
            </button>
          ) : (
            <div style={{ background: "var(--s2)", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)" }}>
              <div className="flex aic jb mb8">
                <div style={{ fontSize: 11, fontWeight: 600 }}>Admin kanallari ({adminChannels.length})</div>
                <button className="btn btn-ghost btn-xs" onClick={() => setStep("idle")}>Yopish</button>
              </div>
              {adminChannels.length === 0 ? (
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Admin kanallar topilmadi</div>
              ) : (
                <>
                  <div style={{ display: "grid", gap: 4, maxHeight: 280, overflow: "auto" }}>
                    {adminChannels.map(c => {
                      const already = (status.channels || []).some(x => String(x.channelId) === String(c.channelId));
                      const on = !!selected[c.channelId];
                      return (
                        <div key={c.channelId}
                          onClick={() => !already && setSelected(s => ({ ...s, [c.channelId]: !s[c.channelId] }))}
                          style={{ cursor: already ? "default" : "pointer", opacity: already ? 0.5 : 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${on ? "var(--teal)" : "var(--border)"}`, background: on ? "rgba(0,201,190,0.06)" : "var(--s3)", display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${on ? "var(--teal)" : "var(--border)"}`, background: on ? "var(--teal)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#000", fontWeight: 800 }}>
                            {on ? "✓" : ""}
                          </div>
                          <div className="f1">
                            <div style={{ fontSize: 11, fontWeight: 600 }}>
                              {c.title} {c.creator && <span style={{ fontSize: 9, color: "var(--gold)" }}>· egasi</span>}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--muted)" }}>
                              {c.username && <>@{c.username} · </>}
                              {c.memberCount?.toLocaleString() || "?"} a'zo
                              {already && <> · <span style={{ color: "var(--green)" }}>allaqachon ulangan</span></>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex aic jb mt10">
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>
                      {Object.values(selected).filter(Boolean).length} ta tanlangan
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={connectSelected} disabled={busy || Object.values(selected).filter(Boolean).length === 0}>
                      Tanlanganlarni ulash
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MEMORY PANEL — AI xotirasi (foydalanuvchi fakt'lari)
// ─────────────────────────────────────────────────────────────
function MemoryPanel({ push }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await MemoryAPI.list();
      setItems(r?.memories || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const text = input.trim();
    if (!text) return;
    try {
      await MemoryAPI.add(text, 'fact', false);
      setInput(""); load(); push("Xotiraga qo'shildi", "ok");
    } catch (e) { push(e.message, "err"); }
  };

  const togglePin = async (it) => {
    try { await MemoryAPI.update(it.id, { pinned: !it.pinned }); load(); } catch (e) { push(e.message, "err"); }
  };

  const remove = async (id) => {
    if (!confirm("Ushbu xotirani o'chirishni tasdiqlaysizmi?")) return;
    try { await MemoryAPI.remove(id); load(); } catch (e) { push(e.message, "err"); }
  };

  const clearAll = async () => {
    if (!confirm("Pin qilingandan tashqari barcha xotirani o'chirasizmi?")) return;
    try { await MemoryAPI.clear(true); load(); push("Xotira tozalandi", "ok"); } catch (e) { push(e.message, "err"); }
  };

  return (
    <div className="card mb14">
      <div className="flex aic jb mb10">
        <div className="card-title" style={{ marginBottom: 0 }}>AI Xotirasi</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>↻ Yangilash</button>
          {items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearAll}>Hammasini tozalash</button>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.6 }}>
        AI sizning kasbingiz, sohangiz, afzalliklaringizni eslab qoladi — keyingi suhbatlarda qayta so'ramaydi.
        Faktlarni o'zingiz ham qo'shishingiz mumkin.
      </div>
      <div className="flex gap8 mb10">
        <input className="field f1" placeholder="Masalan: Men matematika repetitorman, 30 ta o'quvchim bor"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!input.trim()}>Qo'shish</button>
      </div>
      {err && <div style={{ fontSize: 10, color: "var(--red)" }}>{err}</div>}
      {items.length === 0 && !loading && (
        <div style={{ fontSize: 11, color: "var(--muted)", padding: 14, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 10 }}>
          Hali xotira bo'sh. AI suhbat davomida o'zi to'ldiradi.
        </div>
      )}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--s2)", borderRadius: 10, border: it.pinned ? "1px solid rgba(251,191,36,0.3)" : "1px solid var(--border)" }}>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: it.source === 'manual' ? "rgba(0,201,190,0.12)" : "rgba(148,163,184,0.12)", color: it.source === 'manual' ? "var(--teal)" : "var(--muted)", fontWeight: 600 }}>
                {it.source === 'manual' ? 'Siz' : 'AI'}
              </span>
              <div style={{ flex: 1, fontSize: 12, color: "var(--text)" }}>{it.content}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => togglePin(it)} title={it.pinned ? "Pinni olib tashlash" : "Pin qilish"} style={{ color: it.pinned ? "#FBBF24" : "var(--muted)" }}>📌</button>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(it.id)} title="O'chirish" style={{ color: "var(--red)" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AI BEHAVIOR PANEL — javob chuqurligi, auto-learn, push
// ─────────────────────────────────────────────────────────────
function AiBehaviorPanel({ push }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    UserSettingsAPI.get().then(setS).catch(() => setS({}));
  }, []);

  const update = async (patch) => {
    const next = { ...(s || {}), ...patch };
    setS(next);
    try { await UserSettingsAPI.save(patch); } catch (e) { push(e.message, "err"); }
  };

  if (!s) return null;

  const depths = [
    { id: 'short', label: "Qisqa (2-4 jumla)" },
    { id: 'adaptive', label: "Moslashuvchan" },
    { id: 'detailed', label: "To'liq hisobot" },
  ];

  return (
    <div className="card mb14">
      <div className="card-title mb10">AI xulq-atvori</div>
      <div style={{ display: "grid", gap: 12 }}>

        <div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6 }}>Javob chuqurligi</div>
          <div style={{ display: "flex", gap: 6 }}>
            {depths.map(d => (
              <button key={d.id} className="btn btn-ghost btn-sm"
                style={s.response_depth === d.id ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.08)" } : {}}
                onClick={() => update({ response_depth: d.id })}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={!!s.memory_enabled} onChange={e => update({ memory_enabled: e.target.checked })} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Xotira yoqilgan</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>AI sizni eslab qoladi va qayta so'ramaydi</div>
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={!!s.auto_learn} onChange={e => update({ auto_learn: e.target.checked })} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Avtomatik o'rganish</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Siz o'zingiz haqida aytgan muhim narsalar avtomatik saqlanadi</div>
          </div>
        </label>

        <div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6 }}>Push bildirishnomalar (Telegram)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(s.push_settings || {}).map(([k, v]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 10, background: v ? "rgba(0,201,190,0.1)" : "var(--s2)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }}>
                <input type="checkbox" checked={!!v} onChange={e => update({ push_settings: { ...(s.push_settings || {}), [k]: e.target.checked } })} />
                {k}
              </label>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function SettingsPage({ aiConfig, setAiConfig, push, effectiveAI, hasPersonalKey, hasGlobalAI, user }) {
  const uk = useCallback((k) => "u_" + (user?.id || "anon") + "_" + k, [user?.id]);
  const [keyInput, setKeyInput] = useState(aiConfig.apiKey);
  const [saved, setSaved] = useState(false);
  const [autoOn, setAutoOn] = useState(() => LS.get(uk("auto_report"), false));
  const [reportTime, setReportTime] = useState(() => LS.get(uk("report_time"), "09:00"));
  const [allKeys, setAllKeys] = useState(() => LS.get(uk("all_keys"), {}));
  const [showPersonal, setShowPersonal] = useState(hasPersonalKey);

  const globalAI = GlobalAI.get();
  const effProv = AI_PROVIDERS[effectiveAI.provider];
  const currentPlan = PLANS[user?.plan || "free"];

  const selectProvider = (id) => {
    const savedKey = allKeys[id] || "";
    setAiConfig(c => ({ ...c, provider: id, model: AI_PROVIDERS[id].models[0].id, apiKey: savedKey }));
    setKeyInput(savedKey); LS.set(uk("provider"), id); LS.set(uk("model"), AI_PROVIDERS[id].models[0].id);
  };

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) {
      const newAllKeys = { ...allKeys }; delete newAllKeys[aiConfig.provider];
      setAllKeys(newAllKeys); LS.set(uk("all_keys"), newAllKeys);
      setAiConfig(c => ({ ...c, apiKey: "" })); LS.set(uk("apiKey"), "");
      // Backend DB'da ham yangilash (agent ishlatishi uchun)
      AiAPI.saveConfig({ provider: aiConfig.provider, model: aiConfig.model, apiKey: "", allKeys: newAllKeys }).catch(() => {});
      push("Shaxsiy kalit o'chirildi — global AI ishlatiladi", "ok");
      return;
    }
    const newAllKeys = { ...allKeys, [aiConfig.provider]: k };
    setAllKeys(newAllKeys); LS.set(uk("all_keys"), newAllKeys);
    setAiConfig(c => ({ ...c, apiKey: k })); LS.set(uk("apiKey"), k);
    // Backend DB'da ham — agent va bot shu yerdan o'qiydi
    AiAPI.saveConfig({ provider: aiConfig.provider, model: aiConfig.model, apiKey: k, allKeys: newAllKeys }).catch(() => {});
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    push(`✓ Shaxsiy ${AI_PROVIDERS[aiConfig.provider].name} API kalit saqlandi — cheksiz foydalanish!`, "ok");
  };

  const removePersonalKey = () => {
    const newAllKeys = { ...allKeys }; delete newAllKeys[aiConfig.provider];
    setAllKeys(newAllKeys); LS.set(uk("all_keys"), newAllKeys);
    setAiConfig(c => ({ ...c, apiKey: "" })); LS.set(uk("apiKey"), "");
    setKeyInput("");
    push("Shaxsiy kalit o'chirildi — global AI ga qaytildi", "ok");
  };

  return (
    <div>
      {/* ── AI HOLATI BANNER ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
        background: effectiveAI.apiKey ? "rgba(0,201,190,0.06)" : "rgba(248,113,113,0.08)",
        border: `1px solid ${effectiveAI.apiKey ? "rgba(0,201,190,0.2)" : "rgba(248,113,113,0.2)"}`,
        borderRadius: 14, marginBottom: 18
      }}>
        <div style={{ fontSize: 28 }}>{effectiveAI.apiKey ? "" : ""}</div>
        <div className="f1">
          <div style={{ fontFamily: "var(--fh)", fontSize: 15, fontWeight: 800, color: effectiveAI.apiKey ? "var(--green)" : "var(--red)" }}>
            {effectiveAI.apiKey
              ? (hasPersonalKey
                ? `Shaxsiy ${AI_PROVIDERS[aiConfig.provider].name} API — Cheksiz foydalanish`
                : `${effProv.name} (Global) — Bepul foydalanish`)
              : "AI ulanmagan"}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            {effectiveAI.apiKey
              ? (hasPersonalKey
                ? "O'z API kalitingiz ulangan — limit hisoblanmaydi, cheksiz so'rov yuboring"
                : `Admin ulagan ${effProv.name} dan bepul foydalanyapsiz. Tarifingiz: ${currentPlan.nameUz} (${currentPlan.limits.ai_requests === -1 ? "cheksiz" : currentPlan.limits.ai_requests + " so'rov/oy"})`)
              : "Admin hali global AI ulamagan yoki shaxsiy API kalit kiriting"}
          </div>
        </div>
        {hasPersonalKey && <span className="badge b-ok">Shaxsiy kalit</span>}
        {!hasPersonalKey && hasGlobalAI && <span className="badge b-ok">Global AI</span>}
      </div>

      {/* ── GLOBAL AI HOLATI (agar bor) ── */}
      {hasGlobalAI && !hasPersonalKey && (
        <div className="card mb14">
          <div className="card-title mb8"> Global AI (Admin Ulagan)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: effProv.color + "15", border: `1px solid ${effProv.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{effProv.icon}</div>
            <div className="f1">
              <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, color: effProv.color }}>{effProv.name}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>Model: {globalAI?.model} · {effProv.company}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>Tarifingiz limiti</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 800, color: "var(--gold)" }}>{currentPlan.limits.ai_requests === -1 ? "Cheksiz" : currentPlan.limits.ai_requests} so'rov/oy</div>
            </div>
          </div>
        </div>
      )}

      {/* ── SHAXSIY API KALIT (IXTIYORIY) ── */}
      <div className="card mb14">
        <div className="flex aic jb mb12">
          <div>
            <div className="card-title" style={{ marginBottom: 3 }}> Shaxsiy API Kalit (Ixtiyoriy)</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>O'z API kalitingizni ulang — <strong style={{ color: "var(--green)" }}>cheksiz</strong> foydalaning, limit hisoblanmaydi</div>
          </div>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: showPersonal ? "var(--gold)" : "var(--s4)", border: "1px solid var(--border)", cursor: "pointer", position: "relative", transition: "all .2s" }} onClick={() => setShowPersonal(v => !v)}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: showPersonal ? 19 : 2, transition: "left .2s" }} />
          </div>
        </div>

        {showPersonal && (
          <>
            {/* Provayder tanlash */}
            <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Provayder</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              {Object.values(AI_PROVIDERS).map(p => {
                const hasKey = !!(allKeys[p.id]); const isActive = aiConfig.provider === p.id;
                return (
                  <div key={p.id} onClick={() => selectProvider(p.id)} style={{ border: `2px solid ${isActive ? p.color : hasKey ? "rgba(0,255,148,0.2)" : "var(--border)"}`, borderRadius: 10, padding: "10px 8px", cursor: "pointer", background: isActive ? `${p.color}0D` : "var(--s2)", transition: "all .2s", textAlign: "center", position: "relative" }}>
                    {hasKey && <div style={{ position: "absolute", top: 5, right: 5, width: 12, height: 12, borderRadius: 6, background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#000", fontWeight: 700 }}>✓</div>}
                    <div style={{ fontSize: 18, color: p.color, marginBottom: 4 }}>{p.icon}</div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700, color: isActive ? p.color : "var(--text)" }}>{p.name}</div>
                    <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 2 }}>{p.company}</div>
                  </div>
                );
              })}
            </div>

            {/* Model */}
            <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Model</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {AI_PROVIDERS[aiConfig.provider].models.map(m => (
                <div key={m.id} className={`model-opt ${aiConfig.model === m.id ? "sel" : ""}`} onClick={() => { setAiConfig(c => ({ ...c, model: m.id })); LS.set(uk("model"), m.id); }}>
                  <span style={{ fontSize: 11 }}>{m.label}</span>
                  <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 8, background: "var(--s3)", color: "var(--muted)" }}>{m.badge}</span>
                </div>
              ))}
            </div>

            {/* API Kalit */}
            <div style={{ fontFamily: "var(--fh)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>API Kalit</div>
            <input className="field mb6" type="password" placeholder={AI_PROVIDERS[aiConfig.provider].ph} value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => e.key === "Enter" && saveKey()} />
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}> <span style={{ color: "var(--teal)" }}>{AI_PROVIDERS[aiConfig.provider].hint}</span></div>
            <div className="flex aic gap8">
              <button className="btn btn-primary btn-sm" onClick={saveKey}>{saved ? "✓ Saqlandi!" : "Saqlash"}</button>
              {hasPersonalKey && <button className="btn btn-danger btn-sm" onClick={removePersonalKey}>O'chirish (Global ga qaytish)</button>}
              <span className={`badge ${aiConfig.apiKey ? "b-ok" : "b-no"}`} style={{ marginLeft: "auto" }}>{aiConfig.apiKey ? "✓ Shaxsiy kalit ulangan" : "Global AI ishlatilmoqda"}</span>
            </div>
          </>
        )}
      </div>

      {/* ── AVTOMATIK HISOBOT ── */}
      <div className="card mb14">
        <div className="flex aic jb mb12">
          <div><div className="card-title" style={{ marginBottom: 3 }}> Avtomatik Hisobot</div><div style={{ fontSize: 10, color: "var(--muted)" }}>Belgilangan vaqtda AI hisobot tayyorlaydi</div></div>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: autoOn ? "var(--green)" : "var(--s4)", border: "1px solid var(--border)", cursor: "pointer", position: "relative", transition: "all .2s" }} onClick={() => { setAutoOn(v => { LS.set(uk("auto_report"), !v); return !v; }); }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: autoOn ? 19 : 2, transition: "left .2s" }} />
          </div>
        </div>
        {autoOn && (<div className="flex aic gap10"><div><label className="field-label">Vaqt</label><input type="time" className="field" value={reportTime} onChange={e => { setReportTime(e.target.value); LS.set(uk("report_time"), e.target.value); }} style={{ width: 110 }} /></div><div style={{ fontSize: 10, color: "var(--muted)", paddingTop: 18 }}>Har kuni shu vaqtda</div></div>)}
      </div>

      {/* ── TELEGRAM BILDIRISHNOMA ── */}
      <div className="card mb14">
        <div className="flex aic jb mb10">
          <div className="card-title" style={{ marginBottom: 0 }}>Telegram bildirishnoma</div>
          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 6, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#FBBF24" }}>Tez kunda</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 10, lineHeight: 1.6 }}>Muhim ogohlantirishlar va hisobotlarni Telegram ga yuborish. Bu funksiya tez kunda ishga tushadi.</div>
        <div className="flex gap8 mb8">
          <input className="field f1" placeholder="Telegram Chat ID (masalan: 123456789)" value={LS.get(uk("tg_chat_id"), "")}
            onChange={e => LS.set(uk("tg_chat_id"), e.target.value)} style={{ fontSize: 12 }} />
          <button className="btn btn-primary btn-sm" onClick={() => push("Chat ID saqlandi. Bot tez kunda ishga tushadi.", "info")}>Saqlash</button>
        </div>
        <div style={{ fontSize: 9, color: "var(--muted)" }}>Chat ID ni bilish uchun: Telegram da @userinfobot ga yozing</div>
      </div>

      {/* ── TIL SOZLAMALARI ── */}
      <div className="card mb14">
        <div className="card-title mb10">Til sozlamalari</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "uz", label: "O'zbekcha", flag: "🇺🇿" },
            { id: "ru", label: "Русский", flag: "🇷🇺" },
            { id: "en", label: "English", flag: "🇬🇧" },
          ].map(lang => {
            const curLang = LS.get(uk("lang"), "uz");
            return (
              <button key={lang.id} className="btn btn-ghost btn-sm"
                style={curLang === lang.id ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.08)" } : {}}
                onClick={() => {
                  LS.set(uk("lang"), lang.id);
                  UserSettingsAPI.save({ language: lang.id }).catch(() => {});
                  push(`Til o'zgartirildi: ${lang.label}`, "ok");
                }}>
                {lang.flag} {lang.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>AI javoblari tanlangan tilda keladi. Interfeys hozircha O'zbek tilida.</div>
      </div>

      {/* ── AI XOTIRASI (MEMORY) ── */}
      <MemoryPanel push={push} />

      {/* ── BOSHQA AI SOZLAMALAR ── */}
      <AiBehaviorPanel push={push} />

      {/* ── TELEGRAM YORDAMCHI BOT ── */}
      <TelegramSettingsPanel push={push} user={user} />

      {/* ── TELEGRAM KANAL STATISTIKA (MTProto) ── */}
      <MtprotoChannelPanel push={push} user={user} />

      {/* ── QANDAY ISHLAYDI (yopiq) ── */}
      <details className="card" style={{ cursor: "pointer" }}>
        <summary className="card-title mb10" style={{ listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span>AI Qanday Ishlaydi</span><span style={{ fontSize: 10, color: "var(--muted)" }}>▼</span></summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: "", title: "Bepul (Global AI)", desc: "Admin ulagan AI dan barcha foydalanuvchilar bepul foydalanadi. Har bir tarif o'z so'rov limitiga ega.", c: "var(--green)" },
            { icon: "", title: "Shaxsiy API", desc: "O'z API kalitingizni ulasangiz — cheksiz so'rov, limit hisoblanmaydi. Istalgan provayderdan.", c: "var(--gold)" },
            { icon: "", title: "Yuqori tarif", desc: "Starter (100), Pro (500), Enterprise (∞) — ko'proq so'rov uchun tarifni yuksaltiring.", c: "var(--purple)" },
            { icon: "", title: "4 AI Provayder", desc: "Claude (aqlli), DeepSeek (arzon), ChatGPT (universal), Gemini (katta kontekst).", c: "var(--teal)" },
          ].map((s, i) => (
            <div key={i} style={{ background: "var(--s2)", borderRadius: 10, padding: "12px 14px", border: `1px solid ${s.c}15` }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 11, fontWeight: 700, color: s.c, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AUTO-DASHBOARD GENERATOR
// ─────────────────────────────────────────────────────────────
// Har bir manba uchun avtomatik 10-15 ta dashboard karta generatsiya qiladi
function generateDashboards(source, colSelection) {
  if (!source?.data?.length) return [];
  const data = source.data;
  const type = source.type;
  const cards = [];
  const C = CHART_COLORS;

  // ── INSTAGRAM manba uchun maxsus dashboardlar (to'liq analytics) ──
  if (type === "instagram") {
    const summary = data.find(d => d._type === "PROFIL_STATISTIKA");
    const posts = data.filter(d => !d._type);
    const storiesData = data.filter(d => d._type === "STORY");
    const fmtN = (n) => { if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"; if (n >= 1000) return (n / 1000).toFixed(1) + "K"; return String(n); };
    const pctStr = (v) => v > 0 ? `+${v}%` : `${v}%`;
    const typeLabel = (t) => t === "VIDEO" ? "Video" : t === "IMAGE" ? "Rasm" : t === "REEL" ? "Reel" : t === "CAROUSEL_ALBUM" ? "Carousel" : t || "Boshqa";

    // Insights mavjudligini aniqlash (reach/impressions bor yoki yo'q)
    const hasInsights = posts.some(p => (p.reach || 0) > 0) || (summary?.total_reach || 0) > 0;
    const hasProfileInsights = (summary?.reach_30d || 0) > 0 || (summary?.daily_reach?.length || 0) > 0;

    if (summary) {
      const followers = summary.followers_count || 0;
      const totalLikes = summary.total_likes || 0;
      const totalComments = summary.total_comments || 0;
      const fetched = summary.fetched_posts || 1;
      const engRate = summary.engagement_rate || 0;
      const engRateStr = summary.engagement_rate_str || (typeof engRate === "number" ? engRate.toFixed(1) + "%" : engRate + "%");

      // ═══ 1. ASOSIY KO'RSATKICHLAR ═══
      const mainStats = [
        { l: "Followers", v: fmtN(followers), c: "#E879F9", i: "👥" },
      ];
      if (hasInsights || hasProfileInsights) {
        mainStats.push(
          { l: "Reach", v: fmtN(summary.reach_30d || summary.total_reach || 0), c: "#60A5FA", i: "👁" },
          { l: "Engagement Rate", v: engRateStr, c: "#4ADE80", i: "📈" },
          { l: "Impressions", v: fmtN(summary.impressions_30d || summary.total_impressions || 0), c: "#A78BFA", i: "📊" },
        );
      } else {
        // Insights yo'q — likes/comments ko'rsatish
        mainStats.push(
          { l: "Jami postlar", v: fmtN(summary.total_posts || 0), c: "#4ADE80", i: "📸" },
          { l: "O'rtacha like", v: fmtN(Math.round(totalLikes / fetched)), c: "#F87171", i: "❤️" },
          { l: "O'rtacha izoh", v: fmtN(Math.round(totalComments / fetched)), c: "#FBBF24", i: "💬" },
          { l: "Engagement Rate", v: engRateStr, c: "#00C9BE", i: "📈" },
        );
      }
      cards.push({ id: "ig_main", title: "Asosiy ko'rsatkichlar", icon: "📊", type: "stats", stats: mainStats });

      // Insights yo'q — ogohlantirish
      if (!hasInsights && !hasProfileInsights) {
        cards.push({
          id: "ig_warn", title: "Insights ma'lumotlari", icon: "⚠️", type: "highlight", items: [
            { l: "Holat", v: "Reach, Impressions, Saves, Shares ma'lumotlari olinmadi", c: "#FBBF24" },
            { l: "Sabab", v: "Token da instagram_manage_insights ruxsati yo'q", c: "#F87171" },
            { l: "Yechim", v: "Graph API Explorer da yangi token oling va instagram_manage_insights ni tanlang", c: "#4ADE80" },
            { l: "Hozir ko'rinadi", v: "Faqat likes, comments, followers — asosiy ma'lumotlar", c: "#60A5FA" },
          ]
        });
      }

      // ═══ 2. REACH & IMPRESSIONS — kunlik (faqat insights bo'lsagina) ═══
      if (hasProfileInsights) {
        const dReach = summary.daily_reach || [];
        const dImp = summary.daily_impressions || [];
        if (dReach.length >= 3 || dImp.length >= 3) {
          const maxLen = Math.max(dReach.length, dImp.length);
          const trendData = [];
          for (let i = 0; i < maxLen; i++) {
            const dateStr = (dReach[i]?.date || dImp[i]?.date || "").slice(5, 10);
            trendData.push({ name: dateStr, Reach: dReach[i]?.value || 0, Impressions: dImp[i]?.value || 0 });
          }
          cards.push({
            id: "ig_reach_imp", title: "Reach & Impressions — kunlik", icon: "📈", type: "chart", chartType: "line",
            data: trendData, keys: ["Reach", "Impressions"], xKey: "name", colors: ["#EC4899", "#60A5FA"]
          });
        }
      }

      // ═══ 3. AUDITORIYA JINSI (doughnut/pie) ═══
      const genderData = summary.audience?.follower_demographics_gender || summary.audience?.reached_audience_demographics_gender || {};
      if (Object.keys(genderData).length > 0) {
        const genderMap = { male: "Erkak", female: "Ayol", m: "Erkak", f: "Ayol", u: "Noma'lum", unknown: "Noma'lum" };
        const genderColors = { "Erkak": "#60A5FA", "Ayol": "#EC4899", "Noma'lum": "#94A3B8" };
        const genderItems = Object.entries(genderData)
          .map(([k, v]) => ({ name: genderMap[k.toLowerCase()] || k, value: v }))
          .filter(d => d.value > 0);
        const gColors = genderItems.map(d => genderColors[d.name] || "#A78BFA");
        cards.push({
          id: "ig_gender", title: "Auditoriya jinsi", icon: "👥", type: "chart", chartType: "pie",
          data: genderItems, colors: gColors
        });
      }
    }

    if (posts.length > 0) {
      // ═══ 4. POST SAMARADORLIGI (oxirgi 8 post) ═══
      const recent8 = [...posts].filter(p => p.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).reverse();
      if (recent8.length >= 3) {
        const perfKeys = hasInsights ? ["Likes", "Saves", "Shares"] : ["Likes", "Comments"];
        const perfColors = hasInsights ? ["#EC4899", "#4ADE80", "#FB923C"] : ["#EC4899", "#FBBF24"];
        cards.push({
          id: "ig_post_perf", title: `Post samaradorligi (oxirgi ${recent8.length} post)`, icon: "📊", type: "chart", chartType: "bar",
          data: recent8.map(p => {
            const row = { name: (p.date || "").slice(5, 10), Likes: p.likes || 0 };
            if (hasInsights) { row.Saves = p.saved || 0; row.Shares = p.shares || 0; }
            else { row.Comments = p.comments || 0; }
            return row;
          }),
          keys: perfKeys, xKey: "name", colors: perfColors
        });
      }

      // ═══ 5. AUDITORIYA YOSHI (horizontal bar) ═══
      const ageData = summary?.audience?.follower_demographics_age || summary?.audience?.reached_audience_demographics_age || {};
      if (Object.keys(ageData).length > 0) {
        const ageOrder = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
        const sortedAge = Object.entries(ageData)
          .map(([k, v]) => ({ name: k, Obunachilar: v }))
          .sort((a, b) => {
            const ai = ageOrder.indexOf(a.name);
            const bi = ageOrder.indexOf(b.name);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
        cards.push({
          id: "ig_age", title: "Auditoriya yoshi", icon: "👤", type: "chart", chartType: "hbar",
          data: sortedAge, keys: ["Obunachilar"], xKey: "name", colors: ["#A78BFA"]
        });
      }

      // ═══ 6. ENG FAOL SOATLAR ═══
      const onlineData = summary?.online_followers || {};
      if (Object.keys(onlineData).length > 0) {
        const hourData = [];
        for (let h = 0; h < 24; h += 2) {
          const val = (onlineData[String(h)] || 0) + (onlineData[String(h + 1)] || 0);
          hourData.push({ name: String(h).padStart(2, "0"), Faollar: val });
        }
        if (hourData.some(d => d.Faollar > 0)) {
          cards.push({
            id: "ig_hours", title: "Eng faol soatlar", icon: "🕐", type: "chart", chartType: "bar",
            data: hourData, keys: ["Faollar"], xKey: "name",
            colors: hourData.map(d => d.Faollar > hourData.reduce((a, b) => a + b.Faollar, 0) / hourData.length * 1.3 ? "#FB923C" : "#A78BFA")
          });
        }
      }

      // ═══ 7. KONTENT TURI SAMARADORLIGI ═══
      const typeStats = {};
      posts.forEach(p => {
        const t = typeLabel(p.type);
        if (!typeStats[t]) typeStats[t] = { reach: 0, likes: 0, comments: 0, saved: 0, shares: 0, count: 0 };
        typeStats[t].reach += p.reach || 0;
        typeStats[t].likes += p.likes || 0;
        typeStats[t].comments += p.comments || 0;
        typeStats[t].saved += p.saved || 0;
        typeStats[t].shares += p.shares || 0;
        typeStats[t].count++;
      });
      if (Object.keys(typeStats).length > 1) {
        // Insights bor — reach bo'yicha, yo'q — likes bo'yicha
        const hasReachData = Object.values(typeStats).some(s => s.reach > 0);
        cards.push({
          id: "ig_type_reach", title: hasReachData ? "Kontent turi samaradorligi" : "Kontent turi — o'rtacha like", icon: "📊", type: "chart", chartType: "bar",
          data: Object.entries(typeStats).map(([name, s]) => hasReachData
            ? { name, "O'rt reach": Math.round(s.reach / s.count) }
            : { name, "O'rt like": Math.round(s.likes / s.count), "O'rt izoh": Math.round(s.comments / s.count) }
          ),
          keys: hasReachData ? ["O'rt reach"] : ["O'rt like", "O'rt izoh"], xKey: "name",
          colors: hasReachData ? ["#60A5FA"] : ["#F87171", "#FBBF24"]
        });
      }

      // ═══ 8. TOP SHAHARLAR (horizontal bar) ═══
      const topCities = summary?.top_cities || [];
      if (topCities.length > 0) {
        const cityData = topCities.map(c => ({ name: c.name?.split(",")[0] || c.name, Obunachilar: c.value }));
        const totalCityFollowers = cityData.reduce((a, c) => a + c.Obunachilar, 0);
        const totalFollowers = summary?.followers_count || totalCityFollowers;
        if (totalFollowers > totalCityFollowers) {
          cityData.push({ name: "Boshqa", Obunachilar: totalFollowers - totalCityFollowers });
        }
        cards.push({
          id: "ig_cities", title: "Top shaharlar", icon: "📍", type: "chart", chartType: "hbar",
          data: cityData, keys: ["Obunachilar"], xKey: "name", colors: ["#E879F9"]
        });
      }

      // ═══ 9. STORIES STATISTIKASI (faqat ma'lumot bo'lsagina) ═══
      const stData = storiesData.length > 0 ? storiesData : (summary?.stories_data || []);
      const stHasData = stData.some(s => (s.reach || 0) > 0 || (s.impressions || 0) > 0);
      if (stData.length > 0 && stHasData) {
        const avgStReach = Math.round(stData.reduce((a, s) => a + (s.reach || 0), 0) / stData.length);
        const avgStImp = Math.round(stData.reduce((a, s) => a + (s.impressions || 0), 0) / stData.length);
        const avgStReplies = Math.round(stData.reduce((a, s) => a + (s.replies || 0), 0) / stData.length);
        const totalStExits = stData.reduce((a, s) => a + (s.exits || 0), 0);
        const totalStImp = stData.reduce((a, s) => a + (s.impressions || 0), 0);
        const exitRate = totalStImp > 0 ? Math.round(totalStExits / totalStImp * 100) : 0;
        const completionRate = totalStImp > 0 ? Math.round((totalStImp - totalStExits) / totalStImp * 100) : 0;
        const totalStTaps = stData.reduce((a, s) => a + (s.taps || 0), 0);

        cards.push({
          id: "ig_stories", title: `Stories statistikasi (oxirgi ${stData.length} stories)`, icon: "📱", type: "stats",
          stats: [
            { l: "Avg Reach", v: fmtN(avgStReach), c: "#EC4899", i: "👁" },
            { l: "Avg Impressions", v: fmtN(avgStImp), c: "#60A5FA", i: "📊" },
            { l: "Exit Rate", v: exitRate + "%", c: "#F87171", i: "🚪" },
            { l: "Avg Replies", v: String(avgStReplies), c: "#4ADE80", i: "💬" },
            { l: "Taps", v: fmtN(totalStTaps), c: "#FBBF24", i: "👆" },
            { l: "Completion Rate", v: completionRate + "%", c: "#00C9BE", i: "✅" },
          ]
        });

        if (stData.length >= 3) {
          cards.push({
            id: "ig_stories_trend", title: "Stories: Reach vs Exits", icon: "📈", type: "chart", chartType: "line",
            data: stData.map((s, i) => ({ name: `S${i + 1}`, Reach: s.reach || 0, Exits: s.exits || 0 })),
            keys: ["Reach", "Exits"], xKey: "name", colors: ["#EC4899", "#F87171"]
          });
        }
      }

      // ═══ 10. TOP POSTLAR ═══
      // Reach bor — reach bo'yicha, yo'q — likes bo'yicha
      const sortKey = hasInsights ? "reach" : "likes";
      const topPosts = [...posts].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 10);
      if (topPosts.length > 0) {
        const topKeys = hasInsights ? ["Reach", "Likes", "Saves", "Shares"] : ["Likes", "Comments"];
        const topColors = hasInsights ? ["#E879F9", "#EC4899", "#4ADE80", "#FB923C"] : ["#F87171", "#FBBF24"];
        cards.push({
          id: "ig_top_table", title: "Top postlar", icon: "🏆", type: "chart", chartType: "bar",
          data: topPosts.map((p, i) => {
            const row = { name: `#${i + 1} ${typeLabel(p.type)} ${(p.date || "").slice(5, 10)}` };
            if (hasInsights) { row.Reach = p.reach || 0; row.Likes = p.likes || 0; row.Saves = p.saved || 0; row.Shares = p.shares || 0; }
            else { row.Likes = p.likes || 0; row.Comments = p.comments || 0; }
            return row;
          }),
          keys: topKeys, xKey: "name", colors: topColors
        });
      }

      // ═══ 11. HAFTALIK FOLLOWERS O'SISHI ═══
      const followerDaily = summary?.follower_daily || [];
      if (followerDaily.length >= 14) {
        const weeklyData = [];
        const weekSize = 7;
        for (let w = 0; w < Math.floor(followerDaily.length / weekSize); w++) {
          const weekSlice = followerDaily.slice(w * weekSize, (w + 1) * weekSize);
          const first = weekSlice[0]?.value || 0;
          const last = weekSlice[weekSlice.length - 1]?.value || 0;
          const diff = last - first;
          weeklyData.push({
            name: `${w + 1}-hafta`,
            "Yangi followers": diff >= 0 ? diff : 0,
            Ketganlar: diff < 0 ? Math.abs(diff) : 0,
          });
        }
        if (weeklyData.length >= 2) {
          cards.push({
            id: "ig_follower_growth", title: "Haftalik followers o'sishi", icon: "📈", type: "chart", chartType: "bar",
            data: weeklyData, keys: ["Yangi followers", "Ketganlar"], xKey: "name",
            colors: ["#4ADE80", "#F87171"]
          });
        }
      }

      // ═══ 12. LIKE VA IZOH TRENDI (har doim ko'rinadi) ═══
      const sorted = [...posts].filter(p => p.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
      if (sorted.length >= 3) {
        cards.push({
          id: "ig_like_trend", title: "Like va Izoh trendi", icon: "📈", type: "chart", chartType: "area",
          data: sorted.map(p => ({ name: (p.date || "").slice(5, 10), Like: p.likes || 0, Izoh: p.comments || 0 })),
          keys: ["Like", "Izoh"], xKey: "name", colors: ["#F87171", "#FBBF24"]
        });
      }

      // ═══ 13. POST TURI TAQSIMOTI (pie — har doim ko'rinadi) ═══
      const typeCounts = {};
      posts.forEach(p => { const t = typeLabel(p.type); typeCounts[t] = (typeCounts[t] || 0) + 1; });
      if (Object.keys(typeCounts).length > 1) {
        cards.push({
          id: "ig_types_pie", title: "Post turlari taqsimoti", icon: "📊", type: "chart", chartType: "pie",
          data: Object.entries(typeCounts).map(([name, value]) => ({ name, value })),
          colors: ["#E879F9", "#60A5FA", "#4ADE80", "#FBBF24"]
        });
      }

      // ═══ 14. ENGAGEMENT RATE GAUGE ═══
      const engVal = typeof summary?.engagement_rate === "number" ? summary.engagement_rate : parseFloat(summary?.engagement_rate_str || "0");
      cards.push({
        id: "ig_gauge", title: "Engagement Rate", icon: "📈", type: "gauge",
        value: engVal, max: 10, label: (summary?.engagement_rate_str || engVal.toFixed(1) + "%"),
        color: engVal > 3 ? "#4ADE80" : engVal > 1 ? "#FBBF24" : "#F87171"
      });

      // ═══ 15. XULOSALAR VA TAVSIYALAR ═══
      const bestKey = hasInsights ? "reach" : "engagement";
      const best = [...posts].sort((a, b) => (b[bestKey] || 0) - (a[bestKey] || 0))[0];
      const worst = [...posts].sort((a, b) => (a[bestKey] || 0) - (b[bestKey] || 0))[0];
      const items = [];
      if (best) items.push(
        { l: "🏆 Eng yaxshi post", v: hasInsights ? `${fmtN(best.reach || 0)} reach, ${fmtN(best.likes || 0)} like (${best.date || ""})` : `${fmtN(best.likes || 0)} like, ${fmtN(best.comments || 0)} izoh (${best.date || ""})`, c: "#4ADE80" },
        { l: "📝 Caption", v: (best.caption || "").slice(0, 80) + ((best.caption || "").length > 80 ? "..." : ""), c: "#60A5FA" }
      );
      if (worst && posts.length > 3) items.push(
        { l: "📉 Eng past post", v: hasInsights ? `${fmtN(worst.reach || 0)} reach (${worst.date || ""})` : `${fmtN(worst.likes || 0)} like (${worst.date || ""})`, c: "#F87171" }
      );
      const avgEng = posts.reduce((a, p) => a + (p.engagement || 0), 0) / posts.length;
      const goodPosts = posts.filter(p => (p.engagement || 0) > avgEng * 1.5).length;
      items.push(
        { l: "⭐ O'rtachadan yuqori postlar", v: `${goodPosts} ta (${Math.round(goodPosts / posts.length * 100)}%)`, c: "#00C9BE" }
      );
      // Eng samarali tur
      const bestType = Object.entries(typeStats).sort((a, b) => hasInsights ? (b[1].reach / b[1].count) - (a[1].reach / a[1].count) : (b[1].likes / b[1].count) - (a[1].likes / a[1].count))[0];
      if (bestType) items.push({ l: "💡 Tavsiya", v: `"${bestType[0]}" turidagi postlar eng samarali`, c: "#E879F9" });
      cards.push({ id: "ig_summary", title: "Xulosalar va tavsiyalar", icon: "💡", type: "highlight", items });
    }
    return cards;
  }

  // ── TELEGRAM manba uchun maxsus dashboardlar ──
  if (type === "telegram") {
    const summary = data.find(d => d._type === "KANAL_STATISTIKA");
    const posts = data.filter(d => !d._type);
    const adminsData = data.find(d => d._type === "ADMINLAR");

    if (summary) {
      // 1. Kanal umumiy statistika
      cards.push({
        id: "tg_profile", title: "Kanal Statistikasi", icon: "", size: "full", type: "stats",
        stats: [
          { l: "Obunachilar", v: (summary.member_count || 0).toLocaleString(), c: "#38BDF8", i: "" },
          { l: "Jami Postlar", v: (summary.total_posts || 0).toLocaleString(), c: "#4ADE80", i: "" },
          { l: "Jami Ko'rishlar", v: (summary.total_views || 0).toLocaleString(), c: "#E879F9", i: "" },
          { l: "O'rt. Ko'rish", v: (summary.avg_views || 0).toLocaleString(), c: "#FBBF24", i: "" },
          { l: "Jami Ulashish", v: (summary.total_forwards || 0).toLocaleString(), c: "#60A5FA", i: "" },
          { l: "Engagement", v: (summary.engagement_rate || 0) + "%", c: "#F87171", i: "" },
        ]
      });

      // 2. Engagement rate gauge
      cards.push({
        id: "tg_eng_rate", title: "Engagement Rate", icon: "", type: "gauge",
        value: parseFloat(summary.engagement_rate || 0), max: 100, label: `${summary.engagement_rate || 0}%`, color: "#38BDF8"
      });

      // 3. Kontent turlari pie
      const contentPie = [
        { name: "Matn", value: summary.text_posts || 0 },
        { name: "Rasm", value: summary.photo_posts || 0 },
        { name: "Video", value: summary.video_posts || 0 },
      ].filter(d => d.value > 0);
      if (contentPie.length > 0)
        cards.push({
          id: "tg_content_types", title: "Kontent Turlari", icon: "", type: "chart", chartType: "pie",
          data: contentPie, colors: ["#38BDF8", "#4ADE80", "#F87171"]
        });
    }

    if (posts.length > 0) {
      // 4. Post ko'rishlar trendi (bar chart)
      const viewsData = posts.slice(0, 20).reverse().map((p, i) => ({
        name: p.date || `#${i + 1}`,
        views: p.views || 0,
        forwards: p.forwards || 0,
      }));
      if (viewsData.length > 1)
        cards.push({
          id: "tg_views_trend", title: "Post Ko'rishlar Trendi", icon: "", type: "chart", chartType: "bar",
          data: viewsData, keys: ["views"], xKey: "name", colors: ["#38BDF8"]
        });

      // 5. Ko'rish va Ulashish solishtirma
      if (viewsData.length > 1)
        cards.push({
          id: "tg_views_fwd", title: "Ko'rish vs Ulashish", icon: "", type: "chart", chartType: "line",
          data: viewsData, keys: ["views", "forwards"], xKey: "name", colors: ["#38BDF8", "#E879F9"]
        });

      // 6. Kunlik post soni
      const dayMap = {};
      posts.forEach(p => { if (p.date) { dayMap[p.date] = (dayMap[p.date] || 0) + 1; } });
      const dayData = Object.entries(dayMap).sort().slice(-15).map(([name, count]) => ({ name, count }));
      if (dayData.length > 1)
        cards.push({
          id: "tg_daily", title: "Kunlik Postlar", icon: "", type: "chart", chartType: "area",
          data: dayData, keys: ["count"], xKey: "name", colors: ["#4ADE80"]
        });

      // 7. Soatlik faollik
      const hourMap = {};
      posts.forEach(p => { if (p.time) { const h = p.time.split(":")[0]; hourMap[h] = (hourMap[h] || 0) + 1; } });
      const hourData = Object.entries(hourMap).sort().map(([name, count]) => ({ name: name + "h", count }));
      if (hourData.length > 2)
        cards.push({
          id: "tg_hourly", title: "Post Soatlari", icon: "", type: "chart", chartType: "bar",
          data: hourData, keys: ["count"], xKey: "name", colors: ["#FBBF24"]
        });

      // 8. Media turlari bar
      const mediaMap = {};
      posts.forEach(p => { const t = p.media_type || "text"; mediaMap[t] = (mediaMap[t] || 0) + 1; });
      const mediaData = Object.entries(mediaMap).map(([name, count]) => ({ name, count }));
      if (mediaData.length > 1)
        cards.push({
          id: "tg_media_bar", title: "Media Taqsimoti", icon: "", type: "chart", chartType: "bar",
          data: mediaData, keys: ["count"], xKey: "name", colors: ["#E879F9"]
        });

      // 9. Top postlar (eng ko'p ko'rilgan)
      const topPosts = posts.filter(p => p.views > 0).sort((a, b) => b.views - a.views).slice(0, 5);
      if (topPosts.length > 0)
        cards.push({
          id: "tg_top_posts", title: "Top Postlar (ko'rishlar)", icon: "", type: "highlight",
          items: topPosts.map((p, i) => ({
            l: `#${i + 1}: ${(p.text || "[Media]").substring(0, 40)}...`,
            v: `${(p.views || 0).toLocaleString()} ko'rish`,
            c: ["#38BDF8", "#4ADE80", "#FBBF24", "#E879F9", "#F87171"][i]
          }))
        });

      // 10. Post uzunligi scatter
      if (posts.length > 5) {
        const lenData = posts.slice(0, 50).map((p, i) => ({ x: i + 1, y: (p.text || "").length, z: p.views || 0 })).filter(d => d.y > 0);
        if (lenData.length > 3)
          cards.push({
            id: "tg_len", title: "Matn Uzunligi vs Post #", icon: "", type: "chart", chartType: "scatter",
            data: lenData, xLabel: "Post #", yLabel: "Belgi soni"
          });
      }
    }

    // 11. Adminlar ro'yxati
    if (adminsData?.admins?.length > 0)
      cards.push({
        id: "tg_admins", title: "Kanal Adminlari", icon: "", type: "highlight",
        items: adminsData.admins.filter(a => !a.is_bot).map(a => ({
          l: a.name + (a.username !== "—" ? " (@" + a.username + ")" : ""),
          v: a.status === "creator" ? "Asoschisi" : "Admin",
          c: a.status === "creator" ? "#FBBF24" : "#60A5FA"
        }))
      });
    return cards;
  }

  // ── CRM (LC-UP) manba uchun maxsus dashboardlar ──
  if (type === "crm") {
    const summary = data.find(d => d._type === "CRM_STATISTIKA");
    const raw = source.crmRaw || {};
    const lids = raw.lids || data.filter(d => d._entity === "lid");
    const groups = raw.groups || data.filter(d => d._entity === "group");
    const students = raw.students || data.filter(d => d._entity === "student");
    const teachers = raw.teachers || data.filter(d => d._entity === "teacher");

    if (summary) {
      // 1. CRM Umumiy Statistika
      cards.push({
        id: "crm_stats", title: "CRM Umumiy Statistika", icon: "", size: "full", type: "stats",
        stats: [
          { l: "Lidlar", v: (summary.total_lids || 0).toLocaleString(), c: "#F87171", i: "" },
          { l: "Guruhlar", v: (summary.total_groups || 0).toLocaleString(), c: "#4ADE80", i: "" },
          { l: "O'quvchilar", v: (summary.total_students || 0).toLocaleString(), c: "#60A5FA", i: "" },
          { l: "O'qituvchilar", v: (summary.total_teachers || 0).toLocaleString(), c: "#FBBF24", i: "" },
          { l: "Oylik daromad", v: fmtNum(summary.total_monthly_revenue || 0), c: "#4ADE80", i: "" },
          { l: "Oylik maosh", v: fmtNum(summary.total_monthly_salary || 0), c: "#F87171", i: "" },
        ]
      });

      // 2. O'rtacha ko'rsatkichlar
      cards.push({
        id: "crm_avg", title: "O'rtacha Ko'rsatkichlar", icon: "", type: "stats",
        stats: [
          { l: "Guruh o'lchami", v: summary.avg_group_size || 0, c: "#00C9BE", i: "" },
          { l: "Guruh narxi", v: fmtNum(summary.avg_group_cost || 0), c: "#E8B84B", i: "" },
          { l: "O'chirilgan", v: (summary.trashed_students || 0).toLocaleString(), c: "#94A3B8", i: "" },
        ]
      });

      // 3. Filiallar bo'yicha pie
      if (summary.filials && Object.keys(summary.filials).length > 0) {
        const filialPie = Object.entries(summary.filials).map(([name, value]) => ({ name, value }));
        cards.push({
          id: "crm_filial_pie", title: "Filiallar bo'yicha O'quvchilar", icon: "", type: "chart", chartType: "pie",
          data: filialPie, colors: C
        });
      }

      // 4. Fanlar bo'yicha bar
      if (summary.fans && Object.keys(summary.fans).length > 0) {
        const fanData = Object.entries(summary.fans).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name: name.substring(0, 18), count }));
        cards.push({
          id: "crm_fan_bar", title: "Fanlar bo'yicha O'quvchilar", icon: "", type: "chart", chartType: "bar",
          data: fanData, keys: ["count"], xKey: "name", colors: ["#A78BFA"]
        });
      }
    }

    // 5. Guruhlar — narx taqsimoti
    if (groups.length > 0) {
      const costBuckets = {};
      groups.forEach(g => {
        const bucket = g.cost > 0 ? Math.floor(g.cost / 100000) * 100 + "K" : "Bepul";
        costBuckets[bucket] = (costBuckets[bucket] || 0) + 1;
      });
      const costData = Object.entries(costBuckets).sort((a, b) => {
        const na = parseFloat(a[0]) || 0, nb = parseFloat(b[0]) || 0;
        return na - nb;
      }).map(([name, count]) => ({ name, count }));
      if (costData.length >= 2)
        cards.push({
          id: "crm_cost_dist", title: "Guruh Narxlari Taqsimoti", icon: "", type: "chart", chartType: "bar",
          data: costData, keys: ["count"], xKey: "name", colors: ["#4ADE80"]
        });

      // 6. Guruhlar — o'quvchilar soni bo'yicha top
      const topGroups = [...groups].sort((a, b) => (b.students_count || 0) - (a.students_count || 0)).slice(0, 12);
      cards.push({
        id: "crm_top_groups", title: "Eng Katta Guruhlar", icon: "", type: "chart", chartType: "bar",
        data: topGroups.map(g => ({ name: g.name?.substring(0, 14) || "", students: g.students_count || 0 })),
        keys: ["students"], xKey: "name", colors: ["#60A5FA"]
      });

      // 7. Guruhlar filial bo'yicha
      const grpFilial = {};
      groups.forEach(g => { if (g.filial && g.filial !== "—") grpFilial[g.filial] = (grpFilial[g.filial] || 0) + 1; });
      const grpFilialData = Object.entries(grpFilial).map(([name, count]) => ({ name, count }));
      if (grpFilialData.length >= 2)
        cards.push({
          id: "crm_grp_filial", title: "Filiallar bo'yicha Guruhlar", icon: "", type: "chart", chartType: "pie",
          data: grpFilialData, colors: C
        });
    }

    // 8. O'qituvchilar — maosh taqsimoti
    if (teachers.length > 0) {
      const salaryData = [...teachers].filter(t => t.salary > 0).sort((a, b) => b.salary - a.salary).slice(0, 15)
        .map(t => ({ name: t.name?.substring(0, 14) || "", salary: t.salary || 0 }));
      if (salaryData.length > 0)
        cards.push({
          id: "crm_salary", title: "O'qituvchilar Maoshi", icon: "", type: "chart", chartType: "bar",
          data: salaryData, keys: ["salary"], xKey: "name", colors: ["#FBBF24"]
        });

      // 9. O'qituvchi guruhlar soni
      const teacherLoad = [...teachers].sort((a, b) => (b.groups_count || 0) - (a.groups_count || 0)).slice(0, 15)
        .map(t => ({ name: t.name?.substring(0, 14) || "", groups: t.groups_count || 0 }));
      cards.push({
        id: "crm_teacher_load", title: "O'qituvchi Yuklama (guruhlar)", icon: "", type: "chart", chartType: "bar",
        data: teacherLoad, keys: ["groups"], xKey: "name", colors: ["#FB923C"]
      });
    }

    // 10. Lidlar — kunlik trend
    if (lids.length > 0) {
      const lidDayMap = {};
      lids.forEach(l => { if (l.created_at) lidDayMap[l.created_at] = (lidDayMap[l.created_at] || 0) + 1; });
      const lidDayData = Object.entries(lidDayMap).sort().slice(-30).map(([name, count]) => ({ name: name.slice(5), count }));
      if (lidDayData.length > 1)
        cards.push({
          id: "crm_lid_trend", title: "Kunlik Yangi Lidlar", icon: "", type: "chart", chartType: "area",
          data: lidDayData, keys: ["count"], xKey: "name", colors: ["#F87171"]
        });

      // 11. Lid pipeline (oxirgi bosqich bo'yicha)
      const roadMap = {};
      lids.forEach(l => { const r = l.last_road || "Noma'lum"; roadMap[r] = (roadMap[r] || 0) + 1; });
      const roadData = Object.entries(roadMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name: name.substring(0, 18), value }));
      if (roadData.length >= 2)
        cards.push({
          id: "crm_lid_pipeline", title: "Lid Pipeline (bosqichlar)", icon: "", type: "chart", chartType: "pie",
          data: roadData, colors: C
        });
    }

    // 12. O'quvchilar — jinsi bo'yicha
    if (students.length > 0) {
      const genderMap = {};
      students.forEach(s => { const g = s.gender || "Noma'lum"; genderMap[g] = (genderMap[g] || 0) + 1; });
      const genderData = Object.entries(genderMap).filter(([k]) => k).map(([name, value]) => ({ name: name === "male" ? "Erkak" : name === "female" ? "Ayol" : name, value }));
      if (genderData.length >= 2)
        cards.push({
          id: "crm_gender", title: "O'quvchilar Jinsi", icon: "", type: "chart", chartType: "pie",
          data: genderData, colors: ["#60A5FA", "#E879F9", "#94A3B8"]
        });

      // 13. Top 5 ma'lumotlar highlight
      const multiGroupStudents = students.filter(s => (s.active_groups_count || 0) > 1).length;
      cards.push({
        id: "crm_highlights", title: "Asosiy Ko'rsatkichlar", icon: "", type: "highlight",
        items: [
          { l: "Jami o'quvchilar", v: students.length.toLocaleString(), c: "#60A5FA" },
          { l: "Aktiv guruhlarda", v: students.filter(s => (s.active_groups_count || 0) > 0).length.toLocaleString(), c: "#4ADE80" },
          { l: "Ko'p guruhli", v: multiGroupStudents.toLocaleString(), c: "#A78BFA" },
          { l: "O'g'il bolalar", v: (genderMap["male"] || 0).toLocaleString(), c: "#60A5FA" },
          { l: "Qiz bolalar", v: (genderMap["female"] || 0).toLocaleString(), c: "#E879F9" },
        ]
      });
    }

    // 14. Daromad vs Maosh gauge
    if (summary) {
      const revenue = summary.total_monthly_revenue || 0;
      const salary = summary.total_monthly_salary || 0;
      const profit = revenue - salary;
      const profitPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
      cards.push({
        id: "crm_profit_gauge", title: "Foyda Foizi", icon: "", type: "gauge",
        value: profitPct, max: 100, label: `${profitPct}% foyda`, color: profitPct > 30 ? "#4ADE80" : profitPct > 10 ? "#FBBF24" : "#F87171"
      });
    }

    return cards;
  }

  // ── GENERIC DATA (Excel, CSV, API, Sheets, Manual) ──
  // DashboardPage dan chaqirilganda — aqlli auto-detect
  // Sana-like va ID-like ustunlarni raqamdan chiqarish
  const genData = data.filter(d => !d._type && !d.webhook_url);
  if (!genData.length) return cards;

  const allKeys = Object.keys(genData[0] || {});

  // Sana/vaqt/ID kabi ustunlarni raqamdan chiqarish
  const skipPatterns = /sana|date|time|vaqt|kun|oy|yil|month|year|day|created|updated|_at$|_id$|^id$|^_|password|token|hash|email|phone|url|webhook|source|domain|mobile/i;
  const autoNumKeys = allKeys.filter(k => {
    if (skipPatterns.test(k)) return false; // Texnik/sana ustunlari raqam emas
    const vals = genData.map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")));
    const valid = vals.filter(v => !isNaN(v) && v !== 0);
    if (valid.length <= genData.length * 0.3) return false;
    // Agar barcha qiymatlar unikal va ketma-ket (ID bo'lishi mumkin) — skip
    const uniq = new Set(valid);
    if (uniq.size > genData.length * 0.9 && valid.length > 10) {
      const sorted = [...valid].sort((a, b) => a - b);
      const diffs = sorted.slice(1).map((v, i) => v - sorted[i]);
      const allSeq = diffs.every(d => d === 1);
      if (allSeq) return false; // Ketma-ket raqamlar = ID
    }
    return true;
  });
  const autoCatKeys = allKeys.filter(k => !autoNumKeys.includes(k));

  // colSelection parametri orqali foydalanuvchi tanlagan ustunlar
  const numKeys = colSelection?.numKeys?.length ? colSelection.numKeys : autoNumKeys;
  const labelKey = colSelection?.labelKey || autoCatKeys[0] || "index";
  const catKeys = allKeys.filter(k => !numKeys.includes(k));

  if (!numKeys.length) return cards; // Raqamli ustun yo'q

  // 1. Umumiy statistika
  const cleanLabel = (k) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const statItems = numKeys.slice(0, 6).map((k, i) => {
    const vals = genData.map(r => Math.max(0, parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")) || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length > 0 ? Math.round(sum / vals.length) : 0;
    // Agar summa juda katta (ID larga o'xshaydi) — o'rtachani ko'rsat
    const display = sum > 100000 && avg < 1000 ? avg : Math.round(sum);
    return { l: cleanLabel(k), v: fmtNum(Math.max(0, display)), c: C[i % C.length], i: "" };
  });
  if (statItems.length > 0)
    cards.push({ id: "gen_stats", title: "Umumiy Statistika", icon: "", size: "full", type: "stats", stats: statItems });

  // 2. Top qiymatlar (bar chart) — eng asosiy raqamli ustun bo'yicha
  if (numKeys[0]) {
    const barData = [...genData].sort((a, b) => (parseFloat(String(b[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0) - (parseFloat(String(a[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0))
      .slice(0, 15).map(r => ({ name: String(r[labelKey] || "").substring(0, 14).replace(/_/g, " "), [numKeys[0]]: Math.max(0, parseFloat(String(r[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0) }));
    cards.push({
      id: "gen_bar_top", title: `Top ${numKeys[0]}`, icon: "▨", type: "chart", chartType: "bar",
      data: barData, keys: [numKeys[0]], xKey: "name", colors: [C[0]]
    });
  }

  // 3. Trend line — birinchi raqamli ustun
  if (numKeys[0]) {
    const lineData = genData.slice(0, 30).map((r, j) => ({
      name: labelKey === "index" ? String(j + 1) : String(r[labelKey] || j + 1).substring(0, 12),
      [numKeys[0]]: parseFloat(String(r[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0
    }));
    cards.push({
      id: "gen_line_0", title: `${numKeys[0]} Trendi`, icon: "", type: "chart", chartType: "line",
      data: lineData, keys: [numKeys[0]], xKey: "name", colors: [C[0]]
    });
  }

  // 4. Kategoriya taqsimoti (pie) — faqat yaxshi taqsimot bo'lganda
  catKeys.slice(0, 2).forEach((k, i) => {
    if (k === labelKey) return;
    const counts = {};
    genData.forEach(r => { const v = String(r[k] || "Boshqa").substring(0, 20); counts[v] = (counts[v] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = genData.length;
    // Bitta kategoriya 80%+ bo'lsa — pie ko'rsatmaslik
    if (sorted[0] && sorted[0][1] / total > 0.8) return;
    const pieData = sorted.slice(0, 10).map(([name, value]) => ({ name, value }));
    if (pieData.length >= 2 && pieData.length <= 12)
      cards.push({
        id: `gen_pie_${i}`, title: `${k} Taqsimoti`, icon: "", type: "chart", chartType: "pie",
        data: pieData, colors: C
      });
  });

  // 5. Agar 2+ raqamli ustun — solishtirma area chart
  if (numKeys.length >= 2) {
    const areaData = genData.slice(0, 25).map((r, j) => {
      const row = { name: labelKey === "index" ? String(j + 1) : String(r[labelKey] || j + 1).substring(0, 12) };
      numKeys.slice(0, 4).forEach(k => { row[k] = parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")) || 0; });
      return row;
    });
    cards.push({
      id: "gen_area_all", title: "Solishtirma Trend", icon: "", type: "chart", chartType: "area",
      data: areaData, keys: numKeys.slice(0, 4), xKey: "name", colors: C
    });
  }

  // 6. Min/Max/Avg highlight
  if (numKeys[0]) {
    const vals = genData.map(r => parseFloat(String(r[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    cards.push({
      id: "gen_minmax", title: `${numKeys[0]} — Xulosa`, icon: "", type: "highlight",
      items: [
        { l: "Minimum", v: fmtNum(Math.min(...vals)), c: "#F87171" },
        { l: "Maximum", v: fmtNum(Math.max(...vals)), c: "#4ADE80" },
        { l: "O'rtacha", v: fmtNum(Math.round(sum / vals.length)), c: "#00C9BE" },
        { l: "Jami", v: fmtNum(Math.round(sum)), c: "#FBBF24" },
        { l: "Qatorlar", v: vals.length.toLocaleString(), c: "#A78BFA" },
      ]
    });
  }

  return cards;
}

// ── Dashboard karta rendereri (har bir chart turini chizadi) ──
const CHART_TYPE_OPTIONS = [
  { id: "line", l: "〜 Chiziq" }, { id: "bar", l: "▨ Ustun" }, { id: "hbar", l: "▬ Yatay" }, { id: "area", l: " Maydon" },
  { id: "pie", l: " Doira" }, { id: "scatter", l: "⋯ Tarqoq" }, { id: "stackedbar", l: "▦ Stacked" },
];

// X-axis uchun qisqa label render — matnni 12 belgigacha cheklash, burchak bilan
// ─────────────────────────────────────────────────────────────
// AI PROGRESS BAR — bosqichli, animatsiyali
// ─────────────────────────────────────────────────────────────
function AiProgressBar({ loading }) {
  // Label'ni aylanib ko'rsatish (label faqat vizual — progress bar o'zi cheksiz)
  const labels = [
    { label: "AI tayyorlanmoqda", icon: "⚙" },
    { label: "So'rov yuborilmoqda", icon: "↑" },
    { label: "AI tahlil qilmoqda", icon: "◈" },
    { label: "Javob tayyorlanmoqda", icon: "▨" },
  ];
  const [labelIdx, setLabelIdx] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) {
      setLabelIdx(0);
      setStartedAt(null);
      setElapsed(0);
      return;
    }
    setStartedAt(Date.now());
    const labelTimer = setInterval(() => {
      setLabelIdx(i => (i + 1) % labels.length);
    }, 2000);
    const elapsedTimer = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => {
      clearInterval(labelTimer);
      clearInterval(elapsedTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (!loading) return null;
  const cur = labels[labelIdx] || labels[0];
  const secStr = elapsed > 0 ? `${elapsed}s` : "";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", marginBottom: 12,
      background: "rgba(0,201,190,0.06)",
      border: "1px solid rgba(0,201,190,0.18)",
      borderRadius: 10,
    }}>
      {/* Spinner */}
      <div style={{
        width: 18, height: 18, flexShrink: 0,
        border: "2px solid rgba(0,201,190,0.2)",
        borderTop: "2px solid #00C9BE",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />

      {/* Label + indeterminate bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--teal)", letterSpacing: 0.3, animation: "aiPulse 1.8s ease infinite" }}>
            {cur.icon} {cur.label}
            <span style={{ display: "inline-block", marginLeft: 2, animation: "aiPulse 0.9s ease infinite" }}>...</span>
          </span>
          {secStr && (
            <span style={{ fontSize: 10, fontFamily: "var(--fm)", color: "var(--muted)", flexShrink: 0, marginLeft: 8 }}>
              {secStr}
            </span>
          )}
        </div>
        {/* Indeterminate progress — cheksiz siljiydi */}
        <div style={{ height: 3, background: "var(--s3)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, height: "100%", borderRadius: 4,
            background: "linear-gradient(90deg,#00C9BE,#4ADE80)",
            animation: "aiSweep 1.8s cubic-bezier(0.4,0,0.2,1) infinite",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// THEME TOGGLE (Light / Dark)
// ─────────────────────────────────────────────────────────────
const THEMES = [
  { id: "obsidian",  name: "Obsidian",  desc: "Premium qorong'u oltin",  icon: "◆", group: "dark"  },
  { id: "midnight",  name: "Midnight",  desc: "Texnologik cyan",          icon: "◇", group: "dark"  },
  { id: "sandstone", name: "Sandstone", desc: "Iliq editorial krem",     icon: "✦", group: "light" },
  { id: "porcelain", name: "Porcelain", desc: "Sovuq minimalist navy",    icon: "✧", group: "light" },
];

function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem("bai_theme");
    const valid = THEMES.some(t => t.id === saved);
    if (!valid && saved) {
      // Eski theme migration: aurora/rose/mint/olive → yangi theme
      const migration = { aurora: "midnight", rose: "sandstone", mint: "sandstone", olive: "sandstone" };
      const next = migration[saved] || "obsidian";
      localStorage.setItem("bai_theme", next);
      return next;
    }
    return saved || "obsidian";
  });
  const setTheme = useCallback((t) => {
    setThemeState(t);
    localStorage.setItem("bai_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, []);
  const nextTheme = () => {
    const idx = THEMES.findIndex(t => t.id === theme);
    setTheme(THEMES[(idx + 1) % THEMES.length].id);
  };
  return { theme, setTheme, toggle: nextTheme };
}

const THEME_PREVIEWS = {
  obsidian:  { grad: "linear-gradient(135deg,#d4a952,#2fbf71)", accent: "#d4a952" },
  midnight:  { grad: "linear-gradient(135deg,#38BDF8,#34D399)", accent: "#38BDF8" },
  sandstone: { grad: "linear-gradient(135deg,#c4a55a,#16a764)", accent: "#c4a55a" },
  porcelain: { grad: "linear-gradient(135deg,#1e3a5f,#6b9080)", accent: "#1e3a5f" },
};

function ThemeToggle({ theme, toggle, setTheme, size = "md" }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const sz = size === "sm" ? 32 : 38;
  const prev = THEME_PREVIEWS[theme] || THEME_PREVIEWS.obsidian;

  // Dropdown pozitsiyasini hisoblash (fixed)
  const getPos = () => {
    if (!btnRef.current) return { top: 50, right: 16 };
    const r = btnRef.current.getBoundingClientRect();
    return { top: r.bottom + 8, right: window.innerWidth - r.right };
  };

  return (
    <div>
      <div ref={btnRef} className="tb-item" onClick={() => setOpen(!open)} title="Mavzu tanlash" style={{ padding: "0 10px" }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: prev.grad, boxShadow: `0 0 8px ${prev.accent}40` }} />
      </div>
      {open && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99998 }} onClick={() => setOpen(false)} />
          <div style={{ position: "fixed", top: getPos().top, right: getPos().right, zIndex: 99999, background: "var(--s1)", border: "1px solid var(--border-hi)", borderRadius: 16, padding: 10, width: 240, boxShadow: "var(--shadow-lg)", animation: "fadeIn .15s ease" }}>
            {["dark", "light"].map(group => (
              <div key={group} style={{ marginBottom: group === "dark" ? 8 : 0 }}>
                <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", padding: "6px 10px 4px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{group === "dark" ? "🌙" : "☀️"}</span>
                  <span>{group === "dark" ? "Qorong'u" : "Yorug'"}</span>
                </div>
                {THEMES.filter(t => t.group === group).map(t => {
                  const tp = THEME_PREVIEWS[t.id];
                  const active = theme === t.id;
                  return (
                    <button key={t.id} onClick={() => { setTheme(t.id); setOpen(false); }}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 10, border: active ? `1px solid ${tp.accent}60` : "1px solid transparent",
                        background: active ? `${tp.accent}12` : "transparent",
                        cursor: "pointer", marginBottom: 3, display: "flex", alignItems: "center", gap: 11, transition: "all .18s var(--ease)",
                      }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--s2)"; e.currentTarget.style.borderColor = `${tp.accent}22`; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: tp.grad, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 800, boxShadow: active ? `0 0 14px ${tp.accent}40` : "var(--shadow-sm)" }}>
                        {t.icon}
                      </div>
                      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--fh)", fontSize: 12.5, fontWeight: 700, color: active ? tp.accent : "var(--text)", letterSpacing: -0.1 }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc}</div>
                      </div>
                      {active && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tp.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMMAND PALETTE — global ⌘K search
// ─────────────────────────────────────────────────────────────
function CommandPalette({ open, onClose, onNavigate, onNewChat, onNewSource, sources = [], departments = [], setActiveDepartmentId }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = [
    { group: "Tezkor buyruqlar", items: [
      { id: "new-chat",   title: "Yangi AI suhbat boshlash", desc: "Darhol AI bilan gaplashish", icon: "💬", kbd: "⌘N", run: () => { onNewChat?.(); onClose(); } },
      { id: "new-source", title: "Yangi manba ulash",         desc: "Excel, Sheets, Instagram",   icon: "📁", kbd: "⌘U", run: () => { onNewSource?.(); onClose(); } },
    ]},
    { group: "Sahifalar", items: [
      { id: "dashboard", title: "Bosh sahifa",   desc: "Umumiy holat",      icon: "🏠", kbd: "G D", run: () => { onNavigate("dashboard"); onClose(); } },
      { id: "datahub",   title: "Manbalar",      desc: "Ma'lumot manbalari", icon: "📁", kbd: "G M", run: () => { onNavigate("datahub"); onClose(); } },
      { id: "chat",      title: "AI Maslahatchi", desc: "Suhbat",            icon: "💬", kbd: "G C", run: () => { onNavigate("chat"); onClose(); } },
      { id: "analytics", title: "Tahlil",        desc: "AI modullar",       icon: "📊", kbd: "G A", run: () => { onNavigate("analytics"); onClose(); } },
      { id: "charts",    title: "Grafiklar",     desc: "Vizualizatsiya",    icon: "📈", kbd: "G G", run: () => { onNavigate("charts"); onClose(); } },
      { id: "reports",   title: "Hisobotlar",    desc: "Avtomatik",         icon: "📋", kbd: "G R", run: () => { onNavigate("reports"); onClose(); } },
      { id: "alerts",    title: "Ogohlantirishlar", desc: "AI xabarlar",    icon: "🔔", kbd: "G O", run: () => { onNavigate("alerts"); onClose(); } },
      { id: "settings",  title: "Sozlamalar",    desc: "AI + tizim",         icon: "⚙️", kbd: "G S", run: () => { onNavigate("settings"); onClose(); } },
    ]},
    ...(departments.length > 0 ? [{ group: "Bo'limga o'tish", items: [
      { id: "dept-all", title: "Umumiy (barchasi)", desc: "Hamma bo'limlar", icon: "🏢", run: () => { setActiveDepartmentId?.(null); onClose(); } },
      ...departments.filter(d => d.name !== "Umumiy").map(d => ({
        id: "dept-" + d.id,
        title: d.name,
        desc: "Bo'limga filterlash",
        icon: d.icon || "📁",
        run: () => { setActiveDepartmentId?.(d.id); onClose(); },
      })),
    ]}] : []),
    ...(sources.length > 0 ? [{ group: "Manbalar", items: sources.slice(0, 8).map(s => ({
      id: "src-" + s.id,
      title: s.name || "Manba",
      desc: `${s.data?.length || 0} qator · ${s.type || "data"}`,
      icon: "📊",
      run: () => { onNavigate("datahub"); onClose(); },
    }))}] : []),
  ];

  // Filter bo'yicha
  const q = query.trim().toLowerCase();
  const filtered = commands.map(g => ({
    ...g,
    items: q ? g.items.filter(it => it.title.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) : g.items,
  })).filter(g => g.items.length > 0);

  const flatItems = filtered.flatMap(g => g.items);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter")     { e.preventDefault(); flatItems[activeIdx]?.run(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIdx, flatItems.length, onClose]);

  if (!open) return null;

  let idx = -1;
  return createPortal(
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 10000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh", animation: "fadeIn .15s ease" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "min(640px, 90vw)", background: "var(--s1)", border: "1px solid var(--border-hi)", borderRadius: 14, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder="Sahifa, manba, buyruq yoki so'rov..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, fontFamily: "var(--fh)", color: "var(--text)" }} />
          <span style={{ fontFamily: "var(--fm)", fontSize: 10, padding: "3px 7px", background: "var(--s2)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--muted)" }}>ESC</span>
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Natija topilmadi</div>
          )}
          {filtered.map(g => (
            <div key={g.group}>
              <div style={{ fontFamily: "var(--fm)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", padding: "8px 18px 4px" }}>{g.group}</div>
              {g.items.map(it => {
                idx++;
                const isActive = idx === activeIdx;
                return (
                  <div key={it.id} onClick={() => it.run()} onMouseEnter={() => setActiveIdx(idx)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 18px", cursor: "pointer", background: isActive ? "var(--gold-glow)" : "transparent", transition: "background .1s" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--s2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{it.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{it.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--fm)", marginTop: 1 }}>{it.desc}</div>
                    </div>
                    {it.kbd && <span style={{ fontFamily: "var(--fm)", fontSize: 10, padding: "2px 6px", background: "var(--s2)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text2)", flexShrink: 0 }}>{it.kbd}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "9px 18px", borderTop: "1px solid var(--border)", background: "var(--s2)", fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--fm)" }}>
          <span><b style={{ color: "var(--text2)" }}>↑↓</b> harakat</span>
          <span><b style={{ color: "var(--text2)" }}>↵</b> tanlash</span>
          <span><b style={{ color: "var(--text2)" }}>esc</b> yopish</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────
// LIVE CLOCK — real-time soat + sana
// ─────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const days = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
  const day = days[now.getDay()];
  const date = now.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div className="tb-item hide-mobile" style={{ cursor: "default", gap: 8, display: "flex", alignItems: "center" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
      <span style={{ fontFamily: "var(--fm)", fontSize: 10, letterSpacing: 0.3, lineHeight: 1, display: "flex", alignItems: "center" }}>
        <span style={{ color: "var(--muted)" }}>{day}</span>&nbsp;{date}&nbsp;<span style={{ color: "var(--teal)", fontWeight: 600 }}>{time}</span>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MARKDOWN RENDERER (oddiy, chat uchun)
// ─────────────────────────────────────────────────────────────
function RenderMD({ text }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const elements = [];
  let tableRows = [];
  let inTable = false;

  const fmt = (s) => {
    let r = s.replace(/\*\*(.+?)\*\*/g, '<b style="color:var(--text);font-weight:700">$1</b>');
    r = r.replace(/\*(.+?)\*/g, '<i style="color:var(--text2)">$1</i>');
    r = r.replace(/`(.+?)`/g, '<code style="background:var(--s3);padding:2px 7px;border-radius:5px;font-family:var(--fm);font-size:11px;color:var(--teal);border:1px solid var(--border)">$1</code>');
    // Raqamlarni rangla: +23%, -15%, 1,234, $500
    r = r.replace(/([\+\-]?\d[\d,.]*\s*%)/g, (m) => {
      const isNeg = m.startsWith("-");
      return `<span style="color:${isNeg ? "var(--red)" : "var(--green)"};font-weight:700;font-family:var(--fm);font-size:12px">${m}</span>`;
    });
    return sanitize(r);
  };

  const renderTable = (rows, key) => {
    if (rows.length === 0) return null;
    const hdr = rows[0]; const body = rows.slice(1);
    return (
      <div key={key} style={{ overflowX: "auto", margin: "12px 0", borderRadius: 10, border: "1px solid var(--border)", background: "var(--s1)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "linear-gradient(135deg, rgba(0,212,200,0.06), rgba(212,168,83,0.04))" }}>{hdr.map((h, j) => <th key={j} style={{ padding: "10px 14px", textAlign: "left", borderBottom: "2px solid var(--teal)30", color: "var(--teal)", fontFamily: "var(--fh)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>{h}</th>)}</tr></thead>
          <tbody>{body.map((row, ri) => <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,212,200,0.03)"}
            onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"}
          >{row.map((c, ci) => <td key={ci} style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 12, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: fmt(c) }} />)}</tr>)}</tbody>
        </table>
      </div>
    );
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (trimmed.replace(/[|\-\s:]/g, "").length === 0) { inTable = true; return; }
      tableRows.push(trimmed.split("|").filter(c => c.trim()).map(c => c.trim()));
      inTable = true;
      return;
    }
    if (inTable && tableRows.length > 0) {
      elements.push(renderTable(tableRows, `t${i}`));
      tableRows = []; inTable = false;
    }
    // Divider
    if (trimmed === "---" || trimmed === "***") { elements.push(<div key={i} style={{ height: 1, background: "linear-gradient(90deg,transparent 5%,var(--teal)30 50%,transparent 95%)", margin: "16px 0" }} />); return; }
    // H1 — katta sarlavha, gradient pastki chiziq
    if (trimmed.startsWith("# ")) { elements.push(<div key={i} style={{ fontFamily: "var(--fh)", fontSize: 17, fontWeight: 800, marginTop: 20, marginBottom: 10, color: "var(--gold)", paddingBottom: 8, borderBottom: "2px solid", borderImage: "linear-gradient(90deg,var(--gold)80,var(--teal)40,transparent) 1" }}>{trimmed.slice(2)}</div>); return; }
    // H2 — teal rangda, chap chiziq
    if (trimmed.startsWith("## ")) { elements.push(<div key={i} style={{ fontFamily: "var(--fh)", fontSize: 15, fontWeight: 800, marginTop: 18, marginBottom: 6, color: "var(--teal)", display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 4, height: 18, borderRadius: 2, background: "linear-gradient(180deg,var(--teal),var(--teal)40)", flexShrink: 0 }} /><span>{trimmed.slice(3)}</span></div>); return; }
    // H3 — purple rangda
    if (trimmed.startsWith("### ")) { elements.push(<div key={i} style={{ fontFamily: "var(--fh)", fontSize: 13.5, fontWeight: 700, marginTop: 14, marginBottom: 4, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--purple)" }} /><span>{trimmed.slice(4)}</span></div>); return; }
    // Blockquote — chiroyli fon bilan
    if (trimmed.startsWith("> ")) { elements.push(<div key={i} style={{ borderLeft: "3px solid var(--teal)", margin: "10px 0", padding: "10px 16px", color: "var(--text)", fontSize: 13, background: "linear-gradient(135deg,rgba(0,212,200,0.05),rgba(0,212,200,0.02))", borderRadius: "0 10px 10px 0", lineHeight: 1.7, border: "1px solid rgba(0,212,200,0.08)", borderLeftWidth: 3 }} dangerouslySetInnerHTML={{ __html: fmt(trimmed.slice(2)) }} />); return; }
    // Bullet — teal nuqta
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      elements.push(<div key={i} style={{ paddingLeft: 18, position: "relative", margin: "4px 0", fontSize: 13, lineHeight: 1.7 }}><span style={{ position: "absolute", left: 3, color: "var(--teal)", fontSize: 7, top: 8 }}>●</span><span dangerouslySetInnerHTML={{ __html: fmt(trimmed.slice(2)) }} /></div>);
      return;
    }
    // Numbered list — raqam badge
    const numMatch = trimmed.match(/^(\d+)\.\s(.+)/);
    if (numMatch) { elements.push(<div key={i} style={{ paddingLeft: 26, position: "relative", margin: "4px 0", fontSize: 13, lineHeight: 1.7 }}><span style={{ position: "absolute", left: 0, top: 2, color: "var(--gold)", fontWeight: 800, fontFamily: "var(--fm)", fontSize: 10, background: "rgba(212,168,83,0.12)", width: 20, height: 20, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(212,168,83,0.15)" }}>{numMatch[1]}</span><span dangerouslySetInnerHTML={{ __html: fmt(numMatch[2]) }} /></div>); return; }
    // Empty line
    if (!trimmed) { elements.push(<div key={i} style={{ height: 8 }} />); return; }
    // Normal text
    elements.push(<div key={i} style={{ margin: "3px 0", fontSize: 13, lineHeight: 1.7, color: "var(--text)" }} dangerouslySetInnerHTML={{ __html: fmt(trimmed) }} />);
  });
  // Flush remaining table
  if (tableRows.length > 0) elements.push(renderTable(tableRows, "tlast"));
  return <div style={{ fontSize: 13, lineHeight: 1.7 }}>{elements}</div>;
}

const AngledXTick = ({ x, y, payload }) => (
  <g transform={`translate(${x},${y})`}>
    <text x={0} y={0} dy={10} textAnchor="end" fill="var(--chart-label)" fontSize={8} fontFamily="Space Grotesk,sans-serif" transform="rotate(-40)">
      {String(payload.value || "").substring(0, 10)}
    </text>
  </g>
);

// ─────────────────────────────────────────────────────────────
// CARD GRID — Drag & Drop + Resize (har bir foydalanuvchi uchun)
// ─────────────────────────────────────────────────────────────
const CARD_SIZES = { "1x1": { col: 1, row: 1 }, "2x1": { col: 2, row: 1 }, "1x2": { col: 1, row: 2 }, "2x2": { col: 2, row: 2 } };

function CardGrid({ cards, chartOverrides, setChartOverride, layoutKey, onRemoveCard, onDeleteCard }) {
  // Layout: { [cardId]: { order, size } }
  const [layout, setLayout] = useState(() => LS.get(layoutKey, {}));
  const [dragId, setDragId] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Layout saqlash
  const saveLayout = (newLayout) => { setLayout(newLayout); if (layoutKey) LS.set(layoutKey, newLayout); };

  // Yashirilgan kartalar
  const [hiddenCards, setHiddenCards] = useState(() => {
    try { return LS.get(layoutKey + "_hidden", []); } catch { return []; }
  });
  const hideCard = (cardId) => {
    const updated = [...hiddenCards, cardId];
    setHiddenCards(updated);
    if (layoutKey) LS.set(layoutKey + "_hidden", updated);
  };
  const showAllCards = () => {
    setHiddenCards([]);
    if (layoutKey) LS.del(layoutKey + "_hidden");
  };

  // Kartalarni tartib bo'yicha saralash + yashirilganlarni filter
  const sorted = useMemo(() => {
    return [...cards]
      .filter(c => !hiddenCards.includes(c.id))
      .sort((a, b) => {
        // Layout da order bo'lmasa — array dagi tartib saqlanadi (yangilar tepada)
        const oa = layout[a.id]?.order;
        const ob = layout[b.id]?.order;
        if (oa == null && ob == null) return 0; // Ikkalasi ham layout da yo'q — original tartib
        if (oa == null) return -1; // a layout da yo'q (yangi) — tepaga
        if (ob == null) return 1;  // b layout da yo'q (yangi) — tepaga
        return oa - ob;
      });
  }, [cards, layout, hiddenCards]);

  // Drag handlers
  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = sorted.map(c => c.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return; }
    // Joylarni almashtirish
    const newOrder = [...ids];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    const newLayout = { ...layout };
    newOrder.forEach((id, i) => { newLayout[id] = { ...(newLayout[id] || {}), order: i }; });
    saveLayout(newLayout);
    setDragId(null);
  };

  // Resize
  const cycleSize = (id) => {
    const sizes = ["1x1", "2x1", "1x2", "2x2"];
    const cur = layout[id]?.size || "1x1";
    const next = sizes[(sizes.indexOf(cur) + 1) % sizes.length];
    saveLayout({ ...layout, [id]: { ...(layout[id] || {}), size: next, order: layout[id]?.order ?? 999 } });
  };

  // Reset layout
  const resetLayout = () => { saveLayout({}); setEditMode(false); };

  if (!cards.length) return null;

  return (
    <div>
      {/* Edit mode toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {hiddenCards.length > 0 && (
          <button className="btn btn-ghost btn-xs" onClick={showAllCards}
            style={{ borderColor: "rgba(251,191,36,0.3)", color: "var(--gold)" }}>
            {hiddenCards.length} ta yashirilgan — barchasini ko'rsatish
          </button>
        )}
        <button className="btn btn-ghost btn-xs" onClick={() => setEditMode(!editMode)}
          style={editMode ? { borderColor: "rgba(0,201,190,0.4)", color: "var(--teal)", background: "rgba(0,201,190,0.08)" } : {}}>
          {editMode ? "✓ Tayyor" : "⚙ Tartibni o'zgartirish"}
        </button>
        {editMode && (
          <button className="btn btn-ghost btn-xs" onClick={() => { resetLayout(); showAllCards(); }}
            style={{ borderColor: "rgba(248,113,113,0.3)", color: "var(--red)" }}>
            Asl holatga qaytarish
          </button>
        )}
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
        gap: 16,
        ...(editMode ? { background: "rgba(0,201,190,0.02)", borderRadius: 16, padding: 8, border: "1px dashed rgba(0,201,190,0.15)" } : {}),
      }}>
        {sorted.map(card => {
          const sz = CARD_SIZES[layout[card.id]?.size || "1x1"];
          return (
            <div key={card.id}
              draggable={editMode}
              onDragStart={e => onDragStart(e, card.id)}
              onDragOver={onDragOver}
              onDrop={e => onDrop(e, card.id)}
              style={{
                gridColumn: `span ${sz.col}`,
                gridRow: `span ${sz.row}`,
                position: "relative",
                transition: "all .2s",
                opacity: dragId === card.id ? 0.4 : 1,
                cursor: editMode ? "grab" : "default",
                ...(editMode ? { outline: "2px dashed rgba(0,201,190,0.2)", outlineOffset: 2, borderRadius: 16 } : {}),
              }}>
              {/* Resize tugma — faqat edit modeda */}
              {editMode && (
                <div style={{ position: "absolute", top: 6, right: 6, zIndex: 10, display: "flex", gap: 4 }}>
                  <button onClick={() => cycleSize(card.id)}
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(0,201,190,0.3)",
                      background: "rgba(0,201,190,0.1)", color: "var(--teal)", fontSize: 9,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--fh)", fontWeight: 700,
                    }}
                    title={`Hajm: ${layout[card.id]?.size || "1x1"} → bosib o'zgartiring`}>
                    {layout[card.id]?.size || "1x1"}
                  </button>
                </div>
              )}
              <DashCard card={card} chartOverrides={chartOverrides} setChartOverride={setChartOverride} onRemove={hideCard} onDelete={onDeleteCard || onRemoveCard} />
              {/* YANGI indikator — 3 daqiqa ichida yaratilgan kartalar, pastki chap burchak */}
              {card.id && String(card.id).startsWith("ai_") && (Date.now() - parseInt(String(card.id).split("_")[1] || 0)) < 180000 && (
                <div style={{ position: "absolute", bottom: 8, right: 8, zIndex: 5, width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 8px rgba(74,222,128,0.6)", animation: "pulse-voice 2s ease infinite" }} title="Yangi qo'shilgan" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashCard({ card, chartOverrides, setChartOverride, onRemove, onDelete }) {
  const cType = chartOverrides[card.id] || card.chartType;
  const CARD_H = 440;
  const [tableView, setTableView] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const cardRef = useRef(null);

  // PNG yuklab olish — SVG → Canvas → PNG
  const downloadPng = () => {
    const svg = cardRef.current?.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const w = svg.clientWidth || 600, h = svg.clientHeight || 400;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2; canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const a = document.createElement("a");
      a.download = (card.title || "chart").replace(/[^a-zA-Z0-9]/g, "_") + ".png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  };

  // Yaxshilangan Tooltip
  const CustomTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (<div style={{ background: "var(--chart-tip-bg)", border: "1px solid var(--chart-tip-border)", borderRadius: 10, padding: "10px 14px", fontSize: 11, fontFamily: "var(--fm)", backdropFilter: "blur(8px)", boxShadow: "var(--shadow-md)", maxWidth: 240 }}>
      <div style={{ color: "var(--muted)", marginBottom: 5, fontSize: 10, fontWeight: 600, borderBottom: "1px solid var(--border)", paddingBottom: 5 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
        <span style={{ color: "#94A3B8", fontSize: 10 }}>{p.name}:</span>
        <b style={{ color: p.color, fontSize: 11, marginLeft: "auto" }}>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</b>
      </div>)}
    </div>);
  };

  const yFmt = (v) => fmtNum(v);

  // Yagona card wrapper — BARCHA turlar uchun bir xil
  const CardWrap = ({ children, full }) => (
    <div className="card" style={{ marginBottom: 0, overflow: "hidden", height: full ? "auto" : CARD_H, minHeight: full ? "auto" : CARD_H, display: "flex", flexDirection: "column", padding: "18px 20px", gridColumn: full ? "1/-1" : undefined }}>
      {children}
    </div>
  );

  const renderChart = () => {
    const d = card.data || [];
    const keys = card.keys || [];
    const xKey = card.xKey || "name";
    const colors = card.colors || CHART_COLORS;
    const h = CARD_H - 80;
    const margin = { top: 5, right: 12, left: 0, bottom: 55 };
    const gridStroke = "var(--chart-grid)";
    // Data ko'p bo'lsa X labellarni kamroq ko'rsatish
    const xInterval = d.length > 15 ? Math.ceil(d.length / 8) : d.length > 8 ? Math.ceil(d.length / 6) : 0;

    // Pie
    if (cType === "pie") {
      const total = d.reduce((a, item) => a + (item.value || 0), 0);
      let mainSlices = [];
      let otherVal = 0;
      d.forEach(item => {
        if (total > 0 && (item.value / total) < 0.02) otherVal += item.value;
        else mainSlices.push(item);
      });
      if (otherVal > 0) mainSlices.push({ name: "Boshqa", value: otherVal });
      const dominant = mainSlices.find(s => total > 0 && (s.value / total) > 0.9);
      const sliceCount = mainSlices.length;
      // Ko'p slice bo'lsa (>5) label ko'rsatmaslik — faqat legend
      const showLabels = sliceCount <= 5;
      const outerR = Math.min(h / 3.2, 80);
      const innerR = dominant ? 0 : Math.min(h / 6.5, 28);

      const renderLabel = ({ name, percent, cx, cy, midAngle, outerRadius, x, y }) => {
        if (!showLabels || percent < 0.06) return null;
        // labelni doira markazidan uzoqroq joylashtirish
        const RADIAN = Math.PI / 180;
        const radius = outerRadius + 18;
        const lx = cx + radius * Math.cos(-midAngle * RADIAN);
        const ly = cy + radius * Math.sin(-midAngle * RADIAN);
        const anchor = lx > cx ? "start" : "end";
        const shortName = name.length > 10 ? name.substring(0, 9) + "…" : name;
        return (
          <text x={lx} y={ly} fill="#CBD5E1" textAnchor={anchor} dominantBaseline="central"
            fontSize={9} fontFamily="Space Grotesk,sans-serif" fontWeight={600}>
            {shortName} {(percent * 100).toFixed(0)}%
          </text>
        );
      };

      // Legend ni qisqartirish — uzun nomlar
      const renderLegend = (props) => {
        const { payload } = props;
        return (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 10px", paddingTop: 6, paddingBottom: 2 }}>
            {payload.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--fm)", color: "var(--muted)", maxWidth: 120 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.value}>
                  {entry.value.length > 14 ? entry.value.substring(0, 13) + "…" : entry.value}
                </span>
              </div>
            ))}
          </div>
        );
      };

      return <ResponsiveContainer width="100%" height={h}>
        <PieChart margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
          <Pie
            data={mainSlices} cx="50%" cy="44%"
            outerRadius={outerR} innerRadius={innerR}
            dataKey="value"
            label={showLabels ? renderLabel : false}
            labelLine={showLabels ? { stroke: "rgba(148,163,184,0.25)", strokeWidth: 1 } : false}
            paddingAngle={mainSlices.length > 1 ? 2 : 0}
          >
            {mainSlices.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />)}
          </Pie>
          <Tooltip
            formatter={(v, name) => [v.toLocaleString(), name]}
            contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(0,201,190,0.2)", borderRadius: 10, fontSize: 11, fontFamily: "var(--fm)" }}
            itemStyle={{ color: "#CBD5E1" }} labelStyle={{ color: "#94A3B8" }}
          />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>;
    }

    // Scatter
    if (cType === "scatter")
      return <ResponsiveContainer width="100%" height={h}><ScatterChart margin={{ top: 10, right: 20, left: 5, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="x" name={card.xLabel || "X"} tick={{ fontSize: 9, fill: "#64748B" }} tickFormatter={yFmt} label={{ value: card.xLabel || "X", position: "bottom", offset: 0, fill: "#64748B", fontSize: 10 }} />
        <YAxis dataKey="y" name={card.yLabel || "Y"} tick={{ fontSize: 9, fill: "#64748B" }} tickFormatter={yFmt} label={{ value: card.yLabel || "Y", angle: -90, position: "insideLeft", offset: 10, fill: "#64748B", fontSize: 10 }} />
        <ZAxis range={[50, 50]} /><Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v) => v.toLocaleString()} contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(0,201,190,0.2)", borderRadius: 10, fontSize: 11 }} itemStyle={{ color: "#CBD5E1" }} />
        <Scatter data={d} fill="#00C9BE" fillOpacity={0.8} strokeWidth={0} /></ScatterChart></ResponsiveContainer>;

    // Stacked bar
    if (cType === "stackedbar")
      return <ResponsiveContainer width="100%" height={h}><BarChart data={d} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey={xKey} tick={<AngledXTick />} interval={xInterval} height={50} /><YAxis tick={{ fontSize: 8, fill: "#64748B" }} tickFormatter={yFmt} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<CustomTip />} />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--fm)", paddingTop: 0 }} iconType="circle" iconSize={6} />}
        {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={colors[i % colors.length]} radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />)}
      </BarChart></ResponsiveContainer>;

    // Line
    if (cType === "line")
      return <ResponsiveContainer width="100%" height={h}><LineChart data={d} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey={xKey} tick={<AngledXTick />} interval={xInterval} height={50} /><YAxis tick={{ fontSize: 8, fill: "#64748B" }} tickFormatter={yFmt} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<CustomTip />} />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--fm)", paddingTop: 0 }} iconType="circle" iconSize={6} />}
        {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2.5}
          dot={{ r: 3, fill: "var(--s1)", stroke: colors[i % colors.length], strokeWidth: 2 }} activeDot={{ r: 5, fill: colors[i % colors.length], stroke: "var(--s1)", strokeWidth: 2 }} />)}
      </LineChart></ResponsiveContainer>;

    // Horizontal Bar
    if (cType === "hbar")
      return <ResponsiveContainer width="100%" height={h}><BarChart data={d} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 8, fill: "#64748B" }} tickFormatter={yFmt} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={xKey} tick={{ fontSize: 9, fill: "#94A3B8", fontFamily: "var(--fm)" }} axisLine={false} tickLine={false} width={75} />
        <Tooltip content={<CustomTip />} />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--fm)", paddingTop: 0 }} iconType="circle" iconSize={6} />}
        {keys.map((k, i) => <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[0, 4, 4, 0]} maxBarSize={24} />)}
      </BarChart></ResponsiveContainer>;

    // Bar
    if (cType === "bar")
      return <ResponsiveContainer width="100%" height={h}><BarChart data={d} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey={xKey} tick={<AngledXTick />} interval={xInterval} height={50} /><YAxis tick={{ fontSize: 8, fill: "#64748B" }} tickFormatter={yFmt} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<CustomTip />} />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--fm)", paddingTop: 0 }} iconType="circle" iconSize={6} />}
        {keys.map((k, i) => <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} maxBarSize={50} />)}
      </BarChart></ResponsiveContainer>;

    // Area (default)
    return <ResponsiveContainer width="100%" height={h}><AreaChart data={d} margin={margin}>
      <defs>{keys.map((k, i) => <linearGradient key={k} id={`dg_${card.id}_${i}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} /><stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} /></linearGradient>)}</defs>
      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
      <XAxis dataKey={xKey} tick={<AngledXTick />} interval={xInterval} height={50} /><YAxis tick={{ fontSize: 8, fill: "#64748B" }} tickFormatter={yFmt} axisLine={false} tickLine={false} width={40} />
      <Tooltip content={<CustomTip />} />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--fm)", paddingTop: 0 }} iconType="circle" iconSize={6} />}
      {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2.5} fill={`url(#dg_${card.id}_${i})`} />)}
    </AreaChart></ResponsiveContainer>;
  };

  // ── STATS type ──
  if (card.type === "stats")
    return (
      <CardWrap>
        <div className="flex aic jb mb12">
          <div className="card-title" style={{ marginBottom: 0 }}>{card.icon} {card.title}</div>
          {(onRemove || onDelete) && <div style={{ display: "flex", gap: 4 }}>{onRemove && <button onClick={() => onRemove(card.id)} title="Yashirish" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--s2)", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.color = "var(--teal)" }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg></button>}{onDelete && <button onClick={() => onDelete(card.id)} title="O'chirish" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.4)" }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.06)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>}</div>}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, alignContent: "center" }}>
          {card.stats.map((s, i) => (
            <div key={i} style={{ background: "var(--s2)", borderRadius: 10, padding: "12px 10px", textAlign: "center", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.c}60,transparent)` }} />
              <div style={{ fontSize: 18, marginBottom: 6 }}>{s.i}</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 6, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </CardWrap>
    );

  // ── GAUGE type ──
  if (card.type === "gauge")
    return (
      <CardWrap>
        <div className="flex aic jb mb8">
          <div className="card-title" style={{ marginBottom: 0, textAlign: "center", flex: 1 }}>{card.icon} {card.title}</div>
          {(onRemove || onDelete) && <div style={{ display: "flex", gap: 4 }}>{onRemove && <button onClick={() => onRemove(card.id)} title="Yashirish" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--s2)", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.color = "var(--teal)" }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg></button>}{onDelete && <button onClick={() => onDelete(card.id)} title="O'chirish" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.4)" }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.06)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>}</div>}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 220, width: "100%" }}>
            <GaugeChart value={card.value} max={card.max} label={card.label} color={card.color} />
          </div>
        </div>
      </CardWrap>
    );

  // ── HIGHLIGHT type ──
  if (card.type === "highlight")
    return (
      <CardWrap>
        <div className="flex aic jb mb12">
          <div className="card-title" style={{ marginBottom: 0 }}>{card.icon} {card.title}</div>
          {(onRemove || onDelete) && <div style={{ display: "flex", gap: 4 }}>{onRemove && <button onClick={() => onRemove(card.id)} title="Yashirish" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--s2)", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.color = "var(--teal)" }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg></button>}{onDelete && <button onClick={() => onDelete(card.id)} title="O'chirish" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.4)" }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.06)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>}</div>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          {card.items.map((it, i) => (
            <div key={i} className="flex jb aic" style={{ padding: "9px 14px", background: "var(--s2)", borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>{it.l}</span>
              <span style={{ color: it.c || "var(--text)", fontFamily: "var(--fh)", fontWeight: 700, fontSize: 13, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.v}</span>
            </div>
          ))}
        </div>
      </CardWrap>
    );

  // ── CHART type — faqat ma'lumotga ENG MOS turlarni ko'rsatish ──
  const isAutoCard = card.id?.startsWith("ig_") || card.id?.startsWith("tg_");
  const compatibleTypes = useMemo(() => {
    const data = card.data || [];
    if (!data.length) return [card.chartType || "bar"];

    // Auto-generated cardlar (Instagram/Telegram) — faqat o'z turida + jadval
    if (isAutoCard) return [card.chartType || "bar"];

    const keys = Object.keys(data[0] || {});
    const numKeys = keys.filter(k => {
      const vals = data.map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, '')));
      return vals.filter(v => !isNaN(v)).length > data.length * 0.4;
    });

    if (card.chartType === "pie") return ["pie", "bar"];
    if (card.chartType === "scatter") return ["scatter", "bar"];
    if (card.chartType === "hbar") return ["hbar", "bar"];

    const types = [card.chartType || "bar"];
    if (data.length >= 4 && !types.includes("line")) types.push("line");
    if (!types.includes("bar")) types.push("bar");
    if (data.length >= 2 && data.length <= 10 && numKeys.length === 1 && !types.includes("pie")) types.push("pie");

    return types.slice(0, 3);
  }, [card.data, card.chartType, isAutoCard]);

  const filteredOptions = CHART_TYPE_OPTIONS.filter(o => compatibleTypes.includes(o.id));

  // Jadval ko'rinishi uchun ustunlar
  const tableData = card.data || [];
  const tableCols = tableData.length > 0
    ? Object.keys(tableData[0]).filter(k => !k.startsWith("_"))
    : [];

  const iconBtn = (title, onClick, children, extra = {}) => (
    <button onClick={onClick} title={title}
      style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--s2)", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", ...extra }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.color = "var(--teal)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = extra.border || "var(--border)"; e.currentTarget.style.color = extra.color || "var(--muted)"; }}>
      {children}
    </button>
  );

  const CardContent = ({ height = CARD_H, isFullscreen = false }) => (
    <div ref={isFullscreen ? null : cardRef} style={{ display: "flex", flexDirection: "column", height: isFullscreen ? "100%" : height, padding: isFullscreen ? "20px 24px" : "18px 20px", overflow: "hidden" }}>
      {/* Header */}
      <div className="flex aic jb mb6">
        <div>
          <div className="card-title" style={{ marginBottom: 0, fontSize: isFullscreen ? 15 : 12, fontWeight: 700 }}>{card.icon} {card.title}</div>
          {card.analysis && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, lineHeight: 1.5, maxWidth: isFullscreen ? 600 : 320 }}>{card.analysis}</div>}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
          {tableData.length > 0 && iconBtn(tableView ? "Grafik" : "Jadval", () => setTableView(v => !v),
            tableView
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
          )}
          {iconBtn("PNG yuklab olish", downloadPng, <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>)}
          {!isFullscreen && iconBtn("Kattalashtirish", () => setFullscreen(true), <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>)}
          {isFullscreen && iconBtn("Yopish", () => setFullscreen(false), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>)}
          {!isFullscreen && onRemove && iconBtn("Yashirish", () => onRemove(card.id), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>)}
          {!isFullscreen && onDelete && (
            <button onClick={() => onDelete(card.id)} title="O'chirish"
              style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.06)"; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          )}
        </div>
      </div>
      {/* Chart/Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: tableView ? "auto" : "hidden" }}>
        {tableView ? (
          <div style={{ overflowX: "auto", overflowY: "auto", height: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--fm)" }}>
              <thead>
                <tr>
                  {tableCols.map(col => (
                    <th key={col} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", background: "var(--s2)", position: "sticky", top: 0 }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)", transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {tableCols.map(col => (
                      <td key={col} style={{ padding: "5px 10px", color: "var(--text)", fontSize: 11, whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
                        title={String(row[col] ?? "")}>
                        {typeof row[col] === "number" ? row[col].toLocaleString() : String(row[col] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : renderChart()}
      </div>

      {/* Pastda: chart turi toggle (faqat grafik ko'rinishida) */}
      {!tableView && filteredOptions.length > 1 && (
        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          {filteredOptions.map(o => {
            const active = cType === o.id;
            return (
              <button key={o.id} onClick={() => setChartOverride(card.id, o.id)} title={o.l}
                style={{ padding: "3px 8px", fontSize: 10, borderRadius: 6, cursor: "pointer", border: active ? "1px solid rgba(0,201,190,0.5)" : "1px solid var(--border)", background: active ? "rgba(0,201,190,0.15)" : "transparent", color: active ? "var(--teal)" : "var(--muted)", fontFamily: "var(--fh)", fontWeight: 700, transition: "all .15s" }}>
                {o.l.split(" ")[0]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <CardWrap>
        <CardContent height={CARD_H} />
      </CardWrap>
      {fullscreen && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setFullscreen(false); }}>
          <div ref={cardRef} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 18, width: "min(92vw,1100px)", height: "min(88vh,720px)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <CardContent height={undefined} isFullscreen={true} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────
function DashboardPage({ sources, aiConfig, setPage, user, orgContext, activeDepartmentId, setActiveDepartmentId, setOpenDept }) {
  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const [readAnomalies, setReadAnomalies] = useState(() => {
    try { return LS.get("u_" + (user?.id || "anon") + "_read_anomalies", []); } catch { return []; }
  });
  const [hiddenAnomalies, setHiddenAnomalies] = useState(() => {
    try { return LS.get("u_" + (user?.id || "anon") + "_hidden_anomalies", []); } catch { return []; }
  });
  const markAnomalyRead = (key) => {
    const updated = [...new Set([...readAnomalies, key])];
    setReadAnomalies(updated);
    LS.set("u_" + (user?.id || "anon") + "_read_anomalies", updated);
  };
  const hideAnomaly = (key) => {
    const updated = [...new Set([...hiddenAnomalies, key])];
    setHiddenAnomalies(updated);
    LS.set("u_" + (user?.id || "anon") + "_hidden_anomalies", updated);
  };
  const resetHiddenAnomalies = () => {
    setHiddenAnomalies([]);
    LS.del("u_" + (user?.id || "anon") + "_hidden_anomalies");
  };
  const prov = AI_PROVIDERS[aiConfig.provider];
  const connected = sources.filter(s => s.connected && s.active);
  const total = connected.reduce((a, s) => a + (s.data?.length || 0), 0);

  // Custom widgets — AI avtomatik raqam hisoblaydi
  const widgetsKey = "u_" + (user?.id || "anon") + "_widgets";
  const [widgets, setWidgets] = useState(() => LS.get(widgetsKey, []));
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newWidget, setNewWidget] = useState({ label: "", sourceId: "", color: "#00C9BE" });
  const [widgetLoading, setWidgetLoading] = useState(null);

  const addWidget = async () => {
    if (!newWidget.label.trim() || !newWidget.sourceId) return;
    const src = sources.find(s => s.id === newWidget.sourceId);
    if (!src?.data?.length) return;
    const w = { id: Date.now(), label: newWidget.label, sourceId: newWidget.sourceId, color: newWidget.color, value: "...", sub: "" };
    const updated = [...widgets, w];
    setWidgets(updated); LS.set(widgetsKey, updated);
    setShowAddWidget(false);
    // AI dan raqam olish — SMART CONTEXT
    setWidgetLoading(w.id);
    try {
      let ctx = "";
      if (Token.get()) {
        try { const r = await SourcesAPI.getAiContext(src.id, newWidget.label); if (r?.context) ctx = r.context; } catch { }
      }
      if (!ctx) ctx = buildMergedContext([src]);
      const prompt = `Foydalanuvchi "${newWidget.label}" ko'rsatkichini bilmoqchi. Manba: "${src.name}" (${src.data.length} qator).
MA'LUMOTLAR:\n${ctx}

FAQAT bitta qisqa javob ber — JSON formatda:
{"value":"123","sub":"tushuntirish"}

value = asosiy raqam (formatlangan: 1.5K, 2.3M)
sub = qisqa izoh (masalan: "jami summa", "o'rtacha", "836 tadan")

Agar hisoblab bo'lmasa: {"value":"—","sub":"ma'lumot yetarli emas"}
FAQAT JSON, boshqa narsa yozma.`;
      let result = "";
      await callAI([{ role: "user", content: prompt }], aiConfig, (t) => { result = t; });
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        setWidgets(prev => {
          const u = prev.map(x => x.id === w.id ? { ...x, value: parsed.value || "—", sub: parsed.sub || "" } : x);
          LS.set(widgetsKey, u); return u;
        });
      }
    } catch { }
    setWidgetLoading(null);
    setNewWidget({ label: "", sourceId: "", color: "#00C9BE" });
  };
  const removeWidget = (id) => { const u = widgets.filter(w => w.id !== id); setWidgets(u); LS.set(widgetsKey, u); };
  // Widget yangilash
  const refreshWidget = async (w) => {
    const src = sources.find(s => s.id === w.sourceId);
    if (!src?.data?.length) return;
    setWidgetLoading(w.id);
    try {
      let ctx = "";
      if (Token.get()) {
        try { const r = await SourcesAPI.getAiContext(src.id, w.label); if (r?.context) ctx = r.context; } catch { }
      }
      if (!ctx) ctx = buildMergedContext([src]);
      const prompt = `"${w.label}" ko'rsatkichini hisobla. Manba: "${src.name}" (${src.data.length} qator). DATA:\n${ctx}
FAQAT JSON: {"value":"123","sub":"izoh"}`;
      let result = "";
      await callAI([{ role: "user", content: prompt }], aiConfig, (t) => { result = t; });
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        setWidgets(prev => {
          const u = prev.map(x => x.id === w.id ? { ...x, value: parsed.value || "—", sub: parsed.sub || "" } : x);
          LS.set(widgetsKey, u); return u;
        });
      }
    } catch { }
    setWidgetLoading(null);
  };
  const [activeSrc, setActiveSrc] = useState(null);
  const [chartOverrides, setChartOverrides] = useState({});

  const setChartOverride = (cardId, type) => setChartOverrides(prev => ({ ...prev, [cardId]: type }));

  // Tanlangan manba yoki birinchi connected
  const workingSrc = activeSrc ? sources.find(s => s.id === activeSrc) : connected[0];

  // Foydalanuvchi o'zi qo'shgan dashboard kartalar (avto-generatsiya EMAS)
  const dashCacheKey = "u_" + (user?.id || "anon") + "_dash_cards";
  const [dashCards, setDashCards] = useState(() => LS.get(dashCacheKey, []));
  const [dashQuery, setDashQuery] = useState("");
  const [dashLoading, setDashLoading] = useState(false);

  const addDashChart = async (queryText) => {
    const q = queryText || dashQuery;
    if (!q.trim() || !workingSrc?.data?.length || !aiConfig?.apiKey) return;
    setDashLoading(true);
    try {
      let ctx = "";
      if (Token.get()) {
        try { const r = await SourcesAPI.getAiContext(workingSrc.id, q); if (r?.context) ctx = r.context; } catch { }
      }
      if (!ctx) ctx = buildMergedContext([workingSrc]);
      const prompt = `Biznes tahlilchi. So'rov: "${q}"
MANBA: "${workingSrc.name}" (${workingSrc.data.length} qator)
DATA:\n${ctx}

SO'ROVGA QARAB KARTA TURINI TANLA:
- "statistika/raqam/nechta/jami" → stats karta
- "trend/grafik/chart/dinamika" → chart karta (chartType: "line" yoki "area")
- "top/reyting/eng yaxshi" → chart karta (chartType: "bar")
- "taqsimot/ulush/pie" → chart karta (chartType: "pie")
- "umumiy" → 1 stats + 1 chart

1-2 ta karta qaytar. MANFIY raqam TAQIQLANGAN. Label O'ZBEK tilida, max 10 belgi.

MUHIM — LABEL VA NOM QOIDALARI:
- "qiymat" so'zini HECH QACHON ishlatma! O'rniga ANIQ nom yoz: "like soni", "o'quvchilar", "daromad (so'm)", "guruhlar"
- Chart title ANIQ bo'lsin: "Postlar bo'yicha like soni" (EMAS: "Postlar dinamikasi")
- keys da ANIQ nom: ["like_soni"] yoki ["oqvchilar"] (EMAS: ["qiymat"])
- Tooltip da foydalanuvchi nima ko'rayotganini TUSHUNISHI kerak

JSON FORMAT:
- stats: {"type":"stats","title":"Asosiy ko'rsatkichlar","icon":"📊","stats":[{"l":"Jami o'quvchilar","v":"836","c":"#00C9BE"}]}
- bar: {"type":"chart","title":"Top 5 guruh (o'quvchi soni)","icon":"📊","chartType":"bar","data":[{"name":"Guruh A","oqvchilar":25}],"keys":["oqvchilar"],"xKey":"name","colors":["#00C9BE"]}
- line: {"type":"chart","title":"Oylik like dinamikasi","icon":"📈","chartType":"line","data":[{"name":"Yan","like_soni":100}],"keys":["like_soni"],"xKey":"name","colors":["#4ADE80"]}
- pie: {"type":"chart","title":"Post turlari taqsimoti","icon":"📊","chartType":"pie","data":[{"name":"Rasm","value":50}],"colors":["#00C9BE","#E8B84B","#A78BFA"]}

\`\`\`json
{"cards":[...]}
\`\`\`
FAQAT JSON.`;
      let result = "";
      await callAI([{ role: "user", content: prompt }], aiConfig, (t) => { result = t; });
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const newCards = (parsed.cards || []).map((c, i) => ({ ...c, id: `dash_${Date.now()}_${i}` }));
        if (newCards.length) {
          const updated = [...newCards, ...dashCards];
          setDashCards(updated); LS.set(dashCacheKey, updated);
        }
      }
    } catch { }
    setDashLoading(false); setDashQuery("");
  };

  const removeDashCard = (id) => {
    const updated = dashCards.filter(c => c.id !== id);
    setDashCards(updated); LS.set(dashCacheKey, updated);
  };
  const clearDashCards = () => { setDashCards([]); LS.del(dashCacheKey); };

  // Yordamchi: salom bo'sh holat uchun
  const firstName = (user?.name || "").split(" ")[0];
  const activeDept = activeDepartmentId
    ? orgContext?.departments?.find(d => d.id === activeDepartmentId)
    : null;

  return (
    <div>
      {/* ── Bo'sh holat — manba ulanmagan ── */}
      {connected.length === 0 && (
        <div className="card" style={{
          padding: "40px 28px", textAlign: "center",
          background: "linear-gradient(135deg, rgba(212,168,83,0.04) 0%, rgba(0,212,200,0.02) 100%)",
          border: "1px dashed rgba(212,168,83,0.25)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "linear-gradient(135deg, rgba(212,168,83,0.12), rgba(0,212,200,0.08))",
            border: "1px solid rgba(212,168,83,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 28,
          }}>📊</div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, marginBottom: 8, color: "var(--text)" }}>
            Boshlaymiz{firstName ? `, ${firstName}` : ""}!
          </div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20, maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.7 }}>
            {activeDept
              ? `"${activeDept.name}" bo'limiga ma'lumot manbasi ulang — Excel, Google Sheets, Instagram yoki boshqa. AI shu bo'lim kontekstida ishlaydi.`
              : "Ma'lumot manbasi ulang — Excel, Google Sheets, Instagram yoki boshqa. AI sizning ma'lumotlaringiz asosida tahlil, hisobot va maslahat beradi."}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => setPage("datahub")} style={{ padding: "11px 24px", fontSize: 13 }}>
              + Manba qo'shish
            </button>
            <button className="btn btn-ghost" onClick={() => {
              // Umumiy → CEO uchun "hamma manba" (null filter), xodim uchun o'z Umumiy'i
              const umumiy = orgContext?.departments?.find(d => d.name === "Umumiy");
              const isCeo = user?.role === "ceo" || user?.role === "super_admin" || user?.role === "admin";
              if (setActiveDepartmentId) {
                setActiveDepartmentId(isCeo ? null : (umumiy?.id || null));
                if (setOpenDept && umumiy) setOpenDept(umumiy.id);
              }
              setPage("chat");
            }} style={{ padding: "11px 24px", fontSize: 13 }}>
              AI bilan suhbat
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          YANGI REDESIGN: Health Hero + AI Insights
          ════════════════════════════════════════════ */}
      {connected.length > 0 && (() => {
        // Health score hisoblash — manbalar faolligi + anomaliyalar
        const totalRows = connected.reduce((a, s) => a + (s.data?.length || 0), 0);
        const activeSrcs = connected.filter(s => {
          const last = s.lastSync ? new Date(s.lastSync) : null;
          return last && (Date.now() - last.getTime()) < 24 * 3600 * 1000;
        }).length;
        const anomaliesCount = (typeof alerts !== 'undefined' ? alerts : []).length || 0;
        const financeScore = Math.round(Math.min(100, (activeSrcs / Math.max(1, connected.length)) * 100));
        const customerScore = Math.round(Math.min(100, 60 + (totalRows / 1000) * 0.5));
        const growthScore = Math.round(Math.min(100, 50 + activeSrcs * 8));
        const opsScore = Math.round(Math.max(30, 100 - anomaliesCount * 10));
        const overallScore = Math.round((financeScore + customerScore + growthScore + opsScore) / 4);
        const scoreColor = overallScore >= 75 ? "var(--green)" : overallScore >= 50 ? "var(--gold)" : "var(--red)";
        const scoreLabel = overallScore >= 75 ? "Yaxshi" : overallScore >= 50 ? "O'rtacha" : "Diqqat talab qiladi";
        const now = new Date();
        const days = ["Yakshanba","Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba"];
        const monthNames = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
        const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`;
        // Gauge SVG (stroke-dashoffset bilan arc)
        const R = 60, C = 2 * Math.PI * R;
        const offset = C - (overallScore / 100) * C;
        return (
          <div style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 24,
            padding: "22px 24px", marginBottom: 20,
            background: "linear-gradient(135deg, var(--s1) 0%, var(--gold-glow) 100%)",
            border: "1px solid var(--border)", borderRadius: 14,
            position: "relative", overflow: "hidden",
          }}>
            {/* Radial glow */}
            <div style={{ position: "absolute", top: "-50%", right: "-10%", width: 400, height: 400, background: "radial-gradient(circle, var(--teal-glow) 0%, transparent 60%)", pointerEvents: "none" }} />
            {/* Gauge */}
            <div style={{ position: "relative", width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                <defs>
                  <linearGradient id="hero-gauge" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--teal)" />
                    <stop offset="100%" stopColor="var(--gold)" />
                  </linearGradient>
                </defs>
                <circle cx="70" cy="70" r={R} stroke="var(--s3)" strokeWidth="10" fill="none" />
                <circle cx="70" cy="70" r={R} stroke="url(#hero-gauge)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
              </svg>
              <div style={{ position: "absolute", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--fh)", fontSize: 38, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1, color: "var(--text)" }}>{overallScore}</div>
                <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginTop: 4 }}>/ 100</div>
              </div>
            </div>
            {/* Body */}
            <div style={{ position: "relative", zIndex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--fm)", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "var(--gold)", marginBottom: 6, fontWeight: 600 }}>
                Xayrli kun, {firstName || user?.name || "Boss"} · {dateStr}
              </div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginBottom: 6, color: "var(--text)" }}>
                Biznes salomatligi — <span style={{ color: scoreColor }}>{scoreLabel}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14, maxWidth: 580, lineHeight: 1.55 }}>
                Umumiy ko'rsatkich: <b style={{ color: "var(--text)" }}>{overallScore}/100</b>.
                {activeSrcs < connected.length && <> {connected.length - activeSrcs} ta manba 24+ soat yangilanmagan.</>}
                {anomaliesCount > 0 && <> {anomaliesCount} ta anomaliya aniqlangan.</>}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { lbl: "Moliya",    val: financeScore,  color: financeScore >= 70 ? "var(--green)" : financeScore >= 40 ? "var(--gold)" : "var(--red)" },
                  { lbl: "Mijozlar",  val: customerScore, color: customerScore >= 70 ? "var(--green)" : customerScore >= 40 ? "var(--gold)" : "var(--red)" },
                  { lbl: "O'sish",    val: growthScore,   color: growthScore >= 70 ? "var(--green)" : growthScore >= 40 ? "var(--gold)" : "var(--red)" },
                  { lbl: "Operatsion", val: opsScore,     color: opsScore >= 70 ? "var(--green)" : opsScore >= 40 ? "var(--gold)" : "var(--red)" },
                ].map(p => (
                  <div key={p.lbl} style={{ padding: "7px 12px", background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11.5, display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--fh)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
                    <span style={{ color: "var(--text2)" }}>{p.lbl}</span>
                    <span style={{ fontFamily: "var(--fm)", fontWeight: 600, color: "var(--text)" }}>{p.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── AI Proactive Insights (agar manba bor bo'lsa) ── */}
      {connected.length > 0 && (() => {
        const totalRows = connected.reduce((a, s) => a + (s.data?.length || 0), 0);
        const insights = [
          {
            tag: "DIQQAT", tagColor: "var(--orange)", tagBg: "rgba(242,169,59,0.12)",
            text: <>Sizda <b style={{ color: "var(--gold)" }}>{connected.length} ta manba</b> ulangan va tahlilga tayyor. Umumiy biznes tahlilini boshlang.</>,
            action: "AI dan so'rash →", onClick: () => setPage("chat"),
          },
          {
            tag: "IMKONIYAT", tagColor: "var(--green)", tagBg: "rgba(47,191,113,0.12)",
            text: <><b style={{ color: "var(--gold)" }}>{totalRows.toLocaleString()} qator</b> ma'lumotdan AI avtomatik tahlil yaratadi. Tahlil modullarini sinab ko'ring.</>,
            action: "Modullar →", onClick: () => setPage("analytics"),
          },
          {
            tag: "TREND", tagColor: "var(--blue)", tagBg: "rgba(96,165,250,0.12)",
            text: <>Grafiklar bo'limida ma'lumotlaringiz bo'yicha <b style={{ color: "var(--gold)" }}>vizual xaritalar</b> tayyor. Bir bosish bilan chart yarating.</>,
            action: "Grafiklar →", onClick: () => setPage("charts"),
          },
        ];
        return (
          <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--purple), var(--gold))", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 700 }}>✦</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--fh)", letterSpacing: -0.1 }}>AI sizga tavsiya qiladi</div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--fm)" }}>Ma'lumotlaringiz asosida avtomatik yaratildi</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {insights.map((ins, i) => (
                <div key={i} onClick={ins.onClick}
                  style={{ padding: "14px 16px", background: "var(--s2)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", transition: "all .18s var(--ease)" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hi)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                  <div style={{ display: "inline-block", padding: "2px 8px", fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700, color: ins.tagColor, background: ins.tagBg, borderRadius: 4, marginBottom: 10 }}>{ins.tag}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text)", marginBottom: 10 }}>{ins.text}</div>
                  <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>{ins.action}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Manba tanlash ── */}
      {connected.length > 0 && (
        <div className="flex gap6 mb16 aic flex-wrap">
          <span className="text-xs text-muted" style={{ fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2 }}>Manba:</span>
          {connected.map(s => {
            const st = SOURCE_TYPES[s.type];
            return (
              <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { setActiveSrc(s.id); setChartOverrides({}); }}
                style={workingSrc?.id === s.id ? { borderColor: s.color || st.color, color: s.color || st.color, background: `${s.color || st.color}0F` } : {}}>
                {st.icon} {s.name} <span className="badge b-ok" style={{ fontSize: 8, marginLeft: 4 }}>{s.data?.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Custom widgets ── */}
      <div style={{ marginBottom: 16 }}>
        <div className="flex aic jb mb8">
          <div style={{ fontSize: 9, fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)" }}>Shaxsiy ko'rsatkichlar</div>
          <button className="btn btn-ghost btn-xs" onClick={() => setShowAddWidget(p => !p)} style={{ fontSize: 9 }}>+ Qo'shish</button>
        </div>
        {widgets.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
            {widgets.map(w => {
              const isLoading = widgetLoading === w.id;
              return (
                <div key={w.id} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", position: "relative", transition: "all .2s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = w.color + "40"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                  <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
                    <button onClick={() => refreshWidget(w)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10 }} title="Yangilash">↻</button>
                    <button onClick={() => removeWidget(w.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10 }}>✕</button>
                  </div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 800, color: w.color }}>
                    {isLoading ? (
                      <div>
                        <div style={{ height: 2, background: "var(--s3)", borderRadius: 2, marginBottom: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2, background: w.color, animation: "dashProg 1.5s ease infinite" }} />
                        </div>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>AI hisoblayapti</span>
                      </div>
                    ) : w.value || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2, fontWeight: 600 }}>{w.label}</div>
                  {w.sub && <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{w.sub}</div>}
                </div>
              );
            })}
          </div>
        )}
        {showAddWidget && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="field f1" placeholder="Nima bilmoqchisiz? (masalan: Jami o'quvchilar soni)" value={newWidget.label} onChange={e => setNewWidget(p => ({ ...p, label: e.target.value }))} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select className="field f1" value={newWidget.sourceId} onChange={e => setNewWidget(p => ({ ...p, sourceId: e.target.value }))}>
                <option value="">Manba tanlang...</option>
                {connected.map(s => <option key={s.id} value={s.id}>{s.name} ({s.data?.length} qator)</option>)}
              </select>
              <input type="color" value={newWidget.color} onChange={e => setNewWidget(p => ({ ...p, color: e.target.value }))} style={{ width: 36, height: 36, border: "none", borderRadius: 8, cursor: "pointer" }} />
            </div>
            <div className="flex gap8">
              <button className="btn btn-primary btn-sm" onClick={addWidget} disabled={!newWidget.label || !newWidget.sourceId || widgetLoading}>
                {widgetLoading ? "AI hisoblayapti..." : "Qo'shish"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddWidget(false)}>Bekor</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bo'limlar (tashkilot) ── */}
      {(() => {
        const isCeoRole = user?.role === "ceo" || user?.role === "super_admin" || user?.role === "admin";
        const umumiyActive = activeDepartmentId === null;
        const otherDepts = (orgContext?.departments || []).filter(d => d.name !== "Umumiy");
        return (
        <div style={{ marginBottom: 20 }}>
          <div className="flex aic jb mb10">
            <div style={{ fontSize: 9, fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)" }}>Bo'limlar</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Bosing → o'sha bo'limga kirish</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {/* Umumiy — har doim birinchi */}
            <div
              onClick={() => { if (setActiveDepartmentId) setActiveDepartmentId(null); if (setOpenDept) setOpenDept(null); }}
              style={{
                background: umumiyActive ? "#00D4C820" : "var(--s1)",
                border: `1px solid ${umumiyActive ? "#00D4C840" : "var(--border)"}`,
                borderRadius: 12, padding: "14px 16px",
                cursor: "pointer", transition: "all .2s",
                display: "flex", alignItems: "center", gap: 12,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#00D4C840"; e.currentTarget.style.background = "#00D4C808"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = umumiyActive ? "#00D4C840" : "var(--border)"; e.currentTarget.style.background = umumiyActive ? "#00D4C820" : "var(--s1)"; }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#00D4C820", border: "1px solid #00D4C840", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏢</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: umumiyActive ? "#00D4C8" : "var(--text)" }}>Umumiy</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Barchasi · {sources.length} manba</div>
              </div>
              {umumiyActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D4C8", flexShrink: 0 }} />}
            </div>
            {otherDepts.map(d => {
              const c = d.color || "#6B7280";
              const deptSourceCount = sources.filter(s =>
                Array.isArray(s.department_ids) && s.department_ids.includes(d.id)
              ).length;
              const activeForThis = activeDepartmentId === d.id;
              return (
                <div key={d.id}
                  onClick={() => {
                    if (setActiveDepartmentId) setActiveDepartmentId(d.id);
                    if (setOpenDept) setOpenDept(d.id);
                  }}
                  style={{
                    background: activeForThis ? c + "10" : "var(--s1)",
                    border: `1px solid ${activeForThis ? c + "40" : "var(--border)"}`,
                    borderRadius: 12, padding: "14px 16px",
                    cursor: "pointer", transition: "all .2s",
                    display: "flex", alignItems: "center", gap: 12,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = c + "40"; e.currentTarget.style.background = c + "08"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = activeForThis ? c + "40" : "var(--border)"; e.currentTarget.style.background = activeForThis ? c + "10" : "var(--s1)"; }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: c + "20", border: `1px solid ${c}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>{d.icon || "📁"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: activeForThis ? c : "var(--text)" }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                      {deptSourceCount} manba · {d.employee_count || 0} xodim
                    </div>
                  </div>
                  {activeForThis && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* ── Anomaliya Aniqlash (avtomatik, collapse) ── */}
      {(() => {
        const allAnomalies = detectAnomalies(connected);
        const anomalies = allAnomalies.filter(a => !hiddenAnomalies.includes(a.source + "|" + a.field + "|" + a.type));
        if (anomalies.length === 0 && hiddenAnomalies.length === 0) return null;
        const dangerCount = anomalies.filter(a => a.severity === 'danger').length;
        const warnCount = anomalies.filter(a => a.severity === 'warning').length;
        const infoCount = anomalies.filter(a => a.severity !== 'danger' && a.severity !== 'warning').length;
        const unreadCount = anomalies.filter(a => !readAnomalies.includes(a.source + "|" + a.field + "|" + a.type)).length;
        const sevColors = { danger: { bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.25)", color: "#F87171", label: "Xavfli" }, warning: { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.25)", color: "#FBBF24", label: "Ogohlantirish" }, info: { bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.25)", color: "#60A5FA", label: "Ma'lumot" } };
        return (
          <div className="mb20" style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: dangerCount > 0 ? "linear-gradient(90deg, #F87171, #FBBF24, #60A5FA)" : "linear-gradient(90deg, #FBBF24, #60A5FA)" }} />
            {/* Sarlavha — bosilganda ochiladi/yopiladi */}
            <div className="flex aic jb" style={{ cursor: "pointer" }} onClick={() => setAnomalyOpen(p => !p)}>
              <div className="flex aic gap10">
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.5" fill="#FBBF24" /></svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 800 }}>Anomaliyalar {unreadCount > 0 && <span style={{ color: "var(--red)", fontSize: 12 }}>({unreadCount} yangi)</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{anomalies.length} ta topilma {hiddenAnomalies.length > 0 && `· ${hiddenAnomalies.length} yashirilgan`}</div>
                </div>
              </div>
              <div className="flex aic gap6">
                {dangerCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 700 }}>{dangerCount} xavfli</span>}
                {warnCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#FBBF24", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 700 }}>{warnCount} ogohlantirish</span>}
                {infoCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#60A5FA", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 700 }}>{infoCount} ma'lumot</span>}
                {hiddenAnomalies.length > 0 && <span onClick={e => { e.stopPropagation(); resetHiddenAnomalies(); }} style={{ padding: "4px 10px", borderRadius: 20, background: "var(--s3)", border: "1px solid var(--border)", color: "var(--muted)", fontSize: 10, fontFamily: "var(--fh)", cursor: "pointer" }}>Barchasini ko'rsatish</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform .3s", transform: anomalyOpen ? "rotate(180deg)" : "rotate(0)" }}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            {/* Kartalar — faqat ochiq bo'lganda */}
            {anomalyOpen && <div style={{ marginTop: 14 }}>
              {anomalies.map((a, i) => {
                const sev = sevColors[a.severity] || sevColors.warning;
                const aKey = a.source + "|" + a.field + "|" + a.type;
                const isRead = readAnomalies.includes(aKey);
                const pctDiff = a.mean && a.value && typeof a.value === "number" && typeof a.mean === "number" && a.mean !== 0 ? Math.round((a.value - a.mean) / a.mean * 100) : null;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, border: `1px solid ${isRead ? "var(--border)" : sev.border}`, background: isRead ? "transparent" : sev.bg, marginBottom: 8, transition: "all .2s", opacity: isRead ? 0.6 : 1 }}>
                    {/* Indicator */}
                    <div style={{ width: 6, height: 36, borderRadius: 3, background: sev.color, flexShrink: 0, opacity: isRead ? 0.3 : 1 }} />
                    {/* Ma'lumot */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{a.fieldName || a.field?.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 8, color: "var(--muted)", background: "var(--s2)", padding: "1px 6px", borderRadius: 6 }}>{a.source}</span>
                        {(a.type === "trend_down" || a.type === "trend_up") && (
                          <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 6, background: a.type === "trend_down" ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)", color: a.type === "trend_down" ? "#F87171" : "#4ADE80", fontWeight: 600 }}>
                            {a.type === "trend_down" ? "↓ pasayish" : "↑ o'sish"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {a.explanation || a.message || ""}
                      </div>
                    </div>
                    {/* Raqamlar */}
                    <div style={{ display: "flex", gap: 12, flexShrink: 0, alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: sev.color }}>{typeof a.value === "number" ? a.value.toLocaleString() : a.value}</div>
                        <div style={{ fontSize: 7, color: "var(--muted)", textTransform: "uppercase" }}>qiymat</div>
                      </div>
                      {a.mean != null && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>{typeof a.mean === "number" ? a.mean.toLocaleString() : a.mean}</div>
                          <div style={{ fontSize: 7, color: "var(--muted)", textTransform: "uppercase" }}>o'rtacha</div>
                        </div>
                      )}
                      {pctDiff != null && (
                        <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 800, color: pctDiff > 0 ? "#4ADE80" : "#F87171", minWidth: 45, textAlign: "center" }}>
                          {pctDiff > 0 ? "+" : ""}{pctDiff}%
                        </div>
                      )}
                    </div>
                    {/* Amallar */}
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {!isRead && <button onClick={e => { e.stopPropagation(); markAnomalyRead(aKey); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 9, color: "var(--teal)", cursor: "pointer", fontFamily: "var(--fh)" }}>✓</button>}
                      <button onClick={e => { e.stopPropagation(); hideAnomaly(aKey); }} style={{ background: "none", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "4px 6px", fontSize: 9, color: "var(--red)", cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>}
          </div>
        );
      })()}

      {/* ── Dashboard — foydalanuvchi o'zi qo'shadi ── */}
      {connected.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="flex aic jb mb10">
            <div style={{ fontSize: 9, fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)" }}>Dashboard kartalar</div>
            {dashCards.length > 0 && (
              <button className="btn btn-ghost btn-xs" onClick={() => { if (confirm("Barcha kartalarni o'chirish?")) clearDashCards(); }} style={{ fontSize: 9, color: "var(--red)" }}>Tozalash</button>
            )}
          </div>
          {/* So'rov paneli */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input className="field f1" placeholder={`${workingSrc?.name || "Manba"}: qanday grafik yoki raqam kerak?`}
              value={dashQuery} onChange={e => setDashQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !dashLoading) addDashChart(); }}
              disabled={dashLoading} style={{ fontSize: 12 }} />
            <button className="btn btn-primary btn-sm" onClick={() => addDashChart()} disabled={dashLoading || !dashQuery.trim()} style={{ whiteSpace: "nowrap" }}>
              {dashLoading ? "..." : "+ Qo'shish"}
            </button>
          </div>
          {/* Tayyor so'rovlar */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12 }} className="hide-scroll">
            {["Umumiy raqamlar", "Top 5 bar grafik", "Trend line grafik", "Taqsimot pie grafik", "Solishtirma tahlil"].map(q => (
              <button key={q} className="btn btn-ghost btn-xs" onClick={() => addDashChart(q)} disabled={dashLoading}
                style={{ flexShrink: 0, fontSize: 10 }}>{q}</button>
            ))}
          </div>
          {/* Mini progress bar — AiProgressBar bilan bir xil stil */}
          <AiProgressBar loading={dashLoading} />
        </div>
      )}

      {/* Dashboard kartalar */}
      {dashCards.length > 0 && (
        <CardGrid cards={dashCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_" + (user?.id || "anon") + "_layout_dash"} onDeleteCard={(id) => removeDashCard(id)} />
      )}

      {/* Dashboard kartalar yo'q holati — manba bor, lekin karta hali yo'q */}
      {connected.length > 0 && dashCards.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "28px 24px", border: "1px dashed var(--border)" }}>
          <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Dashboard kartalarni sozlang</div>
          <div className="text-muted text-sm">Yuqorida savol yozing yoki tayyor shablonlardan birini tanlang — AI avtomatik karta yaratadi</div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MULTI-ORGANIZATION — CEO va Super-admin sahifalari
// ═════════════════════════════════════════════════════════════

// Bo'lim ikonkalar va ranglar (tayyor shablonlar)
const DEPT_PRESETS = [
  { icon: "📈", label: "Marketing",       color: "#3B82F6" },
  { icon: "💰", label: "Sotuv",           color: "#10B981" },
  { icon: "📊", label: "Moliya",          color: "#F59E0B" },
  { icon: "👥", label: "HR",              color: "#A78BFA" },
  { icon: "🏭", label: "Ishlab chiqarish", color: "#6B7280" },
  { icon: "🚚", label: "Logistika",       color: "#EF4444" },
  { icon: "🎧", label: "Qo'llab-quvvatlash", color: "#06B6D4" },
  { icon: "📁", label: "Umumiy",          color: "#6B7280" },
];

// ─────────────────────────────────────────────────────────────
// DepartmentsPage — CEO bo'limlarni boshqaradi
// ─────────────────────────────────────────────────────────────
function DepartmentsPage({ push, onChange }) {
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {mode:'create'} | {mode:'edit', dept}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await DepartmentsAPI.getAll();
      setDepts(Array.isArray(list) ? list : []);
    } catch (e) {
      push(e.message || "Bo'limlar yuklanmadi", "error");
    } finally { setLoading(false); }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  const remove = async (d) => {
    const force = (d.employee_count > 0 || d.source_count > 0);
    const msg = force
      ? `"${d.name}" bo'limida ${d.employee_count} xodim, ${d.source_count} manba bor.\nBog'lanishlar uziladi (ma'lumot o'chmaydi). Davom etasizmi?`
      : `"${d.name}" bo'limi o'chirilsinmi?`;
    if (!window.confirm(msg)) return;
    try {
      await DepartmentsAPI.delete(d.id, force);
      push(`"${d.name}" o'chirildi`, "ok");
      load(); if (onChange) onChange();
    } catch (e) { push(e.message, "error"); }
  };

  if (loading) return <div className="card"><div className="card-title">Bo'limlar</div><SkeletonList count={3} /></div>;

  return (
    <>
      <div className="card">
        <div className="flex aic" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Bo'limlar</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Kompaniyangizning bo'limlari — har bo'limga alohida manba va xodim biriktiriladi
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: "create" })}>+ Yangi bo'lim</button>
        </div>

        {depts.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Hali bo'lim yo'q. Birinchi bo'limni qo'shing.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {depts.map(d => (
              <div key={d.id} style={{
                padding: 16,
                borderRadius: "var(--radius-lg)",
                border: `1px solid ${d.color || "var(--border)"}30`,
                background: `${d.color || "var(--teal)"}08`,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${d.color || "var(--teal)"}20`,
                  border: `1px solid ${d.color || "var(--teal)"}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>{d.icon || "📁"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {d.employee_count || 0} xodim · {d.source_count || 0} manba
                  </div>
                </div>
                {d.name !== "Umumiy" && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => setModal({ mode: "edit", dept: d })}>Tahrir</button>
                    <button className="btn btn-danger btn-xs" onClick={() => remove(d)}>O'chirish</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <DepartmentModal
          mode={modal.mode}
          dept={modal.dept}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); if (onChange) onChange(); }}
          push={push}
        />
      )}
    </>
  );
}

// Emoji va rang shablonlari bo'lim uchun
const DEPT_ICON_GRID = ["📈","💰","📊","👥","🏭","🚚","🎧","💼","🏢","📁","💻","🎯","🛒","📦","🔧","🎨","📱","⚡","🌟","🚀"];
const DEPT_COLOR_SWATCHES = [
  "#3B82F6", "#10B981", "#F59E0B", "#A78BFA",
  "#EF4444", "#06B6D4", "#EC4899", "#8B5CF6",
  "#14B8A6", "#F97316", "#6B7280", "#84CC16",
];

function DepartmentModal({ mode, dept, onClose, onSaved, push }) {
  const [name, setName] = useState(dept?.name || "");
  const [icon, setIcon] = useState(dept?.icon || "📁");
  const [color, setColor] = useState(dept?.color || "#6B7280");
  const [saving, setSaving] = useState(false);

  const applyPreset = (p) => { setName(p.label); setIcon(p.icon); setColor(p.color); };

  const save = async () => {
    if (!name.trim()) { push("Bo'lim nomi kerak", "warn"); return; }
    setSaving(true);
    try {
      if (mode === "create") {
        await DepartmentsAPI.create({ name: name.trim(), icon, color });
        push(`"${name}" bo'limi yaratildi`, "ok");
      } else {
        await DepartmentsAPI.update(dept.id, { name: name.trim(), icon, color });
        push(`"${name}" yangilandi`, "ok");
      }
      onSaved();
    } catch (e) {
      push(e.message, "error");
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 520, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header — gradientli, live preview bilan */}
        <div style={{
          padding: "24px 28px 22px",
          background: `linear-gradient(135deg, ${color}18 0%, ${color}08 100%)`,
          borderBottom: `1px solid ${color}25`,
          display: "flex", alignItems: "center", gap: 16, position: "relative",
        }}>
          <button className="modal-close" style={{ top: 14, right: 14 }} onClick={onClose}>×</button>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: `${color}22`, border: `2px solid ${color}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, boxShadow: `0 4px 16px ${color}25`,
          }}>{icon || "📁"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--fh)", fontSize: 19, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
              {mode === "create" ? "Yangi bo'lim" : "Bo'limni tahrirlash"}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {name.trim() ? `Ko'rinish: ${name}` : "Bo'lim nomi, ikonka va rangini tanlang"}
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 28px 24px" }}>
          {mode === "create" && (
            <div style={{ marginBottom: 18 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>Tayyor shablonlar</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {DEPT_PRESETS.map(p => {
                  const active = name === p.label && icon === p.icon;
                  return (
                    <div key={p.label}
                      onClick={() => applyPreset(p)}
                      style={{
                        padding: "8px 6px", borderRadius: 10,
                        border: `1px solid ${active ? p.color : p.color + "20"}`,
                        background: active ? `${p.color}15` : "var(--s2)",
                        fontSize: 11, fontFamily: "var(--fh)", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        transition: "all .15s",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = `${p.color}10`; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--s2)"; }}
                    >
                      <span style={{ fontSize: 18 }}>{p.icon}</span>
                      <span style={{ color: active ? p.color : "var(--text2)", fontWeight: active ? 700 : 500 }}>{p.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div className="field-label">Bo'lim nomi</div>
            <input className="field" value={name} onChange={e => setName(e.target.value)}
              placeholder="Masalan: Marketing" maxLength={100} autoFocus />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="field-label">Ikonka</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4, padding: 8,
              background: "var(--s2)", borderRadius: 10, border: "1px solid var(--border)" }}>
              {DEPT_ICON_GRID.map(e => (
                <div key={e} onClick={() => setIcon(e)}
                  style={{
                    padding: 6, textAlign: "center", fontSize: 18, cursor: "pointer",
                    borderRadius: 6, transition: "all .15s",
                    background: icon === e ? color + "22" : "transparent",
                    border: icon === e ? `1px solid ${color}55` : "1px solid transparent",
                    transform: icon === e ? "scale(1.08)" : "scale(1)",
                  }}
                >{e}</div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div className="field-label">Rang</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DEPT_COLOR_SWATCHES.map(c => (
                <div key={c} onClick={() => setColor(c)}
                  style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: c, cursor: "pointer",
                    border: color === c ? "3px solid var(--text)" : "2px solid transparent",
                    boxShadow: color === c ? `0 0 0 2px var(--bg), 0 4px 12px ${c}60` : `0 2px 6px ${c}40`,
                    transition: "all .15s",
                  }}
                  title={c}
                />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: 30, height: 30, padding: 0, border: "1px dashed var(--border)", borderRadius: 10, background: "var(--s2)", cursor: "pointer" }}
                title="Maxsus rang" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Bekor qilish</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saqlanmoqda..." : (mode === "create" ? "Bo'lim yaratish" : "Saqlash")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EmployeesPage — CEO xodimlarni boshqaradi
// ─────────────────────────────────────────────────────────────
function EmployeesPage({ push }) {
  const [list, setList] = useState([]);
  const [depts, setDepts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [createdPassword, setCreatedPassword] = useState(null); // {email, password}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, dp, tpl] = await Promise.all([
        EmployeesAPI.getAll(),
        DepartmentsAPI.getAll(),
        EmployeesAPI.getTemplates(),
      ]);
      setList(Array.isArray(emp) ? emp : []);
      setDepts(Array.isArray(dp) ? dp : []);
      setTemplates(tpl?.templates || []);
    } catch (e) {
      push(e.message || "Xodimlar yuklanmadi", "error");
    } finally { setLoading(false); }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  const block = async (e) => {
    if (!window.confirm(`"${e.name}" xodimini bloklaysizmi? U tizimga kira olmaydi.`)) return;
    try { await EmployeesAPI.block(e.id); push("Bloklandi", "ok"); load(); }
    catch (err) { push(err.message, "error"); }
  };
  const unblock = async (e) => {
    try { await EmployeesAPI.unblock(e.id); push("Aktivlashtirildi", "ok"); load(); }
    catch (err) { push(err.message, "error"); }
  };
  const reset = async (e) => {
    if (!window.confirm(`"${e.name}" parolini yangilaysizmi? U tizimdan chiqadi va yangi parol bilan kiradi.`)) return;
    try {
      const r = await EmployeesAPI.resetPassword(e.id, false);
      setCreatedPassword({ email: e.email, password: r.new_password });
    } catch (err) { push(err.message, "error"); }
  };
  const remove = async (e) => {
    const force = (e.source_count > 0 || e.report_count > 0);
    if (!window.confirm(`"${e.name}" xodimini BUTUNLAY o'chirishga ishonchingiz komilmi? Bu harakatni bekor qilib bo'lmaydi.`)) return;
    try {
      await EmployeesAPI.delete(e.id, true);
      push("O'chirildi", "ok"); load();
    } catch (err) { push(err.message, "error"); }
  };

  if (loading) return <div className="card"><div className="card-title">Xodimlar</div><SkeletonList count={4} /></div>;

  return (
    <>
      <div className="card">
        <div className="flex aic" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Xodimlar</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Kompaniyangiz xodimlari. Har biriga bo'lim va ruxsat sozlang.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: "create" })}
            disabled={depts.length === 0}>+ Yangi xodim</button>
        </div>

        {depts.length === 0 && (
          <div style={{ padding: 14, borderRadius: 10, background: "rgba(212,168,83,0.08)", border: "1px solid rgba(212,168,83,0.2)", color: "var(--gold)", fontSize: 12, marginBottom: 16 }}>
            Avval kamida bitta bo'lim yarating — xodimni bo'limga biriktirish uchun.
          </div>
        )}

        {list.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Hali xodim qo'shilmagan. Yuqoridagi tugmadan qo'shing.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--fh)" }}>Ism</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--fh)" }}>Bo'limlar</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--fh)" }}>Ruxsatlar</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--fh)" }}>Oxirgi kirish</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--fh)" }}>Harakatlar</th>
                </tr>
              </thead>
              <tbody>
                {list.map(e => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border)", opacity: e.active ? 1 : 0.5 }}>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontFamily: "var(--fh)", fontWeight: 600, color: "var(--text)" }}>{e.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{e.email}</div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(e.department_names || []).map((n, i) => (
                          <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--s3)", border: "1px solid var(--border)", color: "var(--text2)" }}>{n}</span>
                        ))}
                        {(!e.department_names || e.department_names.length === 0) && (
                          <span style={{ fontSize: 10, color: "var(--muted)" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {e.permissions?.can_add_sources && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(0,212,200,0.1)", color: "var(--teal)" }}>+manba</span>}
                        {e.permissions?.can_use_ai && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(212,168,83,0.1)", color: "var(--gold)" }}>AI {e.permissions?.ai_monthly_limit > 0 ? `(${e.permissions.ai_monthly_limit}/oy)` : ""}</span>}
                        {e.permissions?.can_export && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--s3)", color: "var(--text2)" }}>eksport</span>}
                        {e.permissions?.can_create_reports && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--s3)", color: "var(--text2)" }}>hisobot</span>}
                      </div>
                    </td>
                    <td style={{ padding: "12px", fontSize: 11, color: "var(--muted)" }}>
                      {e.last_login ? new Date(e.last_login).toLocaleDateString("uz-UZ") : "Hali kirmagan"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => setModal({ mode: "edit", emp: e })}>Tahrir</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => reset(e)}>Parol</button>
                        {e.active
                          ? <button className="btn btn-ghost btn-xs" style={{ color: "var(--gold)" }} onClick={() => block(e)}>Bloklash</button>
                          : <button className="btn btn-ghost btn-xs" style={{ color: "var(--green)" }} onClick={() => unblock(e)}>Aktivlash</button>
                        }
                        <button className="btn btn-danger btn-xs" onClick={() => remove(e)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <EmployeeModal
          mode={modal.mode}
          emp={modal.emp}
          departments={depts}
          templates={templates}
          onClose={() => setModal(null)}
          onSaved={(data) => {
            setModal(null); load();
            if (data?.initial_password) setCreatedPassword({ email: data.email, password: data.initial_password });
          }}
          push={push}
        />
      )}

      {createdPassword && (
        <PasswordDisplayModal
          email={createdPassword.email}
          password={createdPassword.password}
          onClose={() => setCreatedPassword(null)}
          push={push}
        />
      )}
    </>
  );
}

function EmployeeModal({ mode, emp, departments, templates, onClose, onSaved, push }) {
  const [name, setName] = useState(emp?.name || "");
  const [email, setEmail] = useState(emp?.email || "");
  const [selectedDepts, setSelectedDepts] = useState(emp?.department_ids || []);
  const [template, setTemplate] = useState("analyst");
  const [perms, setPerms] = useState(emp?.permissions || (templates.find(t => t.id === "analyst")?.permissions || {}));
  const [customPerms, setCustomPerms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customPerms) {
      const t = templates.find(x => x.id === template);
      if (t) setPerms(t.permissions);
    }
  }, [template, customPerms, templates]);

  const toggleDept = (id) => {
    setSelectedDepts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!name.trim()) { push("Ism kerak", "warn"); return; }
    if (mode === "create" && !email.trim()) { push("Email kerak", "warn"); return; }
    if (selectedDepts.length === 0) { push("Kamida 1 ta bo'lim tanlang", "warn"); return; }

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await EmployeesAPI.create({
          name: name.trim(),
          email: email.trim(),
          department_ids: selectedDepts,
          permissions: perms,
          template: customPerms ? undefined : template,
        });
        push(`"${name}" qo'shildi`, "ok");
        onSaved(res);
      } else {
        await EmployeesAPI.update(emp.id, {
          name: name.trim(),
          department_ids: selectedDepts,
          permissions: perms,
        });
        push("Yangilandi", "ok");
        onSaved(null);
      }
    } catch (e) { push(e.message, "error"); }
    finally { setSaving(false); }
  };

  const togglePerm = (key) => setPerms(p => ({ ...p, [key]: !p[key] }));

  const initials = (name.trim() || "?").split(" ").map(x => x.charAt(0)).slice(0, 2).join("").toUpperCase();
  const PERM_LIST = [
    { k: "can_add_sources",     l: "Manba qo'shish",        d: "Yangi ma'lumot manbasi ulash", ico: "➕" },
    { k: "can_delete_sources",  l: "Manba o'chirish",       d: "Mavjud manbani o'chirish",     ico: "🗑" },
    { k: "can_use_ai",          l: "AI dan foydalanish",    d: "AI chat, analiz, hisobot",     ico: "🤖" },
    { k: "can_export",          l: "Eksport qilish",        d: "PDF/Excel yuklab olish",       ico: "📤" },
    { k: "can_create_reports",  l: "Hisobot yaratish",      d: "Saqlangan hisobotlar",          ico: "📄" },
    { k: "can_invite_employees",l: "Xodim taklif qilish",   d: "Boshqa xodim qo'shish",        ico: "👥" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 600, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header — avatar preview bilan */}
        <div style={{
          padding: "24px 28px 22px",
          background: "linear-gradient(135deg, rgba(212,168,83,0.12) 0%, rgba(0,212,200,0.06) 100%)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 16, position: "relative",
        }}>
          <button className="modal-close" style={{ top: 14, right: 14 }} onClick={onClose}>×</button>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, var(--gold) 0%, var(--teal) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: "#0a0c14",
            boxShadow: "0 4px 16px rgba(212,168,83,0.3)",
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--fh)", fontSize: 19, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
              {mode === "create" ? "Yangi xodim" : "Xodimni tahrirlash"}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {name.trim() ? name : "Ism, bo'limlar va ruxsatlarni sozlang"}
              {mode === "create" && " · Parol avto-yaratiladi"}
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 28px 24px", maxHeight: "calc(90vh - 100px)", overflowY: "auto" }}>
          {/* Asosiy ma'lumot */}
          <div style={{ display: "grid", gridTemplateColumns: mode === "create" ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 18 }}>
            <div>
              <div className="field-label">Ism</div>
              <input className="field" value={name} onChange={e => setName(e.target.value)}
                placeholder="Azizbek Karimov" autoFocus />
            </div>
            {mode === "create" && (
              <div>
                <div className="field-label">Email</div>
                <input className="field" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="azizbek@company.uz" />
              </div>
            )}
          </div>

          {/* Bo'limlar */}
          <div style={{ marginBottom: 18 }}>
            <div className="field-label">
              Bo'limlar <span style={{ color: selectedDepts.length === 0 ? "var(--red)" : "var(--gold)", fontWeight: 700 }}>
                ({selectedDepts.length} tanlangan)
              </span>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--border)" }}>
              {departments.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: 16 }}>
                  Avval bo'lim yarating
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {departments.map(d => {
                    const on = selectedDepts.includes(d.id);
                    const c = d.color || "var(--teal)";
                    return (
                      <div key={d.id} onClick={() => toggleDept(d.id)}
                        style={{
                          padding: "8px 13px", borderRadius: 10,
                          border: `1px solid ${on ? c : "var(--border)"}`,
                          background: on ? `${c}15` : "var(--s3)",
                          cursor: "pointer", fontSize: 12, fontFamily: "var(--fh)",
                          color: on ? c : "var(--text2)",
                          transition: "all .15s",
                          display: "flex", alignItems: "center", gap: 7,
                          boxShadow: on ? `0 2px 8px ${c}20` : "none",
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{d.icon || "📁"}</span>
                        <span style={{ fontWeight: on ? 700 : 500 }}>{d.name}</span>
                        {on && <span style={{
                          width: 16, height: 16, borderRadius: "50%", background: c,
                          color: "#0a0c14", fontSize: 10, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Ruxsatlar shabloni */}
          <div style={{ marginBottom: 18 }}>
            <div className="field-label">Ruxsatlar shabloni</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: customPerms ? 12 : 0 }}>
              {templates.map(t => {
                const active = template === t.id && !customPerms;
                const ico = t.id === "viewer" ? "👁" : t.id === "analyst" ? "📊" : "⭐";
                return (
                  <div key={t.id}
                    onClick={() => { setTemplate(t.id); setCustomPerms(false); }}
                    style={{
                      padding: "12px 10px", borderRadius: 12,
                      border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
                      background: active ? "rgba(212,168,83,0.08)" : "var(--s2)",
                      cursor: "pointer", fontSize: 12, fontFamily: "var(--fh)",
                      textAlign: "center", transition: "all .15s",
                      boxShadow: active ? "0 4px 16px rgba(212,168,83,0.15)" : "none",
                      position: "relative",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{ico}</div>
                    <div style={{ fontWeight: 800, color: active ? "var(--gold)" : "var(--text)", fontSize: 12 }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>{t.description}</div>
                    {active && <div style={{ position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "var(--gold)", color: "#0a0c14", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                  </div>
                );
              })}
              <div onClick={() => setCustomPerms(true)}
                style={{
                  padding: "12px 10px", borderRadius: 12,
                  border: `1px dashed ${customPerms ? "var(--gold)" : "var(--border)"}`,
                  background: customPerms ? "rgba(212,168,83,0.08)" : "var(--s2)",
                  cursor: "pointer", fontSize: 12, fontFamily: "var(--fh)",
                  textAlign: "center", transition: "all .15s",
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 6 }}>⚙</div>
                <div style={{ fontWeight: 800, color: customPerms ? "var(--gold)" : "var(--text)", fontSize: 12 }}>Maxsus</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Qo'lda sozlash</div>
                {customPerms && <div style={{ position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "var(--gold)", color: "#0a0c14", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
              </div>
            </div>

            {customPerms && (
              <div style={{ padding: 14, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {PERM_LIST.map(p => {
                    const on = !!perms[p.k];
                    return (
                      <div key={p.k} onClick={() => togglePerm(p.k)}
                        style={{
                          padding: "10px 12px", borderRadius: 10,
                          border: `1px solid ${on ? "var(--teal)" : "var(--border)"}`,
                          background: on ? "rgba(0,212,200,0.06)" : "var(--s3)",
                          cursor: "pointer", transition: "all .15s",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: on ? "rgba(0,212,200,0.15)" : "var(--s4)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, flexShrink: 0,
                        }}>{p.ico}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontFamily: "var(--fh)", fontWeight: 600, color: on ? "var(--teal)" : "var(--text)" }}>{p.l}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{p.d}</div>
                        </div>
                        <div style={{
                          width: 32, height: 18, borderRadius: 10, background: on ? "var(--teal)" : "var(--s4)",
                          border: `1px solid ${on ? "var(--teal)" : "var(--border)"}`,
                          position: "relative", flexShrink: 0, transition: "all .15s",
                        }}>
                          <div style={{
                            position: "absolute", top: 1, left: on ? 15 : 1,
                            width: 14, height: 14, borderRadius: "50%",
                            background: on ? "#0a0c14" : "var(--muted)",
                            transition: "all .15s",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--s3)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 14 }}>🎯</div>
                  <div style={{ flex: 1, fontSize: 12, fontFamily: "var(--fh)", color: "var(--text)" }}>AI oylik limit</div>
                  <input type="number" className="field" style={{ width: 100, padding: "4px 10px", fontSize: 12 }}
                    value={perms.ai_monthly_limit ?? 100}
                    onChange={e => setPerms(p => ({ ...p, ai_monthly_limit: parseInt(e.target.value) || 0 }))} />
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>-1 = cheksiz</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Bekor qilish</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saqlanmoqda..." : (mode === "create" ? "Xodim qo'shish" : "Saqlash")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Parol ko'rsatish modali — xodim/CEO yaratilgach yoki reset qilingach
function PasswordDisplayModal({ email, password, onClose, push }) {
  const [copied, setCopied] = useState(false);
  const [passCopied, setPassCopied] = useState(false);
  const copyAll = () => {
    navigator.clipboard.writeText(`Login: ${email}\nParol: ${password}`);
    setCopied(true);
    push("Login va parol nusxalandi", "ok");
    setTimeout(() => setCopied(false), 2000);
  };
  const copyPass = () => {
    navigator.clipboard.writeText(password);
    setPassCopied(true);
    setTimeout(() => setPassCopied(false), 2000);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 500, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Success header */}
        <div style={{
          padding: "22px 28px 20px",
          background: "linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(0,212,200,0.06) 100%)",
          borderBottom: "1px solid rgba(52,211,153,0.2)",
          display: "flex", alignItems: "center", gap: 14, position: "relative",
        }}>
          <button className="modal-close" style={{ top: 14, right: 14 }} onClick={onClose}>×</button>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--green), #10B981)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, color: "#0a0c14", fontWeight: 900,
            boxShadow: "0 4px 16px rgba(52,211,153,0.3)",
          }}>✓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
              Parol tayyor
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
              Foydalanuvchiga bir martagina ko'rinadi — <strong style={{ color: "var(--gold)" }}>hozir nusxalang</strong>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 28px 24px" }}>
          {/* Login row */}
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--s2)", border: "1px solid var(--border)", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,212,200,0.1)", border: "1px solid rgba(0,212,200,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📧</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 }}>Login (email)</div>
              <div style={{ fontFamily: "var(--fm)", fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
            </div>
          </div>

          {/* Password row */}
          <div style={{ padding: "14px 16px", borderRadius: 12,
            background: "linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(212,168,83,0.03) 100%)",
            border: "1px solid rgba(212,168,83,0.25)", marginBottom: 18,
            display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(212,168,83,0.15)", border: "1px solid rgba(212,168,83,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🔐</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 3 }}>Parol</div>
              <div style={{ fontFamily: "var(--fm)", fontSize: 20, color: "var(--gold)", fontWeight: 800, letterSpacing: 3 }}>{password}</div>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={copyPass} style={{ flexShrink: 0 }}>
              {passCopied ? "✓" : "📋"}
            </button>
          </div>

          {/* Warning */}
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(212,168,83,0.06)", border: "1px solid rgba(212,168,83,0.15)", marginBottom: 18,
            fontSize: 11, color: "var(--text2)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span>Modal yopilgandan keyin parol qayta ko'rinmaydi. Xavfsiz joyga saqlang.</span>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Yopish</button>
            <button className="btn btn-primary" onClick={copyAll}>
              {copied ? "✓ Nusxalandi" : "Login + Parol nusxalash"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OrganizationSettingsPage — tashkilot ma'lumotlari (CEO)
// ─────────────────────────────────────────────────────────────
function OrganizationSettingsPage({ orgInfo, push, onChange }) {
  const [name, setName] = useState(orgInfo?.name || "");
  const [color, setColor] = useState(orgInfo?.color || "#00C9BE");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(orgInfo?.name || "");
    setColor(orgInfo?.color || "#00C9BE");
  }, [orgInfo]);

  const save = async () => {
    if (!name.trim()) { push("Tashkilot nomi kerak", "warn"); return; }
    setSaving(true);
    try {
      // CEO hozir o'z tashkilotini o'zgartira olmaydi (backend yo'q)
      // Super-admin panelidan o'tkaziladi. Shu sababli uchun tooltip.
      push("Tashkilot nomini o'zgartirish uchun super-admin bilan bog'laning", "info");
    } catch (e) { push(e.message, "error"); }
    finally { setSaving(false); }
  };

  if (!orgInfo) return null;
  const subLeft = orgInfo.subscription_until
    ? Math.max(0, Math.round((new Date(orgInfo.subscription_until) - Date.now()) / (24 * 3600 * 1000)))
    : null;

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 4 }}>Tashkilot</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
        Sizning kompaniyangiz haqida ma'lumot
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ padding: 16, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 2 }}>Tashkilot nomi</div>
          <div style={{ fontSize: 16, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--text)" }}>{orgInfo.name}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 2 }}>Obuna muddati</div>
          <div style={{ fontSize: 16, fontFamily: "var(--fh)", fontWeight: 700, color: subLeft === null ? "var(--text)" : subLeft < 14 ? "var(--red)" : subLeft < 30 ? "var(--gold)" : "var(--green)" }}>
            {subLeft === null ? "Cheksiz" : subLeft === 0 ? "Tugagan" : `${subLeft} kun qoldi`}
          </div>
          {orgInfo.subscription_until && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              {new Date(orgInfo.subscription_until).toLocaleDateString("uz-UZ")}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted)", padding: "12px 14px", background: "var(--s2)", borderRadius: 10, border: "1px solid var(--border)" }}>
        💡 Tashkilot nomi, logo yoki obuna muddatini o'zgartirish uchun tizim administratori (Shonazar) bilan bog'laning.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SidebarDropdown — shadcn-style expand/collapse (chevron bilan)
//   title: gruh nomi (masalan "Tahlil" yoki bo'lim nomi)
//   icon:  bo'lim ikonkasi (ixtiyoriy)
//   color: aktiv rang (bo'lim rangi yoki gold)
//   open:  ochiq/yopiq
//   onToggle: toggle callback
//   active: gruh faol ekanini ko'rsatish (masalan, ichida page aktiv bo'lsa)
//   children: ichki sub-items
// ─────────────────────────────────────────────────────────────
// Shadcn-style dropdown — standart .ni.active uslubini meros qilib oladi
// Bosish: ochadi/yopadi va onHeaderClick ni chaqiradi (kontekstni belgilash uchun)
function SidebarDropdown({ title, open, onClick, active, rightBadge, children }) {
  return (
    <div>
      <div
        className={`ni ${active ? "active" : ""}`}
        onClick={onClick}
        style={{ userSelect: "none" }}
      >
        <span style={{ flex: 1 }}>{title}</span>
        {rightBadge}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform .2s var(--ease)", transform: open ? "rotate(90deg)" : "rotate(0deg)", opacity: 0.55 }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      {open && (
        <div style={{ padding: "2px 0 4px 0", display: "flex", flexDirection: "column", gap: 1 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Sub-item (dropdown ichida) — ni.active standart uslubini ishlatadi
function SidebarSubItem({ label, active, onClick, badge }) {
  return (
    <div onClick={onClick}
      className={`ni ${active ? "active" : ""}`}
      style={{ paddingLeft: 26, fontSize: 12.5 }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {badge}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CeoSettingsPage — Bo'limlar + Xodimlar + Tashkilot bir sahifada (tabs)
// ─────────────────────────────────────────────────────────────
function CeoSettingsPage({ push, orgInfo, onChange }) {
  const [tab, setTab] = useState("departments"); // departments | employees | org

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {[
          { id: "departments", label: "Bo'limlar" },
          { id: "employees", label: "Xodimlar" },
          { id: "org", label: "Tashkilot" },
        ].map(t => (
          <div key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px", cursor: "pointer",
              fontFamily: "var(--fh)", fontSize: 13, fontWeight: 600,
              color: tab === t.id ? "var(--gold)" : "var(--muted)",
              borderBottom: `2px solid ${tab === t.id ? "var(--gold)" : "transparent"}`,
              marginBottom: -1,
              transition: "all .15s",
            }}
          >{t.label}</div>
        ))}
      </div>

      {tab === "departments" && <DepartmentsPage push={push} onChange={onChange} />}
      {tab === "employees" && <EmployeesPage push={push} />}
      {tab === "org" && <OrganizationSettingsPage orgInfo={orgInfo} push={push} onChange={onChange} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SuperAdminPanel — tashkilotlarni boshqarish (Shonazar)
// ─────────────────────────────────────────────────────────────
function SuperAdminPanel({ push, currentUser, onEnter }) {
  const [orgs, setOrgs] = useState([]);
  const [stats, setStats] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | {mode:'create'} | {mode:'detail', org}
  const [createdCeo, setCreatedCeo] = useState(null);
  const [planModalOrg, setPlanModalOrg] = useState(null);
  const [expandedOrg, setExpandedOrg] = useState(null); // org id
  const [orgDetails, setOrgDetails] = useState({}); // cache {orgId: detail}
  const [sortBy, setSortBy] = useState("recent"); // recent | name | revenue | users

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, s, a] = await Promise.all([
        SuperAdminAPI.getOrganizations(search || null),
        SuperAdminAPI.getStats(),
        SuperAdminAPI.getAuditLog({ limit: 20 }).catch(() => ({ rows: [] })),
      ]);
      setOrgs(Array.isArray(o) ? o : []);
      setStats(s);
      setAuditLog(a?.rows || []);
    } catch (e) { push(e.message || "Yuklanmadi", "error"); }
    finally { setLoading(false); }
  }, [push, search]);

  const toggleOrgExpand = async (orgId) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
      return;
    }
    setExpandedOrg(orgId);
    if (!orgDetails[orgId]) {
      try {
        const detail = await SuperAdminAPI.getOrganization(orgId);
        setOrgDetails(prev => ({ ...prev, [orgId]: detail }));
      } catch (e) { push(e.message, "error"); }
    }
  };

  // Sortlangan tashkilotlar
  const sortedOrgs = [...orgs].sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    if (sortBy === "users") return (b.employee_count || 0) - (a.employee_count || 0);
    if (sortBy === "sources") return (b.source_count || 0) - (a.source_count || 0);
    if (sortBy === "rows") return (Number(b.total_rows) || 0) - (Number(a.total_rows) || 0);
    // recent (default)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  useEffect(() => { load(); }, [load]);

  const extend = async (org, months) => {
    try {
      await SuperAdminAPI.extendSubscription(org.id, months);
      push(`"${org.name}" obunasi ${months} oyga uzaytirildi`, "ok");
      load();
    } catch (e) { push(e.message, "error"); }
  };
  const block = async (org) => {
    if (!window.confirm(`"${org.name}" tashkilotini bloklaysizmi? Foydalanuvchilar kira olmaydi.`)) return;
    try { await SuperAdminAPI.block(org.id); push("Bloklandi", "ok"); load(); }
    catch (e) { push(e.message, "error"); }
  };
  const unblock = async (org) => {
    try { await SuperAdminAPI.unblock(org.id); push("Aktivlashtirildi", "ok"); load(); }
    catch (e) { push(e.message, "error"); }
  };
  const resetCeoPass = async (org) => {
    if (!window.confirm(`"${org.name}" CEO parolini yangilaysizmi?`)) return;
    try {
      const r = await SuperAdminAPI.resetCeoPassword(org.id);
      setCreatedCeo({ email: org.ceo?.email, password: r.new_password, org: org.name });
    } catch (e) { push(e.message, "error"); }
  };
  const remove = async (org) => {
    if (!window.confirm(`"${org.name}" tashkilotini BUTUNLAY o'chirishga ishonchingiz komilmi? Barcha ma'lumot (xodim, manba) yo'qoladi!`)) return;
    try { await SuperAdminAPI.delete(org.id, true); push("O'chirildi", "ok"); load(); }
    catch (e) { push(e.message, "error"); }
  };

  if (loading) return <div style={{ padding: 20 }}><SkeletonCards count={6} height={120} /></div>;

  // Plan taqsimoti (stats'dan)
  const planStats = stats?.by_plan || {};
  const totalUsersForPlan = Object.values(planStats).reduce((a, b) => a + b, 0) || 1;

  // Obuna tugash holati
  const expiringCount = orgs.filter(o => {
    if (!o.subscription_until) return false;
    const d = Math.round((new Date(o.subscription_until) - Date.now()) / (24 * 3600 * 1000));
    return d >= 0 && d < 14;
  }).length;
  const expiredCount = orgs.filter(o => {
    if (!o.subscription_until) return false;
    return new Date(o.subscription_until) < Date.now();
  }).length;
  const blockedCount = orgs.filter(o => !o.active).length;

  return (
    <>
      {/* ═════ PLATFORMA STATISTIKASI (kengaytirilgan) ═════ */}
      {stats && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Platforma holati</div>

          {/* Asosiy KPI'lar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[
              { l: "Tashkilotlar", v: stats.total_organizations, c: "var(--teal)", sub: `${blockedCount} bloklangan` },
              { l: "Foydalanuvchilar", v: stats.total_users, c: "var(--gold)", sub: `${stats.active_users_7d} aktiv (7k)` },
              { l: "Manbalar", v: stats.total_sources, c: "var(--green)" },
              { l: "Jami qatorlar", v: (stats.total_data_rows || 0).toLocaleString(), c: "var(--text)" },
              { l: "Obuna tugashi", v: expiringCount + expiredCount, c: expiredCount > 0 ? "var(--red)" : "var(--gold)", sub: `${expiredCount} tugadi · ${expiringCount} 14 kun` },
              { l: "CEO'lar", v: stats.by_role?.ceo || 0, c: "#A78BFA" },
              { l: "Xodimlar", v: stats.by_role?.employee || 0, c: "#06B6D4" },
              { l: "Super admin", v: stats.by_role?.super_admin || 0, c: "#EC4899" },
            ].map((s, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.5 }}>{s.l}</div>
                <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: s.c, marginTop: 3 }}>{s.v}</div>
                {s.sub && <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Plan taqsimoti — progress bars */}
          <div style={{ padding: 12, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Tariflar taqsimoti</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {["free", "starter", "pro", "enterprise"].map(p => {
                const P = PLANS[p];
                const count = planStats[p] || 0;
                const pct = Math.round((count / totalUsersForPlan) * 100);
                return (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 80, fontSize: 11, fontFamily: "var(--fh)", fontWeight: 600, color: P.color }}>{P.nameUz}</div>
                    <div style={{ flex: 1, height: 8, background: "var(--s3)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: P.color, borderRadius: 4, transition: "width .3s" }} />
                    </div>
                    <div style={{ width: 60, textAlign: "right", fontSize: 11, fontFamily: "var(--fm)", color: "var(--text2)" }}>
                      <strong style={{ color: P.color }}>{count}</strong> <span style={{ color: "var(--muted)" }}>({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═════ TASHKILOTLAR RO'YXATI (expandable) ═════ */}
      <div className="card">
        <div className="flex aic" style={{ justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Tashkilotlar ({orgs.length})</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Bosing → xodimlar, bo'limlar, batafsil ma'lumot ko'rinadi
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input className="field" style={{ padding: "6px 12px", fontSize: 12, width: 200 }}
              placeholder="Qidirish: nom yoki email..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="field" style={{ padding: "6px 10px", fontSize: 11, width: 150 }}
              value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="recent">Eng yangi</option>
              <option value="name">Alifbo bo'yicha</option>
              <option value="users">Xodimlar soni</option>
              <option value="sources">Manbalar soni</option>
              <option value="rows">Ma'lumot soni</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: "create" })}>+ Yangi tashkilot</button>
          </div>
        </div>

        {sortedOrgs.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Tashkilot topilmadi
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            {sortedOrgs.map(org => {
              const subLeft = org.subscription_until
                ? Math.max(0, Math.round((new Date(org.subscription_until) - Date.now()) / (24 * 3600 * 1000)))
                : null;
              const subColor = subLeft === null ? "var(--text)" : subLeft === 0 ? "var(--red)" : subLeft < 14 ? "var(--red)" : subLeft < 30 ? "var(--gold)" : "var(--green)";
              const isExpanded = expandedOrg === org.id;
              const detail = orgDetails[org.id];
              return (
                <div key={org.id} style={{
                  borderRadius: 12,
                  border: `1px solid ${isExpanded ? (org.color || "var(--teal)") + "40" : org.active ? "var(--border)" : "rgba(248,113,113,0.3)"}`,
                  background: org.active ? "var(--s2)" : "rgba(248,113,113,0.05)",
                  overflow: "hidden", transition: "all .15s",
                }}>
                  {/* HEADER (doim ko'rinadi) */}
                  <div style={{
                    padding: 14, display: "grid",
                    gridTemplateColumns: "20px 44px 1fr auto auto", gap: 12, alignItems: "center",
                    cursor: "pointer",
                  }} onClick={() => toggleOrgExpand(org.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round"
                      style={{ transition: "transform .2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: `${org.color || "var(--teal)"}20`,
                      border: `1px solid ${org.color || "var(--teal)"}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: org.color || "var(--teal)",
                    }}>{org.name?.charAt(0).toUpperCase() || "?"}</div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{org.name}</div>
                        {org.ceo?.plan && (() => {
                          const P = PLANS[org.ceo.plan] || PLANS.free;
                          return (
                            <span onClick={(e) => { e.stopPropagation(); setPlanModalOrg(org); }}
                              style={{
                                fontSize: 10, padding: "2px 9px", borderRadius: 10,
                                background: P.color + "15", color: P.color, border: `1px solid ${P.color}30`,
                                fontWeight: 700, cursor: "pointer",
                              }}
                              title="Tarifni o'zgartirish"
                            >{P.nameUz || P.name}</span>
                          );
                        })()}
                        {!org.active && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(248,113,113,0.15)", color: "var(--red)", fontWeight: 600 }}>BLOKLANGAN</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                        {org.ceo?.email || "—"} · {org.employee_count || 0} xodim · {org.source_count || 0} manba · {(Number(org.total_rows) || 0).toLocaleString()} qator
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontSize: 11, fontFamily: "var(--fm)" }}>
                      <div style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, fontSize: 9 }}>Obuna</div>
                      <div style={{ color: subColor, fontWeight: 700, marginTop: 2 }}>
                        {subLeft === null ? "Cheksiz" : subLeft === 0 ? "Tugagan" : `${subLeft} kun`}
                      </div>
                    </div>

                    <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button className="btn btn-primary btn-xs" onClick={() => onEnter && onEnter(org.id, org.name)} title="Bu tashkilotga CEO sifatida kirish">
                        Kirish
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setPlanModalOrg(org)}>Tarif</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => extend(org, 1)}>+1 oy</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => extend(org, 12)}>+1 yil</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => resetCeoPass(org)}>Parol</button>
                      {org.active
                        ? <button className="btn btn-ghost btn-xs" style={{ color: "var(--gold)" }} onClick={() => block(org)}>Block</button>
                        : <button className="btn btn-ghost btn-xs" style={{ color: "var(--green)" }} onClick={() => unblock(org)}>Aktiv</button>
                      }
                      <button className="btn btn-danger btn-xs" onClick={() => remove(org)}>×</button>
                    </div>
                  </div>

                  {/* KENGAYGAN QISM — xodimlar va bo'limlar */}
                  {isExpanded && (
                    <div style={{ padding: "0 14px 14px 44px", borderTop: "1px solid var(--border)", background: "var(--s1)" }}>
                      {!detail ? (
                        <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--muted)" }}>Yuklanmoqda...</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, paddingTop: 14 }}>
                          {/* Xodimlar */}
                          <div>
                            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                              Foydalanuvchilar ({detail.members?.length || 0})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {(detail.members || []).map(m => {
                                const roleColor = m.role === "ceo" ? "var(--gold)" : m.role === "super_admin" ? "#EC4899" : m.role === "employee" ? "var(--teal)" : "var(--muted)";
                                return (
                                  <div key={m.id} style={{
                                    padding: "8px 10px", borderRadius: 8,
                                    background: "var(--s2)", border: "1px solid var(--border)",
                                    display: "flex", alignItems: "center", gap: 10,
                                    opacity: m.active ? 1 : 0.55,
                                  }}>
                                    <div style={{
                                      width: 28, height: 28, borderRadius: 7,
                                      background: roleColor + "15", border: `1px solid ${roleColor}30`,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      fontFamily: "var(--fh)", fontSize: 11, fontWeight: 800, color: roleColor,
                                    }}>{(m.name || "?").charAt(0).toUpperCase()}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {m.name}
                                      </div>
                                      <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                                    </div>
                                    <span style={{
                                      fontSize: 9, padding: "1px 7px", borderRadius: 10,
                                      background: roleColor + "15", color: roleColor, border: `1px solid ${roleColor}30`,
                                      fontFamily: "var(--fh)", fontWeight: 600, textTransform: "uppercase",
                                    }}>{m.role}</span>
                                    {!m.active && <span style={{ fontSize: 9, color: "var(--red)" }}>✕</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Bo'limlar */}
                          <div>
                            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                              Bo'limlar ({detail.departments?.length || 0})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {(detail.departments || []).map(d => (
                                <div key={d.id} style={{
                                  padding: "8px 10px", borderRadius: 8,
                                  background: "var(--s2)", border: "1px solid var(--border)",
                                  display: "flex", alignItems: "center", gap: 10,
                                }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 7,
                                    background: (d.color || "var(--teal)") + "15", border: `1px solid ${d.color || "var(--teal)"}30`,
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                                  }}>{d.icon || "📁"}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{d.name}</div>
                                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{d.emp_count || 0} xodim · {d.src_count || 0} manba</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═════ AUDIT LOG (oxirgi harakatlar) ═════ */}
      {auditLog.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="flex aic jb mb10">
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>Oxirgi harakatlar</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Platforma bo'ylab so'nggi {auditLog.length} ta harakat</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {auditLog.slice(0, 10).map(a => {
              const colors = {
                create_organization: "var(--green)", delete_organization: "var(--red)",
                block_organization: "var(--gold)", unblock_organization: "var(--green)",
                extend_subscription: "var(--teal)", change_plan: "var(--gold)",
                reset_ceo_password: "#EC4899", update_organization: "var(--teal)",
                create_department: "var(--teal)", delete_department: "var(--red)",
                create_employee: "var(--green)", delete_employee: "var(--red)",
                reset_password: "#EC4899", block_employee: "var(--gold)", unblock_employee: "var(--green)",
              };
              const c = colors[a.action] || "var(--muted)";
              const when = a.created_at ? new Date(a.created_at) : null;
              const minAgo = when ? Math.round((Date.now() - when.getTime()) / 60000) : 0;
              const timeStr = minAgo < 60 ? `${minAgo} daq oldin` : minAgo < 1440 ? `${Math.round(minAgo / 60)} soat oldin` : `${Math.round(minAgo / 1440)} kun oldin`;
              return (
                <div key={a.id} style={{
                  padding: "8px 12px", borderRadius: 8, background: "var(--s2)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ width: 3, height: 22, borderRadius: 2, background: c }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--text)" }}>
                      <span style={{ fontFamily: "var(--fh)", fontWeight: 600, color: c }}>{a.action}</span>
                      {a.organization_name && <span style={{ color: "var(--muted)" }}> · {a.organization_name}</span>}
                      {a.user_name && <span style={{ color: "var(--muted)" }}> · {a.user_name}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--fm)" }}>{timeStr}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal?.mode === "create" && (
        <CreateOrganizationModal
          onClose={() => setModal(null)}
          onSaved={(res) => { setModal(null); load(); setCreatedCeo({ email: res.ceo.email, password: res.initial_password, org: res.name }); }}
          push={push}
        />
      )}

      {createdCeo && (
        <PasswordDisplayModal
          email={createdCeo.email}
          password={createdCeo.password}
          onClose={() => setCreatedCeo(null)}
          push={push}
        />
      )}

      {planModalOrg && (
        <PlanChangeModal
          org={planModalOrg}
          onClose={() => setPlanModalOrg(null)}
          onSaved={() => { setPlanModalOrg(null); load(); }}
          push={push}
        />
      )}
    </>
  );
}

// Tarif o'zgartirish modali
function PlanChangeModal({ org, onClose, onSaved, push }) {
  const [plan, setPlan] = useState(org?.ceo?.plan || "free");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await SuperAdminAPI.changePlan(org.id, plan);
      push(`"${org.name}" tarifi: ${PLANS[plan].nameUz || PLANS[plan].name}`, "ok");
      onSaved();
    } catch (e) { push(e.message, "error"); }
    finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 480, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: "22px 28px 20px",
          background: "linear-gradient(135deg, rgba(212,168,83,0.1) 0%, rgba(212,168,83,0.03) 100%)",
          borderBottom: "1px solid var(--border)",
          position: "relative",
        }}>
          <button className="modal-close" style={{ top: 14, right: 14 }} onClick={onClose}>×</button>
          <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
            Tarifni o'zgartirish
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            "{org.name}" — tashkilotning hamma xodimlariga amal qiladi
          </div>
        </div>
        <div style={{ padding: "16px 22px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {["free", "starter", "pro", "enterprise"].map(p => {
              const P = PLANS[p];
              const active = plan === p;
              return (
                <div key={p} onClick={() => setPlan(p)}
                  style={{
                    padding: "12px 14px", borderRadius: 10,
                    border: `1px solid ${active ? P.color : "var(--border)"}`,
                    background: active ? P.color + "10" : "var(--s2)",
                    cursor: "pointer", transition: "all .15s",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%",
                    border: `2px solid ${active ? P.color : "var(--border)"}`,
                    background: active ? P.color : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0a0c14" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: active ? P.color : "var(--text)" }}>
                      {P.nameUz || P.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                      {P.limits.ai_requests === -1 ? "Cheksiz AI" : `${P.limits.ai_requests} AI/oy`}
                      {" · "}
                      {P.limits.connectors === -1 ? "Cheksiz manba" : `${P.limits.connectors} manba`}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 800, color: active ? P.color : "var(--text2)" }}>
                    {P.price_monthly === 0 ? "Bepul" : `${(P.price_monthly / 1000).toFixed(0)}K/oy`}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Bekor qilish</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saqlanmoqda..." : "O'zgartirish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateOrganizationModal({ onClose, onSaved, push }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#00C9BE");
  const [ceoName, setCeoName] = useState("");
  const [ceoEmail, setCeoEmail] = useState("");
  const [ceoPassword, setCeoPassword] = useState("");
  const [months, setMonths] = useState(12);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !ceoName.trim() || !ceoEmail.trim()) {
      push("Tashkilot nomi, CEO ism va email kerak", "warn"); return;
    }
    setSaving(true);
    try {
      const res = await SuperAdminAPI.createOrganization({
        name: name.trim(),
        color,
        ceo_name: ceoName.trim(),
        ceo_email: ceoEmail.trim().toLowerCase(),
        ceo_password: ceoPassword || undefined,
        subscription_months: months,
      });
      push(`"${name}" yaratildi`, "ok");
      onSaved(res);
    } catch (e) { push(e.message, "error"); }
    finally { setSaving(false); }
  };

  const ORG_SWATCHES = ["#00C9BE", "#3B82F6", "#10B981", "#F59E0B", "#A78BFA", "#EC4899", "#EF4444", "#06B6D4", "#8B5CF6", "#14B8A6"];
  const orgInitial = (name.trim() || "?").charAt(0).toUpperCase();
  const monthPresets = [3, 6, 12, 24];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 560, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header — org preview bilan */}
        <div style={{
          padding: "24px 28px 22px",
          background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
          borderBottom: `1px solid ${color}25`,
          display: "flex", alignItems: "center", gap: 16, position: "relative",
        }}>
          <button className="modal-close" style={{ top: 14, right: 14 }} onClick={onClose}>×</button>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: `linear-gradient(135deg, ${color} 0%, ${color}aa 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--fh)", fontSize: 24, fontWeight: 900, color: "#0a0c14",
            boxShadow: `0 4px 20px ${color}55`,
          }}>{orgInitial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--fh)", fontSize: 19, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
              Yangi tashkilot
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {name.trim() ? <>Mijoz: <strong style={{ color: "var(--text2)" }}>{name}</strong></> : "Mijoz kompaniyasi yaratish"}
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 28px 24px", maxHeight: "calc(90vh - 100px)", overflowY: "auto" }}>
          {/* Tashkilot bloki */}
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(212,168,83,0.15)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🏢</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Tashkilot ma'lumotlari</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="field-label">Tashkilot nomi</div>
              <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Shonazar Group" autoFocus />
            </div>

            <div>
              <div className="field-label">Brend rangi</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {ORG_SWATCHES.map(c => (
                  <div key={c} onClick={() => setColor(c)}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: c, cursor: "pointer",
                      border: color === c ? "3px solid var(--text)" : "2px solid transparent",
                      boxShadow: color === c ? `0 0 0 2px var(--bg), 0 4px 12px ${c}60` : `0 2px 6px ${c}40`,
                      transition: "all .15s",
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* CEO bloki */}
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(0,212,200,0.15)", border: "1px solid rgba(0,212,200,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>👤</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>CEO (Rahbar)</div>
              <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>to'liq huquqli foydalanuvchi</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div className="field-label">Ism</div>
                <input className="field" value={ceoName} onChange={e => setCeoName(e.target.value)} placeholder="Azizbek Karimov" />
              </div>
              <div>
                <div className="field-label">Email</div>
                <input className="field" type="email" value={ceoEmail} onChange={e => setCeoEmail(e.target.value)} placeholder="ceo@company.uz" />
              </div>
            </div>

            <div>
              <div className="field-label">Parol (ixtiyoriy — bo'sh qoldirsangiz avto yaratiladi)</div>
              <input className="field" value={ceoPassword} onChange={e => setCeoPassword(e.target.value)} placeholder="Avto-generatsiya uchun bo'sh qoldiring" />
            </div>
          </div>

          {/* Obuna muddati */}
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: "var(--s2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>📅</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Obuna muddati</div>
              <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>{months} oy · {new Date(Date.now() + months * 30 * 24 * 3600 * 1000).toLocaleDateString("uz-UZ")} gacha</span>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {monthPresets.map(m => (
                <div key={m} onClick={() => setMonths(m)}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: 10,
                    border: `1px solid ${months === m ? "var(--green)" : "var(--border)"}`,
                    background: months === m ? "rgba(52,211,153,0.08)" : "var(--s3)",
                    cursor: "pointer", textAlign: "center",
                    fontFamily: "var(--fh)", fontSize: 12, fontWeight: 700,
                    color: months === m ? "var(--green)" : "var(--text2)",
                    transition: "all .15s",
                  }}
                >{m} oy</div>
              ))}
            </div>

            <input type="number" min={1} max={120} className="field" style={{ fontSize: 12 }}
              value={months} onChange={e => setMonths(Math.max(1, Math.min(120, parseInt(e.target.value) || 12)))}
              placeholder="Maxsus (oy)" />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Bekor qilish</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Yaratilmoqda..." : "Tashkilot yaratish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
// Sidebar top (doim ko'rinadi, iconkasiz)
const TOP_ITEMS = [
  { id: "dashboard", lbl: "Bosh sahifa" },
  { id: "datahub",   lbl: "Manbalar", badge: "sources" },
];

// Har dropdown (CEO, bo'limlar) ichidagi sub-sahifalar (iconkasiz)
const WORKSPACE_ITEMS = [
  { id: "chat",      lbl: "AI Maslahat" },
  { id: "charts",    lbl: "Grafiklar" },
  { id: "analytics", lbl: "Tahlil" },
  { id: "reports",   lbl: "Hisobotlar" },
  { id: "alerts",    lbl: "Ogohlantirishlar", badge: "alerts" },
];

// Boshqaruv (pastda) — ceoOnly: faqat CEO/super_admin ko'radi
const NAV = [
  { id: "settings", lbl: "Sozlamalar", group: "boshqaruv", ceoOnly: true },
];

// ── SKELETON LOADER — yuklash animatsiyasi ──
function SkeletonCards({ count = 3, height = 80 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="sk" style={{ height, borderRadius: 14 }} />
      ))}
    </div>
  );
}
function SkeletonList({ count = 4 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "16px 0" }}>
      <div className="sk sk-circle" />
      <div style={{ flex: 1 }}>
        <div className="sk sk-line w60" />
        <div className="sk sk-line w40" style={{ marginBottom: 0 }} />
      </div>
    </div>
  ));
}

// ── ERROR BOUNDARY — xato bo'lganda oq ekran o'rniga xabar ──
import { Component } from "react";
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(err, info) { console.error("[ErrorBoundary]", err, info); }
  render() {
    if (this.state.hasError) return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#05060C", color: "#E8ECF4", fontFamily: "Inter, sans-serif", padding: 32 }}>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>⚠</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Kutilmagan xato yuz berdi</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 24, lineHeight: 1.7 }}>
            Tizimda kutilmagan xato bo'ldi. Sahifani qayta yuklashni sinab ko'ring.
          </div>
          <div style={{ fontSize: 11, color: "#475569", background: "#0A0C15", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, textAlign: "left", maxHeight: 100, overflow: "auto", fontFamily: "monospace" }}>
            {this.state.error?.message || "Noma'lum xato"}
          </div>
          <button onClick={() => window.location.reload()} style={{ background: "linear-gradient(135deg, #00D4C8, #00B8AE)", color: "#05060C", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Sahifani qayta yuklash
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

function AppContent() {
  // ── Auth state ──
  const [authPage, setAuthPage] = useState("landing"); // landing|login|register
  const [user, setUser] = useState(() => Auth.getSession());

  // ── Per-user localStorage prefix ──
  const uKey = useCallback((k) => "u_" + (user?.id || "anon") + "_" + k, [user?.id]);

  // ── App state (only when logged in) ──
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminMode, setAdminMode] = useState(false);
  const [superAdminMode, setSuperAdminMode] = useState(false);
  // platform | users | payments | ai_config | tariffs | system
  const [superAdminTab, setSuperAdminTab] = useState("platform");
  // Impersonation: super admin tashkilotga kirgan vaqtda — eski token saqlanadi
  const [impersonation, setImpersonation] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bai_impersonation") || "null"); } catch { return null; }
  });
  // Multi-org kontekst: /api/auth/context dan keladi
  const [orgContext, setOrgContext] = useState(null); // { organization, departments, permissions, ai_usage }
  // Faol bo'lim filtri — null = hamma bo'lim (CEO), aks holda bo'lim IDsi
  const [activeDepartmentId, setActiveDepartmentId] = useState(null);
  // Ochiq dropdown — bir vaqtda faqat bittasi (accordion) — legacy, yangi dizaynda ishlatilmaydi
  const [openDept, setOpenDept] = useState(null);
  // Yangi sidebar: workspace dropdown + command palette
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [alerts, setAlerts] = useState(() => LS.get("u_" + (Auth.getSession()?.id || "anon") + "_alerts", []));
  const [aiConfig, setAiConfig] = useState(() => {
    const uid = Auth.getSession()?.id || "anon";
    const pfx = "u_" + uid + "_";
    const provider = LS.get(pfx + "provider", "deepseek");
    const allKeys = LS.get(pfx + "all_keys", {});
    return {
      provider,
      model: LS.get(pfx + "model", "deepseek-chat"),
      apiKey: allKeys[provider] || LS.get(pfx + "apiKey", ""),
    };
  });
  const [sources, setSources] = useState(() => loadSources());
  const { notifs, push, remove } = useNotifs();
  const { theme, setTheme, toggle: toggleTheme } = useTheme();

  // ── Global AI Task Manager ──
  // Sahifa o'zgarganda ham AI jarayoni davom etadi
  const bgTasksRef = useRef([]);
  const [bgTaskCount, setBgTaskCount] = useState(0);

  const runBackgroundAI = useCallback(async (taskName, messages, config, onDone, sourcePage) => {
    const taskId = Date.now();
    bgTasksRef.current.push({ id: taskId, name: taskName, status: "running", page: sourcePage || "charts" });
    setBgTaskCount(bgTasksRef.current.filter(t => t.status === "running").length);
    push(`"${taskName}" — AI tahlil boshlandi`, "info");

    try {
      let result = "";
      await callAI(messages, config, (chunk) => { result = chunk; });
      // Task tugadi
      bgTasksRef.current = bgTasksRef.current.map(t => t.id === taskId ? { ...t, status: "done", result } : t);
      setBgTaskCount(bgTasksRef.current.filter(t => t.status === "running").length);
      push(`"${taskName}" — tayyor!`, "ok");
      if (onDone) onDone(result);
    } catch (err) {
      bgTasksRef.current = bgTasksRef.current.map(t => t.id === taskId ? { ...t, status: "error" } : t);
      setBgTaskCount(bgTasksRef.current.filter(t => t.status === "running").length);
      push(`"${taskName}" — xato: ${err.message}`, "error");
    }
    // Eski tasklarni tozalash (5 daqiqadan keyin)
    setTimeout(() => {
      bgTasksRef.current = bgTasksRef.current.filter(t => t.id !== taskId);
    }, 300000);
  }, [push]);

  // ── User o'zgarganda barcha state'ni reload qilish ──
  // Avval localStorage dan tez yuklash, keyin API dan yangilash
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const pfx = "u_" + uid + "_";
    // Tez yuklash (localStorage)
    setSources(loadSources(uid));
    setAlerts(LS.get(pfx + "alerts", []));
    const provider = LS.get(pfx + "provider", "deepseek");
    const allKeys = LS.get(pfx + "all_keys", {});
    setAiConfig({
      provider,
      model: LS.get(pfx + "model", "deepseek-chat"),
      apiKey: allKeys[provider] || LS.get(pfx + "apiKey", ""),
    });

    // Backend API dan yangilash (background, xato bo'lsa jimgina)
    if (Token.get()) {
      loadSourcesFromAPI(activeDepartmentId).then(apiSources => {
        if (Array.isArray(apiSources)) {
          setSources(apiSources);
          if (!activeDepartmentId && apiSources.length > 0) saveSources(apiSources, uid);
        }
      }).catch(() => { });
      AlertsAPI.getAll().then(a => { if (Array.isArray(a)) setAlerts(a); }).catch(() => { });
      // Multi-org kontekst: tashkilot, bo'limlar, ruxsatlar
      AuthAPI.context().then(ctx => {
        if (!ctx) return;
        setOrgContext(ctx);
        // Xodim uchun: tegishli bo'limining birinchisini avto-aktiv qilish
        const isElevated = ctx.user?.role === "ceo" || ctx.user?.role === "super_admin" || ctx.user?.role === "admin";
        if (!isElevated && ctx.my_department_ids?.length > 0 && activeDepartmentId === null) {
          setActiveDepartmentId(ctx.my_department_ids[0]);
        }
      }).catch(() => { });
      AiAPI.getConfig().then(cfg => {
        if (cfg && cfg.provider) setAiConfig({ provider: cfg.provider, model: cfg.model || "deepseek-chat", apiKey: cfg.apiKey || "" });
      }).catch(() => { });
      GlobalAI.load().catch(() => { });
    }
  }, [user?.id]);

  // Faol bo'lim o'zgarsa — manbalarni qayta yuklash (faqat filter)
  useEffect(() => {
    if (!user || !Token.get()) return;
    loadSourcesFromAPI(activeDepartmentId).then(apiSources => {
      if (Array.isArray(apiSources)) setSources(apiSources);
    }).catch(() => { });
  }, [activeDepartmentId, user?.id]);

  // ── Derived ──
  // effectiveAI: agar shaxsiy kalit bor → uni ishlatadi (cheksiz), aks holda global AI
  const effectiveAI = getEffectiveAIConfig(aiConfig);
  const prov = AI_PROVIDERS[effectiveAI.provider];
  const hasPersonalKey = !!aiConfig.apiKey;
  const hasGlobalAI = !!(GlobalAI.get()?.apiKey);
  const aiReady = !!effectiveAI.apiKey;
  const connCount = (Array.isArray(sources) ? sources : []).filter(s => s.connected && s.active).length;
  const unreadAlerts = (Array.isArray(alerts) ? alerts : []).filter(a => !a.read).length;
  const currentPlan = PLANS[user?.plan || "free"];

  // ── Alert helpers (per-user, LS + API) ──
  const addAlert = (alert) => {
    const newAlert = { ...alert, id: Date.now(), read: false, createdAt: new Date().toLocaleString("uz-UZ") };
    const updated = [newAlert, ...alerts].slice(0, 50);
    setAlerts(updated); LS.set(uKey("alerts"), updated);
    AlertsAPI.create(alert).catch(() => { });
  };
  const markAllRead = () => {
    const u = alerts.map(a => ({ ...a, read: true }));
    setAlerts(u); LS.set(uKey("alerts"), u);
    AlertsAPI.markAllRead().catch(() => { });
  };
  const deleteAlert = (id) => {
    const u = alerts.filter(a => a.id !== id);
    setAlerts(u); LS.set(uKey("alerts"), u);
    AlertsAPI.delete(id).catch(() => { });
  };

  // ── Onboarding (birinchi kirish) ──
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onbStep, setOnbStep] = useState(0);
  const [onbData, setOnbData] = useState({ bizName: "", bizType: "", interest: "", employees: "", goal: "" });

  const onbQuestions = [
    { key: "bizName", label: "Biznesingiz nomi nima?", placeholder: "Masalan: Najot Ta'lim, My Shop, Baraka Cafe", type: "input" },
    { key: "bizType", label: "Qaysi sohada ishlaysiz?", placeholder: "", type: "select", options: ["O'quv markaz", "Onlayn do'kon", "Restoran/Kafe", "Marketing agentlik", "IT kompaniya", "Logistika", "Ishlab chiqarish", "Xizmat ko'rsatish", "Freelance", "Boshqa"] },
    { key: "employees", label: "Jamoangizda necha kishi?", placeholder: "", type: "select", options: ["Faqat men", "2-5 kishi", "6-20 kishi", "21-50 kishi", "50+ kishi"] },
    { key: "interest", label: "Sizni eng ko'p nima qiziqtiradi?", placeholder: "", type: "select", options: ["Savdo va daromad tahlili", "Xarajatlarni kamaytirish", "Mijozlar tahlili", "Marketing samaradorligi", "Xodimlar boshqaruvi", "Moliyaviy hisobotlar", "Prognozlash va bashorat"] },
    { key: "goal", label: "Analix dan nimani kutasiz?", placeholder: "", type: "select", options: ["Vaqtimni tejashni", "Aniq raqamlar bilan qaror qabul qilishni", "Avtomatik hisobotlar olishni", "Muammolarni oldindan ko'rishni", "Biznesni o'stirish strategiyasini"] },
  ];

  const saveOnboarding = () => {
    const pfx = "u_" + (user?.id || "anon") + "_";
    LS.set(pfx + "onboarding", onbData);
    LS.set(pfx + "onboarding_done", true);
    setShowOnboarding(false);
    push(`Rahmat, ${onbData.bizName || user?.name}! Tizim sizga moslashtirildi`, "ok");
  };

  // ── Instagram OAuth callback handle ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const igConnected = params.get("ig_connected");
    const igError     = params.get("ig_error");
    const sourceId    = params.get("sourceId");
    if (igConnected) {
      push(`Instagram muvaffaqiyatli ulandi! Ma'lumotlar yuklanmoqda...`, "ok");
      history.replaceState(null, "", window.location.pathname);
      // Sources ni qayta yuklash
      setTimeout(() => { SourcesAPI.list().then(data => { if (data?.sources) setSources(data.sources); }).catch(() => {}); }, 1500);
      setPage("data");
    } else if (igError) {
      push(`Instagram ulanishda xato: ${decodeURIComponent(igError)}`, "error");
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // ── Auth handlers ──
  const handleAuth = (authUser) => {
    setUser(authUser);
    push(`Xush kelibsiz, ${authUser.name}!`, "ok");
    setPage("dashboard");
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    // Birinchi kirish tekshiruvi
    const pfx = "u_" + (authUser?.id || "anon") + "_";
    const done = LS.get(pfx + "onboarding_done", false);
    if (!done && authUser.role !== "admin") {
      setTimeout(() => setShowOnboarding(true), 800);
    }
  };

  const handleLogout = () => {
    Auth.clearSession();
    localStorage.removeItem("bai_impersonation");
    setImpersonation(null);
    setUser(null);
    setAuthPage("landing");
    setAdminMode(false);
    setSuperAdminMode(false);
    push("Chiqildi", "info");
  };

  // Global keyboard shortcuts: ⌘K / Ctrl+K (search), G+X (nav)
  useEffect(() => {
    if (!user) return;
    let gPressed = false;
    let gTimer = null;
    const handler = (e) => {
      // Ignore when typing in inputs/textarea (except for ⌘K)
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(v => !v);
        return;
      }
      if (isInput) return;
      if (e.key === "g" || e.key === "G") {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 800);
        return;
      }
      if (gPressed) {
        const key = e.key.toLowerCase();
        const map = { d: "dashboard", m: "datahub", c: "chat", a: "analytics", g: "charts", r: "reports", o: "alerts", s: "settings" };
        if (map[key]) { e.preventDefault(); setPage(map[key]); gPressed = false; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); clearTimeout(gTimer); };
  }, [user]);

  // Super-admin tashkilotga kirib ko'rish (impersonation)
  const enterOrganization = async (orgId, orgName) => {
    try {
      const res = await SuperAdminAPI.impersonate(orgId);
      if (!res?.token) throw new Error("Token olinmadi");
      // Eski super-admin token'ni saqlaymiz
      const originalToken = Token.get();
      const originalUser = Auth.getSession();
      const impData = {
        originalToken,
        originalUser,
        orgId, orgName,
        ceo: res.ceo,
      };
      localStorage.setItem("bai_impersonation", JSON.stringify(impData));
      setImpersonation(impData);
      // CEO token'iga o'tamiz
      Token.set(res.token);
      // /me chaqirib user'ni yangilaymiz
      const me = await AuthAPI.me();
      Auth.setSession(me);
      setUser(me);
      setSuperAdminMode(false);
      setActiveDepartmentId(null);
      setPage("dashboard");
      // Context qayta yuklansin
      setOrgContext(null);
      push(`"${orgName}" tashkilotiga kirildi`, "info");
    } catch (e) {
      push(e.message || "Kirib bo'lmadi", "error");
    }
  };

  // Super-admin rejimiga qaytish
  const exitImpersonation = async () => {
    if (!impersonation?.originalToken) return;
    Token.set(impersonation.originalToken);
    Auth.setSession(impersonation.originalUser);
    setUser(impersonation.originalUser);
    localStorage.removeItem("bai_impersonation");
    setImpersonation(null);
    setSuperAdminMode(true);
    setActiveDepartmentId(null);
    setOrgContext(null);
    push("Super Admin rejimiga qaytdingiz", "ok");
  };

  const handlePlanChange = (updatedUser) => {
    setUser(updatedUser);
    Auth.setSession(updatedUser);
  };

  // ── AI so'rov ishlatilganda — React state VA LS ni yangilash ──
  const onAiUsed = useCallback(() => {
    if (!user) return;
    Auth.incrementAI(user.id);
    // React state ni yangilash — bu eng muhim qism!
    const curMonth = new Date().toISOString().slice(0, 7);
    const sameMonth = user.ai_requests_month === curMonth;
    const newUsed = sameMonth ? (user.ai_requests_used || 0) + 1 : 1;
    const updated = { ...user, ai_requests_used: newUsed, ai_requests_month: curMonth };
    setUser(updated);
  }, [user]);

  // ── Plan limit check wrapper ──
  const checkLimit = (limitKey) => {
    if (!user) return false;
    return Auth.checkLimit(user, limitKey, sources);
  };

  // ── SESSION TIMEOUT (30 daqiqa harakatsiz = chiqish) ──
  useEffect(() => {
    if (!user) return;
    const remember = LS.get("session_remember", false);
    if (remember) return; // Eslab qolish yoqilgan — timeout yo'q
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        push("30 daqiqa harakatsiz — sessiya tugadi", "warn");
        setTimeout(() => { Auth.clearSession(); window.location.reload(); }, 2000);
      }, 30 * 60 * 1000); // 30 daqiqa
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, resetTimer)); };
  }, [user?.id]);

  // ── AVTOMATIK ANOMALIYA TEKSHIRUV (har 5 daqiqada) ──
  const lastAutoCheckRef = useRef(0);
  useEffect(() => {
    if (!user || !sources?.length) return;
    const runAutoCheck = () => {
      const now = Date.now();
      if (now - lastAutoCheckRef.current < 300000) return; // 5 daqiqadan kam bo'lsa — o'tkazib yuborish
      lastAutoCheckRef.current = now;
      const connected = (Array.isArray(sources) ? sources : []).filter(s => s.connected && s.active && s.data?.length > 5);
      if (!connected.length) return;
      const anomalies = detectAnomalies(connected);
      const pfx = "u_" + (user?.id || "anon") + "_";
      const prevCount = LS.get(pfx + "last_anomaly_count", 0);
      LS.set(pfx + "last_anomaly_count", anomalies.length);
      // Yangi anomaliyalar bor bo'lsa — alert qo'shish
      if (anomalies.length > prevCount) {
        const newCount = anomalies.length - prevCount;
        const dangerous = anomalies.filter(a => a.severity === "danger");
        if (dangerous.length > 0) {
          addAlert({ title: `${dangerous.length} ta xavfli anomaliya aniqlandi`, message: dangerous[0]?.explanation || "Ma'lumotlarda g'ayrioddiy o'zgarish", type: "warn", icon: "⚠️" });
          push(`⚠️ ${dangerous.length} ta xavfli anomaliya topildi!`, "warn");
        } else if (newCount > 0) {
          addAlert({ title: `${newCount} ta yangi anomaliya`, message: "Dashboard da batafsil ko'ring", type: "info", icon: "📊" });
        }
      }
    };
    // Darhol tekshirish + har 5 daqiqada
    const t1 = setTimeout(runAutoCheck, 3000);
    const t2 = setInterval(runAutoCheck, 300000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [user?.id, sources?.length]);

  // ── Not logged in ──
  if (!user) {
    if (authPage === "login") return <LoginPage onAuth={handleAuth} onGoRegister={() => setAuthPage("register")} onGoLanding={() => setAuthPage("landing")} />;
    if (authPage === "register") return <RegisterPage onAuth={handleAuth} onGoLogin={() => setAuthPage("login")} onGoLanding={() => setAuthPage("landing")} />;
    return (
      <>
        <style>{CSS}</style>
        <NotifBanner notifs={notifs} remove={remove} />
        <LandingPage onLogin={() => setAuthPage("login")} onRegister={() => setAuthPage("register")} />
      </>
    );
  }

  // ── Onboarding Modal ──
  const onboardingModal = showOnboarding && (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 24, padding: "36px 32px", width: "100%", maxWidth: 460, position: "relative", animation: "fadeIn .3s ease" }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {onbQuestions.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= onbStep ? "linear-gradient(90deg,#00C9BE,#4ADE80)" : "var(--s3)", transition: "all .3s" }} />
          ))}
        </div>
        {/* Savol */}
        <div style={{ fontSize: 10, color: "var(--teal)", fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{onbStep + 1} / {onbQuestions.length}</div>
        <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, marginBottom: 16, lineHeight: 1.3 }}>{onbQuestions[onbStep]?.label}</div>
        {/* Input */}
        {onbQuestions[onbStep]?.type === "input" ? (
          <input className="field" placeholder={onbQuestions[onbStep]?.placeholder} value={onbData[onbQuestions[onbStep]?.key] || ""}
            onChange={e => setOnbData(p => ({ ...p, [onbQuestions[onbStep]?.key]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { onbStep < onbQuestions.length - 1 ? setOnbStep(s => s + 1) : saveOnboarding(); } }}
            style={{ fontSize: 14, padding: "14px 18px", marginBottom: 16 }} autoFocus />
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {onbQuestions[onbStep]?.options?.map(opt => (
              <button key={opt} onClick={() => { setOnbData(p => ({ ...p, [onbQuestions[onbStep]?.key]: opt })); setTimeout(() => { onbStep < onbQuestions.length - 1 ? setOnbStep(s => s + 1) : saveOnboarding(); }, 200); }}
                style={{
                  padding: "12px 18px", borderRadius: 12, border: `1px solid ${onbData[onbQuestions[onbStep]?.key] === opt ? "rgba(0,201,190,0.5)" : "var(--border)"}`,
                  background: onbData[onbQuestions[onbStep]?.key] === opt ? "rgba(0,201,190,0.08)" : "var(--s2)",
                  color: onbData[onbQuestions[onbStep]?.key] === opt ? "var(--teal)" : "var(--text2)",
                  fontSize: 13, textAlign: "left", cursor: "pointer", transition: "all .2s", fontWeight: onbData[onbQuestions[onbStep]?.key] === opt ? 700 : 400,
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(0,201,190,0.3)"}
                onMouseLeave={e => { if (onbData[onbQuestions[onbStep]?.key] !== opt) e.currentTarget.style.borderColor = "var(--border)"; }}>
                {opt}
              </button>
            ))}
          </div>
        )}
        {/* Tugmalar */}
        <div className="flex gap8">
          {onbStep > 0 && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setOnbStep(s => s - 1)}>← Orqaga</button>}
          {onbQuestions[onbStep]?.type === "input" && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onbStep < onbQuestions.length - 1 ? setOnbStep(s => s + 1) : saveOnboarding(); }}>
              {onbStep < onbQuestions.length - 1 ? "Keyingi →" : "Boshlash →"}
            </button>
          )}
          <button className="btn btn-ghost btn-xs" style={{ position: "absolute", top: 16, right: 16, color: "var(--muted)" }} onClick={() => { saveOnboarding(); }}>O'tkazib yuborish</button>
        </div>
      </div>
    </div>
  );

  // ── Super-admin mode (Shonazar — barcha platforma bitta sahifada) ──
  if (superAdminMode && (user.role === "super_admin" || user.role === "admin" || orgContext?.permissions?.is_super_admin)) {
    return (
      <>
        <style>{CSS}</style>
        <NotifBanner notifs={notifs} remove={remove} />
        <div className="app">
          <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
            <div className="logo-wrap">
              <div className="logo-main">ANA<span>LIX</span></div>
              <div className="logo-sub" style={{ color: "var(--gold)" }}>Super Admin</div>
              <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
            </div>
            <div className="nav" style={{ paddingTop: 14 }}>
              {[
                { id: "platform", lbl: "⭐ Platforma" },
                { id: "users", lbl: "Foydalanuvchilar" },
                { id: "payments", lbl: "To'lovlar" },
                { id: "ai_config", lbl: "AI Sozlama" },
                { id: "tariffs", lbl: "Tariflar" },
                { id: "system", lbl: "Tizim" },
              ].map(t => (
                <div key={t.id}
                  className={`ni ${superAdminTab === t.id ? "active" : ""}`}
                  onClick={() => setSuperAdminTab(t.id)}>
                  <span>{t.lbl}</span>
                </div>
              ))}
              <div style={{ height: 12 }} />
              <div className="ni" onClick={() => { setSuperAdminMode(false); setPage("dashboard"); }}>
                <span>← Dashboard ga qaytish</span>
              </div>
            </div>
            <div className="sidebar-footer">
              <span style={{ color: "var(--gold)" }}>⭐ Super-admin</span> · {user.name}
            </div>
          </div>
          <div className="main">
            <div className="topbar">
              <div className="flex aic gap10">
                <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)}></button>
                <div className="page-title" style={{ color: "var(--gold)" }}>
                  ⭐ Super Admin — {({
                    platform: "Platforma",
                    users: "Foydalanuvchilar",
                    payments: "To'lovlar",
                    ai_config: "AI Sozlama",
                    tariffs: "Tariflar",
                    system: "Tizim",
                  })[superAdminTab] || superAdminTab}
                </div>
              </div>
              <div className="topbar-right">
                <button className="btn btn-ghost btn-sm" onClick={() => { setSuperAdminMode(false); setPage("dashboard"); }}>← Dashboard</button>
                <button className="btn btn-danger btn-sm" onClick={handleLogout}>Chiqish</button>
              </div>
            </div>
            <div className="content">
              {superAdminTab === "platform"
                ? <SuperAdminPanel push={push} currentUser={user} onEnter={enterOrganization} />
                : <AdminPanel currentUser={user} push={push} sources={sources} initialTab={superAdminTab} hideTabs />
              }
            </div>
          </div>
        </div>
      </>
    );
  }

  // Eski adminMode olib tashlandi — hammasi Super Admin ichiga birlashtirildi

  // ── Page titles ──
  const PAGE_TITLES = {
    settings: "AI Sozlamalar", dashboard: "Bosh Sahifa", datahub: "Data Hub — Konstruktor",
    charts: "Grafiklar", chat: "AI Maslahat", analytics: "Tahlil",
    reports: "Hisobotlar", alerts: "AI Ogohlantirishlar", profile: "Profil & Tarif",
    team: "Jamoam",
  };

  // CEO yoki super_admin uchun Jamoam sahifasini ochish
  const isCeoOrAbove = user?.role === "ceo" || user?.role === "super_admin" || user?.role === "admin";
  const refreshOrgContext = () => AuthAPI.context().then(ctx => { if (ctx) setOrgContext(ctx); }).catch(() => {});

  // ── Page components ──
  const pages = {
    settings: <SettingsPage aiConfig={aiConfig} setAiConfig={setAiConfig} push={push} effectiveAI={effectiveAI} hasPersonalKey={hasPersonalKey} hasGlobalAI={hasGlobalAI} user={user} />,
    dashboard: <DashboardPage sources={sources} aiConfig={effectiveAI} setPage={setPage} user={user} orgContext={orgContext} activeDepartmentId={activeDepartmentId} setActiveDepartmentId={setActiveDepartmentId} setOpenDept={setOpenDept} />,
    datahub: <DataHubPage sources={sources} setSources={setSources} push={push} user={user} orgContext={orgContext} activeDepartmentId={activeDepartmentId} />,
    charts: <ChartsPage sources={sources} aiConfig={effectiveAI} user={user} hasPersonalKey={hasPersonalKey} onAiUsed={onAiUsed} runBackgroundAI={runBackgroundAI} />,
    chat: <ChatPage aiConfig={effectiveAI} sources={sources} user={user} hasPersonalKey={hasPersonalKey} onAiUsed={onAiUsed} />,
    analytics: <AnalyticsPage aiConfig={effectiveAI} sources={sources} user={user} onAiUsed={onAiUsed} />,
    reports: <ReportsPage aiConfig={effectiveAI} sources={sources} user={user} onAiUsed={onAiUsed} />,
    alerts: <AlertsPage aiConfig={effectiveAI} sources={sources} alerts={alerts} addAlert={addAlert} markAllRead={markAllRead} deleteAlert={deleteAlert} push={push} user={user} onAiUsed={onAiUsed} />,
    profile: <ProfilePage user={user} onPlanChange={handlePlanChange} push={push} sources={sources} />,
    team: <CeoSettingsPage push={push} orgInfo={orgContext?.organization} onChange={refreshOrgContext} />,
  };

  const groupedNav = NAV.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item); return acc;
  }, {});

  // CEO/super_admin uchun "Jamoam" sahifasi (dinamik qo'shamiz)
  if (isCeoOrAbove) {
    if (!groupedNav["boshqaruv"]) groupedNav["boshqaruv"] = [];
    // "settings" navgacha "team"ni ko'rsatish uchun oldiga qo'shamiz
    const settingsIdx = groupedNav["boshqaruv"].findIndex(x => x.id === "settings");
    const teamItem = { id: "team", lbl: "Jamoam", group: "boshqaruv" };
    if (!groupedNav["boshqaruv"].some(x => x.id === "team")) {
      if (settingsIdx >= 0) groupedNav["boshqaruv"].splice(settingsIdx, 0, teamItem);
      else groupedNav["boshqaruv"].unshift(teamItem);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <NotifBanner notifs={notifs} remove={remove} />
      {onboardingModal}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={(p) => setPage(p)}
        onNewChat={() => setPage("chat")}
        onNewSource={() => setPage("datahub")}
        sources={sources}
        departments={orgContext?.departments || []}
        setActiveDepartmentId={setActiveDepartmentId}
      />
      <div className="app">
        {/* Mobile overlay */}
        {sidebarOpen && <div className="mob-overlay" onClick={() => setSidebarOpen(false)} />}

        {/* SIDEBAR — Flat redesign */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {/* Brand */}
          <div className="logo-wrap">
            <div className="logo-main">ANA<span>LIX</span></div>
            <div className="logo-sub">Strategik Agent</div>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
          </div>

          {/* Workspace selector — bo'lim filtri */}
          {orgContext?.organization && (() => {
            const activeDept = orgContext.departments?.find(d => d.id === activeDepartmentId);
            const displayName = activeDept ? activeDept.name : orgContext.organization.name;
            const displayIcon = activeDept?.icon || orgContext.organization.name?.charAt(0).toUpperCase() || "?";
            const totalRows = sources.reduce((a, s) => a + (s.data?.length || 0), 0);
            return (
              <div
                onClick={() => setWorkspaceOpen(v => !v)}
                style={{
                  margin: "10px 10px 8px", padding: "10px 12px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, var(--gold-glow), var(--s2))",
                  border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer", transition: "all .18s var(--ease)",
                  position: "relative",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hi)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: "linear-gradient(135deg, var(--gold), var(--accent2))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--fh)", fontSize: 13, fontWeight: 800,
                  color: "#fff", flexShrink: 0,
                  boxShadow: "var(--shadow-sm)",
                }}>{displayIcon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: -0.1 }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1, fontFamily: "var(--fm)" }}>
                    {connCount} manba · {totalRows.toLocaleString()} qator
                  </div>
                </div>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>▾</span>

                {workspaceOpen && (
                  <div onClick={e => e.stopPropagation()}
                    style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 100, background: "var(--s1)", border: "1px solid var(--border-hi)", borderRadius: 12, padding: 6, boxShadow: "var(--shadow-lg)" }}>
                    <button onClick={() => { setActiveDepartmentId(null); setWorkspaceOpen(false); }}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: activeDepartmentId === null ? "var(--gold-glow)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: activeDepartmentId === null ? "var(--gold)" : "var(--text)", fontWeight: activeDepartmentId === null ? 700 : 500, fontFamily: "var(--fh)", textAlign: "left", marginBottom: 2 }}>
                      <span>🏢</span>
                      <span style={{ flex: 1 }}>Umumiy (barchasi)</span>
                      {activeDepartmentId === null && <span style={{ color: "var(--gold)" }}>✓</span>}
                    </button>
                    {(orgContext.departments || []).filter(d => d.name !== "Umumiy").map(d => (
                      <button key={d.id} onClick={() => { setActiveDepartmentId(d.id); setWorkspaceOpen(false); }}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: activeDepartmentId === d.id ? "var(--gold-glow)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: activeDepartmentId === d.id ? "var(--gold)" : "var(--text)", fontWeight: activeDepartmentId === d.id ? 700 : 500, fontFamily: "var(--fh)", textAlign: "left", marginBottom: 2 }}>
                        <span>{d.icon || "📁"}</span>
                        <span style={{ flex: 1 }}>{d.name}</span>
                        {activeDepartmentId === d.id && <span style={{ color: "var(--gold)" }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Search / Command palette trigger */}
          <div onClick={() => setCmdOpen(true)}
            style={{
              margin: "0 10px 8px", padding: "9px 12px",
              background: "var(--s2)", border: "1px solid var(--border)",
              borderRadius: 10, display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", color: "var(--muted)", fontSize: 12.5,
              transition: "all .15s var(--ease)",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hi)"; e.currentTarget.style.background = "var(--s3)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--s2)"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span style={{ flex: 1 }}>Qidirish yoki buyruq...</span>
            <span style={{ fontFamily: "var(--fm)", fontSize: 9.5, padding: "2px 6px", background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text2)" }}>⌘K</span>
          </div>

          {/* Flat nav */}
          <div className="nav">
            {[
              { id: "dashboard", lbl: "Bosh sahifa",       icon: "🏠" },
              { id: "datahub",   lbl: "Manbalar",          icon: "📁", badge: connCount },
              { id: "chat",      lbl: "AI Maslahatchi",    icon: "💬", hot: true },
              { id: "analytics", lbl: "Tahlil",            icon: "📊" },
              { id: "charts",    lbl: "Grafiklar",         icon: "📈" },
              { id: "reports",   lbl: "Hisobotlar",        icon: "📋" },
              { id: "alerts",    lbl: "Ogohlantirishlar",  icon: "🔔", badge: unreadAlerts, badgeAlert: true },
            ].map(item => (
              <div key={item.id}
                className={`ni ${page === item.id ? "active" : ""}`}
                onClick={() => { setPage(item.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ fontSize: 14, opacity: 0.9, width: 18, display: "inline-flex", justifyContent: "center" }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.lbl}</span>
                {item.hot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent2)", boxShadow: "0 0 8px var(--accent2)" }} />}
                {item.badge != null && item.badge > 0 && (
                  <span className={`ni-badge ${item.badgeAlert ? "warn" : ""}`}>{item.badge}</span>
                )}
              </div>
            ))}

            {/* Boshqaruv */}
            {isCeoOrAbove && (
              <div style={{ marginTop: 14 }}>
                <div className="nav-group-label">Boshqaruv</div>
                <div className={`ni ${page === "team" ? "active" : ""}`}
                  onClick={() => { setPage("team"); if (window.innerWidth < 768) setSidebarOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ fontSize: 14, opacity: 0.9, width: 18, display: "inline-flex", justifyContent: "center" }}>👥</span>
                  <span>Jamoam</span>
                </div>
                <div className={`ni ${page === "settings" ? "active" : ""}`}
                  onClick={() => { setPage("settings"); if (window.innerWidth < 768) setSidebarOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ fontSize: 14, opacity: 0.9, width: 18, display: "inline-flex", justifyContent: "center" }}>⚙️</span>
                  <span>Sozlamalar</span>
                </div>
              </div>
            )}

            {/* Super-admin */}
            {(user.role === "super_admin" || user.role === "admin" || orgContext?.permissions?.is_super_admin) && (
              <div style={{ marginTop: 10 }}>
                <div className="nav-group-label">Tizim</div>
                <div className="ni" style={{ color: "var(--gold)", borderColor: "rgba(212,168,83,0.2)", background: "rgba(212,168,83,0.04)", display: "flex", alignItems: "center", gap: 11 }}
                  onClick={() => setSuperAdminMode(true)}>
                  <span style={{ fontSize: 14, width: 18, display: "inline-flex", justifyContent: "center" }}>⭐</span>
                  <span>Super Admin</span>
                </div>
              </div>
            )}
          </div>

          {/* AI Status — pulse */}
          {isCeoOrAbove && (
            <div onClick={() => setPage("settings")}
              style={{
                margin: "8px 10px", padding: "9px 11px",
                background: (aiConfig.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal-glow)" : "rgba(232,97,77,0.08)",
                border: `1px solid ${(aiConfig.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)"}30`,
                borderRadius: 10, display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", transition: "all .15s var(--ease)",
              }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: (aiConfig.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)",
                boxShadow: `0 0 8px ${(aiConfig.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)"}`,
                flexShrink: 0, animation: "pulse-voice 2s ease infinite",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: (aiConfig.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)", fontFamily: "var(--fh)" }}>{prov.name}</div>
                <div style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--fm)" }}>
                  {(aiConfig.apiKey || GlobalAI.get()?.apiKey) ? "✓ Ulangan" : "Kalit kerak"}
                </div>
              </div>
              <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>almashtirish</span>
            </div>
          )}

          {/* User footer */}
          <div className="sidebar-footer" style={{ cursor: "pointer" }} onClick={() => setPage("profile")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--gold), var(--accent2))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--fh)", fontSize: 13, fontWeight: 800,
                color: "#fff", flexShrink: 0,
              }}>{user.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                <div style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>
                  {user.role === "super_admin" ? "Super-Admin" : user.role === "ceo" ? "CEO" : user.role === "employee" ? "Xodim" : user.role}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {/* TOPBAR — breadcrumb + title */}
          <div className="topbar">
            <div className="flex aic gap10" style={{ flex: 1, minWidth: 0 }}>
              <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)}></button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--muted)", letterSpacing: 0.3, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }} className="hide-mobile">
                  {(() => {
                    const activeDept = orgContext?.departments?.find(d => d.id === activeDepartmentId);
                    const ws = activeDept ? activeDept.name : (orgContext?.organization?.name || "Analix");
                    return (
                      <>
                        <span>{ws}</span>
                        <span style={{ color: "var(--muted2)" }}>/</span>
                        <span>{PAGE_TITLES[page] || page}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="page-title" style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: "var(--text)" }}>{PAGE_TITLES[page] || page}</div>
              </div>
            </div>

            <div className="topbar-right">
              {bgTaskCount > 0 && (
                <div className="tb-item" onClick={() => { const t = bgTasksRef.current.find(t => t.status === "running"); if (t?.page) setPage(t.page); }}
                  style={{ borderColor: "var(--teal)30", color: "var(--teal)", fontWeight: 600, animation: "pulse-voice 2s ease infinite" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal)", animation: "pulse-voice 1s ease infinite" }} />
                  AI ({bgTaskCount})
                </div>
              )}
              <div className="tb-item hide-mobile" onClick={() => setCmdOpen(true)} title="Qidiruv (⌘K)" style={{ padding: "0 10px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div className="tb-item" onClick={() => setPage("alerts")} title="Bildirishnomalar" style={{ padding: "0 10px", position: "relative" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                {unreadAlerts > 0 && (
                  <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: "var(--red)", border: "2px solid var(--bg)" }} />
                )}
              </div>
              <ThemeToggle theme={theme} toggle={toggleTheme} setTheme={setTheme} size="sm" />
              <LiveClock />
              <div className="tb-item" onClick={handleLogout} title="Chiqish" style={{ borderColor: "var(--red)30", color: "var(--red)", fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                <span className="hide-mobile">Chiqish</span>
              </div>
            </div>
          </div>

          {/* IMPERSONATION BANNER — super-admin tashkilotga kirganda */}
          {impersonation && (
            <div style={{
              background: "linear-gradient(90deg, rgba(212,168,83,0.18) 0%, rgba(212,168,83,0.08) 100%)",
              borderBottom: "1px solid rgba(212,168,83,0.35)",
              padding: "10px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text)" }}>
                <span style={{ fontSize: 14 }}>⭐</span>
                <span>
                  Siz <strong style={{ color: "var(--gold)" }}>"{impersonation.orgName}"</strong> tashkilotiga
                  <strong> {impersonation.ceo?.name}</strong> ({impersonation.ceo?.email}) sifatida kirdingiz
                </span>
              </div>
              <button className="btn btn-primary btn-xs" onClick={exitImpersonation}>
                ← Super Admin'ga qaytish
              </button>
            </div>
          )}

          {/* FREE PLAN WARNING */}
          {user.plan === "free" && page !== "profile" && (() => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const aiUsed = user.ai_requests_month === currentMonth ? (user.ai_requests_used || 0) : 0;
            const aiLimit = PLANS.free.limits.ai_requests;
            if (aiUsed >= aiLimit - 2) return (
              <div style={{ background: "rgba(232,184,75,0.08)", borderBottom: "1px solid rgba(232,184,75,0.2)", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, flexShrink: 0 }}>
                <span style={{ color: "var(--gold)" }}> Bepul limitga yetayapsiz: {aiUsed}/{aiLimit} AI so'rov</span>
                <button className="btn btn-primary btn-xs" onClick={() => setPage("profile")}> Yangilash</button>
              </div>
            );
            return null;
          })()}

          {/* CONTENT */}
          <div className="content">{pages[page]}</div>
        </div>
      </div>

    </>
  );
}

// ── App — ErrorBoundary bilan o'ralgan ──
export default function App() {
  return <ErrorBoundary><AppContent /></ErrorBoundary>;
}