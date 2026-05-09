/**
 * Voyage AI embedding client.
 *
 * Voyage 3-large — 1024 dim, multilingual, Russian/Uzbek matnlar uchun yuqori sifat.
 *
 * Env:
 *   VOYAGE_API_KEY — Voyage API kalit (https://www.voyageai.com/)
 *
 * Foydalanish:
 *   const { embedTexts } = require('./embedder');
 *   const vectors = await embedTexts(['matn 1', 'matn 2'], { inputType: 'document' });
 *   // vectors = [[0.012, -0.034, ...], [0.045, ...]]  (1024 dim har biri)
 *
 * Agar VOYAGE_API_KEY o'rnatilmagan bo'lsa: null qaytaradi (fallback rejim).
 * Bunday holda retriever faqat keyword search ishlatadi.
 */

const VOYAGE_BASE_URL = 'https://api.voyageai.com/v1/embeddings';
const DEFAULT_MODEL = 'voyage-3-large';
const DEFAULT_DIM = 1024;
// Free tier (payment method qo'shilmagan): 3 RPM, 10K TPM. Standard: 1000+ RPM.
// Default qiymat — free tier xavfsiz.
const MAX_BATCH = parseInt(process.env.VOYAGE_MAX_BATCH || '20', 10);    // ~8K token/batch
const INTER_CALL_DELAY = parseInt(process.env.VOYAGE_DELAY_MS || '22000', 10); // 22 sek (3 RPM safety)
const MAX_TOKENS = 32000;

/**
 * Matnlarni embedding vector'larga aylantiradi.
 * @param {string[]} texts
 * @param {object} [opts]
 * @param {'document'|'query'} [opts.inputType='document']
 * @param {string} [opts.model] — default 'voyage-3-large'
 * @param {string} [opts.apiKey] — default process.env.VOYAGE_API_KEY
 * @returns {Promise<number[][]|null>} — null agar API kalit yo'q yoki xato
 */
async function embedTexts(texts, opts = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const apiKey = opts.apiKey || process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    if (!embedTexts._warned) {
      console.warn('[embedder] VOYAGE_API_KEY o\'rnatilmagan — embedding o\'chirilgan, faqat keyword search ishlaydi');
      embedTexts._warned = true;
    }
    return null;
  }

  const model = opts.model || DEFAULT_MODEL;
  const inputType = opts.inputType === 'query' ? 'query' : 'document';

  // Batchlarga bo'lish (Voyage API: max 96 input per call)
  const batches = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    batches.push(texts.slice(i, i + MAX_BATCH));
  }

  const allVectors = [];
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    let attempt = 0;
    let lastErr;
    let success = false;
    while (attempt < 5) {
      attempt++;
      try {
        const res = await fetch(VOYAGE_BASE_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: batch,
            model,
            input_type: inputType,
            output_dimension: DEFAULT_DIM,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(`Voyage ${res.status}: ${json.detail || json.error?.message || JSON.stringify(json).slice(0, 200)}`);
        }
        const vectors = (json.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding);
        if (vectors.length !== batch.length) {
          throw new Error(`Voyage qaytargan vector soni mos kelmadi: ${vectors.length} vs ${batch.length}`);
        }
        allVectors.push(...vectors);
        success = true;
        break;
      } catch (e) {
        lastErr = e;
        const is429 = /\b429\b|rate limit|reduced rate/i.test(e.message);
        const transient = is429 || /timeout|503|502|reset|temporarily/i.test(e.message);
        if (!transient || attempt === 5) break;
        // 429 uchun uzunroq backoff (free tier: 22-30s kutish)
        const wait = is429 ? Math.max(INTER_CALL_DELAY, 22000 * attempt) : (1000 * Math.pow(2, attempt - 1));
        if (attempt === 1) console.warn(`[embedder] batch ${bi} retry: ${e.message.slice(0, 80)} — ${wait}ms kutish`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    if (!success) {
      console.error('[embedder] batch', bi, 'yakuniy xato:', lastErr?.message);
      return null; // partial qaytarmaymiz
    }
    // Batchlar orasida free tier uchun pauza (oxirgi batch'dan keyin pauza yo'q)
    if (bi < batches.length - 1 && INTER_CALL_DELAY > 0) {
      await new Promise(r => setTimeout(r, INTER_CALL_DELAY));
    }
  }
  return allVectors;
}

/**
 * Bitta query matn uchun embedding (helper).
 */
async function embedQuery(text, opts = {}) {
  const out = await embedTexts([text], { ...opts, inputType: 'query' });
  return out ? out[0] : null;
}

/**
 * Embedding mavjud va sozlanganmi?
 */
function isAvailable() {
  return !!(process.env.VOYAGE_API_KEY);
}

/**
 * Vector'ni Postgres pgvector formatiga aylantirish: "[0.1,0.2,...]"
 */
function vectorToPgString(vec) {
  if (!Array.isArray(vec)) return null;
  return '[' + vec.map(v => Number.isFinite(v) ? v.toFixed(6) : 0).join(',') + ']';
}

module.exports = {
  embedTexts,
  embedQuery,
  isAvailable,
  vectorToPgString,
  DEFAULT_MODEL,
  DEFAULT_DIM,
};
