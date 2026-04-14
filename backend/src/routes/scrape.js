const express = require('express');
const cheerio = require('cheerio');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Saytdan HTML yuklab olish (Node 18+ fetch)
async function fetchHtml(url, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'uz,en-US;q=0.9,en;q=0.8,ru;q=0.7',
            }
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('html')) throw new Error(`Sayt HTML qaytarmayapti (${ct})`);
        return await res.text();
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('Saytga ulanish vaqti tugadi (15 soniya)');
        throw e;
    }
}

// Matnni tozalash
function cleanText(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
}

// Ichki sahifalarni olish (relative → absolute)
function extractInternalLinks($, baseUrl, limit = 20) {
    const base = new URL(baseUrl);
    const links = new Set();
    $('a[href]').each((_, el) => {
        try {
            const href = $(el).attr('href') || '';
            if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            const abs = new URL(href, base.origin).href;
            if (abs.startsWith(base.origin) && abs !== baseUrl) links.add(abs);
        } catch { }
    });
    return [...links].slice(0, limit);
}

// Bir sahifani tahlil qilish
function analyzePage(html, url) {
    const $ = cheerio.load(html);

    // Navigatsiya, footer, script, style ni olib tashlash (asosiy kontent uchun)
    $('script, style, noscript, iframe, svg, canvas').remove();

    const title = cleanText($('title').text()) || cleanText($('h1').first().text()) || '';
    const metaDesc = cleanText($('meta[name="description"], meta[property="og:description"]').first().attr('content') || '');
    const metaKeywords = cleanText($('meta[name="keywords"]').attr('content') || '');
    const ogTitle = cleanText($('meta[property="og:title"]').attr('content') || '');
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const canonical = $('link[rel="canonical"]').attr('href') || url;

    // Sarlavhalar
    const headings = { h1: [], h2: [], h3: [] };
    $('h1').each((_, el) => { const t = cleanText($(el).text()); if (t) headings.h1.push(t); });
    $('h2').each((_, el) => { const t = cleanText($(el).text()); if (t) headings.h2.push(t); });
    $('h3').each((_, el) => { const t = cleanText($(el).text()); if (t) headings.h3.push(t); });

    // Asosiy matn (paragraf + list)
    const paragraphs = [];
    $('p, li').each((_, el) => {
        const t = cleanText($(el).text());
        if (t.length > 30) paragraphs.push(t);
    });

    // Aloqa ma'lumotlari
    const phones = [];
    const emails = [];
    const pageText = $.text();
    const phoneMatches = pageText.match(/[\+\(]?[0-9][0-9\s\-\(\)\.]{8,}[0-9]/g) || [];
    phoneMatches.forEach(p => { const c = p.replace(/\s/g, ''); if (c.length >= 9 && c.length <= 15) phones.push(c); });
    const emailMatches = pageText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
    emailMatches.forEach(e => emails.push(e));

    // Ijtimoiy tarmoqlar
    const socials = {};
    const socialPatterns = {
        instagram: /instagram\.com\/([^\/\s"'?]+)/,
        telegram: /t\.me\/([^\/\s"'?]+)|telegram\.me\/([^\/\s"'?]+)/,
        facebook: /facebook\.com\/([^\/\s"'?]+)/,
        youtube: /youtube\.com\/(channel|c|@)\/([^\/\s"'?]+)/,
        tiktok: /tiktok\.com\/@([^\/\s"'?]+)/,
    };
    const fullHtml = html;
    Object.entries(socialPatterns).forEach(([net, rx]) => {
        const m = fullHtml.match(rx);
        if (m) socials[net] = m[0].startsWith('http') ? m[0] : 'https://' + m[0];
    });

    // Mahsulot/xizmat bloklari (karta ko'rinishidagi)
    const cards = [];
    $('[class*="card"], [class*="product"], [class*="service"], [class*="item"], [class*="offer"]').each((_, el) => {
        const t = cleanText($(el).text()).substring(0, 150);
        const price = t.match(/[\d\s.,]+\s*(so'm|sum|рублей|руб|uzs|\$|€|usd)/i)?.[0] || '';
        if (t.length > 20) cards.push({ text: t, price: price || null });
    });

    // Narxlar
    const prices = [];
    const priceRx = /(\d[\d\s.,]+)\s*(so'm|sum|рублей|руб|uzs)/gi;
    let pm;
    while ((pm = priceRx.exec(pageText)) !== null) {
        const num = parseFloat(pm[1].replace(/[\s,]/g, '').replace('.', ''));
        if (!isNaN(num) && num > 0) prices.push(num);
    }

    // Ichki havolalar soni
    const internalLinks = extractInternalLinks($, url, 30);
    const externalLinks = [];
    $('a[href]').each((_, el) => {
        try {
            const href = $(el).attr('href') || '';
            const abs = new URL(href, url).href;
            if (!abs.includes(new URL(url).hostname) && abs.startsWith('http')) externalLinks.push(abs);
        } catch { }
    });

    // Sayt tili
    const lang = $('html').attr('lang') || '';

    // Asosiy kontent matni (SEO tahlil uchun)
    const mainContent = paragraphs.slice(0, 30).join('\n');

    return {
        url,
        sahifa_sarlavhasi: title,
        meta_tavsif: metaDesc,
        meta_kalit_sozlar: metaKeywords,
        og_sarlavha: ogTitle,
        og_rasm: ogImage,
        canonical_url: canonical,
        til: lang,
        h1_sarlavhalar: headings.h1.slice(0, 5),
        h2_sarlavhalar: headings.h2.slice(0, 10),
        h3_sarlavhalar: headings.h3.slice(0, 10),
        asosiy_matn: mainContent.substring(0, 3000),
        paragraf_soni: paragraphs.length,
        telefon_raqamlar: [...new Set(phones)].slice(0, 10),
        email_manzillar: [...new Set(emails)].slice(0, 10),
        ijtimoiy_tarmoqlar: socials,
        mahsulot_xizmatlar: cards.slice(0, 20),
        narxlar: [...new Set(prices)].slice(0, 20),
        ichki_havolalar: internalLinks,
        tashqi_havolalar: [...new Set(externalLinks)].slice(0, 10),
        ichki_sahifalar_soni: internalLinks.length,
    };
}

// ── POST /api/scrape ── (Saytni to'liq tahlil qilish)
router.post('/', async (req, res) => {
    const { url, sourceId, deepScan = false } = req.body;

    if (!url) return res.status(400).json({ error: 'url kerak' });
    if (!sourceId) return res.status(400).json({ error: 'sourceId kerak' });

    // Manba foydalanuvchiga tegishliligini tekshirish
    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [sourceId, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    // URL ni normallashtirish
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;

    try {
        console.log(`[SCRAPE] Starting: ${normalizedUrl} (deep=${deepScan})`);

        // 1. Asosiy sahifani yuklash
        const mainHtml = await fetchHtml(normalizedUrl);
        const mainData = analyzePage(mainHtml, normalizedUrl);

        const allPages = [{ ...mainData, _type: 'website_page', _page_type: 'bosh_sahifa' }];

        // 2. Deep scan — ichki sahifalarni ham o'qish
        if (deepScan) {
            const innerLinks = mainData.ichki_havolalar.slice(0, 10); // Max 10 sahifa
            let scanned = 0;
            for (const link of innerLinks) {
                try {
                    console.log(`[SCRAPE] Inner page: ${link}`);
                    const html = await fetchHtml(link, 10000);
                    const pageData = analyzePage(html, link);
                    // Ichki sahifa turi aniqlash (URL dan)
                    const path = new URL(link).pathname.toLowerCase();
                    let pageType = 'ichki_sahifa';
                    if (/contact|aloqa|bog-lan|murojaat/.test(path)) pageType = 'aloqa_sahifasi';
                    else if (/about|biz-haqimizda|haqimizda|about-us/.test(path)) pageType = 'biz_haqimizda';
                    else if (/product|mahsulot|catalog|katalog/.test(path)) pageType = 'mahsulotlar';
                    else if (/service|xizmat/.test(path)) pageType = 'xizmatlar';
                    else if (/price|narx|tarif/.test(path)) pageType = 'narxlar';
                    else if (/blog|yangilik|news/.test(path)) pageType = 'blog';
                    allPages.push({ ...pageData, _type: 'website_page', _page_type: pageType });
                    scanned++;
                } catch (e) {
                    console.warn(`[SCRAPE] Failed inner page ${link}: ${e.message}`);
                }
            }
            console.log(`[SCRAPE] Inner pages scanned: ${scanned}`);
        }

        // 3. Umumiy statistika summary = bitta yig'ma yozuv
        const allPhones = [...new Set(allPages.flatMap(p => p.telefon_raqamlar))];
        const allEmails = [...new Set(allPages.flatMap(p => p.email_manzillar))];
        const allSocials = Object.assign({}, ...allPages.map(p => p.ijtimoiy_tarmoqlar));
        const allPrices = allPages.flatMap(p => p.narxlar);
        const allCards = allPages.flatMap(p => p.mahsulot_xizmatlar);
        const allH2 = [...new Set(allPages.flatMap(p => p.h2_sarlavhalar))];

        const summary = {
            _type: 'SAYT_STATISTIKA',
            sayt_url: normalizedUrl,
            domen: new URL(normalizedUrl).hostname,
            bosh_sahifa_sarlavhasi: mainData.sahifa_sarlavhasi,
            meta_tavsif: mainData.meta_tavsif,
            og_rasm: mainData.og_rasm,
            til: mainData.til,
            tahlil_qilingan_sahifalar: allPages.length,
            jami_ichki_havolalar: mainData.ichki_sahifalar_soni,
            telefon_raqamlar: allPhones.slice(0, 10),
            email_manzillar: allEmails.slice(0, 10),
            ijtimoiy_tarmoqlar: allSocials,
            narxlar_soni: allPrices.length,
            min_narx: allPrices.length > 0 ? Math.min(...allPrices) : 0,
            max_narx: allPrices.length > 0 ? Math.max(...allPrices) : 0,
            mahsulot_xizmat_soni: allCards.length,
            asosiy_sarlavhalar: allH2.slice(0, 15),
            h1: mainData.h1_sarlavhalar,
            asosiy_matn_fragment: mainData.asosiy_matn.substring(0, 500),
            oxirgi_tekshiruv: new Date().toLocaleString('uz-UZ'),
        };

        const finalData = [summary, ...allPages];

        // 4. Bazaga saqlash
        await pool.query(
            `INSERT INTO source_data (source_id, data, row_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source_id) DO UPDATE SET data=$2, row_count=$3, updated_at=NOW()`,
            [sourceId, JSON.stringify(finalData), finalData.length]
        );
        await pool.query(
            `UPDATE sources SET connected=TRUE, active=TRUE, updated_at=NOW(),
       config = config || $2::jsonb
       WHERE id=$1`,
            [sourceId, JSON.stringify({ lastFetch: Date.now(), scannedPages: allPages.length, siteUrl: normalizedUrl })]
        );

        console.log(`[SCRAPE] Done: ${allPages.length} pages, ${finalData.length} total rows`);
        res.json({
            ok: true,
            pagesScanned: allPages.length,
            rowCount: finalData.length,
            summary: {
                title: mainData.sahifa_sarlavhasi,
                phones: allPhones,
                emails: allEmails,
                socials: allSocials,
                priceCount: allPrices.length,
            }
        });

    } catch (e) {
        console.error('[SCRAPE] Error:', e.message);
        // Xatoni o'zbekchalashtirish
        let errMsg = e.message;
        if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) errMsg = `Sayt topilmadi: "${normalizedUrl}" manzili mavjud emas yoki internet ulangan emas`;
        else if (errMsg.includes('ECONNREFUSED')) errMsg = 'Sayt ulanishni rad etdi (Connection refused)';
        else if (errMsg.includes('certificate') || errMsg.includes('SSL')) errMsg = 'Saytning SSL sertifikati bilan muammo bor';
        res.status(500).json({ error: errMsg });
    }
});

module.exports = router;
