/**
 * Frontend Error Tracker — backend'ga `/api/errors/client` ga yuboradi.
 *
 * Sentry'ga muqobil. Tashqi service kerak emas.
 *
 * Tutadi:
 *   - window.onerror (sync errors)
 *   - window.onunhandledrejection (async errors)
 *   - React error boundary (manual via reportError)
 *
 * Throttle: 5 daqiqada bir xil xato 1 marta yuboriladi (spam oldini olish).
 */

const SENT_FINGERPRINTS = new Map(); // fingerprint → timestamp
const THROTTLE_MS = 5 * 60 * 1000;
const QUEUE = [];
let flushTimer = null;

function makeFingerprint(message, source, lineno) {
  // Oddiy hash — bir xil xato'larni guruhlash uchun
  const key = `${source || ''}:${lineno || ''}:${(message || '').slice(0, 100)}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h) + key.charCodeAt(i);
    h = h | 0;
  }
  return Math.abs(h).toString(16).slice(0, 12);
}

function shouldSend(fingerprint) {
  const now = Date.now();
  const last = SENT_FINGERPRINTS.get(fingerprint);
  if (last && now - last < THROTTLE_MS) return false;
  SENT_FINGERPRINTS.set(fingerprint, now);
  return true;
}

async function flush() {
  flushTimer = null;
  if (QUEUE.length === 0) return;
  const batch = QUEUE.splice(0, 10); // max 10 ta birvarakayiga
  const token = localStorage.getItem('bai_token') || '';
  for (const item of batch) {
    try {
      await fetch('/api/errors/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(item),
      });
    } catch {
      // Network xato — silently ignore
    }
  }
  if (QUEUE.length > 0) {
    flushTimer = setTimeout(flush, 2000);
  }
}

function enqueue(payload) {
  QUEUE.push(payload);
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 1500);
  }
}

/**
 * Manual report — React error boundary yoki try/catch ichidan.
 */
export function reportError(error, extraContext = {}) {
  if (!error) return;
  const message = error.message || String(error);
  const stack = error.stack || null;
  const fingerprint = makeFingerprint(message, stack ? stack.split('\n')[1] : '', 0);
  if (!shouldSend(fingerprint)) return;

  enqueue({
    message,
    stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    context: {
      ...extraContext,
      fingerprint,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Global handlers'ni o'rnatish (App.jsx'da bir marta chaqiriladi).
 */
export function installErrorTracker() {
  if (typeof window === 'undefined') return;
  if (window.__BAI_ERROR_TRACKER_INSTALLED) return;
  window.__BAI_ERROR_TRACKER_INSTALLED = true;

  // Sync errors
  window.addEventListener('error', (event) => {
    const err = event.error || { message: event.message };
    const message = err.message || event.message || 'Unknown error';
    const stack = err.stack || `at ${event.filename}:${event.lineno}:${event.colno}`;
    const fingerprint = makeFingerprint(message, event.filename, event.lineno);
    if (!shouldSend(fingerprint)) return;
    enqueue({
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        fingerprint,
      },
    });
  });

  // Async errors (Promise rejection)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (!reason) return;
    // Sessiya tugadi — tracker yubormaymiz (normal flow)
    if (reason.code === 'SESSION_EXPIRED' || /Sessiya tugadi/i.test(reason.message || '')) return;
    // Cap-hit ham normal flow
    if (reason.code === 'COST_CAP_HIT') return;

    const message = reason.message || String(reason);
    const stack = reason.stack || null;
    const fingerprint = makeFingerprint(message, stack ? stack.split('\n')[1] : '', 0);
    if (!shouldSend(fingerprint)) return;
    enqueue({
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: {
        type: 'unhandledrejection',
        fingerprint,
      },
    });
  });

  // Sahifadan chiqishdan oldin queue'ni flush
  window.addEventListener('beforeunload', () => {
    if (QUEUE.length > 0) {
      // sendBeacon — sahifa yopilayotganda ham yetkaziladi
      try {
        const data = JSON.stringify(QUEUE.shift());
        navigator.sendBeacon('/api/errors/client', new Blob([data], { type: 'application/json' }));
      } catch {}
    }
  });
}
