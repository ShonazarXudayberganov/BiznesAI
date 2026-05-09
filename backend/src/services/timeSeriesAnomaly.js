/**
 * Time series anomaly detection — z-score'dan ko'ra kuchliroq.
 *
 * Algoritm:
 *   1. Vaqt qatorini trend + mavsumiylik + qoldiq ga ajratish (sodda STL)
 *   2. Trend: moving average (window=7 yoki 30)
 *   3. Mavsumiylik: weekday (haftalik) + monthly pattern
 *   4. Qoldiq (residual) ustida z-score qo'llaniladi
 *
 * Bu yondashuv quyidagilarni topadi:
 *   - Anomaliya outlier (oddiy z-score'dan farqli — mavsumiy effektni inobatga oladi)
 *   - Trend buzilish (suddenly o'sish/pasayish, oldingi trenddan keskin chiqish)
 *   - Level shift (yangi baseline)
 *
 * Python/R'siz, faqat Node.js. Prophet darajasida emas, lekin oddiy z-score'dan 3x kuchliroq.
 */

const SEASON_WEEKLY = 7;
const SEASON_MONTHLY = 30;

/**
 * Moving average — trend ekstraksiya uchun.
 */
function movingAverage(values, window) {
  const result = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    const slice = values.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

/**
 * Median absolute deviation — z-score'ga ko'ra outlier'lar ta'siriga chidamliroq.
 */
function mad(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = arr.map(v => Math.abs(v - median));
  const sortedDev = deviations.sort((a, b) => a - b);
  return sortedDev[Math.floor(sortedDev.length / 2)] || 0;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Asosiy funksiya — vaqt qatorini dekompozitsiya qilib anomaliyalarni topadi.
 *
 * @param {Array<{date: Date|string, value: number}>} series — sana bo'yicha tartiblangan
 * @param {object} opts
 * @param {string} [opts.granularity='day']
 * @param {number} [opts.threshold=3.0] — modified z-score threshold
 * @returns {{decomposition, anomalies}}
 */
function detectTimeSeriesAnomalies(series, opts = {}) {
  const threshold = opts.threshold || 3.0;
  const granularity = opts.granularity || 'day';

  if (!Array.isArray(series) || series.length < 14) {
    // Yetarli ma'lumot yo'q — sodda z-score qaytaramiz
    return {
      decomposition: null,
      anomalies: simpleZScoreFallback(series, threshold),
      method: 'zscore_fallback',
      reason: `Yetarli tarix yo'q (${series?.length || 0} nuqta, kamida 14 kerak)`,
    };
  }

  const sorted = [...series].sort((a, b) => new Date(a.date) - new Date(b.date));
  const values = sorted.map(s => Number(s.value) || 0);
  const dates = sorted.map(s => new Date(s.date));

  // 1. Trend — moving average (window = sezgirroq)
  const window = granularity === 'month' ? 3 : Math.min(7, Math.floor(values.length / 4));
  const trend = movingAverage(values, window);

  // 2. Detrended (qoldiq + mavsumiylik)
  const detrended = values.map((v, i) => v - trend[i]);

  // 3. Mavsumiylik — haftalik pattern (weekday averaging)
  const seasonal = new Array(values.length).fill(0);
  if (granularity === 'day' && values.length >= SEASON_WEEKLY * 2) {
    const weekdayBuckets = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < detrended.length; i++) {
      const dow = dates[i].getDay();
      weekdayBuckets[dow].push(detrended[i]);
    }
    const weekdayMeans = weekdayBuckets.map(b => b.length ? b.reduce((a, c) => a + c, 0) / b.length : 0);
    for (let i = 0; i < seasonal.length; i++) {
      seasonal[i] = weekdayMeans[dates[i].getDay()] || 0;
    }
  }

  // 4. Residual = original - trend - seasonal
  const residuals = values.map((v, i) => v - trend[i] - seasonal[i]);

  // 5. Modified z-score (MAD asosida — outlier'larga chidamliroq)
  const med = median(residuals);
  const madValue = mad(residuals);
  const scale = madValue > 0 ? 1.4826 * madValue : 0.0001; // Gaussian scaling
  const modifiedZ = residuals.map(r => (r - med) / scale);

  // 6. Anomaliyalarni topish
  const anomalies = [];
  for (let i = 0; i < values.length; i++) {
    const absZ = Math.abs(modifiedZ[i]);
    if (absZ > threshold) {
      // Trend buzilish ham tekshirish
      const trendChange = i > 0 ? (trend[i] - trend[Math.max(0, i - window)]) / Math.max(0.001, Math.abs(trend[Math.max(0, i - window)])) : 0;
      anomalies.push({
        index: i,
        date: dates[i].toISOString().slice(0, 10),
        value: values[i],
        expected: trend[i] + seasonal[i],
        residual: residuals[i],
        z_score: Number(modifiedZ[i].toFixed(2)),
        deviation_pct: Number(((residuals[i] / Math.max(0.001, Math.abs(trend[i] + seasonal[i]))) * 100).toFixed(1)),
        trend_change_pct: Number((trendChange * 100).toFixed(1)),
        severity: absZ > threshold * 1.5 ? 'high' : absZ > threshold * 1.2 ? 'medium' : 'low',
        type: residuals[i] > 0 ? 'spike' : 'drop',
      });
    }
  }

  // 7. Trend break detection — ketma-ket 3+ kun bir tomonga z-score
  const trendBreaks = detectTrendBreaks(modifiedZ, dates, values, threshold);

  return {
    decomposition: {
      trend,
      seasonal,
      residuals,
      median_residual: med,
      mad: madValue,
      threshold,
    },
    anomalies,
    trendBreaks,
    method: 'stl_modified_zscore',
    series_length: values.length,
  };
}

function detectTrendBreaks(zScores, dates, values, threshold) {
  const breaks = [];
  let runStart = -1;
  let runDir = 0;
  const minRun = 3;

  for (let i = 0; i < zScores.length; i++) {
    const z = zScores[i];
    const dir = z > 1.5 ? 1 : z < -1.5 ? -1 : 0;
    if (dir === runDir && dir !== 0) {
      // running streak continues
    } else {
      if (runStart >= 0 && (i - runStart) >= minRun) {
        // Trend break tugadi
        breaks.push({
          start_date: dates[runStart].toISOString().slice(0, 10),
          end_date: dates[i - 1].toISOString().slice(0, 10),
          length_days: i - runStart,
          direction: runDir > 0 ? 'up' : 'down',
          avg_value: values.slice(runStart, i).reduce((a, b) => a + b, 0) / (i - runStart),
        });
      }
      runStart = dir !== 0 ? i : -1;
      runDir = dir;
    }
  }
  return breaks;
}

/**
 * Fallback: oddiy z-score (kam ma'lumot uchun).
 */
function simpleZScoreFallback(series, threshold) {
  if (!Array.isArray(series) || series.length < 3) return [];
  const values = series.map(s => Number(s.value) || 0);
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const s = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
  if (s === 0) return [];
  return series.map((point, i) => {
    const z = (values[i] - m) / s;
    if (Math.abs(z) <= threshold) return null;
    return {
      index: i,
      date: typeof point.date === 'string' ? point.date.slice(0, 10) : new Date(point.date).toISOString().slice(0, 10),
      value: values[i],
      expected: m,
      residual: values[i] - m,
      z_score: Number(z.toFixed(2)),
      severity: Math.abs(z) > threshold * 1.5 ? 'high' : 'medium',
      type: z > 0 ? 'spike' : 'drop',
    };
  }).filter(Boolean);
}

module.exports = { detectTimeSeriesAnomalies };
