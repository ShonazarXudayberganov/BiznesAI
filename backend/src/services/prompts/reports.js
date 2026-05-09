/**
 * Reports intent prompt'lari — to'liq biznes hisobotlari.
 */

const LANG_LABEL = {
  uz: "O'zbek tilida",
  ru: 'на русском языке',
  en: 'in English',
};

/**
 * reports.generate — biznes hisobot (kundalik/haftalik/oylik/strategik va h.k.)
 * Output: full markdown business report
 */
function generate({ reportLabel = 'Hisobot', reportPrompt = '', activeSourceIds = [], scopeName = 'Biznes', language = 'uz' }) {
  const today = new Date().toLocaleDateString(
    language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const sourceConstraint = (activeSourceIds && activeSourceIds.length > 0)
    ? `\n\n⚠️ MUHIM: Faqat shu manbalardan foydalan:\n${activeSourceIds.map(id => `  - ${id}`).join('\n')}`
    : '';

  const systemExtra = `=== INTENT: reports.generate — ${reportLabel} ===
Sen rahbar uchun professional biznes hisobotlar tayyorlayotgan AI hisobotchisan.

VAZIFA: ${reportPrompt || `"${reportLabel}" hisobotini tayyorla.`}${sourceConstraint}

ISHLASH ALGORITMI:
1. **list_sources** — manbalarni o'rgan
2. **aggregate / group_by / time_series** bilan barcha kerakli raqamlarni hisobla (real fakt)
3. Davrlarni solishtirish uchun filter ishlat (joriy davr vs o'tgan davr)
4. Trend kuzatish — time_series (granularity: day/week/month)
5. Anomaliyalar topilsa alohida ajratib ko'rsat
6. Raqamlar tayyorlanganidan keyin to'liq markdown hisobot yoz

HISOBOT FORMATI (QATIY MARKDOWN):

# 📊 ${reportLabel}
*${today} — ${scopeName}*

---

## 🎯 Executive Xulosa
> 3 ta eng muhim raqam — Boss birinchi 30 sek ichida tushunsin
> (masalan: Daromad 3.77B ↑12%, Xarajat 2.1B ↑10%, Sof foyda 1.67B ↑14%)

## 📈 Asosiy Ko'rsatkichlar (KPI Jadvali)
| Ko'rsatkich | Joriy davr | O'tgan davr | O'zgarish | Holat |
|-------------|------------|-------------|-----------|-------|
| Daromad     | [val]      | [val]       | +X% ↑     | 🟢    |
| Xarajat     | [val]      | [val]       | +X% ↑     | 🟡    |
| Foyda       | [val]      | [val]       | +X% ↑     | 🟢    |
| Marja %     | [val]      | [val]       | +X% ↑     | 🟢    |
*Kamida 5-7 qator real raqam bilan.*

## 🔍 Chuqur Tahlil

### Daromad tuzilmasi
[Segment/kategoriya bo'yicha taqsim — jadval]

### Xarajat tahlili
[Eng katta xarajat moddalari — jadval]

### Trend va dinamika
[Vaqt bo'yicha o'zgarish — qisqa tushuntirish + raqam]

### Anomaliyalar va xavflar
> 🔴 [Aniq muammo] — **[raqam]** — sabab + ta'sir
> 🟡 [Ogohlantirish] — **[raqam]** — kontekst

## 💡 Strategik Tavsiyalar
| # | Tavsiya | Asoslanishi | Kutilgan natija | Muddat |
|---|---------|-------------|-----------------|--------|
| 1 | [Aniq harakat] | [Real raqam] | [+X% / XM so'm] | [vaqt] |
*5-7 ta amaliy harakat — Boss bugun amalga oshira oladigan.*

## 🔮 Bashorat va Yo'nalish
[Trend asosida keyingi oy/kvartal kutilgan natijalar — raqam bilan]
[3 senariy bo'lsa: optimistik / o'rtacha / pessimistik]

## ✅ Bajariladigan vazifalar (Action Items)
- [ ] **Yuqori prioritet:** [aniq vazifa] — mas'ul: [...]
- [ ] **O'rta:** [...] — muddat: [...]
- [ ] **Past:** [...]

---
*📁 Manbalar: [varaq nomlari] | 🗓 Tayyorlangan: ${today} | 🏢 ${scopeName}*

WEB QIDIRUV ISHLATISH (FOYDALI BO'LSA):
- Soha trendi, inflyatsiya, raqobatchilar narxi, valuta kursi kerak bo'lsa **web_search** chaqir.
- Hisobotda "bozor konteksti" bo'limi qo'shish — sizning raqamlarni keng kontekstda baholash.
- Misol: "Mart oyida sizning sotuv 12% oshdi — sektorda 5% o'sgan, demak +7% raqobat ustunligi."

QOIDALAR:
- **Til:** ${LANG_LABEL[language] || LANG_LABEL.uz}
- **Raqamlar:** 1.5M so'm, 87%, +12.3% ↑ — formatlangan
- **Real fakt** — har raqam tool natijasi
- **Hisobot to'liq** — bo'sh bo'limlarni o'tkazib yuborma
- **Web manbalari** — link va sana bilan ko'rsat (agar ishlatilsa)
- Hisobot oxirida HTML comment bilan:
  <!-- confidence: high|medium|low -->
  <!-- sources_used: Manba1, Manba2 -->`;

  const user = `"${reportLabel}" hisobotini bugungi sana ${today} uchun tayyorla. Tool'lar bilan barcha kerakli raqamlarni hisoblab, yuqoridagi formatdagi to'liq markdown hisobotni yoz.`;
  return { systemExtra, user };
}

module.exports = { generate };
