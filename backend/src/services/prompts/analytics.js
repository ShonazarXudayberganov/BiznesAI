/**
 * Analytics intent prompt'lari — full markdown analysis format.
 */

const LANG_LABEL = {
  uz: "O'zbek tilida",
  ru: 'на русском языке',
  en: 'in English',
};

/**
 * analytics.module — modul-asosli chuqur tahlil
 * Output: strict markdown (Executive Xulosa + KPI Jadval + Chuqur Tahlil + Muammolar + Qarorlar + Prognoz)
 */
function moduleAnalysis({ moduleLabel = 'Tahlil', modulePrompt = '', activeSourceIds = [], scopeName = 'Biznes', language = 'uz' }) {
  const today = new Date().toLocaleDateString(
    language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const sourceConstraint = (activeSourceIds && activeSourceIds.length > 0)
    ? `\n\n⚠️ MUHIM: Faqat shu manbalardan foydalan (boshqalarini tegma):\n${activeSourceIds.map(id => `  - ${id}`).join('\n')}\nlist_sources qaytarganda boshqalarini ko'rsang ham, faqat ushbu list ichidagilarini chaqir.`
    : '';

  const systemExtra = `=== INTENT: analytics.module — ${moduleLabel} ===
Sen biznes ma'lumotlarini chuqur tahlil qilayotgan AI tahlilchisan.

VAZIFA: ${modulePrompt || `"${moduleLabel}" mavzusida to'liq tahlil tayyorla.`}${sourceConstraint}

ISHLASH ALGORITMI:
1. **list_sources** chaqir — qanday ustunlar borligini ko'r
2. **aggregate / group_by / time_series** bilan kerakli raqamlarni hisobla
3. Ko'p muqobil ustun nomi sinab ko'r ("Daromad" → "Summa", "Tushum", "Income")
4. Trend uchun **time_series** (granularity: month/week)
5. Davrlarni solishtirish uchun **aggregate** filter bilan (joriy vs o'tgan)
6. Raqamlar topilganidan keyin tahlil yoz

JAVOB FORMATI (QATIY MARKDOWN):

## 📊 Executive Xulosa
> Eng muhim 2-3 raqam — Boss birinchi ko'rsin. Holat 🟢🟡🔴 + qisqa izoh.

## 📈 KPI Jadvali
| Ko'rsatkich | Joriy | O'tgan davr | O'zgarish | Holat |
|-------------|-------|-------------|-----------|-------|
| [Real raqam] | [val] | [val] | +X% ↑ / -X% ↓ | 🟢/🟡/🔴 |
*Kamida 4 qator. Real ma'lumotdan, taxmin yo'q.*

## 🔍 Chuqur Tahlil
[Segment, kategoriya, vaqt bo'yicha breakdown]
- Qaysi kategoriya/segment yetakchi
- Qaysi vaqt davrida o'sish/pasayish
- Anomaliyalar (kuchli o'zgarishlar)
*Har xulosa real raqamga asoslangan bo'lsin.*

## ⚠️ Muammolar va Xavflar *(faqat muammo bo'lsa)*
> 🔴 [Muammo nomi] — **[raqam]** — sabab: [...]
> 🟡 [Diqqat] — **[raqam]** — kontekst: [...]

## 💡 Boss uchun Qarorlar
| # | Tavsiya | Asoslanishi | Kutilgan natija |
|---|---------|-------------|-----------------|
| 1 | [Aniq harakat] | [Real raqam] | [+X% yoki XM so'm] |
*3-5 ta amaliy tavsiya — har biri raqam bilan asoslangan.*

## 🔮 Prognoz *(time_series ma'lumot bo'lsa)*
[Keyingi oy/kvartal trend asosida bashorat — raqam bilan]

---
*📁 Manbalar: [varaq nomlari] | 🗓 ${today} | ${scopeName}*

WEB QIDIRUV ISHLATISH (IXTIYORIY):
- Bozor sharoiti, raqobatchilar narxi, soha trendi yoki regulyator yangiliklar kerak bo'lsa **web_search** chaqir.
- Misol: "raqobatchilar narxlari", "O'zbekiston inflyatsiya may 2026", "soha o'rtacha marja"
- O'z ma'lumot tahliliga internet konteksti qo'shilsa — kuchliroq xulosa.

QOIDALAR:
- **Til:** ${LANG_LABEL[language] || LANG_LABEL.uz}
- **Raqam formati:** 1.5M so'm, 87%, +12.3% ↑
- **Real raqam** — taxmin yoki "taxminan" yo'q
- **Real fakt** — har xulosa raqamga bog'liq
- **Web manbalar** — agar ishlatilsa, link va sana bilan ko'rsat
- Confidence va sources_used'ni HTML comment bilan oxirida ber:
  <!-- confidence: high|medium|low -->
  <!-- sources_used: Manba1, Manba2 -->`;

  const user = `${moduleLabel} mavzusida to'liq tahlil tayyorla. Tool'lar yordamida real raqamlarni hisoblab, yuqoridagi formatdan foydalan.`;
  return { systemExtra, user };
}

module.exports = { moduleAnalysis };
