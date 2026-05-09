/**
 * Intent registry — har intent uchun:
 *   - promptKey: prompts/index.js dagi shablon kalit
 *   - allowedTools: ruxsat etilgan tool nomlari (null = barchasi)
 *   - model: model override (null = user/global default)
 *   - maxIter: agent loop max iteratsiya
 *   - thinkingBudget: extended thinking budget tokens (0 = o'chirilgan)
 *   - cache: prompt caching (default: true)
 *   - outputSchema: 'json' yoki 'markdown'
 *   - webSearch: Anthropic native web_search tool yoqilganmi (faqat Claude)
 *   - webSearchMaxUses: max necha marta qidirish (default 5)
 *
 * AI Brain orchestrator (aiBrain.js) intent ni shu yerdan o'qib,
 * runAgent'ga to'g'ri konfiguratsiyani uzatadi.
 */

const INTENTS = {
  // ── DASHBOARD ──────────────────────────────────────────────────
  'dashboard.summary': {
    promptKey: 'dashboard.summary',
    allowedTools: ['list_sources', 'aggregate', 'group_by', 'time_series', 'search_rows', 'cross_source_search', 'semantic_search', 'find_anomaly', 'compare_periods', 'forecast', 'consult_specialist'],
    model: null,
    maxIter: 8,
    thinkingBudget: 2048,
    cache: true,
    outputSchema: 'json',
    webSearch: true,        // bozor konteksti uchun yoqilgan
    webSearchMaxUses: 3,    // engil — 3 marta yetarli
  },

  'dashboard.widget': {
    promptKey: 'dashboard.widget',
    allowedTools: ['list_sources', 'aggregate', 'search_rows'],
    model: null,
    maxIter: 4,
    thinkingBudget: 0,
    cache: true,
    outputSchema: 'json',
    webSearch: false,        // kichik widget — tashqi ma'lumot kerak emas
  },

  // ── ANALYTICS ─────────────────────────────────────────────────
  'analytics.module': {
    promptKey: 'analytics.module',
    allowedTools: null,
    model: null,
    maxIter: 10,
    thinkingBudget: 4096,
    cache: true,
    outputSchema: 'markdown',
    webSearch: true,         // bozor/raqobat tahlili uchun
    webSearchMaxUses: 5,
    codeExecution: true,     // murakkab hisoblar (regression, statistik testlar) uchun
  },

  // ── REPORTS ───────────────────────────────────────────────────
  'reports.generate': {
    promptKey: 'reports.generate',
    allowedTools: null,
    model: null,
    maxIter: 12,
    thinkingBudget: 6000,
    cache: true,
    outputSchema: 'markdown',
    webSearch: true,         // hisobotda inflyatsiya, soha trendlari
    webSearchMaxUses: 5,
    codeExecution: true,     // hisobotda chuqur statistik analiz uchun
  },

  // ── ALERTS ────────────────────────────────────────────────────
  'alerts.label': {
    promptKey: 'alerts.label',
    allowedTools: ['get_distinct_values', 'search_rows', 'save_memory', 'find_anomaly', 'time_series'],
    model: null,
    maxIter: 4,
    thinkingBudget: 0,
    cache: true,
    outputSchema: 'json',
    webSearch: false,        // tahdidlar mavjud data'ga asoslanadi
  },

  // ── CHAT ──────────────────────────────────────────────────────
  'chat.freeform': {
    promptKey: 'chat.freeform',
    allowedTools: null,
    model: null,
    maxIter: 14,
    thinkingBudget: 0,
    cache: true,
    outputSchema: 'markdown',
    webSearch: true,         // chat'da hech qachon foydalanuvchi narx, trend so'rashi mumkin
    webSearchMaxUses: 5,
    codeExecution: true,     // foydalanuvchi murakkab hisob so'rashi mumkin
  },

  // ── CHARTS ────────────────────────────────────────────────────
  'chart.generate': {
    promptKey: 'chart.generate',
    allowedTools: ['list_sources', 'search_rows', 'aggregate', 'group_by'],
    model: null,
    maxIter: 5,
    thinkingBudget: 0,
    cache: true,
    outputSchema: 'json',
    webSearch: false,
  },

  'chart.suggest': {
    promptKey: 'chart.suggest',
    allowedTools: [],
    model: null,
    maxIter: 1,
    thinkingBudget: 0,
    cache: true,
    outputSchema: 'json',
    webSearch: false,
  },
};

function getIntentConfig(intent) {
  const cfg = INTENTS[intent];
  if (!cfg) {
    throw new Error(`Noma'lum intent: ${intent}. Mavjud: ${Object.keys(INTENTS).join(', ')}`);
  }
  return cfg;
}

function listIntents() {
  return Object.keys(INTENTS);
}

module.exports = { INTENTS, getIntentConfig, listIntents };
