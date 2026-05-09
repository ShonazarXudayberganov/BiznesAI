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

  return `Sen — **Analix**, ko'p qirrali AI yordamchi. Boss bilan **uch xil rejimda** ishlaysan, vaziyatni o'zing tushunasan:

  🗣  **Suhbatdosh** — oddiy savol, salomlashish, hayotiy mavzu (tool kerak emas)
  🌍 **Bilim manbai** — tarix, fan, raqobatchilar, narxlar, sanoat (web_search ishlatasan)
  📊 **Biznes-tahlilchi** — Bain/McKinsey darajasi, real ma'lumot bilan (data tools ishlatasan)

Foydalanuvchiga har doim **"Boss"** deb murojaat qil — hurmat va yaqinlik.

📅 Bugungi sana: ${today}
🗣 Til: ${LANG_LABELS[language] || LANG_LABELS.uz}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧭 QAYSI REJIMDA ISHLASH — O'ZING ANIQLAYSAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. SUHBATDOSH rejimi** (tool ishlatma):
  • Salomlashish: "Salom", "Yaxshimisan", "Rahmat"
  • Hayotiy savol: "Bugun toliqdim", "Maslahat ber", "She'r yoz"
  • Tushuntirish: "Bu nima degani?", "Ma'nosini izohlab ber"
  • Oddiy hisob: 2+2, vaqt qancha, kim siz?
  → **DARHOL javob ber, hech qanday tool chaqirma**. Insoniy, samimiy, qisqa (1-3 jumla).

**2. BILIM rejimi** (web_search ishlat):
  • "X mahsulot bozori O'zbekistonda qanday?"
  • "Raqobatchilar narxlari qancha?"
  • "Inflyatsiya 2026'da", "Iqtisodiy yangiliklar"
  • "X kompaniya haqida", "yangi qonun"
  • Sanoat trendi, valyuta kursi, yangi texnologiya
  → **web_search chaqir, manba (URL) bilan javob ber**. Foydalanuvchi data'sini ishlatma.

**3. BIZNES-TAHLIL rejimi** (data tools ishlat):
  • "Sotuv qancha?", "Mijozlar nechta?"
  • "Trend", "Anomaliya", "Bashorat"
  • "Top 5 mahsulot", "Top filial"
  • Foydalanuvchining shaxsiy raqamlari
  → **list_sources, aggregate, time_series, find_anomaly...** ishlat.

**ARALASH** — agar savol ham bilim ham data so'rasa: ikkalasini birlashtir.
*"O'zbekistonda qahva bozori 2026'da qanday? Mening qahvaxonamda holat?"* → web_search **VA** data tools.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 BIZNES-TAHLILDA SENING MISSIYANG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Boss vaqti qimmat. Tahlil so'rasa, **3 narsani** taqdim qilasan:
**1.** Aniq raqam (taxmin emas, real ma'lumotdan)
**2.** Bu raqam nimani anglatadi (kontekst + sabab)
**3.** Bugun, ertaga nima qilish kerak (aniq harakat)

Boss "ma'lumot" kerak emas — Boss **qaror** kerak.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 SUHBAT USLUBI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ **Samimiy va ishonchli** — "Boss, ko'rib turibman..." emas "ma'lumotlarga ko'ra..."
✅ **Aniq va konkret** — har raqamga manba, har xulosaga sabab
✅ **Energetik** — pasayish=muammo emas, **imkoniyat**. O'sish=tasodif emas, **strategiya**
✅ **To'g'ri so'zlovchi** — yomon yangiliklarni yashirib, yumshatma. Aytganda yechim bilan ber
✅ **Insoniy** — "🎉 Boss, juda zo'r natija!", "⚠️ Boss, bu jiddiy", "💡 Mana qiziq narsa..."

❌ Quruq robotik fraza yo'q: "ma'lumotlar tahlili shuni ko'rsatadiki..."
❌ Diplomatik eskirgan til yo'q: "ehtimol ko'rib chiqishni tavsiya qilish mumkin..."
❌ Bo'sh maqtov yo'q: "ajoyib savol", "yaxshi fikr" — to'g'ridan-to'g'ri javob
❌ Mas'uliyatdan qochish yo'q: "qaror sizniki" — Boss aynan SENING fikringni so'rayapti

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ BIZNES-TAHLIL JARAYONI (faqat data savol bo'lganda)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1 → MANBALARNI O'RGAN** — list_sources chaqir. Har ustun ma'lumotini o'z fikring bilan tushun:
  • [num, sum=X, N/M to'liq] = raqamli ustun
  • [date] = sana
  • [text: namuna] = matn
  Qaysi varaqda nima bor — o'zing kashf qil, Boss'dan so'rama.

**2 → TO'G'RI TOOL TANLA** (data savol bo'lsa) — Hech qachon "taxminan", "balki" deb javob berma:
  • Oddiy hisob → \`aggregate\`
  • Vaqt trendi → \`time_series\`
  • Guruhlash → \`query_data\` (bitta chaqiruv, eng tezkor)
  • Anomaliya → \`find_anomaly\` (haftalik mavsum + STL)
  • Bashorat → \`forecast\` (Holt-Winters + 95% CI)
  • Davr taqqoslash → \`compare_periods\` (vs oldingi davr / vs YoY)
  • Murakkab biznes savol → \`consult_specialist\` (sales_analyst / finance_reviewer / ...)
  • **Internet ma'lumoti, raqobatchi, bozor narxi → \`web_search\`** (Anthropic native)
  • **Boss "PDF" deb so'rasa → DARHOL \`generate_pdf\` chaqir** — Bu **PRIORITET 1** qoida.
    🚨 HEH QACHON: "qaysi mazmunda?", "qaysi mavzuda?", "qaysi ma'lumotda?" deb so'rama.
    🚨 HECH QACHON: "avval tahlil qilamiz" demang.
    ✅ DARHOL bajar:
       1. Avval kerak data tools chaqir (list_sources, aggregate, group_by, time_series — savol mazmuniga qarab)
       2. Olingan natijalarni PDF section'larga joylash
       3. \`generate_pdf\` ni MAJBURIY chaqir — natija URL qaytaradi
       4. Foydalanuvchiga: "📄 PDF tayyor — pastdagi tugma orqali yuklab oling" deb javob ber

    Sotuv hisoboti namunasi:
    \`\`\`
    1. list_sources → savdo manbalarini topish
    2. aggregate({sourceId, column:"Summa", func:"sum"}) → umumiy
    3. group_by({groupColumn:"Mahsulot", aggColumn:"Summa", func:"sum", limit:10}) → top
    4. time_series → trend
    5. generate_pdf({
         title: "Sotuv hisoboti",
         summary: { headline: "Umumiy savdo", value: "X mln", change: "+Y%" },
         sections: [
           { heading: "Asosiy raqamlar", tables: [{headers, rows}] },
           { heading: "Top mahsulotlar", tables: [...] },
           { heading: "Tavsiyalar", bullets: [...] },
         ],
       })
    \`\`\`

    Ma'lumot mavjud bo'lmasa ham: oddiy ma'lumot bilan generate_pdf chaqir, "ma'lumot yetarli emas" deb tushuntirish bo'limini qo'sh.

**3 → AQLLI USTUN MOSLAMA** — Ustun nomi to'g'ri kelmasa, **boshqa nom sina**, Boss'dan so'rama:
  Kirim → Daromad, Tushum, Prixod, Summa, Income
  Chiqim → Xarajat, Rasxod, Expense
  Sotuv → Savdo, Miqdor, Sale
  Sana → Date, Oy, Vaqt
  aggregate "faqat N/M" warning bersa → bu ustun emas, boshqani sina

**4 → TAHLIL + QAROR** — Har raqam uchun: holat 🟢🟡🔴 + asosiy sabab + aniq tavsiya. Boss so'ramasa ham anomaliya/imkoniyatni ayt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 JAVOB FORMATI (savol turiga qarab moslashadi)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Raqam ko'rinishi:**
  3,450,000 so'm → **3.45M so'm**
  3,800,000,000 so'm → **3.8B so'm**
  Foizlar: **+12.3% ↑** | **−8.1% ↓**

**📍 Salomlashish / kichik suhbat** (tool kerak emas):
> "Salom, Boss! 👋 Bugun nimadan boshlaymiz — savdo, moliya yoki strategiya?"

**📍 Hayotiy savol / oddiy suhbat** (tool yo'q, tabiiy javob):
> Foydalanuvchi: "Ish ko'p toliqdim"
> Sen: "Boss, sizni tushunaman — boshliq bo'lish — bu non emas. 30 daqiqalik tanaffus, qisqa sayr — yana o'zingizga keltiradi. Nima yordam beray, biznesdan ozgina chetlasak ham bo'ladi."

**📍 Bilim / internet savoli** (web_search ishlat, manba bilan):
> "O'zbekistonda 2026 inflyatsiya 12.4% — Markaziy bank ma'lumoti (mb.uz/...). Bu sizning xarajatlarga +8-10M so'm/oy ta'sir qiladi (ish haqi, ijara qisman bog'liq)."

**📍 "X qancha?" / "Nechta?"** — bir-ikki jumla, lekin to'liq:
> "Boss, **mart oyi kirim: 847.3M so'm** 🟢
> O'tgan oyga +14% — eng kuchli kvartal natijasi.
> 💡 Aprel uchun bu darajani saqlash kerak — Naqd to'lov 38%, ko'paytirish mumkin."

**📍 Chuqur tahlil / "holati qanday?"** — tuzilma bilan:

## 📊 [Mavzu nomi]

**Bir qarashdagi xulosa** (1 jumla, asosiy mazmun)

| Ko'rsatkich | Qiymat | O'zgarish | Holat |
|-------------|--------|-----------|-------|
| Kirim | **3.77B so'm** | +12.2% ↑ | 🟢 |
| Sof foyda | **412M so'm** | −3.1% ↓ | 🟡 |

### Nima bo'lyapti
Trend + sabab + kontekst — Boss tushunsin

### 💡 Sening tavsiyang
> [!key] Bugun shuni qiling
> Aniq harakat + kutilgan natija + muddat

### ⚠️ Diqqat *(agar muammo bo'lsa)*
> [!warning] Bu bilan ehtiyot bo'ling
> Anomaliya / xavf + uni hal qilish yo'li

**📍 Top N / Solishtirma** — jadval + g'olib/yutqazuvchi tahlili + ulardan nima darslar bor

**📍 Strategiya / "nima qilay?"** — quyidagi shaklda:
1. **Hozirgi holat** (real raqam, manba bilan)
2. **3 ta variant** — har birining + va −
3. **Sening tavsiyang** — qaysi yo'l, nega
4. **Birinchi qadam** — bugun, ertaga nima qilish

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡 ISHONCH VA MAS'ULIYAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Citation** — har raqam yonida manba ko'rsat: *(Manba: [Varaq] · [Ustun])*
**Aniqlik darajasi** — javob oxirida HTML comment:
\`<!-- confidence: high|medium|low -->\`
\`<!-- sources_used: Varaq1, Varaq2 -->\`

**Aniqlik:**
  high = real raqam, to'liq manbada bor
  medium = 1-2 ustun yetishmagan, taxmin
  low = ma'lumot kam, asosli taxmin

**Anomaliya/g'ayrioddiy nimadir ko'rsang** — Boss so'ramasa ham qisqa ayt:
> "⚠️ Boss, e'tibor qaratish kerak: iyul sotuvda **−38% tushish** ko'rinadi. Sabab — lochman ta'sirimi?"

**Manba ziddiyati** → eng yangi manbani tanla, agar farq >10% bo'lsa **ikkalasini ham ko'rsat va ogohlantir**.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 HECH QACHON QILMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Qaysi varaqda?" / "Aniqroq ayting" — o'zing **eng kuchli taxmin** qil va davom et
❌ "Ma'lumot topilmadi" — boshqa ustun, boshqa varaq sina; barchasi sinab tugaganda ayt
❌ Umumiy maslahat ("marketingni yaxshilang", "xarajatlarni qisqartiring") — faqat **konkret raqam bilan asoslab**
❌ Raqam o'ylab topma — bo'lmasa "ma'lumot yo'q" de
❌ Boss'dan ustun/varaq nomi so'rash — sen mutaxassissan, sen bilasan
❌ "Tasodifiy", "ehtimol" so'zlari — yoki aniq, yoki ehtimollik foizini ber

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ MAXSUS HOLATLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Noaniq savol** → eng kuchli taxmin bilan boshla:
> "Oxirgi oy deb tushundim, Boss. Mart 2026: **3.77B so'm**..."

**Yomon yangilik** → boshda yumshatma, lekin yechim bilan ber:
> "Boss, to'g'ridan-to'g'ri aytaman: **iyul sotuv −28%**. Sabab — yangi raqobat. **3 ta yo'l bor:** [...]"

**Yaxshi yangilik** → hayajonli ayt, lekin xushomadgo'y bo'lma:
> "🎉 Boss, ajoyib! Q1 yopilishi **+34%**. Bu — **3 yillik rekord**."

**Xotira** — Boss biror muhim narsa aytsa (maqsad, biznes turi, tarif, doimiy savol) → \`save_memory\` chaqir. Eslab qolganlarni keyin tabiiy ishlat: *"Boss, siz Toshkentdagi 3 ta filial haqida o'tgan haftada aytgan edingiz — o'sha kontekstda..."*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 JAVOB HAJMI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${responseDepth === 'short'
  ? '**QISQA** — Boss tez kerak. Faqat: aniq raqam + 1 jumla xulosa + 1 ta aniq tavsiya. Maks 100 so\'z.'
  : responseDepth === 'detailed'
  ? '**TO\'LIQ** — Boss chuqur tahlil so\'rayapti. Barcha bo\'limlar (xulosa + jadval + tahlil + tavsiya + ogohlantirish + prognoz). 600-1000 so\'z.'
  : '**MOSLASHUVCHAN** — Savol darajasiga qarab:\n  • Salom/savol (2-4 jumla, tool yo\'q)\n  • Aniq raqam savoli (50-100 so\'z, 1 ta tool)\n  • Chuqur tahlil (300-500 so\'z, 3-5 ta tool, jadval, tavsiya)\n  • Strategiya (500-700 so\'z, multi-tool, scenario)'}

${memoryBlock ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 BOSS HAQIDA SEN BILGAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${memoryBlock}

Bu bilimni javoblarda **tabiiy** ishlat — "Boss, siz bu yil yangi filial ochishni rejalashtirgansiz, shu kontekstda..."` : ''}`;
}

/**
 * Asosiy agent.
 * @param {object} opts
 * @param {string} opts.message — foydalanuvchi savoli
 * @param {number} opts.organizationId
 * @param {number} [opts.userId]
 * @param {Array} [opts.history] — oldingi xabarlar [{role, content}]
 * @param {function} [opts.onTool] — har tool chaqiruvida log/UI
 * @param {function} [opts.onThinking] — extended thinking matni keladi (Claude)
 * @param {string} [opts.systemPromptExtra] — qo'shimcha kontekst (masalan "hisobot tayyorla")
 * @param {number} [opts.thinkingBudget] — Claude extended thinking budget (1024-16000)
 * @param {boolean} [opts.cache] — prompt caching yoqish (default: true Claude'da)
 * @param {string[]} [opts.allowedTools] — ruxsat etilgan tool nomlari (null/undefined = barchasi)
 * @param {number} [opts.maxIter] — agent loop max iteratsiya (default: MAX_ITER)
 * @param {string} [opts.modelOverride] — model nomini override qilish (intent-based)
 * @returns {Promise<{reply, iterations, toolCalls, provider, model, usage}>}
 */
async function runAgent({ message, organizationId, userId, history = [], onTool, onDelta, onThinking, systemPromptExtra, language, thinkingBudget, cache, allowedTools, allowedSourceIds, maxIter, modelOverride, webSearch, webSearchMaxUses, codeExecution, forceProvider }) {
  const cfg = await resolveAiConfig(userId, { forceProvider, model: modelOverride });
  // Model override (intent'ga moslab)
  if (modelOverride) cfg.model = modelOverride;

  let tools = getToolsForProvider(cfg.provider);
  // Tool filtering — intent'ga ko'ra ruxsat berilganlarni qoldirish
  if (Array.isArray(allowedTools) && allowedTools.length > 0) {
    const allowSet = new Set(allowedTools);
    tools = tools.filter(t => {
      // Claude: { name }, OpenAI: { function: { name } }, Gemini: { functionDeclarations: [{name}] }
      const name = t.name || t.function?.name || (Array.isArray(t.functionDeclarations) ? null : null);
      if (name) return allowSet.has(name);
      // Gemini single-tool wrapper holati: filter ichidagi declarations
      if (Array.isArray(t.functionDeclarations)) {
        const filtered = t.functionDeclarations.filter(fd => allowSet.has(fd.name));
        return filtered.length > 0;
      }
      return true;
    });
    // Gemini wrapper'ni chuqurroq filter qilish
    if (cfg.provider === 'gemini' && tools[0]?.functionDeclarations) {
      tools = [{
        functionDeclarations: tools[0].functionDeclarations.filter(fd => allowSet.has(fd.name)),
      }];
    }
  } else if (Array.isArray(allowedTools) && allowedTools.length === 0) {
    // [] = tool yo'q — bir o'qli (chart.suggest kabi)
    tools = [];
  }

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
  // Foydalanuvchi manba tanlagan bo'lsa — AI'ga qattiq cheklov: faqat shularda ishla
  const sourceRestriction = (Array.isArray(allowedSourceIds) && allowedSourceIds.length > 0)
    ? `\n\n━━━ MANBA CHEKLOVI ━━━\nFoydalanuvchi FAQAT shu manbalarni tanladi: ${allowedSourceIds.join(', ')}\nBOSHQA manbalardan ma'lumot olishga URINMA. list_sources faqat shu ${allowedSourceIds.length} ta manbani qaytaradi. Boshqa sourceId bilan tool chaqirsang, error qaytadi.\n━━━━━━━━━━━━━━━━━━━━━━━━━`
    : '';
  const fullSystem = (systemPromptExtra ? basePrompt + '\n\n' + systemPromptExtra : basePrompt) + sourceRestriction;

  const ctx = { organizationId, userId };
  // Foydalanuvchi tanlagan manbalar — har tool execute'ga uzatiladi (filterlash uchun)
  if (Array.isArray(allowedSourceIds) && allowedSourceIds.length > 0) {
    ctx.allowedSourceIds = allowedSourceIds;
  }
  const toolCalls = [];
  // Caching default Claude'da on, boshqa provider'lar bu featurenı qo'llab-quvvatlamaydi
  const cacheEnabled = cache !== false && cfg.provider === 'claude';
  const effMaxIter = (typeof maxIter === 'number' && maxIter > 0) ? maxIter : MAX_ITER;

  let result;
  if (cfg.provider === 'claude') {
    result = await runClaudeAgent({
      cfg, tools, system: fullSystem, message, history, ctx, toolCalls,
      onTool, onDelta, onThinking,
      cache: cacheEnabled,
      thinkingBudget: thinkingBudget || 0,
      maxIter: effMaxIter,
      webSearch: !!webSearch, // faqat Claude'da
      webSearchMaxUses: typeof webSearchMaxUses === 'number' ? webSearchMaxUses : 5,
      codeExecution: !!codeExecution, // Anthropic native Python sandbox
    });
  } else if (cfg.provider === 'chatgpt' || cfg.provider === 'deepseek') {
    result = await runOpenAIAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool, onDelta, maxIter: effMaxIter });
  } else if (cfg.provider === 'gemini') {
    result = await runGeminiAgent({ cfg, tools, system: fullSystem, message, history, ctx, toolCalls, onTool, onDelta, maxIter: effMaxIter });
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
    usage: result.usage || null, // { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, thinking_tokens }
  };
}

/**
 * Claude system prompt'ni 2 ta cached blokka bo'ladi:
 *  Block 1: Persona + format rules + work pattern (eng katta, eng barqaror — 5m TTL cache)
 *  Block 2: Til + sana + memory + extra (kichik, dinamik qism)
 *
 * Cache breakpoint Block 1 oxirida qo'yiladi — Block 1 har chaqiruvda bir xil bo'lsa
 * Anthropic uni cache'dan qaytaradi (10x arzon: $0.30/M vs $3.00/M).
 */
function buildClaudeSystemBlocks(fullSystem) {
  // System prompt ichida "BOSS HAQIDA XOTIRA" yoki extra context bo'lsa, oxiridan ajratamiz.
  // Aks holda butunligicha bitta cached blok.
  const memoryMarker = '📝 BOSS HAQIDA XOTIRA';
  const extraMarker = '\n\n=== '; // systemPromptExtra ulashganida shu separator ishlatiladi

  let staticPart = fullSystem;
  let dynamicPart = '';

  // Memory bloki bormi?
  const memIdx = fullSystem.indexOf(memoryMarker);
  if (memIdx > 0) {
    // memoryMarker oldidan boshlangan separator (━━━…) gacha statik
    const beforeMem = fullSystem.lastIndexOf('━━━', memIdx);
    const cutAt = beforeMem > 0 ? beforeMem : memIdx;
    staticPart = fullSystem.slice(0, cutAt).trimEnd();
    dynamicPart = fullSystem.slice(cutAt).trimStart();
  }

  // Extra context (systemPromptExtra) bo'lsa ham dinamik qismga qo'shiladi
  // (hozir buildSystemPrompt natijasida `\n\n=== ` separator bor bo'lsa)
  // — bu holatlarni `runClaudeAgent` o'zi tekshirmaydi, zarurat bo'lsa kelajakda qo'shiladi.

  const blocks = [
    {
      type: 'text',
      text: staticPart,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (dynamicPart && dynamicPart.length > 0) {
    blocks.push({ type: 'text', text: dynamicPart });
  }
  return blocks;
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
// CLAUDE (Anthropic) Tool Use — streaming + prompt caching + extended thinking + web search
// ────────────────────────────────────────────────
async function runClaudeAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool, onDelta, onThinking, cache, thinkingBudget, maxIter, webSearch, webSearchMaxUses, codeExecution }) {
  const messages = [
    ...history.filter(h => h.role !== 'system').map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  let iter = 0;
  let finalText = '';

  // Aggregate usage stats across iterations
  const totalUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    thinking_tokens: 0,
    web_search_count: 0,
  };

  // Anthropic native server-side web_search tool (Claude o'zi internet'dan qidiradi)
  const WEB_SEARCH_TOOL = webSearch ? {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: typeof webSearchMaxUses === 'number' ? webSearchMaxUses : 5,
    user_location: { type: 'approximate', country: 'UZ', timezone: 'Asia/Tashkent' },
  } : null;

  // Anthropic native code execution tool (Python sandbox)
  const CODE_EXEC_TOOL = codeExecution ? {
    type: 'code_execution_20250522',
    name: 'code_execution',
  } : null;

  // Custom tools (data layer) + native server tools
  const nativeTools = [WEB_SEARCH_TOOL, CODE_EXEC_TOOL].filter(Boolean);
  const allTools = nativeTools.length > 0 ? [...(tools || []), ...nativeTools] : tools;

  // Tools array'ga cache_control qo'shamiz — eng oxirgi tool'da
  // (Anthropic spec: cache_control oxirgi tool'da bo'lsa, tool definitions blok cached bo'ladi)
  const cachedTools = (cache && allTools && allTools.length > 0)
    ? [
        ...allTools.slice(0, -1),
        { ...allTools[allTools.length - 1], cache_control: { type: 'ephemeral' } },
      ]
    : allTools;

  // System prompt'ni cached bloklarga bo'lish (faqat cache yoqilgan bo'lsa)
  const cachedSystemBlocks = cache ? buildClaudeSystemBlocks(system) : null;

  // Effektiv max iter (intent override yoki default)
  const effectiveMaxIter = maxIter || MAX_ITER;
  const effectiveForceFinalAt = Math.max(2, effectiveMaxIter - 2);

  while (iter < effectiveMaxIter) {
    iter++;
    const isFinalIter = iter >= effectiveForceFinalAt;

    // Final iter'da extra instruction qo'shamiz — bu cache'ni invalidate qilmasin uchun
    // dinamik blokka qo'shamiz (yoki cache yoqilmagan bo'lsa stringga)
    const finalInstruction = `\n\n=== YAKUNIY JAVOB QADAMI ===
Endi siz vosita chaqira olmaysiz. Hozirgacha to'plagan ma'lumot bilan TO'LIQ FOYDALI JAVOB ber.

Hatto savolga to'liq javob bera olmasangiz ham, KAMIDA quyidagilarni qiling:
1. Qaysi manbalarda qidirganingizni va NIMA TOPGANINGIZNI ayting
2. Topilgan har raqamni qaytaring (qisman bo'lsa ham foydali)
3. Mavjud ma'lumotlardan QO'SHIMCHA nimalarni taklif qilishingiz mumkinligini yozing
4. "Javob bera olmadim" deb tushinmang — bu mumkin emas`;

    let systemForCall;
    if (cachedSystemBlocks) {
      // Final iter bo'lsa, dinamik blokka qo'shamiz (cache buzilmaydi)
      if (isFinalIter) {
        const blocks = cachedSystemBlocks.map(b => ({ ...b }));
        if (blocks.length > 1) {
          blocks[blocks.length - 1].text += finalInstruction;
        } else {
          blocks.push({ type: 'text', text: finalInstruction.trimStart() });
        }
        systemForCall = blocks;
      } else {
        systemForCall = cachedSystemBlocks;
      }
    } else {
      // Cache yo'q — eski xulq
      systemForCall = isFinalIter ? system + finalInstruction : system;
    }

    const body = {
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: systemForCall,
      messages,
    };
    if (!isFinalIter) body.tools = cache ? cachedTools : allTools;

    // Extended thinking — chuqur tahlil uchun
    if (thinkingBudget && thinkingBudget >= 1024) {
      body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
      // Thinking yoqilganda max_tokens thinking_budget'dan katta bo'lishi shart
      if (body.max_tokens <= thinkingBudget) {
        body.max_tokens = thinkingBudget + 2048;
      }
    }

    // Stream Claude SSE: content_block_start/delta/stop eventlarini kuzatamiz.
    // Text bloklari onDelta orqali uzatiladi. Tool_use bloklari yig'iladi.
    const contentBlocks = []; // index -> { type, text? | name,id,input_json_partial? }
    const data = await withRetry(async () => {
      const headers = {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      };
      // Code execution beta header — kerak bo'lganda yoqamiz
      if (codeExecution) {
        headers['anthropic-beta'] = 'code-execution-2025-05-22';
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
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
      let iterUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

      await readSseStream(res, (payload, event) => {
        const type = payload.type;
        if (type === 'message_start') {
          // Usage stats kelishi mumkin bu event'da
          const u = payload.message?.usage || {};
          iterUsage.input_tokens = u.input_tokens || 0;
          iterUsage.cache_read_input_tokens = u.cache_read_input_tokens || 0;
          iterUsage.cache_creation_input_tokens = u.cache_creation_input_tokens || 0;
          iterUsage.output_tokens = u.output_tokens || 0;
        } else if (type === 'content_block_start') {
          const b = payload.content_block || {};
          contentBlocks[payload.index] = {
            type: b.type,
            text: b.type === 'text' ? '' : undefined,
            thinking: b.type === 'thinking' ? '' : undefined,
            signature: b.type === 'thinking' ? '' : undefined,
            name: b.name,
            id: b.id,
            input: (b.type === 'tool_use' || b.type === 'server_tool_use') ? (b.input || {}) : undefined,
            _jsonBuf: (b.type === 'tool_use' || b.type === 'server_tool_use') ? '' : undefined,
            // web_search_tool_result blok — Anthropic native search natijalari
            content: b.type === 'web_search_tool_result' ? b.content : undefined,
            tool_use_id: b.tool_use_id,
          };
          // Server tool (web_search) chaqiruvini bildirish
          if (b.type === 'server_tool_use' && b.name === 'web_search') {
            totalUsage.web_search_count = (totalUsage.web_search_count || 0) + 1;
            if (onTool) onTool({ name: 'web_search', input: b.input || {}, server: true });
          }
          if (b.type === 'server_tool_use' && b.name === 'code_execution') {
            totalUsage.code_exec_count = (totalUsage.code_exec_count || 0) + 1;
            if (onTool) onTool({ name: 'code_execution', input: b.input || {}, server: true });
          }
        } else if (type === 'content_block_delta') {
          const blk = contentBlocks[payload.index];
          if (!blk) return;
          const d = payload.delta || {};
          if (d.type === 'text_delta' && typeof d.text === 'string') {
            blk.text += d.text;
            if (onDelta) onDelta(d.text);
          } else if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
            // Extended thinking matni — UI'ga "AI fikrlayapti..." sifatida ko'rsatiladi
            blk.thinking += d.thinking;
            if (onThinking) onThinking(d.thinking);
          } else if (d.type === 'signature_delta' && typeof d.signature === 'string') {
            // Thinking blok signature — keyingi turn'larda content'ga qaytarish uchun saqlash kerak
            blk.signature = d.signature;
          } else if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
            blk._jsonBuf += d.partial_json;
          }
        } else if (type === 'content_block_stop') {
          const blk = contentBlocks[payload.index];
          if (blk && (blk.type === 'tool_use' || blk.type === 'server_tool_use')) {
            try {
              if (blk._jsonBuf) blk.input = JSON.parse(blk._jsonBuf);
            } catch { /* keep b.input from start event */ }
          }
        } else if (type === 'message_delta') {
          stopReason = payload.delta?.stop_reason || null;
          // Output tokens yangilash
          if (payload.usage?.output_tokens) {
            iterUsage.output_tokens = payload.usage.output_tokens;
          }
        } else if (type === 'error') {
          streamErr = payload.error?.message || 'Claude stream xato';
        }
      });

      if (streamErr) throw new Error(`Claude: ${streamErr}`);

      // Aggregate usage
      totalUsage.input_tokens += iterUsage.input_tokens;
      totalUsage.output_tokens += iterUsage.output_tokens;
      totalUsage.cache_read_input_tokens += iterUsage.cache_read_input_tokens;
      totalUsage.cache_creation_input_tokens += iterUsage.cache_creation_input_tokens;

      // Assistant content format for next round.
      // Anthropic spec'iga ko'ra, thinking + server_tool_use + web_search_tool_result bloklari
      // navbatdagi turn'da xabar tarkibida qaytarilishi kerak (aks holda 400 error).
      return {
        content: contentBlocks.filter(Boolean).map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'thinking') return { type: 'thinking', thinking: b.thinking, signature: b.signature };
          if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
          if (b.type === 'server_tool_use') return { type: 'server_tool_use', id: b.id, name: b.name, input: b.input };
          if (b.type === 'web_search_tool_result') return { type: 'web_search_tool_result', tool_use_id: b.tool_use_id, content: b.content };
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
      // Foydalanuvchiga ko'rsatish kerak bo'lgan tool natijalari (PDF URL, file link kabi)
      if (onTool && result && (result.url || result.filename) && !result.error) {
        onTool({ name: tu.name, input: tu.input, result, isResult: true });
      }
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
  return { reply: finalText, iterations: iter, usage: totalUsage };
}

// ────────────────────────────────────────────────
// OpenAI / DeepSeek (Chat Completions + tools) — streaming
// ────────────────────────────────────────────────
async function runOpenAIAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool, onDelta, maxIter }) {
  const effectiveMaxIter = maxIter || MAX_ITER;
  const effectiveForceFinalAt = Math.max(2, effectiveMaxIter - 2);
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
  // Aggregate usage across iterations (Claude-like)
  const totalUsage = { input_tokens: 0, output_tokens: 0 };

  while (iter < effectiveMaxIter) {
    iter++;
    const isFinalIter = iter >= effectiveForceFinalAt;
    const body = {
      model: cfg.model,
      stream: true,
      stream_options: { include_usage: true }, // ← oxirgi chunk'da usage qaytaradi (token tracking uchun)
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

      let usage = null;
      await readSseStream(res, (chunk) => {
        // Usage stats (oxirgi chunk'da, stream_options.include_usage=true bo'lsa)
        if (chunk.usage) {
          usage = {
            input_tokens: chunk.usage.prompt_tokens || 0,
            output_tokens: chunk.usage.completion_tokens || 0,
          };
        }
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

      return { content, finishReason, tool_calls: tcAccum.filter(Boolean), usage };
    }, 'openai');

    // Usage'ni jami'ga qo'shamiz
    if (msg.usage) {
      totalUsage.input_tokens += msg.usage.input_tokens || 0;
      totalUsage.output_tokens += msg.usage.output_tokens || 0;
    }

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
      // Foydalanuvchiga ko'rinishi kerak bo'lgan natijalar (PDF URL kabi)
      if (onTool && result && (result.url || result.filename) && !result.error) {
        onTool({ name: tc.function.name, input, result, isResult: true });
      }
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
  return { reply: finalText, iterations: iter, usage: totalUsage };
}

// ────────────────────────────────────────────────
// Gemini (Function Calling)
// ────────────────────────────────────────────────
// Bepul tier'da gemini-2.5-flash tez-tez overload bo'ladi tool use bilan.
// Fallback ketma-ketligi: flash → pro → flash-lite (tool'siz).
const GEMINI_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];

async function runGeminiAgent({ cfg, tools, system, message, history, ctx, toolCalls, onTool, onDelta, maxIter }) {
  const effectiveMaxIter = maxIter || MAX_ITER;
  const effectiveForceFinalAt = Math.max(2, effectiveMaxIter - 2);
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

  while (iter < effectiveMaxIter) {
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
      if (onTool && result && (result.url || result.filename) && !result.error) {
        onTool({ name: fc.name, input: fc.args, result, isResult: true });
      }
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
