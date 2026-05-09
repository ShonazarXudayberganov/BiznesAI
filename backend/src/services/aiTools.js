/**
 * AI Tools — agent ishlatadigan vositalar.
 * Har vosita: nom, tavsif, JSON schema, executor.
 *
 * Provider-agnostic. aiProviders.js har provayder uchun moslashtiradi.
 */
const dataLayer = require('./dataLayer');
const userMemory = require('./userMemory');
const { detectTimeSeriesAnomalies } = require('./timeSeriesAnomaly');
const { comparePeriods: comparePeriodsService } = require('./comparePeriods');
const { forecastSeries } = require('./forecast');
const { getSpecialist } = require('./specialists');
const { generatePdf } = require('./pdfBuilder');

/**
 * Manba ruxsat tekshiruvi — foydalanuvchi tanlagan manbalardan tashqaridagiga ruxsat bermaslik.
 * runAgent ctx.allowedSourceIds bo'lsa — har tool input'idagi sourceId shu listda bo'lishi shart.
 *
 * @param {string} sourceId — tool input'dagi manba ID
 * @param {string[]|null} allowedSourceIds — null/undefined = barcha ruxsat
 * @returns {string|null} — error message yoki null (ruxsat berilgan)
 */
function checkSourceAccess(sourceId, allowedSourceIds) {
  if (!Array.isArray(allowedSourceIds) || allowedSourceIds.length === 0) return null;
  if (!sourceId) return null;
  if (allowedSourceIds.includes(sourceId)) return null;
  return `Manba "${sourceId}" foydalanuvchi tanlamagan. Faqat shu manbalardan foydalaning: ${allowedSourceIds.join(', ')}`;
}

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
    async execute({ organizationId, allowedSourceIds }) {
      const all = await dataLayer.listOrgSources(organizationId);
      // Foydalanuvchi tanlagan manbalardan tashqaridagilarini kesib tashlash
      if (Array.isArray(allowedSourceIds) && allowedSourceIds.length > 0 && Array.isArray(all)) {
        return all.filter(s => allowedSourceIds.includes(s.id));
      }
      return all;
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
    async execute({ sourceId, sheet, query, filter, limit, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
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
    async execute({ sourceId, sheet, column, func, filter, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
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
    async execute({ sourceId, sheet, groupColumn, aggColumn, func, filter, limit, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
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
    async execute({ sourceId, sheet, column, limit, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
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
    async execute({ organizationId, query, limit, allowedSourceIds }) {
      const result = await dataLayer.crossSourceSearch({ organizationId, query, limit });
      // Foydalanuvchi tanlagan manbalardan tashqaridagi natijalarni olib tashlash
      if (Array.isArray(allowedSourceIds) && allowedSourceIds.length > 0 && result?.results) {
        result.results = result.results.filter(r => allowedSourceIds.includes(r.sourceId));
        result.totalSources = result.results.length;
      }
      return result;
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
    async execute({ sourceId, sheet, select, where, groupBy, aggregates, orderBy, limit, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
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
    async execute({ sourceId, sheet, dateColumn, aggColumn, func, granularity, filter, limit, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
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
    async execute({ sourceId, allowedSourceIds }) {
      const denied = checkSourceAccess(sourceId, allowedSourceIds);
      if (denied) return { error: denied };
      return await dataLayer.getSourceSchema(sourceId);
    },
  },

  {
    name: 'semantic_search',
    description:
      "Manbalarda chuqur semantic qidiruv — savolga MA'NO jihatdan o'xshash qatorlar (RAG). " +
      "Kichik qator soni (<500) bo'lganda search_rows yetarli, lekin 1000+ qator bo'lsa " +
      "yoki fuzzy/erkin shaklda ('mart kechikishlari', 'eng katta xaridor') " +
      "savol bo'lsa — shu vositani ishlat. Vector embedding va keyword qidiruvni birlashtiradi (hybrid). " +
      "Faqat oldindan indexlangan manbalarda ishlaydi (admin paneldan re-index).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Qidiruv matni — savol, kalit so'zlar yoki tasnif" },
        sourceIds: {
          type: 'array',
          items: { type: 'string' },
          description: "Faqat shu manba ID'lari ichida qidirish (ixtiyoriy — bo'sh qoldirilsa hammasi)",
        },
        topK: { type: 'integer', description: "Max nechta natija (default 8)", minimum: 1, maximum: 30 },
      },
      required: ['query'],
    },
    async execute({ organizationId, query, sourceIds, topK, allowedSourceIds }) {
      const { retrieve, chunksToContext } = require('./retrieval/retriever');
      // Foydalanuvchi tanlagan manbalardan tashqarida bo'lmasin: sourceIds va allowedSourceIds kesishishi
      let effectiveIds = Array.isArray(sourceIds) && sourceIds.length > 0 ? sourceIds : undefined;
      if (Array.isArray(allowedSourceIds) && allowedSourceIds.length > 0) {
        effectiveIds = effectiveIds
          ? effectiveIds.filter(id => allowedSourceIds.includes(id))
          : allowedSourceIds;
        if (effectiveIds.length === 0) {
          return { error: 'Tanlangan manbalardan tashqaridagi manbalarda qidirish ruxsat etilmagan' };
        }
      }
      const result = await retrieve({
        query,
        organizationId,
        sourceIds: effectiveIds,
        topK: typeof topK === 'number' ? Math.max(1, Math.min(30, topK)) : 8,
      });
      return {
        query,
        mode: result.mode, // 'hybrid' | 'vector' | 'keyword' | 'no_results'
        count: result.chunks.length,
        chunks: result.chunks.map(c => ({
          sourceId: c.sourceId,
          sourceName: c.metadata?.sourceName,
          chunkIndex: c.chunkIndex,
          score: c.score || c.rrfScore,
          matchedBy: c.matchedBy || [c.source],
          content: c.content.slice(0, 1500), // tool natija qisqartirildi
          rowCount: c.metadata?.rowCount,
        })),
        context: chunksToContext(result.chunks, { maxChars: 6000 }),
      };
    },
  },

  {
    name: 'find_anomaly',
    description:
      "Vaqt qatorida anomaliyalarni topish — z-score'dan kuchliroq (mavsumiylik + trend dekompozitsiya). " +
      "Sotuv, daromad, mijoz oqimi kabi raqamli ko'rsatkichlar uchun ideal. " +
      "Avval time_series tool bilan ma'lumotni oling, keyin shu tool'ga uzating.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Manba ID' },
        dateColumn: { type: 'string', description: "Sana ustun nomi (masalan: 'Sana', 'Date')" },
        valueColumn: { type: 'string', description: "Raqamli ustun nomi (masalan: 'Summa', 'Daromad')" },
        granularity: { type: 'string', enum: ['day', 'week', 'month'], description: 'Granularity' },
        threshold: { type: 'number', description: "Modified z-score threshold (default 3.0). Past=ko'p anomaliya, baland=kam." },
      },
      required: ['sourceId', 'dateColumn', 'valueColumn'],
    },
    async execute({ organizationId, sourceId, dateColumn, valueColumn, granularity, threshold, allowedSourceIds }) {
      try {
        const denied = checkSourceAccess(sourceId, allowedSourceIds);
        if (denied) return { error: denied };
        const ts = await dataLayer.timeSeries({
          organizationId,
          sourceId,
          dateColumn,
          aggColumn: valueColumn,
          func: 'sum',
          granularity: granularity || 'day',
          limit: 365,
        });
        if (ts.error) return { error: ts.error };
        const points = ts.series || [];
        if (points.length === 0) {
          return { error: 'Vaqt qatori bo\'sh — sana yoki qiymat ustunlarini tekshiring' };
        }
        const tsInput = points.map(p => ({ date: p.bucket, value: Number(p.value) || 0 }));
        const result = detectTimeSeriesAnomalies(tsInput, {
          granularity: granularity || 'day',
          threshold: threshold || 3.0,
        });
        return {
          method: result.method,
          series_length: result.series_length || tsInput.length,
          anomalies_count: result.anomalies.length,
          anomalies: result.anomalies.slice(0, 30),
          trend_breaks: result.trendBreaks || [],
          summary_stats: result.decomposition ? {
            median_residual: result.decomposition.median_residual,
            mad: result.decomposition.mad,
          } : null,
        };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  {
    name: 'compare_periods',
    description:
      "Joriy davr vs oldingi davr taqqoslash. " +
      "Misol: Bu oy vs o'tgan oy, Bu hafta vs o'tgan hafta, Bu yil vs o'tgan yil shu davri (YoY). " +
      "Sotuv, daromad, mijoz oqimi kabi metrikalar uchun delta% chiqaradi. " +
      "Foydalanuvchi 'sotuv qanday o'sgan?', 'oldingi oyga nisbatan qancha?' deb so'rasa shu tool'ni ishlat.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Manba ID' },
        dateColumn: { type: 'string', description: "Sana ustun nomi" },
        valueColumn: { type: 'string', description: "Qiymat ustun nomi (yo'q bo'lsa qator soni)" },
        func: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'], description: 'Agregatsiya' },
        period: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'], description: 'Davr o\'lchami' },
        mode: { type: 'string', enum: ['previous', 'year_ago'], description: "previous=oldingi davr, year_ago=bir yil oldin shu davr" },
      },
      required: ['sourceId', 'dateColumn'],
    },
    async execute({ sourceId, dateColumn, valueColumn, func, period, mode, allowedSourceIds }) {
      try {
        const denied = checkSourceAccess(sourceId, allowedSourceIds);
        if (denied) return { error: denied };
        const r = await comparePeriodsService({
          sourceId, dateColumn, valueColumn,
          func: func || 'sum',
          period: period || 'month',
          mode: mode || 'previous',
          includeBreakdown: false,
        });
        return r;
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  {
    name: 'forecast',
    description:
      "Vaqt qatorini bashorat qilish (Holt-Winters / Holt linear). " +
      "Sotuv, daromad, mijoz oqimi kabi metrikalar uchun keyingi N kun/oy bashorati. " +
      "Foydalanuvchi 'kelasi oy qancha sotamiz?', 'keyingi 2 hafta prognozi' so'rasa shu tool. " +
      "Mavsumiylik (haftalik/oylik) avtomatik aniqlanadi. 95% confidence interval beradi.",
    input_schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Manba ID' },
        dateColumn: { type: 'string', description: "Sana ustun nomi" },
        valueColumn: { type: 'string', description: "Qiymat ustun (yo'q → count)" },
        horizon: { type: 'number', description: "Bashorat necha qadam oldinga (default 14, max 90)" },
        granularity: { type: 'string', enum: ['day', 'week', 'month'], description: 'Davr o\'lchami' },
        func: { type: 'string', enum: ['sum', 'avg', 'count'], description: 'Agregatsiya' },
      },
      required: ['sourceId', 'dateColumn'],
    },
    async execute({ organizationId, sourceId, dateColumn, valueColumn, horizon, granularity, func, allowedSourceIds }) {
      try {
        const denied = checkSourceAccess(sourceId, allowedSourceIds);
        if (denied) return { error: denied };
        const ts = await dataLayer.timeSeries({
          organizationId,
          sourceId,
          dateColumn,
          aggColumn: valueColumn,
          func: func || 'sum',
          granularity: granularity || 'day',
          limit: 730,
        });
        if (ts.error) return { error: ts.error };
        const points = ts.series || [];
        if (points.length < 4) {
          return { error: `Bashorat uchun kamida 4 nuqta kerak (${points.length} bor)` };
        }
        const tsInput = points.map(p => ({ date: p.bucket, value: Number(p.value) || 0 }));
        const r = forecastSeries(tsInput, {
          horizon: horizon || 14,
          granularity: granularity || 'day',
        });
        return {
          method: r.method,
          horizon: r.horizon,
          granularity: r.granularity,
          series_length: r.series_length,
          summary: r.summary,
          forecast: r.forecast,
          reason: r.reason,
        };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  {
    name: 'consult_specialist',
    description:
      "Maxsus mutaxassis sub-agentni chaqirish. Mutaxassislar: " +
      "sales_analyst (savdo tahlil), finance_reviewer (moliyaviy nazorat), " +
      "marketing_strategist (marketing/lid/kanal), operations_advisor (operatsion samaradorlik). " +
      "Murakkab biznes savol bo'yicha 2+ sohani qamragan tahlil kerak bo'lsa, har sohaga shu tool'ni alohida chaqir. " +
      "Mutaxassis o'z domenidagi tool'larni ishlatib, qisqa va aniq javob qaytaradi.",
    input_schema: {
      type: 'object',
      properties: {
        specialist: {
          type: 'string',
          enum: ['sales_analyst', 'finance_reviewer', 'marketing_strategist', 'operations_advisor'],
          description: 'Mutaxassis turi',
        },
        question: { type: 'string', description: "Mutaxassisga aniq savol (1-2 jumla)" },
        context: { type: 'string', description: "Qo'shimcha kontekst (ixtiyoriy)" },
      },
      required: ['specialist', 'question'],
    },
    async execute({ organizationId, userId, specialist, question, context, _depth, allowedSourceIds }) {
      try {
        if (_depth && _depth > 0) {
          return { error: 'Sub-agent boshqa sub-agentni chaqirolmaydi (recursion oldini olish)' };
        }
        const spec = getSpecialist(specialist);
        if (!spec) return { error: `Noma'lum mutaxassis: ${specialist}` };

        // Lazy require — circular import oldini olish (aiAgent.js → aiTools.js)
        const { runAgent } = require('./aiAgent');
        const fullMessage = context
          ? `Kontekst: ${context}\n\nSavol: ${question}`
          : question;

        const r = await runAgent({
          message: fullMessage,
          organizationId,
          userId,
          history: [],
          systemPromptExtra: spec.instruction,
          allowedTools: spec.allowedTools,
          allowedSourceIds, // Foydalanuvchi tanlagan manbalar — sub-agent ham shu bilan cheklanadi
          maxIter: spec.maxIter,
          thinkingBudget: spec.thinkingBudget,
          cache: true,
          webSearch: false,
        });

        return {
          specialist,
          role: spec.role,
          answer: r.reply,
          tool_calls_count: r.toolCalls?.length || 0,
          tools_used: (r.toolCalls || []).map(t => t.name),
          usage: r.usage,
        };
      } catch (e) {
        return { error: e.message };
      }
    },
  },

  {
    name: 'generate_pdf',
    description:
      "Foydalanuvchi PDF/hisobot so'rasa shu tool'ni chaqir. Premium dizaynli A4 PDF yaratadi: " +
      "title, summary card (asosiy raqam), bo'limlar (jadval, bullet, callout). " +
      "Tool natija URL qaytaradi — frontend foydalanuvchiga 'PDF yuklab olish' tugmasi ko'rsatadi. " +
      "Tahlil tugagandan keyin uning yakuniy ko'rinishi sifatida ham chaqirish mumkin.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Hisobot sarlavhasi (masalan: "Mart 2026 — Sotuv tahlili")' },
        subtitle: { type: 'string', description: "Qo'shimcha tavsif (ixtiyoriy)" },
        summary: {
          type: 'object',
          description: "Yuqori summary kartochka (ixtiyoriy)",
          properties: {
            headline: { type: 'string', description: "Asosiy ko'rsatkich nomi (masalan: \"Umumiy savdo\")" },
            value: { type: 'string', description: "Asosiy raqam (masalan: \"3.77B so'm\")" },
            change: { type: 'string', description: "O'zgarish (masalan: \"+12.2% o'tgan oyga\")" },
          },
        },
        sections: {
          type: 'array',
          description: "Hisobot bo'limlari ro'yxati",
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: "Bo'lim sarlavhasi (masalan: \"Top 5 mahsulot\")" },
              intro: { type: 'string', description: "Bo'lim kirish matni" },
              bullets: { type: 'array', items: { type: 'string' }, description: "Tezkor punktlar" },
              tables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    headers: { type: 'array', items: { type: 'string' } },
                    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                    note: { type: 'string' },
                  },
                  required: ['headers', 'rows'],
                },
              },
              callout: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['warning', 'tip', 'key', 'info', 'success'] },
                  title: { type: 'string' },
                  body: { type: 'string' },
                },
              },
              text: { type: 'string', description: "Yopiqi paragraf" },
            },
          },
        },
        footer: { type: 'string', description: "Pastki yozuv (ixtiyoriy)" },
      },
      required: ['title', 'sections'],
    },
    async execute({ title, subtitle, summary, sections, footer, organizationId }) {
      try {
        // Tashkilot nomi olish
        let orgName = 'Analix';
        if (organizationId) {
          try {
            const pool = require('../db/pool');
            const r = await pool.query('SELECT name FROM organizations WHERE id=$1', [organizationId]);
            if (r.rows[0]?.name) orgName = r.rows[0].name;
          } catch {}
        }
        const result = await generatePdf({ title, subtitle, summary, sections, footer, orgName });
        return result;
      } catch (e) {
        return { error: 'PDF yaratishda xato: ' + e.message };
      }
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
