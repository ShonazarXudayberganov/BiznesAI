/**
 * Bitrix24 integratsiya — inbound webhook orqali (eng oddiy auth).
 *
 * Foydalanuvchi Bitrix24 portalida webhook yaratadi:
 *   Sozlamalar → Dasturchilar → Boshqa → Inbound webhook
 *   Ruxsatlar: crm
 *   URL: https://your-portal.bitrix24.ru/rest/1/ABC123XYZ/
 *
 * Bu URL endpoint sifatida saqlanadi, hech qanday OAuth kerak emas.
 *
 * Sync mantig'i:
 *   - crm.deal.list (deals, sahifa-sahifa pagination)
 *   - crm.contact.list (mijozlar)
 *   - crm.lead.list (lidlar)
 *   - Har biri JSON sifatida source_data'ga yoziladi
 */

async function callBitrix(webhookUrl, method, params = {}) {
  if (!webhookUrl || !webhookUrl.includes('/rest/')) {
    throw new Error("Bitrix24 webhook URL noto'g'ri formatda");
  }
  const cleanUrl = webhookUrl.endsWith('/') ? webhookUrl : webhookUrl + '/';
  const url = `${cleanUrl}${method}.json`;

  const body = new URLSearchParams();
  flattenParams('', params, body);

  let res, lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Analix-BiznesAI/1.0',
        },
        body,
        signal: AbortSignal.timeout(30000),
      });
      break;
    } catch (e) {
      lastErr = e;
      const code = e?.cause?.code || e?.code || '';
      const isRetryable = ['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH'].includes(code);
      if (!isRetryable || attempt === 3) {
        const reason = code || e?.message;
        throw new Error(`Bitrix24 ulanish xatosi: ${reason}. Webhook URL to'g'riligini tekshiring.`);
      }
      console.warn(`[Bitrix24] ${code} — retry ${attempt}/3`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  if (!res) throw lastErr;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Bitrix24 ${method}: HTTP ${res.status} — ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Bitrix24 ${method}: ${data.error_description || data.error}`);
  }
  return data;
}

function flattenParams(prefix, obj, out) {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') {
    out.append(prefix, String(obj));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') {
      flattenParams(key, v, out);
    } else if (v !== undefined) {
      out.append(key, String(v));
    }
  }
}

async function listAll(webhookUrl, method, params = {}, maxPages = 10) {
  const all = [];
  let start = 0;
  for (let page = 0; page < maxPages; page++) {
    const data = await callBitrix(webhookUrl, method, { ...params, start });
    if (!Array.isArray(data.result) || data.result.length === 0) break;
    all.push(...data.result);
    if (typeof data.next !== 'number') break;
    start = data.next;
  }
  return all;
}

async function fetchDeals(webhookUrl) {
  return await listAll(webhookUrl, 'crm.deal.list', {
    select: ['ID', 'TITLE', 'STAGE_ID', 'OPPORTUNITY', 'CURRENCY_ID', 'COMPANY_ID', 'CONTACT_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'CLOSEDATE', 'CLOSED'],
    order: { DATE_CREATE: 'DESC' },
  });
}

async function fetchContacts(webhookUrl) {
  return await listAll(webhookUrl, 'crm.contact.list', {
    select: ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL', 'COMPANY_ID', 'DATE_CREATE'],
    order: { DATE_CREATE: 'DESC' },
  });
}

async function fetchLeads(webhookUrl) {
  return await listAll(webhookUrl, 'crm.lead.list', {
    select: ['ID', 'TITLE', 'NAME', 'PHONE', 'EMAIL', 'STATUS_ID', 'OPPORTUNITY', 'DATE_CREATE'],
    order: { DATE_CREATE: 'DESC' },
  });
}

async function testConnection(webhookUrl) {
  const r = await callBitrix(webhookUrl, 'profile');
  return { ok: true, user: r.result || null };
}

module.exports = { callBitrix, fetchDeals, fetchContacts, fetchLeads, testConnection };
