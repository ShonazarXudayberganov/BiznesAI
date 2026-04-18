/**
 * /start handler — deep-link tokenni qabul qiladi va chat_id ni org'ga bog'laydi.
 * Argument bo'lmasa — agar oldindan ulangan bo'lsa salom, aks holda yo'riqnoma.
 */
const { consumeStartToken, findOrgByChatId } = require('../services/linkService');

function welcomeText(orgName) {
  return [
    `✅ <b>${orgName}</b> tashkiloti bot bilan ulandi!`,
    '',
    'Endi siz quyidagilardan foydalana olasiz:',
    '• 📊 Hisobot va tahlil olish',
    '• 💬 Erkin savol berish (AI javob beradi)',
    '• 🔔 Avtomatik kunlik dayjest',
    '• ⚠️ Anomaliya ogohlantirishlari',
    '',
    'Boshlash uchun /menu yoki tugmalardan foydalaning.',
  ].join('\n');
}

function alreadyLinkedText(orgName) {
  return [
    `Salom! Siz allaqachon <b>${orgName}</b> tashkilotiga ulangansiz.`,
    '',
    '/menu — asosiy menyu',
    '/help — yordam',
  ].join('\n');
}

function noTokenText() {
  return [
    '👋 Salom! Bu Analix yordamchi bot.',
    '',
    'Botdan foydalanish uchun avval saytda ulanish kerak:',
    '1. <a href="https://analix.uz">analix.uz</a> ga kiring',
    '2. Sozlamalar → Telegram ulash tugmasini bosing',
    '3. Avtomatik shu yerga qaytasiz',
    '',
    'Yoki: agar sizda ulanish havolasi bor bo\'lsa — uni bosing.',
  ].join('\n');
}

function errorText(reason) {
  switch (reason) {
    case 'token_expired':
      return '⏱ Bu havola muddati tugagan. Saytda yangi havola yarating.';
    case 'token_not_found':
      return '❌ Havola topilmadi. Iltimos, saytda yangi havola yarating.';
    case 'wrong_purpose':
      return '⚠️ Bu havola bot ulash uchun emas (kanal ulash uchun). Saytda to\'g\'ri tugmani bosing.';
    case 'invalid_token':
      return '⚠️ Havola noto\'g\'ri formatda.';
    default:
      return '❌ Server xatosi. Birozdan keyin qayta urinib ko\'ring.';
  }
}

module.exports = function registerStartHandler(bot) {
  bot.start(async (ctx) => {
    const payload = ctx.startPayload || '';
    const from = ctx.from;

    if (!payload) {
      // Token yo'q — mavjud bog'lanishni tekshirish
      const existing = await findOrgByChatId(from.id);
      if (existing) {
        return ctx.reply(alreadyLinkedText(existing.org_name), { parse_mode: 'HTML' });
      }
      return ctx.reply(noTokenText(), { parse_mode: 'HTML', disable_web_page_preview: true });
    }

    const result = await consumeStartToken(payload, from);

    if (!result.ok) {
      return ctx.reply(errorText(result.error), { parse_mode: 'HTML' });
    }

    return ctx.reply(welcomeText(result.organizationName), { parse_mode: 'HTML' });
  });
};
