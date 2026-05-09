/**
 * RAG endpoint'lari — manbalarni indexlash va qidirish (admin/debug).
 *
 *   POST /api/ai/rag/reindex          — barcha source'larni qayta indexlash
 *   POST /api/ai/rag/reindex/:sourceId — bittasini
 *   GET  /api/ai/rag/stats             — necha chunk indexed
 *   POST /api/ai/rag/search            — debug retrieve (foydalanuvchi UI'da ishlatilmaydi)
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { indexSource, indexAllSources, indexStats } = require('../services/retrieval/indexer');
const { retrieve } = require('../services/retrieval/retriever');
const { isAvailable: embeddingAvailable } = require('../services/retrieval/embedder');

const router = express.Router();

// ── GET /api/ai/rag/stats ──
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json({ embedding: embeddingAvailable(), total_chunks: 0, embedded_chunks: 0, sources_indexed: 0, note: 'tashkilot yo\'q' });
    const stats = await indexStats(orgId);
    res.json({
      embedding: embeddingAvailable(),
      ...stats,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/ai/rag/reindex/:sourceId ──
// Query: ?embed=false → Voyage chaqirmaydi, faqat keyword (tezroq, free-tier safe)
router.post('/reindex/:sourceId', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });
    const skipEmbedding = req.query.embed === 'false' || req.body?.embed === false;
    const result = await indexSource(req.params.sourceId, orgId, { skipEmbedding });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/ai/rag/reindex ── barcha source
// Query: ?embed=false → keyword-only (free tier'da tez)
router.post('/reindex', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });
    const skipEmbedding = req.query.embed === 'false' || req.body?.embed === false;
    const results = await indexAllSources(orgId, { skipEmbedding });
    res.json({
      ok: true,
      count: results.length,
      skipEmbedding,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/ai/rag/search ── debug
router.post('/search', requireAuth, async (req, res) => {
  try {
    const { query, sourceIds, topK } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query kerak' });
    const orgId = req.user.organization_id;
    const result = await retrieve({ query, organizationId: orgId, sourceIds, topK: topK || 10 });
    res.json({
      ok: true,
      query,
      mode: result.mode,
      count: result.chunks.length,
      chunks: result.chunks.map(c => ({
        sourceId: c.sourceId,
        sourceName: c.metadata?.sourceName,
        chunkIndex: c.chunkIndex,
        score: c.score || c.rrfScore,
        matchedBy: c.matchedBy || [c.source],
        preview: c.content.slice(0, 400),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
