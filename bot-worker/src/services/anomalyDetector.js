/**
 * Anomaliya aniqlovchi.
 *
 * Hozircha — Telegram kanal timeseries (a'zolar va ko'rishlar dinamikasi).
 * Keyinchalik Excel/CRM raqamlarini ham qo'shish mumkin.
 *
 * Mantiq:
 *   1. Har faol kanal uchun so'nggi 30 kunlik tarix olinadi
 *   2. Bugungi qiymat baseline (oxirgi 7-30 kun mean) bilan solishtiriladi
 *   3. Z-score (>2 → warning, >3 → critical) sensitivity'ga qarab
 *   4. Aniqlangan anomaliya `telegram_anomalies` jadvaliga yoziladi
 *   5. Botga yuboriladi (notified_at to'ldiriladi)
 *   6. 24 soat ichida shu turdagi anomaliya allaqachon yozilgan bo'lsa — qayta yuborilmaydi
 */
const cron = require('node-cron');
const pool = require('../db/pool');

// Sensitivity → threshold (z-score chegaralari)
const SENSITIVITY = {
  low:    { warning: 999, critical: 3.0 },   // faqat critical
  medium: { warning: 2.0, critical: 3.0 },   // default
  high:   { warning: 1.5, critical: 2.5 },
};

const METRIC_LABELS = {
  members:     "kanal a'zolari",
  views_total: "ko'rishlar",
  shares_total: "share'lar",
};

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1); }
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}

function severity(zAbs, threshold) {
  if (zAbs >= threshold.critical) return 'critical';
  if (zAbs >= threshold.warning) return 'warning';
  return null;
}

async function detectChannelAnomalies(orgId, sensitivity) {
  const threshold = SENSITIVITY[sensitivity] || SENSITIVITY.medium;
  const channels = await pool.query(
    `SELECT id, title, username FROM telegram_channels WHERE organization_id=$1 AND active=TRUE`,
    [orgId]
  );

  const found = [];
  for (const ch of channels.rows) {
    const series = await pool.query(
      `SELECT date, members, views_total, shares_total
       FROM telegram_channel_stats_daily
       WHERE channel_id=$1 AND date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY date`,
      [ch.id]
    );
    if (series.rows.length < 5) continue;  // baseline uchun yetarli emas

    const today = series.rows[series.rows.length - 1];
    const baseline = series.rows.slice(0, -1);   // bugundan oldingi

    for (const metric of ['members', 'views_total', 'shares_total']) {
      const values = baseline.map(r => Number(r[metric] || 0)).filter(v => v > 0);
      if (values.length < 5) continue;
      const todayVal = Number(today[metric] || 0);
      const m = mean(values);
      const s = std(values);
      if (s === 0 || m === 0) continue;
      const z = (todayVal - m) / s;
      const sev = severity(Math.abs(z), threshold);
      if (!sev) continue;

      const direction = z > 0 ? 'oshish' : 'pasayish';
      const pct = Math.round(((todayVal - m) / m) * 100);

      found.push({
        type: `channel.${metric}`,
        severity: sev,
        metric,
        value: todayVal,
        baseline: Math.round(m),
        details: {
          channelId: ch.id,
          channelTitle: ch.title,
          channelUsername: ch.username,
          z: Number(z.toFixed(2)),
          pctChange: pct,
          direction,
          baselineDays: values.length,
        },
        sourceId: null,
      });
    }
  }
  return found;
}

async function isDuplicate(orgId, type, withinHours = 24) {
  const r = await pool.query(
    `SELECT 1 FROM telegram_anomalies
     WHERE organization_id=$1 AND type=$2
       AND detected_at > NOW() - ($3::int || ' hours')::interval
     LIMIT 1`,
    [orgId, type, withinHours]
  );
  return r.rows.length > 0;
}

function severityIcon(sev) { return sev === 'critical' ? '🔴' : sev === 'warning' ? '🟡' : '🟢'; }

function formatAnomaly(a) {
  const d = a.details || {};
  const label = METRIC_LABELS[a.metric] || a.metric;
  const arrow = d.direction === 'oshish' ? '↑' : '↓';
  return [
    `${severityIcon(a.severity)} <b>Anomaliya — ${a.severity.toUpperCase()}</b>`,
    '',
    `Kanal: <b>${d.channelTitle || '?'}</b>${d.channelUsername ? ' (@' + d.channelUsername + ')' : ''}`,
    `Ko'rsatkich: ${label}`,
    `Bugun: <b>${(a.value || 0).toLocaleString()}</b> ${arrow} (${d.pctChange > 0 ? '+' : ''}${d.pctChange}%)`,
    `O'rtacha (${d.baselineDays} kun): ${(a.baseline || 0).toLocaleString()}`,
    `Z-score: ${d.z}`,
  ].join('\n');
}

async function processAnomalies(bot) {
  const orgs = await pool.query(
    `SELECT bs.organization_id, bs.anomaly_sensitivity, bs.quiet_hours_start, bs.quiet_hours_end,
            bl.chat_id
     FROM telegram_bot_settings bs
     JOIN telegram_bot_links bl ON bl.organization_id = bs.organization_id AND bl.active=TRUE
     WHERE bs.anomaly_enabled = TRUE`
  );
  if (orgs.rows.length === 0) return;

  const nowTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tashkent', hour12: false }).slice(0, 5);

  for (const o of orgs.rows) {
    let anomalies;
    try {
      anomalies = await detectChannelAnomalies(o.organization_id, o.anomaly_sensitivity || 'medium');
    } catch (e) {
      console.warn(`[ANOMALY] org=${o.organization_id} detect xato:`, e.message);
      continue;
    }

    for (const a of anomalies) {
      if (await isDuplicate(o.organization_id, a.type)) continue;

      // DB ga yozish
      const ins = await pool.query(
        `INSERT INTO telegram_anomalies (organization_id, source_id, type, severity, metric, value, baseline, details, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [o.organization_id, a.sourceId, a.type, a.severity, a.metric, a.value, a.baseline, JSON.stringify(a.details)]
      );

      // Quiet hours — critical bo'lsa baribir yuboramiz, warning bo'lsa kechiktiramiz
      const inQuiet = isInQuietHours(nowTime, o.quiet_hours_start, o.quiet_hours_end);
      if (inQuiet && a.severity !== 'critical') {
        console.log(`[ANOMALY] org=${o.organization_id} jim soatda — kechiktirildi`);
        continue;
      }

      // Botga yuborish
      try {
        await bot.telegram.sendMessage(String(o.chat_id), formatAnomaly(a), { parse_mode: 'HTML' });
        await pool.query(`UPDATE telegram_anomalies SET notified_at=NOW() WHERE id=$1`, [ins.rows[0].id]);
      } catch (e) {
        console.warn(`[ANOMALY] sendMessage xato: ${e.message}`);
      }
    }
  }
}

function isInQuietHours(t, qStart, qEnd) {
  if (!qStart || !qEnd) return false;
  if (qStart < qEnd) return t >= qStart && t < qEnd;
  return t >= qStart || t < qEnd;  // overnight
}

function startAnomalyScheduler(bot) {
  // Har soatda 7-daqiqada (sync 04:00 dan keyin baseline tayyor bo'lganda boshlanadi)
  cron.schedule('7 * * * *', () => {
    processAnomalies(bot).catch(e => console.error('[ANOMALY] cron xato:', e.message));
  }, { timezone: 'Asia/Tashkent' });
  console.log('[ANOMALY] Scheduler faol: har soatda :07');
}

module.exports = { startAnomalyScheduler, processAnomalies, detectChannelAnomalies };
