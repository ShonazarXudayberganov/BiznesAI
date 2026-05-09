/**
 * Alerts intent prompt'lari — anomaliya tushuntirish va tavsiya.
 */

const LANG_LABEL = {
  uz: "O'zbek tilida",
  ru: 'на русском языке',
  en: 'in English',
};

/**
 * alerts.label — qoida-asosli aniqlangan anomaliyalar uchun AI tushuntirish
 * Output: strict JSON { alerts: [{type, severity, title, message, recommendation}] }
 */
function label({ anomalies = [], activeSourceIds = [], scopeName = 'Biznes', language = 'uz' } = {}) {
  const list = Array.isArray(anomalies) ? anomalies : [];
  const sourceConstraint = (activeSourceIds && activeSourceIds.length > 0)
    ? `\n\nMavjud manbalar: ${activeSourceIds.join(', ')}`
    : '';

  const systemExtra = `=== INTENT: alerts.label ===
Sen biznesdagi anomaliya/xavflarni tushuntirish va amaliy tavsiya berish bo'yicha tahlilchi-AI'sisan.

KIRISH MA'LUMOTI:
${list.length ? `Topilgan anomaliyalar (qoida-asosli aniqlandi):\n${JSON.stringify(list, null, 2)}` : 'Anomaliyalarni o\'zing aniqlang (find_anomaly yoki search_rows tool orqali).'}${sourceConstraint}

VAZIFA: Har anomaliya uchun:
1. Sabab tushunchasini yoz (raqam bilan)
2. Biznesga ta'siri qancha bo'lishi mumkinligini ayting
3. Aniq amaliy harakat tavsiya et

OUTPUT FORMAT (QATIY JSON):
\`\`\`json
{
  "alerts": [
    {
      "type": "anomaly" | "trend" | "risk" | "opportunity",
      "severity": "high" | "medium" | "low",
      "title": "qisqa sarlavha (5-8 so'z)",
      "metric": "ko'rsatkich nomi (masalan: 'Daromad', 'Qarzdorlik')",
      "value": "raqam",
      "change": "+12% ↑" | "-25% ↓" | null,
      "message": "1-2 jumla — nima sodir bo'lgan, sababi nima",
      "impact": "biznesga ta'siri (1 jumla, raqam bilan)",
      "recommendation": "amaliy harakat (1 jumla)"
    }
  ]
}
\`\`\`

QOIDALAR:
- Faqat MAVJUD ma'lumotlardan
- Severity:
  • high — zudlik bilan choralar (10%+ daromad ta'siri yoki kritik xavf)
  • medium — diqqat kerak (3-10% ta'sir)
  • low — kuzatib turish (3% gacha)
- Type:
  • anomaly — keskin chiqib ketish (z-score)
  • trend — uzoq muddatli o'zgarish
  • risk — kelgusi muammo signalı
  • opportunity — yangi imkoniyat
- Til: ${LANG_LABEL[language] || LANG_LABEL.uz}
- ⚠️ FAQAT JSON. Markdown bloklari yoki tushuntirish yo'q.`;

  const user = list.length > 0
    ? `Yuqoridagi anomaliyalarning har biri uchun tushuntirish va tavsiya yozib, JSON ga jamla.`
    : `Mavjud manbalardan anomaliyalarni topib, JSON formatida ogohlantirishlar tayyorla.`;
  return { systemExtra, user };
}

module.exports = { label };
