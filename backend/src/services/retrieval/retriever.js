/**
 * Hybrid retriever — vector (semantic) + keyword (BM25-like) qidiruv.
 *
 * Strategiya:
 *  1. Agar Voyage embedding mavjud bo'lsa: query'ni embed qilamiz, cosine similarity bilan top-K chunk
 *  2. Bir vaqtda keyword search (Postgres ts_rank) bilan top-K chunk
 *  3. Reciprocal Rank Fusion (RRF) bilan ikkalasini birlashtiramiz
 *  4. Yakuniy top-K natija qaytadi
 *
 * Embedding bo'lmasa (VOYAGE_API_KEY yo'q) — faqat keyword qaytaradi (graceful degrade).
 */

const pool = require('../../db/pool');
const { embedQuery, isAvailable: embeddingAvailable, vectorToPgString } = require('./embedder');

const RRF_K = 60; // standard reciprocal rank fusion constant

/**
 * Vector qidiruv: cosine similarity orqali top-K chunk.
 * @returns {Promise<Array<{id, content, metadata, score, source}>>}
 */
async function vectorSearch({ queryEmbedding, sourceIds, organizationId, topK = 20 }) {
  if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];
  const vec = vectorToPgString(queryEmbedding);
  if (!vec) return [];

  const conditions = ['embedding IS NOT NULL'];
  const params = [vec];
  if (organizationId != null) {
    params.push(organizationId);
    conditions.push(`organization_id = $${params.length}`);
  }
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    params.push(sourceIds);
    conditions.push(`source_id = ANY($${params.length}::text[])`);
  }
  params.push(topK);
  const sql = `
    SELECT id, source_id, chunk_index, content, metadata,
           1 - (embedding <=> $1::vector) AS similarity
    FROM source_chunks
    WHERE ${conditions.join(' AND ')}
    ORDER BY embedding <=> $1::vector
    LIMIT $${params.length}
  `;
  const r = await pool.query(sql, params);
  return r.rows.map(row => ({
    id: row.id,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    score: parseFloat(row.similarity),
    source: 'vector',
  }));
}

/**
 * Keyword qidiruv: Postgres ts_rank.
 */
async function keywordSearch({ query, sourceIds, organizationId, topK = 20 }) {
  if (!query || !query.trim()) return [];
  const conditions = [`to_tsvector('simple', content) @@ plainto_tsquery('simple', $1)`];
  const params = [query];
  if (organizationId != null) {
    params.push(organizationId);
    conditions.push(`organization_id = $${params.length}`);
  }
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    params.push(sourceIds);
    conditions.push(`source_id = ANY($${params.length}::text[])`);
  }
  params.push(topK);
  const sql = `
    SELECT id, source_id, chunk_index, content, metadata,
           ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', $1)) AS rank
    FROM source_chunks
    WHERE ${conditions.join(' AND ')}
    ORDER BY rank DESC
    LIMIT $${params.length}
  `;
  const r = await pool.query(sql, params);
  return r.rows.map(row => ({
    id: row.id,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    score: parseFloat(row.rank),
    source: 'keyword',
  }));
}

/**
 * Reciprocal Rank Fusion — vector va keyword natijalarini birlashtirish.
 */
function rrfFuse(vectorResults, keywordResults, k = RRF_K) {
  const scores = new Map(); // id -> { item, rrf }
  vectorResults.forEach((item, idx) => {
    const cur = scores.get(item.id) || { item, rrf: 0, sources: [] };
    cur.rrf += 1 / (k + idx + 1);
    cur.sources = [...cur.sources, 'vector'];
    cur.item = item;
    scores.set(item.id, cur);
  });
  keywordResults.forEach((item, idx) => {
    const cur = scores.get(item.id) || { item, rrf: 0, sources: [] };
    cur.rrf += 1 / (k + idx + 1);
    cur.sources = [...cur.sources, 'keyword'];
    cur.item = item;
    scores.set(item.id, cur);
  });
  return Array.from(scores.values())
    .sort((a, b) => b.rrf - a.rrf)
    .map(({ item, rrf, sources }) => ({
      ...item,
      rrfScore: rrf,
      matchedBy: Array.from(new Set(sources)),
    }));
}

/**
 * Hybrid retrieval — vector + keyword + RRF.
 *
 * @param {object} opts
 * @param {string} opts.query — foydalanuvchi savoli yoki kalit so'zlar
 * @param {number} [opts.organizationId]
 * @param {string[]} [opts.sourceIds] — faqat shu source'lar ichida qidir
 * @param {number} [opts.topK=10] — yakuniy natija soni
 * @returns {Promise<{chunks: Array, mode: string}>}
 */
async function retrieve({ query, organizationId, sourceIds, topK = 10 } = {}) {
  if (!query || !query.trim()) return { chunks: [], mode: 'empty' };

  const useVector = embeddingAvailable();
  let vectorResults = [];
  let keywordResults = [];

  // Parallel
  const tasks = [];
  if (useVector) {
    tasks.push((async () => {
      try {
        const qVec = await embedQuery(query);
        if (qVec) {
          vectorResults = await vectorSearch({ queryEmbedding: qVec, sourceIds, organizationId, topK: topK * 2 });
        }
      } catch (e) {
        console.warn('[retriever] vector search xato:', e.message);
      }
    })());
  }
  tasks.push((async () => {
    try {
      keywordResults = await keywordSearch({ query, sourceIds, organizationId, topK: topK * 2 });
    } catch (e) {
      console.warn('[retriever] keyword search xato:', e.message);
    }
  })());

  await Promise.all(tasks);

  let mode;
  let final;
  if (vectorResults.length > 0 && keywordResults.length > 0) {
    mode = 'hybrid';
    final = rrfFuse(vectorResults, keywordResults).slice(0, topK);
  } else if (vectorResults.length > 0) {
    mode = 'vector';
    final = vectorResults.slice(0, topK);
  } else if (keywordResults.length > 0) {
    mode = 'keyword';
    final = keywordResults.slice(0, topK);
  } else {
    mode = 'no_results';
    final = [];
  }

  return { chunks: final, mode };
}

/**
 * Retrieved chunk'larni AI uchun matn kontekstga aylantirish.
 */
function chunksToContext(chunks, opts = {}) {
  if (!chunks || chunks.length === 0) return '';
  const maxChars = opts.maxChars || 8000;
  const parts = [];
  let total = 0;
  for (const c of chunks) {
    const block = `--- Manba: ${c.metadata?.sourceName || c.sourceId} (chunk ${c.chunkIndex}) ---\n${c.content}\n`;
    if (total + block.length > maxChars) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n');
}

module.exports = {
  retrieve,
  vectorSearch,
  keywordSearch,
  rrfFuse,
  chunksToContext,
};
