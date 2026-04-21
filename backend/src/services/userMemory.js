/**
 * User Memory — AI cross-session fact storage.
 *
 * Maqsad: AI har suhbatda foydalanuvchi haqida bilganlarini eslab qolsin.
 * Manba: (1) AI o'zi suhbat paytida saqlaydi (auto),
 *        (2) foydalanuvchi sozlamalardan qo'shadi (manual).
 *
 * Har foydalanuvchi uchun max 100 ta memory; eng eski auto-fact'lar o'chiriladi.
 */
const pool = require('../db/pool');

const MAX_MEMORIES = 100;
const MAX_CONTENT_LEN = 500;

async function listMemories(userId) {
  const r = await pool.query(
    `SELECT id, kind, content, source, pinned, created_at, updated_at
     FROM user_memory
     WHERE user_id=$1
     ORDER BY pinned DESC, created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function addMemory(userId, { content, kind = 'fact', source = 'manual', pinned = false }) {
  const text = String(content || '').trim().slice(0, MAX_CONTENT_LEN);
  if (!text) throw new Error('Memory mazmuni bo\'sh');

  // Duplikat tekshirish (katta-kichik harf, bo'sh joy farqsiz)
  const dup = await pool.query(
    `SELECT id FROM user_memory WHERE user_id=$1 AND LOWER(TRIM(content))=LOWER(TRIM($2))`,
    [userId, text]
  );
  if (dup.rows.length > 0) {
    await pool.query(`UPDATE user_memory SET updated_at=NOW() WHERE id=$1`, [dup.rows[0].id]);
    return { id: dup.rows[0].id, duplicated: true };
  }

  const r = await pool.query(
    `INSERT INTO user_memory (user_id, kind, content, source, pinned)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, kind, text, source, !!pinned]
  );

  await enforceLimit(userId);
  return { id: r.rows[0].id };
}

async function updateMemory(userId, id, { content, pinned }) {
  const parts = [];
  const vals = [];
  let idx = 1;
  if (content !== undefined) {
    parts.push(`content=$${idx++}`);
    vals.push(String(content).trim().slice(0, MAX_CONTENT_LEN));
  }
  if (pinned !== undefined) {
    parts.push(`pinned=$${idx++}`);
    vals.push(!!pinned);
  }
  if (parts.length === 0) return;
  parts.push(`updated_at=NOW()`);
  vals.push(userId, id);
  await pool.query(
    `UPDATE user_memory SET ${parts.join(', ')} WHERE user_id=$${idx++} AND id=$${idx}`,
    vals
  );
}

async function deleteMemory(userId, id) {
  await pool.query(`DELETE FROM user_memory WHERE user_id=$1 AND id=$2`, [userId, id]);
}

async function clearMemories(userId, { keepPinned = true } = {}) {
  if (keepPinned) {
    await pool.query(`DELETE FROM user_memory WHERE user_id=$1 AND pinned=FALSE`, [userId]);
  } else {
    await pool.query(`DELETE FROM user_memory WHERE user_id=$1`, [userId]);
  }
}

async function enforceLimit(userId) {
  const count = await pool.query(
    `SELECT COUNT(*)::int AS c FROM user_memory WHERE user_id=$1`,
    [userId]
  );
  if (count.rows[0].c <= MAX_MEMORIES) return;
  const excess = count.rows[0].c - MAX_MEMORIES;
  await pool.query(
    `DELETE FROM user_memory
     WHERE id IN (
       SELECT id FROM user_memory
       WHERE user_id=$1 AND pinned=FALSE AND source='auto'
       ORDER BY created_at ASC
       LIMIT $2
     )`,
    [userId, excess]
  );
}

/**
 * System prompt uchun memory-ni formatlaydi.
 * Natija: qisqa ro'yxat yoki bo'sh string.
 */
async function buildMemoryContext(userId) {
  if (!userId) return '';
  const r = await pool.query(
    `SELECT content FROM user_memory
     WHERE user_id=$1
     ORDER BY pinned DESC, updated_at DESC
     LIMIT 30`,
    [userId]
  );
  if (r.rows.length === 0) return '';
  const bullets = r.rows.map(m => `- ${m.content}`).join('\n');
  return `FOYDALANUVCHI HAQIDA MA'LUMOT (eslab qolingan):\n${bullets}\n\nShu faktlarni suhbatda tabiiy ravishda ishlatib tur (bir xil narsani qayta so'rama).`;
}

/**
 * User sozlamalarini olish (til, tone, depth va h.k.)
 */
async function getUserSettings(userId) {
  const r = await pool.query(
    `SELECT language, tone, response_depth, push_settings, memory_enabled, auto_learn
     FROM user_settings WHERE user_id=$1`,
    [userId]
  );
  if (r.rows.length === 0) {
    return {
      language: 'uz',
      tone: 'friendly_pro',
      response_depth: 'adaptive',
      push_settings: { sales: true, channel: true, finance: true, crm: true, anomaly: true },
      memory_enabled: true,
      auto_learn: true,
    };
  }
  return r.rows[0];
}

async function saveUserSettings(userId, settings) {
  const {
    language, tone, response_depth,
    push_settings, memory_enabled, auto_learn,
  } = settings || {};

  await pool.query(
    `INSERT INTO user_settings (user_id, language, tone, response_depth, push_settings, memory_enabled, auto_learn)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       language        = COALESCE($2, user_settings.language),
       tone            = COALESCE($3, user_settings.tone),
       response_depth  = COALESCE($4, user_settings.response_depth),
       push_settings   = COALESCE($5, user_settings.push_settings),
       memory_enabled  = COALESCE($6, user_settings.memory_enabled),
       auto_learn      = COALESCE($7, user_settings.auto_learn),
       updated_at      = NOW()`,
    [
      userId,
      language || null,
      tone || null,
      response_depth || null,
      push_settings ? JSON.stringify(push_settings) : null,
      memory_enabled !== undefined ? memory_enabled : null,
      auto_learn !== undefined ? auto_learn : null,
    ]
  );
}

module.exports = {
  listMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  clearMemories,
  buildMemoryContext,
  getUserSettings,
  saveUserSettings,
};
