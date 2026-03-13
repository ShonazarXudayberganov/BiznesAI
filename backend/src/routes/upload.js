const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Multer sozlash
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '_' + Math.random().toString(36).slice(2);
    const ext = path.extname(file.originalname);
    cb(null, `${req.userId}_${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/json',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Faqat Excel, CSV yoki JSON fayllar ruxsat etiladi'));
    }
  }
});

// ── POST /api/upload/:sourceId ── (fayl yuklash)
router.post('/:sourceId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fayl kerak' });
    }

    // Manbani tekshirish
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [req.params.sourceId, req.userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Manba topilmadi' });
    }

    // DB ga yozish
    await pool.query(
      `INSERT INTO source_files (source_id, filename, filepath, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.sourceId, req.file.originalname, req.file.path, req.file.size, req.file.mimetype]
    );

    res.status(201).json({
      ok: true,
      filename: req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
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
      id: f.id,
      filename: f.filename,
      size: f.size_bytes,
      uploadedAt: f.uploaded_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
