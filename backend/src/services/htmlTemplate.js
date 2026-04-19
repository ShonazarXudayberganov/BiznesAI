/**
 * HTML hisobot shabloni — sayt'dagi PDF bilan bir xil dizayn.
 * Sayt frontend'da iframe + window.print() qiladi; biz esa backend'da
 * Puppeteer orqali shu HTML'ni PDF qilamiz.
 *
 * Bosh ranglar: teal #0D9488, oltin #B8860B, tekst #1A202C
 */

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Markdown → HTML (site'dagi mdToH aynan mos)
function mdToHtml(text) {
  return String(text || '').split('\n').map(line => {
    const t = line.trim();
    if (!t) return '<div style="height:8px"></div>';
    if (t === '---' || t === '***') return '<hr style="border:none;border-top:2px solid #E0E0E0;margin:16px 0">';
    if (t.startsWith('### ')) return `<h3 style="font-size:13px;font-weight:700;color:#4A5568;margin:14px 0 6px;border-left:3px solid #805AD5;padding-left:10px">${esc(t.slice(4))}</h3>`;
    if (t.startsWith('## ')) return `<h2 style="font-size:15px;font-weight:800;color:#0D9488;margin:18px 0 8px;border-left:4px solid #0D9488;padding-left:10px">${esc(t.slice(3))}</h2>`;
    if (t.startsWith('# ')) return `<h1 style="font-size:18px;font-weight:800;color:#1A202C;margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid;border-image:linear-gradient(90deg,#0D9488,#B8860B,transparent) 1">${esc(t.slice(2))}</h1>`;
    if (t.startsWith('> ')) return `<div style="border-left:3px solid #0D9488;padding:10px 14px;margin:8px 0;background:#F0FDFA;border-radius:0 8px 8px 0;color:#2D3748">${inline(t.slice(2))}</div>`;
    if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
      return `<div style="padding-left:16px;margin:3px 0"><span style="color:#0D9488;font-weight:bold;margin-right:6px">●</span>${inline(t.slice(2))}</div>`;
    }
    const nm = t.match(/^(\d+)\.\s(.+)/);
    if (nm) return `<div style="padding-left:22px;margin:3px 0;position:relative"><span style="position:absolute;left:0;color:#B8860B;font-weight:800">${nm[1]}.</span>${inline(nm[2])}</div>`;
    if (t.startsWith('|') && t.endsWith('|')) {
      if (t.replace(/[|\-\s:]/g, '').length === 0) return '';
      const cells = t.split('|').filter(c => c.trim()).map(c => c.trim());
      return `<tr>${cells.map(c => `<td style="padding:8px 14px;border-bottom:1px solid #EDF2F7;font-size:12px">${inline(c)}</td>`).join('')}</tr>`;
    }
    return `<div style="margin:3px 0;line-height:1.75">${inline(t)}</div>`;
  }).join('\n');
}

// Inline markup (**bold**, *italic*, `code`)
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b style="color:#1A202C">$1</b>')
    .replace(/(^|[^\*])\*([^\*\n]+?)\*/g, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code style="background:#EDF2F7;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:11px">$1</code>');
}

/**
 * To'liq HTML hisobot hujjati (A4 print-ready).
 *
 * @param {object} p
 * @param {string} p.title — hisobot sarlavhasi
 * @param {string} p.orgName
 * @param {object} p.data — gatherReportData natijasi: { sources, channels, channelTrends }
 * @param {string} [p.aiText] — AI tahlil matni (markdown)
 * @param {string} [p.provider] — AI provayder nomi (footer uchun)
 */
function buildReportHtml({ title, orgName, data, aiText, provider }) {
  const today = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' });

  // Manbalar jadvali
  const sourcesHtml = data.sources && data.sources.length > 0 ? `
    <h2 style="font-size:15px;font-weight:800;color:#0D9488;margin:22px 0 10px;border-left:4px solid #0D9488;padding-left:10px">Ma'lumot manbalari</h2>
    <table>
      <tr>
        <td>Nom</td><td>Tur</td><td>Qatorlar</td><td>Oxirgi yangilanish</td>
      </tr>
      ${data.sources.map(s => `
        <tr>
          <td>${esc(s.name)}</td>
          <td>${esc(s.type)}</td>
          <td>${Number(s.row_count || 0).toLocaleString('uz-UZ')}</td>
          <td>${s.updated_at ? new Date(s.updated_at).toLocaleDateString('uz-UZ') : '—'}</td>
        </tr>
      `).join('')}
    </table>
  ` : '';

  // Kanallar
  const channelsHtml = data.channels && data.channels.length > 0 ? `
    <h2 style="font-size:15px;font-weight:800;color:#0D9488;margin:22px 0 10px;border-left:4px solid #0D9488;padding-left:10px">Telegram kanallar</h2>
    <table>
      <tr><td>Sarlavha</td><td>Username</td><td>A'zolar</td><td>Oxirgi sync</td></tr>
      ${data.channels.map(c => `
        <tr>
          <td>${esc(c.title)}</td>
          <td>${c.username ? '@' + esc(c.username) : '—'}</td>
          <td>${Number(c.member_count || 0).toLocaleString('uz-UZ')}</td>
          <td>${c.last_synced_at ? new Date(c.last_synced_at).toLocaleDateString('uz-UZ') : '—'}</td>
        </tr>
      `).join('')}
    </table>
  ` : '';

  // Umumiy statistika karta
  const summaryCards = `
    <div style="display:flex;gap:12px;margin:16px 0">
      <div style="flex:1;padding:14px 16px;background:#F0FDFA;border-left:4px solid #0D9488;border-radius:4px">
        <div style="font-size:10px;color:#0D9488;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Manbalar</div>
        <div style="font-size:22px;font-weight:800;color:#134E4A;margin-top:4px">${data.sources?.length || 0}</div>
      </div>
      <div style="flex:1;padding:14px 16px;background:#FEF3C7;border-left:4px solid #B8860B;border-radius:4px">
        <div style="font-size:10px;color:#92400E;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Telegram kanallar</div>
        <div style="font-size:22px;font-weight:800;color:#78350F;margin-top:4px">${data.channels?.length || 0}</div>
      </div>
      <div style="flex:1;padding:14px 16px;background:#FCE7F3;border-left:4px solid #DB2777;border-radius:4px">
        <div style="font-size:10px;color:#9D174D;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Umumiy qatorlar</div>
        <div style="font-size:22px;font-weight:800;color:#831843;margin-top:4px">${(data.sources || []).reduce((a, s) => a + (s.row_count || 0), 0).toLocaleString('uz-UZ')}</div>
      </div>
    </div>
  `;

  // AI tahlil
  const aiHtml = aiText ? `
    <h2 style="font-size:15px;font-weight:800;color:#0D9488;margin:26px 0 10px;border-left:4px solid #0D9488;padding-left:10px">AI Tahlil</h2>
    <div style="padding:4px 0">${mdToHtml(aiText)}</div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8">
<title>${esc(title)} — ${esc(orgName)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.75;
    color: #2D3748;
    padding: 48px 56px;
    max-width: 820px;
    margin: 0 auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 12px;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    overflow: hidden;
  }
  table tr:first-child td {
    font-weight: 700;
    color: #0D9488;
    border-bottom: 2px solid #0D9488;
    background: #F0FDFA;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 1px;
  }
  table tr:nth-child(even) { background: #F7FAFC; }
  table td { padding: 8px 14px; border-bottom: 1px solid #EDF2F7; }
  @media print {
    body { padding: 24px 32px; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid;border-image:linear-gradient(90deg,#0D9488,#B8860B,transparent) 1">
  <div>
    <div style="font-size:26px;font-weight:800;color:#1A202C;letter-spacing:-0.5px">ANA<span style="color:#B8860B">LIX</span></div>
    <div style="font-size:9px;color:#A0AEC0;text-transform:uppercase;letter-spacing:3px;margin-top:3px">AI Biznes Tahlil</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:17px;font-weight:700;color:#2D3748">${esc(title)}</div>
    <div style="font-size:11px;color:#718096;margin-top:2px">${esc(orgName)} · ${esc(today)}</div>
  </div>
</div>

<!-- STATS CARDS -->
${summaryCards}

<!-- SOURCES -->
${sourcesHtml}

<!-- CHANNELS -->
${channelsHtml}

<!-- AI ANALYSIS -->
${aiHtml}

<!-- FOOTER -->
<div style="margin-top:40px;padding-top:16px;border-top:2px solid #EDF2F7;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#A0AEC0">
  <div>Analix · analix.uz</div>
  <div>${provider ? esc(provider) + ' · ' : ''}${esc(today)}</div>
</div>

</body>
</html>`;
}

module.exports = { buildReportHtml, mdToHtml, esc };
