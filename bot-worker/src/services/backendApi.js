/**
 * Bot worker'ning backend bilan ichki HTTP aloqasi.
 * Backend bot uchun AI chaqirish va kontekst tayyorlashni qiladi.
 */
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';
const SECRET = process.env.BOT_WORKER_INTERNAL_SECRET || '';

async function callBackend(method, path, body) {
  const opts = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': SECRET,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BACKEND_URL}${path}`, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || `Backend ${res.status}`);
  return data;
}

const BackendAPI = {
  aiChat: ({ organizationId, userId, message, history }) =>
    callBackend('POST', '/api/internal/ai-chat', { organizationId, userId, message, history }),
  orgSummary: (orgId) =>
    callBackend('GET', `/api/internal/org-summary?orgId=${orgId}`),
};

module.exports = BackendAPI;
