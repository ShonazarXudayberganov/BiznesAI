/**
 * Forecast — vaqt qatorini bashorat qilish (Holt-Winters triple exponential smoothing).
 *
 * Algoritm:
 *   - Level (L): joriy daraja
 *   - Trend (T): o'sish/pasayish surati
 *   - Season (S): davriy ko'rsatkichlar (haftalik/oylik tsikl)
 *
 *   Y_t+h = (L_t + h*T_t) * S_(t+h-m) — multiplicative
 *
 * Mavsumiylik bo'lmasa (uzunlik <2*period yoki season noaniq) → Holt linear (double exp).
 *
 * Confidence interval: residual std × 1.96 (95% CI).
 *
 * Python/Prophet'siz, faqat Node.js. Kichik ma'lumot uchun ham ishlaydi.
 */

const SEASON_DAILY = 7;
const SEASON_MONTHLY = 12;

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/**
 * Holt linear exponential smoothing — trend, mavsumiyliksiz.
 * @param {number[]} y
 * @param {number} alpha — level smoothing 0..1
 * @param {number} beta — trend smoothing 0..1
 * @param {number} h — bashorat horizonti
 */
function holtLinear(y, alpha, beta, h) {
  if (y.length < 2) {
    const v = y[0] ?? 0;
    return { forecast: Array(h).fill(v), residuals: [], level: v, trend: 0 };
  }
  let L = y[0];
  let T = y[1] - y[0];
  const fitted = [L];
  for (let i = 1; i < y.length; i++) {
    const prevL = L;
    L = alpha * y[i] + (1 - alpha) * (prevL + T);
    T = beta * (L - prevL) + (1 - beta) * T;
    fitted.push(L);
  }
  const residuals = y.map((v, i) => v - fitted[i]);
  const forecast = [];
  for (let k = 1; k <= h; k++) {
    forecast.push(L + k * T);
  }
  return { forecast, fitted, residuals, level: L, trend: T };
}

/**
 * Holt-Winters multiplicative — level + trend + seasonality.
 */
function holtWinters(y, alpha, beta, gamma, period, h) {
  const n = y.length;
  if (n < 2 * period) {
    return holtLinear(y, alpha, beta, h);
  }
  // Initial level — birinchi period o'rtacha
  let L = mean(y.slice(0, period));
  // Initial trend — period orasidagi farq
  let T = (mean(y.slice(period, 2 * period)) - mean(y.slice(0, period))) / period;
  // Initial seasonal indices
  const S = new Array(period);
  for (let i = 0; i < period; i++) {
    const yearAvgs = [];
    for (let j = 0; (j * period + i) < n; j++) {
      yearAvgs.push(y[j * period + i]);
    }
    S[i] = mean(yearAvgs) / (L || 1);
  }

  const fitted = [];
  for (let i = 0; i < n; i++) {
    const seasonalIdx = i % period;
    const prevL = L;
    const sFactor = S[seasonalIdx] || 1;
    L = alpha * (y[i] / Math.max(0.0001, sFactor)) + (1 - alpha) * (prevL + T);
    T = beta * (L - prevL) + (1 - beta) * T;
    S[seasonalIdx] = gamma * (y[i] / Math.max(0.0001, L)) + (1 - gamma) * sFactor;
    fitted.push((prevL + T) * sFactor);
  }

  const residuals = y.map((v, i) => v - (fitted[i] || 0));
  const forecast = [];
  for (let k = 1; k <= h; k++) {
    const sFactor = S[(n + k - 1) % period] || 1;
    forecast.push((L + k * T) * sFactor);
  }
  return { forecast, fitted, residuals, level: L, trend: T, seasonal: S };
}

/**
 * Asosiy bashorat funksiyasi.
 *
 * @param {Array<{date,value}>} series — sortlangan vaqt qatori
 * @param {object} opts
 * @param {number} [opts.horizon=14] — bashorat oldindagi qadamlar soni
 * @param {string} [opts.granularity='day']
 * @param {boolean} [opts.includeFitted=false] — fit qiymatlarini ham qaytarish
 * @returns {{ forecast, confidenceInterval, summary, method }}
 */
function forecastSeries(series, opts = {}) {
  const horizon = Math.min(Math.max(1, opts.horizon || 14), 90);
  const granularity = opts.granularity || 'day';
  const includeFitted = !!opts.includeFitted;

  if (!Array.isArray(series) || series.length < 4) {
    return {
      forecast: [],
      method: 'insufficient_data',
      reason: `Bashorat uchun kamida 4 nuqta kerak (${series?.length || 0} bor)`,
    };
  }

  const sorted = [...series].sort((a, b) => new Date(a.date) - new Date(b.date));
  const values = sorted.map(s => Number(s.value) || 0);
  const lastDate = new Date(sorted[sorted.length - 1].date);

  const period = granularity === 'month' ? SEASON_MONTHLY : SEASON_DAILY;
  const useSeasonal = values.length >= 2 * period;

  // Smoothing parametrlari (sodda default — odatda 0.3-0.5)
  const alpha = 0.5;
  const beta = 0.2;
  const gamma = 0.3;

  let result;
  let method;
  if (useSeasonal) {
    result = holtWinters(values, alpha, beta, gamma, period, horizon);
    method = 'holt_winters';
  } else {
    result = holtLinear(values, alpha, beta, horizon);
    method = 'holt_linear';
  }

  // Confidence interval — residual standard deviation × 1.96 (95% CI)
  const residStd = std(result.residuals.filter(r => isFinite(r)));
  const ci95 = residStd * 1.96;

  const forecastPoints = result.forecast.map((v, i) => {
    const d = new Date(lastDate);
    if (granularity === 'month') {
      d.setMonth(d.getMonth() + i + 1);
    } else if (granularity === 'week') {
      d.setDate(d.getDate() + (i + 1) * 7);
    } else {
      d.setDate(d.getDate() + i + 1);
    }
    return {
      date: d.toISOString().slice(0, 10),
      value: Math.max(0, Math.round(v * 100) / 100),
      lower_95: Math.max(0, Math.round((v - ci95) * 100) / 100),
      upper_95: Math.max(0, Math.round((v + ci95) * 100) / 100),
    };
  });

  // Summary
  const histAvg = mean(values);
  const histLast = values[values.length - 1];
  const forecastAvg = mean(result.forecast);
  const forecastTotal = result.forecast.reduce((a, b) => a + b, 0);
  const trendDirection = result.trend > 0 ? 'up' : result.trend < 0 ? 'down' : 'flat';
  const trendChangePct = histAvg !== 0 ? Math.round((result.trend / histAvg) * 1000) / 10 : 0;

  return {
    method,
    horizon,
    granularity,
    forecast: forecastPoints,
    summary: {
      historical_avg: Math.round(histAvg * 100) / 100,
      historical_last: histLast,
      forecast_avg: Math.round(forecastAvg * 100) / 100,
      forecast_total: Math.round(forecastTotal * 100) / 100,
      trend_direction: trendDirection,
      trend_per_step_pct: trendChangePct,
      level: Math.round(result.level * 100) / 100,
      ci_95_width: Math.round(ci95 * 200) / 100, // total width = 2 * ci95
    },
    fitted: includeFitted ? result.fitted : undefined,
    series_length: values.length,
  };
}

module.exports = { forecastSeries };
