/**
 * Link service — deep-link tokenni iste'mol qilish va chat_id ni org'ga bog'lash
 */
const pool = require('../db/pool');

/**
 * Tokenni tekshiradi va chat_id ni org'ga bog'laydi.
 * @returns {Promise<{ok: boolean, organizationId?: number, organizationName?: string, error?: string}>}
 */
async function consumeStartToken(token, fromUser) {
  if (!token || typeof token !== 'string' || token.length < 8) {
    return { ok: false, error: 'invalid_token' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `SELECT pl.organization_id, pl.user_id, pl.purpose, pl.expires_at, o.name AS org_name
       FROM telegram_pending_links pl
       JOIN organizations o ON o.id = pl.organization_id
       WHERE pl.token = $1
       FOR UPDATE`,
      [token]
    );

    if (r.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'token_not_found' };
    }

    const row = r.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      await client.query('DELETE FROM telegram_pending_links WHERE token=$1', [token]);
      await client.query('COMMIT');
      return { ok: false, error: 'token_expired' };
    }

    if (row.purpose !== 'bot') {
      await client.query('ROLLBACK');
      return { ok: false, error: 'wrong_purpose' };
    }

    // Mavjud bot link bormi shu org'da? Bo'lsa — chat_id ni yangilaymiz
    await client.query(
      `UPDATE telegram_bot_links SET active=FALSE
       WHERE organization_id=$1 AND chat_id <> $2`,
      [row.organization_id, fromUser.id]
    );

    await client.query(
      `INSERT INTO telegram_bot_links
         (organization_id, user_id, chat_id, username, first_name, last_name, language_code, active, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
       ON CONFLICT (chat_id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         user_id         = EXCLUDED.user_id,
         username        = EXCLUDED.username,
         first_name      = EXCLUDED.first_name,
         last_name       = EXCLUDED.last_name,
         language_code   = EXCLUDED.language_code,
         active          = TRUE,
         last_active_at  = NOW()`,
      [
        row.organization_id,
        row.user_id,
        fromUser.id,
        fromUser.username || null,
        fromUser.first_name || null,
        fromUser.last_name || null,
        fromUser.language_code || null,
      ]
    );

    // Default sozlamalarni avto-yaratish (agar yo'q bo'lsa)
    await client.query(
      `INSERT INTO telegram_bot_settings (organization_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [row.organization_id]
    );

    // Tokenni o'chirish
    await client.query('DELETE FROM telegram_pending_links WHERE token=$1', [token]);

    await client.query('COMMIT');
    return { ok: true, organizationId: row.organization_id, organizationName: row.org_name };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[linkService] consumeStartToken error:', e.message);
    return { ok: false, error: 'server_error' };
  } finally {
    client.release();
  }
}

/**
 * chat_id bo'yicha bog'langan org'ni topish (har xabarda kerak)
 */
async function findOrgByChatId(chatId) {
  const r = await pool.query(
    `SELECT bl.organization_id, bl.user_id, o.name AS org_name
     FROM telegram_bot_links bl
     JOIN organizations o ON o.id = bl.organization_id
     WHERE bl.chat_id=$1 AND bl.active=TRUE
     LIMIT 1`,
    [chatId]
  );
  return r.rows[0] || null;
}

/**
 * last_active_at ni yangilash (oddiy ping)
 */
async function touchChat(chatId) {
  await pool.query(
    `UPDATE telegram_bot_links SET last_active_at=NOW() WHERE chat_id=$1`,
    [chatId]
  );
}

module.exports = { consumeStartToken, findOrgByChatId, touchChat };
