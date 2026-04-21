/**
 * AI provider abstraction (Claude, DeepSeek, ChatGPT, Gemini).
 * Backend'da AI chaqirish uchun (bot-worker bu yerga proxy qiladi).
 *
 * Kalit yechish tartibi (frontend'dagi mantiqqa o'xshash):
 *   1. Foydalanuvchi (CEO) ai_config.api_key — bo'lsa
 *   2. global_settings.global_ai — bo'lsa
 *   3. Xato — kalit yo'q
 */
const pool = require('../db/pool');

// Provider config: standart model + endpoint
const PROVIDERS = {
  claude: {
    defaultModel: 'claude-sonnet-4-5-20250929',
    url: 'https://api.anthropic.com/v1/messages',
    call: callClaude,
  },
  deepseek: {
    defaultModel: 'deepseek-chat',
    url: 'https://api.deepseek.com/v1/chat/completions',
    call: callOpenAI,
  },
  chatgpt: {
    defaultModel: 'gpt-4o-mini',
    url: 'https://api.openai.com/v1/chat/completions',
    call: callOpenAI,
  },
  gemini: {
    defaultModel: 'gemini-2.5-flash',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    call: callGemini,
  },
};

// ────────────────────────────────────────────────
// Kalit yechish
// ────────────────────────────────────────────────
// Eskirgan modellarni avtomatik almashtirish
const MODEL_REPLACEMENTS = {
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-pro': 'gemini-2.5-pro',
  'claude-3-opus-20240229': 'claude-sonnet-4-5-20250929',
  'claude-3-sonnet-20240229': 'claude-sonnet-4-5-20250929',
  'claude-3-haiku-20240307': 'claude-haiku-4-5-20251001',
};

function modernizeModel(model, provider) {
  if (!model) return PROVIDERS[provider]?.defaultModel;
  return MODEL_REPLACEMENTS[model] || model;
}

async function resolveAiConfig(userId) {
  // Foydalanuvchi shaxsiy kalit
  if (userId) {
    const r = await pool.query(
      `SELECT provider, model, api_key, all_keys FROM ai_config WHERE user_id=$1`,
      [userId]
    );
    if (r.rows.length > 0) {
      const cfg = r.rows[0];
      const provider = cfg.provider || 'deepseek';
      const allKeys = cfg.all_keys || {};
      const personalKey = allKeys[provider] || cfg.api_key || '';
      if (personalKey) {
        return {
          provider,
          model: modernizeModel(cfg.model, provider),
          apiKey: personalKey,
          source: 'personal',
        };
      }
    }
  }
  // Global fallback
  const g = await pool.query(`SELECT value FROM global_settings WHERE key='global_ai'`);
  const gv = g.rows[0]?.value || {};
  if (gv.apiKey) {
    const p = gv.provider || 'deepseek';
    return {
      provider: p,
      model: modernizeModel(gv.model, p),
      apiKey: gv.apiKey,
      source: 'global',
    };
  }
  throw new Error('AI kalit topilmadi (na shaxsiy, na global)');
}

// ────────────────────────────────────────────────
// Asosiy chaqiruv
// ────────────────────────────────────────────────
async function chatComplete({ userId, systemPrompt, message, history = [], maxTokens = 2000 }) {
  const cfg = await resolveAiConfig(userId);
  const prov = PROVIDERS[cfg.provider];
  if (!prov) throw new Error(`Provider qo'llab-quvvatlanmaydi: ${cfg.provider}`);

  const reply = await prov.call({
    apiKey: cfg.apiKey,
    model: cfg.model,
    systemPrompt,
    message,
    history,
    maxTokens,
  });
  return { reply, provider: cfg.provider, model: cfg.model, source: cfg.source };
}

// ────────────────────────────────────────────────
// Claude (Anthropic)
// ────────────────────────────────────────────────
async function callClaude({ apiKey, model, systemPrompt, message, history, maxTokens }) {
  const messages = [
    ...history.filter(h => h.role !== 'system').map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  const body = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude: ${data.error?.message || res.status}`);
  return data.content?.[0]?.text || '';
}

// ────────────────────────────────────────────────
// OpenAI-compatible (DeepSeek, ChatGPT)
// ────────────────────────────────────────────────
async function callOpenAI({ apiKey, model, systemPrompt, message, history, maxTokens }) {
  const isOpenAI = (model || '').startsWith('gpt-');
  const url = isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.deepseek.com/v1/chat/completions';
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${isOpenAI ? 'OpenAI' : 'DeepSeek'}: ${data.error?.message || res.status}`);
  return data.choices?.[0]?.message?.content || '';
}

// ────────────────────────────────────────────────
// Google Gemini
// ────────────────────────────────────────────────
async function callGemini({ apiKey, model, systemPrompt, message, history, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = [
    ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini: ${data.error?.message || res.status}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { chatComplete, resolveAiConfig };
