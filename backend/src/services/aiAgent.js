/**
 * AI Agent — multi-turn loop with tool use.
 *
 * Pattern:
 *   1. Foydalanuvchi savol yuboradi
 *   2. AI vositalarni chaqiradi (search/aggregate/groupBy va h.k.)
 *   3. Tizim vositalarni ishga tushiradi, natijani AI'ga qaytaradi
 *   4. AI yana vosita chaqirishi yoki yakuniy javob berishi mumkin
 *   5. Maksimal MAX_ITER iteratsiya
 *
 * Har 4 provayder uchun bir xil interfeys.
 */
const { resolveAiConfig } = require('./aiProviders');
const { executeTool, getToolsForProvider } = require('./aiTools');

const MAX_ITER = 7;          // ko'pi bilan shuncha tool chaqiruv tsikli
const MAX_TOKENS = 2500;     // har javob uchun

const SYSTEM_PROMPT = `Sen Analix — AI biznes-tahlilchi yordamchisisan. Tashkilot ma'lumotlariga vositalar (tool'lar) orqali kirishing bor.

QAT'IY QOIDALAR:
1. HAR DOIM O'zbek tilida javob ber.
2. HAR savolga vositalardan foydalanib, REAL ma'lumot olib javob ber. Hech qachon o'zingdan raqam o'ylab topma.
3. Birinchi qadam — list_sources chaqirish (qaysi manbalar bor, ustunlari nima ekanini bilish uchun).
4. Hisoblar (sum, avg, count va h.k.) uchun aggregate va group_by vositalaridan foydalan, o'zing sanama.
5. Aniq qiymat qidirish uchun search_rows yoki cross_source_search.
6. Agar birinchi urinishda hech nima topilmasa: BOSHQA strategiyani sinab ko'r:
   - Boshqa kalit so'z (sinonim, qisqa shakl, lower/upper)
   - get_distinct_values bilan qaysi qiymatlar mavjudligini tekshir
   - Boshqa manba/varaqda qidir
7. Faqat 3-5 marta urinishdan keyin baribir topilmasa: "Ushbu ma'lumot mavjud manbalarda topilmadi" deb ayt va NIMALAR mavjudligini ko'rsat.
8. Javobni qisqa, aniq, raqamlar bilan ber. Markdown ishlatishing mumkin (qalin, ro'yxat, jadval).
9. Har raqamning kelib chiqishini ko'rsat: "Qarzdorlik varagidan, jami 247 qator bo'yicha summa".
10. Foydalanuvchi tushunsa shunday yozma: "summasini hisoblayman" o'rniga "Qarzdorlik manbasidan jami yig'indini hisobladim".

Bugungi sana: ${new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })}.`;

/**
 * Asosiy agent.
 * @param {object} opts
 * @param {string} opts.message — foydalanuvchi savoli
 * @param {number} opts.organizationId
 * @param {number} [opts.userId]
 * @param {Array} [opts.history] — oldingi xabarlar [{role, content}]
 * @param {function} [opts.onTool] — har tool chaqiruvida log/UI
 * @param {string} [opts.systemPromptExtra] — qo'shimcha kontekst (masalan "hisobot tayyorla")
 * @returns {Promise<{reply, iterations, toolCalls, provider, model}>}
 */
async function runAgent({ message, organizationId, userId, history = [], onTool, systemPromptExtra }) {
  const cfg = await resolveAiConfig(userId);
  const tools = getToolsForProvider(cfg.provider);

  const fullSystem = systemPromptExtra
    ? SYSTEM_PROMPT + '\n\n' + systemPromptExtra
    : SYSTEM_PROMPT;

  const ctx = { organizationId, userId };
  const toolCalls = [];

  let result;
  if (cfg.provider === 'claude') {
    result = await runClaudeAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool });
  } else if (cfg.provider === 'chatgpt' || cfg.provider === 'deepseek') {
    result = await runOpenAIAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool });
  } else if (cfg.provider === 'gemini') {
    result = await runGeminiAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool });
  } else {
    throw new Error(`Provider qo'llab-quvvatlanmaydi: ${cfg.provider}`);
  }

  return {
    reply: result.reply,
    iterations: result.iterations,
    toolCalls,
    provider: cfg.provider,
    model: cfg.model,
    keySource: cfg.source,
  };
}

// ────────────────────────────────────────────────
// CLAUDE (Anthropic) Tool Use
// ────────────────────────────────────────────────
async function runClaudeAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool }) {
  const messages = [
    ...history.filter(h => h.role !== 'system').map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  let iter = 0;
  let finalText = '';

  while (iter < MAX_ITER) {
    iter++;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: MAX_TOKENS,
        system,
        tools,
        messages,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Claude: ${data.error?.message || res.status}`);

    // Tool use bormi?
    const toolUses = (data.content || []).filter(c => c.type === 'tool_use');
    const textBlocks = (data.content || []).filter(c => c.type === 'text');

    if (toolUses.length === 0) {
      // Tool yo'q — yakuniy javob
      finalText = textBlocks.map(t => t.text).join('\n').trim();
      break;
    }

    // Assistant javobi (tool_use bilan) ni tarixga qo'sh
    messages.push({ role: 'assistant', content: data.content });

    // Har tool chaqiruvni bajarish
    const toolResults = [];
    for (const tu of toolUses) {
      onTool && onTool({ name: tu.name, input: tu.input });
      const result = await executeTool(tu.name, tu.input, ctx);
      toolCalls.push({ name: tu.name, input: tu.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });

    // stop_reason === 'end_turn' bo'lsa lekin tool_use bo'lmasa loop tugaydi (yuqorida)
    // stop_reason === 'tool_use' bo'lsa keyingi iteratsiya
  }

  if (!finalText) finalText = 'Javob bera olmadim — vositalar javobi keldi lekin yakuniy matn yo\'q.';
  return { reply: finalText, iterations: iter };
}

// ────────────────────────────────────────────────
// OpenAI / DeepSeek (Chat Completions + tools)
// ────────────────────────────────────────────────
async function runOpenAIAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool }) {
  const url = (cfg.model || '').startsWith('gpt-')
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.deepseek.com/v1/chat/completions';

  const messages = [
    { role: 'system', content: system },
    ...history.filter(h => h.role !== 'system').map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  let iter = 0;
  let finalText = '';

  while (iter < MAX_ITER) {
    iter++;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: MAX_TOKENS,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`AI: ${data.error?.message || res.status}`);

    const choice = data.choices?.[0];
    if (!choice) break;
    const msg = choice.message;

    // Assistant message ni tarixga qo'sh
    messages.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: msg.tool_calls,
    });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = msg.content || '';
      break;
    }

    // Tool calls ni bajar
    for (const tc of msg.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
      onTool && onTool({ name: tc.function.name, input });
      const result = await executeTool(tc.function.name, input, ctx);
      toolCalls.push({ name: tc.function.name, input, result });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  if (!finalText) finalText = 'Javob bera olmadim.';
  return { reply: finalText, iterations: iter };
}

// ────────────────────────────────────────────────
// Gemini (Function Calling)
// ────────────────────────────────────────────────
async function runGeminiAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;

  const contents = [
    ...history.filter(h => h.role !== 'system').map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let iter = 0;
  let finalText = '';

  while (iter < MAX_ITER) {
    iter++;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools,
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.3 },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Gemini: ${data.error?.message || res.status}`);

    const cand = data.candidates?.[0];
    if (!cand) break;
    const parts = cand.content?.parts || [];

    const fcParts = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text);

    if (fcParts.length === 0) {
      finalText = textParts.map(p => p.text).join('\n');
      break;
    }

    // Modelning javobini tarixga qo'sh
    contents.push({ role: 'model', parts });

    // Funksiyalarni bajar
    const fcResponses = [];
    for (const p of fcParts) {
      const fc = p.functionCall;
      onTool && onTool({ name: fc.name, input: fc.args });
      const result = await executeTool(fc.name, fc.args, ctx);
      toolCalls.push({ name: fc.name, input: fc.args, result });
      fcResponses.push({
        functionResponse: {
          name: fc.name,
          response: { content: result },
        },
      });
    }
    contents.push({ role: 'user', parts: fcResponses });
  }

  if (!finalText) finalText = 'Javob bera olmadim.';
  return { reply: finalText, iterations: iter };
}

module.exports = { runAgent, MAX_ITER };
