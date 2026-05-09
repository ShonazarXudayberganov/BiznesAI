/**
 * AI cost hisoblash — har provider/model uchun real narxlar.
 *
 * Narxlar 2026-may holatida. Yangilanishlar uchun:
 *   - Claude: https://www.anthropic.com/pricing
 *   - DeepSeek: https://platform.deepseek.com/pricing
 *   - OpenAI: https://openai.com/pricing
 *   - Gemini: https://ai.google.dev/pricing
 *   - Voyage: https://voyageai.com/pricing
 *
 * Barcha qiymatlar $/M token. Web search alohida — $/use.
 */

const PRICING = {
  // Claude (Anthropic)
  'claude-sonnet-4-5-20250929':   { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, contextWindow: 200000 },
  'claude-sonnet-4-5':            { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-6':            { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-6':              { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-opus-4-7':              { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-4-5-20251001':    { input: 1.00, output: 5.00, cacheRead: 0.10, cacheWrite: 1.25 },
  'claude-haiku-4-5':             { input: 1.00, output: 5.00, cacheRead: 0.10, cacheWrite: 1.25 },

  // DeepSeek
  'deepseek-chat':                { input: 0.27, output: 1.10 },
  'deepseek-reasoner':            { input: 0.55, output: 2.19 },

  // OpenAI / ChatGPT
  'gpt-4o':                       { input: 2.50, output: 10.00 },
  'gpt-4o-mini':                  { input: 0.15, output: 0.60 },
  'o1-mini':                      { input: 3.00, output: 12.00 },

  // Gemini
  'gemini-2.5-flash':             { input: 0.075, output: 0.30 },
  'gemini-2.5-flash-lite':        { input: 0.0375, output: 0.15 },
  'gemini-2.5-pro':               { input: 1.25, output: 10.00 },
  'gemini-2.0-flash':             { input: 0.075, output: 0.30 },

  // Voyage embeddings
  'voyage-3-large':               { input: 0.18, output: 0 }, // embedding-only
};

const WEB_SEARCH_COST_PER_USE = 0.01; // Anthropic native web_search

/**
 * Compute cost in USD for a single AI call.
 *
 * @param {object} usage
 * @param {string} usage.model — model name
 * @param {string} [usage.provider]
 * @param {number} [usage.input_tokens=0]
 * @param {number} [usage.output_tokens=0]
 * @param {number} [usage.thinking_tokens=0] — counted as output
 * @param {number} [usage.cached_read_tokens=0]
 * @param {number} [usage.cached_write_tokens=0]
 * @param {number} [usage.web_search_count=0]
 * @returns {number} cost_usd
 */
function computeCost(usage = {}) {
  const model = usage.model || '';
  const pricing = PRICING[model] || guessPricing(model, usage.provider);
  if (!pricing) return 0;

  const inputTokens = (usage.input_tokens || 0);
  const outputTokens = (usage.output_tokens || 0) + (usage.thinking_tokens || 0);
  const cachedRead = (usage.cached_read_tokens || 0);
  const cachedWrite = (usage.cached_write_tokens || 0);

  // input_tokens uchun: Anthropic'da cached_read alohida (input dan tashqari).
  // Lekin response usage'da input_tokens "fresh" tokenlar (non-cached). cached_read = cache'dan
  // o'qilgan token (har biri 0.10x). cached_write = cache'ga yozilgan (1.25x).
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const cacheReadCost = (cachedRead / 1_000_000) * (pricing.cacheRead || pricing.input * 0.1);
  const cacheWriteCost = (cachedWrite / 1_000_000) * (pricing.cacheWrite || pricing.input * 1.25);
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const webSearchCost = (usage.web_search_count || 0) * WEB_SEARCH_COST_PER_USE;

  return Number((inputCost + cacheReadCost + cacheWriteCost + outputCost + webSearchCost).toFixed(6));
}

/**
 * Model bilinmasa, provayder bo'yicha taxminiy narx.
 */
function guessPricing(model, provider) {
  if (!provider && model) {
    if (model.startsWith('claude')) provider = 'claude';
    else if (model.startsWith('gpt') || model.startsWith('o1')) provider = 'chatgpt';
    else if (model.startsWith('deepseek')) provider = 'deepseek';
    else if (model.startsWith('gemini')) provider = 'gemini';
  }
  const fallback = {
    claude:   { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
    chatgpt:  { input: 2.50, output: 10.00 },
    deepseek: { input: 0.27, output: 1.10 },
    gemini:   { input: 0.075, output: 0.30 },
  };
  return fallback[provider] || null;
}

/**
 * Inson o'qishi qulay summa (4 decimal places).
 */
function formatCost(usd) {
  if (!usd || usd < 0.000001) return '$0';
  if (usd < 0.01) return `$${(usd * 1000).toFixed(3)}m`; // mili-USD
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

module.exports = {
  computeCost,
  formatCost,
  PRICING,
  WEB_SEARCH_COST_PER_USE,
};
