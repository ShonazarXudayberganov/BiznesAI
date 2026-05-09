/**
 * Avtomatik API documentation — Express route'lardan endpoint ro'yxatini chiqaradi.
 *
 * Yondashuv: app._router.stack ni o'qib, har route uchun:
 *   - method, path
 *   - middleware ro'yxati (requireAuth, requireAdmin, va h.k.)
 *   - source faylda yozilgan JSDoc/comment (agar mavjud bo'lsa)
 *
 * Tashqi swagger-jsdoc kerak emas — minimal va to'g'ri.
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');

// Har route fayl uchun: endpoint'lar va ularning kommentlari
function parseRouteFile(filename) {
  const fullPath = path.join(ROUTES_DIR, filename);
  if (!fs.existsSync(fullPath)) return [];
  const src = fs.readFileSync(fullPath, 'utf8');
  const lines = src.split('\n');
  const endpoints = [];

  // Regex: router.METHOD('PATH', middleware..., handler)
  const routeRegex = /^router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(routeRegex);
    if (!m) continue;

    const method = m[1].toUpperCase();
    const apiPath = m[2];
    const argsAfter = m[3] || '';

    // Middleware'larni topish: requireAuth, requireAdmin, checkPermission, va h.k.
    const middlewareNames = [];
    for (const mw of ['requireAuth', 'requireAdmin', 'requireCeo', 'checkPermission', 'checkAiLimit', 'checkAiRateLimit', 'checkCostCap']) {
      if (argsAfter.includes(mw)) middlewareNames.push(mw);
    }

    // Yuqorida 1-3 qator kommentariy bor bo'lsa olamiz
    const docLines = [];
    for (let k = i - 1; k >= Math.max(0, i - 8); k--) {
      const above = lines[k].trim();
      if (above.startsWith('//')) {
        docLines.unshift(above.replace(/^\/\/\s?/, ''));
      } else if (above.startsWith('*') || above.startsWith('/**') || above.startsWith('*/')) {
        // JSDoc — keyinroq qo'shish mumkin
        continue;
      } else if (above === '' || above.startsWith('// ──')) {
        if (docLines.length > 0) break;
        continue;
      } else {
        break;
      }
    }
    const docstring = docLines.join('\n').trim();

    endpoints.push({
      method,
      path: apiPath,
      middleware: middlewareNames,
      auth_required: middlewareNames.includes('requireAuth'),
      admin_only: middlewareNames.includes('requireAdmin'),
      doc: docstring || null,
    });
  }

  return endpoints;
}

// Route fayllar va ularning prefix'lari (index.js'dan oladi)
const ROUTE_PREFIXES = {
  'auth.js': '/api/auth',
  'sources.js': '/api/sources',
  'alerts.js': '/api/alerts',
  'reports.js': '/api/reports',
  'chat.js': '/api/chat',
  'ai.js': '/api/ai',
  'brain.js': '/api/ai/brain',
  'rag.js': '/api/ai/rag',
  'admin-ai.js': '/api/admin/ai',
  'errors.js': '/api/errors',
  'payments.js': '/api/payments',
  'upload.js': '/api/upload',
  'admin.js': '/api/admin',
  'scrape.js': '/api/scrape',
  'departments.js': '/api/departments',
  'employees.js': '/api/employees',
  'super-admin.js': '/api/super-admin',
  'telegram.js': '/api/telegram',
  'instagram.js': '/api/instagram',
  'internal.js': '/api/internal',
  'sheets.js': '/api/sheets',
};

function getAllEndpoints() {
  const all = [];
  for (const [filename, prefix] of Object.entries(ROUTE_PREFIXES)) {
    const endpoints = parseRouteFile(filename);
    for (const ep of endpoints) {
      all.push({
        ...ep,
        full_path: prefix + (ep.path === '/' ? '' : ep.path),
        file: filename,
      });
    }
  }
  return all.sort((a, b) => {
    if (a.full_path !== b.full_path) return a.full_path.localeCompare(b.full_path);
    return a.method.localeCompare(b.method);
  });
}

// Group by file (logical area)
function groupedByFile() {
  const grouped = {};
  for (const ep of getAllEndpoints()) {
    const area = ep.file.replace('.js', '');
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(ep);
  }
  return grouped;
}

// HTML viewer (minimal)
function renderHtml() {
  const grouped = groupedByFile();
  const totalCount = Object.values(grouped).reduce((a, arr) => a + arr.length, 0);
  const authCount = Object.values(grouped).flat().filter(e => e.auth_required).length;

  const css = `
    body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0a; color: #e8e8ec; margin: 0; padding: 24px 32px; line-height: 1.5; }
    h1 { font-size: 28px; margin: 0 0 8px; letter-spacing: -0.5px; }
    .sub { color: #84848f; font-size: 13px; margin-bottom: 32px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color: #c9a063; border-bottom: 1px solid #2a2a35; padding-bottom: 6px; margin-top: 32px; margin-bottom: 12px; }
    .ep { display: grid; grid-template-columns: 70px 1fr auto; gap: 14px; padding: 8px 12px; border-radius: 8px; align-items: center; }
    .ep:hover { background: #16161d; }
    .method { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 5px; text-align: center; letter-spacing: 0.5px; }
    .GET { background: rgba(96,165,250,0.15); color: #60a5fa; }
    .POST { background: rgba(16,185,129,0.15); color: #10b981; }
    .PUT { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .DELETE { background: rgba(244,63,94,0.15); color: #f43f5e; }
    .PATCH { background: rgba(167,139,250,0.15); color: #a78bfa; }
    .path { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #f1f1f4; }
    .doc { font-size: 11.5px; color: #84848f; margin-top: 3px; font-family: system-ui; }
    .badges { display: flex; gap: 5px; }
    .badge { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; padding: 2px 7px; border-radius: 99px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
    .auth { background: rgba(201,160,99,0.12); color: #c9a063; }
    .admin { background: rgba(244,63,94,0.12); color: #f43f5e; }
    .ratelimit { background: rgba(96,165,250,0.10); color: #60a5fa; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #16161d; border: 1px solid #2a2a35; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }
    .stat-label { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #84848f; }
    .stat-value { font-size: 22px; font-weight: 800; color: #f1f1f4; margin-top: 3px; }
    .file { font-size: 10px; color: #5a5a66; font-family: 'JetBrains Mono', monospace; }
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BiznesAI API</title><style>${css}</style></head><body>`;
  html += `<h1>📚 BiznesAI REST API</h1>`;
  html += `<div class="sub">Avtomatik generatsiya · har route fayl skanerlanadi</div>`;

  html += `<div class="stats">`;
  html += `<div><div class="stat-label">Jami endpoint</div><div class="stat-value">${totalCount}</div></div>`;
  html += `<div><div class="stat-label">Auth talab qiladi</div><div class="stat-value">${authCount}</div></div>`;
  html += `<div><div class="stat-label">Public endpoint</div><div class="stat-value">${totalCount - authCount}</div></div>`;
  html += `<div><div class="stat-label">Modul</div><div class="stat-value">${Object.keys(grouped).length}</div></div>`;
  html += `</div>`;

  for (const area of Object.keys(grouped).sort()) {
    html += `<h2>${area} <span class="file">(${grouped[area].length})</span></h2>`;
    for (const ep of grouped[area]) {
      html += `<div class="ep">`;
      html += `<div class="method ${ep.method}">${ep.method}</div>`;
      html += `<div><div class="path">${ep.full_path}</div>`;
      if (ep.doc) html += `<div class="doc">${ep.doc.replace(/</g, '&lt;')}</div>`;
      html += `</div>`;
      html += `<div class="badges">`;
      if (ep.admin_only) html += `<span class="badge admin">admin</span>`;
      else if (ep.auth_required) html += `<span class="badge auth">auth</span>`;
      if (ep.middleware.includes('checkAiRateLimit')) html += `<span class="badge ratelimit">rate</span>`;
      html += `</div></div>`;
    }
  }

  html += `</body></html>`;
  return html;
}

module.exports = { getAllEndpoints, groupedByFile, renderHtml, ROUTE_PREFIXES };
