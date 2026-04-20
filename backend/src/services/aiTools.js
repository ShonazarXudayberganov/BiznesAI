/**
 * AI Tools — agent ishlatadigan vositalar.
 * Har vosita: nom, tavsif, JSON schema, executor.
 *
 * Provider-agnostic. aiProviders.js har provayder uchun moslashtiradi.
 */
const dataLayer = require('./dataLayer');

const TOOLS = [
  {
    name: 'list_sources',
    description:
      "Tashkilotning barcha ulangan ma'lumot manbalarini ro'yxatga oladi. " +
      "Sheets/Excel uchun varaqlar va ustunlar; CRM/Instagram/Telegram va boshqalar uchun ham. " +
      "BIRINCHI VOSITA — har savolda ishlat (qaysi manba mos kelishini bilish uchun).",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async execute({ organizationId }) {
      return await dataLayer.listOrgSources(organizationId);
    },
  },

  {
    name: 'search_rows',
    description:
      "Belgilangan manba/varaqdan kalit so'z yoki filter bo'yicha qatorlarni qidiradi. " +
      "Misol: ism, mahsulot nomi, sana diapazoni. " +
      "filter object: {ustun_nomi: 'qiymat'} yoki {ustun_nomi: {gte: 100, lte: 500}} yoki {ustun_nomi: {contains: 'mat'}}",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: "Manba ID (list_sources dan olinadi)" },
        sheet: { type: 'string', description: "Varaq nomi (sheets/excel uchun, ixtiyoriy)" },
        query: { type: 'string', description: "Kalit so'z — barcha ustunlarda qidiradi" },
        filter: { type: 'object', description: "Aniq filter (ustun bo'yicha)" },
        limit: { type: 'number', description: "Maksimal qator (default 100)" },
      },
      required: ['sourceId'],
    },
    async execute({ sourceId, sheet, query, filter, limit }) {
      return await dataLayer.searchInSource({ sourceId, sheet, query, filter, limit: limit || 100 });
    },
  },

  {
    name: 'aggregate',
    description:
      "Manba ustunida agregatsiya: sum, avg, count, min, max, median. " +
      "Filter bilan cheklash mumkin (ma'lum oy, fan va h.k.). " +
      "AI o'zi sanmasin — har doim shu vositadan foydalan.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        sheet: { type: 'string', description: "Varaq nomi" },
        column: { type: 'string', description: "Ustun nomi" },
        func: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max', 'median'] },
        filter: { type: 'object', description: "Filter object" },
      },
      required: ['sourceId', 'func'],
    },
    async execute({ sourceId, sheet, column, func, filter }) {
      return await dataLayer.aggregate({ sourceId, sheet, column, func, filter });
    },
  },

  {
    name: 'group_by',
    description:
      "Qatorlarni biror ustun bo'yicha guruhlash + agregatsiya. " +
      "Misol: oy bo'yicha sotuv yig'indisi, mijoz bo'yicha to'lov soni, fan bo'yicha qarzdorlik o'rtachasi. " +
      "Natija eng kattadan tartiblanadi.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        sheet: { type: 'string' },
        groupColumn: { type: 'string', description: "Guruhlash uchun ustun (masalan 'oy', 'fan')" },
        aggColumn: { type: 'string', description: "Agregatsiya uchun ustun (masalan 'summa')" },
        func: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'], description: "Default 'sum'" },
        filter: { type: 'object' },
        limit: { type: 'number', description: "Maksimal guruh (default 50)" },
      },
      required: ['sourceId', 'groupColumn'],
    },
    async execute({ sourceId, sheet, groupColumn, aggColumn, func, filter, limit }) {
      return await dataLayer.groupBy({ sourceId, sheet, groupColumn, aggColumn, func, filter, limit });
    },
  },

  {
    name: 'get_distinct_values',
    description:
      "Ustundagi noyob qiymatlar va ularning soni. " +
      "Misol: 'fan' ustunida qaysi fanlar bor (Matematika, Fizika...). " +
      "Foydalanuvchi savoli noaniq bo'lsa — qaysi qiymatlar mavjudligini bilish uchun.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        sheet: { type: 'string' },
        column: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['sourceId', 'column'],
    },
    async execute({ sourceId, sheet, column, limit }) {
      return await dataLayer.getDistinctValues({ sourceId, sheet, column, limit });
    },
  },

  {
    name: 'cross_source_search',
    description:
      "Tashkilotning BARCHA manbalari bo'ylab kalit so'z bilan qidiradi. " +
      "Foydalanuvchi qaysi manbada borligini bilmasa ishlat (masalan ism qidirish).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Kalit so'z" },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
    async execute({ organizationId, query, limit }) {
      return await dataLayer.crossSourceSearch({ organizationId, query, limit });
    },
  },

  {
    name: 'get_source_schema',
    description:
      "Manba sxemasini olish: ustunlar, ustun turlari, namuna qatorlar. " +
      "Sheets uchun varaqlar va ularning ustunlari.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
      },
      required: ['sourceId'],
    },
    async execute({ sourceId }) {
      return await dataLayer.getSourceSchema(sourceId);
    },
  },
];

const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]));

/**
 * Tool chaqiruvni bajarish.
 * @param {string} name — tool nomi
 * @param {object} input — argumentlar
 * @param {object} ctx — { organizationId, userId }
 */
async function executeTool(name, input, ctx) {
  const tool = TOOL_MAP[name];
  if (!tool) {
    return { error: `Noma'lum vosita: ${name}` };
  }
  try {
    const args = { ...(input || {}), ...ctx };
    const result = await tool.execute(args);
    // Natijani qisqartirish (token tejash) — agar 50K dan ko'p belgi bo'lsa
    const json = JSON.stringify(result);
    if (json.length > 50000) {
      return {
        ...result,
        _truncated: true,
        _note: 'Natija juda katta — agar to\'liq kerak bo\'lsa filter qo\'sh',
      };
    }
    return result;
  } catch (e) {
    return { error: e.message || 'Vosita xatosi' };
  }
}

/**
 * Tool definitions har provayder formati uchun.
 */
function getToolsForProvider(provider) {
  if (provider === 'claude') {
    return TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }
  if (provider === 'chatgpt' || provider === 'deepseek') {
    return TOOLS.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }
  if (provider === 'gemini') {
    return [{
      functionDeclarations: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    }];
  }
  // Default — Claude shaklida
  return TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

module.exports = {
  TOOLS,
  TOOL_MAP,
  executeTool,
  getToolsForProvider,
};
