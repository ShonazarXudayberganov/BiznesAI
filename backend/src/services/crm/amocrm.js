/**
 * AmoCRM integratsiya — long-lived access token orqali.
 *
 * Foydalanuvchi:
 *   1. AmoCRM hisobida → Sozlamalar → Integratsiyalar → Yangi integratsiya
 *   2. "Long-lived token" yoqilsa, tokens dashboardga chiqadi
 *   3. Subdomain (mycompany.amocrm.ru) + token saqlanadi
 *
 * API:
 *   - GET /api/v4/leads
 *   - GET /api/v4/contacts
 *   - GET /api/v4/companies
 *
 * Pagination: ?page=1&limit=250
 */

async function callAmo({ subdomain, token }, path, params = {}) {
  if (!subdomain || !token) throw new Error('AmoCRM: subdomain va token kerak');
  const cleanSubdomain = subdomain
    .replace(/^https?:\/\//, '')
    .replace(/\.amocrm\.(ru|com)$/, '')
    .replace(/\/$/, '')
    .replace(/[^a-z0-9-]/gi, '');
  if (!cleanSubdomain) throw new Error('AmoCRM: subdomain bo\'sh yoki noto\'g\'ri formatda');
  const tld = subdomain.includes('.com') ? 'com' : 'ru';
  const qs = new URLSearchParams(params).toString();
  const url = `https://${cleanSubdomain}.amocrm.${tld}/api/v4${path}${qs ? '?' + qs : ''}`;

  // DNS retry — EAI_AGAIN/ECONNRESET vaqtinchalik bo'lishi mumkin
  let res, lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'Analix-BiznesAI/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });
      break; // muvaffaqiyat — retry'dan chiqamiz
    } catch (e) {
      lastErr = e;
      const code = e?.cause?.code || e?.code || '';
      const isRetryable = ['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH'].includes(code);
      if (!isRetryable || attempt === 3) {
        const reason = code || e?.message;
        throw new Error(`AmoCRM ulanish xatosi (${cleanSubdomain}.amocrm.${tld}): ${reason}. Subdomain to'g'riligini va token amal qilishini tekshiring.`);
      }
      console.warn(`[AmoCRM] ${code} — retry ${attempt}/3 ...`);
      await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s
    }
  }
  if (!res) throw lastErr || new Error('AmoCRM: javob yo\'q');
  if (res.status === 204) return { _embedded: {}, _page_count: 0 };
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401) throw new Error(`AmoCRM: token noto'g'ri yoki muddati tugagan (HTTP 401)`);
    if (res.status === 403) throw new Error(`AmoCRM: ruxsat yo'q — token huquqlarini tekshiring (HTTP 403)`);
    if (res.status === 404) throw new Error(`AmoCRM: subdomain topilmadi (${cleanSubdomain}.amocrm.${tld}) — to'g'ri yozilganini tekshiring`);
    throw new Error(`AmoCRM ${path}: HTTP ${res.status} — ${t.slice(0, 200)}`);
  }
  return await res.json();
}

async function listAll({ subdomain, token }, path, withParam = '', maxPages = 12) {
  const all = [];
  let page = 1;
  while (page <= maxPages) {
    const params = { page, limit: 250 };
    if (withParam) params.with = withParam;
    const data = await callAmo({ subdomain, token }, path, params);
    const list = data?._embedded?.leads
      || data?._embedded?.contacts
      || data?._embedded?.companies
      || data?._embedded?.tasks
      || data?._embedded?.notes
      || data?._embedded?.events
      || data?._embedded?.users
      || [];
    if (list.length === 0) break;
    all.push(...list);
    if (list.length < 250) break;
    page++;
  }
  return all;
}

async function fetchLeads(creds) {
  // _embedded: contacts, loss_reason, tags, catalog_elements, companies
  return await listAll(creds, '/leads', 'contacts,loss_reason,tags,catalog_elements,companies');
}

async function fetchContacts(creds) {
  return await listAll(creds, '/contacts', 'leads,companies');
}

async function fetchCompanies(creds) {
  return await listAll(creds, '/companies');
}

async function fetchTasks(creds) {
  return await listAll(creds, '/tasks');
}

async function fetchUsers(creds) {
  // /users — managers ro'yxati
  return await listAll(creds, '/users');
}

async function fetchPipelines(creds) {
  // /leads/pipelines — pipeline + statuses (stage names)
  const data = await callAmo(creds, '/leads/pipelines');
  return data?._embedded?.pipelines || [];
}

async function fetchEvents(creds) {
  // /events — qo'ng'iroq, izoh, holat o'zgarishi va h.k. faoliyatlar
  return await listAll(creds, '/events', '', 4); // 1000 oxirgi event yetarli
}

async function fetchNotes(creds, entityType = 'leads') {
  // /leads/notes — leadlardagi izohlar
  return await listAll(creds, `/${entityType}/notes`, '', 4);
}

async function testConnection({ subdomain, token }) {
  const data = await callAmo({ subdomain, token }, '/account');
  return {
    ok: true,
    account: {
      id: data.id,
      name: data.name,
      subdomain: data.subdomain,
      currency: data.currency,
      country: data.country,
      timezone: data.timezone,
    },
  };
}

module.exports = {
  callAmo,
  fetchLeads, fetchContacts, fetchCompanies,
  fetchTasks, fetchUsers, fetchPipelines, fetchEvents, fetchNotes,
  testConnection,
};
