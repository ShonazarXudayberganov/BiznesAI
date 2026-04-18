/**
 * Analix Bot Worker — kirish nuqtasi
 *
 * Phase 1: /start <token> deep-link, /menu (placeholder), /help, /logout
 * Phase 2+: MTProto channel sync, AI proxy, scheduler, anomaliya
 */
require('dotenv').config();

const { Telegraf } = require('telegraf');
const pool = require('./db/pool');
const registerStartHandler = require('./handlers/start');
const registerMenuHandlers = require('./handlers/menu');
const { findOrgByChatId, touchChat } = require('./services/linkService');
const { startInternalApi } = require('./internalApi');
const { startSyncScheduler, startDigestScheduler } = require('./services/scheduler');
const { startAnomalyScheduler } = require('./services/anomalyDetector');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('[BOT] TELEGRAM_BOT_TOKEN env yo\'q. Bot ishga tushmadi.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ── /start <token> ──
registerStartHandler(bot);

// ── Middleware: har xabarda last_active_at ni yangilash ──
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id) {
    touchChat(ctx.from.id).catch(() => {});
  }
  return next();
});

// ── /help ──
bot.command('help', async (ctx) => {
  const link = await findOrgByChatId(ctx.from.id);
  if (!link) {
    return ctx.reply(
      'Bot bilan ishlash uchun avval saytdan ulanishingiz kerak: https://analix.uz',
      { disable_web_page_preview: true }
    );
  }
  return ctx.reply([
    `<b>${link.org_name}</b> — yordamchi bot`,
    '',
    '/menu — asosiy menyu',
    '/kpi — tezkor holat',
    '/sources — ulangan manbalar',
    '/help — yordam',
    '/logout — bog\'lanishni uzish',
    '',
    'Yoki to\'g\'ridan-to\'g\'ri savol yozing — AI javob beradi.',
  ].join('\n'), { parse_mode: 'HTML' });
});

// ── /logout ──
bot.command('logout', async (ctx) => {
  const link = await findOrgByChatId(ctx.from.id);
  if (!link) {
    return ctx.reply('Siz hozir bog\'lanmagansiz.');
  }
  await pool.query(
    `UPDATE telegram_bot_links SET active=FALSE WHERE chat_id=$1`,
    [ctx.from.id]
  );
  return ctx.reply(`✓ ${link.org_name} bilan bog'lanish uzildi. Saytdan qayta ulanishingiz mumkin.`);
});

// ── Asosiy menyu va AI handlerlar ──
registerMenuHandlers(bot);

// ── Xato handler ──
bot.catch((err, ctx) => {
  console.error('[BOT] handler error:', err.message, 'update:', ctx.update?.update_id);
});

// ── Ishga tushirish ──
async function start() {
  // DB ulanishini tekshirish
  try {
    await pool.query('SELECT 1');
    console.log('[BOT] DB ulanishi OK');
  } catch (e) {
    console.error('[BOT] DB ulanmadi:', e.message);
    process.exit(1);
  }

  // Telegraf 4.x'da bot.launch() faqat bot to'xtaganda return qiladi
  // shuning uchun getMe() ni avval chaqiramiz
  const me = await bot.telegram.getMe();
  console.log(`[BOT] Ishga tushmoqda: @${me.username} (id=${me.id})`);

  // Long polling — webhook'siz, oddiyroq local dev uchun
  bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('[BOT] To\'xtatildi'))
    .catch(err => console.error('[BOT] launch error:', err.message));

  // Internal HTTP API (backend → bot-worker)
  startInternalApi();

  // Kanal stats sync cron
  startSyncScheduler();

  // Kunlik dayjest scheduler (har 5 daqiqada tekshirib, vaqti kelganlarga yuboradi)
  startDigestScheduler(bot);

  // Anomaliya kuzatuvchi (har soatda)
  startAnomalyScheduler(bot);

  console.log('[BOT] Tayyor — xabarlar kutilmoqda');
}

// GramJS background update loop ba'zan TIMEOUT promise reject qiladi —
// stats so'rovlariga ta'sir qilmaydi. Faqat shu xatoni ushlab susaytiramiz.
process.on('unhandledRejection', (reason) => {
  const msg = reason && (reason.message || String(reason));
  if (msg && /TIMEOUT/i.test(msg) && /updates\.js/.test(reason?.stack || '')) {
    return; // GramJS update loop noise — ignore
  }
  console.error('[unhandledRejection]', msg);
});

// Graceful shutdown
process.once('SIGINT', () => { bot.stop('SIGINT'); pool.end(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); pool.end(); });

start().catch(err => {
  console.error('[BOT] Ishga tushishda xato:', err);
  process.exit(1);
});
