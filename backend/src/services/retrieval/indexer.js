/**
 * Indexer — manba ma'lumotlarini chunk'larga bo'lib, source_chunks jadvaliga yozadi.
 *
 * Ishlash:
 *   1. Source'ni o'qiymiz (sources + source_data jadvallari)
 *   2. chunkSourceData() bilan chunk'larga bo'lamiz
 *   3. embedTexts() (Voyage) bilan vector'larni hisoblaymiz (mavjud bo'lsa)
 *   4. source_chunks ga UPSERT — eski chunklar avval o'chiriladi
 *
 * Foydalanish:
 *   await indexSource(sourceId, organizationId);
 *   await indexAllSources(organizationId);
 *
 * Trigger:
 *   - Manualdan: HTTP endpoint orqali
 *   - Avtomatik: source_data UPDATE bo'lsa background task (Faza 5'da)
 */

const pool = require('../../db/pool');
const { chunkSourceData } = require('./chunker');
const { embedTexts, vectorToPgString, isAvailable: embeddingAvailable, DEFAULT_MODEL } = require('./embedder');

async function loadSource(sourceId, organizationId) {
  const r = await pool.query(
    `SELECT s.id, s.name, s.type, s.config, s.organization_id,
            COALESCE(sd.data, '[]'::jsonb) AS data
     FROM sources s
     LEFT JOIN source_data sd ON sd.source_id = s.id
     WHERE s.id = $1 ${organizationId != null ? 'AND s.organization_id = $2' : ''}`,
    organizationId != null ? [sourceId, organizationId] : [sourceId]
  );
  return r.rows[0] || null;
}

/**
 * Bitta source'ni indexlash. Eski chunklar o'chadi, yangi yoziladi.
 * @param {string} sourceId
 * @param {number} organizationId
 * @param {object} [opts]
 * @param {boolean} [opts.skipEmbedding=false] — Voyage'ga yubormaslik (rate limit yoki tezlik uchun)
 */
async function indexSource(sourceId, organizationId, opts = {}) {
  const source = await loadSource(sourceId, organizationId);
  if (!source) {
    return { ok: false, error: `Source topilmadi: ${sourceId}` };
  }

  const data = Array.isArray(source.data) ? source.data : [];
  const chunks = chunkSourceData({
    id: source.id,
    name: source.name,
    type: source.type,
    data,
  });

  // Eski chunklar
  await pool.query(`DELETE FROM source_chunks WHERE source_id = $1`, [sourceId]);

  if (chunks.length === 0) {
    return { ok: true, sourceId, chunks: 0, embedded: 0, mode: 'no_data' };
  }

  // Embedding (agar Voyage mavjud va skipEmbedding bo'lmasa)
  let vectors = null;
  let embedded = 0;
  let mode = 'keyword_only';
  if (embeddingAvailable() && !opts.skipEmbedding) {
    try {
      vectors = await embedTexts(chunks.map(c => c.content), { inputType: 'document' });
      if (vectors && vectors.length === chunks.length) {
        embedded = vectors.length;
        mode = 'embedded';
      } else {
        mode = 'embed_partial';
      }
    } catch (e) {
      console.warn('[indexer] embedding xato, keyword-only saqlanadi:', e.message);
      mode = 'embed_failed';
    }
  } else if (opts.skipEmbedding) {
    mode = 'keyword_only_forced';
  }

  // Insert
  const orgId = source.organization_id || organizationId;
  const inserts = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const v = vectors ? vectors[i] : null;
    if (v) {
      inserts.push(pool.query(
        `INSERT INTO source_chunks
          (source_id, organization_id, chunk_index, content, metadata, embedding, embed_model, token_count)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
        [sourceId, orgId, c.chunkIndex, c.content, JSON.stringify(c.metadata || {}), vectorToPgString(v), DEFAULT_MODEL, c.tokenEstimate || null]
      ));
    } else {
      // embedding NULL — keyword-only mode
      inserts.push(pool.query(
        `INSERT INTO source_chunks
          (source_id, organization_id, chunk_index, content, metadata, token_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sourceId, orgId, c.chunkIndex, c.content, JSON.stringify(c.metadata || {}), c.tokenEstimate || null]
      ));
    }
  }
  await Promise.all(inserts);

  return { ok: true, sourceId, sourceName: source.name, chunks: chunks.length, embedded, mode };
}

/**
 * Tashkilot ichidagi barcha source'larni indexlash.
 * @param {number} organizationId
 * @param {object} [opts]
 * @param {boolean} [opts.skipEmbedding=false]
 */
async function indexAllSources(organizationId, opts = {}) {
  const r = await pool.query(
    `SELECT id FROM sources WHERE organization_id = $1 AND COALESCE(active, true) = true`,
    [organizationId]
  );
  const results = [];
  for (const row of r.rows) {
    try {
      const out = await indexSource(row.id, organizationId, opts);
      results.push(out);
    } catch (e) {
      results.push({ ok: false, sourceId: row.id, error: e.message });
    }
  }
  return results;
}

/**
 * Statistika — qancha chunk va embedded.
 */
async function indexStats(organizationId) {
  const r = await pool.query(
    `SELECT
       COUNT(*) AS total_chunks,
       COUNT(embedding) AS embedded_chunks,
       COUNT(DISTINCT source_id) AS sources_indexed
     FROM source_chunks
     WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows[0];
}

module.exports = {
  indexSource,
  indexAllSources,
  indexStats,
};
