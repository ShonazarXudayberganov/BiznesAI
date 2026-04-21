/**
 * BiznesAI — Database Migration
 * PostgreSQL schema yaratish + v2 multi-organization migratsiyasi
 *
 * Idempotent: ko'p marta ishlatish mumkin, mavjud ma'lumot yo'qolmaydi.
 * Ma'lumot ko'chirish (v2) bitta global_settings flag bilan himoyalangan — bir marta ishlaydi.
 */
require('dotenv').config();
const pool = require('./pool');

// ═══════════════════════════════════════════════════════════════
// SCHEMA — jadvallar yaratish (idempotent)
// ═══════════════════════════════════════════════════════════════

const SCHEMA = `
-- ══════════════════════════════════════════════
-- USERS (asosiy)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  DEFAULT 'user',       -- super_admin | ceo | employee | admin(legacy) | user(legacy)
  plan          VARCHAR(20)  DEFAULT 'free',
  avatar_url    TEXT,
  phone         VARCHAR(20),

  ai_requests_used  INT DEFAULT 0,
  ai_requests_month VARCHAR(7),

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- ORGANIZATIONS (tashkilotlar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS organizations (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  logo_url             TEXT,
  color                VARCHAR(20) DEFAULT '#00C9BE',
  subscription_until   TIMESTAMPTZ,                 -- obuna tugash sanasi (NULL = cheksiz)
  active               BOOLEAN DEFAULT TRUE,
  created_by           INT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(active);

-- ══════════════════════════════════════════════
-- DEPARTMENTS (bo'limlar)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS departments (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  icon            VARCHAR(10),
  color           VARCHAR(20) DEFAULT '#6B7280',
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_org_name ON departments(organization_id, name);

-- ══════════════════════════════════════════════
-- USER ↔ DEPARTMENT (ko'p bo'limga tegishli xodim)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_departments (
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_user_departments_user ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON user_departments(department_id);

-- ══════════════════════════════════════════════
-- USER qo'shimcha ustunlar (v2)
-- ══════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- ══════════════════════════════════════════════
-- SOURCES (Data Hub manbalari)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sources (
  id          VARCHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  color       VARCHAR(50) DEFAULT 'var(--teal)',
  connected   BOOLEAN DEFAULT FALSE,
  active      BOOLEAN DEFAULT TRUE,
  config      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);

-- Sources qo'shimcha ustun (v2): qaysi tashkilotga tegishli
ALTER TABLE sources ADD COLUMN IF NOT EXISTS organization_id INT REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sources_org ON sources(organization_id);

-- ══════════════════════════════════════════════
-- SOURCE ↔ DEPARTMENT (bitta manba ko'p bo'limga tegishli)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS source_departments (
  source_id     VARCHAR(64) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_source_departments_source ON source_departments(source_id);
CREATE INDEX IF NOT EXISTS idx_source_departments_dept ON source_departments(department_id);

-- ══════════════════════════════════════════════
-- SOURCE_DATA
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS source_data (
  source_id   VARCHAR(64) PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  data        JSONB DEFAULT '[]',
  row_count   INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- SOURCE_FILES
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS source_files (
  id          SERIAL PRIMARY KEY,
  source_id   VARCHAR(64) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  filename    VARCHAR(255) NOT NULL,
  filepath    TEXT NOT NULL,
  size_bytes  INT DEFAULT 0,
  mime_type   VARCHAR(100),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_files_source ON source_files(source_id);

-- ══════════════════════════════════════════════
-- ALERTS
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  message     TEXT,
  type        VARCHAR(20) DEFAULT 'info',
  icon        VARCHAR(10),
  read        BOOLEAN DEFAULT FALSE,
  source_name VARCHAR(255),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

-- ══════════════════════════════════════════════
-- REPORTS
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
-- CHAT_HISTORY
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_history (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL,
  content     TEXT NOT NULL,
  src_names   TEXT[],
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);

-- ══════════════════════════════════════════════
-- PAYMENTS
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL,
  plan_id     VARCHAR(20) NOT NULL,
  method      VARCHAR(50),
  status      VARCHAR(20) DEFAULT 'pending',
  reference   VARCHAR(255),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ══════════════════════════════════════════════
-- AI_CONFIG
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_config (
  user_id     INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider    VARCHAR(20) DEFAULT 'deepseek',
  model       VARCHAR(50) DEFAULT 'deepseek-chat',
  api_key     TEXT,
  all_keys    JSONB DEFAULT '{}',
  auto_report BOOLEAN DEFAULT FALSE,
  report_time VARCHAR(5) DEFAULT '09:00',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- GLOBAL_SETTINGS
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS global_settings (
  key         VARCHAR(50) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- SESSIONS + LOGIN_HISTORY
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
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active DESC);

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

-- ══════════════════════════════════════════════
-- AUDIT LOG (v2) — muhim harakatlar
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id              SERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(50) NOT NULL,       -- create_department, add_employee, block_employee, ...
  target_type     VARCHAR(30),                 -- department | employee | source | organization
  target_id       VARCHAR(64),
  details         JSONB DEFAULT '{}',
  ip              VARCHAR(45),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_data_updated ON source_data(updated_at DESC);

-- ══════════════════════════════════════════════
-- TELEGRAM BOT INTEGRATSIYASI
-- ══════════════════════════════════════════════

-- Deep-link tokenlar (saytdan generatsiya, botda /start orqali iste'mol)
CREATE TABLE IF NOT EXISTS telegram_pending_links (
  token            VARCHAR(64) PRIMARY KEY,
  organization_id  INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose          VARCHAR(20) NOT NULL DEFAULT 'bot',  -- 'bot' | 'channel'
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_pending_org ON telegram_pending_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_tg_pending_expires ON telegram_pending_links(expires_at);

-- CEO bot chat (bitta org → bitta chat_id)
CREATE TABLE IF NOT EXISTS telegram_bot_links (
  id               SERIAL PRIMARY KEY,
  organization_id  INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id          BIGINT NOT NULL UNIQUE,
  username         VARCHAR(64),
  first_name       VARCHAR(128),
  last_name        VARCHAR(128),
  language_code    VARCHAR(10),
  active           BOOLEAN DEFAULT TRUE,
  linked_at        TIMESTAMPTZ DEFAULT NOW(),
  last_active_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_bot_org ON telegram_bot_links(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tg_bot_org_active ON telegram_bot_links(organization_id) WHERE active = TRUE;

-- MTProto vaqtincha login state (sendCode → verify orasida)
CREATE TABLE IF NOT EXISTS telegram_mtproto_pending (
  organization_id    INT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  phone              VARCHAR(20) NOT NULL,
  phone_code_hash    VARCHAR(64) NOT NULL,
  session_encrypted  TEXT NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_mtproto_pending_expires ON telegram_mtproto_pending(expires_at);

-- MTProto (GramJS) sessionlari — kanal statistikasi uchun
CREATE TABLE IF NOT EXISTS telegram_mtproto_sessions (
  id                 SERIAL PRIMARY KEY,
  organization_id    INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone              VARCHAR(20) NOT NULL,
  session_encrypted  TEXT NOT NULL,           -- AES-256-GCM(base64)
  account_name       VARCHAR(128),            -- @username yoki ism
  status             VARCHAR(20) DEFAULT 'active',  -- 'active' | 'expired' | 'revoked'
  last_used_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_mtproto_org ON telegram_mtproto_sessions(organization_id);

-- Ulangan kanallar
CREATE TABLE IF NOT EXISTS telegram_channels (
  id                    SERIAL PRIMARY KEY,
  organization_id       INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mtproto_session_id    INT REFERENCES telegram_mtproto_sessions(id) ON DELETE SET NULL,
  channel_id            BIGINT NOT NULL,
  access_hash           BIGINT,
  username              VARCHAR(128),
  title                 VARCHAR(255),
  member_count          INT,
  active                BOOLEAN DEFAULT TRUE,
  first_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at        TIMESTAMPTZ,
  UNIQUE (organization_id, channel_id)
);

ALTER TABLE telegram_channels ADD COLUMN IF NOT EXISTS access_hash BIGINT;

CREATE INDEX IF NOT EXISTS idx_tg_channels_org ON telegram_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_tg_channels_active ON telegram_channels(active);

-- Kunlik kanal statistika (timeseries)
CREATE TABLE IF NOT EXISTS telegram_channel_stats_daily (
  channel_id        INT NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  members           INT,
  joined_count      INT,
  left_count        INT,
  views_total       BIGINT,
  shares_total      BIGINT,
  reactions_total   BIGINT,
  raw               JSONB,
  PRIMARY KEY (channel_id, date)
);

-- Postlar (har post haqida)
CREATE TABLE IF NOT EXISTS telegram_channel_posts (
  id                SERIAL PRIMARY KEY,
  channel_id        INT NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  message_id        BIGINT NOT NULL,
  posted_at         TIMESTAMPTZ,
  text              TEXT,
  media_type        VARCHAR(30),            -- text | photo | video | document | poll
  views             INT,
  forwards          INT,
  reactions         JSONB,                  -- {"👍": 12, "❤️": 5}
  last_updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_tg_posts_channel_date ON telegram_channel_posts(channel_id, posted_at DESC);

-- Bot sozlamalari (har org uchun bitta)
CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  organization_id      INT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  digest_enabled       BOOLEAN DEFAULT TRUE,
  digest_time          VARCHAR(5) DEFAULT '09:00',  -- 'HH:MM' (org timezone)
  timezone             VARCHAR(64) DEFAULT 'Asia/Tashkent',
  quiet_hours_start    VARCHAR(5) DEFAULT '23:00',
  quiet_hours_end      VARCHAR(5) DEFAULT '08:00',
  enabled_modules      JSONB DEFAULT '{"sales":true,"finance":true,"crm":true,"channel":true,"instagram":true}',
  anomaly_enabled      BOOLEAN DEFAULT TRUE,
  anomaly_sensitivity  VARCHAR(10) DEFAULT 'medium',  -- 'low' | 'medium' | 'high'
  language             VARCHAR(5) DEFAULT 'uz',
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Aniqlangan anomaliyalar
CREATE TABLE IF NOT EXISTS telegram_anomalies (
  id               SERIAL PRIMARY KEY,
  organization_id  INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id        VARCHAR(64) REFERENCES sources(id) ON DELETE SET NULL,
  type             VARCHAR(64),
  severity         VARCHAR(10),     -- 'info' | 'warning' | 'critical'
  metric           VARCHAR(64),
  value            DOUBLE PRECISION,
  baseline         DOUBLE PRECISION,
  details          JSONB,
  detected_at      TIMESTAMPTZ DEFAULT NOW(),
  notified_at      TIMESTAMPTZ,
  acknowledged_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tg_anomalies_org_detected ON telegram_anomalies(organization_id, detected_at DESC);

-- ══════════════════════════════════════════════
-- USER MEMORY (AI cross-session fact'lari)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_memory (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(20) DEFAULT 'fact',   -- 'fact' | 'preference' | 'context'
  content     TEXT NOT NULL,                 -- "Men matematika o'qituvchisiman"
  source      VARCHAR(20) DEFAULT 'auto',    -- 'auto' (AI o'zi saqladi) | 'manual' (foydalanuvchi kiritdi)
  pinned      BOOLEAN DEFAULT FALSE,         -- asosiy faktlar (hech qachon o'chmaydi)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id, created_at DESC);

-- ══════════════════════════════════════════════
-- USER SETTINGS (til, push, xulq)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_settings (
  user_id           INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language          VARCHAR(5) DEFAULT 'uz',      -- 'uz' | 'ru' | 'en'
  tone              VARCHAR(20) DEFAULT 'friendly_pro',
  response_depth    VARCHAR(20) DEFAULT 'adaptive', -- 'short' | 'adaptive' | 'detailed'
  push_settings     JSONB DEFAULT '{"sales":true,"channel":true,"finance":true,"crm":true,"anomaly":true}',
  memory_enabled    BOOLEAN DEFAULT TRUE,
  auto_learn        BOOLEAN DEFAULT TRUE,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- AGENT TOOL CALL LOG (debug + sifat monitoringi)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id           SERIAL PRIMARY KEY,
  user_id      INT REFERENCES users(id) ON DELETE CASCADE,
  question     TEXT,
  tool_name    VARCHAR(64),
  tool_input   JSONB,
  tool_output  JSONB,
  iteration    INT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_user ON agent_tool_calls(user_id, created_at DESC);
`;

// ═══════════════════════════════════════════════════════════════
// Permissions shablonlari
// ═══════════════════════════════════════════════════════════════

const CEO_PERMISSIONS = {
  can_add_sources:      true,
  can_delete_sources:   true,
  can_use_ai:           true,
  ai_monthly_limit:     -1,     // -1 = cheksiz
  can_export:           true,
  can_create_reports:   true,
  can_invite_employees: true,
};

const SUPER_ADMIN_PERMISSIONS = {
  ...CEO_PERMISSIONS,
  is_super_admin: true,
};

// ═══════════════════════════════════════════════════════════════
// v2 Data Migration — mavjud foydalanuvchilarni tashkilotga aylantirish
// ═══════════════════════════════════════════════════════════════

async function migrateExistingData() {
  // Guard: agar bajarilgan bo'lsa — qayta ishlatmaymiz
  const flag = await pool.query(
    "SELECT value FROM global_settings WHERE key='migration_v2_done'"
  );
  if (flag.rows.length > 0 && flag.rows[0].value && flag.rows[0].value.done === true) {
    console.log('[MIGRATE v2] Ma\'lumot ko\'chirish allaqachon bajarilgan, o\'tkazib yuborildi');
    return;
  }

  // Super-admin sifatida belgilanadigan email (o'zgartirish mumkin)
  const SUPER_ADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || 'biznesadmin@gmail.com').toLowerCase().trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('[MIGRATE v2] Ma\'lumot ko\'chirish boshlandi...');

    // Barcha migratsiya qilinmagan foydalanuvchilarni olamiz
    const usersRes = await client.query(`
      SELECT id, name, email, role
      FROM users
      WHERE organization_id IS NULL
        AND role != 'super_admin'
      ORDER BY id ASC
    `);

    console.log(`[MIGRATE v2] Ko'chiriladigan foydalanuvchilar: ${usersRes.rows.length}`);

    let superAdminId = null;

    // Har bir foydalanuvchi uchun o'z tashkiloti yaratiladi (biznesadmin ham)
    // Biznesadmin HAM CEO vazifasini bajaradi (o'z manbalari bilan) + super_admin huquqlari olur.
    for (const user of usersRes.rows) {
      const email = (user.email || '').toLowerCase();
      const isSuperAdmin = (email === SUPER_ADMIN_EMAIL);

      // 1. Tashkilot yaratish (nom = user.name, fallback email)
      const orgName = (user.name && user.name.trim()) || (email.split('@')[0]) || `User ${user.id}`;
      const orgRes = await client.query(
        `INSERT INTO organizations (name, subscription_until, active, created_by)
         VALUES ($1, NOW() + INTERVAL '1 year', TRUE, $2)
         RETURNING id`,
        [orgName, user.id]
      );
      const orgId = orgRes.rows[0].id;

      // 2. "Umumiy" bo'lim yaratish
      const deptRes = await client.query(
        `INSERT INTO departments (organization_id, name, icon, color, created_by)
         VALUES ($1, 'Umumiy', '🌐', '#6B7280', $2)
         RETURNING id`,
        [orgId, user.id]
      );
      const umumiyDeptId = deptRes.rows[0].id;

      // 3. Foydalanuvchi rolini belgilash
      const newRole = isSuperAdmin ? 'super_admin' : 'ceo';
      const newPerms = isSuperAdmin ? SUPER_ADMIN_PERMISSIONS : CEO_PERMISSIONS;

      await client.query(
        `UPDATE users
         SET role=$1, organization_id=$2, permissions=$3, active=TRUE,
             must_change_password=FALSE
         WHERE id=$4`,
        [newRole, orgId, JSON.stringify(newPerms), user.id]
      );

      if (isSuperAdmin) {
        superAdminId = user.id;
      }

      // 4. Manbalarni tashkilotga biriktirish
      const srcUpd = await client.query(
        `UPDATE sources SET organization_id=$1 WHERE user_id=$2 AND organization_id IS NULL`,
        [orgId, user.id]
      );

      // 5. Manbalarni "Umumiy" bo'limga bog'lash (many-to-many)
      const linked = await client.query(
        `INSERT INTO source_departments (source_id, department_id)
         SELECT id, $1 FROM sources WHERE user_id=$2
         ON CONFLICT DO NOTHING`,
        [umumiyDeptId, user.id]
      );

      const tag = isSuperAdmin ? '⭐ SUPER_ADMIN' : 'CEO';
      console.log(`[MIGRATE v2]   ✓ ${tag} "${orgName}" (user=${user.id}, org=${orgId}, sources=${srcUpd.rowCount}, links=${linked.rowCount})`);
    }

    // Tashkilot created_by ni super_admin ga yangilash (agar topilgan bo'lsa)
    if (superAdminId) {
      await client.query(
        `UPDATE organizations SET created_by=$1 WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM users)`,
        [superAdminId]
      );
    }

    // 6. Orphan sources tekshiruvi (organization_id bo'lmagan manbalar bo'lmasin)
    const orphans = await client.query(
      `SELECT COUNT(*)::int AS c FROM sources WHERE organization_id IS NULL`
    );
    if (orphans.rows[0].c > 0) {
      throw new Error(`ORPHAN SOURCES: ${orphans.rows[0].c} ta manba hech qaysi tashkilotga tegishli emas — migratsiya to'xtatildi`);
    }

    // 7. Orphan source_departments tekshiruvi (bir manba eng kamida bir bo'limda bo'lishi shart)
    const unlinkedSources = await client.query(`
      SELECT s.id, s.name, s.user_id
      FROM sources s
      LEFT JOIN source_departments sd ON sd.source_id = s.id
      WHERE sd.source_id IS NULL
    `);
    if (unlinkedSources.rows.length > 0) {
      console.error('[MIGRATE v2] ⚠ Bo\'limsiz manbalar:', unlinkedSources.rows);
      throw new Error(`UNLINKED SOURCES: ${unlinkedSources.rows.length} ta manba hech qaysi bo'limga bog'lanmadi`);
    }

    // 8. Flag qo'yish
    await client.query(
      `INSERT INTO global_settings (key, value)
       VALUES ('migration_v2_done', '{"done":true,"at":"${new Date().toISOString()}"}')
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`
    );

    await client.query('COMMIT');
    console.log('[MIGRATE v2] ✓ Ma\'lumot ko\'chirish muvaffaqiyatli yakunlandi');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[MIGRATE v2] ✗ Xato, rollback qilindi:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// Asosiy migrate funksiyasi
// ═══════════════════════════════════════════════════════════════

async function migrate(shouldEndPool = true) {
  console.log('[MIGRATE] Schema ishga tushirilmoqda...');
  try {
    await pool.query(SCHEMA);
    console.log('[MIGRATE] ✓ Jadvallar tayyor');

    // Default global settings
    await pool.query(`
      INSERT INTO global_settings (key, value)
      VALUES ('global_ai', '{}'), ('plan_prices', '{}')
      ON CONFLICT (key) DO NOTHING
    `);

    // Default admin — faqat ADMIN_PASSWORD env berilganda
    const adminEmail = (process.env.ADMIN_EMAIL || 'biznesadmin@gmail.com').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword && adminPassword.length >= 8) {
      const bcrypt = require('bcryptjs');
      const existing = await pool.query('SELECT id FROM users WHERE email=$1', [adminEmail]);
      if (existing.rows.length === 0) {
        const adminHash = await bcrypt.hash(adminPassword, 12);
        await pool.query(
          `INSERT INTO users (name, email, password_hash, role, plan, permissions, active)
           VALUES ('Admin', $1, $2, 'super_admin', 'enterprise', $3, TRUE)`,
          [adminEmail, adminHash, JSON.stringify(SUPER_ADMIN_PERMISSIONS)]
        );
        console.log(`[MIGRATE] ✓ Super-admin yaratildi: ${adminEmail}`);
      }
    } else if (!process.env.ADMIN_PASSWORD) {
      console.warn('[MIGRATE] ⚠ ADMIN_PASSWORD env yo\'q — yangi super-admin yaratilmadi');
    }

    // v2 ma'lumot ko'chirish
    await migrateExistingData();

    // Jadvallar ro'yxati (verify)
    const res = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('[MIGRATE] Jadvallar:', res.rows.map(r => r.table_name).join(', '));

  } catch (err) {
    console.error('[MIGRATE] ✗ Xato:', err.message);
    if (require.main === module) process.exit(1);
    throw err;
  } finally {
    if (shouldEndPool && require.main === module) {
      await pool.end();
      console.log('[MIGRATE] Pool yopildi');
    }
    console.log('[MIGRATE] Tugadi');
  }
}

if (require.main === module) {
  migrate(true);
}

module.exports = migrate;
module.exports.CEO_PERMISSIONS = CEO_PERMISSIONS;
module.exports.SUPER_ADMIN_PERMISSIONS = SUPER_ADMIN_PERMISSIONS;
