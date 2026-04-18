/**
 * AES-256-GCM session encryption.
 *
 * Format: base64( iv(12) || ciphertext || authTag(16) )
 * Kalit: TELEGRAM_SESSION_ENC_KEY env (base64 32 bayt)
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let _key = null;
function getKey() {
  if (_key) return _key;
  const raw = process.env.TELEGRAM_SESSION_ENC_KEY;
  if (!raw) throw new Error('TELEGRAM_SESSION_ENC_KEY env yo\'q');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('TELEGRAM_SESSION_ENC_KEY 32 bayt bo\'lishi kerak (base64'
      + ' decode dan keyin) — hozir ' + buf.length + ' bayt');
  }
  _key = buf;
  return _key;
}

function encrypt(plaintext) {
  if (typeof plaintext !== 'string') plaintext = String(plaintext || '');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

function decrypt(encoded) {
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('Buzilgan shifr');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

module.exports = { encrypt, decrypt };
