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

// ── Middleware ──
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? undefined  // production da same-origin (nginx proxy)
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' })); // Katta data uchun
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 daqiqa
  max: 500,                  // max 500 so'rov / 15 min
  message: { error: 'Juda ko\'p so\'rov. 15 daqiqadan keyin qaytib urinib ko\'ring.' },
});
app.use('/api/', limiter);

// Static uploads
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')));

// ── Routes ──
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/sources',  require('./routes/sources'));
app.use('/api/alerts',   require('./routes/alerts'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/ai',       require('./routes/ai'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/upload',   require('./routes/upload'));
app.use('/api/admin',    require('./routes/admin'));

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
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Server xatosi' : err.message,
  });
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
    const bcrypt = require('bcryptjs');
    const migrate = require('./db/migrate');
  } catch (e) {
    // Migration alohida ishga tushiriladi (npm run migrate)
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
