/**
 * AI usage logger — non-blocking write to ai_usage_log.
 *
 * Foydalanish:
 *   const logger = require('./logger');
 *   logger.logAiUsage({
 *     userId, organizationId, intent, provider, model,
 *     usage: { input_tokens, output_tokens, ... },
 *     duration_ms, status, requestId
 *   });
 *
 * Hisoblash + insert background'da ishlaydi, request response'ni bloklamaydi.
 */
const pool = require('../../db/pool');
const { computeCost } = require('./costCalc');
const crypto = require('crypto');

function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Single AI call uchun usage yozish.
 * Argument: bitta object — barcha maydonlar ixtiyoriy.
 */
function logAiUsage(record = {}) {
  const usage = record.usage || {};
  const cost = computeCost({
    model: record.model || usage.model,
    provider: record.provider,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    thinking_tokens: usage.thinking_tokens,
    cached_read_tokens: usage.cache_read_input_tokens || usage.cached_read_tokens,
    cached_write_tokens: usage.cache_creation_input_tokens || usage.cached_write_tokens,
    web_search_count: usage.web_search_count,
  });

  // Non-blocking — Promise yo'q (await qilinmasa)
  pool.query(
    `INSERT INTO ai_usage_log (
       user_id, organization_id, request_id, page, intent,
       provider, model,
       input_tokens, output_tokens, thinking_tokens,
       cached_read_tokens, cached_write_tokens,
       web_search_count, tool_calls_count, iterations,
       duration_ms, cost_usd, status, error_message
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7,
       $8, $9, $10,
       $11, $12,
       $13, $14, $15,
       $16, $17, $18, $19
     )`,
    [
      record.userId || null,
      record.organizationId || null,
      record.requestId || generateRequestId(),
      record.page || null,
      record.intent || null,
      record.provider || null,
      record.model || null,
      usage.input_tokens || 0,
      usage.output_tokens || 0,
      usage.thinking_tokens || 0,
      usage.cache_read_input_tokens || usage.cached_read_tokens || 0,
      usage.cache_creation_input_tokens || usage.cached_write_tokens || 0,
      usage.web_search_count || 0,
      record.toolCallsCount || 0,
      record.iterations || 0,
      record.duration_ms || null,
      cost,
      record.status || 'ok',
      record.error_message || null,
    ]
  ).catch(e => {
    console.warn('[telemetry] logAiUsage xato:', e.message);
  });
  return { cost, requestId: record.requestId };
}

/**
 * Bugungi total cost foydalanuvchi uchun.
 */
async function getTodayCost(userId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total_cost,
            COUNT(*) AS calls
     FROM ai_usage_log
     WHERE user_id = $1
       AND created_at >= date_trunc('day', NOW())
       AND status = 'ok'`,
    [userId]
  );
  const row = r.rows[0] || {};
  return {
    total_cost: parseFloat(row.total_cost || 0),
    calls: parseInt(row.calls || 0, 10),
  };
}

/**
 * Per-day breakdown for last N days.
 */
async function getDailyUsage({ userId, organizationId, days = 7 } = {}) {
  const where = [];
  const params = [];
  if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
  if (organizationId) { params.push(organizationId); where.push(`organization_id = $${params.length}`); }
  params.push(days);
  const sql = `
    SELECT
      date_trunc('day', created_at) AS day,
      COUNT(*) AS calls,
      SUM(cost_usd) AS cost,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cached_read_tokens) AS cached_read,
      SUM(web_search_count) AS web_searches
    FROM ai_usage_log
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ${where.length ? 'AND' : 'WHERE'} created_at >= NOW() - ($${params.length} || ' days')::interval
    GROUP BY day
    ORDER BY day DESC
  `;
  const r = await pool.query(sql, params);
  return r.rows.map(row => ({
    day: row.day,
    calls: parseInt(row.calls, 10),
    cost: parseFloat(row.cost || 0),
    input_tokens: parseInt(row.input_tokens || 0, 10),
    output_tokens: parseInt(row.output_tokens || 0, 10),
    cached_read: parseInt(row.cached_read || 0, 10),
    web_searches: parseInt(row.web_searches || 0, 10),
  }));
}

/**
 * Per-intent breakdown.
 */
async function getIntentBreakdown({ days = 30, organizationId, userId } = {}) {
  const where = [];
  const params = [];
  if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
  if (organizationId) { params.push(organizationId); where.push(`organization_id = $${params.length}`); }
  params.push(days);
  const sql = `
    SELECT
      intent,
      COUNT(*) AS calls,
      SUM(cost_usd) AS cost,
      AVG(duration_ms) AS avg_duration,
      AVG(iterations) AS avg_iterations,
      SUM(tool_calls_count) AS total_tools
    FROM ai_usage_log
    WHERE created_at >= NOW() - ($${params.length} || ' days')::interval
    ${where.length ? 'AND ' + where.join(' AND ') : ''}
    GROUP BY intent
    ORDER BY cost DESC NULLS LAST
  `;
  const r = await pool.query(sql, params);
  return r.rows.map(row => ({
    intent: row.intent,
    calls: parseInt(row.calls, 10),
    cost: parseFloat(row.cost || 0),
    avg_duration_ms: row.avg_duration ? Math.round(row.avg_duration) : null,
    avg_iterations: row.avg_iterations ? Number(row.avg_iterations).toFixed(1) : null,
    total_tools: parseInt(row.total_tools || 0, 10),
  }));
}

/**
 * Top expensive users (admin).
 */
async function getTopUsers({ days = 30, limit = 10 } = {}) {
  const r = await pool.query(
    `SELECT user_id, COUNT(*) AS calls, SUM(cost_usd) AS cost
     FROM ai_usage_log
     WHERE created_at >= NOW() - ($1 || ' days')::interval
       AND user_id IS NOT NULL
     GROUP BY user_id
     ORDER BY cost DESC NULLS LAST
     LIMIT $2`,
    [days, limit]
  );
  return r.rows.map(row => ({
    user_id: row.user_id,
    calls: parseInt(row.calls, 10),
    cost: parseFloat(row.cost || 0),
  }));
}

module.exports = {
  logAiUsage,
  getTodayCost,
  getDailyUsage,
  getIntentBreakdown,
  getTopUsers,
  generateRequestId,
};
