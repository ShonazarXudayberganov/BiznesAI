/**
 * Ovozli xabarni matnga aylantirish (Whisper).
 * OpenAI Whisper API'sini ishlatamiz — kalit alohida env (OPENAI_API_KEY)
 * yoki backend orqali resolve qilinadi (kelajakda).
 */
const FormData = (typeof globalThis.FormData !== 'undefined') ? globalThis.FormData : null;

const WHISPER_KEY = process.env.OPENAI_API_KEY || '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function transcribeOgg(buffer, language = 'uz') {
  if (!WHISPER_KEY) {
    throw new Error('OPENAI_API_KEY env yo\'q (Whisper uchun)');
  }
  if (!FormData) throw new Error('Node 18+ FormData kerak');

  const fd = new FormData();
  // Telegram voice — opus codec, .ogg
  fd.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'voice.ogg');
  fd.append('model', 'whisper-1');
  if (language) fd.append('language', language);
  fd.append('response_format', 'json');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${WHISPER_KEY}` },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Whisper: ${data.error?.message || res.status}`);
  return data.text || '';
}

module.exports = { transcribeOgg };
