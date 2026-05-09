/**
 * Charts intent prompt'lari — chart yaratish va tur tavsiya.
 */

const LANG_LABEL = {
  uz: "O'zbek tilida",
  ru: 'на русском языке',
  en: 'in English',
};

/**
 * chart.generate — manbadan grafik konfiguratsiyasini yaratadi
 * Output: { cards: [{type, title, data, ...}] }
 */
function generate({ sourceName = '', sourceId = '', hint = '', customPrompt = '', language = 'uz' } = {}) {
  // Agar frontend o'zining to'liq prompt'ini yuborsa (ChartsPage),
  // brain shu prompt'ni minimal sistema yo'l-yo'lakaylik bilan ishga tushiradi
  if (customPrompt && customPrompt.length > 100) {
    const systemExtra = `=== INTENT: chart.generate (customPrompt mode) ===
Sen ma'lumot vizualizatsiyasi mutaxassisi-AI'sisan. Foydalanuvchining tayyor prompt'i quyida.
JAVOBNI FAQAT JSON formatda yoz, markdown blok ham kerak emas.
Til: ${LANG_LABEL[language] || LANG_LABEL.uz}.`;
    return { systemExtra, user: customPrompt };
  }

  const systemExtra = `=== INTENT: chart.generate ===
Sen ma'lumot vizualizatsiyasi bo'yicha mutaxassis-AI'sisan. Foydalanuvchi grafik xohlamoqda.

ISHLASH:
1. **list_sources** chaqir va manba ustunlarini ko'r (id: ${sourceId || '?'})
2. **search_rows** yoki **aggregate** bilan ma'lumotni tayyorla
3. Eng mos chart turini tanla (line/bar/pie/area)
4. JSON config qaytar

OUTPUT FORMAT (QATIY JSON):
\`\`\`json
{
  "cards": [
    {
      "type": "stat" | "line" | "bar" | "pie" | "area",
      "title": "Grafik nomi",
      "subtitle": "qisqa izoh (ixtiyoriy)",
      "data": [
        {"name": "Yan", "value": 1200000},
        {"name": "Fev", "value": 1500000}
      ],
      "xKey": "name",
      "yKey": "value",
      "colors": ["#10B981", "#3B82F6"],
      "analysis": "1 jumla insight"
    }
  ]
}
\`\`\`

Manba: ${sourceName || '?'}
Hint: ${hint || 'foydalanuvchi maxsus so\'rov bermadi'}

⚠️ FAQAT JSON.`;

  const user = `Manba "${sourceName || sourceId}" dan grafik tayyorla. ${hint || 'Eng muhim ko\'rsatkichlarni ko\'rsatuvchi 1-3 ta card ber.'}`;
  return { systemExtra, user };
}

/**
 * chart.suggest — bitta o'qli chart turi tavsiya (tool yo'q)
 */
function suggest({ rowsSample = [], hint = '', language = 'uz' } = {}) {
  const systemExtra = `=== INTENT: chart.suggest ===
Sample qatorlarga qarab eng mos grafik turini tavsiya qil. Tool chaqirma — to'g'ridan-to'g'ri javob ber.

OUTPUT (QATIY JSON):
\`\`\`json
{
  "chartType": "line" | "bar" | "pie" | "area" | "scatter" | "stat",
  "x": "ustun nomi",
  "y": "ustun nomi",
  "reasoning": "1 jumla nega shu chart"
}
\`\`\`

Til: ${LANG_LABEL[language] || LANG_LABEL.uz}
⚠️ FAQAT JSON.`;

  const sample = Array.isArray(rowsSample) ? rowsSample.slice(0, 5) : [];
  const user = `Qator namunasi (jami ${Array.isArray(rowsSample) ? rowsSample.length : 0} ta):
${JSON.stringify(sample, null, 2)}

${hint ? `Foydalanuvchi maqsadi: ${hint}` : ''}`;
  return { systemExtra, user };
}

module.exports = { generate, suggest };
