/**
 * Dashboard intent prompt'lari.
 * Har funksiya { systemExtra, user } qaytaradi.
 *  - systemExtra: aiAgent base persona ustiga qo'shiladigan intent-spetsifik qo'shimcha
 *  - user: foydalanuvchi xabarining content'i (AI uchun ko'rsatma)
 */

const LANG_LABEL = {
  uz: "O'zbek tilida",
  ru: 'на русском языке',
  en: 'in English',
};

/**
 * dashboard.summary — bosh sahifa AI board
 * Output: strict JSON { status, statusLabel, healthScore, summary, kpis, insights, recommendations }
 */
function summary({ scopeName = 'Biznes', sourceCount = 0, totalRows = 0, language = 'uz' }) {
  const today = new Date().toLocaleDateString(
    language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const systemExtra = `=== INTENT: dashboard.summary ===
Sen rahbar (CEO/menejer) uchun bosh sahifa **AI Board** generatsiya qilasan. Bu — har login'da birinchi ko'riladigan executive xulosa.

VAZIFA: Foydalanuvchining ulangan manbalaridan **TOOL'lar yordamida** real raqamlarni topib, quyidagi JSON ni qaytaring:

\`\`\`json
{
  "status": "good" | "warn" | "critical",
  "statusLabel": "qisqa holat (3-5 so'z, masalan: 'Ishonchli o'sish', 'Diqqat kerak', 'Tanqidiy holat')",
  "healthScore": <0..100 — biznes sog'ligi balli>,
  "summary": "3-4 jumla — TANQIDIY VA REAL biznes xulosasi. Nima yaxshi, nima yomon, qaysi xavflar.",
  "kpis": [
    {"label": "Daromad", "value": "12.4M", "unit": "so'm", "context": "kecha bilan +12%", "trend": "+12%", "trendKind": "up"},
    {"label": "Sotuvlar", "value": "1,250", "unit": "dona", "context": "...", "trend": "+5%", "trendKind": "up"},
    {"label": "Mijozlar", "value": "340", "unit": "ta", "context": "...", "trend": "-2%", "trendKind": "down"},
    {"label": "Foyda marjasi", "value": "18%", "unit": "", "context": "...", "trend": "+1%", "trendKind": "up"}
  ],
  "insights": ["1-xulosa (1 jumla, faktga asoslangan)", "2-xulosa", "3-xulosa"],
  "recommendations": [
    {"priority": "high", "title": "qisqa sarlavha", "detail": "1-2 jumla amaliy tavsiya"},
    {"priority": "medium", "title": "...", "detail": "..."},
    {"priority": "low", "title": "...", "detail": "..."}
  ]
}
\`\`\`

WEB QIDIRUV ISHLATISH (IXTIYORIY):
- "summary" yoki "insights" da bozor konteksti, sektor trendi, raqobatchilar yoki inflyatsiya kerak bo'lsa **web_search** chaqir.
- Misol: "kompaniya 5% pasaydi, lekin sektor 8% pasaygan" — kontekst beradi.
- Faqat foydali bo'lsa, har doim emas. Cost optimization.

QOIDALAR:
1. **healthScore mezonlari**:
   • 85-100 = mukammal (o'sish, foyda, faollik yuqori)
   • 70-84 = yaxshi
   • 55-69 = o'rtacha
   • 35-54 = past
   • 0-34 = tanqidiy
2. **kpis** — ANIQ 4 ta. Biznes uchun eng muhim raqamlar (daromad, sotuv, mijoz, foyda, konversiya).
3. **value formati**: 1.2K, 12.4M, 87%, 2,500 — formatlangan.
4. **trend** — oldingi davr bilan solishtirma. trendKind: "up"|"down"|"flat".
5. **summary** — QATTIQ tanqidiy. Yumshoq emas. Faktga tayan, raqamlarni tilga ol.
6. **recommendations** — 3-5 ta amaliy harakat. priority: high|medium|low.
7. Faqat MAVJUD ma'lumotlardan foydalan. Yo'q raqamni o'ylab topma.
8. Tool'lar bilan real qiymatlarni hisoblaganingdan keyin JSON yoz.

⚠️ JAVOB FAQAT JSON BO'LSIN. \`\`\`json bloklari ham kerak emas. Markdown yoki tushuntirish yo'q.

Til: ${LANG_LABEL[language] || LANG_LABEL.uz}.
Bugungi sana: ${today}.
`;

  const user = `Biznes nomi: ${scopeName}
Ulangan manbalar: ${sourceCount} ta
Jami ma'lumot: ${totalRows} qator

Bosh sahifa uchun executive AI board JSON ni generatsiya qil. Tool'lar orqali real raqamlarni topib, tanqidiy xulosa va amaliy tavsiyalar yoz.`;

  return { systemExtra, user };
}

/**
 * dashboard.widget — custom widget hisobi
 * Output: { value, sub, trend? }
 */
function widget({ widgetLabel, sourceName, sourceId, language = 'uz' }) {
  const systemExtra = `=== INTENT: dashboard.widget ===
Foydalanuvchi maxsus widget yaratdi va uning qiymatini bilmoqchi.

Widget label: "${widgetLabel}"
Manba: "${sourceName}" (id: ${sourceId})

VAZIFA: Tool'lar yordamida bu manbadan kerakli raqamni hisoblang va quyidagi JSON ni qaytaring:

\`\`\`json
{
  "value": "asosiy raqam (formatlangan: 1.5K, 2.3M, 87%)",
  "sub": "qisqa izoh 5-10 so'z (masalan: 'jami summa', 'o'rtacha', 'oxirgi 7 kun')",
  "trend": "+12%" yoki null,
  "trendKind": "up" | "down" | "flat" | null
}
\`\`\`

Agar hisoblab bo'lmasa: \`{"value": "—", "sub": "ma'lumot yetarli emas"}\`

⚠️ FAQAT JSON. Markdown yoki tushuntirish yo'q.
Til: ${LANG_LABEL[language] || LANG_LABEL.uz}.`;

  const user = `Widget: "${widgetLabel}" — manba "${sourceName}" dan qiymat hisoblang.`;

  return { systemExtra, user };
}

module.exports = { summary, widget };
