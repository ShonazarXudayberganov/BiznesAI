/**
 * BiznesAI — Frontend API Helper
 * localStorage o'rniga backend API bilan ishlash
 */

const API_BASE = '/api';

// ── Token boshqarish ──
let _token = localStorage.getItem('bai_token') || '';

export const Token = {
  get: () => _token,
  set: (t) => { _token = t; localStorage.setItem('bai_token', t); },
  clear: () => { _token = ''; localStorage.removeItem('bai_token'); },
};

// ── Bazaviy fetch wrapper ──
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const hadTokenAtRequest = !!_token;
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (networkErr) {
    // Network xato (backend ishlamayapti) — jimgina throw
    throw new Error('Server bilan aloqa yo\'q');
  }

  // 401 handling — quyidagi shartlarda har xil:
  //   1. /auth/login va /auth/register — bu noto'g'ri credentials (sessiya emas), error qaytarish
  //   2. Token yo'q edi (hadTokenAtRequest=false) — 401 kutilgan, hech narsa qilmaymiz
  //   3. Token bor edi va 401 — sessiya tugagan, logout va event
  if (res.status === 401) {
    const isAuthEntry = path === '/auth/login' || path === '/auth/register';
    if (isAuthEntry) {
      let errData = null;
      try { errData = await res.json(); } catch {}
      const err = new Error(errData?.error || 'Email yoki parol noto\'g\'ri');
      err.status = 401;
      throw err;
    }
    if (hadTokenAtRequest) {
      // Token bor edi va backend 401 dedi → sessiya yaroqsiz
      Token.clear();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-expired'));
      }
      throw new Error('Sessiya tugadi, qayta kiring');
    }
    // Token yo'q edi — call qilmaslik kerak edi, lekin 401 noaniq error
    throw new Error('Avtorizatsiya kerak');
  }

  // 304 yoki bo'sh body
  if (res.status === 304 || res.headers.get('content-length') === '0') {
    return null;
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }

  // 402 — kunlik cost cap'ga yetdi (Faza 5.3)
  if (res.status === 402 && data?.cap_usd !== undefined) {
    const err = new Error(data.error || 'Kunlik AI limit tugadi');
    err.code = 'COST_CAP_HIT';
    err.cap = data.cap_usd;
    err.spent = data.spent_usd;
    err.resetAt = data.reset_at;
    // Global event — CapHitModal ushlaydi
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ai-cap-hit', {
        detail: { cap: data.cap_usd, spent: data.spent_usd, resetAt: data.reset_at }
      }));
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Server xatosi (${res.status})`);
  }

  return data;
}

// ── AUTH API ──
export const AuthAPI = {
  register: (name, email, password, organizationName) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, organizationName }),
    }),

  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch('/auth/me'),

  // To'liq kontekst: user + tashkilot + bo'limlar + ruxsatlar + AI usage
  context: () => apiFetch('/auth/context'),

  updateProfile: (data) =>
    apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  changePassword: (currentPassword, newPassword) =>
    apiFetch('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// ── DEPARTMENTS API (bo'limlar) ──
export const DepartmentsAPI = {
  getAll: (departmentId) =>
    apiFetch('/departments' + (departmentId ? `?department_id=${departmentId}` : '')),

  create: (data) =>
    apiFetch('/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiFetch(`/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id, force = false) =>
    apiFetch(`/departments/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
};

// ── EMPLOYEES API (xodimlar) ──
export const EmployeesAPI = {
  getAll: () => apiFetch('/employees'),

  getOne: (id) => apiFetch(`/employees/${id}`),

  getTemplates: () => apiFetch('/employees/permission-templates'),

  create: (data) =>
    apiFetch('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiFetch(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  resetPassword: (id, requireChange = false) =>
    apiFetch(`/employees/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ require_change: requireChange }),
    }),

  block: (id) =>
    apiFetch(`/employees/${id}/block`, { method: 'POST' }),

  unblock: (id) =>
    apiFetch(`/employees/${id}/unblock`, { method: 'POST' }),

  delete: (id, force = false) =>
    apiFetch(`/employees/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
};

// ── SUPER-ADMIN API (Shonazar — tashkilotlarni boshqarish) ──
export const SuperAdminAPI = {
  getOrganizations: (search) =>
    apiFetch('/super-admin/organizations' + (search ? `?search=${encodeURIComponent(search)}` : '')),

  getOrganization: (id) => apiFetch(`/super-admin/organizations/${id}`),

  createOrganization: (data) =>
    apiFetch('/super-admin/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateOrganization: (id, data) =>
    apiFetch(`/super-admin/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  extendSubscription: (id, months) =>
    apiFetch(`/super-admin/organizations/${id}/extend-subscription`, {
      method: 'POST',
      body: JSON.stringify({ months }),
    }),

  block: (id) => apiFetch(`/super-admin/organizations/${id}/block`, { method: 'POST' }),
  unblock: (id) => apiFetch(`/super-admin/organizations/${id}/unblock`, { method: 'POST' }),

  resetCeoPassword: (id) =>
    apiFetch(`/super-admin/organizations/${id}/reset-ceo-password`, { method: 'POST' }),

  impersonate: (id) =>
    apiFetch(`/super-admin/organizations/${id}/impersonate`, { method: 'POST' }),

  changePlan: (id, plan) =>
    apiFetch(`/super-admin/organizations/${id}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan }),
    }),

  delete: (id, force = false) =>
    apiFetch(`/super-admin/organizations/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  getStats: () => apiFetch('/super-admin/stats'),

  getAuditLog: (opts = {}) => {
    const q = [];
    if (opts.limit) q.push(`limit=${opts.limit}`);
    if (opts.offset) q.push(`offset=${opts.offset}`);
    if (opts.organization_id) q.push(`organization_id=${opts.organization_id}`);
    if (opts.action) q.push(`action=${encodeURIComponent(opts.action)}`);
    return apiFetch('/super-admin/audit-log' + (q.length ? '?' + q.join('&') : ''));
  },
};

// ── SOURCES API ──
export const SourcesAPI = {
  getAll: (departmentId) => apiFetch('/sources' + (departmentId ? `?department_id=${departmentId}` : '')),

  create: (source) =>
    apiFetch('/sources', {
      method: 'POST',
      body: JSON.stringify(source),
    }),

  update: (id, data) =>
    apiFetch(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  saveData: (id, data) =>
    apiFetch(`/sources/${id}/data`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    }),

  delete: (id) =>
    apiFetch(`/sources/${id}`, { method: 'DELETE' }),

  getStats: (id) => apiFetch(`/sources/${id}/stats`),

  // SMART AI CONTEXT — savol bilan qidiruv (RAG)
  getAiContext: (id, query) =>
    apiFetch(`/sources/${id}/ai-context`, { method: 'POST', body: JSON.stringify({ query: query || '' }) }),

  // Bir nechta manbadan birgalikda aqlli kontekst (Chat uchun)
  getSmartContext: (sourceIds, query) =>
    apiFetch('/sources/smart-context', { method: 'POST', body: JSON.stringify({ sourceIds, query: query || '' }) }),

  search: (id, query) =>
    apiFetch(`/sources/${id}/search`, { method: 'POST', body: JSON.stringify({ query }) }),

  searchAll: (query) =>
    apiFetch('/sources/search-all', { method: 'POST', body: JSON.stringify({ query }) }),
};

// ── ALERTS API ──
export const AlertsAPI = {
  getAll: () => apiFetch('/alerts'),

  create: (alert) =>
    apiFetch('/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    }),

  markAllRead: () =>
    apiFetch('/alerts/read-all', { method: 'PUT' }),

  delete: (id) =>
    apiFetch(`/alerts/${id}`, { method: 'DELETE' }),
};

// ── REPORTS API ──
export const ReportsAPI = {
  getAll: () => apiFetch('/reports'),

  create: (report) =>
    apiFetch('/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    }),

  delete: (id) =>
    apiFetch(`/reports/${id}`, { method: 'DELETE' }),

  deleteAll: () =>
    apiFetch('/reports', { method: 'DELETE' }),
};

// ── CHAT API ──
export const ChatAPI = {
  getHistory: () => apiFetch('/chat'),

  saveMessages: (messages) =>
    apiFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),

  clear: () =>
    apiFetch('/chat', { method: 'DELETE' }),
};

// ── AI CONFIG API ──
export const AiAPI = {
  getConfig: () => apiFetch('/ai/config'),

  saveConfig: (config) =>
    apiFetch('/ai/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getGlobal: () => apiFetch('/ai/global'),

  saveGlobal: (config) =>
    apiFetch('/ai/global', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  incrementUsage: () =>
    apiFetch('/ai/increment', { method: 'POST' }),

  comparePeriods: (params) =>
    apiFetch('/ai/compare-periods', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getPlanPrices: () => apiFetch('/ai/plan-prices'),

  savePlanPrices: (prices) =>
    apiFetch('/ai/plan-prices', {
      method: 'PUT',
      body: JSON.stringify(prices),
    }),
};

// ── CRM / Marketing platforma ulash (AmoCRM, Bitrix24, Facebook Ads) ──
export const CrmAPI = {
  // AmoCRM
  amocrmTest: (subdomain, token) => apiFetch('/crm/amocrm/test', {
    method: 'POST', body: JSON.stringify({ subdomain, token }),
  }),
  amocrmConnect: (subdomain, token, name) => apiFetch('/crm/amocrm/connect', {
    method: 'POST', body: JSON.stringify({ subdomain, token, name }),
  }),
  // Bitrix24
  bitrixTest: (webhookUrl) => apiFetch('/crm/bitrix24/test', {
    method: 'POST', body: JSON.stringify({ webhookUrl }),
  }),
  bitrixConnect: (webhookUrl, name) => apiFetch('/crm/bitrix24/connect', {
    method: 'POST', body: JSON.stringify({ webhookUrl, name }),
  }),
  // Facebook Ads
  facebookAdsTest: (token, accountId) => apiFetch('/crm/facebook_ads/test', {
    method: 'POST', body: JSON.stringify({ token, accountId }),
  }),
  facebookAdsConnect: (token, accountId, name) => apiFetch('/crm/facebook_ads/connect', {
    method: 'POST', body: JSON.stringify({ token, accountId, name }),
  }),
  // Sync (manual refresh)
  sync: (sourceId) => apiFetch(`/crm/sync/${sourceId}`, { method: 'POST' }),
};

// ── PDF (markdown'dan PDF) ──
export const PdfAPI = {
  fromMarkdown: ({ title, subtitle, markdown, footer, orgName }) =>
    apiFetch('/pdf/from-markdown', {
      method: 'POST',
      body: JSON.stringify({ title, subtitle, markdown, footer, orgName }),
    }),
};

// ── INSTAGRAM COMPETITORS (Variant A) — per-profile ──
export const InstagramCompetitorsAPI = {
  list: (sourceId) => apiFetch('/instagram/competitors' + (sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : '')),
  add: (username, sourceId) => apiFetch('/instagram/competitors', {
    method: 'POST', body: JSON.stringify({ username, source_id: sourceId || null }),
  }),
  remove: (id) => apiFetch(`/instagram/competitors/${id}`, { method: 'DELETE' }),
  refresh: (id) => apiFetch(`/instagram/competitors/${id}/refresh`, { method: 'POST' }),
  history: (id) => apiFetch(`/instagram/competitors/${id}/history`),
};

// ── BRANDING (white-label) ──
export const BrandingAPI = {
  get: () => apiFetch('/branding'),
  getByDomain: (domain) =>
    fetch(`/api/branding/by-domain?domain=${encodeURIComponent(domain)}`)
      .then(r => r.ok ? r.json() : { app_name: 'BiznesAI' })
      .catch(() => ({ app_name: 'BiznesAI' })),
  save: (branding, customDomain) =>
    apiFetch('/branding', {
      method: 'PUT',
      body: JSON.stringify({ branding, custom_domain: customDomain }),
    }),
};

// Apply branding to document (CSS variables + title)
export function applyBranding(b) {
  if (!b) return;
  if (b.app_name) document.title = b.app_name;
  if (b.favicon_url) {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = b.favicon_url;
  }
  if (b.primary_color) {
    document.documentElement.style.setProperty('--gold', b.primary_color);
    document.documentElement.style.setProperty('--gold2', b.primary_color);
  }
  if (b.accent_color) {
    document.documentElement.style.setProperty('--teal', b.accent_color);
  }
}

// ── REALTIME (SSE) ──
// Foydalanish: const close = subscribeRealtime({ onAlert, onSource, onAny });
export function subscribeRealtime({ onConnected, onAlert, onSource, onAny } = {}) {
  const token = Token.get();
  if (!token) return () => {};
  // EventSource standartda Authorization header qo'llab-quvvatlamaydi → query param orqali
  const url = `${API_BASE}/realtime/stream?_t=${encodeURIComponent(token)}`;
  let es;
  try {
    es = new EventSource(url, { withCredentials: true });
  } catch {
    return () => {};
  }
  const safeParse = (e) => { try { return JSON.parse(e.data); } catch { return null; } };
  if (onConnected) es.addEventListener('connected', e => onConnected(safeParse(e)));
  if (onAlert) es.addEventListener('alert.new', e => onAlert(safeParse(e)?.payload));
  if (onSource) es.addEventListener('source.updated', e => onSource(safeParse(e)?.payload));
  if (onAny) {
    es.onmessage = e => onAny(safeParse(e));
  }
  es.onerror = () => {/* auto-reconnect */};
  return () => { try { es.close(); } catch {} };
}

// ── PAYMENTS API ──
export const PaymentsAPI = {
  getAll: () => apiFetch('/payments'),

  create: (payment) =>
    apiFetch('/payments', {
      method: 'POST',
      body: JSON.stringify(payment),
    }),
};

// ── ADMIN API ──
export const AdminAPI = {
  getUsers: () => apiFetch('/admin/users'),

  getUser: (id) => apiFetch(`/admin/users/${id}`),

  createUser: (data) =>
    apiFetch('/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id, data) =>
    apiFetch(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (id) =>
    apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),

  getStats: () => apiFetch('/admin/stats'),
};

// ── FILE UPLOAD API ──
export const UploadAPI = {
  // Backend da parse qilib bazaga saqlash (PDF, Word, Excel)
  uploadAndParse: async (sourceId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${API_BASE}/upload/${sourceId}/parse`, {
      method: 'POST', headers, body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload xatosi');
    return data;
  },

  upload: async (sourceId, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    const res = await fetch(`${API_BASE}/upload/${sourceId}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload xatosi');
    return data;
  },

  getFiles: (sourceId) => apiFetch(`/upload/${sourceId}`),

  // Source siz — faqat matn ajratish (chat attachment uchun)
  parseOnly: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${API_BASE}/upload/parse-only`, {
      method: 'POST', headers, body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Parse xatosi');
    return data;
  },
};

// ── AI AGENT (sayt chat — backend tool use) ──
export const AiAgentAPI = {
  chat: (message, history, opts = {}) =>
    apiFetch('/ai/agent', {
      method: 'POST',
      body: JSON.stringify({
        message,
        history: history || [],
        thinking_budget: opts.thinkingBudget || 0,
        cache: opts.cache !== false,
      }),
    }),

  // Streaming chat (SSE) — onEvent({ type, data })
  // type: 'start' | 'tool' | 'delta' | 'thinking' | 'done' | 'error'
  // opts: { signal, thinkingBudget, cache, sourceIds }
  stream: async (message, history, onEvent, { signal, thinkingBudget, cache, sourceIds } = {}) => {
    const res = await fetch(`${API_BASE}/ai/agent/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      },
      body: JSON.stringify({
        message,
        history: history || [],
        thinking_budget: thinkingBudget || 0,
        cache: cache !== false,
        // Foydalanuvchi tanlagan manbalar — backend faqat shularda ishlaydi
        source_ids: Array.isArray(sourceIds) && sourceIds.length > 0 ? sourceIds : undefined,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `Stream xatosi (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let final = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split(/\n\n/);
      buf = events.pop() || '';
      for (const evt of events) {
        const lines = evt.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        onEvent?.({ type: event, data: parsed });
        if (event === 'done') final = parsed;
        if (event === 'error') throw new Error(parsed?.error || 'Stream xatosi');
      }
    }
    return final;
  },
};

// ── AI USAGE (cost telemetry — Faza 5.1) ──
export const AiUsageAPI = {
  /** Bugungi total cost (joriy user) */
  today: () => apiFetch('/admin/ai/usage/today'),

  /** Joriy user uchun to'liq statistika (today + 7 days + by_intent + cap) */
  me: () => apiFetch('/admin/ai/usage/me'),

  /** Admin: butun org uchun (days param) */
  org: (days = 30) => apiFetch(`/admin/ai/usage?days=${days}`),

  /** Admin: per-user cap o'zgartirish */
  setCap: (userId, capUsd) => apiFetch(`/admin/ai/cap/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ cap_usd: capUsd }),
  }),

  /** Admin: per-user cap ko'rish */
  getCap: (userId) => apiFetch(`/admin/ai/cap/${userId}`),
};

// ── AI BRAIN (yagona orchestrator — har sahifa shu yerga so'rov yuboradi) ──
export const AiBrainAPI = {
  /**
   * Sinxron brain chaqiruvi (kichik so'rovlar uchun).
   * @param {string} intent — `dashboard.summary`, `dashboard.widget`, va h.k.
   * @param {object} payload — intent-spetsifik vars
   * @param {object} [opts] — { message, history, thinkingBudget, language }
   */
  run: (intent, payload = {}, opts = {}) =>
    apiFetch('/ai/brain', {
      method: 'POST',
      body: JSON.stringify({
        intent,
        payload,
        message: opts.message,
        history: opts.history || [],
        thinkingBudget: opts.thinkingBudget || 0,
        language: opts.language,
      }),
    }),

  /**
   * Streaming brain chaqiruvi (SSE).
   * onEvent({ type, data }) — type: 'start' | 'tool' | 'delta' | 'thinking' | 'done' | 'error'
   * @returns {Promise<final>} — final = `done` event'ning data'si
   */
  stream: async (intent, payload = {}, onEvent, opts = {}) => {
    const res = await fetch(`${API_BASE}/ai/brain/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      },
      body: JSON.stringify({
        intent,
        payload,
        message: opts.message,
        history: opts.history || [],
        thinkingBudget: opts.thinkingBudget || 0,
        language: opts.language,
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      // 402 — kunlik cost cap (Faza 5.3)
      if (res.status === 402) {
        let parsed = null;
        try { parsed = JSON.parse(t); } catch {}
        const err = new Error(parsed?.error || 'Kunlik AI limit tugadi');
        err.code = 'COST_CAP_HIT';
        err.cap = parsed?.cap_usd;
        err.spent = parsed?.spent_usd;
        err.resetAt = parsed?.reset_at;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ai-cap-hit', {
            detail: { cap: parsed?.cap_usd, spent: parsed?.spent_usd, resetAt: parsed?.reset_at }
          }));
        }
        throw err;
      }
      throw new Error(t || `Brain stream xatosi (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let final = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split(/\n\n/);
      buf = events.pop() || '';
      for (const evt of events) {
        const lines = evt.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        onEvent?.({ type: event, data: parsed });
        if (event === 'done') final = parsed;
        if (event === 'error') throw new Error(parsed?.error || 'Brain stream xatosi');
      }
    }
    return final;
  },
};

// ── MEMORY API ──
export const MemoryAPI = {
  list: () => apiFetch('/ai/memory'),
  add: (content, kind, pinned) =>
    apiFetch('/ai/memory', {
      method: 'POST',
      body: JSON.stringify({ content, kind, pinned }),
    }),
  update: (id, patch) =>
    apiFetch(`/ai/memory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  remove: (id) => apiFetch(`/ai/memory/${id}`, { method: 'DELETE' }),
  clear: (keepPinned = true) =>
    apiFetch('/ai/memory/clear', {
      method: 'POST',
      body: JSON.stringify({ keepPinned }),
    }),
};

// ── USER SETTINGS API (til, tone, push, memory) ──
export const UserSettingsAPI = {
  get: () => apiFetch('/ai/settings'),
  save: (patch) =>
    apiFetch('/ai/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
};

// ── GOOGLE SHEETS API ──
export const SheetsAPI = {
  preview: (url) =>
    apiFetch('/sheets/preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  fetch: (url, sourceId) =>
    apiFetch('/sheets/fetch', {
      method: 'POST',
      body: JSON.stringify({ url, sourceId }),
    }),
};

// ── TELEGRAM API ──
export const TelegramAPI = {
  status: () => apiFetch('/telegram/status'),
  createLinkToken: (purpose = 'bot') =>
    apiFetch('/telegram/link-token', {
      method: 'POST',
      body: JSON.stringify({ purpose }),
    }),
  unlinkBot: () => apiFetch('/telegram/bot-link', { method: 'DELETE' }),
  getSettings: () => apiFetch('/telegram/settings'),
  updateSettings: (patch) =>
    apiFetch('/telegram/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  // ── MTProto (kanal statistikasi) ──
  mtprotoStatus: () => apiFetch('/telegram/mtproto/status'),
  sendCode: (phone) =>
    apiFetch('/telegram/mtproto/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyCode: (code, password) =>
    apiFetch('/telegram/mtproto/verify', {
      method: 'POST',
      body: JSON.stringify({ code, password }),
    }),
  adminChannels: () => apiFetch('/telegram/mtproto/admin-channels'),
  connectChannel: (channel) =>
    apiFetch('/telegram/mtproto/connect-channel', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),
  syncChannel: (id) =>
    apiFetch(`/telegram/mtproto/sync/${id}`, { method: 'POST' }),
  disconnectMtproto: () =>
    apiFetch('/telegram/mtproto', { method: 'DELETE' }),
  removeChannel: (id) =>
    apiFetch(`/telegram/mtproto/channel/${id}`, { method: 'DELETE' }),
  channelStats: (id) =>
    apiFetch(`/telegram/mtproto/channel/${id}/stats`),
};
