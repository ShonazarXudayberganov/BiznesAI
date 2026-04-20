/**
 * Google Sheets routes.
 * Foydalanuvchi URL tashlaydi → tizim barcha varaqlarni oladi.
 */
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, checkPermission } = require('../middleware/auth');
const {
  extractWorkbookId,
  fetchWorkbookMeta,
  fetchWorkbookFull,
} = require('../services/sheetsParser');

const router = express.Router();
router.use(requireAuth);

// ════════════════════════════════════════════════
// POST /api/sheets/preview
// Body: { url }
// Foydalanuvchi URL kiritganda — varaqlar ro'yxati va asosiy info qaytariladi.
// ════════════════════════════════════════════════
router.post('/preview', async (req, res) => {
  try {
    const { url } = req.body || {};
    const id = extractWorkbookId(url);
    if (!id) return res.status(400).json({ error: 'URL noto\'g\'ri formatda' });
    const meta = await fetchWorkbookMeta(id);
    res.json({
      ok: true,
      workbookId: id,
      title: meta.title,
      sheetCount: meta.sheets.length,
      sheets: meta.sheets.map(s => ({
        title: s.title,
        rowCount: s.rowCount,
        colCount: s.colCount,
        hidden: s.hidden,
      })),
    });
  } catch (e) {
    console.error('[sheets/preview]', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════
// POST /api/sheets/fetch
// Body: { url, sourceId }
// URL'dan barcha varaqlarni yuklab, sourceId'ning source_data'siga yozadi.
// ════════════════════════════════════════════════
router.post('/fetch', checkPermission('can_add_sources'), async (req, res) => {
  try {
    const { url, sourceId } = req.body || {};
    if (!sourceId) return res.status(400).json({ error: 'sourceId kerak' });

    const id = extractWorkbookId(url);
    if (!id) return res.status(400).json({ error: 'URL noto\'g\'ri formatda' });

    // Source mavjudligini va tashkilotga tegishliligini tekshirish
    const own = await pool.query(
      `SELECT id, type FROM sources WHERE id=$1 AND organization_id=$2`,
      [sourceId, req.user.organization_id]
    );
    if (own.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });
    if (own.rows[0].type !== 'sheets') return res.status(400).json({ error: 'Manba turi sheets emas' });

    // Yuklash
    const wb = await fetchWorkbookFull(id);

    // source_data'ga yozish — har varaq alohida obyekt sifatida
    // Frontend kontekst quruvchisi bu strukturani biladi
    const dataPayload = wb.sheets.map(s => ({
      _sheet: s.title,
      _hidden: s.hidden,
      _rowCount: s.rowCount,
      _rawRowCount: s.rawRowCount,
      _rawColCount: s.rawColCount,
      _headerRow: s.headerRow,
      _error: s.error || null,
      headers: s.headers,
      rows: s.rows,         // AI uchun obyekt qatorlar (header'dan keyingi)
      rawRows: s.rawRows,   // To'liq A1..oxirgi qator (har qator massiv shaklida)
    }));

    await pool.query(
      `INSERT INTO source_data (source_id, data, row_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source_id) DO UPDATE SET
         data = EXCLUDED.data,
         row_count = EXCLUDED.row_count,
         updated_at = NOW()`,
      [sourceId, JSON.stringify(dataPayload), wb.totalRows]
    );

    // Source config va connected = true
    await pool.query(
      `UPDATE sources SET
         connected = TRUE,
         config = COALESCE(config, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
       WHERE id=$1`,
      [sourceId, JSON.stringify({
        url,
        workbookId: id,
        workbookTitle: wb.title,
        sheetCount: wb.sheets.length,
        totalRows: wb.totalRows,
        lastFetch: new Date().toISOString(),
      })]
    );

    res.json({
      ok: true,
      workbookTitle: wb.title,
      sheetCount: wb.sheets.length,
      totalRows: wb.totalRows,
      sheets: wb.sheets.map(s => ({
        title: s.title,
        rowCount: s.rowCount,
        hidden: s.hidden,
        error: s.error || null,
      })),
    });
  } catch (e) {
    console.error('[sheets/fetch]', e.message);
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
