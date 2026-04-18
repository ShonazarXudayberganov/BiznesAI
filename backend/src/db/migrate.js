/**
 * BiznesAI — Database Migration
 * PostgreSQL schema yaratish
 */
require('dotenv').config();
const pool = require('./pool');

const SCHEMA = `
-- ══════════════════════════════════════════════
-- USERS
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  DEFAULT 'user',       -- user | admin
  plan          VARCHAR(20)  DEFAULT 'free',       -- free | starter | pro | enterprise
  avatar_url    TEXT,
  phone         VARCHAR(20),

  -- AI usage tracking (oylik)
  ai_requests_used  INT DEFAULT 0,
  ai_requests_month VARCHAR(7),  -- '2026-03' format

  -- Timestamps
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- SOURCES (Data Hub manbalari)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sources (
  id          VARCHAR(64) PRIMARY KEY,   -- frontend dan kelgan id (timestamp_random)
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL,      -- excel | sheets | api | instagram | telegram | crm | manual
  name        VARCHAR(255) NOT NULL,
  color       VARCHAR(50) DEFAULT 'var(--teal)',
  connected   BOOLEAN DEFAULT FALSE,
  active      BOOLEAN DEFAULT TRUE,
  config      JSONB DEFAULT '{}',        -- type-specific config (url, token, etc)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);

-- ══════════════════════════════════════════════
-- SOURCE_DATA (manba ma'lumotlari — katta JSONB)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS source_data (
  source_id   VARCHAR(64) PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  data        JSONB DEFAULT '[]',        -- massiv: [{col1: val1, ...}, ...]
  row_count   INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- SOURCE_FILES (yuklangan fayllar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS source_files (
  id          SERIAL PRIMARY KEY,
  source_id   VARCHAR(64) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  filename    VARCHAR(255) NOT NULL,
  filepath    TEXT NOT NULL,             -- server dagi path
  size_bytes  INT DEFAULT 0,
  mime_type   VARCHAR(100),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_files_source ON source_files(source_id);

-- ══════════════════════════════════════════════
-- ALERTS (AI ogohlantirishlar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  message     TEXT,
  type        VARCHAR(20) DEFAULT 'info',  -- info | warn | ok | danger
  icon        VARCHAR(10),
  read        BOOLEAN DEFAULT FALSE,
  source_name VARCHAR(255),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

-- ══════════════════════════════════════════════
-- REPORTS (AI hisobotlar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reports (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL,
  icon        VARCHAR(10),
  category    VARCHAR(50),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);

-- ══════════════════════════════════════════════
-- CHAT_HISTORY (suhbat tarixi)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_history (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL,       -- user | assistant
  content     TEXT NOT NULL,
  src_names   TEXT[],                     -- tanlangan manba nomlari
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);

-- ══════════════════════════════════════════════
-- PAYMENTS (to'lovlar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL,            -- so'm da
  plan_id     VARCHAR(20) NOT NULL,       -- qaysi tarifga
  method      VARCHAR(50),                -- payme | click | manual
  status      VARCHAR(20) DEFAULT 'pending', -- pending | completed | failed
  reference   VARCHAR(255),               -- to'lov tizimi reference
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- ══════════════════════════════════════════════
-- AI_CONFIG (foydalanuvchi AI sozlamalari)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_config (
  user_id     INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider    VARCHAR(20) DEFAULT 'deepseek',
  model       VARCHAR(50) DEFAULT 'deepseek-chat',
  api_key     TEXT,                        -- shifrlangan
  all_keys    JSONB DEFAULT '{}',          -- {deepseek: "...", openai: "..."}
  auto_report BOOLEAN DEFAULT FALSE,
  report_time VARCHAR(5) DEFAULT '09:00',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- GLOBAL_SETTINGS (admin global sozlamalar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS global_settings (
  key         VARCHAR(50) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- SESSIONS (aktiv sessiyalar va login tarixi)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
  id            VARCHAR(64) PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device        VARCHAR(255),
  ip            VARCHAR(45),
  location      VARCHAR(255),
  remember      BOOLEAN DEFAULT FALSE,
  last_active   TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expired       BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_id, expired);

CREATE TABLE IF NOT EXISTS login_history (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device        VARCHAR(255),
  ip            VARCHAR(45),
  status        VARCHAR(20) DEFAULT 'success',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_user_created ON login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_data_updated ON source_data(updated_at DESC);
`;

async function migrate(shouldEndPool = true) {
  console.log('[MIGRATE] Starting database migration...');
  try {
    await pool.query(SCHEMA);
    console.log('[MIGRATE] ✓ All tables created successfully');

    // Default admin — faqat ADMIN_PASSWORD env berilganda yaratamiz (kodda hardcoded parol yo'q)
    const adminEmail = (process.env.ADMIN_EMAIL || 'biznesadmin@gmail.com').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword && adminPassword.length >= 8) {
      const bcrypt = require('bcryptjs');
      const existing = await pool.query('SELECT id FROM users WHERE email=$1', [adminEmail]);
      if (existing.rows.length === 0) {
        const adminHash = await bcrypt.hash(adminPassword, 12);
        await pool.query(
          `INSERT INTO users (name, email, password_hash, role, plan)
           VALUES ('Admin', $1, $2, 'admin', 'enterprise')`,
          [adminEmail, adminHash]
        );
        console.log(`[MIGRATE] ✓ Admin yaratildi: ${adminEmail}`);
      }
    } else if (!process.env.ADMIN_PASSWORD) {
      console.warn('[MIGRATE] ⚠ ADMIN_PASSWORD env yo\'q — default admin yaratilmadi');
    }

    // Insert default global settings
    await pool.query(`
      INSERT INTO global_settings (key, value)
      VALUES ('global_ai', '{}'), ('plan_prices', '{}')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('[MIGRATE] ✓ Default settings inserted');

    // Verify
    const res = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('[MIGRATE] Tables:', res.rows.map(r => r.table_name).join(', '));

  } catch (err) {
    console.error('[MIGRATE] ✗ Error:', err.message);
    if (require.main === module) process.exit(1);
    throw err;
  } finally {
    if (shouldEndPool && require.main === module) {
      await pool.end();
      console.log('[MIGRATE] Pool closed.');
    }
    console.log('[MIGRATE] Done.');
  }
}

if (require.main === module) {
  migrate(true);
}

module.exports = migrate;
