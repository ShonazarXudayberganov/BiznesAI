/**
 * Error logger — DB'ga xato'larni non-blocking yozadi.
 *
 * Sentry'ga muqobil — tashqi service kerak emas, hammasi `error_log` jadvalida.
 * Kelajakda Sentry DSN qo'shilsa — bu yerdan dispatch qilinadi.
 */
const crypto = require('crypto');
const pool = require('../db/pool');

/**
 * Fingerprint — bir xil xato'larni guruhlash uchun.
 * Stack'ning birinchi 3 qatori + message asosida hash.
 */
function makeFingerprint(message, stack) {
  const stackHead = String(stack || '').split('\n').slice(0, 3).join('|').slice(0, 500);
  return crypto.createHash('md5').update(message + stackHead).digest('hex').slice(0, 16);
}

/**
 * Async (non-blocking) — xato'ni log qiladi va e'tiborga olishni davom ettiradi.
 */
function logError(record = {}) {
  const message = String(record.message || record.error || 'Unknown error').slice(0, 5000);
  const stack = record.stack ? String(record.stack).slice(0, 10000) : null;
  const fingerprint = record.fingerprint || makeFingerprint(message, stack);

  pool.query(
    `INSERT INTO error_log (
       source, level, message, stack,
       user_id, organization_id, request_id,
       url, user_agent, context, fingerprint
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7,
       $8, $9, $10, $11
     )`,
    [
      record.source || 'backend',
      record.level || 'error',
      message,
      stack,
      record.userId || null,
      record.organizationId || null,
      record.requestId || null,
      record.url || null,
      record.userAgent || null,
      record.context ? JSON.stringify(record.context) : null,
      fingerprint,
    ]
  ).catch(e => {
    // Log fail — silent (xato'ning ichidan xato qilib bo'lmaydi)
    console.warn('[errorLogger] DB insert fail:', e.message);
  });
}

/**
 * Express middleware — uncaught route xato'lar uchun.
 */
function expressErrorHandler(err, req, res, next) {
  logError({
    source: 'backend',
    level: 'error',
    message: err.message,
    stack: err.stack,
    userId: req.userId || null,
    organizationId: req.user?.organization_id || null,
    requestId: req.headers['x-request-id'] || null,
    url: `${req.method} ${req.originalUrl}`,
    userAgent: req.headers['user-agent'] || null,
    context: {
      query: req.query,
      params: req.params,
      // body'ni kiritmaymiz — sensitive bo'lishi mumkin
    },
  });
  // Original error handling davom etadi
  next(err);
}

/**
 * Process-level uncaught exception/rejection.
 */
function installGlobalHandlers() {
  process.on('uncaughtException', (err) => {
    logError({
      source: 'backend',
      level: 'fatal',
      message: err.message,
      stack: err.stack,
      context: { type: 'uncaughtException' },
    });
    console.error('[uncaughtException]', err);
  });

  process.on('unhandledRejection', (reason) => {
    if (!reason) return;
    const message = reason.message || String(reason);
    // GramJS noise filter (ai_agent.js'dan kelgan)
    if (/TIMEOUT/i.test(message) && /updates\.js/i.test(reason.stack || '')) return;
    logError({
      source: 'backend',
      level: 'error',
      message,
      stack: reason.stack,
      context: { type: 'unhandledRejection' },
    });
  });
}

/**
 * So'nggi xatolar (admin uchun).
 */
async function getRecentErrors({ limit = 50, source, level, days = 7 } = {}) {
  const where = ['created_at >= NOW() - ($1 || \' days\')::interval'];
  const params = [days];
  if (source) { params.push(source); where.push(`source = $${params.length}`); }
  if (level) { params.push(level); where.push(`level = $${params.length}`); }
  params.push(limit);
  const r = await pool.query(
    `SELECT id, source, level, message, fingerprint, user_id, url, created_at
     FROM error_log
     WHERE ${where.join(' AND ')}
     ORDER BY id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * Fingerprint bo'yicha guruhlangan xatolar (eng tez-tez uchraydiganlari).
 */
async function getErrorGroups({ days = 7, limit = 20 } = {}) {
  const r = await pool.query(
    `SELECT
       fingerprint,
       MAX(message) AS message,
       MAX(source) AS source,
       MAX(level) AS level,
       COUNT(*) AS count,
       MAX(created_at) AS last_seen,
       MIN(created_at) AS first_seen,
       COUNT(DISTINCT user_id) AS affected_users
     FROM error_log
     WHERE created_at >= NOW() - ($1 || ' days')::interval
       AND fingerprint IS NOT NULL
     GROUP BY fingerprint
     ORDER BY count DESC, last_seen DESC
     LIMIT $2`,
    [days, limit]
  );
  return r.rows;
}

module.exports = {
  logError,
  expressErrorHandler,
  installGlobalHandlers,
  getRecentErrors,
  getErrorGroups,
  makeFingerprint,
};
