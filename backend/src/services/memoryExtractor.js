/**
 * Auto-memory extractor (Faza 5.4).
 *
 * Suhbat oxirida (har turn'dan keyin) Haiku one-shot chaqirib,
 * foydalanuvchi xabaridan barqaror faktlarni ajratib oladi va
 * user_memory'ga `status='pending'` bilan saqlaydi.
 *
 * User keyin Settings → Memory'da review qilib approve/reject qiladi.
 *
 * Cost: ~$0.001 per turn (Haiku, ~500 token).
 */
const { resolveAiConfig } = require('./aiProviders');
const { addMemory, listMemories } = require('./userMemory');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_PER_TURN = 3; // bir turn'da max 3 ta fakt

/**
 * AI extractor — suhbat matnidan faktlar.
 * Faqat Claude provayder ulanganda ishlaydi (Haiku zarur).
 */
async function extractFacts(userMessage, recentContext = '') {
  let cfg;
  try {
    cfg = await resolveAiConfig(null); // global config
  } catch {
    return []; // AI yo'q
  }
  if (cfg.provider !== 'claude') {
    return []; // Faqat Claude'da ishlaydi
  }

  const prompt = `Sen xotira yordamchisi-AI'sisan. Foydalanuvchi xabaridan QAT'IY BARQAROR FAKTLARNI ajratasan.

Faqat shu turdagi faktlarni saqla:
- Foydalanuvchi roli/kasbi (masalan: "men oltin do'koni egasiman")
- Biznes sohasi (masalan: "biznesim — chakana savdo")
- Aniq afzallik/odat (masalan: "har dushanba moliyaviy hisobotni ko'raman")
- Muhim sana yoki muddat (masalan: "kvartal yakuni 28-marsda")
- Asosiy xodimlar yoki qaror qabul qiluvchilar nomi

YOZMA:
- Vaqtinchalik narsalar (bugungi havo, vaqt, joriy holat)
- Savol yoki shubha (faqat tasdiq)
- AI o'zining gaplari
- "men ko'rmoqchiman", "balki" kabi noaniqliklar

Foydalanuvchi xabari:
"""
${userMessage.slice(0, 1500)}
"""

${recentContext ? `Suhbat konteksti (oldingi 1-2 javob):\n"""\n${recentContext.slice(0, 800)}\n"""\n` : ''}

OUTPUT (JSON, faqat shu format):
{"facts": [{"content": "fakt matni", "kind": "fact|preference|context"}]}

Agar barqaror fakt yo'q bo'lsa: {"facts": []}
⚠️ FAQAT JSON. Markdown yoki tushuntirish yo'q.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('[memoryExtractor] Claude xato:', data.error?.message);
      return [];
    }
    const text = data.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
    return facts.slice(0, MAX_PER_TURN).filter(f => f.content && f.content.length >= 5);
  } catch (e) {
    console.warn('[memoryExtractor] xato:', e.message);
    return [];
  }
}

/**
 * Suhbat turn'idan keyin chaqiriladi — non-blocking.
 * Ekstrakt qilingan faktlarni `pending` status'da saqlaydi.
 */
async function extractAndSavePending({ userId, userMessage, assistantReply }) {
  if (!userId || !userMessage) return { saved: 0 };
  // Allaqachon mavjud faktlarni tekshirish (duplikatga vaqt sarflashdan oldin)
  const existing = await listMemories(userId, { status: 'all' });
  const existingTexts = new Set(existing.map(m => m.content.toLowerCase().trim()));

  const facts = await extractFacts(userMessage, assistantReply || '');
  let saved = 0;
  for (const f of facts) {
    const key = f.content.toLowerCase().trim();
    if (existingTexts.has(key)) continue;
    try {
      await addMemory(userId, {
        content: f.content,
        kind: f.kind || 'fact',
        source: 'auto',
        status: 'pending', // foydalanuvchi review qiladi
      });
      saved++;
    } catch (e) {
      console.warn('[memoryExtractor] saqlash xato:', e.message);
    }
  }
  return { saved, candidates: facts.length };
}

module.exports = {
  extractFacts,
  extractAndSavePending,
};
