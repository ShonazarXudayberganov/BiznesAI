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
  const cleanSubdomain = subdomain.replace(/^https?:\/\//, '').replace(/\.amocrm\.(ru|com)$/, '').replace(/\/$/, '');
  const tld = subdomain.includes('.com') ? 'com' : 'ru';
  const qs = new URLSearchParams(params).toString();
  const url = `https://${cleanSubdomain}.amocrm.${tld}/api/v4${path}${qs ? '?' + qs : ''}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 204) return { _embedded: {}, _page_count: 0 };
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AmoCRM ${path}: HTTP ${res.status} — ${t.slice(0, 200)}`);
  }
  return await res.json();
}

async function listAll({ subdomain, token }, path, withParam = '', maxPages = 8) {
  const all = [];
  let page = 1;
  while (page <= maxPages) {
    const params = { page, limit: 250 };
    if (withParam) params.with = withParam;
    const data = await callAmo({ subdomain, token }, path, params);
    const list = data?._embedded?.leads || data?._embedded?.contacts || data?._embedded?.companies || [];
    if (list.length === 0) break;
    all.push(...list);
    if (list.length < 250) break;
    page++;
  }
  return all;
}

async function fetchLeads(creds) {
  return await listAll(creds, '/leads', 'contacts');
}

async function fetchContacts(creds) {
  return await listAll(creds, '/contacts', 'leads');
}

async function fetchCompanies(creds) {
  return await listAll(creds, '/companies');
}

async function testConnection({ subdomain, token }) {
  const data = await callAmo({ subdomain, token }, '/account');
  return { ok: true, account: { id: data.id, name: data.name, subdomain: data.subdomain } };
}

module.exports = { callAmo, fetchLeads, fetchContacts, fetchCompanies, testConnection };
