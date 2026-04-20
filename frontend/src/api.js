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
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (networkErr) {
    // Network xato (backend ishlamayapti) — jimgina throw
    throw new Error('Server bilan aloqa yo\'q');
  }

  // 401 bo'lsa token yaroqsiz — reload QILMAYMIZ (cheksiz loop oldini olish)
  if (res.status === 401) {
    Token.clear();
    throw new Error('Sessiya tugadi, qayta kiring');
  }

  // 304 yoki bo'sh body
  if (res.status === 304 || res.headers.get('content-length') === '0') {
    return null;
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }

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

  getPlanPrices: () => apiFetch('/ai/plan-prices'),

  savePlanPrices: (prices) =>
    apiFetch('/ai/plan-prices', {
      method: 'PUT',
      body: JSON.stringify(prices),
    }),
};

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
  chat: (message, history) =>
    apiFetch('/ai/agent', {
      method: 'POST',
      body: JSON.stringify({ message, history: history || [] }),
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
