/**
 * Cron scheduler — kanal statistikasini avtomatik yangilash.
 * Phase 4'da kunlik dayjest va anomaliya ham shu yerga qo'shiladi.
 */
const cron = require('node-cron');
const pool = require('../db/pool');
const { getChannelStats } = require('./mtproto');

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

module.exports = { startSyncScheduler, syncAllChannels };
