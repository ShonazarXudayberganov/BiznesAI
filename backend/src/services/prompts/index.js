/**
 * Prompts registry — intent kalit bilan prompt funksiyasini qaytaradi.
 *
 * Har funksiya { systemExtra, user } qaytaradi:
 *   - systemExtra: aiAgent base persona ustiga qo'shiladi
 *   - user: foydalanuvchi xabari (null bo'lsa orchestrator runtime'dan oladi)
 *
 * Yangi intent qo'shish uchun:
 *   1. Tegishli fayl'da funksiya yarating (yoki yangi fayl)
 *   2. REGISTRY'ga kalit qo'shing
 *   3. intents.js'da intent config'ni e'lon qiling
 */
const dashboard = require('./dashboard');
const chat = require('./chat');
const analytics = require('./analytics');
const reports = require('./reports');
const alerts = require('./alerts');
const charts = require('./charts');

const REGISTRY = {
  'dashboard.summary': dashboard.summary,
  'dashboard.widget': dashboard.widget,
  'chat.freeform': chat.freeform,
  'analytics.module': analytics.moduleAnalysis,
  'reports.generate': reports.generate,
  'alerts.label': alerts.label,
  'chart.generate': charts.generate,
  'chart.suggest': charts.suggest,
};

function getPrompt(intent, vars = {}) {
  const fn = REGISTRY[intent];
  if (!fn) {
    throw new Error(`Prompt registry'da intent topilmadi: ${intent}`);
  }
  const out = fn(vars) || {};
  return {
    systemExtra: typeof out.systemExtra === 'string' ? out.systemExtra : '',
    user: out.user,
  };
}

module.exports = { getPrompt, REGISTRY };
