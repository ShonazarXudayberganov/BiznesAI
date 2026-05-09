/**
 * Multi-agent: maxsus mutaxassis sub-agentlar.
 *
 * Coordinator (chat.freeform / dashboard.summary) ko'rsatma berib,
 * mutaxassis sub-agentni ma'lum vazifaga yuboradi.
 *
 * Har mutaxassis:
 *   - O'z system prompti (roli, fokus)
 *   - Cheklangan tool subset
 *   - Past maxIter (tezkor, arzon)
 *   - thinkingBudget cheklangan
 *
 * Recursion himoyasi: sub-agentlar boshqa sub-agentni chaqirolmaydi.
 */

const SPECIALISTS = {
  sales_analyst: {
    role: 'Savdo tahlilchi',
    instruction:
      "Sen savdo tahlilchi mutaxassisisan. Vazifang: savdo dataset'larini chuqur tahlil qilish, " +
      "trend, anomaliya, mahsulot/kanal/sotuvchi tahlili, top sellers, weak performers. " +
      "Faqat berilgan savdo savol bo'yicha aniq raqamli javob ber. Boshqa sohaga chiqma. " +
      "JAVOB: 4-6 jumla, kerakli raqamlar va konkret tavsiya bilan.",
    allowedTools: ['list_sources', 'aggregate', 'group_by', 'time_series', 'find_anomaly', 'compare_periods', 'forecast', 'search_rows'],
    maxIter: 5,
    thinkingBudget: 1024,
  },

  finance_reviewer: {
    role: 'Moliya nazorat',
    instruction:
      "Sen moliyaviy nazorat mutaxassisisan. Vazifang: cash flow, daromad, harajat, profit margin, " +
      "kerak bo'lsa P&L tahlili. Risk va imkoniyatlarni aniqlash. " +
      "Faqat moliyaviy savol bo'yicha javob ber. " +
      "JAVOB: 4-6 jumla, foiz va so'mda raqamlar, biznes tavsiyasi.",
    allowedTools: ['list_sources', 'aggregate', 'group_by', 'time_series', 'compare_periods', 'forecast'],
    maxIter: 5,
    thinkingBudget: 1024,
  },

  marketing_strategist: {
    role: 'Marketing strategist',
    instruction:
      "Sen marketing strategist'sisan. Vazifang: customer acquisition, kanal effektivligi, " +
      "lead conversion, kampaniyalar ROI. Telegram/Instagram metrikalari ham. " +
      "JAVOB: 4-6 jumla, foiz va konkret kampaniya/budjet tavsiyasi.",
    allowedTools: ['list_sources', 'aggregate', 'group_by', 'time_series', 'compare_periods', 'cross_source_search'],
    maxIter: 5,
    thinkingBudget: 1024,
  },

  operations_advisor: {
    role: 'Operatsion maslahatchi',
    instruction:
      "Sen operatsion samaradorlik mutaxassisi'san. Vazifang: jarayon optimizatsiyasi, " +
      "logistika, omborxona, xodimlar samaradorligi, jarayon to'sqinliklari. " +
      "JAVOB: 4-6 jumla, aniq jarayon tavsiyalari.",
    allowedTools: ['list_sources', 'aggregate', 'group_by', 'find_anomaly', 'search_rows', 'cross_source_search'],
    maxIter: 5,
    thinkingBudget: 1024,
  },
};

function listSpecialists() {
  return Object.entries(SPECIALISTS).map(([key, s]) => ({
    key,
    role: s.role,
    instruction_summary: s.instruction.slice(0, 100),
  }));
}

function getSpecialist(key) {
  return SPECIALISTS[key] || null;
}

module.exports = { SPECIALISTS, listSpecialists, getSpecialist };
