/**
 * Cron scheduler:
 *  - Kanal statistikasi sync (kunlik 04:00)
 *  - Kunlik dayjest yuborish (har 5 daqiqada tekshirib, vaqti kelgan org'larga)
 *  - Phase 5: anomaliya kuzatuvi
 */
const cron = require('node-cron');
const pool = require('../db/pool');
const { getChannelStats } = require('./mtproto');
const BackendAPI = require('./backendApi');
const F = require('../lib/formatter');

// Har kunlik soat 04:00 (Asia/Tashkent) — barcha faol kanallar uchun
const SYNC_CRON = process.env.CHANNEL_SYNC_CRON || '0 4 * * *';

async function syncAllChannels() {
  const r = await pool.query(
    `SELECT c.id, c.title, c.username
     FROM telegram_channels c
     JOIN telegram_mtproto_sessions s ON s.id=c.mtproto_session_id
     WHERE c.active=TRUE AND s.status='active'
     ORDER BY c.last_synced_at NULLS FIRST`
  );
  if (r.rows.length === 0) {
    console.log('[SYNC] Kanal yo\'q, o\'tkazib yuborildi');
    return;
  }
  console.log(`[SYNC] ${r.rows.length} ta kanal yangilanmoqda`);
  let ok = 0, fail = 0;
  for (const ch of r.rows) {
    try {
      await getChannelStats(ch.id);
      ok++;
      // Telegram'ni shoshirib qo'ymaslik uchun pauza
      await new Promise(res => setTimeout(res, 1500));
    } catch (e) {
      fail++;
      console.warn(`[SYNC] ✗ ${ch.title || ch.username || ch.id}: ${e.message}`);
      // FloodWait bo'lsa ko'proq kutish
      if (e.message && e.message.includes('FLOOD_WAIT')) {
        const m = e.message.match(/FLOOD_WAIT_(\d+)/);
        const wait = m ? parseInt(m[1], 10) * 1000 : 30000;
        console.log(`[SYNC] FloodWait ${wait}ms kutilmoqda`);
        await new Promise(res => setTimeout(res, wait));
      }
    }
  }
  console.log(`[SYNC] Yakun: ✓${ok} ✗${fail}`);
}

function startSyncScheduler() {
  if (!cron.validate(SYNC_CRON)) {
    console.error('[SYNC] CRON yaroqsiz:', SYNC_CRON);
    return;
  }
  cron.schedule(SYNC_CRON, () => {
    syncAllChannels().catch(e => console.error('[SYNC] xato:', e.message));
  }, { timezone: 'Asia/Tashkent' });
  console.log(`[SYNC] Cron faol: "${SYNC_CRON}" (Asia/Tashkent)`);
}

// ─────────────────────────────────────────────
// Dayjest scheduler — har 5 daqiqada tekshirib, vaqti kelgan org'larga yuboradi
// ─────────────────────────────────────────────
let _botInstance = null;
function setBotForDigest(bot) { _botInstance = bot; }

function inQuietHours(timeStr, qStart, qEnd) {
  if (!qStart || !qEnd) return false;
  const t = timeStr; // "HH:MM"
  if (qStart < qEnd) return t >= qStart && t < qEnd;
  // overnight (e.g. 23:00 - 08:00)
  return t >= qStart || t < qEnd;
}

async function buildDigestText(orgId, orgName) {
  const sum = await BackendAPI.orgSummary(orgId);
  const today = new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const out = [];
  out.push(F.header(`🌅 Tongki dayjest — ${orgName || 'Tashkilot'}`, today));

  if (sum.sources.length === 0 && sum.channels.length === 0) {
    out.push('');
    out.push('<i>Hali manbalar ulanmagan.</i>');
    out.push('');
    out.push('Data Hub orqali Excel, CRM, Instagram yoki Telegram kanal qo\'shing — ertangi dayjest to\'liq bo\'ladi.');
    out.push(F.footer());
    return out.join('\n');
  }

  // Manbalar umumiy holati
  if (sum.sources.length > 0) {
    const totalRows = sum.sources.reduce((a, s) => a + (s.row_count || 0), 0);
    out.push(F.section('📁', 'Ma\'lumot manbalari'));
    out.push(`  <b>${sum.sources.length}</b> manba · <b>${F.fmtNum(totalRows)}</b> qator`);
  }

  // Kanallar
  if (sum.channels.length > 0) {
    out.push(F.section('📺', 'Telegram kanallar'));
    for (const c of sum.channels) {
      const uname = c.username ? ` @${c.username}` : '';
      out.push(`  ▫️ <b>${F.escHtml(c.title)}</b>${F.escHtml(uname)} — ${F.fmtNum(c.member_count || 0)} a'zo`);
    }
  }

  // Ogohlantirishlar
  if (sum.unreadAlerts > 0) {
    out.push(F.section('🔔', 'Ogohlantirishlar'));
    out.push(`  🟡 <b>${sum.unreadAlerts}</b> ta o'qilmagan xabar`);
  }

  out.push('');
  out.push(`<i>💡 Chuqur tahlil uchun botda <b>/menu</b> → Tahlil tugmasi</i>`);
  out.push(F.footer());
  return out.join('\n');
}

async function tickDigest() {
  if (!_botInstance) return;
  let targets;
  try {
    const r = await BackendAPI.digestTargets();
    targets = r.targets || [];
  } catch (e) {
    console.warn('[DIGEST] targets fetch xato:', e.message);
    return;
  }
  if (targets.length === 0) return;

  const nowTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tashkent', hour12: false }).slice(0, 5);

  for (const t of targets) {
    if (inQuietHours(nowTime, t.quiet_hours_start, t.quiet_hours_end)) {
      console.log(`[DIGEST] org=${t.organization_id} jim soatda — o'tkazib yuborildi`);
      continue;
    }
    try {
      const text = await buildDigestText(t.organization_id, t.org_name);
      await _botInstance.telegram.sendMessage(String(t.chat_id), text, { parse_mode: 'HTML' });
      console.log(`[DIGEST] ✓ ${t.org_name} → chat=${t.chat_id}`);
    } catch (e) {
      console.warn(`[DIGEST] ✗ org=${t.organization_id}: ${e.message}`);
    }
  }
}

function startDigestScheduler(bot) {
  setBotForDigest(bot);
  // Har 5 daqiqada tekshirish (digest_time minutes 5 ning karralisi bo'lishi tavsiya etiladi)
  cron.schedule('*/5 * * * *', () => {
    tickDigest().catch(e => console.error('[DIGEST] tick xato:', e.message));
  }, { timezone: 'Asia/Tashkent' });
  console.log('[DIGEST] Scheduler faol: har 5 daqiqada tekshirish');
}

module.exports = { startSyncScheduler, syncAllChannels, startDigestScheduler, tickDigest };
