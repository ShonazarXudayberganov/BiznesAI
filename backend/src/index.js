/**
 * BiznesAI Backend — Node.js + Express + PostgreSQL
 * Barcha API endpointlar shu yerda birlashadi
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Nginx proxy for rate limiting
app.set('trust proxy', 1);

// ── Middleware ──
// Helmet: default himoya + cross-origin resource policy frontend/backend bir domendan berilganda ishlaydi.
// CSP default'ni o'chirib qo'ydik — SPA inline style/script uchun alohida tuning kerak.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? undefined  // production da same-origin (nginx proxy)
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

// Payload limit — katta AI context va website scrape natijalari uchun 15MB yetarli
const JSON_LIMIT = process.env.JSON_BODY_LIMIT || '15mb';
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// Rate limiting — per-IP. Login/register uchun alohida stricter limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 daqiqa
  max: parseInt(process.env.RATE_LIMIT_MAX || '500', 10),
  message: { error: 'Juda ko\'p so\'rov. 15 daqiqadan keyin qaytib urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Auth endpointlari uchun brute-force himoyasi
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  message: { error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});
app.use(['/api/auth/login', '/api/auth/register'], authLimiter);

// Static uploads
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')));

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sources', require('./routes/sources'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/scrape', require('./routes/scrape'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/super-admin', require('./routes/super-admin'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/internal', require('./routes/internal'));

// ── Health check ──
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'connected',
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ── 404 handler ──
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint topilmadi' });
});

// ── Error handler ──
app.use((err, req, res, next) => {
  // Multer'dan keladigan hajm xatosi — aniq xabar berish
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fayl hajmi juda katta' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'So\'rov tanasi juda katta' });
  }
  console.error('[ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Server xatosi' : err.message,
  });
});

// ── Process-level error handlers ──
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err.stack || err.message);
  // Kritik xato — process'ni restart qilishga imkon berish uchun chiqamiz
  setTimeout(() => process.exit(1), 200);
});

// ── Start server ──
async function start() {
  // DB ulanishni tekshirish (retry bilan)
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log(`[DB] ✓ PostgreSQL ulandi`);
      break;
    } catch (err) {
      console.log(`[DB] Ulanish kutilmoqda... (${attempt}/10)`);
      if (attempt === 10) {
        console.error('[DB] ✗ PostgreSQL ga ulanib bo\'lmadi:', err.message);
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Auto-migrate
  try {
    const migrate = require('./db/migrate');
    await migrate(false); // don't end pool
  } catch (e) {
    console.error('[MIGRATE] Auto-migration error:', e.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════╗
║  BiznesAI Backend                         ║
║  Port: ${PORT}                              ║
║  ENV:  ${process.env.NODE_ENV || 'development'}                     ║
║  DB:   ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}      ║
╚═══════════════════════════════════════════╝
    `);
  });
}

start();
