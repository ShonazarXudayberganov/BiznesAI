const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Multer sozlash — barcha fayl turlari
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '_' + Math.random().toString(36).slice(2);
    const ext = path.extname(file.originalname);
    cb(null, `${req.userId}_${unique}${ext}`);
  }
});

const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// ── POST /api/upload/parse-only ── (source siz — faqat matn ajratish, DB ga saqlamasdan)
router.post('/parse-only', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fayl kerak' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileName = req.file.originalname;
    let textContent = '';

    console.log(`[PARSE-ONLY] Parsing ${fileName} (${ext}, ${(req.file.size/1024).toFixed(1)}KB)`);

    if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        textContent = pdfData.text || '';
        console.log(`[PARSE-ONLY] PDF: ${pdfData.numpages} pages, ${textContent.length} chars`);
      } catch (e) {
        console.error('[PARSE-ONLY] PDF parse error:', e.message);
        textContent = '';
      }
    } else if (ext === '.docx' || ext === '.doc') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        textContent = result.value || '';
      } catch (e) { textContent = ''; }
    } else if (['.txt', '.csv', '.md', '.log'].includes(ext)) {
      textContent = fs.readFileSync(filePath, 'utf-8');
    }

    // Temp faylni o'chirish
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('[PARSE-ONLY] temp file unlink failed:', e.message);
    }

    res.json({
      ok: true,
      fileName,
      textLength: textContent.length,
      text: textContent.substring(0, 50000),
    });
  } catch (err) {
    console.error('[PARSE-ONLY] Error:', err.message);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// ── POST /api/upload/:sourceId/parse ── (fayl yuklash + parse + bazaga saqlash)
router.post('/:sourceId/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fayl kerak' });

    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.sourceId, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileName = req.file.originalname;
    let parsedData = [];
    let textContent = '';

    console.log(`[UPLOAD] Parsing ${fileName} (${ext}, ${(req.file.size/1024).toFixed(1)}KB)`);

    // ── PDF PARSE ──
    if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        textContent = pdfData.text || '';
        parsedData = [{
          _type: 'document',
          fileName,
          fileType: 'pdf',
          pages: pdfData.numpages || 0,
          textLength: textContent.length,
          content: textContent.substring(0, 100000), // Max 100K belgi
        }];
        console.log(`[UPLOAD] PDF: ${pdfData.numpages} pages, ${textContent.length} chars`);
      } catch (e) {
        console.error('[UPLOAD] PDF parse error:', e.message);
        parsedData = [{ _type: 'document', fileName, error: 'PDF parse xatosi: ' + e.message }];
      }
    }

    // ── WORD (DOCX) PARSE ──
    else if (ext === '.docx' || ext === '.doc') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        textContent = result.value || '';
        parsedData = [{
          _type: 'document',
          fileName,
          fileType: 'docx',
          textLength: textContent.length,
          content: textContent.substring(0, 100000),
        }];
        console.log(`[UPLOAD] DOCX: ${textContent.length} chars`);
      } catch (e) {
        console.error('[UPLOAD] DOCX parse error:', e.message);
        parsedData = [{ _type: 'document', fileName, error: 'Word parse xatosi: ' + e.message }];
      }
    }

    // ── EXCEL PARSE ──
    else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        workbook.SheetNames.forEach(sheetName => {
          const ws = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          rows.forEach(row => {
            row._sheet = sheetName;
            parsedData.push(row);
          });
        });
        console.log(`[UPLOAD] Excel: ${workbook.SheetNames.length} sheets, ${parsedData.length} rows`);
      } catch (e) {
        console.error('[UPLOAD] Excel parse error:', e.message);
        parsedData = [{ _type: 'document', fileName, error: 'Excel parse xatosi: ' + e.message }];
      }
    }

    // ── TXT/CSV/MD PARSE ──
    else if (['.txt', '.csv', '.md', '.log', '.json'].includes(ext)) {
      try {
        textContent = fs.readFileSync(filePath, 'utf-8');
        if (ext === '.json') {
          const jsonData = JSON.parse(textContent);
          parsedData = Array.isArray(jsonData) ? jsonData : [jsonData];
        } else {
          parsedData = [{
            _type: 'document',
            fileName,
            fileType: ext.slice(1),
            textLength: textContent.length,
            content: textContent.substring(0, 100000),
          }];
        }
      } catch (e) {
        parsedData = [{ _type: 'document', fileName, error: 'Parse xatosi: ' + e.message }];
      }
    }

    // ── RASM ──
    else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      parsedData = [{
        _type: 'image',
        fileName,
        fileType: ext.slice(1),
        size: req.file.size,
        path: `/uploads/${path.basename(req.file.path)}`,
      }];
    }

    else {
      parsedData = [{ _type: 'document', fileName, error: 'Bu format qo\'llab-quvvatlanmaydi' }];
    }

    // ── BAZAGA SAQLASH ──
    await pool.query(
      `INSERT INTO source_data (source_id, data, row_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
      [req.params.sourceId, JSON.stringify(parsedData), parsedData.length]
    );

    // Source files jadvaliga yozish
    await pool.query(
      `INSERT INTO source_files (source_id, filename, filepath, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.sourceId, fileName, req.file.path, req.file.size, req.file.mimetype]
    );

    // Source ni connected qilish
    await pool.query(
      `UPDATE sources SET connected=TRUE, updated_at=NOW() WHERE id=$1`,
      [req.params.sourceId]
    );

    console.log(`[UPLOAD] Saved ${parsedData.length} rows to DB for source ${req.params.sourceId}`);

    res.status(201).json({
      ok: true,
      fileName,
      fileType: ext.slice(1),
      rowCount: parsedData.length,
      textLength: textContent.length || 0,
      message: `${fileName} bazaga saqlandi (${parsedData.length} ta yozuv)`,
    });
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// ── POST /api/upload/:sourceId ── (oddiy fayl yuklash)
router.post('/:sourceId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fayl kerak' });
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.sourceId, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    await pool.query(
      `INSERT INTO source_files (source_id, filename, filepath, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.sourceId, req.file.originalname, req.file.path, req.file.size, req.file.mimetype]
    );

    res.status(201).json({ ok: true, filename: req.file.originalname, size: req.file.size });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// ── GET /api/upload/:sourceId ── (manba fayllari ro'yxati)
router.get('/:sourceId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sf.* FROM source_files sf
       JOIN sources s ON s.id=sf.source_id
       WHERE sf.source_id=$1 AND s.user_id=$2
       ORDER BY sf.uploaded_at DESC`,
      [req.params.sourceId, req.userId]
    );
    res.json(result.rows.map(f => ({
      id: f.id, filename: f.filename, size: f.size_bytes, uploadedAt: f.uploaded_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
