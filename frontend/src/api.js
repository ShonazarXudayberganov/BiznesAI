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
  register: (name, email, password) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch('/auth/me'),

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

// ── SOURCES API ──
export const SourcesAPI = {
  getAll: () => apiFetch('/sources'),

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

  getAiContext: (id) =>
    apiFetch(`/sources/${id}/ai-context`, { method: 'POST' }),
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
};
