/**
 * AI Tools — agent ishlatadigan vositalar.
 * Har vosita: nom, tavsif, JSON schema, executor.
 *
 * Provider-agnostic. aiProviders.js har provayder uchun moslashtiradi.
 */
const dataLayer = require('./dataLayer');
const userMemory = require('./userMemory');

const TOOLS = [
  {
    name: 'save_memory',
    description:
      "Foydalanuvchi haqida muhim faktni eslab qolish (kasbi, biznes sohasi, afzalliklari, odatlari, muhim sanalar). " +
      "Suhbat davomida foydalanuvchi o'zi aytgan yoki siz kuzatgan narsalarni shu yerga yozing. " +
      "Misol: 'Foydalanuvchi matematika fanidan repetitor', 'Foydalanuvchi Mart oyi statistikasini ko'p so'raydi'. " +
      "TAKRORIY faktlar saqlamang — avval eslab qolganini ishlating.",
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: "Fakt (1-2 gap, 500 belgidan kam)" },
        kind: { type: 'string', enum: ['fact', 'preference', 'context'], description: "Turi: fact (oddiy fakt), preference (afzallik/odat), context (loyihaga doir kontekst)" },
      },
      required: ['content'],
    },
    async execute({ userId, content, kind }) {
      if (!userId) return { error: 'userId yo\'q' };
      const r = await userMemory.addMemory(userId, { content, kind: kind || 'fact', source: 'auto' });
      return { saved: true, id: r.id, duplicated: !!r.duplicated };
    },
  },

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
      // Default 30 — agent ko'p qator so'rasa ham truncate qilamiz
      return await dataLayer.searchInSource({ sourceId, sheet, query, filter, limit: Math.min(limit || 30, 100) });
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
    name: 'query_data',
    description:
      "SQL-ga o'xshash kuchli so'rov — bitta chaqiruvda select + where + groupBy + multiple aggregates + orderBy. " +
      "Murakkab savollar uchun: masalan 'har oy bo'yicha eng yaxshi 5 mijoz va umumiy to'lovi' yoki " +
      "'fan bo'yicha o'rtacha va maksimal ball'. " +
      "select + where yetib qolganda odatiy search_rows dan AFZAL (bitta tool chaqiruv).",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        sheet: { type: 'string', description: "Varaq nomi" },
        select: {
          type: 'array',
          items: { type: 'string' },
          description: "Qaytaradigan ustunlar ([\"*\"] = barcha). Agregatsiyada e'tiborga olinmaydi.",
        },
        where: { type: 'object', description: "Filter: {col: val} yoki {col: {gte,lte,gt,lt,contains,equals,in}}" },
        groupBy: {
          type: 'array',
          items: { type: 'string' },
          description: "Guruhlash ustunlari (masalan ['oy'] yoki ['fan','sinf']).",
        },
        aggregates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              col: { type: 'string' },
              func: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max', 'median'] },
              as: { type: 'string', description: "Natija ustun nomi (ixtiyoriy)" },
            },
          },
          description: "Agregatsiyalar ro'yxati (count uchun col kerak emas).",
        },
        orderBy: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              col: { type: 'string' },
              dir: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
        },
        limit: { type: 'number', description: "Max natija (default 100, max 500)" },
      },
      required: ['sourceId'],
    },
    async execute({ sourceId, sheet, select, where, groupBy, aggregates, orderBy, limit }) {
      return await dataLayer.queryData({ sourceId, sheet, select, where, groupBy, aggregates, orderBy, limit });
    },
  },

  {
    name: 'time_series',
    description:
      "Vaqt bo'yicha trend ko'rish: kun/hafta/oy/yil kesimida sotuv, to'lov, arizalar va h.k. " +
      "Misol: oxirgi 12 oy bo'yicha har oy sotuv yig'indisi. " +
      "dateColumn — sana ustuni, aggColumn — raqam ustuni, granularity: day|week|month|year.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        sheet: { type: 'string' },
        dateColumn: { type: 'string', description: "Sana ustuni nomi" },
        aggColumn: { type: 'string', description: "Raqam ustuni (yo'q bo'lsa count)" },
        func: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'] },
        granularity: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
        filter: { type: 'object' },
        limit: { type: 'number', description: "Oxirgi N bucket (default 60)" },
      },
      required: ['sourceId', 'dateColumn'],
    },
    async execute({ sourceId, sheet, dateColumn, aggColumn, func, granularity, filter, limit }) {
      return await dataLayer.timeSeries({ sourceId, sheet, dateColumn, aggColumn, func, granularity, filter, limit });
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
    return truncateResult(result, 12000);  // har vosita javob max ~12K char (~3K token)
  } catch (e) {
    return { error: e.message || 'Vosita xatosi' };
  }
}

/**
 * Natijani belgilangan o'lchamga moslashtirish.
 * Massivlarni qisqartiradi, obyekt qiymatlarini cheklaydi.
 */
function truncateResult(result, maxChars) {
  if (!result || typeof result !== 'object') return result;
  let json = JSON.stringify(result);
  if (json.length <= maxChars) return result;

  // Top-level array (masalan list_sources) uchun — ichidagi har source'ning sheets/columns'ini cheklaymiz
  if (Array.isArray(result)) {
    const cloned = JSON.parse(json);
    // 1. Har source'da sheet ichidagi cols'ni 10 ga cheklaymiz
    for (const src of cloned) {
      if (Array.isArray(src.sheets)) {
        for (const sh of src.sheets) {
          if (Array.isArray(sh.cols) && sh.cols.length > 10) {
            sh._colsFull = sh.cols.length;
            sh.cols = sh.cols.slice(0, 10);
          }
        }
      }
      if (Array.isArray(src.columns) && src.columns.length > 15) {
        src.columns = src.columns.slice(0, 15);
      }
    }
    json = JSON.stringify(cloned);
    if (json.length <= maxChars) return cloned;
    // Hali katta bo'lsa — sheets ro'yxatini qisqaroq shaklda
    for (const src of cloned) {
      if (Array.isArray(src.sheets)) {
        src.sheets = src.sheets.map(sh => ({ title: sh.title, rows: sh.rows, colTotal: sh.colTotal }));
      }
    }
    json = JSON.stringify(cloned);
    if (json.length <= maxChars) return cloned;
    return cloned.slice(0, Math.max(5, Math.floor(cloned.length / 2)));
  }

  // Massivlarni qisqartirib boramiz
  const cloned = JSON.parse(json);
  for (const arrayField of ['rows', 'groups', 'values', 'top', 'sheets', 'results', 'channels']) {
    if (Array.isArray(cloned[arrayField]) && cloned[arrayField].length > 5) {
      const original = cloned[arrayField].length;
      // Avval 50 tagacha kesamiz
      cloned[arrayField] = cloned[arrayField].slice(0, 50);
      cloned._truncated = true;
      cloned._note = `${arrayField} juda katta (${original} ta), ${cloned[arrayField].length} ta ko'rsatilmoqda. Aniq filter berib qaytarish so'rang.`;
      json = JSON.stringify(cloned);
      if (json.length <= maxChars) return cloned;
      // Hali katta — yana qisqartiramiz
      cloned[arrayField] = cloned[arrayField].slice(0, 20);
      json = JSON.stringify(cloned);
      if (json.length <= maxChars) return cloned;
      cloned[arrayField] = cloned[arrayField].slice(0, 10);
      json = JSON.stringify(cloned);
      if (json.length <= maxChars) return cloned;
    }
  }

  // Hali katta — har qatorni qisqartiramiz (ko'p ustunli sheet'lar uchun)
  if (Array.isArray(cloned.rows)) {
    cloned.rows = cloned.rows.map(r => {
      if (typeof r !== 'object') return r;
      const keys = Object.keys(r);
      if (keys.length <= 15) return r;
      const small = {};
      for (const k of keys.slice(0, 15)) small[k] = r[k];
      small._omittedFields = keys.length - 15;
      return small;
    });
    cloned._note = (cloned._note || '') + ` Har qatorda max 15 ustun ko'rsatilmoqda.`;
  }

  json = JSON.stringify(cloned);
  if (json.length > maxChars) {
    return {
      _truncated: true,
      _error: 'Natija juda katta — boshqa filter yoki konkret ustun nomini bering',
      _originalSize: json.length,
    };
  }
  return cloned;
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
  truncateResult,
};
