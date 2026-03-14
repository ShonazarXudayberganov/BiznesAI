import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, ScatterChart, Scatter, ZAxis
} from "recharts";
import { createPortal } from "react-dom";
import {
  Token, AuthAPI, SourcesAPI, AlertsAPI, ReportsAPI,
  ChatAPI, AiAPI, PaymentsAPI, AdminAPI, UploadAPI
} from "./api.js";

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
  // Agar data bor bo'lsa — alohida saqlash
  if (data && data.length > 0) {
    SourcesAPI.saveData(source.id, data).catch(() => { });
  }
}

// Backend API dan manbalarni yuklash
async function loadSourcesFromAPI() {
  try {
    if (!Token.get()) return null;
    const result = await SourcesAPI.getAll();
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
  login: async (email, password) => {
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
  register: async (name, email, password) => {
    try {
      const res = await AuthAPI.register(name, email, password);
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
    if (user?.role === "admin") return true; // Admin cheksiz
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
    if (user?.role === "admin") return { allowed: true, used: 0, max: -1, label: "Cheksiz" };
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
        wb.SheetNames.forEach(name => { sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]); });
        resolve(sheets);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function buildMergedContext(sources) {
  return sources.filter(s => s.connected && s.active).map(s => {
    const st = SOURCE_TYPES[s.type];
    const total = s.data?.length || 0;

    // Instagram uchun — profil statistika + top postlar
    if (s.type === "instagram" && s.data?.length > 0) {
      const summary = s.data.find(d => d._type === "PROFIL_STATISTIKA");
      const posts = s.data.filter(d => !d._type).slice(0, 20);
      return `\n INSTAGRAM MANBA: "${s.name}" (@${s.profileName || "noma'lum"})
${summary ? `PROFIL STATISTIKA: ${JSON.stringify(summary, null, 2)}` : ""}\n
TOP POSTLAR (${posts.length} ta / ${total - 1} tadan):
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

    // Boshqa manbalar uchun (Excel, Sheets, API, Manual)
    const rows = s.data?.slice(0, 40) || [];
    return `\n MANBA: "${s.name}" (${st?.icon || ""} ${st?.label || s.type}, ${total} ta yozuv):\n${JSON.stringify(rows, null, 2)}`;
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
async function callAI(messages, config, onChunk) {
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
      body: JSON.stringify(body)
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
      body: JSON.stringify(body)
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
    body: JSON.stringify(body)
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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root,[data-theme="obsidian"]{
  --bg:#05060C;--s1:#0A0C15;--s2:#0E1019;--s3:#12141F;--s4:#181B28;
  --glass:rgba(10,12,21,0.92);
  --border:rgba(255,255,255,0.06);--border2:rgba(255,255,255,0.03);--border-hi:rgba(255,255,255,0.12);
  --gold:#D4A853;--gold2:#E8C47A;--gold-glow:rgba(212,168,83,0.15);
  --teal:#00D4C8;--teal2:#00F5E5;--teal-glow:rgba(0,212,200,0.12);
  --green:#34D399;--red:#FB7185;--purple:#A78BFA;--blue:#60A5FA;--orange:#FB923C;
  --accent1:#D4A853;--accent2:#00D4C8;
  --text:#E8ECF4;--text2:#94A3B8;--muted:#475569;--muted2:#334155;
  --fh:'Inter',system-ui,-apple-system,sans-serif;
  --fm:'JetBrains Mono','Fira Code',monospace;
  --fs:'Space Grotesk',sans-serif;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.3),0 1px 2px rgba(0,0,0,0.2);
  --shadow-md:0 4px 16px rgba(0,0,0,0.4),0 2px 4px rgba(0,0,0,0.2);
  --shadow-lg:0 10px 40px rgba(0,0,0,0.5),0 4px 12px rgba(0,0,0,0.3);
  --shadow-glow-gold:0 0 20px rgba(212,168,83,0.15),0 0 60px rgba(212,168,83,0.05);
  --shadow-glow-teal:0 0 20px rgba(0,212,200,0.12),0 0 60px rgba(0,212,200,0.04);
  --radius:10px;--radius-lg:16px;--radius-xl:20px;
  --ease:cubic-bezier(0.4,0,0.2,1);
  --ease-spring:cubic-bezier(0.175,0.885,0.32,1.275);
  --chart-grid:rgba(100,160,180,0.06);--chart-label:#64748B;--chart-tip-bg:rgba(15,23,42,0.95);--chart-tip-border:rgba(0,201,190,0.2);
  --bg-pattern:none;
}
/* ═══ MIDNIGHT — Chuqur zangori, yashil neon aksent ═══ */
[data-theme="midnight"]{
  --bg:#080E1A;--s1:#0C1527;--s2:#101C34;--s3:#162340;--s4:#1C2B4D;
  --glass:rgba(12,21,39,0.94);
  --border:rgba(56,189,248,0.08);--border2:rgba(56,189,248,0.04);--border-hi:rgba(56,189,248,0.14);
  --gold:#38BDF8;--gold2:#7DD3FC;--gold-glow:rgba(56,189,248,0.14);
  --teal:#34D399;--teal2:#6EE7B7;--teal-glow:rgba(52,211,153,0.12);
  --green:#34D399;--red:#FB7185;--purple:#818CF8;--blue:#38BDF8;--orange:#FB923C;
  --accent1:#38BDF8;--accent2:#34D399;
  --text:#E0F2FE;--text2:#94A3B8;--muted:#4B6A8A;--muted2:#2D4A6A;
  --shadow-sm:0 1px 3px rgba(0,15,40,0.45);--shadow-md:0 4px 16px rgba(0,15,40,0.4);--shadow-lg:0 10px 40px rgba(0,15,40,0.5);
  --shadow-glow-gold:0 0 24px rgba(56,189,248,0.12);--shadow-glow-teal:0 0 24px rgba(52,211,153,0.1);
  --chart-grid:rgba(56,189,248,0.06);--chart-label:#5A8BAA;--chart-tip-bg:rgba(12,21,39,0.96);--chart-tip-border:rgba(52,211,153,0.25);
  --bg-pattern:
    radial-gradient(circle at 15% 85%,rgba(56,189,248,0.04) 0%,transparent 40%),
    radial-gradient(circle at 85% 15%,rgba(52,211,153,0.03) 0%,transparent 40%);
}
/* ═══ AURORA — Shimoliy yorug'lik, shaffof fon ═══ */
[data-theme="aurora"]{
  --bg:#06101A;--s1:rgba(10,20,35,0.85);--s2:rgba(15,28,48,0.8);--s3:rgba(20,36,58,0.8);--s4:rgba(28,46,70,0.8);
  --glass:rgba(10,20,35,0.88);
  --border:rgba(110,231,183,0.1);--border2:rgba(110,231,183,0.04);--border-hi:rgba(110,231,183,0.16);
  --gold:#6EE7B7;--gold2:#A7F3D0;--gold-glow:rgba(110,231,183,0.15);
  --teal:#22D3EE;--teal2:#67E8F9;--teal-glow:rgba(34,211,238,0.12);
  --green:#6EE7B7;--red:#FCA5A5;--purple:#C4B5FD;--blue:#67E8F9;--orange:#FDBA74;
  --accent1:#6EE7B7;--accent2:#22D3EE;
  --text:#ECFDF5;--text2:#A7F3D0;--muted:#4A8068;--muted2:#2D5A45;
  --shadow-sm:0 1px 3px rgba(0,10,20,0.5);--shadow-md:0 4px 16px rgba(0,10,20,0.45);--shadow-lg:0 10px 40px rgba(0,10,20,0.5);
  --shadow-glow-gold:0 0 30px rgba(110,231,183,0.15);--shadow-glow-teal:0 0 30px rgba(34,211,238,0.12);
  --chart-grid:rgba(110,231,183,0.06);--chart-label:#5EA888;--chart-tip-bg:rgba(10,20,35,0.96);--chart-tip-border:rgba(110,231,183,0.3);
  --bg-pattern:
    radial-gradient(ellipse 120% 40% at 20% 0%,rgba(34,211,238,0.1) 0%,transparent 50%),
    radial-gradient(ellipse 80% 35% at 55% 5%,rgba(110,231,183,0.08) 0%,transparent 45%),
    radial-gradient(ellipse 60% 40% at 80% 10%,rgba(167,139,250,0.06) 0%,transparent 50%),
    radial-gradient(ellipse 40% 60% at 50% 100%,rgba(6,16,26,0.6) 0%,transparent 50%);
}
/* ═══ ROSE — Bronza luxury ═══ */
[data-theme="rose"]{
  --bg:#0C0A08;--s1:#15120E;--s2:#1E1A15;--s3:#27221C;--s4:#312B24;
  --glass:rgba(21,18,14,0.94);
  --border:rgba(212,168,83,0.1);--border2:rgba(212,168,83,0.04);--border-hi:rgba(212,168,83,0.16);
  --gold:#E8B84B;--gold2:#F0CC70;--gold-glow:rgba(232,184,75,0.16);
  --teal:#D4A853;--teal2:#E8C47A;--teal-glow:rgba(212,168,83,0.1);
  --green:#A3BE8C;--red:#BF616A;--purple:#B48EAD;--blue:#D4A853;--orange:#D08770;
  --accent1:#E8B84B;--accent2:#D4A853;
  --text:#ECEFF4;--text2:#BFA97A;--muted:#8A7550;--muted2:#5E503C;
  --shadow-sm:0 1px 3px rgba(12,10,8,0.5);--shadow-md:0 4px 16px rgba(12,10,8,0.45);--shadow-lg:0 10px 40px rgba(12,10,8,0.5);
  --shadow-glow-gold:0 0 24px rgba(232,184,75,0.18);--shadow-glow-teal:0 0 24px rgba(212,168,83,0.12);
  --chart-grid:rgba(212,168,83,0.06);--chart-label:#A09070;--chart-tip-bg:rgba(21,18,14,0.96);--chart-tip-border:rgba(232,184,75,0.3);
  --bg-pattern:
    radial-gradient(ellipse 80% 50% at 80% 90%,rgba(212,168,83,0.05) 0%,transparent 50%),
    radial-gradient(ellipse 60% 40% at 20% 10%,rgba(232,184,75,0.03) 0%,transparent 45%);
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
.card-title{font-family:var(--fh);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:2.5px;margin-bottom:14px;}
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
.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text2);}
.btn-ghost:hover{border-color:var(--border-hi);color:var(--text);background:var(--s3);box-shadow:var(--shadow-sm)}
.btn-danger{background:transparent;border:1px solid rgba(251,113,133,0.2);color:var(--red);}
.btn-danger:hover{background:rgba(251,113,133,0.06);border-color:rgba(251,113,133,0.35);box-shadow:0 0 12px rgba(251,113,133,0.08)}
.btn-sm{padding:6px 14px;font-size:11.5px;border-radius:8px}
.btn-xs{padding:4px 10px;font-size:10.5px;border-radius:7px}
.btn-lg{padding:13px 30px;font-size:14.5px;border-radius:12px}

/* ═══ FORMS ═══ */
.field{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-family:var(--fm);font-size:12.5px;outline:none;transition:all .25s var(--ease);}
.field:focus{border-color:rgba(212,168,83,0.35);box-shadow:0 0 0 4px rgba(212,168,83,0.05),var(--shadow-sm);background:var(--s3);}
.field::placeholder{color:var(--muted);font-weight:300}
.field-label{font-family:var(--fh);font-size:10.5px;font-weight:600;color:var(--muted);margin-bottom:7px;display:block;text-transform:uppercase;letter-spacing:1.5px;}
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
.section-hd{font-family:var(--fh);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:3.5px;margin-bottom:16px;display:flex;align-items:center;gap:12px;}
.section-hd::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent 80%);}
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
.source-item{background:var(--s2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px 18px;margin-bottom:12px;transition:all .25s var(--ease);}
.source-item:hover{border-color:var(--border-hi);box-shadow:var(--shadow-sm)}
.source-item.active-src{border-left:3px solid var(--green)}
.source-item.inactive-src{opacity:.5}
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

/* AURORA — shaffof kartalar, shimoliy yorug'lik fon */
[data-theme="aurora"] .logo-main span{color:#6EE7B7}
[data-theme="aurora"] .grad{background:linear-gradient(135deg,#6EE7B7,#22D3EE);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
[data-theme="aurora"] .btn-primary{background:linear-gradient(135deg,#10B981,#059669);box-shadow:0 2px 12px rgba(16,185,129,0.3)}
[data-theme="aurora"] .sidebar{background:rgba(10,20,35,0.88);backdrop-filter:blur(20px);border-right-color:rgba(110,231,183,0.06)}
[data-theme="aurora"] .topbar{background:rgba(10,20,35,0.82);backdrop-filter:blur(16px)}
[data-theme="aurora"] .card{background:rgba(10,20,35,0.75);backdrop-filter:blur(12px);border-color:rgba(110,231,183,0.08)}
[data-theme="aurora"] .content{background:transparent}
[data-theme="aurora"] .field{background:rgba(15,28,48,0.7);backdrop-filter:blur(8px)}
[data-theme="aurora"] .nav-btn.active{border-left-color:#6EE7B7}

/* ROSE — issiq gradient borderlar, bronza glow */
[data-theme="rose"] .logo-main span{color:#E8B84B}
[data-theme="rose"] .grad{background:linear-gradient(135deg,#E8B84B,#D4A853);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
[data-theme="rose"] .btn-primary{background:linear-gradient(135deg,#D4A853,#B8860B);box-shadow:0 2px 12px rgba(212,168,83,0.3)}
[data-theme="rose"] .card{border-color:rgba(212,168,83,0.1);box-shadow:0 0 16px rgba(212,168,83,0.03),0 4px 16px rgba(0,0,0,0.3)}
[data-theme="rose"] .sidebar{border-right:1px solid rgba(212,168,83,0.08)}
[data-theme="rose"] .nav-btn.active{border-left-color:#D4A853}
[data-theme="rose"] .topbar{border-bottom-color:rgba(212,168,83,0.06)}

@media(max-width:768px){
  .hamburger-btn{display:flex;align-items:center}
  .sidebar-close-btn{display:block}
  .hide-mobile{display:none}
  .sidebar{position:fixed;top:0;left:0;height:100vh;z-index:1000;transform:translateX(0);box-shadow:8px 0 40px rgba(0,0,0,0.7);backdrop-filter:blur(20px)}
  .sidebar.sidebar-closed{transform:translateX(-100%)}
  .mob-overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999;backdrop-filter:blur(4px);}
  .g4{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr}.g2{grid-template-columns:1fr}
  .pricing-grid{grid-template-columns:1fr 1fr}.feat-grid{grid-template-columns:1fr 1fr}
  .land-stats{grid-template-columns:1fr 1fr}.land-hero{padding:60px 20px 48px;}
  .land-nav,.land-section,.land-stats{padding-left:20px;padding-right:20px}
  .chat-wrap{height:calc(100vh - 56px - 32px)}.bubble{max-width:88%}
  .type-grid{grid-template-columns:repeat(2,1fr)}.content{padding:16px}.topbar{padding:0 16px}
}
@media(max-width:480px){
  .g4{grid-template-columns:1fr}.pricing-grid{grid-template-columns:1fr}.feat-grid{grid-template-columns:1fr}
  .land-stats{grid-template-columns:1fr 1fr}.stat-block{border-bottom:1px solid var(--border)}
  .hero-title{letter-spacing:-1px}
}
`;
// ─────────────────────────────────────────────────────────────
// NOTIFICATION HOOK
// ─────────────────────────────────────────────────────────────
function useNotifs() {
  const [notifs, setNotifs] = useState([]);
  const push = useCallback((msg, type = "info") => {
    const id = Date.now();
    setNotifs(p => [...p, { id, msg, type }]);
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), 4000);
  }, []);
  return { notifs, push };
}
function NotifBanner({ notifs }) {
  const colors = { ok: "var(--green)", error: "var(--red)", info: "var(--text2)", warn: "var(--gold)" };
  return (
    <div className="notif-stack">
      {notifs.map(n => (
        <div key={n.id} className="notif" style={{ borderLeftColor: colors[n.type] || colors.info, borderLeftWidth: 3 }}>
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
        <stop stopColor={c1}/><stop offset="1" stopColor={c2}/>
      </linearGradient></defs>
      {paths}
    </svg>
  );
  const feats = [
    { ico: I(<><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" stroke={`url(#fi0)`} strokeWidth="1.8"/><path d="M9 14h6l2 8H7l2-8z" stroke={`url(#fi0)`} strokeWidth="1.8"/><circle cx="12" cy="6" r="1.5" fill={`url(#fi0)`}/></>, "#E8B84B","#D4A853","fi0"), title: "4 ta AI Provayder", desc: "Claude, ChatGPT, DeepSeek, Gemini — bitta joydan boshqaring. SSE streaming bilan real-vaqt javoblar. O'zbek tilida to'liq qo'llab-quvvatlanadi.", c: "var(--gold)" },
    { ico: I(<><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={`url(#fi1)`} strokeWidth="1.8"/></>, "#00C9BE","#00A89E","fi1"), title: "12 ta Ma'lumot Manbasi", desc: "Excel, Google Sheets, REST API, Instagram, Telegram, CRM, PDF, Rasm, 1C Buxgalteriya, Yandex Metrika, SQL Database — barchasini ulang.", c: "var(--teal)" },
    { ico: I(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke={`url(#fi2)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></>, "#4ADE80","#22C55E","fi2"), title: "9 xil Grafik Turi", desc: "Chiziq, ustun, doira, maydon, tarqoq, gauge va boshqalar. AI avtomatik mos grafikni tanlaydi.", c: "var(--green)" },
    { ico: I(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={`url(#fi3)`} strokeWidth="1.8" strokeLinecap="round"/><line x1="12" y1="9" x2="12" y2="13" stroke={`url(#fi3)`} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16.5" r="1" fill={`url(#fi3)`}/></>, "#F87171","#EF4444","fi3"), title: "Anomaliya Aniqlash", desc: "Matematik va AI tahlil orqali g'ayrioddiy o'zgarishlarni avtomatik topadi. Siz so'ramasdan xabar beradi.", c: "var(--red)" },
    { ico: I(<><rect x="9" y="2" width="6" height="11" rx="3" stroke={`url(#fi4)`} strokeWidth="1.8"/><path d="M5 10a7 7 0 0 0 14 0" stroke={`url(#fi4)`} strokeWidth="1.8" strokeLinecap="round"/><line x1="12" y1="17" x2="12" y2="22" stroke={`url(#fi4)`} strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="22" x2="16" y2="22" stroke={`url(#fi4)`} strokeWidth="1.8" strokeLinecap="round"/></>, "#A78BFA","#7C3AED","fi4"), title: "Ovozli Kiritish", desc: "Mikrofon orqali savol bering — O'zbek va Rus tilida ishlaydi. Qo'l bilan yozish shart emas.", c: "var(--purple)" },
    { ico: I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={`url(#fi5)`} strokeWidth="1.8" strokeLinecap="round"/><polyline points="14 2 14 8 20 8" stroke={`url(#fi5)`} strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="13" x2="16" y2="13" stroke={`url(#fi5)`} strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="17" x2="13" y2="17" stroke={`url(#fi5)`} strokeWidth="1.5" strokeLinecap="round"/></>, "#F87171","#DC2626","fi5"), title: "Hujjat Tahlili", desc: "PDF, Word, TXT fayllarni yuklang — AI mazmunni o'qib, tahlil qiladi va javob beradi.", c: "#F87171" },
    { ico: I(<><rect x="3" y="3" width="18" height="18" rx="3" stroke={`url(#fi6)`} strokeWidth="1.8"/><circle cx="8.5" cy="8.5" r="2" stroke={`url(#fi6)`} strokeWidth="1.5"/><path d="M21 15l-5-5L5 21" stroke={`url(#fi6)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>, "#EC4899","#DB2777","fi6"), title: "Rasm Tahlili", desc: "Rasm yuklang — AI rasm tarkibini tavsiflaydi, diagrammalarni o'qiydi va ma'lumot ajratadi.", c: "#EC4899" },
    { ico: I(<><path d="M4 4h16v16H4z" stroke={`url(#fi7)`} strokeWidth="0"/><rect x="3" y="3" width="18" height="18" rx="2" stroke={`url(#fi7)`} strokeWidth="1.8"/><path d="M8 12h8M8 8h8M8 16h5" stroke={`url(#fi7)`} strokeWidth="1.8" strokeLinecap="round"/></>, "#60A5FA","#3B82F6","fi7"), title: "Avtomatik Hisobotlar", desc: "PDF, Excel, TXT formatida professional hisobotlar. 8 xil modul — bir tugma bilan tayyor.", c: "#60A5FA" },
    { ico: I(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={`url(#fi8)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke={`url(#fi8)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>, "#8B5CF6","#6D28D9","fi8"), title: "CRM Integratsiya", desc: "LC-UP CRM dan lidlar, guruhlar, o'quvchilar, o'qituvchilar ma'lumotlarini tortib, AI bilan tahlil qiling.", c: "#8B5CF6" },
  ];

  const howItWorks = [
    { step: "01", title: "Ma'lumot ulang", desc: "Data Hub da Excel, CRM, Instagram yoki boshqa manbani ulang. Drag & drop bilan fayl tashlang.", ico: I(<><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke={`url(#hw0)`} strokeWidth="1.8" strokeLinecap="round"/></>, "#00C9BE","#00A89E","hw0"), c: "var(--teal)" },
    { step: "02", title: "AI savol bering", desc: "Chat sahifasida savolingizni yozing yoki mikrofon bosib ayting. AI ma'lumotlaringiz asosida javob beradi.", ico: I(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={`url(#hw1)`} strokeWidth="1.8" strokeLinecap="round"/></>, "#E8B84B","#D4A853","hw1"), c: "var(--gold)" },
    { step: "03", title: "Natija oling", desc: "Grafiklar, hisobotlar, ogohlantirishlar — barchasi avtomatik. Bir tugma bilan PDF ga eksport qiling.", ico: I(<><line x1="18" y1="20" x2="18" y2="10" stroke={`url(#hw2)`} strokeWidth="2.5" strokeLinecap="round"/><line x1="12" y1="20" x2="12" y2="4" stroke={`url(#hw2)`} strokeWidth="2.5" strokeLinecap="round"/><line x1="6" y1="20" x2="6" y2="14" stroke={`url(#hw2)`} strokeWidth="2.5" strokeLinecap="round"/></>, "#4ADE80","#22C55E","hw2"), c: "var(--green)" },
  ];

  const whyCards = [
    { title: "Vaqtingizni tejang", desc: "Soatlab Excel bilan o'tirib hisobot yozish o'rniga — AI 30 soniyada tayyor qiladi. Siz biznesga e'tibor bering, hisobotni AI ga qoldiring.", ico: I(<><circle cx="12" cy="12" r="10" stroke={`url(#wc0)`} strokeWidth="1.8"/><polyline points="12 6 12 12 16 14" stroke={`url(#wc0)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></>, "#E8B84B","#D4A853","wc0"), c: "#E8B84B" },
    { title: "Raqamlarga asoslaning", desc: "Sezgi bilan emas, aniq raqamlar bilan qaror qabul qiling. Qayerda pul yo'qolayotganini, qayerda o'sayotganini real-vaqtda ko'ring.", ico: I(<><line x1="18" y1="20" x2="18" y2="10" stroke={`url(#wc1)`} strokeWidth="2.5" strokeLinecap="round"/><line x1="12" y1="20" x2="12" y2="4" stroke={`url(#wc1)`} strokeWidth="2.5" strokeLinecap="round"/><line x1="6" y1="20" x2="6" y2="14" stroke={`url(#wc1)`} strokeWidth="2.5" strokeLinecap="round"/></>, "#4ADE80","#22C55E","wc1"), c: "#4ADE80" },
    { title: "Muammolarni oldindan ko'ring", desc: "AI sizning ma'lumotlaringizda anomaliyalarni avtomatik topadi. Savdo tushayotganini siz bilmasdan — tizim ogohlantiradi.", ico: I(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={`url(#wc2)`} strokeWidth="1.8"/><line x1="12" y1="9" x2="12" y2="13" stroke={`url(#wc2)`} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16.5" r="1" fill={`url(#wc2)`}/></>, "#F87171","#EF4444","wc2"), c: "#F87171" },
    { title: "Barcha ma'lumot bir joyda", desc: "Excel, CRM, Instagram, Telegram — turli joylardagi ma'lumotlar bitta ekranda. Boshqa tab almashish, fayl qidirish yo'q.", ico: I(<><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={`url(#wc3)`} strokeWidth="1.8"/></>, "#00C9BE","#00A89E","wc3"), c: "#00C9BE" },
    { title: "Xodimga to'lamang — AI qiladi", desc: "Tahlilchi yollash oyiga 5-10 mln so'm. BiznesAI bilan professional tahlilni 99 ming so'mdan oling. 50 barobar arzon.", ico: I(<><line x1="12" y1="1" x2="12" y2="23" stroke={`url(#wc4)`} strokeWidth="1.8"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke={`url(#wc4)`} strokeWidth="1.8" strokeLinecap="round"/></>, "#A78BFA","#7C3AED","wc4"), c: "#A78BFA" },
    { title: "Ovozingiz bilan so'rang", desc: "Yozishga vaqt yo'qmi? Mikrofon bosing va savol bering. AI O'zbek tilida tushunadi va javob beradi. Mashina haydab ketayotganda ham ishlaydi.", ico: I(<><rect x="9" y="2" width="6" height="11" rx="3" stroke={`url(#wc5)`} strokeWidth="1.8"/><path d="M5 10a7 7 0 0 0 14 0" stroke={`url(#wc5)`} strokeWidth="1.8" strokeLinecap="round"/><line x1="12" y1="17" x2="12" y2="22" stroke={`url(#wc5)`} strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="22" x2="16" y2="22" stroke={`url(#wc5)`} strokeWidth="1.8" strokeLinecap="round"/></>, "#EC4899","#DB2777","wc5"), c: "#EC4899" },
  ];

  const faqs = [
    { q: "BiznesAI qanday ishlaydi?", a: "Siz ma'lumot manbangizni (Excel, CRM, Instagram va h.k.) ulaysiz. AI shu ma'lumotlar asosida savollaringizga javob beradi, grafiklar yaratadi, hisobotlar yozadi va anomaliyalarni aniqlaydi." },
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
        <div className="land-logo">BIZ<span>NES</span>AI</div>
        <div className="flex gap8 aic" style={{flexWrap:"wrap"}}>
          {[{l:"Xususiyatlar",id:"features"},{l:"Qanday ishlaydi",id:"howitworks"},{l:"Narxlar",id:"pricing"},{l:"FAQ",id:"faq"}].map(n=>(
            <button key={n.id} onClick={()=>scrollTo(n.id)} style={{fontSize:13,color:"var(--text2)",background:"none",border:"none",fontFamily:"var(--fh)",fontWeight:500,padding:"6px 12px",cursor:"pointer",transition:"color .2s"}}
              onMouseEnter={e=>e.target.style.color="var(--teal)"} onMouseLeave={e=>e.target.style.color="var(--text2)"}>{n.l}</button>
          ))}
          <ThemeToggle theme={theme} toggle={toggleTheme} setTheme={setTheme} size="sm" />
          <button className="btn btn-ghost btn-sm" onClick={onLogin}>Kirish</button>
          <button className="btn btn-primary btn-sm" onClick={onRegister}>Bepul boshlash</button>
        </div>
      </nav>

      {/* HERO */}
      <div className="land-hero">
        <div className="hero-badge"><span style={{color:"var(--teal)"}}>&#9670;</span> Tizim doimiy yangilanib boradi — har hafta yangi imkoniyatlar</div>
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
          <button className="btn btn-primary btn-lg" onClick={onRegister} style={{padding:"14px 36px",fontSize:15}}>
            Bepul boshlang →
          </button>
          <button className="btn btn-ghost btn-lg" onClick={onLogin} style={{padding:"14px 28px",fontSize:15}}>
            Kirish
          </button>
        </div>
        <div style={{marginTop:28,display:"flex",gap:20,justifyContent:"center",flexWrap:"wrap",fontSize:12,color:"var(--muted)",fontFamily:"var(--fm)"}}>
          <span>✓ Kredit karta shart emas</span>
          <span>✓ 30 soniyada ro'yxatdan o'ting</span>
          <span>✓ 5 ta AI so'rov bepul</span>
        </div>
      </div>

      {/* STATS */}
      <div className="land-stats">
        {[{n:"4+",l:"AI Provayder"},{n:"12",l:"Ma'lumot manbasi"},{n:"9",l:"Grafik turi"},{n:"Voice",l:"Ovozli kiritish"},{n:"100%",l:"O'zbek tilida"}].map((s,i)=>(
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
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:24,maxWidth:960,margin:"0 auto"}}>
          {howItWorks.map((h,i)=>(
            <div key={i} style={{background:"var(--s1)",border:"1px solid var(--border)",borderRadius:16,padding:"32px 28px",textAlign:"center",position:"relative",transition:"all .25s",cursor:"default"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=h.c+"50";e.currentTarget.style.transform="translateY(-4px)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.transform="none"}}>
              <div style={{position:"absolute",top:16,left:20,fontFamily:"var(--fh)",fontSize:42,fontWeight:900,color:h.c,opacity:0.08}}>{h.step}</div>
              <div style={{marginBottom:16,width:48,height:48,borderRadius:14,background:`${h.c}12`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>{h.ico}</div>
              <div style={{fontFamily:"var(--fh)",fontSize:17,fontWeight:700,marginBottom:8,color:h.c}}>{h.title}</div>
              <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.7}}>{h.desc}</div>
              {i<2&&<div style={{position:"absolute",right:-16,top:"50%",fontSize:20,color:"var(--muted)",display:window.innerWidth>800?"block":"none"}}>→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div id="features" className="land-section" style={{background:"var(--s1)",margin:0,padding:"70px 48px"}}>
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

      {/* WHY BIZNESAI — Sotuvga undovchi */}
      <div className="land-section">
        <h2 className="land-section-title">Nega aynan BiznesAI?</h2>
        <p className="land-section-sub">Biznesingizni tushunish uchun soatlab vaqt sarflamang — AI buni soniyalarda qiladi</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:20,maxWidth:1100,margin:"0 auto"}}>
          {whyCards.map((w,i)=>(
            <div key={i} style={{padding:"28px 24px",borderRadius:16,border:"1px solid var(--border)",background:"var(--s1)",transition:"all .3s var(--ease)",cursor:"default",position:"relative",overflow:"hidden"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=w.c+"50";e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow=`0 16px 40px ${w.c}15`}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,transparent,${w.c}60,transparent)`,opacity:0.6}}/>
              <div style={{width:52,height:52,borderRadius:14,background:`${w.c}10`,border:`1px solid ${w.c}20`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>{w.ico}</div>
              <div style={{fontFamily:"var(--fh)",fontSize:17,fontWeight:700,marginBottom:8,color:w.c,letterSpacing:"-0.3px"}}>{w.title}</div>
              <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.8}}>{w.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div className="land-section" style={{background:"var(--s1)",margin:0,padding:"70px 48px"}}>
        <h2 className="land-section-title">Foydalanuvchilar fikri</h2>
        <p className="land-section-sub">BiznesAI ishlatayotgan mutaxassislar nima deydi</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:20,maxWidth:1000,margin:"0 auto"}}>
          {testimonials.map((t,i)=>(
            <div key={i} style={{padding:"28px",borderRadius:16,border:"1px solid var(--border)",background:"var(--bg)",position:"relative"}}>
              <div style={{fontSize:40,color:"var(--gold)",opacity:0.12,position:"absolute",top:12,right:20,fontFamily:"Georgia,serif",fontWeight:700}}>&ldquo;</div>
              <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.8,marginBottom:20,fontStyle:"italic"}}>"{t.text}"</div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,var(--gold),var(--teal))",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--fh)",fontWeight:800,fontSize:13,color:"#000"}}>{t.ava}</div>
                <div>
                  <div style={{fontFamily:"var(--fh)",fontSize:13,fontWeight:700}}>{t.name}</div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing" className="land-section" style={{padding:"70px 40px"}}>
        <h2 className="land-section-title">Qulay narxlar</h2>
        <p className="land-section-sub">Biznesingiz hajmiga mos tarif tanlang. Istalgan vaqtda yangilash mumkin.</p>
        <div className="billing-toggle">
          <div className="billing-pill">
            <div className={`billing-opt ${billing==="monthly"?"active":""}`} onClick={()=>setBilling("monthly")}>Oylik</div>
            <div className={`billing-opt ${billing==="yearly"?"active teal":""}`} onClick={()=>setBilling("yearly")}>Yillik</div>
          </div>
          {billing==="yearly"&&<span className="billing-save">2 oy bepul!</span>}
        </div>
        <div className="pricing-grid">
          {planList.map(plan=>(
            <div key={plan.id} className={`plan-card ${plan.badge?"popular":""}`}>
              {plan.badge&&<div className="plan-badge">{plan.badge}</div>}
              <div className="plan-name" style={{color:plan.color}}>{plan.nameUz}</div>
              <div className="plan-price" style={{color:plan.price_monthly===0?"var(--text)":plan.color}}>
                {billing==="yearly"&&plan.price_yearly>0
                  ?<>{Math.round(plan.price_yearly/12).toLocaleString("uz-UZ")}<span> so'm</span></>
                  :plan.price_monthly===0?"Bepul":<>{plan.price_monthly.toLocaleString("uz-UZ")}<span> so'm</span></>}
              </div>
              <div className="plan-period">{plan.price_monthly===0?"Doimo bepul":billing==="yearly"?"oyiga (yillik hisob)":"oyiga"}</div>
              <div className="plan-divider"/>
              {plan.features.map((f,i)=>(
                <div key={i} className="plan-feat">
                  <span className="plan-feat-ico" style={{color:f.ok?"var(--green)":"var(--muted)"}}>{f.ok?"✓":"✗"}</span>
                  <span style={{color:f.ok?"var(--text2)":"var(--muted)",fontSize:11}}>{f.t}</span>
                </div>
              ))}
              <div className="plan-btn">
                <button className="btn btn-primary" style={{width:"100%",background:plan.price_monthly===0?"var(--s3)":undefined,color:plan.price_monthly===0?"var(--text2)":undefined,boxShadow:plan.price_monthly===0?"none":undefined,border:plan.price_monthly===0?"1px solid var(--border)":"none"}}
                  onClick={onRegister}>{plan.price_monthly===0?"Bepul boshlash":"Tanlash →"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div id="faq" className="land-section" style={{background:"var(--s1)",margin:0,padding:"70px 48px"}}>
        <h2 className="land-section-title">Ko'p so'raladigan savollar</h2>
        <p className="land-section-sub">Savolingiz bormi? Javoblar shu yerda</p>
        <div style={{maxWidth:720,margin:"0 auto"}}>
          {faqs.map((f,i)=>(
            <div key={i} style={{borderBottom:"1px solid var(--border)",padding:"0"}}>
              <div onClick={()=>setOpenFaq(openFaq===i?null:i)}
                style={{padding:"20px 0",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"color .2s"}}
                onMouseEnter={e=>e.currentTarget.style.color="var(--teal)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text)"}>
                <span style={{fontFamily:"var(--fh)",fontSize:14,fontWeight:600}}>{f.q}</span>
                <span style={{fontSize:18,color:"var(--muted)",transition:"transform .3s",transform:openFaq===i?"rotate(45deg)":"none",flexShrink:0,marginLeft:16}}>+</span>
              </div>
              {openFaq===i&&(
                <div style={{padding:"0 0 20px",fontSize:13,color:"var(--text2)",lineHeight:1.8,animation:"fadeIn .3s ease"}}>{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="land-section" style={{textAlign:"center",padding:"80px 48px"}}>
        <h2 className="land-section-title">Biznesingizni AI bilan boshqarishni boshlang</h2>
        <p className="land-section-sub" style={{marginBottom:32}}>Ro'yxatdan o'tish 30 soniya — kredit karta shart emas</p>
        <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
          <button className="btn btn-primary btn-lg" onClick={onRegister} style={{padding:"16px 40px",fontSize:16}}>Bepul boshlash →</button>
          <button className="btn btn-ghost btn-lg" onClick={()=>scrollTo("features")} style={{padding:"16px 32px",fontSize:16}}>Batafsil →</button>
        </div>
        <div style={{marginTop:32,display:"flex",gap:32,justifyContent:"center",flexWrap:"wrap",fontSize:12,color:"var(--muted)"}}>
          <span>&#9670; 4 ta AI provayder</span>
          <span>&#9670; 12 ta manba turi</span>
          <span>&#9670; Ovozli kiritish</span>
          <span>&#9670; Hujjat tahlili</span>
          <span>&#9670; Xavfsiz</span>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{borderTop:"1px solid var(--border)",padding:"32px 48px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:32}}>
        <div>
          <div style={{fontFamily:"var(--fh)",fontWeight:800,fontSize:18,marginBottom:12}}>BIZ<span style={{color:"var(--gold)"}}>NES</span>AI</div>
          <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.7}}>O'zbekiston uchun AI-powered biznes tahlil platformasi. Barcha ma'lumotlaringizni bitta joyda tahlil qiling.</div>
        </div>
        <div>
          <div style={{fontFamily:"var(--fh)",fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:2,marginBottom:12}}>Sahifalar</div>
          {[{l:"Xususiyatlar",id:"features"},{l:"Narxlar",id:"pricing"},{l:"FAQ",id:"faq"},{l:"Qanday ishlaydi",id:"howitworks"}].map(n=>(
            <div key={n.id} style={{fontSize:12,color:"var(--text2)",cursor:"pointer",padding:"4px 0",transition:"color .2s"}}
              onClick={()=>scrollTo(n.id)} onMouseEnter={e=>e.target.style.color="var(--teal)"} onMouseLeave={e=>e.target.style.color="var(--text2)"}>{n.l}</div>
          ))}
        </div>
        <div>
          <div style={{fontFamily:"var(--fh)",fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:2,marginBottom:12}}>Ma'lumot manbalari</div>
          {["Excel/CSV","Google Sheets","Instagram","Telegram","CRM","PDF/Word","Rasmlar","1C Buxgalteriya","Yandex Metrika","SQL Database"].map(s=>(
            <div key={s} style={{fontSize:11,color:"var(--text2)",padding:"3px 0"}}>{s}</div>
          ))}
        </div>
        <div>
          <div style={{fontFamily:"var(--fh)",fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:2,marginBottom:12}}>Aloqa</div>
          <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.8}}>
            <div>info@shonazar.uz</div>
            <div>Telegram: @biznesai_uz</div>
            <div>shonazar.uz</div>
          </div>
        </div>
      </div>
      <div style={{borderTop:"1px solid var(--border)",padding:"16px 48px",textAlign:"center",fontSize:11,color:"var(--muted)"}}>
        © 2025-2026 BiznesAI. Barcha huquqlar himoyalangan. O'zbekistonda ishlab chiqilgan.
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { setError("Hamma maydonlarni to'ldiring"); return; }
    setLoading(true); setError("");
    try {
      const res = await Auth.login(email, password);
      if (res.error) { setError(res.error); setLoading(false); }
      else onAuth(res.user);
    } catch (e) { setError(e.message || "Xatolik yuz berdi"); setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <style>{CSS}</style>
      <div className="auth-card">
        <div className="auth-logo">BIZ<span>NES</span>AI</div>
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
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 4, justifyContent: "center" }} onClick={submit} disabled={loading}>
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name || !email || !password) { setError("Hamma maydonlarni to'ldiring"); return; }
    if (password.length < 6) { setError("Parol kamida 6 ta belgi bo'lishi kerak"); return; }
    if (password !== password2) { setError("Parollar mos emas"); return; }
    setLoading(true); setError("");
    try {
      const res = await Auth.register(name, email, password);
      if (res.error) { setError(res.error); setLoading(false); }
      else onAuth(res.user);
    } catch (e) { setError(e.message || "Xatolik yuz berdi"); setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <style>{CSS}</style>
      <div className="auth-card">
        <div className="auth-logo">BIZ<span>NES</span>AI</div>
        <div className="auth-sub">Yangi hisob yarating — bepul</div>
        {error && <div className="auth-err">{error}</div>}
        {[
          { l: "Ism familiya", v: name, s: setName, t: "text", p: "Abdullayev Bobur" },
          { l: "Email", v: email, s: setEmail, t: "email", p: "email@example.com" },
          { l: "Parol", v: password, s: setPassword, t: "password", p: "Kamida 6 ta belgi" },
          { l: "Parolni takrorlang", v: password2, s: setPassword2, t: "password", p: "••••••••" },
        ].map(f => (
          <div key={f.l} className="auth-field-wrap">
            <label className="field-label">{f.l}</label>
            <input className="field" type={f.t} placeholder={f.p} value={f.v} onChange={e => f.s(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
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
      const payments = LS.get("payments_" + user.id, []);
      payments.unshift({ id: Date.now(), plan: plan.id, amount: price, method, date: new Date().toISOString(), billing, status: "paid" });
      LS.set("payments_" + user.id, payments.slice(0, 50));
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
  const [tab, setTab] = useState("profile");
  const [billing, setBilling] = useState("monthly");
  const [editName, setEditName] = useState(user.name);
  const [payModal, setPayModal] = useState(null);
  const [payments] = useState(() => LS.get("payments_" + user.id, []));

  const currentPlan = PLANS[user.plan] || PLANS.free;
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
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 15, fontWeight: 700 }}>{user.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{user.email}</div>
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
              <div className="card-title">Hisob ma'lumotlari</div>
              {[
                { l: "Ro'yxatdan o'tgan", v: new Date(user.created).toLocaleDateString("uz-UZ") },
                { l: "Oxirgi kirish", v: new Date(user.lastLogin || user.created).toLocaleDateString("uz-UZ") },
                { l: "Foydalanuvchi ID", v: user.id.slice(0, 8) + "..." },
              ].map((r, i) => (
                <div key={i} className="flex jb mb8">
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.l}</span>
                  <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: "var(--fm)" }}>{r.v}</span>
                </div>
              ))}
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
function AdminPanel({ currentUser, push, sources: adminSources }) {
  const [tab, setTab] = useState("overview");
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
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)"}}>
          <div style={{background:"var(--s1)",border:"1px solid var(--border)",borderRadius:20,padding:"32px",width:"100%",maxWidth:480,position:"relative",animation:"fadeIn .2s ease"}}>
            <button onClick={()=>{setShowAddUser(false);setAddUserError("");}} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"var(--muted)",fontSize:18,cursor:"pointer"}}>✕</button>
            <div style={{fontFamily:"var(--fh)",fontSize:18,fontWeight:800,marginBottom:4}}>Yangi foydalanuvchi</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:20}}>Ma'lumotlarni to'ldiring va tarifni tanlang</div>

            {addUserError&&<div style={{padding:"10px 14px",borderRadius:10,background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.2)",color:"#F87171",fontSize:12,marginBottom:14}}>{addUserError}</div>}

            <div style={{display:"grid",gap:14}}>
              <div>
                <label style={{display:"block",fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Ism *</label>
                <input className="field" placeholder="Ism Familiya" value={newUser.name} onChange={e=>setNewUser(p=>({...p,name:e.target.value}))} />
              </div>
              <div>
                <label style={{display:"block",fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Email *</label>
                <input className="field" type="email" placeholder="email@example.com" value={newUser.email} onChange={e=>setNewUser(p=>({...p,email:e.target.value}))} />
              </div>
              <div>
                <label style={{display:"block",fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Parol *</label>
                <input className="field" type="text" placeholder="Kamida 6 ta belgi" value={newUser.password} onChange={e=>setNewUser(p=>({...p,password:e.target.value}))} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <label style={{display:"block",fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Tarif</label>
                  <select className="field" value={newUser.plan} onChange={e=>setNewUser(p=>({...p,plan:e.target.value}))}>
                    {Object.values(PLANS).map(p=>(
                      <option key={p.id} value={p.id}>{p.nameUz} — {p.price_monthly===0?"Bepul":p.price_monthly.toLocaleString()+" so'm/oy"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{display:"block",fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Rol</label>
                  <select className="field" value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}>
                    <option value="user">Foydalanuvchi</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tanlangan tarif limiti */}
            <div style={{marginTop:16,padding:"12px 14px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--border)"}}>
              <div style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:6}}>Tarif limiti: {PLANS[newUser.plan]?.nameUz}</div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"var(--text2)"}}>
                <span>AI: <strong style={{color:PLANS[newUser.plan]?.color}}>{PLANS[newUser.plan]?.limits.ai_requests===-1?"Cheksiz":PLANS[newUser.plan]?.limits.ai_requests}</strong>/oy</span>
                <span>Fayllar: <strong>{PLANS[newUser.plan]?.limits.files===-1?"Cheksiz":PLANS[newUser.plan]?.limits.files}</strong></span>
                <span>Konnektorlar: <strong>{PLANS[newUser.plan]?.limits.connectors===-1?"Cheksiz":PLANS[newUser.plan]?.limits.connectors}</strong></span>
                <span>Hisobotlar: <strong>{PLANS[newUser.plan]?.limits.reports===-1?"Cheksiz":PLANS[newUser.plan]?.limits.reports}</strong></span>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{setShowAddUser(false);setAddUserError("");}}>Bekor qilish</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={handleAddUser} disabled={addUserLoading}>
                {addUserLoading?"Qo'shilmoqda...":"Foydalanuvchi qo'shish"}
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
        <div className="flex gap8" style={{flexWrap:"wrap"}}>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowAddUser(true)}>+ Yangi foydalanuvchi</button>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>↻ Yangilash</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ Foydalanuvchilar CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={exportPaymentCSV}>↓ To'lovlar CSV</button>
        </div>
      </div>

      {/* Tabs */}
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
        } catch(e) {
          console.error("[AdminPanel] User modal error:", e);
          return <div className="modal-overlay" onClick={() => setSelectedUser(null)}><div className="modal-box" style={{textAlign:"center",padding:32}}><div style={{color:"var(--red)",marginBottom:12}}>Xato yuz berdi</div><button className="btn btn-ghost" onClick={() => setSelectedUser(null)}>Yopish</button></div></div>;
        }
      })()}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
// DATA HUB PAGE (Constructor)
// ─────────────────────────────────────────────────────────────
function SourceItem({ src, onUpdate, onDelete, push }) {
  const [expanded, setExpanded] = useState(false);
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

  // ── Google Sheets — barcha listlarni yuklash ──
  const parseGvizResponse = (text) => {
    const jsonText = text.replace(/^[^(]*\(/, "").replace(/\);?\s*$/, "");
    return JSON.parse(jsonText);
  };

  const gvizToRows = (table) => {
    if (!table || !table.rows?.length) return { cols: [], rows: [] };
    const cols = table.cols.map(c => c.label || c.id || "col");
    const rows = table.rows.map(row => {
      const obj = {};
      row.c.forEach((cell, i) => {
        const colName = cols[i] || `col${i}`;
        if (!cell || cell.v === null || cell.v === undefined) obj[colName] = "";
        else if (cell.f) obj[colName] = cell.f;
        else obj[colName] = cell.v;
      });
      return obj;
    }).filter(obj => Object.values(obj).some(v => v !== "" && v !== null && v !== undefined));
    return { cols, rows };
  };

  const handleSheetsFetch = async () => {
    const url = (src.config?.url || "").trim();
    if (!url) { push("Google Sheets URL kiriting", "warn"); return; }
    setLoading(true);

    // Spreadsheet ID ni ajratish
    const extractId = (u) => {
      const m = u.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
      if (/^[a-zA-Z0-9_-]{20,}$/.test(u)) return u;
      return null;
    };

    const spreadsheetId = extractId(url);
    if (!spreadsheetId) {
      push("Google Sheets URL noto'g'ri. Sheets ni ochib, brauzer URL ni nusxalang.", "error");
      setLoading(false); return;
    }

    try {
      // ── 1-BOSQICH: Birinchi listni yuklash va spreadsheet haqida ma'lumot olish ──
      const firstUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&gid=0`;
      const firstRes = await fetch(firstUrl);
      if (!firstRes.ok) throw new Error("Sheet ochiq (public) emas yoki URL noto'g'ri");
      const firstText = await firstRes.text();
      const firstData = parseGvizResponse(firstText);

      if (firstData.status === "error") {
        throw new Error(firstData.errors?.[0]?.detailed_message || "Google Sheets xato. Sheet public (ochiq) qilinganmi?");
      }

      // ── 2-BOSQICH: Barcha listlarni topish (gid=0,1,2,...,9 gacha tekshirish) ──
      // Google Visualization API da list nomlari sig (signature) ga yoziladi
      const sheetsFound = []; // [{gid, name, rows, cols}]

      // Birinchi listni qo'shish
      const first = gvizToRows(firstData.table);
      if (first.rows.length > 0) {
        sheetsFound.push({ gid: 0, name: firstData.table?.cols?.[0]?.label ? "List 1" : "List 1", rows: first.rows, cols: first.cols });
      }

      // Qolgan listlarni tekshirish (gid 1-9)
      const gidCandidates = [];
      for (let g = 1; g <= 9; g++) gidCandidates.push(g);

      // Parallel fetch — tezroq ishlaydi
      const promises = gidCandidates.map(async (g) => {
        try {
          const testUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&gid=${g}`;
          const testRes = await fetch(testUrl);
          if (!testRes.ok) return null;
          const testText = await testRes.text();
          const testData = parseGvizResponse(testText);
          if (testData.status === "error") return null;
          const parsed = gvizToRows(testData.table);
          if (parsed.rows.length === 0) return null;
          return { gid: g, name: `List ${g + 1}`, rows: parsed.rows, cols: parsed.cols };
        } catch { return null; }
      });

      const results = await Promise.all(promises);
      results.forEach(r => { if (r) sheetsFound.push(r); });

      if (sheetsFound.length === 0) throw new Error("Barcha listlar bo'sh — hech qanday ma'lumot yo'q");

      // ── 3-BOSQICH: Ma'lumotlarni birlashtirish va saqlash ──
      // Agar bitta list bo'lsa — oddiy saqlash
      // Agar ko'p list bo'lsa — files/sheetData formatida saqlash (Excel kabi)
      if (sheetsFound.length === 1) {
        const sheet = sheetsFound[0];
        onUpdate({
          ...src,
          connected: true, active: true,
          data: sheet.rows,
          updatedAt: new Date().toLocaleString("uz-UZ"),
          spreadsheetName: "Google Sheet",
          config: { ...src.config, url, spreadsheetId, lastFetch: Date.now(), sheetCount: 1 },
        });
        push(`✓ Google Sheets — ${sheet.rows.length} ta qator, ${sheet.cols.length} ta ustun yuklandi`, "ok");
      } else {
        // Ko'p listli — Excel kabi sheetData formatida saqlash
        const sheetData = {};
        const sheetNames = [];
        let totalRows = 0;
        sheetsFound.forEach(s => {
          sheetData[s.name] = s.rows;
          sheetNames.push(s.name);
          totalRows += s.rows.length;
        });

        // Barcha listlar birlashtirilgan data (AI kontekst uchun)
        const allRows = sheetsFound.flatMap(s => s.rows.map(r => ({ ...r, _sheet: s.name })));

        // files formatida saqlash (Excel bilan bir xil)
        const fileEntry = {
          fileName: "Google Sheet",
          sheets: sheetNames,
          data: sheetsFound[0].rows, // Default birinchi list
          sheetData,
        };

        onUpdate({
          ...src,
          connected: true, active: true,
          data: sheetsFound[0].rows, // Default ko'rsatish uchun
          files: [fileEntry],
          activeSheet: sheetNames[0],
          updatedAt: new Date().toLocaleString("uz-UZ"),
          spreadsheetName: "Google Sheet",
          config: { ...src.config, url, spreadsheetId, lastFetch: Date.now(), sheetCount: sheetsFound.length },
        });
        push(`✓ Google Sheets — ${sheetsFound.length} ta list, jami ${totalRows.toLocaleString()} ta qator yuklandi`, "ok");
      }

    } catch (e) {
      push("Ulanib bo'lmadi: " + e.message + ". Sheet ochiq (public) qilinganmi?", "error");
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

  // ── DOCUMENT (PDF/Word/TXT) — faylni o'qib data ga saqlash ──
  const docFileRef = useRef(null);
  const handleDocumentFiles = async (files) => {
    setLoading(true);
    const results = [];
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      try {
        if (ext === 'txt' || ext === 'csv' || ext === 'log' || ext === 'md') {
          const text = await file.text();
          results.push({ fileName: file.name, type: ext, content: text, size: file.size, lines: text.split('\n').length });
        } else if (ext === 'pdf') {
          // PDF — base64 saqlaymiz, AI tahlil qiladi
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = ''; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          // PDF dan matn ajratish (oddiy regex — PDF text extraction)
          const textChunks = [];
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const raw = decoder.decode(buf);
          // BT...ET orasidagi Tj/TJ operatorlardan matn olish
          const tjMatches = raw.match(/\(([^)]{2,})\)\s*Tj/g) || [];
          tjMatches.forEach(m => { const t = m.match(/\(([^)]+)\)/); if (t) textChunks.push(t[1]); });
          const extractedText = textChunks.join(' ').substring(0, 50000) || `[PDF fayl: ${file.name}, ${(file.size/1024).toFixed(1)}KB — matn ajratib bo'lmadi]`;
          results.push({ fileName: file.name, type: 'pdf', content: extractedText, size: file.size, pages: (raw.match(/\/Type\s*\/Page[^s]/g) || []).length || 1 });
        } else if (ext === 'docx') {
          // DOCX — ZIP ichidagi word/document.xml dan matn olish
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          // PK zip signature tekshirish
          if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
            // Oddiy XML extraction — word/document.xml topish
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const raw = decoder.decode(buf);
            // XML taglardan matn ajratish
            const xmlContent = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
            const text = xmlContent.map(t => t.replace(/<[^>]+>/g, '')).join(' ');
            results.push({ fileName: file.name, type: 'docx', content: text.substring(0, 50000) || `[Word fayl: ${file.name}]`, size: file.size });
          } else {
            results.push({ fileName: file.name, type: 'docx', content: `[Word fayl: ${file.name}, ${(file.size/1024).toFixed(1)}KB]`, size: file.size });
          }
        } else if (ext === 'doc') {
          results.push({ fileName: file.name, type: 'doc', content: `[DOC fayl: ${file.name}, ${(file.size/1024).toFixed(1)}KB — eski format, DOCX ga aylantiring]`, size: file.size });
        } else {
          const text = await file.text().catch(() => `[Fayl: ${file.name}]`);
          results.push({ fileName: file.name, type: ext, content: text.substring(0, 50000), size: file.size });
        }
      } catch (e) { push(`Fayl o'qishda xato (${file.name}): ${e.message}`, "error"); }
    }
    if (results.length) {
      const data = results.map((r, i) => ({
        id: i + 1,
        fayl_nomi: r.fileName,
        tur: r.type,
        hajm_kb: Math.round(r.size / 1024),
        sahifalar: r.pages || null,
        qatorlar: r.lines || null,
        matn: r.content?.substring(0, 500) + (r.content?.length > 500 ? '...' : ''),
        toliq_matn: r.content,
      }));
      onUpdate({ ...src, connected: true, active: true, data, files: results.map(r => ({ fileName: r.fileName, type: r.type, size: r.size })), updatedAt: new Date().toLocaleString("uz-UZ") });
      push(`✓ ${results.length} ta hujjat yuklandi`, "ok");
    }
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
          description: `Rasm: ${file.name} (${dims.w}x${dims.h}, ${(file.size/1024).toFixed(1)}KB)`,
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
    const res = await fetch(url);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error("API javob xato: " + text.substring(0, 120)); }
    if (json.error) throw new Error(json.error.message || "Facebook API xato");
    return json;
  };

  // ── Instagram Business Account ma'lumotlarini tortish ──
  const handleInstagramFetch = async () => {
    const token = (src.config?.token || "").trim();
    if (!token) { push("Instagram Access Token kiriting", "warn"); return; }
    setLoading(true);
    try {
      // 1. Facebook sahifalardan Instagram Business Account ID ni topish
      const pages = await fbFetch(`v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${token}`);
      const igAccount = pages.data?.find(p => p.instagram_business_account);
      if (!igAccount?.instagram_business_account?.id) {
        throw new Error("Instagram Business Account topilmadi. Token Facebook sahifasiga ulangan va Instagram Professional Account bo'lishi kerak.");
      }
      const igId = igAccount.instagram_business_account.id;

      // 2. Profil ma'lumotlari (followers, bio, va h.k.)
      const profile = await fbFetch(`v21.0/${igId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url&access_token=${token}`);

      // 3. Postlar — like_count, comments_count bilan
      let posts = [];
      try {
        const mediaJson = await fbFetch(`v21.0/${igId}/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=50&access_token=${token}`);
        posts = (mediaJson.data || []).map(p => ({
          id: p.id,
          caption: (p.caption || "").substring(0, 120),
          type: p.media_type,
          date: p.timestamp?.slice(0, 10) || "",
          time: p.timestamp?.slice(11, 16) || "",
          likes: p.like_count || 0,
          comments: p.comments_count || 0,
          engagement: (p.like_count || 0) + (p.comments_count || 0),
          url: p.permalink || "",
        }));
      } catch (e2) { push("Postlarni yuklab bo'lmadi: " + e2.message, "warn"); }

      // 4. Statistika hisoblash
      const totalLikes = posts.reduce((a, p) => a + (p.likes || 0), 0);
      const totalComments = posts.reduce((a, p) => a + (p.comments || 0), 0);
      const totalEngagement = totalLikes + totalComments;
      const avgLikes = posts.length ? Math.round(totalLikes / posts.length) : 0;
      const avgComments = posts.length ? Math.round(totalComments / posts.length) : 0;
      const sortedPosts = [...posts].sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
      const topPost = sortedPosts[0];
      const typeCount = posts.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {});

      // 5. Profil summary
      const summary = {
        _type: "PROFIL_STATISTIKA",
        username: profile.username,
        name: profile.name || "",
        biography: (profile.biography || "").substring(0, 200),
        followers_count: profile.followers_count || 0,
        follows_count: profile.follows_count || 0,
        total_posts: profile.media_count || 0,
        fetched_posts: posts.length,
        post_types: typeCount,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_engagement: totalEngagement,
        avg_likes_per_post: avgLikes,
        avg_comments_per_post: avgComments,
        top_post_caption: topPost?.caption || "—",
        top_post_engagement: topPost?.engagement || 0,
        last_updated: new Date().toLocaleString("uz-UZ"),
      };

      const data = [summary, ...posts];
      onUpdate({
        ...src,
        connected: true, active: true, data,
        updatedAt: new Date().toLocaleString("uz-UZ"),
        profileName: profile.username,
        config: { ...src.config, token, igId, lastFetch: Date.now() },
      });
      push(`✓ @${profile.username} — ${profile.followers_count?.toLocaleString()} followers, ${posts.length} post, ${totalLikes.toLocaleString()} like yuklandi`, "ok");
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

  // ── Manba turaga qarab yangilash ──
  const handleRefreshData = async () => {
    if (src.type === "instagram") return handleInstagramFetch();
    if (src.type === "telegram") return handleTelegramFetch();
    if (src.type === "sheets") return handleSheetsFetch();
    if (src.type === "restapi") return handleAPIFetch();
    if (src.type === "crm") return handleCrmFetch();
    if (src.type === "onec") return handle1CFetch();
    if (src.type === "yandex") return handleYandexFetch();
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

  return (
    <div className={`source-item ${src.active && src.connected ? "active-src" : "inactive-src"}`}>
      {/* Header */}
      <div className="src-header">
        <div className="src-color-dot" style={{ background: src.color || st.color }} />
        <div className="f1">
          <div className="src-name">{src.name}</div>
          <div className="src-meta">
            <span style={{ color: st.color }}>{st.icon} {st.label}</span>
            {src.connected && <span style={{ marginLeft: 8, color: "var(--green)" }}>· {src.data?.length || 0} qator</span>}
            {src.updatedAt && <span style={{ marginLeft: 8, color: "var(--muted)" }}>· {src.updatedAt}</span>}
          </div>
        </div>
        <div className="src-actions">
          {src.connected && (
            <span className="badge b-ok text-xs">{src.data?.length || 0}</span>
          )}
          {src.connected && ["instagram", "telegram", "sheets", "restapi", "crm"].includes(src.type) && (
            <button className="btn btn-ghost btn-xs" onClick={handleRefreshData} disabled={loading} title="Yangilash">{loading ? "" : "↻"}</button>
          )}
          {/* active toggle */}
          <button className="src-toggle" style={{ background: src.active ? "var(--green)" : "var(--s4)" }}
            onClick={() => onUpdate({ ...src, active: !src.active })}>
            <div style={{ width: 13, height: 13, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: src.active ? 18 : 2, transition: "left .2s" }} />
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => setExpanded(e => !e)}>{expanded ? "▲" : "▼"}</button>
          <button className="btn btn-danger btn-xs" onClick={() => onDelete(src.id)}>✕</button>
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
              <div className={`drop-zone ${drag?"drag":""}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleExcelFiles([...e.dataTransfer.files]); }}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                  onChange={e => handleExcelFiles([...e.target.files])} />
                <div style={{fontSize:52,marginBottom:12,filter:"drop-shadow(0 4px 12px rgba(74,222,128,0.3))"}}>{loading?"⏳":"📊"}</div>
                <div style={{fontFamily:"var(--fh)",fontSize:16,fontWeight:700,marginBottom:6,color:"var(--text)"}}>{loading?"Yuklanmoqda...":"Excel fayllarni bu yerga tashlang"}</div>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:8}}>yoki bosib tanlang</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
                  {["XLSX","XLS","CSV"].map(t=>(
                    <span key={t} style={{padding:"3px 10px",borderRadius:20,background:"rgba(74,222,128,0.1)",color:"#4ADE80",fontSize:10,fontFamily:"var(--fh)",fontWeight:600,border:"1px solid rgba(74,222,128,0.15)"}}>{t}</span>
                  ))}
                </div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:12}}>Bir vaqtda ko'p fayl yuklash mumkin</div>
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

          {/* SHEETS */}
          {src.type === "sheets" && (
            <div>
              <div style={{ background: "var(--s3)", borderRadius: 8, padding: "12px 14px", fontSize: 10.5, lineHeight: 1.9, color: "var(--muted)", marginBottom: 12, border: "1px solid var(--border)" }}>
                <div style={{ color: "#60A5FA", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>Google Sheets Ulash:</div>
                <div>1. Google Sheets ni oching</div>
                <div>2. <strong style={{ color: "var(--gold)" }}>Ulashish (Share)</strong> → "Havola orqali ulashish" → <span style={{ color: "var(--green)" }}>"Havolaga ega har kim ko'rishi mumkin"</span></div>
                <div>3. Brauzer <strong style={{ color: "var(--text2)" }}>URL</strong> ni nusxa oling va pastga joylashtiring</div>
                <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(96,165,250,0.08)", borderRadius: 6, border: "1px solid rgba(96,165,250,0.15)" }}>
                  <span style={{ color: "#60A5FA", fontWeight: 600 }}>Masalan:</span> <span style={{ color: "var(--muted)", fontSize: 9, fontFamily: "var(--fm)" }}>https://docs.google.com/spreadsheets/d/1abc.../edit</span>
                </div>
              </div>
              <label className="field-label">Google Sheets URL</label>
              <input className="field mb8" placeholder="https://docs.google.com/spreadsheets/d/..." value={src.config?.url || ""} onChange={e => updateConfig("url", e.target.value)} />
              <div className="flex gap8 mb10">
                <button className="btn btn-primary btn-sm" onClick={handleSheetsFetch} disabled={loading || !src.config?.url}>
                  {loading ? " Yuklanmoqda..." : " Ulash va Yuklash"}
                </button>
                {src.connected && src.data?.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleSheetsFetch} disabled={loading}>↻ Yangilash</button>
                )}
              </div>
              {src.connected && src.spreadsheetName && (
                <div style={{ fontSize: 11, color: "#60A5FA", marginBottom: 8 }}>
                   <strong>{src.spreadsheetName}</strong> ulangan
                  {src.config?.lastFetch && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· oxirgi: {new Date(src.config.lastFetch).toLocaleString("uz-UZ")}</span>}
                </div>
              )}
              {/* Avtomatik yangilash */}
              {src.connected && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--s3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div className="flex aic jb">
                    <label className="field-label" style={{ marginBottom: 0 }}>Avtomatik Yangilash</label>
                    <select className="field" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }} value={src.config?.autoRefresh || 0} onChange={e => updateConfig("autoRefresh", Number(e.target.value))}>
                      <option value={0}>O'chirilgan</option>
                      <option value={15}>Har 15 daqiqa</option>
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
              <div style={{ background: "var(--s3)", borderRadius: 8, padding: "10px 13px", fontSize: 10.5, lineHeight: 1.9, color: "var(--muted)", marginBottom: 12, border: "1px solid var(--border)" }}>
                <div style={{ color: "#E879F9", fontWeight: 700, marginBottom: 4, fontFamily: "var(--fh)" }}>Instagram Graph API o'rnatish:</div>
                <div>1. <span style={{ color: "var(--text2)" }}>developers.facebook.com</span> → My Apps → Create App</div>
                <div>2. Instagram Basic Display qo'shing → <span style={{ color: "var(--gold)" }}>Valid OAuth Redirect URI</span> kiriting</div>
                <div>3. <span style={{ color: "var(--text2)" }}>User Token Generator</span> → Generate Token</div>
                <div>4. Token 60 kun amal qiladi — <span style={{ color: "var(--teal)" }}>Long-Lived Token</span> almashtirishni unutmang</div>
              </div>
              <label className="field-label">Instagram Access Token</label>
              <input className="field mb8" type="password" placeholder="IGQVJWZAmN3..." value={src.config?.token || ""} onChange={e => updateConfig("token", e.target.value)} />
              <div className="flex gap8 mb10">
                <button className="btn btn-primary btn-sm" onClick={handleInstagramFetch} disabled={loading || !src.config?.token}>
                  {loading ? " Yuklanmoqda..." : " Ulash va Yuklash"}
                </button>
                {src.connected && src.data?.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleInstagramFetch} disabled={loading}>↻ Yangilash</button>
                )}
              </div>
              {src.profileName && (
                <div style={{ fontSize: 11, color: "#E879F9", marginBottom: 8 }}>
                   <strong>@{src.profileName}</strong> ulangan
                  {src.config?.lastFetch && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· oxirgi: {new Date(src.config.lastFetch).toLocaleString("uz-UZ")}</span>}
                </div>
              )}
              {/* Avtomatik yangilash */}
              {src.connected && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--s3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div className="flex aic jb">
                    <label className="field-label" style={{ marginBottom: 0 }}>Avtomatik Yangilash</label>
                    <select className="field" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }} value={src.config?.autoRefresh || 0} onChange={e => updateConfig("autoRefresh", Number(e.target.value))}>
                      <option value={0}>O'chirilgan</option>
                      <option value={15}>Har 15 daqiqa</option>
                      <option value={30}>Har 30 daqiqa</option>
                      <option value={60}>Har 1 soat</option>
                      <option value={360}>Har 6 soat</option>
                      <option value={1440}>Har 24 soat</option>
                    </select>
                  </div>
                  {src.config?.autoRefresh > 0 && <div style={{ fontSize: 9.5, color: "var(--teal)", marginTop: 5 }}>⟳ Har {src.config.autoRefresh} daqiqada avtomatik yangilanadi</div>}
                </div>
              )}
            </div>
          )}

          {/* TELEGRAM */}
          {src.type === "telegram" && (
            <div>
              <div style={{ background: "var(--s3)", borderRadius: 8, padding: "12px 14px", fontSize: 10.5, lineHeight: 1.9, color: "var(--muted)", marginBottom: 12, border: "1px solid var(--border)" }}>
                <div style={{ color: "#38BDF8", fontWeight: 700, marginBottom: 6, fontFamily: "var(--fh)", fontSize: 12 }}>Telegram Kanal Statistikasi Olish:</div>
                <div>1. <span style={{ color: "var(--teal)" }}>@BotFather</span> da bot yarating (<span style={{ color: "var(--gold)" }}>/newbot</span>)</div>
                <div>2. Berilgan <span style={{ color: "var(--text2)" }}>Bot Token</span> ni nusxa oling</div>
                <div>3. Kanalingiz sozlamalarida botni <strong style={{ color: "var(--gold)" }}>admin</strong> sifatida qo'shing</div>
                <div>4. Kanal username ni kiriting (masalan: <span style={{ color: "var(--teal)" }}>@kanal_nomi</span>)</div>
                <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(56,189,248,0.08)", borderRadius: 6, border: "1px solid rgba(56,189,248,0.15)" }}>
                  <span style={{ color: "#38BDF8", fontWeight: 600 }}>Muhim:</span> Bot kanalga admin bo'lishi kerak (hech bo'lmaganda "Post Messages" ruxsati). Shunda kanal obunachilar soni, postlar, ko'rishlar va boshqa statistikani oladi.
                </div>
              </div>
              <div className="g2 mb10">
                <div>
                  <label className="field-label">Bot Token</label>
                  <input className="field" type="password" placeholder="7123456789:AAHbKx8Gz..." value={src.config?.token || ""} onChange={e => updateConfig("token", e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Kanal Username yoki ID</label>
                  <input className="field" placeholder="@kanal_nomi yoki -100123456789" value={src.config?.channelId || ""} onChange={e => updateConfig("channelId", e.target.value)} />
                </div>
              </div>
              <div className="flex gap8 mb10">
                <button className="btn btn-primary btn-sm" onClick={handleTelegramFetch} disabled={loading || !src.config?.token || !src.config?.channelId}>
                  {loading ? " Yuklanmoqda..." : " Ulash va Statistika Olish"}
                </button>
                {src.connected && src.data?.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleTelegramFetch} disabled={loading}>↻ Yangilash</button>
                )}
              </div>
              {src.profileName && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#38BDF8", marginBottom: 8, padding: "8px 12px", background: "rgba(56,189,248,0.06)", borderRadius: 8, border: "1px solid rgba(56,189,248,0.15)" }}>
                  <span style={{ fontSize: 18 }}></span>
                  <div className="f1">
                    <strong>{src.profileName}</strong> ulangan
                    {src.config?.lastFetch && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· oxirgi: {new Date(src.config.lastFetch).toLocaleString("uz-UZ")}</span>}
                  </div>
                  {src.data?.find(d => d._type === "KANAL_STATISTIKA") && (
                    <span style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--fm)" }}>
                      {(src.data.find(d => d._type === "KANAL_STATISTIKA").member_count || 0).toLocaleString()} obunachi
                    </span>
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
                      <option value={5}>Har 5 daqiqa</option>
                      <option value={15}>Har 15 daqiqa</option>
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
              <input ref={docFileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.csv,.md,.log,.rtf" style={{display:"none"}}
                onChange={e=>{ if(e.target.files.length) handleDocumentFiles(Array.from(e.target.files)); e.target.value=""; }} />
              <div className={`drop-zone drop-doc ${drag?"drag":""}`}
                onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleDocumentFiles(Array.from(e.dataTransfer.files));}}
                onClick={()=>docFileRef.current?.click()}>
                <div style={{fontSize:52,marginBottom:12,filter:"drop-shadow(0 4px 12px rgba(248,113,113,0.3))"}}>📄</div>
                <div style={{fontFamily:"var(--fh)",fontSize:16,fontWeight:700,marginBottom:6,color:"var(--text)"}}>Hujjatlarni bu yerga tashlang</div>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:8}}>yoki bosib tanlang</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
                  {["PDF","DOCX","TXT","CSV","MD"].map(t=>(
                    <span key={t} style={{padding:"3px 10px",borderRadius:20,background:"rgba(248,113,113,0.1)",color:"#F87171",fontSize:10,fontFamily:"var(--fh)",fontWeight:600,border:"1px solid rgba(248,113,113,0.15)"}}>{t}</span>
                  ))}
                </div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:12,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:14}}>🤖</span> AI hujjat mazmunini o'qib tahlil qiladi
                </div>
              </div>
              {src.files?.length>0&&(
                <div style={{marginTop:12,padding:12,background:"var(--s2)",borderRadius:12,border:"1px solid var(--border)"}}>
                  <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Yuklangan fayllar ({src.files.length})</div>
                  {src.files.map((f,i)=>(
                    <div key={i} style={{fontSize:12,padding:"8px 12px",background:"var(--s1)",borderRadius:8,marginBottom:4,display:"flex",alignItems:"center",gap:8,border:"1px solid var(--border2)"}}>
                      <span style={{fontSize:18}}>{f.type==='pdf'?'📕':f.type==='docx'?'📘':f.type==='txt'?'📝':'📋'}</span>
                      <span style={{flex:1,fontWeight:600,fontSize:12}}>{f.fileName}</span>
                      <span style={{padding:"2px 8px",borderRadius:12,background:"rgba(248,113,113,0.1)",color:"#F87171",fontSize:9,fontFamily:"var(--fh)",fontWeight:700}}>{f.type?.toUpperCase()}</span>
                      <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--fm)"}}>{Math.round((f.size||0)/1024)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* IMAGE (Rasm tahlili) */}
          {src.type === "image" && (
            <div>
              <input ref={imgFileRef} type="file" multiple accept="image/*" style={{display:"none"}}
                onChange={e=>{ if(e.target.files.length) handleImageFiles(Array.from(e.target.files)); e.target.value=""; }} />
              <div className={`drop-zone drop-img ${drag?"drag":""}`}
                onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleImageFiles(Array.from(e.dataTransfer.files));}}
                onClick={()=>imgFileRef.current?.click()}>
                <div style={{fontSize:52,marginBottom:12,filter:"drop-shadow(0 4px 12px rgba(236,72,153,0.3))"}}>🖼️</div>
                <div style={{fontFamily:"var(--fh)",fontSize:16,fontWeight:700,marginBottom:6,color:"var(--text)"}}>Rasmlarni bu yerga tashlang</div>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:8}}>yoki bosib tanlang</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
                  {["JPG","PNG","GIF","WebP","SVG"].map(t=>(
                    <span key={t} style={{padding:"3px 10px",borderRadius:20,background:"rgba(236,72,153,0.1)",color:"#EC4899",fontSize:10,fontFamily:"var(--fh)",fontWeight:600,border:"1px solid rgba(236,72,153,0.15)"}}>{t}</span>
                  ))}
                </div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:12,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:14}}>🤖</span> AI rasm mazmunini tavsiflaydi va tahlil qiladi
                </div>
              </div>
              {src.data?.length>0&&(
                <div style={{marginTop:12}}>
                  <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--fh)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Yuklangan rasmlar ({src.data.length})</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:10}}>
                    {src.data.slice(0,12).map((r,i)=>(
                      <div key={i} style={{borderRadius:12,overflow:"hidden",border:"2px solid var(--border)",aspectRatio:"1",position:"relative",transition:"all .2s",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(236,72,153,0.4)"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                        {r.rasm_url?<img src={r.rasm_url} alt={r.fayl_nomi} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:
                        <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s2)",fontSize:24}}>🖼️</div>}
                        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"4px 6px",background:"linear-gradient(transparent,rgba(0,0,0,0.7))",fontSize:8,color:"#fff",fontFamily:"var(--fm)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.fayl_nomi}</div>
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
              <input className="field mb8" placeholder="http://server:8080/base" value={src.config?.onecUrl||""} onChange={e=>updateConfig("onecUrl",e.target.value)} />
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">Login</label>
                  <input className="field" placeholder="Administrator" value={src.config?.onecLogin||""} onChange={e=>updateConfig("onecLogin",e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">Parol</label>
                  <input className="field" type="password" value={src.config?.onecPassword||""} onChange={e=>updateConfig("onecPassword",e.target.value)} />
                </div>
              </div>
              <div className="notice text-xs text-muted mb8" style={{padding:8,borderRadius:6,border:"1px solid var(--border)"}}>
                1C:Enterprise OData API yoqilgan bo'lishi kerak. Sozlamalar → Umumiy → HTTP xizmatlar → OData
              </div>
              <button className="btn btn-primary btn-sm" onClick={handle1CFetch} disabled={loading}>
                {loading?"Yuklanmoqda...":"🏦 1C dan yuklash"}
              </button>
            </div>
          )}

          {/* YANDEX METRIKA */}
          {src.type === "yandex" && (
            <div>
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">Counter ID</label>
                  <input className="field" placeholder="12345678" value={src.config?.ymCounter||""} onChange={e=>updateConfig("ymCounter",e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">OAuth Token</label>
                  <input className="field" type="password" placeholder="y0_AgA..." value={src.config?.ymToken||""} onChange={e=>updateConfig("ymToken",e.target.value)} />
                </div>
              </div>
              <div className="notice text-xs text-muted mb8" style={{padding:8,borderRadius:6,border:"1px solid var(--border)"}}>
                Token olish: <a href="https://oauth.yandex.com/authorize?response_type=token&client_id=764adcc8e4774061bafdd1e1b1751e82" target="_blank" rel="noreferrer" style={{color:"var(--teal)"}}>Yandex OAuth →</a>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleYandexFetch} disabled={loading}>
                {loading?"Yuklanmoqda...":"📈 Metrika yuklash"}
              </button>
            </div>
          )}

          {/* SQL DATABASE */}
          {src.type === "database" && (
            <div>
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">DB turi</label>
                  <select className="field" value={src.config?.dbType||"postgresql"} onChange={e=>updateConfig("dbType",e.target.value)}>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>
                <div className="f1">
                  <label className="field-label">Host</label>
                  <input className="field" placeholder="localhost" value={src.config?.dbHost||""} onChange={e=>updateConfig("dbHost",e.target.value)} />
                </div>
                <div style={{width:80}}>
                  <label className="field-label">Port</label>
                  <input className="field" placeholder="5432" value={src.config?.dbPort||""} onChange={e=>updateConfig("dbPort",e.target.value)} />
                </div>
              </div>
              <div className="flex gap8 mb8">
                <div className="f1">
                  <label className="field-label">Database</label>
                  <input className="field" placeholder="mydb" value={src.config?.dbName||""} onChange={e=>updateConfig("dbName",e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">Login</label>
                  <input className="field" placeholder="user" value={src.config?.dbUser||""} onChange={e=>updateConfig("dbUser",e.target.value)} />
                </div>
                <div className="f1">
                  <label className="field-label">Parol</label>
                  <input className="field" type="password" value={src.config?.dbPass||""} onChange={e=>updateConfig("dbPass",e.target.value)} />
                </div>
              </div>
              <label className="field-label">SQL Query</label>
              <textarea className="field mb8" rows={3} placeholder="SELECT * FROM sales ORDER BY date DESC LIMIT 100" value={src.config?.dbQuery||""} onChange={e=>updateConfig("dbQuery",e.target.value)} style={{fontFamily:"var(--fm)",fontSize:12}} />
              <div className="notice text-xs text-muted mb8" style={{padding:8,borderRadius:6,border:"1px solid var(--border)"}}>
                SQL ulanish backend API orqali ishlaydi. Xavfsizlik uchun to'g'ridan-to'g'ri brauzerdan ulanib bo'lmaydi.
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleDatabaseTest} disabled={loading}>
                {loading?"Ulanmoqda...":"🗄️ Ulanish va yuklash"}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DATA HUB PAGE (Constructor)
// ─────────────────────────────────────────────────────────────

function DataHubPage({ sources, setSources, push, user }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("var(--teal)");

  const SOURCE_COLORS = ["var(--teal)", "var(--green)", "#FF6B35", "#FFD166", "#A855F7", "#FF3366", "#4D9DE0", "var(--gold)", "var(--teal)", "#F72585"];

  const addSource = () => {
    if (!newType || !newName.trim()) { push("Nomi va turini tanlang", "warn"); return; }

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
      createdAt: new Date().toLocaleDateString("uz-UZ"),
    };
    const updated = [...sources, src];
    setSources(updated); saveSources(updated, user?.id);
    SourcesAPI.create({ id: src.id, type: src.type, name: src.name, color: src.color, config: src.config }).catch(() => { });
    setAdding(false); setNewType(null); setNewName(""); push("✓ Yangi manba qo'shildi", "ok");
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
        <div className="add-panel mb16">
          <div className="section-hd mb12">Manba Turi Tanlang</div>
          <div className="type-grid">
            {Object.values(SOURCE_TYPES).map(st => (
              <div key={st.id} className={`type-card ${newType === st.id ? "selected" : ""}`} onClick={() => setNewType(st.id)}
                style={newType === st.id ? { borderColor: st.color, background: `${st.color}0F` } : {}}>
                {newType === st.id && <div style={{ position: "absolute", top: 6, right: 6, width: 14, height: 14, borderRadius: 7, background: st.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#000", fontWeight: 700 }}>✓</div>}
                <div className="type-card-ico">{st.icon}</div>
                <div className="type-card-lbl" style={newType === st.id ? { color: st.color } : {}}>{st.label}</div>
                <div className="type-card-desc">{st.desc}</div>
              </div>
            ))}
          </div>
          {newType && (
            <div className="flex gap10 aic flex-wrap mt10">
              <div className="f1">
                <label className="field-label">Manba Nomi</label>
                <input className="field" placeholder={`Masalan: "Aprel Savdo", "Filial 1 CRM"...`} value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSource()} />
              </div>
              <div>
                <label className="field-label">Rang</label>
                <div className="flex gap4">
                  {SOURCE_COLORS.map(c => (
                    <div key={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, cursor: "pointer", border: newColor === c ? "2px solid #fff" : "2px solid transparent", transition: "all .15s" }} onClick={() => setNewColor(c)} />
                  ))}
                </div>
              </div>
              <div className="flex gap6" style={{ alignSelf: "flex-end" }}>
                <button className="btn btn-primary btn-sm" onClick={addSource}>Qo'shish</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewType(null); }}>Bekor</button>
              </div>
            </div>
          )}
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
        sources.map(src => (
          <SourceItem key={src.id} src={src} onUpdate={updateSource} onDelete={deleteSource} push={push} />
        ))
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
  const cacheKey = "u_" + (user?.id || "anon") + "_charts_" + (workingSource?.id || "none");
  const [aiCards, setAiCards] = useState(() => {
    try { return LS.get(cacheKey, []); } catch { return []; }
  });

  // Cache ga yozish (aiCards o'zgarganda)
  useEffect(() => {
    if (aiCards.length > 0 && workingSource?.id) {
      LS.set(cacheKey, aiCards);
    }
  }, [aiCards, cacheKey]);

  // Manba o'zgarganda — cache dan yuklash (reset EMAS!)
  useEffect(() => {
    if (!workingSource?.id) return;
    const cached = LS.get(cacheKey, []);
    setAiCards(Array.isArray(cached) ? cached : []);
    setAiError("");
    setLastQuery("");
  }, [workingSource?.id]);

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
      { icon: "", text: "Umumiy statistika va asosiy raqamlar: jami, o'rtacha, min, max ko'rsatkichlar", c: "#00C9BE" },
      { icon: "", text: "Tendensiya va o'zgarish: vaqt bo'yicha trend, o'sish yoki pasayish", c: "#4ADE80" },
      { icon: "", text: "Top va eng yaxshi ko'rsatkichlar: eng yuqori qiymatlar, reyting", c: "#FBBF24" },
      { icon: "", text: "Solishtirma tahlil: kategoriyalar bo'yicha solishtirish", c: "#60A5FA" },
      { icon: "", text: "Moliyaviy ko'rsatkichlar: daromad, xarajat, foyda, rentabellik", c: "#4ADE80" },
      { icon: "", text: "KPI va maqsadlar: asosiy ko'rsatkichlar holati", c: "#F87171" },
    ];
  }, [workingSource?.id, workingSource?.type]);

  // AI TAHLIL — foydalanuvchi so'rovi asosida raqamlar va chartlar yaratish
  const runAiCharts = async (queryText) => {
    const query = queryText || userQuery;
    if (!query.trim() || !workingSource?.data?.length || !aiConfig?.apiKey) return;
    // AI limit tekshirish
    if (!hasPersonalKey && user && !Auth.checkLimit(user, "ai_requests", sources)) {
      const info = Auth.getLimitInfo(user, "ai_requests", sources);
      setAiError(`AI so'rov limiti tugadi (${info.label}). Tarifni yangilang yoki shaxsiy API kalit ulang.`);
      return;
    }
    setAiLoading(true); setAiError(""); setLastQuery(query);

    try {
      const ctx = buildMergedContext([workingSource]);
      const srcType = SOURCE_TYPES[workingSource.type];

      const prompt = `Sen — yuqori malakali biznes data tahlilchisi. Biznes egasi quyidagi GRAFIK so'rovini berdi:

"${query}"

MANBA: "${workingSource.name}" (${srcType?.label || workingSource.type}, ${workingSource.data.length} ta yozuv)

MA'LUMOTLAR:${ctx}

VAZIFANG:
1. Ma'lumotlarni CHUQUR TAHLIL QIL — har bir raqamni hisoblash, solishtirish, foizini chiqar
2. HAQIQIY, TUSHUNARLI grafiklar yarat — biznes egasi bir qarashda TUSHUNISHI kerak
3. Har bir grafik SARLAVHASI aniq bo'lsin — "Oylik savdo dinamikasi (mln so'm)" kabi, nima ekanini ko'rsatsin
4. Grafik DATA aniq, HAQIQIY raqamlardan iborat bo'lsin — taxminiy EMAS
5. LABEL lar tushunarli bo'lsin — "cat1" emas, "Yanvar", "Guruh A", "Lidlar" kabi
6. Stats kartada MUHIM KO'RSATKICHLAR bo'lsin — jami, o'rtacha, o'sish %, eng yuqori, eng past
7. Highlight kartada AMALIY XULOSALAR bo'lsin — muammo va tavsiya

GRAFIK QOIDALARI:
- Pie chart — 3-7 ta segment, kichik segmentlarni "Boshqa" ga birlashtir
- Bar chart — max 8-10 ta ustun, eng muhimlarini ko'rsat
- Line chart — vaqt bo'yicha trend, kamida 4 nuqta
- X-axis labellar QISQA bo'lsin — max 10 belgi (masalan: "Yan", "Fev", "Mart", "Guruh-1")
- Raqamlar tushunarli bo'lsin — 1500000 emas, "1.5M" yoki "1,500,000"
- Har bir grafik biznes egasiga FOYDALI bo'lishi SHART
- BIRINCHI karta ALBATTA "stats" turi bo'lsin — asosiy raqamlar
- OXIRGI karta "highlight" turi bo'lsin — XULOSALAR va TAVSIYALAR
- keys massivida O'ZBEK nomlari ishlatilsin: "daromad", "xarajat", "foyda" (inglizcha emas!)
- Pie data: name ham O'ZBEK tilida bo'lsin

\`\`\`json
{
  "cards": [
    {
      "type": "stats",
      "title": "Sarlavha (o'zbekcha)",
      "icon": "emoji",
      "stats": [
        {"l":"Ko'rsatkich nomi","v":"123","c":"#rang","i":"emoji"},
        {"l":"Yana biri","v":"456K","c":"#rang","i":"emoji"}
      ]
    },
    {
      "type": "chart",
      "title": "Grafik sarlavhasi (o'zbekcha)",
      "icon": "emoji",
      "chartType": "bar|line|area|pie|scatter",
      "data": [{"name":"Label1","qiymat":100},{"name":"Label2","qiymat":200}],
      "keys": ["qiymat"],
      "xKey": "name",
      "colors": ["#00C9BE","#E8B84B"]
    },
    {
      "type": "chart",
      "chartType": "pie",
      "title": "Taqsimot",
      "icon": "emoji",
      "data": [{"name":"Kategoriya1","value":50},{"name":"Kategoriya2","value":30}],
      "colors": ["#00C9BE","#E8B84B","#A78BFA","#4ADE80","#F87171","#60A5FA"]
    },
    {
      "type": "gauge",
      "title": "Foiz ko'rsatkich",
      "icon": "emoji",
      "value": 73,
      "max": 100,
      "label": "73%",
      "color": "#4ADE80"
    },
    {
      "type": "highlight",
      "title": "Asosiy xulosalar",
      "icon": "emoji",
      "items": [
        {"l":"Xulosa 1","v":"qiymat","c":"#rang"},
        {"l":"Xulosa 2","v":"qiymat","c":"#rang"}
      ]
    }
  ]
}
\`\`\`

QOIDALAR:
1. Ma'lumotlardan HAQIQIY RAQAMLAR hisoblab chiqar — taxminiy emas, ANIQ!
2. Har bir chart uchun DATA arrayini O'ZING tuzib ber — foydalanuvchining raw datasidan hisobla
3. Barcha matn O'ZBEK tilida
4. Ranglar: #00C9BE (teal), #E8B84B (gold), #A78BFA (purple), #4ADE80 (green), #F87171 (red), #60A5FA (blue), #FB923C (orange), #E879F9 (pink), #FBBF24 (yellow), #38BDF8 (sky)

KARTALAR TARTIBI VA TARKIBI (QATTIQ QOIDA):
- BIRINCHI KARTA: "stats" turi — ASOSIY RAQAMLAR. Jami, o'rtacha, eng yuqori, eng past, o'sish %. Kamida 4-6 ta raqamli ko'rsatkich. Bu eng MUHIM karta!
- IKKINCHI KARTA: "stats" turi — SOLISHTIRMA RAQAMLAR. O'tgan davr bilan solishtirish, foizlar, nisbatlar. Chartga SIG'MAYDIGAN muhim raqamlar shu yerda bo'lsin.
- KEYIN: 2-3 ta "chart" turidagi kartalar — vizual grafiklar (bar, line, pie)
- OXIRGI KARTA: "highlight" turi — XULOSALAR va AMALIY TAVSIYALAR. Kamida 4-5 ta xulosa.

MUHIM: Ba'zi raqamlar chartga mos EMAS (masalan: jami summa, foiz, o'rtacha qiymat). Bunday raqamlarni CHART ga qo'yma — "stats" kartaga qo'y! Stats karta = oddiy raqamlar ro'yxati, chart = faqat grafik bilan ko'rsatish mantiqiy bo'lgan ma'lumotlar.

Jami 5-7 ta karta bo'lsin: 2 ta stats + 2-3 ta chart + 1 ta highlight

TEXNIK FORMAT:
- Pie: data: [{"name":"...", "value":number}], keys kerak EMAS
- Bar/line/area: data: [{"name":"label", "col1":num}], keys: ["col1"], xKey: "name"
- Scatter: data: [{"x":num, "y":num}], xLabel, yLabel qo'sh
- Stats: stats: [{"l":"Nomi","v":"1,234","c":"#rang","i":"emoji"}] — v da formatlangan raqam
- Highlight: items: [{"l":"Xulosa","v":"tushuntirish","c":"#rang"}]

FAQAT JSON QAYTAR, boshqa hech narsa yozma.`;

      // Background da ishga tushirish — sahifa o'zgarganda ham davom etadi
      const srcId = workingSource.id;
      const curCacheKey = cacheKey;
      runBackgroundAI(query.substring(0, 40), [{ role: "user", content: prompt }], aiConfig, (result) => {
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return;
          const parsed = JSON.parse(jsonMatch[0]);
          const cards = (parsed.cards || []).map((c, i) => ({ ...c, id: `ai_${Date.now()}_${i}` }));
          if (!cards.length) return;
          // Cache ga saqlash (component unmount bo'lgan bo'lishi mumkin)
          const prev = LS.get(curCacheKey, []);
          const updated = [...cards, ...(Array.isArray(prev) ? prev : [])];
          LS.set(curCacheKey, updated);
          // Agar hali shu sahifada bo'lsa — state ni yangilash
          setAiCards(updated);
        } catch {}
      });

      if (!hasPersonalKey && user && onAiUsed) onAiUsed();
    } catch (err) {
      setAiError(err.message || "AI tahlil xatosi");
    }
    setAiLoading(false);
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

  const filteredCards = filter === "all" ? allCards : filter === "table" ? allCards : allCards.filter(c => c.type === filter);
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
      {/* Manba tanlash */}
      <div className="flex gap6 mb14 aic flex-wrap">
        <span className="text-xs text-muted" style={{ fontFamily: "var(--fh)", textTransform: "uppercase", letterSpacing: 2 }}>Manba:</span>
        {connectedSources.map(s => {
          const st = SOURCE_TYPES[s.type];
          return (
            <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { setSelectedSrc(s.id); setChartOverrides({}); setFilter("all"); }}
              style={workingSource?.id === s.id ? { borderColor: s.color || st.color, color: s.color || st.color, background: `${s.color || st.color}0F` } : {}}>
              {st.icon} {s.name} <span className="badge b-ok" style={{ fontSize: 8, marginLeft: 4 }}>{s.data?.length}</span>
            </button>
          );
        })}
      </div>

      {/* ═══ AI SO'ROV PANELI — ixcham ═══ */}
      {workingSource && (
        <div className="mb14" style={{ background: "var(--s1)", border: "1px solid rgba(0,201,190,0.12)", borderRadius: 14, padding: "14px 18px" }}>
          {/* Input qatori */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input className="field f1" placeholder={`${SOURCE_TYPES[workingSource.type]?.label || "Manba"} tahlili: qanday grafik kerak?`}
              value={userQuery} onChange={e => setUserQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !aiLoading) runAiCharts(); }}
              disabled={aiLoading}
              style={{ fontSize: 12, padding: "10px 14px" }} />
            <button className="btn btn-primary" onClick={() => runAiCharts()} disabled={aiLoading || !userQuery.trim() || !aiConfig?.apiKey}
              style={{ padding: "10px 20px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
              {aiLoading ? "Tahlil..." : "Generatsiya"}
            </button>
          </div>
          {/* Chiplar — ixcham, bir qator scroll */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }} className="hide-scroll">
            {QUICK_CHARTS.map((q, i) => (
              <button key={i} onClick={() => { setUserQuery(q.text); runAiCharts(q.text); }} disabled={aiLoading}
                style={{
                  background: `${q.c}08`, border: `1px solid ${q.c}20`, borderRadius: 8, padding: "5px 12px", cursor: aiLoading ? "not-allowed" : "pointer",
                  fontSize: 10, color: q.c, transition: "all .2s", whiteSpace: "nowrap", flexShrink: 0, fontWeight: 600,
                }}
                onMouseEnter={e => { if (!aiLoading) { e.currentTarget.style.borderColor = q.c + "60"; e.currentTarget.style.background = q.c + "18"; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = q.c + "20"; e.currentTarget.style.background = q.c + "08"; }}>
                {q.text.length > 40 ? q.text.substring(0, 38) + "..." : q.text}
              </button>
            ))}
          </div>
          {/* Xato va info */}
          {!aiConfig?.apiKey && <div className="text-muted text-xs mt6">AI ulangan emas. Sozlamalar → API kalit kiriting.</div>}
          {aiError && <div style={{ color: "var(--red)", fontSize: 10, marginTop: 6 }}>Xato: {aiError}</div>}
          {aiCards.length > 0 && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{aiCards.length} ta AI grafik saqlangan</span>
              <button className="btn btn-ghost btn-xs" style={{ fontSize: 9, color: "var(--red)", borderColor: "rgba(248,113,113,0.2)", padding: "2px 8px" }}
                onClick={() => { if (confirm("AI grafiklarni tozalash?")) { setAiCards([]); LS.del(cacheKey); } }}>
                Tozalash
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Loading — bosqichli progress bar */}
      <AiProgressBar loading={aiLoading} />

      {/* Filter tabs */}
      {allCards.length > 0 && (
        <div className="flex gap6 mb14 aic flex-wrap">
          {filters.map(f => (
            <button key={f.id} className="btn btn-ghost btn-sm" onClick={() => setFilter(f.id)}
              style={filter === f.id ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.07)" } : {}}>
              {f.l} <span className="badge b-ok" style={{ fontSize: 7.5, marginLeft: 3 }}>{f.count}</span>
            </button>
          ))}
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setFilter("table")}
            style={filter === "table" ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.07)" } : {}}>
             Jadval
          </button>
        </div>
      )}

      {/* Jadval tugmasi — agar chartlar yo'q bo'lsa */}
      {allCards.length === 0 && tableData.length > 0 && !aiLoading && (
        <div className="flex gap6 mb14 aic">
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter("table")}
            style={filter === "table" ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.07)" } : {}}>
             Jadval ko'rinishi
          </button>
        </div>
      )}

      {/* Jadval ko'rinishi */}
      {filter === "table" && tableData.length > 0 && (
        <div className="card">
          <div className="card-title mb12"> Jadval — {workingSource?.name} ({tableData.length} qator)</div>
          <div className="overflow-x">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>{Object.keys(tableData[0] || {}).map(k => <th key={k} style={{ padding: "7px 12px", textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap" }}>{k}</th>)}</tr></thead>
              <tbody>{tableData.slice(0, 30).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  {Object.values(row).map((v, j) => <td key={j} style={{ padding: "6px 12px", borderBottom: "1px solid rgba(0,201,190,0.04)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>{typeof v === "object" ? JSON.stringify(v) : String(v).substring(0, 40)}</td>)}
                </tr>
              ))}</tbody>
            </table>
            {tableData.length > 30 && <div className="text-muted text-xs mt8" style={{ textAlign: "center" }}>... va yana {tableData.length - 30} ta qator</div>}
          </div>
        </div>
      )}

      {/* Dashboard kartalar gridi */}
      {filter !== "table" && filteredCards.length > 0 && (
        <CardGrid cards={filteredCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_charts_"+(workingSource?.id||"")} />
      )}

      {filter !== "table" && allCards.length === 0 && !aiLoading && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}></div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 13 }}>Yuqoridagi so'rovlardan birini tanlang yoki o'zingiz yozing</div>
          <div className="text-muted text-sm mt4">AI ma'lumotlaringizni tahlil qilib, raqamlar va grafiklar yaratadi</div>
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
          <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="11" rx="3"/>
          <path d="M5 10a7 7 0 0 0 14 0"/>
          <line x1="12" y1="17" x2="12" y2="22"/>
          <line x1="8" y1="22" x2="16" y2="22"/>
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
  const chatKey = "u_" + (user?.id || "anon") + "_chat_h";
  const connectedSources = sources.filter(s => s.connected && s.active && s.data?.length > 0);
  const [activeSrcIds, setActiveSrcIds] = useState(() => connectedSources.map(s => s.id));
  const [messages, setMessages] = useState(() => LS.get(chatKey, [{ role: "assistant", content: "Salom! Qaysi manbalardan foydalanishimni tanlang, so'ngra savolingizni yozing. " }]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [qCat, setQCat] = useState("all");
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
    const ctx = buildMergedContext(chosenSrcs);
    const fullMsg = text + (ctx ? `\n\n━━━ BIZNES MA'LUMOTLARI ━━━${ctx}\n━━━━━━━━━━━━━━━━━━━━━━━━━━` : "");
    const disp = text; setInput("");
    const hist = messages.map(m => ({ role: m.role, content: m.content }));
    const newMsgs = [...messages, { role: "user", content: disp, srcNames: chosenSrcs.map(s => s.name) }, { role: "assistant", content: "" }];
    setMessages(newMsgs); setLoading(true);

    // Professional system prompt — onboarding ma'lumotlari bilan moslashtirilgan
    const onbPfx = "u_" + (user?.id || "anon") + "_onboarding";
    const onb = LS.get(onbPfx, {});
    const bizContext = onb.bizName ? `\n\nFOYDALANUVCHI HAQIDA: Biznes nomi: "${onb.bizName}", Soha: ${onb.bizType || "noma'lum"}, Jamoa: ${onb.employees || "noma'lum"}, Asosiy qiziqish: ${onb.interest || "umumiy"}, Maqsad: ${onb.goal || "tahlil"}. Javoblarni SHU BIZNESGA MOSLASHTIRIB ber!` : "";

    const systemPrompt = {
      role: "system",
      content: `Sen — BiznesAI, yuqori malakali biznes tahlilchi va strategik maslahatchi. Sening maqsading — biznes egasini HAYRATGA SOLADIGAN darajada chuqur, aniq va foydali javoblar berish.${bizContext}

QOIDALAR:
1. HAMMA JAVOB O'ZBEK TILIDA — professional, ravon, tushunarli
2. ANIQ RAQAMLAR bilan gapir — "ko'p" emas, "1,247 ta" de. "o'sdi" emas, "23.5% ga o'sdi" de
3. Har bir javobda AMALIY TAVSIYALAR bo'lsin — nima qilish kerak, qanday yaxshilash mumkin
4. Ma'lumotlardan INSIGHT lar chiqar — oddiy takrorlash emas, chuqur TAHLIL
5. Muammolarni ANIQLASH — qayerda pul yo'qolayapti, qayerda imkoniyat bor
6. SOLISHTIRISH — o'tgan davr bilan, o'rtacha bilan, maqsad bilan
7. PROGNOZ — kelgusi 1-3 oy uchun bashorat
8. Javobni STRUKTURALI yoz — sarlavhalar, nuqtalar, raqamlar alohida ajratilgan
9. Biznes egasi sifatida QAROR QABUL QILISHGA yordam ber
10. Keraksiz texnik ma'lumot BERMA — faqat biznes qiymati bor narsalarni yoz
11. Agar ma'lumot yetarli bo'lmasa — qanday ma'lumot kerakligini so'ra
12. MUHIM: Bitta savolga 300-500 so'z oralig'ida javob ber — na kam, na ko'p`
    };

    try {
      await callAI([systemPrompt, ...hist, { role: "user", content: fullMsg }], aiConfig, (chunk) => {
        setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: chunk }; return c; });
      });
      // Faqat global AI ishlatilsa limit hisobla (shaxsiy kalit bo'lsa hisoblanmaydi)
      if (!hasPersonalKey && user && onAiUsed) onAiUsed();
      setMessages(m => { LS.set(chatKey, m.slice(-24)); return m; });
    } catch (e) {
      setMessages(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: " Xato: " + e.message }; return c; });
    }
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
    a.href = url; a.download = `BiznesAI_chat_${new Date().toISOString().slice(0, 10)}.txt`;
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
      try { await navigator.share({ title: "BiznesAI Chat", text }); } catch { }
    } else {
      await copyChat();
    }
  };

  // Manba turiga qarab aqlli savollar
  const QUICK_BASE = [
    { icon: "", text: "Umumiy biznes tahlili qil", cat: "tahlil", c: "#00C9BE" },
    { icon: "", text: "Daromad tendensiyasini ko'rsat", cat: "tahlil", c: "#4ADE80" },
    { icon: "", text: "Eng yaxshi va yomon ko'rsatkichlar", cat: "tahlil", c: "#FBBF24" },
    { icon: "", text: "SWOT tahlili yoz", cat: "strategiya", c: "#A78BFA" },
    { icon: "", text: "O'sish strategiyasi taklif qil", cat: "strategiya", c: "#60A5FA" },
    { icon: "", text: "Xarajatlarni optimallashtirish", cat: "moliya", c: "#F87171" },
    { icon: "", text: "3 oylik prognoz ber", cat: "prognoz", c: "#E879F9" },
    { icon: "", text: "Tezkor xulosa: asosiy raqamlar", cat: "tahlil", c: "#FB923C" },
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
    { icon: "", text: "Ma'lumotlar sifatini tekshir", cat: "tahlil", c: "#00C9BE" },
    { icon: "", text: "Ustunlar bo'yicha statistika", cat: "tahlil", c: "#4ADE80" },
    { icon: "", text: "Korrelyatsiyalarni topib ber", cat: "tahlil", c: "#A78BFA" },
    { icon: "", text: "Anomaliyalar va og'ishlarni aniqla", cat: "tahlil", c: "#F87171" },
    { icon: "", text: "Ma'lumot bo'yicha hisobot yoz", cat: "hisobot", c: "#FBBF24" },
    { icon: "", text: "KPI ko'rsatkichlarini hisoblash", cat: "tahlil", c: "#60A5FA" },
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
        {!aiConfig.apiKey && <span className="badge b-warn ml-auto"> Kalit kerak</span>}
        {aiConfig.apiKey && <span className="badge b-ok ml-auto">✓ Ulangan</span>}
        <div style={{ marginLeft: aiConfig.apiKey ? "8px" : "auto", display: "flex", gap: 4 }}>
          <button className="chat-export-btn" onClick={copyChat} title="Nusxalash"> Nusxa</button>
          <button className="chat-export-btn" onClick={downloadChat} title="Yuklab olish"> Yukla</button>
          <button className="chat-export-btn" onClick={shareChat} title="Ulashish"> Ulash</button>
        </div>
        <button onClick={() => { if(confirm("Chat tarixini tozalashni xohlaysizmi?")){ setMessages([{ role: "assistant", content: "Yangi suhbat boshlandi." }]); LS.del(chatKey); }}}
          style={{ padding:"6px 14px", borderRadius:8, border:"1px solid rgba(248,113,113,0.3)", background:"rgba(248,113,113,0.08)", color:"#F87171", fontSize:11, fontFamily:"var(--fh)", fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:6, transition:"all .2s" }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,0.15)";e.currentTarget.style.borderColor="rgba(248,113,113,0.5)"}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,0.08)";e.currentTarget.style.borderColor="rgba(248,113,113,0.3)"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Tozalash
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
      <div className="chat-msgs-wrap">
        <div className="chat-msgs">
          <div ref={topRef} />
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === "user" ? "user" : ""}`}>
              <div className={`ava ${m.role === "user" ? "user" : "ai"}`} style={m.role === "assistant" ? { color: prov.color } : {}}>{m.role === "user" ? "U" : prov.icon}</div>
              <div className="bubble">
                <span className="bubble-meta">{m.role === "user" ? "Siz" : `${prov.name} AI`}</span>
                {m.role === "user" && m.srcNames?.length > 0 && (
                  <div className="flex gap4 mb6" style={{ flexWrap: "wrap" }}>
                    {m.srcNames.map((n, j) => <span key={j} style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: "rgba(0,201,190,0.1)", color: "var(--teal)" }}> {n}</span>)}
                  </div>
                )}
                <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
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

      {/* ── Input ── */}
      <div className="chat-input-row">
        <textarea className="chat-ta" rows={1} placeholder="Savolingizni yozing yoki 🎤 bosing..." value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} />
        <VoiceButton onResult={(text) => { setInput(prev => prev ? prev + ' ' + text : text); }} />
        <button className="chat-send-btn" onClick={() => sendMsg()} disabled={loading || !input.trim()}>
          {loading ? <span className="typing-ind" style={{ justifyContent: "center", gap: 3 }}><span /><span /><span /></span> : "➤"}
        </button>
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
    const ctx = buildMergedContext(connectedSources);
    const srcInfo = connectedSources.map(s => `${s.name} (${SOURCE_TYPES[s.type]?.label || s.type}, ${s.data?.length || 0} ta yozuv)`).join(", ");
    const enrichedPrompt = mod.p + `\n\nUlangan manbalar: ${srcInfo || "hech qanday manba ulanmagan"}` + (ctx ? `\n\nMA'LUMOTLAR:${ctx}` : "\n\n[Ma'lumot ulash uchun Data Hub dan manba qo'shing]") + `

JAVOB QOIDALARI:
1. O'ZBEK TILIDA, professional va chuqur
2. ANIQ RAQAMLAR — "1,247 ta", "23.5%", "3.2M so'm" kabi. "Ko'p/kam" dema
3. SOLISHTIRISH — o'tgan davr, o'rtacha, maqsad bilan
4. MUAMMO + TAVSIYA — har bir muammoga aniq yechim
5. PROGNOZ — kelgusi 1-3 oy uchun
6. Sarlavhalar bilan bo'limlarga ajrat
7. Biznes egasi QAROR QABUL QILISHI uchun foydali bo'lsin
8. 300-500 so'z oralig'ida — ixcham lekin boy`;
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
    { l: " Savdo Tahlili", p: "Savdo ko'rsatkichlarini tahlil qil. Daromad tendensiyasi, o'sish imkoniyatlari, zaif tomonlar. Jadval formatida ko'rsat.", cat: "biznes", color: "#4ADE80", icon: "" },
    { l: " Mijozlar Tahlili", p: "Mijozlar bazasini tahlil qil. Segmentatsiya, LTV, churn risk, takroriy xaridlar.", cat: "biznes", color: "#60A5FA", icon: "" },
    { l: " Xarajatlar Tahlili", p: "Xarajatlar tuzilmasini tahlil qil. Tejash imkoniyatlari, ROI, byudjet tavsiyalari.", cat: "moliya", color: "#FB923C", icon: "" },
    { l: " Xodimlar KPI", p: "Xodimlar unumdorligi va KPI tahlili. Eng samarali va muammoli tomonlar.", cat: "biznes", color: "#A78BFA", icon: "" },
    { l: " SWOT Tahlil", p: "To'liq SWOT tahlili yoz: kuchli tomonlar, zaif tomonlar, imkoniyatlar, xatarlar. Har birini 3-5 ta band bilan.", cat: "strategiya", color: "#E879F9", icon: "" },
    { l: " 3 Oy Prognoz", p: "Mavjud trend asosida keyingi 3 oy uchun bashorat yoz. Aniq raqamlar bilan. Eng yaxshi va eng yomon senariylar.", cat: "prognoz", color: "#38BDF8", icon: "" },
    { l: " KPI Dashboard", p: "Asosiy KPI ko'rsatkichlarini aniqlash va jadval formatida chiqarish. Har bir KPI uchun hozirgi holat, maqsad, farq.", cat: "biznes", color: "#00C9BE", icon: "" },
    { l: " Tezkor Xulosa", p: "Ma'lumotlarning eng muhim 5-7 ta xulosasini ber. Qisqa, aniq, raqamlarga asoslangan.", cat: "tezkor", color: "#FBBF24", icon: "" },
  ];

  const IG_MODS = [
    { l: " Instagram Tahlil", p: "Instagram akkaunt tahlili: engagement rate, eng yaxshi postlar, auditoriya faolligi, kontent strategiyasi tavsiyalari.", cat: "instagram", color: "#E879F9", icon: "" },
    { l: " Engagement Tahlil", p: "Har bir post uchun engagement rate hisoblash. Qaysi turdagi postlar (rasm, video, karusel) eng yaxshi ishlaydi? Jadval bilan.", cat: "instagram", color: "#F87171", icon: "" },
    { l: " Post Vaqti Tahlil", p: "Qaysi kunlar va soatlarda postlar eng ko'p like/izoh oladi? Optimal post qilish jadvalini tavsiya qil.", cat: "instagram", color: "#4ADE80", icon: "" },
    { l: " Kontent Strategiya", p: "Kontent turlarini tahlil qil. Qaysi mavzular va formatlar ishlaydi? 30 kunlik kontent kalendar taklif qil.", cat: "instagram", color: "#EC4899", icon: "" },
    { l: " Raqobatchilar", p: "Shu sohada raqobatchilar tahlili uchun tavsiyalar. Nima qilish kerak o'sish uchun?", cat: "instagram", color: "#FB923C", icon: "" },
  ];

  const TG_MODS = [
    { l: " Kanal Tahlili", p: "Telegram kanal statistikasini tahlil qil: obunachilar, ko'rishlar, engagement rate, o'sish tendensiyasi. Qaysi kontent turi samaraliroq?", cat: "telegram", color: "#38BDF8", icon: "" },
    { l: " Post Samaradorligi", p: "Kanal postlarini tahlil qil: qaysi postlar eng ko'p ko'rilgan va ulashilgan? Kontent turlari bo'yicha solishtir (matn/rasm/video). Optimal post uzunligi va chiqarish vaqtini aniqlash.", cat: "telegram", color: "#4ADE80", icon: "" },
    { l: " Auditoriya Tahlili", p: "Telegram kanal auditoriyasi tahlili: obunachilar o'sishi, engagement rate trendi, ko'rish/obunachi nisbati. Auditoriyani ushlab turish strategiyalari.", cat: "telegram", color: "#E879F9", icon: "" },
  ];

  const CRM_MODS = [
    { l: " CRM Umumiy Tahlil", p: "O'quv markaz CRM ma'lumotlarini har tomonlama tahlil qil: lidlar konversiyasi, guruhlar to'liqligi, o'quvchilar soni, o'qituvchilar samaradorligi. Filiallar bo'yicha solishtir. Raqamlar va foizlar bilan.", cat: "crm", color: "#8B5CF6", icon: "" },
    { l: " Lidlar Pipeline", p: "CRM dagi lidlar tahlili: qaysi bosqichda ko'p lid to'xtab qolmoqda, konversiya foizi qanday, qaysi manbalar eng ko'p lid keltirmoqda. Lidlarni guruhga aylantirish strategiyasi.", cat: "crm", color: "#F87171", icon: "" },
    { l: " Guruhlar Tahlili", p: "Guruhlar to'liqligini tahlil qil: qaysi guruhlar to'la, qaysilari bo'sh. Narx strategiyasi, optimal guruh hajmi. Qaysi fan va filialda eng ko'p talab bor?", cat: "crm", color: "#4ADE80", icon: "" },
    { l: " O'qituvchilar KPI", p: "O'qituvchilar samaradorligi: guruhlar soni, o'quvchilar soni, maosh/o'quvchi nisbati. Eng samarali va kam yukli o'qituvchilarni aniqlash. Maosh optimizatsiya tavsiyalari.", cat: "crm", color: "#FBBF24", icon: "" },
    { l: " Moliyaviy Tahlil", p: "O'quv markaz moliyaviy tahlili: umumiy daromad, maosh xarajatlari, foyda foizi. Filiallar bo'yicha rentabellik. Narx optimizatsiya tavsiyalari.", cat: "crm", color: "#4ADE80", icon: "" },
    { l: " Filiallar Solishtirma", p: "Filiallar bo'yicha batafsil solishtirma tahlil: o'quvchilar soni, guruhlar, o'qituvchilar, daromad. Eng yaxshi va yomon filiallarni aniqlash.", cat: "crm", color: "#60A5FA", icon: "" },
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
  const MOD_CAT_LABELS = { all: "Hammasi", biznes: "Biznes", moliya: "Moliya", strategiya: "Strategiya", prognoz: "Prognoz", tezkor: "Tezkor", instagram: "Instagram", telegram: "Telegram", crm: "CRM" };
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
              <div className="flex aic jb mb12">
                <div className="card-title" style={{ marginBottom: 0 }}>{prov.icon} {activeLabel}</div>
                <div className="flex gap4">
                  <button className="chat-export-btn" title="Nusxalash" onClick={async () => {
                    try { await navigator.clipboard.writeText(result); alert("Nusxalandi!"); } catch { alert("Nusxalab bo'lmadi"); }
                  }}> Nusxa</button>
                  <button className="chat-export-btn" title="Yuklab olish" onClick={() => {
                    const blob = new Blob([`${activeLabel}\n${"═".repeat(40)}\n\n${result}`], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob); const a = document.createElement("a");
                    a.href = url; a.download = `BiznesAI_${activeLabel.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
                    a.click(); URL.revokeObjectURL(url);
                  }}> Yukla</button>
                </div>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.85, color: "var(--text)" }}>{result}</div>
            </div>

            {/* Aloqador chartlar */}
            {relatedCharts.length > 0 && (
              <div>
                <div className="section-hd mb10"> Aloqador Grafiklar</div>
                <CardGrid cards={relatedCharts} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_ana_rel"} />
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
          <CardGrid cards={allCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_ana_all"} />
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
    if (!isPersonal && user?.role !== "admin" && !Auth.checkLimit(user, "reports", sources)) {
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
    const ctx = buildMergedContext(connectedSources);
    const srcInfo = connectedSources.map(s => `${s.name} (${SOURCE_TYPES[s.type]?.label || s.type}, ${s.data?.length || 0} ta yozuv)`).join(", ");
    const prompt = mod.fn(today) + `\n\nUlangan manbalar: ${srcInfo || "hech qanday manba ulanmagan"}` + (ctx ? `\n\nMA'LUMOTLAR:${ctx}` : "") + `

HISOBOT QOIDALARI:
1. O'ZBEK TILIDA, professional biznes hisobot formati
2. Biznes egasi uchun — texnik emas, TUSHUNARLI til
3. ANIQ RAQAMLAR — har bir da'vo raqam bilan isbotlangan bo'lsin
4. SOLISHTIRISH — o'tgan davr bilan, maqsad bilan, o'rtacha bilan
5. MUAMMOLAR aniq ko'rsatilsin — qayerda pul yo'qolayapti, qayerda pasayish bor
6. Har bir muammoga AMALIY TAVSIYA — nima qilish kerak, qanday yaxshilash
7. PROGNOZ — kelgusi oy/kvartal uchun kutilayotgan natija
8. Hisobot oxirida UMUMIY XULOSA — 3-5 gapda asosiy topilmalar
9. Sarlavhalar, nuqtalar bilan professional format`;
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
    if (user?.role === "admin") return true;
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
    a.download = `BiznesAI_${l.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
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
    XLSX.utils.sheet_add_aoa(ws, [[`${l} — ${new Date().toLocaleDateString("uz-UZ")} — BiznesAI`]], { origin: "A1" });
    XLSX.utils.book_append_sheet(wb, ws, "Hisobot");
    const wsRaw = XLSX.utils.aoa_to_sheet([[t]]);
    XLSX.utils.book_append_sheet(wb, wsRaw, "To'liq Matn");
    XLSX.writeFile(wb, `BiznesAI_${l.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = (text, lbl) => {
    if (!checkExportLimit()) return;
    const t = text || report; const l = lbl || label;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Inter,sans-serif;font-size:13px;line-height:1.8;color:#1a1a2e;padding:40px 50px;max-width:800px;margin:0 auto}
      h1{font-size:20px;font-weight:700;color:#0a0a1a;border-bottom:2px solid #00c8ff;padding-bottom:10px;margin-bottom:20px}
      .meta{font-size:11px;color:#888;margin-bottom:24px}
      .content{white-space:pre-wrap;font-size:13px}
      @media print{body{padding:20px}}
    </style></head>
    <body>
      <h1>BiznesAI — ${l}</h1>
      <div class="meta">Sana: ${new Date().toLocaleDateString("uz-UZ")} | AI: ${prov.name} | BiznesAI Hisobot Tizimi</div>
      <div class="content">${t.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>
    </body></html>`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:800px;height:1100px";
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
  const CAT_LABELS = { all: "Hammasi", davr: "Davriy", tahlil: "Tahlil", moliya: "Moliya", strategiya: "Strategiya", instagram: "Instagram", telegram: "Telegram" };
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
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.9, color: "var(--text)" }}>{report}</div>
            </div>

            {/* Aloqador chartlar */}
            {relatedCharts.length > 0 && (
              <div>
                <div className="section-hd mb10"> Aloqador Grafiklar</div>
                <CardGrid cards={relatedCharts} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_rep_rel"} />
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
          <CardGrid cards={allCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_rep_all"} />
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
    if (!isPersonalKey && user?.role !== "admin") {
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
    const ctx = buildMergedContext(connectedSources);
    const srcInfo = connectedSources.map(s => `${s.name} (${SOURCE_TYPES[s.type]?.label || s.type}, ${s.data?.length || 0} yozuv)`).join(", ");

    // Agar maxsus tekshirish turi bo'lsa, uning promptini ishlatish
    const basePrompt = checkMod ? checkMod.prompt : `Quyidagi biznes ma'lumotlarini tahlil qilib, proaktiv ogohlantirishlar ber.`;
    const prompt = `${basePrompt}

Ulangan manbalar: ${srcInfo}
MA'LUMOTLAR:${ctx}

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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(al => {
            const at = ALERT_TYPES[al.type] || ALERT_TYPES.info;
            return (
              <div key={al.id} style={{
                background: al.read ? "var(--s2)" : at.bg,
                border: `1px solid ${al.read ? "var(--border)" : at.border}`,
                borderRadius: 14, padding: "16px 18px", transition: "all .25s", position: "relative", overflow: "hidden",
                boxShadow: al.read ? "none" : `0 0 20px ${at.glow}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateX(3px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${at.glow}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = al.read ? "none" : `0 0 20px ${at.glow}`; }}
              >
                {/* Chap rang chizig'i */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: at.color, borderRadius: "3px 0 0 3px" }} />
                {/* O'qilmagan nuqta */}
                {!al.read && <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: at.color, boxShadow: `0 0 8px ${at.color}` }} />}
                <div className="flex aic gap10 mb6">
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{at.icon}</span>
                  <div className="f1" style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 13.5, fontWeight: 700, color: al.read ? "var(--text)" : at.color, lineHeight: 1.3 }}>{al.title}</div>
                    <div className="flex gap8 mt4 aic" style={{ flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--fm)" }}>{al.createdAt}</span>
                      {al.metric && <span style={{ fontSize: 9.5, padding: "2px 8px", borderRadius: 6, background: at.bg, color: at.color, border: `1px solid ${at.border}`, fontFamily: "var(--fm)", fontWeight: 500 }}>{al.metric}</span>}
                      <span className="badge" style={{ fontSize: 8, background: at.bg, color: at.color, border: `1px solid ${at.border}` }}>{at.label}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(al.id)} title="O'chirish"
                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", padding: "4px 7px", borderRadius: 7, cursor: "pointer", fontSize: 11, transition: "all .2s", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(251,113,133,0.4)"; e.currentTarget.style.color = "var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}>
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.75, color: "var(--text2)", marginLeft: 30 }}>{al.message}</div>
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
            <CardGrid cards={relatedCharts} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_alert_rel"} />
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
          <CardGrid cards={allCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_alert_all"} />
        )}
      </div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────────────────────
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
      push("Shaxsiy kalit o'chirildi — global AI ishlatiladi", "ok");
      return;
    }
    const newAllKeys = { ...allKeys, [aiConfig.provider]: k };
    setAllKeys(newAllKeys); LS.set(uk("all_keys"), newAllKeys);
    setAiConfig(c => ({ ...c, apiKey: k })); LS.set(uk("apiKey"), k);
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

      {/* ── QANDAY ISHLAYDI ── */}
      <div className="card">
        <div className="card-title mb10"> AI Qanday Ishlaydi</div>
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
      </div>
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

  // ── INSTAGRAM manba uchun maxsus dashboardlar ──
  if (type === "instagram") {
    const summary = data.find(d => d._type === "PROFIL_STATISTIKA");
    const posts = data.filter(d => !d._type);

    if (summary) {
      // 1. Profil umumiy statistika
      cards.push({
        id: "ig_profile", title: "Profil Statistika", icon: "", size: "full", type: "stats",
        stats: [
          { l: "Obunachilar", v: (summary.followers_count || 0).toLocaleString(), c: "#E879F9", i: "" },
          { l: "Obunalar", v: (summary.follows_count || 0).toLocaleString(), c: "#60A5FA", i: "" },
          { l: "Jami Postlar", v: (summary.total_posts || 0).toLocaleString(), c: "#4ADE80", i: "" },
          { l: "Jami Like", v: (summary.total_likes || 0).toLocaleString(), c: "#F87171", i: "" },
          { l: "Jami Izoh", v: (summary.total_comments || 0).toLocaleString(), c: "#FBBF24", i: "" },
          { l: "Engagement", v: (summary.total_engagement || 0).toLocaleString(), c: "#00C9BE", i: "" },
        ]
      });
      // 2. Engagement rate gauge
      const engRate = summary.total_posts > 0 && summary.followers_count > 0 ? ((summary.total_engagement || 0) / (summary.fetched_posts || 1) / summary.followers_count * 100).toFixed(2) : 0;
      cards.push({
        id: "ig_eng_rate", title: "Engagement Rate", icon: "", type: "gauge",
        value: parseFloat(engRate), max: 10, label: `${engRate}%`, color: "#E879F9"
      });
      // 3. O'rtacha like/izoh
      cards.push({
        id: "ig_avg", title: "O'rtacha Ko'rsatkichlar", icon: "", type: "stats",
        stats: [
          { l: "O'rtacha Like", v: (summary.avg_likes_per_post || 0).toLocaleString(), c: "#F87171", i: "" },
          { l: "O'rtacha Izoh", v: (summary.avg_comments_per_post || 0).toLocaleString(), c: "#FBBF24", i: "" },
          { l: "Yuklangan Post", v: (summary.fetched_posts || 0).toLocaleString(), c: "#60A5FA", i: "" },
        ]
      });
    }

    if (posts.length > 0) {
      // 4. Post engagement trend (line)
      const trendData = posts.slice(0, 25).reverse().map(p => ({
        name: p.date?.slice(5) || "", likes: p.likes || 0, comments: p.comments || 0
      }));
      cards.push({
        id: "ig_trend", title: "Engagement Trendi", icon: "", type: "chart", chartType: "area",
        data: trendData, keys: ["likes", "comments"], xKey: "name", colors: ["#F87171", "#FBBF24"]
      });

      // 5. Like taqsimoti (bar)
      cards.push({
        id: "ig_likes_bar", title: "Postlar bo'yicha Like", icon: "", type: "chart", chartType: "bar",
        data: posts.slice(0, 15).map((p, i) => ({ name: p.caption?.slice(0, 12) || `#${i + 1}`, likes: p.likes || 0 })),
        keys: ["likes"], xKey: "name", colors: ["#F87171"]
      });

      // 6. Izohlar (bar)
      cards.push({
        id: "ig_comments_bar", title: "Postlar bo'yicha Izoh", icon: "", type: "chart", chartType: "bar",
        data: posts.slice(0, 15).map((p, i) => ({ name: p.caption?.slice(0, 12) || `#${i + 1}`, comments: p.comments || 0 })),
        keys: ["comments"], xKey: "name", colors: ["#FBBF24"]
      });

      // 7. Post turi taqsimoti (pie)
      const typeCounts = {};
      posts.forEach(p => { typeCounts[p.type || "OTHER"] = (typeCounts[p.type || "OTHER"] || 0) + 1; });
      cards.push({
        id: "ig_types", title: "Post Turlari", icon: "", type: "chart", chartType: "pie",
        data: Object.entries(typeCounts).map(([name, value]) => ({ name: name === "VIDEO" ? "Video" : name === "IMAGE" ? "Rasm" : name === "CAROUSEL_ALBUM" ? "Karusel" : name, value })),
        colors: C
      });

      // 8. Top 10 post engagement (bar)
      const top10 = [...posts].sort((a, b) => (b.engagement || 0) - (a.engagement || 0)).slice(0, 10);
      cards.push({
        id: "ig_top10", title: "Top 10 Engagement", icon: "", type: "chart", chartType: "bar",
        data: top10.map((p, i) => ({ name: p.caption?.slice(0, 12) || `#${i + 1}`, engagement: p.engagement || 0 })),
        keys: ["engagement"], xKey: "name", colors: ["#00C9BE"]
      });

      // 9. Kunlik post soni (line)
      const dayCounts = {};
      posts.forEach(p => { if (p.date) { dayCounts[p.date] = (dayCounts[p.date] || 0) + 1; } });
      const dayData = Object.entries(dayCounts).sort().slice(-20).map(([name, count]) => ({ name: name.slice(5), count }));
      if (dayData.length > 1)
        cards.push({
          id: "ig_daily", title: "Kunlik Postlar", icon: "", type: "chart", chartType: "line",
          data: dayData, keys: ["count"], xKey: "name", colors: ["#A78BFA"]
        });

      // 10. Engagement vs Like scatter
      if (posts.some(p => p.likes > 0))
        cards.push({
          id: "ig_scatter", title: "Like vs Izoh", icon: "⋯", type: "chart", chartType: "scatter",
          data: posts.filter(p => p.likes > 0 || p.comments > 0).map(p => ({ x: p.likes || 0, y: p.comments || 0 })),
          xLabel: "Like", yLabel: "Izoh"
        });

      // 11. Like bo'yicha eng yaxshi post
      const bestPost = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
      if (bestPost)
        cards.push({
          id: "ig_best", title: "Eng Yaxshi Post", icon: "", type: "highlight",
          items: [
            { l: "Caption", v: bestPost.caption || "—" },
            { l: "Like", v: (bestPost.likes || 0).toLocaleString(), c: "#F87171" },
            { l: "Izoh", v: (bestPost.comments || 0).toLocaleString(), c: "#FBBF24" },
            { l: "Sana", v: bestPost.date || "—" },
            { l: "Turi", v: bestPost.type || "—", c: "#A78BFA" },
          ]
        });

      // 12. Engagement haftalik (agar 7+ post bo'lsa)
      if (posts.length >= 7) {
        const weekly = [];
        for (let i = 0; i < posts.length; i += 7) {
          const chunk = posts.slice(i, i + 7);
          const wLikes = chunk.reduce((a, p) => a + (p.likes || 0), 0);
          const wComments = chunk.reduce((a, p) => a + (p.comments || 0), 0);
          weekly.push({ name: `Hafta ${Math.floor(i / 7) + 1}`, likes: wLikes, comments: wComments });
        }
        cards.push({
          id: "ig_weekly", title: "Haftalik Engagement", icon: "", type: "chart", chartType: "area",
          data: weekly.reverse(), keys: ["likes", "comments"], xKey: "name", colors: ["#F87171", "#FBBF24"]
        });
      }
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
  const datePatterns = /sana|date|time|vaqt|kun|oy|yil|month|year|day|created|updated|_at$|_id$|^id$/i;
  const autoNumKeys = allKeys.filter(k => {
    if (datePatterns.test(k)) return false; // Sana ustunlari raqam emas
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
  const statItems = numKeys.slice(0, 6).map((k, i) => {
    const vals = genData.map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, "")) || 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    return { l: k, v: fmtNum(Math.round(sum)), c: C[i % C.length], i: "" };
  });
  if (statItems.length > 0)
    cards.push({ id: "gen_stats", title: "Umumiy Statistika", icon: "", size: "full", type: "stats", stats: statItems });

  // 2. Top qiymatlar (bar chart) — eng asosiy raqamli ustun bo'yicha
  if (numKeys[0]) {
    const barData = [...genData].sort((a, b) => (parseFloat(String(b[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0) - (parseFloat(String(a[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0))
      .slice(0, 15).map(r => ({ name: String(r[labelKey] || "").substring(0, 14), [numKeys[0]]: parseFloat(String(r[numKeys[0]]).replace(/[^0-9.-]/g, "")) || 0 }));
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
  { id: "line", l: "〜 Chiziq" }, { id: "bar", l: "▨ Ustun" }, { id: "area", l: " Maydon" },
  { id: "pie", l: " Doira" }, { id: "scatter", l: "⋯ Tarqoq" }, { id: "stackedbar", l: "▦ Stacked" },
];

// X-axis uchun qisqa label render — matnni 12 belgigacha cheklash, burchak bilan
// ─────────────────────────────────────────────────────────────
// AI PROGRESS BAR — bosqichli, animatsiyali
// ─────────────────────────────────────────────────────────────
function AiProgressBar({ loading }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const steps = [
    { label: "Ma'lumotlar tayyorlanmoqda", pct: 15 },
    { label: "AI ga yuborilmoqda", pct: 30 },
    { label: "AI tahlil qilmoqda", pct: 55 },
    { label: "Raqamlar hisoblanmoqda", pct: 75 },
    { label: "Grafiklar yaratilmoqda", pct: 90 },
    { label: "Yakunlanmoqda", pct: 97 },
  ];

  useEffect(() => {
    if (!loading) { setStep(0); setProgress(0); return; }
    setStep(0); setProgress(5);
    const timers = steps.map((s, i) => setTimeout(() => {
      setStep(i); setProgress(s.pct);
    }, i === 0 ? 300 : i === 1 ? 1200 : i === 2 ? 3000 : i === 3 ? 6000 : i === 4 ? 10000 : 15000));
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  if (!loading) return null;
  const cur = steps[step] || steps[0];

  return (
    <div className="card mb14" style={{ padding: "24px 28px", borderColor: "rgba(0,201,190,0.2)", background: "linear-gradient(135deg,var(--s1),rgba(0,201,190,0.02))" }}>
      {/* Progress bar */}
      <div style={{ background: "var(--s3)", borderRadius: 8, height: 6, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", borderRadius: 8, background: "linear-gradient(90deg, #00C9BE, #4ADE80)", width: progress + "%", transition: "width 1.5s cubic-bezier(0.4,0,0.2,1)", position: "relative" }}>
          <div style={{ position: "absolute", right: 0, top: -2, width: 10, height: 10, borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 12px rgba(74,222,128,0.5)", animation: "pulse-voice 1.5s ease infinite" }} />
        </div>
      </div>
      {/* Bosqichlar */}
      <div className="flex aic jb mb12">
        <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, color: "var(--teal)" }}>{cur.label}...</div>
        <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--muted)" }}>{progress}%</span>
      </div>
      {/* Bosqich indikatorlari */}
      <div className="flex gap4">
        {steps.map((s, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2, transition: "all .5s",
            background: i <= step ? "linear-gradient(90deg, #00C9BE, #4ADE80)" : "var(--s3)",
          }} title={s.label} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
        {step < 3 ? "AI sizning ma'lumotlaringizni chuqur tahlil qilmoqda" : "Natijalar tayyorlanmoqda — biroz kuting"}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// THEME TOGGLE (Light / Dark)
// ─────────────────────────────────────────────────────────────
const THEMES = [
  { id: "obsidian", name: "Obsidian", desc: "Klassik qora, toza", icon: "◆" },
  { id: "midnight", name: "Midnight", desc: "Chuqur ko'k, neon", icon: "◇" },
  { id: "aurora", name: "Aurora", desc: "Tabiat, shimoliy shu'la", icon: "✦" },
  { id: "rose", name: "Rose", desc: "Issiq bronza, luxury", icon: "✧" },
];

function useTheme() {
  const [theme, setThemeState] = useState(() => localStorage.getItem("bai_theme") || "obsidian");
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
  obsidian: { grad: "linear-gradient(135deg,#D4A853,#00D4C8)", accent: "#D4A853" },
  midnight: { grad: "linear-gradient(135deg,#38BDF8,#34D399)", accent: "#38BDF8" },
  aurora: { grad: "linear-gradient(135deg,#6EE7B7,#22D3EE)", accent: "#6EE7B7" },
  rose: { grad: "linear-gradient(135deg,#E8B84B,#D4A853)", accent: "#E8B84B" },
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
      <div ref={btnRef} className="tb-item" onClick={() => setOpen(!open)} title="Mavzu tanlash" style={{ padding:"0 10px" }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: prev.grad, boxShadow: `0 0 8px ${prev.accent}40` }} />
      </div>
      {open && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99998 }} onClick={() => setOpen(false)} />
          <div style={{ position: "fixed", top: getPos().top, right: getPos().right, zIndex: 99999, background: "var(--s1)", border: "1px solid var(--border-hi)", borderRadius: 16, padding: 8, width: 220, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", animation: "fadeIn .15s ease" }}>
            {THEMES.map(t => {
              const tp = THEME_PREVIEWS[t.id];
              const active = theme === t.id;
              return (
                <button key={t.id} onClick={() => { setTheme(t.id); setOpen(false); }}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 12, border: active ? `1px solid ${tp.accent}40` : "1px solid transparent",
                    background: active ? `${tp.accent}0C` : "transparent",
                    cursor: "pointer", marginBottom: 4, display: "flex", alignItems: "center", gap: 12, transition: "all .2s",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--s2)"; e.currentTarget.style.borderColor = `${tp.accent}20`; }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: tp.grad, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#000", fontWeight: 800, boxShadow: active ? `0 0 16px ${tp.accent}35` : "0 2px 6px rgba(0,0,0,0.3)" }}>
                    {t.icon}
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 600, color: active ? tp.accent : "var(--text)" }}>{t.name}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>{t.desc}</div>
                  </div>
                  {active && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tp.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
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
  const days = ["Yak","Dush","Sesh","Chor","Pay","Jum","Shan"];
  const day = days[now.getDay()];
  const date = now.toLocaleDateString("uz-UZ", { day:"2-digit", month:"2-digit", year:"numeric" });
  const time = now.toLocaleTimeString("uz-UZ", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  return (
    <div className="tb-item hide-mobile" style={{ cursor:"default", gap:8, display:"flex", alignItems:"center" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span style={{ fontFamily:"var(--fm)", fontSize:10, letterSpacing:0.3, lineHeight:1, display:"flex", alignItems:"center" }}>
        <span style={{ color:"var(--muted)" }}>{day}</span>&nbsp;{date}&nbsp;<span style={{ color:"var(--teal)", fontWeight:600 }}>{time}</span>
      </span>
    </div>
  );
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

function CardGrid({ cards, chartOverrides, setChartOverride, layoutKey, onRemoveCard }) {
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
              <DashCard card={card} chartOverrides={chartOverrides} setChartOverride={setChartOverride} onRemove={hideCard} />
              {/* YANGI indikator — 3 daqiqa ichida yaratilgan kartalar, pastki chap burchak */}
              {card.id && String(card.id).startsWith("ai_") && (Date.now() - parseInt(String(card.id).split("_")[1] || 0)) < 180000 && (
                <div style={{ position:"absolute", bottom:8, right:8, zIndex:5, width:8, height:8, borderRadius:"50%", background:"#4ADE80", boxShadow:"0 0 8px rgba(74,222,128,0.6)", animation:"pulse-voice 2s ease infinite" }} title="Yangi qo'shilgan" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashCard({ card, chartOverrides, setChartOverride, onRemove }) {
  const cType = chartOverrides[card.id] || card.chartType;
  const CARD_H = 380; // Barcha kartalar uchun YAGONA balandlik

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
      const renderLabel = ({ name, percent, cx, cy, midAngle, outerRadius }) => {
        if (percent < 0.03) return null;
        const RADIAN = Math.PI / 180;
        const radius = outerRadius + 22;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return <text x={x} y={y} fill="#CBD5E1" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10} fontFamily="Space Grotesk,sans-serif" fontWeight={600}>
          {name.substring(0, 12)} {(percent * 100).toFixed(0)}%
        </text>;
      };
      return <ResponsiveContainer width="100%" height={h}>
        <PieChart>
          <Pie data={mainSlices} cx="50%" cy="45%" outerRadius={Math.min(h / 3, 90)} innerRadius={dominant ? 0 : Math.min(h / 6, 30)} dataKey="value"
            label={renderLabel} labelLine={{ stroke: "rgba(148,163,184,0.3)", strokeWidth: 1 }} paddingAngle={mainSlices.length > 1 ? 2 : 0}>
            {mainSlices.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />)}
          </Pie>
          <Tooltip formatter={(v) => v.toLocaleString()} contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(0,201,190,0.2)", borderRadius: 10, fontSize: 11, fontFamily: "var(--fm)" }} itemStyle={{ color: "#CBD5E1" }} labelStyle={{ color: "#94A3B8" }} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--fm)", paddingTop: 4 }} iconType="circle" iconSize={8} />
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
          <div className="card-title" style={{marginBottom:0}}>{card.icon} {card.title}</div>
          {onRemove && <button className="btn btn-ghost" onClick={()=>onRemove(card.id)} style={{padding:"4px 6px",fontSize:10,borderRadius:6,color:"var(--red)",borderColor:"rgba(248,113,113,0.2)"}}>✕</button>}
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
          <div className="card-title" style={{marginBottom:0,textAlign:"center",flex:1}}>{card.icon} {card.title}</div>
          {onRemove && <button className="btn btn-ghost" onClick={()=>onRemove(card.id)} style={{padding:"4px 6px",fontSize:10,borderRadius:6,color:"var(--red)",borderColor:"rgba(248,113,113,0.2)"}}>✕</button>}
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
          <div className="card-title" style={{marginBottom:0}}>{card.icon} {card.title}</div>
          {onRemove && <button className="btn btn-ghost" onClick={()=>onRemove(card.id)} style={{padding:"4px 6px",fontSize:10,borderRadius:6,color:"var(--red)",borderColor:"rgba(248,113,113,0.2)"}}>✕</button>}
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

  // ── CHART type — faqat ma'lumotga ENG MOS 2-3 ta turni ko'rsatish ──
  const compatibleTypes = useMemo(() => {
    const data = card.data || [];
    if (!data.length) return [card.chartType || "bar"];
    const keys = Object.keys(data[0] || {});
    const numKeys = keys.filter(k => {
      const vals = data.map(r => parseFloat(String(r[k]).replace(/[^0-9.-]/g, '')));
      return vals.filter(v => !isNaN(v)).length > data.length * 0.4;
    });

    // Pie chart uchun — faqat bar bilan almashtirish mumkin
    if (card.chartType === "pie") return ["pie", "bar"];

    // Scatter — faqat scatter va bar
    if (card.chartType === "scatter") return ["scatter", "bar"];

    // Asosiy tur + 1-2 ta alternativa
    const types = [card.chartType || "bar"];
    if (data.length >= 4 && !types.includes("line")) types.push("line");
    if (!types.includes("bar")) types.push("bar");
    if (data.length >= 2 && data.length <= 10 && numKeys.length === 1 && !types.includes("pie")) types.push("pie");

    return types.slice(0, 3); // Max 3 ta
  }, [card.data, card.chartType]);

  const filteredOptions = CHART_TYPE_OPTIONS.filter(o => compatibleTypes.includes(o.id));

  return (
    <CardWrap>
      <div className="flex aic jb mb6">
        <div className="card-title" style={{ marginBottom: 0, fontSize: 12 }}>{card.icon} {card.title}</div>
        <div className="flex gap4 aic">
          {filteredOptions.map(o => (
            <button key={o.id} className="btn btn-ghost" title={o.l}
              onClick={() => setChartOverride(card.id, o.id)}
              style={{
                padding: "4px 8px", fontSize: 10, borderRadius: 6,
                ...(cType === o.id ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(0,201,190,0.08)" } : {})
              }}>
              {o.l.split(" ")[0]}
            </button>
          ))}
          {onRemove && (
            <button className="btn btn-ghost" title="Kartani o'chirish"
              onClick={() => onRemove(card.id)}
              style={{ padding: "4px 6px", fontSize: 10, borderRadius: 6, color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}>
              ✕
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {renderChart()}
      </div>
    </CardWrap>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────
function DashboardPage({ sources, aiConfig, setPage, user }) {
  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const prov = AI_PROVIDERS[aiConfig.provider];
  const connected = sources.filter(s => s.connected && s.active);
  const total = connected.reduce((a, s) => a + (s.data?.length || 0), 0);
  const [activeSrc, setActiveSrc] = useState(null);
  const [chartOverrides, setChartOverrides] = useState({});

  const setChartOverride = (cardId, type) => setChartOverrides(prev => ({ ...prev, [cardId]: type }));

  // Tanlangan manba yoki birinchi connected
  const workingSrc = activeSrc ? sources.find(s => s.id === activeSrc) : connected[0];

  // Avtomatik dashboard generatsiya
  const dashCards = useMemo(() => workingSrc ? generateDashboards(workingSrc) : [], [workingSrc?.id, workingSrc?.data?.length, workingSrc?.updatedAt]);

  return (
    <div>
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

      {/* ── Umumiy stat cards ── */}
      <div className="g4 mb16">
        {[
          { l: "Aktiv Manbalar", v: connected.length, s: `/ ${sources.length} manba`, c: "var(--green)", i: "", acc: "#4ADE80" },
          { l: "Jami Yozuvlar", v: total.toLocaleString(), s: total > 0 ? "Yuklangan" : "Data yuklang", c: "var(--teal)", i: "", acc: "#00C9BE" },
          { l: "Dashboard Kartalar", v: dashCards.length, s: "avtomatik yaratilgan", c: "var(--gold)", i: "", acc: "#E8B84B" },
          { l: "AI Provayder", v: prov.name, s: aiConfig.apiKey ? (aiConfig.isPersonal ? "Shaxsiy kalit" : "Global AI") : "Ulanmagan", c: prov.color, i: prov.icon, acc: prov.color },
        ].map((c, i) => (
          <div key={i} style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", transition: "all .22s", cursor: "default" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = c.acc + "44"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.acc}80,transparent)` }} />
            <div style={{ fontSize: 20, marginBottom: 10, color: c.acc }}>{c.i}</div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 800, color: c.c, lineHeight: 1, marginBottom: 5 }}>{c.v}</div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 9, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 2 }}>{c.l}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5, fontFamily: "var(--fm)" }}>{c.s}</div>
          </div>
        ))}
      </div>

      {/* ── Tezkor Amallar ── */}
      <div className="section-hd mb10">Tezkor Amallar</div>
      <div className="g4 mb20">
        {[
          { ico: "", lbl: "Grafiklar", desc: "Batafsil vizualizatsiya", page: "charts", c: "var(--teal)", acc: "#00C9BE" },
          { ico: "", lbl: "AI Chat", desc: "Savol-javob", page: "chat", c: "var(--green)", acc: "#4ADE80" },
          { ico: "", lbl: "Tahlil", desc: "6 xil modul", page: "analytics", c: "var(--gold)", acc: "#E8B84B" },
          { ico: "", lbl: "Alertlar", desc: "AI monitoring", page: "alerts", c: "var(--red)", acc: "#F87171" },
        ].map((a, i) => (
          <div key={i} style={{ background: "var(--s2)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all .2s" }}
            onClick={() => setPage(a.page)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = a.acc + "50"; e.currentTarget.style.transform = "translateY(-2px)" }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none" }}>
            <div style={{ fontSize: 18, color: a.c, marginBottom: 8 }}>{a.ico}</div>
            <div style={{ fontFamily: "var(--fh)", fontSize: 12, fontWeight: 700 }}>{a.lbl}</div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>{a.desc}</div>
          </div>
        ))}
      </div>

      {/* ── Anomaliya Aniqlash (avtomatik, collapse) ── */}
      {(() => {
        const anomalies = detectAnomalies(connected);
        if (anomalies.length === 0) return null;
        const dangerCount = anomalies.filter(a => a.severity === 'danger').length;
        const warnCount = anomalies.filter(a => a.severity === 'warning').length;
        const infoCount = anomalies.filter(a => a.severity !== 'danger' && a.severity !== 'warning').length;
        const sevColors = { danger: { bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.25)", color: "#F87171", label: "Xavfli" }, warning: { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.25)", color: "#FBBF24", label: "Ogohlantirish" }, info: { bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.25)", color: "#60A5FA", label: "Ma'lumot" } };
        return (
          <div className="mb20" style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: dangerCount > 0 ? "linear-gradient(90deg, #F87171, #FBBF24, #60A5FA)" : "linear-gradient(90deg, #FBBF24, #60A5FA)" }} />
            {/* Sarlavha — bosilganda ochiladi/yopiladi */}
            <div className="flex aic jb" style={{ cursor: "pointer" }} onClick={() => setAnomalyOpen(p => !p)}>
              <div className="flex aic gap10">
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.5" fill="#FBBF24"/></svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--fh)", fontSize: 14, fontWeight: 800 }}>Anomaliyalar aniqlandi</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{anomalyOpen ? "Batafsil ko'rish" : "Bosib oching"} — {anomalies.length} ta topilma</div>
                </div>
              </div>
              <div className="flex aic gap6">
                {dangerCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 700 }}>{dangerCount} xavfli</span>}
                {warnCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#FBBF24", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 700 }}>{warnCount} ogohlantirish</span>}
                {infoCount > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#60A5FA", fontSize: 10, fontFamily: "var(--fh)", fontWeight: 700 }}>{infoCount} ma'lumot</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform .3s", transform: anomalyOpen ? "rotate(180deg)" : "rotate(0)" }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            {/* Kartalar — faqat ochiq bo'lganda */}
            {anomalyOpen && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginTop: 16 }}>
              {anomalies.map((a, i) => {
                const sev = sevColors[a.severity] || sevColors.warning;
                return (
                  <div key={i} style={{ padding: "16px 18px", borderRadius: 14, border: `1px solid ${sev.border}`, background: sev.bg, transition: "all .2s", display: "flex", flexDirection: "column" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 24px ${sev.border}`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                    {/* Karta header */}
                    <div className="flex aic gap8 mb8">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: sev.color, flexShrink: 0, boxShadow: `0 0 8px ${sev.color}60` }} />
                      <span style={{ fontFamily: "var(--fh)", fontSize: 10, fontWeight: 700, color: sev.color, textTransform: "uppercase", letterSpacing: 1 }}>{sev.label}</span>
                      <span style={{ fontSize: 9, color: "var(--muted)", marginLeft: "auto", background: "var(--s2)", padding: "2px 8px", borderRadius: 8 }}>{a.source}</span>
                    </div>
                    {/* Ustun nomi */}
                    <div style={{ fontFamily: "var(--fh)", fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>{a.fieldName || a.field?.replace(/_/g, " ")}</div>
                    {/* Raqamlar */}
                    <div className="flex gap12 mb10" style={{ flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: sev.color }}>{typeof a.value === "number" ? a.value.toLocaleString() : a.value}</div>
                        <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Hozirgi</div>
                      </div>
                      {a.mean != null && (
                        <div>
                          <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: "var(--muted)" }}>{typeof a.mean === "number" ? a.mean.toLocaleString() : a.mean}</div>
                          <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>O'rtacha</div>
                        </div>
                      )}
                      {a.mean != null && a.value != null && typeof a.value === "number" && typeof a.mean === "number" && a.mean !== 0 && (
                        <div>
                          <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 800, color: a.value > a.mean ? "#4ADE80" : "#F87171" }}>
                            {a.value > a.mean ? "+" : ""}{Math.round((a.value - a.mean) / a.mean * 100)}%
                          </div>
                          <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Farq</div>
                        </div>
                      )}
                    </div>
                    {/* Tushuntirish */}
                    {a.explanation && (
                      <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.65, marginBottom: 8, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, borderLeft: `3px solid ${sev.color}30` }}>{a.explanation}</div>
                    )}
                    {/* Tavsiya */}
                    {a.recommendation && (
                      <div style={{ fontSize: 10, color: "var(--teal)", lineHeight: 1.6, padding: "6px 10px", background: "rgba(0,201,190,0.04)", borderRadius: 8, display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C9BE" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span>{a.recommendation}</span>
                      </div>
                    )}
                    {/* Trend badge */}
                    {(a.type === "trend_down" || a.type === "trend_up") && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, marginTop: 8, background: a.type === "trend_down" ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)", border: `1px solid ${a.type === "trend_down" ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)"}`, fontSize: 10, color: a.type === "trend_down" ? "#F87171" : "#4ADE80", fontWeight: 600 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {a.type === "trend_down" ? <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></> : <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>}
                        </svg>
                        {a.type === "trend_down" ? "Ketma-ket pasayish" : "Kuchli o'sish"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>}
          </div>
        );
      })()}

      {/* ── Avtomatik Dashboard Kartalar ── */}
      {dashCards.length > 0 && (
        <>
          <div className="flex aic jb mb12">
            <div className="section-hd" style={{ marginBottom: 0 }}>
              {SOURCE_TYPES[workingSrc?.type]?.icon} {workingSrc?.name} — Dashboard
            </div>
            <span className="badge b-ok">{dashCards.length} karta</span>
          </div>
          <CardGrid cards={dashCards} chartOverrides={chartOverrides} setChartOverride={setChartOverride} layoutKey={"u_"+(user?.id||"anon")+"_layout_dash_"+(workingSrc?.id||"")} />
        </>
      )}

      {/* ── Ma'lumot yo'q holat ── */}
      {connected.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}></div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Dashboard avtomatik yaratiladi</div>
          <div className="text-muted text-sm mb16">Data Hub dan manba ulang — Excel, Instagram, Telegram yoki API</div>
          <button className="btn btn-primary" onClick={() => setPage("datahub")}> Data Hub ga o'tish</button>
        </div>
      )}

      {connected.length > 0 && dashCards.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}></div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 13 }}>Ma'lumot yuklanmoqda...</div>
          <div className="text-muted text-sm mt4">Manbani ulab, ma'lumot yuklang</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
const NAV = [
  { id: "settings", ico: "", lbl: "AI Sozlamalar", group: "tizim" },
  { id: "dashboard", ico: "", lbl: "Bosh Sahifa", group: "tizim" },
  { id: "datahub", ico: "", lbl: "Data Hub", group: "ma'lumot", badge: "sources" },
  { id: "charts", ico: "", lbl: "Grafiklar", group: "ma'lumot" },
  { id: "chat", ico: "", lbl: "AI Maslahat", group: "ai" },
  { id: "analytics", ico: "", lbl: "Tahlil", group: "ai" },
  { id: "reports", ico: "", lbl: "Hisobotlar", group: "ai" },
  { id: "alerts", ico: "", lbl: "AI Ogohlantirishlar", group: "ai", badge: "alerts" },
];

export default function App() {
  // ── Auth state ──
  const [authPage, setAuthPage] = useState("landing"); // landing|login|register
  const [user, setUser] = useState(() => Auth.getSession());

  // ── Per-user localStorage prefix ──
  const uKey = useCallback((k) => "u_" + (user?.id || "anon") + "_" + k, [user?.id]);

  // ── App state (only when logged in) ──
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminMode, setAdminMode] = useState(false);
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
  const { notifs, push } = useNotifs();
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
      loadSourcesFromAPI().then(apiSources => {
        if (Array.isArray(apiSources) && apiSources.length > 0) {
          setSources(apiSources);
          saveSources(apiSources, uid);
        }
      }).catch(() => { });
      AlertsAPI.getAll().then(a => { if (Array.isArray(a)) setAlerts(a); }).catch(() => { });
      AiAPI.getConfig().then(cfg => {
        if (cfg && cfg.provider) setAiConfig({ provider: cfg.provider, model: cfg.model || "deepseek-chat", apiKey: cfg.apiKey || "" });
      }).catch(() => { });
      GlobalAI.load().catch(() => { });
    }
  }, [user?.id]);

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
    { key: "goal", label: "BiznesAI dan nimani kutasiz?", placeholder: "", type: "select", options: ["Vaqtimni tejashni", "Aniq raqamlar bilan qaror qabul qilishni", "Avtomatik hisobotlar olishni", "Muammolarni oldindan ko'rishni", "Biznesni o'stirish strategiyasini"] },
  ];

  const saveOnboarding = () => {
    const pfx = "u_" + (user?.id || "anon") + "_";
    LS.set(pfx + "onboarding", onbData);
    LS.set(pfx + "onboarding_done", true);
    setShowOnboarding(false);
    push(`Rahmat, ${onbData.bizName || user?.name}! Tizim sizga moslashtirildi`, "ok");
  };

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
    setUser(null);
    setAuthPage("landing");
    setAdminMode(false);
    push("Chiqildi", "info");
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

  // ── Not logged in ──
  if (!user) {
    if (authPage === "login") return <LoginPage onAuth={handleAuth} onGoRegister={() => setAuthPage("register")} onGoLanding={() => setAuthPage("landing")} />;
    if (authPage === "register") return <RegisterPage onAuth={handleAuth} onGoLogin={() => setAuthPage("login")} onGoLanding={() => setAuthPage("landing")} />;
    return (
      <>
        <style>{CSS}</style>
        <NotifBanner notifs={notifs} />
        <LandingPage onLogin={() => setAuthPage("login")} onRegister={() => setAuthPage("register")} />
      </>
    );
  }

  // ── Onboarding Modal ──
  const onboardingModal = showOnboarding && (
    <div style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(12px)" }}>
      <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:24, padding:"36px 32px", width:"100%", maxWidth:460, position:"relative", animation:"fadeIn .3s ease" }}>
        {/* Progress */}
        <div style={{ display:"flex", gap:4, marginBottom:24 }}>
          {onbQuestions.map((_, i) => (
            <div key={i} style={{ flex:1, height:3, borderRadius:2, background: i <= onbStep ? "linear-gradient(90deg,#00C9BE,#4ADE80)" : "var(--s3)", transition:"all .3s" }} />
          ))}
        </div>
        {/* Savol */}
        <div style={{ fontSize:10, color:"var(--teal)", fontFamily:"var(--fh)", textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>{onbStep + 1} / {onbQuestions.length}</div>
        <div style={{ fontFamily:"var(--fh)", fontSize:20, fontWeight:800, marginBottom:16, lineHeight:1.3 }}>{onbQuestions[onbStep]?.label}</div>
        {/* Input */}
        {onbQuestions[onbStep]?.type === "input" ? (
          <input className="field" placeholder={onbQuestions[onbStep]?.placeholder} value={onbData[onbQuestions[onbStep]?.key] || ""}
            onChange={e => setOnbData(p => ({ ...p, [onbQuestions[onbStep]?.key]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { onbStep < onbQuestions.length - 1 ? setOnbStep(s => s + 1) : saveOnboarding(); }}}
            style={{ fontSize:14, padding:"14px 18px", marginBottom:16 }} autoFocus />
        ) : (
          <div style={{ display:"grid", gap:8, marginBottom:16 }}>
            {onbQuestions[onbStep]?.options?.map(opt => (
              <button key={opt} onClick={() => { setOnbData(p => ({ ...p, [onbQuestions[onbStep]?.key]: opt })); setTimeout(() => { onbStep < onbQuestions.length - 1 ? setOnbStep(s => s + 1) : saveOnboarding(); }, 200); }}
                style={{
                  padding:"12px 18px", borderRadius:12, border:`1px solid ${onbData[onbQuestions[onbStep]?.key] === opt ? "rgba(0,201,190,0.5)" : "var(--border)"}`,
                  background: onbData[onbQuestions[onbStep]?.key] === opt ? "rgba(0,201,190,0.08)" : "var(--s2)",
                  color: onbData[onbQuestions[onbStep]?.key] === opt ? "var(--teal)" : "var(--text2)",
                  fontSize:13, textAlign:"left", cursor:"pointer", transition:"all .2s", fontWeight: onbData[onbQuestions[onbStep]?.key] === opt ? 700 : 400,
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
          {onbStep > 0 && <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setOnbStep(s => s - 1)}>← Orqaga</button>}
          {onbQuestions[onbStep]?.type === "input" && (
            <button className="btn btn-primary" style={{ flex:1 }} onClick={() => { onbStep < onbQuestions.length - 1 ? setOnbStep(s => s + 1) : saveOnboarding(); }}>
              {onbStep < onbQuestions.length - 1 ? "Keyingi →" : "Boshlash →"}
            </button>
          )}
          <button className="btn btn-ghost btn-xs" style={{ position:"absolute", top:16, right:16, color:"var(--muted)" }} onClick={() => { saveOnboarding(); }}>O'tkazib yuborish</button>
        </div>
      </div>
    </div>
  );

  // ── Admin mode ──
  if (adminMode && user.role === "admin") {
    return (
      <>
        <style>{CSS}</style>
        <NotifBanner notifs={notifs} />
        <div className="app">
          {/* Admin Sidebar */}
          <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
            <div className="logo-wrap">
              <div className="logo-main">BIZ<span>NES</span>AI</div>
              <div className="logo-sub" style={{ color: "var(--red)" }}>Admin Panel</div>
              <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
            </div>
            <div className="nav" style={{ paddingTop: 14 }}>
              <div className="ni active" onClick={() => setAdminMode(true)}>
                <span>Admin Panel</span>
              </div>
              <div style={{ height: 12 }} />
              <div className="ni" onClick={() => { setAdminMode(false); setPage("dashboard"); }}>
                <span>Dashboard ga qaytish</span>
              </div>
            </div>
            <div className="sidebar-footer">
              <span style={{ color: "var(--red)" }}> Admin</span> · {user.name}
            </div>
          </div>
          <div className="main">
            <div className="topbar">
              <div className="flex aic gap10">
                <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)}></button>
                <div className="page-title" style={{ color: "var(--red)" }}> Admin Panel</div>
              </div>
              <div className="topbar-right">
                <span className="badge b-red" style={{ fontFamily: "var(--fh)" }}>Admin: {user.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setAdminMode(false); setPage("dashboard"); }}>← Dashboard</button>
                <button className="btn btn-danger btn-sm" onClick={handleLogout}>Chiqish</button>
              </div>
            </div>
            <div className="content">
              <AdminPanel currentUser={user} push={push} sources={sources} />
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Page titles ──
  const PAGE_TITLES = {
    settings: "AI Sozlamalar", dashboard: "Bosh Sahifa", datahub: "Data Hub — Konstruktor",
    charts: "Grafiklar", chat: "AI Maslahat", analytics: "Tahlil",
    reports: "Hisobotlar", alerts: "AI Ogohlantirishlar", profile: "Profil & Tarif"
  };

  // ── Page components ──
  const pages = {
    settings: <SettingsPage aiConfig={aiConfig} setAiConfig={setAiConfig} push={push} effectiveAI={effectiveAI} hasPersonalKey={hasPersonalKey} hasGlobalAI={hasGlobalAI} user={user} />,
    dashboard: <DashboardPage sources={sources} aiConfig={effectiveAI} setPage={setPage} user={user} />,
    datahub: <DataHubPage sources={sources} setSources={setSources} push={push} user={user} />,
    charts: <ChartsPage sources={sources} aiConfig={effectiveAI} user={user} hasPersonalKey={hasPersonalKey} onAiUsed={onAiUsed} runBackgroundAI={runBackgroundAI} />,
    chat: <ChatPage aiConfig={effectiveAI} sources={sources} user={user} hasPersonalKey={hasPersonalKey} onAiUsed={onAiUsed} />,
    analytics: <AnalyticsPage aiConfig={effectiveAI} sources={sources} user={user} onAiUsed={onAiUsed} />,
    reports: <ReportsPage aiConfig={effectiveAI} sources={sources} user={user} onAiUsed={onAiUsed} />,
    alerts: <AlertsPage aiConfig={effectiveAI} sources={sources} alerts={alerts} addAlert={addAlert} markAllRead={markAllRead} deleteAlert={deleteAlert} push={push} user={user} onAiUsed={onAiUsed} />,
    profile: <ProfilePage user={user} onPlanChange={handlePlanChange} push={push} sources={sources} />,
  };

  const groupedNav = NAV.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item); return acc;
  }, {});

  return (
    <>
      <style>{CSS}</style>
      <NotifBanner notifs={notifs} />
      {onboardingModal}
      <div className="app">
        {/* Mobile overlay */}
        {sidebarOpen && <div className="mob-overlay" onClick={() => setSidebarOpen(false)} />}

        {/* SIDEBAR */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          <div className="logo-wrap">
            <div className="logo-main">BIZ<span>NES</span>AI</div>
            <div className="logo-sub">Strategik Agent v2</div>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
          </div>

          <div className="nav">
            {/* Plan badge in sidebar */}
            <div style={{ margin: "6px 4px 4px", padding: "8px 10px", borderRadius: 8, background: currentPlan.color + "10", border: `1px solid ${currentPlan.color}25`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: currentPlan.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--fh)", fontSize: 11, fontWeight: 600, color: currentPlan.color, flex: 1 }}>{currentPlan.nameUz}</span>
              {user.plan === "free" && <span style={{ fontSize: 9, color: "var(--muted)", cursor: "pointer" }} onClick={() => setPage("profile")}> Yangilash</span>}
            </div>

            {Object.entries(groupedNav).map(([group, items]) => (
              <div key={group}>
                <div className="nav-group-label">{group}</div>
                {items.map(item => {
                  const count = item.badge === "sources" ? connCount : item.badge === "alerts" ? unreadAlerts : null;
                  return (
                    <div key={item.id} className={`ni ${page === item.id ? "active" : ""}`}
                      onClick={() => { setPage(item.id); if (window.innerWidth < 768) setSidebarOpen(false); }}>
                      
                      <span>{item.lbl}</span>
                      {count != null && count > 0 && <span className={`ni-badge ml-auto ${item.badge === "alerts" ? "warn" : ""}`}>{count}</span>}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Admin link */}
            {user.role === "admin" && (
              <>
                <div className="nav-group-label">Boshqaruv</div>
                <div className="ni" style={{ color: "var(--red)", borderColor: "rgba(248,113,113,0.15)" }}
                  onClick={() => setAdminMode(true)}>
                  
                  <span>Admin Panel</span>
                  <span className="ni-badge ml-auto warn">{Auth.getUsers().length}</span>
                </div>
              </>
            )}
          </div>

          {/* Provider pill */}
          <div className="prov-pill" onClick={() => setPage("settings")}>
            <div className="pulse-dot" style={{ background: prov.color }} />
            <div className="f1">
              <div style={{ fontSize: 11, fontWeight: 600, color: prov.color, fontFamily: "var(--fh)" }}>{prov.name}</div>
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>{aiConfig.apiKey ? "✓ Ulangan" : " Kalit kerak"}</div>
            </div>
            <span style={{ fontSize: 11, color: prov.color }}></span>
          </div>

          {/* User footer */}
          <div className="sidebar-footer" style={{ cursor: "pointer" }} onClick={() => setPage("profile")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: currentPlan.color + "25", border: `1px solid ${currentPlan.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fh)", fontSize: 11, fontWeight: 800, color: currentPlan.color, flexShrink: 0 }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontFamily: "var(--fh)", fontWeight: 600, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                <div style={{ fontSize: 9, color: "var(--muted)" }}>{connCount} manba · {sources.reduce((a, s) => a + (s.data?.length || 0), 0).toLocaleString()} qator</div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {/* TOPBAR */}
          <div className="topbar">
            <div className="flex aic gap10">
              <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)}></button>
              <div className="page-title">{PAGE_TITLES[page] || page}</div>
            </div>
            <div className="topbar-right">
              {bgTaskCount > 0 && (
                <div className="tb-item" onClick={() => { const t = bgTasksRef.current.find(t => t.status === "running"); if (t?.page) setPage(t.page); }}
                  style={{ borderColor:"rgba(0,201,190,0.2)", color:"var(--teal)", fontWeight:600, animation:"pulse-voice 2s ease infinite" }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--teal)", animation:"pulse-voice 1s ease infinite" }}/>
                  AI ({bgTaskCount})
                </div>
              )}
              {unreadAlerts > 0 && (
                <div className="tb-item" onClick={() => setPage("alerts")} style={{ borderColor:"rgba(212,168,83,0.2)", color:"var(--gold)", fontWeight:600 }}>
                  {unreadAlerts}
                </div>
              )}
              <div className="tb-item" onClick={() => setPage("settings")} style={{ borderColor: prov.color + "20" }}>
                <span style={{ color: prov.color }}>{prov.icon}</span>
                <span style={{ color: prov.color, fontWeight:600 }} className="hide-mobile">{prov.name}</span>
                <span style={{ color: "var(--muted)" }}>·</span>
                <span style={{ fontSize: 10, color: "var(--muted)" }} className="hide-mobile">{aiConfig.model.split("-").slice(1, 3).join("-")}</span>
              </div>
              <ThemeToggle theme={theme} toggle={toggleTheme} setTheme={setTheme} size="sm" />
              <LiveClock />
              <div className="tb-item" onClick={handleLogout} style={{ borderColor:"rgba(248,113,113,0.2)", color:"#FB7185", fontWeight:600 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span className="hide-mobile">Chiqish</span>
              </div>
            </div>
          </div>

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