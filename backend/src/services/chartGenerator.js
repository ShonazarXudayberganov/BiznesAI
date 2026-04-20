/**
 * AI Chart Generator — agent yordamida foydalanuvchi tabiiy tilidagi so'rovdan
 * mos chart config (Chart.js / Recharts uchun moslashtiriladi) tayyorlaydi.
 *
 * Pattern:
 *   1. Agent listSources, getSchema, groupBy bilan kerakli ma'lumotni topadi
 *   2. So'ngra structured JSON qaytaradi: { type, title, labels, datasets, explanation }
 *   3. Frontend / bot bu config'ni rasmga aylantiradi
 */
const { runAgent } = require('./aiAgent');

const CHART_PROMPT_EXTRA = `
GRAFIK TAYYORLA:
Foydalanuvchi grafik so'rayapti. Quyidagi qadamlarni bajar:
1. list_sources orqali mos manbani top
2. group_by yoki aggregate bilan ma'lumotni hisobla
3. JSON STRUKTURADA javob ber, MARKDOWN'siz, QO'SHIMCHA MATN'SIZ:

{
  "type": "line" | "bar" | "pie" | "area",
  "title": "Sarlavha O'zbek tilida",
  "labels": ["...", "..."],
  "datasets": [
    { "label": "Nom", "data": [...], "color": "#4ADE80" }
  ],
  "explanation": "1-2 jumla bilan tushuntirish"
}

Faqat shu JSON. Boshqa hech narsa.

Rang taklif:
- Yashil #4ADE80 (sotuv, daromad, o'sish)
- Oltin #D4A853 (mehnat haqi, asosiy KPI)
- Pushti #EC4899 (yo'qotish, qarz)
- Ko'k #38BDF8 (ko'rish, audientsiya)

Chart turlari:
- "line" — vaqt bo'yicha trend (oy, kun)
- "bar" — kategoriyalar solishtiruv (filial, fan, mahsulot)
- "pie" — taqsimot (ulush)
- "area" — to'planayotgan trend
`;

/**
 * @param {object} opts
 * @param {string} opts.message — foydalanuvchi grafik so'rovi
 * @param {number} opts.organizationId
 * @param {number} [opts.userId]
 * @returns {Promise<{config, explanation, raw, toolCalls}>}
 */
async function generateChart({ message, organizationId, userId }) {
  const r = await runAgent({
    message,
    organizationId,
    userId: userId || null,
    systemPromptExtra: CHART_PROMPT_EXTRA,
  });

  // Agent javobidan JSON ajratish
  let config = null;
  try {
    // JSON blok'ini topish (markdown ham bo'lishi mumkin)
    const jsonMatch = r.reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      config = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    return {
      config: null,
      explanation: r.reply,
      raw: r.reply,
      toolCalls: r.toolCalls,
      error: 'JSON parse xato — AI noto\'g\'ri format qaytardi',
    };
  }

  if (!config || !config.type) {
    return {
      config: null,
      explanation: r.reply,
      raw: r.reply,
      toolCalls: r.toolCalls,
      error: 'Chart config qaytarilmadi',
    };
  }

  return {
    config,
    explanation: config.explanation || '',
    raw: r.reply,
    toolCalls: r.toolCalls,
  };
}

/**
 * Chart.js (QuickChart) format'iga aylantirish
 */
function toChartJsConfig(config) {
  return {
    type: config.type || 'bar',
    data: {
      labels: config.labels || [],
      datasets: (config.datasets || []).map(d => ({
        label: d.label,
        data: d.data || [],
        backgroundColor: d.color || '#4ADE80',
        borderColor: d.color || '#4ADE80',
        tension: 0.3,
      })),
    },
    options: {
      plugins: {
        title: { display: !!config.title, text: config.title, font: { size: 16 } },
        legend: { position: 'bottom' },
      },
      scales: ['line', 'bar', 'area'].includes(config.type)
        ? { y: { beginAtZero: true } }
        : undefined,
    },
  };
}

module.exports = { generateChart, toChartJsConfig };
