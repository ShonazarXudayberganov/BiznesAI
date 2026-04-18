/**
 * GramJS MTProto wrapper.
 * - sendCode: Telegram'dan kod so'rash, vaqtincha sessionni DB'ga yozadi
 * - verifyCode: kod (va 2FA) bilan login, sessionni shifrlab saqlaydi
 * - listAdminChannels: foydalanuvchining admin kanallari ro'yxati
 * - getChannelStats: rasmiy kanal statistikasi
 *
 * Sessionlar AES-256-GCM bilan shifrlangan holda telegram_mtproto_sessions'da yotadi.
 */
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const pool = require('../db/pool');
const { encrypt, decrypt } = require('../lib/encryption');

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const PENDING_TTL_MIN = 10;

function assertApi() {
  if (!API_ID || !API_HASH) {
    throw new Error('TELEGRAM_API_ID/TELEGRAM_API_HASH env yo\'q');
  }
}

function newClient(sessionStr = '') {
  return new TelegramClient(
    new StringSession(sessionStr || ''),
    API_ID,
    API_HASH,
    { connectionRetries: 3, useWSS: false }
  );
}

// ────────────────────────────────────────────────
// 1. sendCode
// ────────────────────────────────────────────────
async function sendCode(organizationId, phone) {
  assertApi();
  if (!phone || !/^\+?\d{8,15}$/.test(phone)) {
    throw new Error('Telefon raqami noto\'g\'ri formatda (+998901234567)');
  }
  const normPhone = phone.startsWith('+') ? phone : '+' + phone;

  const client = newClient('');
  await client.connect();

  let result;
  try {
    result = await client.invoke(new Api.auth.SendCode({
      phoneNumber: normPhone,
      apiId: API_ID,
      apiHash: API_HASH,
      settings: new Api.CodeSettings({
        allowFlashcall: false,
        currentNumber: false,
        allowAppHash: true,
        allowMissedCall: false,
      }),
    }));
  } catch (e) {
    await client.disconnect().catch(() => {});
    if (e.errorMessage === 'PHONE_NUMBER_INVALID') throw new Error('Telefon raqam noto\'g\'ri');
    if (e.errorMessage === 'AUTH_RESTART') throw new Error('Telegram qayta urinishni so\'radi, biroz kuting');
    if (e.errorMessage === 'PHONE_NUMBER_BANNED') throw new Error('Bu raqam Telegram tomonidan bloklangan');
    if (e.errorMessage === 'FLOOD_WAIT') throw new Error('Juda ko\'p urinish — keyinroq urinib ko\'ring');
    throw new Error('Kod yuborishda xato: ' + (e.errorMessage || e.message));
  }

  const phoneCodeHash = result.phoneCodeHash;
  const sessionStr = client.session.save();
  await client.disconnect().catch(() => {});

  const expires = new Date(Date.now() + PENDING_TTL_MIN * 60 * 1000);
  await pool.query(
    `INSERT INTO telegram_mtproto_pending (organization_id, phone, phone_code_hash, session_encrypted, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id) DO UPDATE SET
       phone = EXCLUDED.phone,
       phone_code_hash = EXCLUDED.phone_code_hash,
       session_encrypted = EXCLUDED.session_encrypted,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()`,
    [organizationId, normPhone, phoneCodeHash, encrypt(sessionStr), expires]
  );

  return { ok: true, phone: normPhone, expiresAt: expires };
}

// ────────────────────────────────────────────────
// 2. verifyCode
// ────────────────────────────────────────────────
async function verifyCode(organizationId, code, password) {
  assertApi();
  if (!code || !/^\d{4,8}$/.test(String(code).trim())) {
    throw new Error('Kod 4-8 raqamdan iborat bo\'lishi kerak');
  }
  const cleanCode = String(code).trim();

  const r = await pool.query(
    `SELECT phone, phone_code_hash, session_encrypted, expires_at
     FROM telegram_mtproto_pending WHERE organization_id=$1`,
    [organizationId]
  );
  if (r.rows.length === 0) {
    throw new Error('Avval kod so\'rashingiz kerak');
  }
  const pending = r.rows[0];
  if (new Date(pending.expires_at) < new Date()) {
    await pool.query(`DELETE FROM telegram_mtproto_pending WHERE organization_id=$1`, [organizationId]);
    throw new Error('Kod muddati tugagan, qaytadan boshlang');
  }

  const sessionStr = decrypt(pending.session_encrypted);
  const client = newClient(sessionStr);
  await client.connect();

  let me;
  let needsPassword = false;
  try {
    me = await client.invoke(new Api.auth.SignIn({
      phoneNumber: pending.phone,
      phoneCodeHash: pending.phone_code_hash,
      phoneCode: cleanCode,
    }));
  } catch (e) {
    if (e.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      needsPassword = true;
    } else {
      await client.disconnect().catch(() => {});
      if (e.errorMessage === 'PHONE_CODE_INVALID') throw new Error('Kod noto\'g\'ri');
      if (e.errorMessage === 'PHONE_CODE_EXPIRED') throw new Error('Kod muddati tugagan, qaytadan boshlang');
      throw new Error('Kirish xato: ' + (e.errorMessage || e.message));
    }
  }

  if (needsPassword) {
    if (!password) {
      // Sessionni saqlab qoldiramiz, foydalanuvchi parolni kiritsin
      const updated = client.session.save();
      await client.disconnect().catch(() => {});
      await pool.query(
        `UPDATE telegram_mtproto_pending SET session_encrypted=$1 WHERE organization_id=$2`,
        [encrypt(updated), organizationId]
      );
      const err = new Error('PASSWORD_REQUIRED');
      err.code = 'PASSWORD_REQUIRED';
      throw err;
    }
    try {
      const pwd = await client.invoke(new Api.account.GetPassword());
      const srp = await computeCheck(pwd, password);
      me = await client.invoke(new Api.auth.CheckPassword({ password: srp }));
    } catch (e) {
      await client.disconnect().catch(() => {});
      if (e.errorMessage === 'PASSWORD_HASH_INVALID') throw new Error('2FA paroli noto\'g\'ri');
      throw new Error('2FA xato: ' + (e.errorMessage || e.message));
    }
  }

  // Login muvaffaqiyatli — sessionni shifrlab saqlash
  const finalSession = client.session.save();
  const userInfo = me.user || me;
  const accountName = userInfo
    ? ('@' + (userInfo.username || (userInfo.firstName || '') + (userInfo.lastName ? ' ' + userInfo.lastName : '')))
    : pending.phone;

  // Avvalgi sessionni faolsizlantirish, yangi qo'shish
  await pool.query(
    `UPDATE telegram_mtproto_sessions SET status='revoked' WHERE organization_id=$1 AND status='active'`,
    [organizationId]
  );
  const ins = await pool.query(
    `INSERT INTO telegram_mtproto_sessions (organization_id, phone, session_encrypted, account_name, status, last_used_at)
     VALUES ($1, $2, $3, $4, 'active', NOW())
     RETURNING id`,
    [organizationId, pending.phone, encrypt(finalSession), accountName]
  );
  await pool.query(`DELETE FROM telegram_mtproto_pending WHERE organization_id=$1`, [organizationId]);

  await client.disconnect().catch(() => {});

  return { ok: true, sessionId: ins.rows[0].id, accountName, phone: pending.phone };
}

// ────────────────────────────────────────────────
// 3. listAdminChannels — foydalanuvchining admin/owner kanallari
// ────────────────────────────────────────────────
async function listAdminChannels(organizationId) {
  assertApi();
  const r = await pool.query(
    `SELECT id, session_encrypted FROM telegram_mtproto_sessions
     WHERE organization_id=$1 AND status='active' ORDER BY id DESC LIMIT 1`,
    [organizationId]
  );
  if (r.rows.length === 0) throw new Error('Avval login qiling');
  const sessionStr = decrypt(r.rows[0].session_encrypted);
  const client = newClient(sessionStr);
  await client.connect();

  try {
    // getDialogs → broadcast (channel) lar bilan filter
    const dialogs = await client.getDialogs({ limit: 200 });
    const channels = [];
    for (const d of dialogs) {
      const ent = d.entity;
      if (!ent || !ent.broadcast) continue;  // faqat broadcast kanallar
      // adminRights borligini tekshirish (owner ham admin)
      const isAdmin = !!(ent.adminRights || ent.creator);
      if (!isAdmin) continue;
      channels.push({
        channelId: String(ent.id),
        accessHash: ent.accessHash ? String(ent.accessHash) : null,
        username: ent.username || null,
        title: ent.title || '',
        memberCount: ent.participantsCount || null,
        creator: !!ent.creator,
        about: ent.about || null,
      });
    }
    await pool.query(
      `UPDATE telegram_mtproto_sessions SET last_used_at=NOW() WHERE id=$1`,
      [r.rows[0].id]
    );
    return channels;
  } finally {
    await client.disconnect().catch(() => {});
  }
}

// ────────────────────────────────────────────────
// 4. connectChannel — tanlangan kanalni DB'ga ulash
// ────────────────────────────────────────────────
async function connectChannel(organizationId, channelMeta) {
  const sessRes = await pool.query(
    `SELECT id FROM telegram_mtproto_sessions
     WHERE organization_id=$1 AND status='active' LIMIT 1`,
    [organizationId]
  );
  if (sessRes.rows.length === 0) throw new Error('Faol session yo\'q');
  const sessionId = sessRes.rows[0].id;

  const accessHash = channelMeta.accessHash ? String(channelMeta.accessHash) : null;
  const r = await pool.query(
    `INSERT INTO telegram_channels
       (organization_id, mtproto_session_id, channel_id, access_hash, username, title, member_count, active, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NULL)
     ON CONFLICT (organization_id, channel_id) DO UPDATE SET
       mtproto_session_id = EXCLUDED.mtproto_session_id,
       access_hash = EXCLUDED.access_hash,
       username = EXCLUDED.username,
       title = EXCLUDED.title,
       member_count = EXCLUDED.member_count,
       active = TRUE
     RETURNING id`,
    [organizationId, sessionId, channelMeta.channelId, accessHash, channelMeta.username, channelMeta.title, channelMeta.memberCount]
  );
  return { id: r.rows[0].id };
}

// ────────────────────────────────────────────────
// 5. getChannelStats — bitta kanal uchun rasmiy statistika
// ────────────────────────────────────────────────
async function getChannelStats(channelDbId) {
  assertApi();
  const r = await pool.query(
    `SELECT c.id, c.channel_id, c.access_hash, c.username, s.session_encrypted
     FROM telegram_channels c
     JOIN telegram_mtproto_sessions s ON s.id=c.mtproto_session_id
     WHERE c.id=$1 AND s.status='active'`,
    [channelDbId]
  );
  if (r.rows.length === 0) throw new Error('Kanal topilmadi yoki session yo\'q');
  const ch = r.rows[0];
  const sessionStr = decrypt(ch.session_encrypted);
  const client = newClient(sessionStr);
  await client.connect();

  try {
    // Kanal entity — saqlangan accessHash bilan to'g'ridan InputPeerChannel quramiz.
    // Username ham bo'lsa fallback. Aks holda entity cache'da yo'qligi sababli xato beradi.
    let inputChannel;
    if (ch.access_hash) {
      const { Api: A } = require('telegram');
      inputChannel = new A.InputChannel({
        channelId: BigInt(ch.channel_id),
        accessHash: BigInt(ch.access_hash),
      });
    } else if (ch.username) {
      inputChannel = await client.getInputEntity(ch.username);
    } else {
      // Eski yozuvlar uchun: dialogs orqali topishga harakat
      const dialogs = await client.getDialogs({ limit: 200 });
      const found = dialogs.find(d => d.entity && String(d.entity.id) === String(ch.channel_id));
      if (!found) throw new Error('Kanal entity topilmadi — qaytadan ulang');
      inputChannel = await client.getInputEntity(found.entity);
      // accessHash ni keyin uchun saqlab qo'yamiz
      if (found.entity.accessHash) {
        await pool.query(`UPDATE telegram_channels SET access_hash=$1 WHERE id=$2`,
          [String(found.entity.accessHash), ch.id]);
      }
    }

    // Asosiy ma'lumot — bu HAR DOIM ishlaydi
    const full = await client.invoke(new Api.channels.GetFullChannel({ channel: inputChannel }));
    const memberCount = full.fullChat?.participantsCount || null;

    // Rasmiy statistika — kichik kanallar uchun mavjud emas
    // (Telegram talabi: 100+ obunachi va broadcast channel)
    let stats = null;
    let statsAvailable = false;
    try {
      stats = await client.invoke(new Api.stats.GetBroadcastStats({
        channel: inputChannel,
        dark: false,
      }));
      statsAvailable = true;
    } catch (e) {
      const msg = e.errorMessage || e.message || '';
      // STATS_MIGRATE_X — boshqa DC'ga ko'chish kerak
      if (msg.startsWith('STATS_MIGRATE_')) {
        const dc = parseInt(msg.split('_').pop(), 10);
        try {
          await client._switchDC(dc);
          stats = await client.invoke(new Api.stats.GetBroadcastStats({
            channel: inputChannel,
            dark: false,
          }));
          statsAvailable = true;
        } catch (e2) {
          console.warn('[mtproto] Stats DC migrate failed:', e2.message);
        }
      } else if (msg === 'CHAT_ADMIN_REQUIRED' || msg === 'BROADCAST_PUBLIC_VOTERS_FORBIDDEN') {
        // Stats yo'q — kichik kanal yoki broadcast emas. Davom etamiz, faqat memberCount yozamiz.
        console.warn(`[mtproto] Stats unavailable for channel ${ch.id}: ${msg}`);
      } else {
        throw e;
      }
    }

    // DB'ga yozish (stats bo'lmasa ham memberCount yoziladi)
    const today = new Date().toISOString().slice(0, 10);
    const followers = stats?.followers?.current ?? memberCount;
    const viewsAvg = stats?.viewsPerPost?.current ?? null;
    const sharesAvg = stats?.sharesPerPost?.current ?? null;
    const reactionsAvg = stats?.reactionsPerPost?.current ?? null;

    await pool.query(
      `INSERT INTO telegram_channel_stats_daily
         (channel_id, date, members, views_total, shares_total, reactions_total, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (channel_id, date) DO UPDATE SET
         members = EXCLUDED.members,
         views_total = EXCLUDED.views_total,
         shares_total = EXCLUDED.shares_total,
         reactions_total = EXCLUDED.reactions_total,
         raw = EXCLUDED.raw`,
      [
        ch.id, today, followers,
        viewsAvg ? Math.round(viewsAvg) : null,
        sharesAvg ? Math.round(sharesAvg) : null,
        reactionsAvg ? Math.round(reactionsAvg) : null,
        JSON.stringify({
          followers: stats?.followers,
          views_per_post: stats?.viewsPerPost,
          shares_per_post: stats?.sharesPerPost,
          reactions_per_post: stats?.reactionsPerPost,
          enabled_notifications: stats?.enabledNotifications,
          period: stats?.period,
        }),
      ]
    );

    await pool.query(
      `UPDATE telegram_channels SET member_count=$1, last_synced_at=NOW() WHERE id=$2`,
      [followers, ch.id]
    );

    return {
      ok: true,
      channelId: ch.id,
      members: followers,
      viewsAvg, sharesAvg, reactionsAvg,
      statsAvailable,
      note: statsAvailable ? null : 'Kanal statistikasi mavjud emas (kamida 100 obunachi kerak yoki broadcast emas). Faqat a\'zolar soni yangilandi.',
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

// ────────────────────────────────────────────────
// 6. disconnectSession — sessionni shifrdan tozalash
// ────────────────────────────────────────────────
async function disconnectSession(organizationId) {
  // Telegram tomonida log out qilamiz
  const r = await pool.query(
    `SELECT id, session_encrypted FROM telegram_mtproto_sessions
     WHERE organization_id=$1 AND status='active'`,
    [organizationId]
  );
  for (const row of r.rows) {
    try {
      const client = newClient(decrypt(row.session_encrypted));
      await client.connect();
      await client.invoke(new Api.auth.LogOut()).catch(() => {});
      await client.disconnect().catch(() => {});
    } catch {}
  }
  await pool.query(
    `UPDATE telegram_mtproto_sessions SET status='revoked' WHERE organization_id=$1`,
    [organizationId]
  );
  await pool.query(
    `UPDATE telegram_channels SET active=FALSE WHERE organization_id=$1`,
    [organizationId]
  );
  return { ok: true };
}

module.exports = {
  sendCode,
  verifyCode,
  listAdminChannels,
  connectChannel,
  getChannelStats,
  disconnectSession,
};
