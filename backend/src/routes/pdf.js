/**
 * PDF API — markdown'dan to'g'ridan-to'g'ri PDF yaratish.
 * AI Insights va boshqa joylarda matnni PDF qilib yuklab olish uchun.
 */
const express = require('express');
const router = express.Router();
const { generatePdf, markdownToHtml } = require('../services/pdfBuilder');
const { requireAuth } = require('../middleware/auth');

router.post('/from-markdown', requireAuth, async (req, res) => {
  try {
    const { title, subtitle, markdown, footer, orgName } = req.body || {};
    if (!markdown || typeof markdown !== 'string' || markdown.trim().length < 5) {
      return res.status(400).json({ error: 'markdown matni majburiy' });
    }
    const html = markdownToHtml(markdown);
    const result = await generatePdf({
      title: title || 'Tahlil',
      subtitle: subtitle || null,
      orgName: orgName || 'Analix · BiznesAI',
      sections: [{ html }],
      footer: footer || 'AI tomonidan tayyorlandi',
    });
    res.json(result);
  } catch (e) {
    console.error('[PDF/from-markdown]', e);
    res.status(500).json({ error: e.message || 'PDF yaratishda xato' });
  }
});

module.exports = router;
