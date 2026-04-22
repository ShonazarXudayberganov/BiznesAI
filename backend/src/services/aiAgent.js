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
const userMemory = require('./userMemory');
const pool = require('../db/pool');

// Tool call'ni DB'ga log qiladi (fire-and-forget, xatosiz kechiradi)
function logToolCall({ userId, question, toolName, toolInput, toolOutput, iteration }) {
  if (!userId) return;
  // Output juda katta bo'lishi mumkin — qisqartirib yozamiz
  let outSummary = toolOutput;
  try {
    const json = JSON.stringify(toolOutput);
    if (json.length > 4000) outSummary = { _truncated: true, _size: json.length, preview: json.slice(0, 2000) };
  } catch {}
  pool.query(
    `INSERT INTO agent_tool_calls (user_id, question, tool_name, tool_input, tool_output, iteration)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, String(question || '').slice(0, 1000), toolName, JSON.stringify(toolInput || {}), JSON.stringify(outSummary || {}), iteration || 0]
  ).catch(() => {});
}

const MAX_ITER = 14;         // ko'pi bilan shuncha tool chaqiruv tsikli
const MAX_TOKENS = 8000;     // har javob uchun (batafsil hisobotlar uchun oshirildi)
const FORCE_FINAL_AT = 12;   // shu iteratsiyadan keyin tool chaqirishga ruxsat berilmaydi
const RETRY_ATTEMPTS = 3;    // transient xato uchun urinish soni
const RETRY_DELAY_MS = 1500; // urinishlar orasidagi pauza (exponential backoff)

// SSE stream reader — har "data: ..." qatorini callback'ga beradi
async function readSseStream(res, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    let curEvent = null;
    for (const line of lines) {
      if (line.startsWith('event:')) { curEvent = line.slice(6).trim(); continue; }
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try { onData(JSON.parse(data), curEvent); } catch {}
      }
      if (line === '') curEvent = null;
    }
  }
}

function isTransientError(message) {
  const m = String(message || '').toLowerCase();
  return /high demand|overloaded|rate limit|timeout|quota|503|502|504|temporarily|try again/.test(m);
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientError(e.message) || attempt === RETRY_ATTEMPTS) throw e;
      const wait = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[agent] ${label}: transient xato (${e.message.slice(0, 80)}), ${wait}ms keyin urinish #${attempt + 1}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

const LANG_LABELS = {
  uz: "O'zbek tilida (sizlash, do'stona-professional uslub)",
  ru: 'На русском языке (вежливо, профессионально)',
  en: 'In English (polite, professional tone)',
};

const MAX_TOOL_RESULT_ROWS = 300;   // rows/groups massivida ko'pi bilan
const MAX_TOOL_RESULT_CHARS = 40000; // yakuniy JSON string uchun

function truncateToolResult(result) {
  if (!result || typeof result !== 'object') return result;
  let r = { ...result };
  // rows massivini qisqartir
  if (Array.isArray(r.rows) && r.rows.length > MAX_TOOL_RESULT_ROWS) {
    r._truncated = true;
    r._total_rows = r.rows.length;
    r.rows = r.rows.slice(0, MAX_TOOL_RESULT_ROWS);
  }
  // groups massivini qisqartir
  if (Array.isArray(r.groups) && r.groups.length > MAX_TOOL_RESULT_ROWS) {
    r._truncated = true;
    r._total_groups = r.groups.length;
    r.groups = r.groups.slice(0, MAX_TOOL_RESULT_ROWS);
  }
  // sources massivini qisqartir
  if (Array.isArray(r.sources) && r.sources.length > 80) {
    r._total_sources = r.sources.length;
    r.sources = r.sources.slice(0, 80);
  }
  // Yakuniy char limiti
  let str = JSON.stringify(r);
  if (str.length > MAX_TOOL_RESULT_CHARS) {
    str = str.slice(0, MAX_TOOL_RESULT_CHARS) + '"..._TRUNCATED"}';
  }
  return str;
}

function _NEW_buildSystemPromptCompact({ language = 'uz', responseDepth = 'adaptive', memoryBlock = '' }) {
  const today = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
    { year: 'numeric', month: 'long', day: 'numeric' });

  return `Sen **ANALIX** — C-level darajasidagi AI biznes-tahlilchisan. Bugun: ${today}.
Foydalanuvchiga har doim "**Boss**" deb murojaat qilasan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ ISHLASH TARTIBI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1 → MANBALARNI O'RGAN:** list_sources chaqir. [n=3.8B]=raqam, [d]=sana, []=matn. Qaysi varaqda nima bor — o'zing tushun, so'rama.

**2 → RAQAMLARNI TOP:** 4-6 kalit metrik. Ko'p muqobil ustun sinab ko'r: "Kirim" yo'q → "Summa","Daromad","Tushum" sinab ko'r. aggregate warning "faqat N/M" → boshqa ustun sinab ko'r.

**3 → TAHLIL + QAROR QABUL QILISHGA YORDAM:** Har raqam uchun: holat + sabab + tavsiya. Anomaliyalarni o'zing top.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 HECH QACHON QILMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Qaysi varaqda?" / "Aniqroq ayting" / "Tekshirib ko'raymi?" — O'zing qil
❌ "Ma'lumot topilmadi" deb to'xta — Boshqa yo'l top, qisman natija ber
❌ "Marketingni yaxshilang" kabi umumiy maslahat — Faqat: "Boss, A mahsulot 340M tushum, marja 18% — shu yo'nalishni kuchaytiring"
❌ Savol bilan javob qaytarma

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PROFESSIONAL JAVOB FORMATI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**RAQAM FORMATI:**
• Millionlar: 3,450,000 → **3.45M so'm**
• Milliardlar: 3,800,000,000 → **3.8B so'm**
• Foiz: har raqam yonida trend: **+12.3% ↑** yoki **-8.1% ↓**
• Holat belgisi: 🟢 yaxshi | 🟡 e'tibor kerak | 🔴 muammo

**KPI JADVAL (har tahlilda majburiy):**
| Ko'rsatkich | Joriy | O'tgan davr | O'zgarish | Holat |
|-------------|-------|-------------|-----------|-------|
| Kirim       | 3.77B | 3.36B       | +12.2% ↑  | 🟢    |
| Xarajat     | 2.1B  | 1.9B        | +10.5% ↑  | 🟡    |
| Sof foyda   | 1.67B | 1.46B       | +14.4% ↑  | 🟢    |

**JAVOB STRUKTURASI:**

## 📊 Executive Xulosa
> **Eng muhim 2-3 raqam** — Boss birinchi narsani ko'rsin

## 📈 [Asosiy tahlil nomi]
[KPI jadval + trend tavsifi]

## 🔍 Chuqur Tahlil
[Segment, kategoriya, vaqt bo'yicha breakdown]

## ⚠️ Muammolar va Xavflar *(faqat muammo bo'lsa)*
> 🔴 [Muammo] — **[raqam]** — sabab: [...]

## 💡 Boss uchun Qarorlar
| # | Tavsiya | Asoslanishi | Kutilgan natija |
|---|---------|-------------|-----------------|
| 1 | Aniq harakat | Real raqam | +X% yoki XM so'm |
| 2 | ... | ... | ... |

## 🔮 Prognoz *(agar trend ma'lumot bo'lsa)*
[Keyingi oy/kvartal bashorat — raqam bilan]

---
*📁 Manba: [varaq nomlari] | 🗓 ${today}*

**Qisqa savol (necha, qancha, kim):** Faqat raqam → 1 jumla xulosa → 1 tavsiya. Jadval shart emas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 SAVOL TURLARIGA KO'RA STRATEGIYA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**"Umumiy tahlil" / "Biznes holati":**
list_sources → [Kirim jami + Chiqim jami + Sof foyda + Oylik trend + Top 5 mahsulot/mijoz]
→ Executive Xulosa (3 raqam) + KPI Jadval + Trend grafik tavsifi + Muammolar + 3 ta qaror

**"Strategiya" / "Maslahat":**
list_sources → 5 kalit metrik → "Hozirgi holat" bo'limi + "Mening tavsiyam" bo'limi
→ Har tavsiya = [Real raqam] + [Konkret harakat] + [Kutilgan natija] + [Muddat]

**"X qancha?" / "Nechta?":**
→ Bir aggregate/query → Aniq raqam → Qisqa xulosa + 1 tavsiya

**"Top N":**
→ query_data(groupBy + sum/count + DESC + limit N) → Raqamli jadval + eng yuqori/past tahlil

**"Trend" / "Dinamika":**
→ time_series → O'sish foizi + Grafik tavsifi + Prognoz + Anomaliya (bo'lsa)

**"Muammo nima?":**
→ Kirim vs Chiqim → Trend → Root cause → Aniq yechim

**"Solishtir" / "Taqqosla":**
→ Parallel query → Yon-yoniga jadval → Farq foizi → G'olib/yutqazuvchi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 PROAKTIV TAHLIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

→ Tahlil davomida anomaliya ko'rsang — "⚠️ Boss, men shu narsani ham ko'rdim: [raqam + tavsiya]"
→ Keskin o'zgarish (±20%+), g'ayritabiiy raqam, kirim/chiqim nomuvofiqligini o'zing top
→ Har tahlildan keyin: "Keyingi qadam" tavsiyasini bir jumla bilan qo'sh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇺🇿 USTUN NOMLARI (MUQOBILLARI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kirim=Daromad=Tushum=Income=Summa | Chiqim=Xarajat=Rasxod=Expense
Sotuv=Savdo=Miqdor | Qarz=Nasiya=Balance=Qarzdorlik
Mijoz=Client=Xaridor=FIO | Mahsulot=Tovar=Nomi=Product
Sana=Date=Oy=Vaqt | Naqd=Karta=Click=PayMe=To'lov_turi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Til:** Foydalanuvchi qanday yozsa shunday javob ber.
**Hajm:** ${responseDepth === 'short' ? 'QISQA — raqam + 1 xulosa + 1 tavsiya' : responseDepth === 'detailed' ? 'TO\'LIQ — barcha bo\'limlar, jadvallar, prognoz' : 'MOSLASHUVCHAN — oddiy savol=qisqa, tahlil=to\'liq'}.

${memoryBlock ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 BOSS HAQIDA XOTIRA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${memoryBlock}` : ''}

<!-- confidence: high|medium|low -->
<!-- sources_used: [varaq nomlari] -->`;
}

function buildSystemPrompt({ language = 'uz', responseDepth = 'adaptive', memoryBlock = '' }) {
  const today = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
    { year: 'numeric', month: 'long', day: 'numeric' });

  return `Sen **Analix** — AI biznes-tahlilchi va suhbatdosh yordamchisisan. Foydalanuvchiga har doim **Boss** deb murojaat qilasan. Bugungi sana: ${today}.
**Til:** ${LANG_LABELS[language] || LANG_LABELS.uz}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ ISHLASH TARTIBI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1 → MANBALARNI O'RGAN:** list_sources chaqir. Har ustun: [num, sum=X, N/M to'liq], [date], [text: namuna]. Qaysi varaqda nima bor — o'zing tushun, foydalanuvchidan so'rama.

**2 → ANIQ RAQAM TOP:** Ko'p muqobil ustun sinab ko'r.
   • "Kirim" yo'q → "Daromad", "Tushum", "Summa", "Income" sinab ko'r
   • aggregate warning "faqat N/M" → noto'g'ri ustun, boshqasini sin
   • Ko'p to'lov turi bo'lsa (Naqd+Karta+Click) → umumiy + alohida ko'rsat
   • Murakkab (guruhlash+agregatsiya) → query_data BITTA chaqiruvda
   • Oddiy hisob → aggregate | vaqt trendi → time_series | qidiruv → search_rows

**3 → TAHLIL + QAROR:** Har raqam uchun: holat 🟢🟡🔴 + sabab + tavsiya. Anomaliya bo'lsa o'zing top va ayt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 JAVOB FORMATI (moslashuvchan)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Raqam formati:** 3,450,000 → **3.45M so'm** | 3,800,000,000 → **3.8B so'm** | foiz: **+12.3% ↑** yoki **-8.1% ↓**

**Savol turiga qarab:**

🔹 **Salom / oddiy savol** → 1-2 jumla, tool shart emas
   *"Salom, Boss! Bugun sotuv, moliya yoki boshqa tahlil kerakmi?"*

🔹 **"X qancha?" / "Nechta?"** → aniq raqam + 1 jumla xulosa + 1 tavsiya
   *"Boss, mart oyi kirim: **847.3M so'm** 🟢 (+14% o'tgan oyga nisbatan). Manba: Kassa · 312 qator"*

🔹 **Tahlil / "holati qanday?" / "muammo nima?"** → quyidagi tuzilma:
   ## 📊 [Mavzu]
   Eng muhim 2-3 raqam — Boss birinchi narsani ko'rsin

   **Ko'rsatkichlar** *(faqat kerakli bo'lsa jadval)*
   | Ko'rsatkich | Qiymat | O'zgarish | Holat |
   |-------------|--------|-----------|-------|
   | Kirim | 3.77B | +12.2% ↑ | 🟢 |

   **Tahlil:** trend + sabab + kontekst

   💡 **Tavsiya:** aniq harakat + kutilgan natija
   ⚠️ **Diqqat:** *(faqat muammo bo'lsa)* anomaliya + xavf

🔹 **Top N / Solishtirma** → raqamli jadval + g'olib/yutqazuvchi tahlil

🔹 **Strategiya / Maslahat** → hozirgi holat (real raqam) + konkret harakat + muddat + kutilgan natija

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 HECH QACHON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Qaysi varaqda?" / "Aniqroq ayting" — o'zing qil
❌ "Ma'lumot topilmadi" deb to'xta — boshqa yo'l top
❌ "Marketingni yaxshilang" kabi umumiy maslahat — faqat real raqam bilan asoslab
❌ Raqam o'ylab topma — mavjud ma'lumot asosida javob ber
❌ Foydalanuvchidan ustun nomi yoki varaq nomi so'rama

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇺🇿 USTUN NOMLARI (muqobillari)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kirim=Daromad=Tushum=Prixod=Income=Summa | Chiqim=Xarajat=Rasxod=Expense
Sotuv=Savdo=Miqdor=Sale | Qarz=Nasiya=Balance=Qarzdorlik
Mijoz=Client=Xaridor=FIO | Mahsulot=Tovar=Nomi=Product
Sana=Date=Oy=Vaqt | Naqd=Karta=Click=PayMe=To'lov_turi

Katta sheets (20+ varaq) — NORMAL. Varaq nomidan boshlang: "kirim"→"Kassa","CF"; "qarz"→"Qarzdorlik"; "sotuv"→"Oydan oyga tushum"; "mijoz"→"Guruh royhat"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Noaniq savol** → taxmin qilib boshlang: *"Oxirgi oy deb tushundim, Boss. Mart 2026: ..."*
**Manba ziddiyati** → eng yangi manbani ol, farq 10%+ bo'lsa ogohlantir
**Anomaliya** → so'ralmasa ham qisqacha ayt: *"⚠️ Boss, iyul sotuvda keskin tushish ko'rdim (+38%↓)"*
**Xotira** → muhim fakt aytilsa save_memory chaqir, eslab qolganlarni tabiiy ishlat

**Hajm:** ${responseDepth === 'short' ? 'QISQA — raqam + 1 xulosa + 1 tavsiya' : responseDepth === 'detailed' ? 'TO\'LIQ — barcha bo\'limlar, jadvallar, prognoz' : 'MOSLASHUVCHAN — oddiy savol=qisqa (2-4 jumla), tahlil=to\'liq (max 600 so\'z)'}

**Citation:** Har raqam yonida → *Manba: [Varaq] · ustun: [Ustun]*
**Confidence:** <!-- confidence: high|medium|low --> <!-- sources_used: Varaq1, Varaq2 -->

${memoryBlock ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 BOSS HAQIDA XOTIRA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${memoryBlock}` : ''}`;
}

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
async function runAgent({ message, organizationId, userId, history = [], onTool, onDelta, systemPromptExtra, language }) {
  const cfg = await resolveAiConfig(userId);
  const tools = getToolsForProvider(cfg.provider);

  // Foydalanuvchi sozlamalari + memory
  let settings = { language: language || 'uz', response_depth: 'adaptive', memory_enabled: true };
  let memoryBlock = '';
  try {
    if (userId) {
      const s = await userMemory.getUserSettings(userId);
      settings = { ...settings, ...s };
      if (language) settings.language = language;
      if (settings.memory_enabled) {
        memoryBlock = await userMemory.buildMemoryContext(userId);
      }
    }
  } catch (e) {
    console.warn('[agent] settings/memory load xato:', e.message);
  }

  const basePrompt = buildSystemPrompt({
    language: settings.language,
    responseDepth: settings.response_depth,
    memoryBlock,
  });
  const fullSystem = systemPromptExtra ? basePrompt + '\n\n' + systemPromptExtra : basePrompt;

  const ctx = { organizationId, userId };
  const toolCalls = [];

  let result;
  if (cfg.provider === 'claude') {
    result = await runClaudeAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool, onDelta });
  } else if (cfg.provider === 'chatgpt' || cfg.provider === 'deepseek') {
    result = await runOpenAIAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool, onDelta });
  } else if (cfg.provider === 'gemini') {
    result = await runGeminiAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool, onDelta });
  } else {
    throw new Error(`Provider qo'llab-quvvatlanmaydi: ${cfg.provider}`);
  }

  const meta = parseReplyMeta(result.reply);
  return {
    reply: meta.cleanReply,
    confidence: meta.confidence,
    sourcesUsed: meta.sourcesUsed,
    iterations: result.iterations,
    toolCalls,
    provider: cfg.provider,
    model: cfg.model,
    keySource: cfg.source,
    settings,
  };
}

// Reply ichidan <!-- confidence: X --> va <!-- sources_used: ... --> ni ajratadi
function parseReplyMeta(reply) {
  if (!reply) return { cleanReply: '', confidence: null, sourcesUsed: [] };
  let confidence = null;
  let sourcesUsed = [];
  let clean = reply;

  const cm = clean.match(/<!--\s*confidence:\s*(high|medium|low)\s*-->/i);
  if (cm) { confidence = cm[1].toLowerCase(); clean = clean.replace(cm[0], ''); }

  const sm = clean.match(/<!--\s*sources_used:\s*([^-]+?)\s*-->/i);
  if (sm) {
    sourcesUsed = sm[1].split(',').map(s => s.trim()).filter(Boolean);
    clean = clean.replace(sm[0], '');
  }
  return { cleanReply: clean.trim(), confidence, sourcesUsed };
}

// ────────────────────────────────────────────────
// CLAUDE (Anthropic) Tool Use — streaming
// ────────────────────────────────────────────────
async function runClaudeAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool, onDelta }) {
  const messages = [
    ...history.filter(h => h.role !== 'system').map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  let iter = 0;
  let finalText = '';

  while (iter < MAX_ITER) {
    iter++;
    const isFinalIter = iter >= FORCE_FINAL_AT;
    const body = {
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: isFinalIter
        ? system + `\n\n=== YAKUNIY JAVOB QADAMI ===
Endi siz vosita chaqira olmaysiz. Hozirgacha to'plagan ma'lumot bilan TO'LIQ FOYDALI JAVOB ber.

Hatto savolga to'liq javob bera olmasangiz ham, KAMIDA quyidagilarni qiling:
1. Qaysi manbalarda qidirganingizni va NIMA TOPGANINGIZNI ayting
2. Topilgan har raqamni qaytaring (qisman bo'lsa ham foydali)
3. Mavjud ma'lumotlardan QO'SHIMCHA nimalarni taklif qilishingiz mumkinligini yozing
4. "Javob bera olmadim" deb tushinmang — bu mumkin emas`
        : system,
      messages,
    };
    if (!isFinalIter) body.tools = tools;

    // Stream Claude SSE: content_block_start/delta/stop eventlarini kuzatamiz.
    // Text bloklari onDelta orqali uzatiladi. Tool_use bloklari yig'iladi.
    const contentBlocks = []; // index -> { type, text? | name,id,input_json_partial? }
    const data = await withRetry(async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(`Claude: ${d.error?.message || res.status}`);
      }

      // Reset blocks for this iteration
      contentBlocks.length = 0;
      let streamErr = null;
      let stopReason = null;

      await readSseStream(res, (payload, event) => {
        const type = payload.type;
        if (type === 'content_block_start') {
          const b = payload.content_block || {};
          contentBlocks[payload.index] = {
            type: b.type,
            text: b.type === 'text' ? '' : undefined,
            name: b.name,
            id: b.id,
            input: b.type === 'tool_use' ? {} : undefined,
            _jsonBuf: b.type === 'tool_use' ? '' : undefined,
          };
        } else if (type === 'content_block_delta') {
          const blk = contentBlocks[payload.index];
          if (!blk) return;
          const d = payload.delta || {};
          if (d.type === 'text_delta' && typeof d.text === 'string') {
            blk.text += d.text;
            if (onDelta) onDelta(d.text);
          } else if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
            blk._jsonBuf += d.partial_json;
          }
        } else if (type === 'content_block_stop') {
          const blk = contentBlocks[payload.index];
          if (blk && blk.type === 'tool_use') {
            try { blk.input = JSON.parse(blk._jsonBuf || '{}'); } catch { blk.input = {}; }
          }
        } else if (type === 'message_delta') {
          stopReason = payload.delta?.stop_reason || null;
        } else if (type === 'error') {
          streamErr = payload.error?.message || 'Claude stream xato';
        }
      });

      if (streamErr) throw new Error(`Claude: ${streamErr}`);

      // Assistant content format for next round
      return {
        content: contentBlocks.filter(Boolean).map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
          return null;
        }).filter(Boolean),
        stopReason,
      };
    }, 'claude');

    // max_tokens bilan to'xtaganda — tashqi while loopda davom ettirish
    if (data.stopReason === 'max_tokens') {
      const textSoFar = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      if (textSoFar && onDelta) onDelta('\n\n');
      messages.push({ role: 'assistant', content: data.content || [] });
      messages.push({ role: 'user', content: 'Davom et, javobni to\'liq yoz.' });
      continue;
    }

    const toolUses = (data.content || []).filter(c => c.type === 'tool_use');
    const textBlocks = (data.content || []).filter(c => c.type === 'text');

    if (toolUses.length === 0 || isFinalIter) {
      finalText = textBlocks.map(t => t.text).join('\n').trim();
      if (finalText) break;
    }

    messages.push({ role: 'assistant', content: data.content });

    const toolResults = [];
    for (const tu of toolUses) {
      onTool && onTool({ name: tu.name, input: tu.input });
      const result = await executeTool(tu.name, tu.input, ctx);
      toolCalls.push({ name: tu.name, input: tu.input, result });
      logToolCall({ userId: ctx.userId, question: message, toolName: tu.name, toolInput: tu.input, toolOutput: result, iteration: iter });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: truncateToolResult(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (!finalText) {
    // Hech narsa qaytmagani — vositalar natijasini ko'rsatamiz
    if (toolCalls.length > 0) {
      const summary = toolCalls.map(tc => {
        const name = tc.name;
        const r = tc.result;
        if (r?.error) return `❌ ${name}: ${r.error}`;
        if (r?.value !== undefined) return `✓ ${name}: ${r.value}${r.column ? ' (' + r.column + ')' : ''}`;
        if (Array.isArray(r?.rows)) return `✓ ${name}: ${r.rows.length} qator topildi`;
        if (Array.isArray(r?.groups)) return `✓ ${name}: ${r.groups.length} guruh topildi`;
        return `✓ ${name}: bajarildi`;
      }).join('\n');
      finalText = `Quyidagi ma'lumotlarni topdim:\n\n${summary}\n\n_AI yakuniy javob tayyorlamadi — savolni boshqacharoq berib ko'ring._`;
    } else {
      finalText = 'Savolni qayta tahrirlab yuborib ko\'ring — masalan aniqroq ustun yoki manba nomi bilan.';
    }
  }
  return { reply: finalText, iterations: iter };
}

// ────────────────────────────────────────────────
// OpenAI / DeepSeek (Chat Completions + tools) — streaming
// ────────────────────────────────────────────────
async function runOpenAIAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool, onDelta }) {
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
    const isFinalIter = iter >= FORCE_FINAL_AT;
    const body = {
      model: cfg.model,
      stream: true,
      messages: isFinalIter
        ? [...messages, { role: 'user', content: 'YAKUNIY JAVOB BER: hozirgacha to\'plagan ma\'lumotlar bilan to\'liq foydali javob yoz. Boshqa vosita chaqirish kerak emas.' }]
        : messages,
      max_tokens: MAX_TOKENS,
    };
    if (!isFinalIter) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const msg = await withRetry(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(`AI: ${d.error?.message || res.status}`);
      }

      // OpenAI/DeepSeek delta formati:
      //   choices[0].delta.content   → matn qismi
      //   choices[0].delta.tool_calls[i] → { index, id, function: { name, arguments } } (arguments qism-qism keladi)
      let content = '';
      let finishReason = null;
      const tcAccum = [];  // index-based accumulator

      await readSseStream(res, (chunk) => {
        const choice = chunk.choices?.[0];
        if (!choice) return;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) return;
        if (typeof delta.content === 'string' && delta.content) {
          content += delta.content;
          if (onDelta) onDelta(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!tcAccum[idx]) tcAccum[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (tc.id) tcAccum[idx].id = tc.id;
            if (tc.type) tcAccum[idx].type = tc.type;
            if (tc.function?.name) tcAccum[idx].function.name += tc.function.name;
            if (tc.function?.arguments) tcAccum[idx].function.arguments += tc.function.arguments;
          }
        }
      });

      return { content, finishReason, tool_calls: tcAccum.filter(Boolean) };
    }, 'openai');

    // max_tokens ga yetib to'xtagan bo'lsa — davom ettir
    if (msg.finishReason === 'length') {
      if (onDelta) onDelta('\n');
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls?.length ? msg.tool_calls : undefined });
      messages.push({ role: 'user', content: "Davom et, javobni to'liq yoz." });
      finalText = (finalText || '') + (msg.content || '');
      continue;
    }

    if (isFinalIter || !msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = (finalText || '') + (msg.content || '');
      if (finalText) break;
    }

    messages.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: msg.tool_calls,
    });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = msg.content || '';
      break;
    }

    for (const tc of msg.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
      onTool && onTool({ name: tc.function.name, input });
      const result = await executeTool(tc.function.name, input, ctx);
      toolCalls.push({ name: tc.function.name, input, result });
      logToolCall({ userId: ctx.userId, question: message, toolName: tc.function.name, toolInput: input, toolOutput: result, iteration: iter });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: truncateToolResult(result),
      });
    }
  }

  if (!finalText) {
    // Hech narsa qaytmagani — vositalar natijasini ko'rsatamiz
    if (toolCalls.length > 0) {
      const summary = toolCalls.map(tc => {
        const name = tc.name;
        const r = tc.result;
        if (r?.error) return `❌ ${name}: ${r.error}`;
        if (r?.value !== undefined) return `✓ ${name}: ${r.value}${r.column ? ' (' + r.column + ')' : ''}`;
        if (Array.isArray(r?.rows)) return `✓ ${name}: ${r.rows.length} qator topildi`;
        if (Array.isArray(r?.groups)) return `✓ ${name}: ${r.groups.length} guruh topildi`;
        return `✓ ${name}: bajarildi`;
      }).join('\n');
      finalText = `Quyidagi ma'lumotlarni topdim:\n\n${summary}\n\n_AI yakuniy javob tayyorlamadi — savolni boshqacharoq berib ko'ring._`;
    } else {
      finalText = 'Savolni qayta tahrirlab yuborib ko\'ring — masalan aniqroq ustun yoki manba nomi bilan.';
    }
  }
  return { reply: finalText, iterations: iter };
}

// ────────────────────────────────────────────────
// Gemini (Function Calling)
// ────────────────────────────────────────────────
// Bepul tier'da gemini-2.5-flash tez-tez overload bo'ladi tool use bilan.
// Fallback ketma-ketligi: flash → pro → flash-lite (tool'siz).
const GEMINI_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];

async function runGeminiAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool, onDelta }) {
  // Joriy modelni boshlanish nuqtasi qilamiz, keyin agar overload bo'lsa fallback'ga o'tamiz
  let currentModel = cfg.model;
  let modelIdx = GEMINI_FALLBACKS.indexOf(currentModel);
  if (modelIdx === -1) modelIdx = 0;

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
    let data;
    try {
      data = await withRetry(async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:streamGenerateContent?alt=sse&key=${cfg.apiKey}`;
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
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(`Gemini: ${d.error?.message || res.status}`);
        }
        // Gemini stream: har data: {candidates:[{content:{parts:[{text: "..."} | {functionCall: {...}}]}}]}
        const mergedParts = [];
        await readSseStream(res, (chunk) => {
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (typeof p.text === 'string' && p.text) {
              if (onDelta) onDelta(p.text);
              // text part'larni birlashtirib boramiz
              const last = mergedParts[mergedParts.length - 1];
              if (last && typeof last.text === 'string') last.text += p.text;
              else mergedParts.push({ text: p.text });
            } else if (p.functionCall) {
              mergedParts.push({ functionCall: p.functionCall });
            }
          }
        });
        return { candidates: [{ content: { parts: mergedParts } }] };
      }, `gemini-${currentModel}`);
    } catch (e) {
      // Overload bo'lsa fallback modelga o'tish
      if (isTransientError(e.message) && modelIdx + 1 < GEMINI_FALLBACKS.length) {
        modelIdx++;
        currentModel = GEMINI_FALLBACKS[modelIdx];
        console.warn(`[gemini] ${currentModel}'ga fallback`);
        iter--;  // qayta urinish (iteratsiyani sarflamaymiz)
        continue;
      }
      throw e;
    }

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
      logToolCall({ userId: ctx.userId, question: message, toolName: fc.name, toolInput: fc.args, toolOutput: result, iteration: iter });
      fcResponses.push({
        functionResponse: {
          name: fc.name,
          response: { content: truncateToolResult(result) },
        },
      });
    }
    contents.push({ role: 'user', parts: fcResponses });
  }

  if (!finalText) finalText = 'Javob bera olmadim.';
  return { reply: finalText, iterations: iter };
}

module.exports = { runAgent, MAX_ITER, buildSystemPrompt, parseReplyMeta };
