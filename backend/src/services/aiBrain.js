/**
 * AI Brain Orchestrator — yagona kirish nuqtasi.
 *
 * Frontend'dagi har sahifa (Dashboard, Analytics, Reports, Alerts, Charts, Chat) shu yerga
 * `intent` + `payload` yuboradi. Orchestrator:
 *   1. intent → konfig (allowedTools, model, maxIter, thinkingBudget) (intents.js'dan)
 *   2. intent → prompt (systemExtra + user) (prompts/'dan)
 *   3. runAgent ni shu konfig bilan chaqiradi (aiAgent.js qayta ishlatiladi)
 *   4. SSE stream yoki to'liq javob qaytaradi
 *   5. JSON outputSchema bo'lsa, javobni parse qiladi (markdown blok'larni ham yechadi)
 *
 * Yangi sahifa qo'shish:
 *   - intents.js'da yangi intent yarating
 *   - prompts/<area>.js'da prompt funksiya yarating
 *   - frontend AiBrainAPI.stream(intent, payload, ...) chaqiring
 */
const { runAgent } = require('./aiAgent');
const { getIntentConfig } = require('./intents');
const { getPrompt } = require('./prompts');
const { logAiUsage, generateRequestId } = require('./telemetry/logger');
const { extractAndSavePending } = require('./memoryExtractor');

/**
 * Markdown bloklari ichidan birinchi to'g'ri JSON ni topib qaytaradi.
 * Agar parse qilib bo'lmasa, null qaytaradi.
 */
function tryParseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  // 1. Markdown code blok ichidagi JSON ni qidirish
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // 2. Birinchi { ... } yoki [ ... ] blokini topish
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  return null;
}

/**
 * AI Brain ni ishga tushirish.
 *
 * @param {object} opts
 * @param {string} opts.intent — `dashboard.summary`, `chat.freeform`, va h.k.
 * @param {object} opts.payload — intent'ga maxsus ma'lumotlar (vars)
 * @param {string} [opts.message] — agar payload.user yo'q bo'lsa, foydalanuvchi xabari
 * @param {Array}  [opts.history] — oldingi suhbat
 * @param {number} opts.userId
 * @param {number} opts.organizationId
 * @param {string} [opts.language]
 * @param {function} [opts.onTool]
 * @param {function} [opts.onDelta]
 * @param {function} [opts.onThinking]
 * @returns {Promise<{intent, outputSchema, parsed?, reply, raw, ...meta}>}
 */
async function runBrain(opts) {
  const {
    intent,
    payload = {},
    message: explicitMessage,
    history = [],
    userId,
    organizationId,
    language,
    onTool,
    onDelta,
    onThinking,
    thinkingBudgetOverride,
    allowedSourceIds, // payload.sourceIds yoki tashqaridan
  } = opts;

  if (!intent) throw new Error('intent kerak');

  const cfg = getIntentConfig(intent); // throws if unknown
  const startTime = Date.now();
  const requestId = generateRequestId();
  const page = (intent.split('.')[0] || 'unknown'); // 'dashboard'|'analytics'|...

  // Prompt registry'dan systemExtra + user'ni olish
  const promptVars = { ...payload, language };
  const { systemExtra, user: promptUser } = getPrompt(intent, promptVars);

  // User xabarini hal qilish: prompt registry beradimi yoki tashqaridan?
  const userMessage = (typeof promptUser === 'string' && promptUser.length > 0)
    ? promptUser
    : (explicitMessage || payload.message || '');
  if (!userMessage) {
    throw new Error(`Intent "${intent}" uchun user xabari yo'q. payload.message yoki prompt funksiyasi user qaytarishi kerak.`);
  }

  // runAgent chaqirish
  let agentResult;
  let runError = null;
  try {
    agentResult = await runAgent({
      message: userMessage,
      organizationId,
      userId,
      history,
      onTool,
      onDelta,
      onThinking,
      systemPromptExtra: systemExtra || undefined,
      language,
      thinkingBudget: typeof thinkingBudgetOverride === 'number' ? thinkingBudgetOverride : (cfg.thinkingBudget || 0),
      cache: cfg.cache !== false,
      allowedTools: cfg.allowedTools, // null/undefined = barchasi
      maxIter: cfg.maxIter,
      modelOverride: cfg.model,
      webSearch: cfg.webSearch === true,
      webSearchMaxUses: typeof cfg.webSearchMaxUses === 'number' ? cfg.webSearchMaxUses : 5,
      codeExecution: cfg.codeExecution === true,
      // Foydalanuvchi tanlagan manbalar — payload.sourceIds yoki tashqaridan
      allowedSourceIds: Array.isArray(allowedSourceIds) && allowedSourceIds.length > 0
        ? allowedSourceIds
        : (Array.isArray(payload.sourceIds) && payload.sourceIds.length > 0 ? payload.sourceIds : null),
    });
  } catch (e) {
    runError = e;
  }

  const duration_ms = Date.now() - startTime;

  // ── TELEMETRY: har brain chaqiruvini ai_usage_log'ga yozish ──
  try {
    logAiUsage({
      userId,
      organizationId,
      requestId,
      page,
      intent,
      provider: agentResult?.provider,
      model: agentResult?.model,
      usage: agentResult?.usage || {},
      toolCallsCount: Array.isArray(agentResult?.toolCalls) ? agentResult.toolCalls.length : 0,
      iterations: agentResult?.iterations || 0,
      duration_ms,
      status: runError ? 'error' : 'ok',
      error_message: runError ? String(runError.message || runError).slice(0, 500) : null,
    });
  } catch (logErr) {
    // logger non-blocking, lekin har ehtimolga
    console.warn('[brain] telemetry log fail:', logErr.message);
  }

  if (runError) throw runError;

  // ── AUTO-MEMORY EXTRACTION (Faza 5.4) ──
  // Faqat chat.freeform intent uchun — yangi faktlar pending'ga tushadi
  if (intent === 'chat.freeform' && userId && userMessage) {
    extractAndSavePending({
      userId,
      userMessage,
      assistantReply: agentResult?.reply || '',
    }).catch(e => console.warn('[brain] auto-memory fail:', e.message));
  }

  const out = {
    intent,
    requestId,
    outputSchema: cfg.outputSchema || 'markdown',
    reply: agentResult.reply,
    raw: agentResult.reply,
    confidence: agentResult.confidence,
    sourcesUsed: agentResult.sourcesUsed,
    iterations: agentResult.iterations,
    toolCalls: agentResult.toolCalls,
    provider: agentResult.provider,
    model: agentResult.model,
    keySource: agentResult.keySource,
    settings: agentResult.settings,
    usage: agentResult.usage,
    duration_ms,
  };

  // JSON output schema bo'lsa parse qilamiz
  if (cfg.outputSchema === 'json') {
    out.parsed = tryParseJsonFromText(agentResult.reply);
    if (out.parsed === null) {
      out.parseError = 'JSON ajratib bo\'lmadi';
    }
  }

  return out;
}

module.exports = { runBrain, tryParseJsonFromText };
