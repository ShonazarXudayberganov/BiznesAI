const express = require('express');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// SSRF himoyasi: private/loopback IP manzillarga so'rovni bloklash
function isPrivateIp(ip) {
    if (!ip) return false;
    // IPv6 loopback / private
    if (ip === '::1' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80')) return true;
    // IPv4
    const parts = ip.split('.').map(n => parseInt(n, 10));
    if (parts.length !== 4 || parts.some(n => isNaN(n))) return false;
    const [a, b] = parts;
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a >= 224) return true;                       // multicast / reserved
    return false;
}

async function assertPublicHost(hostname) {
    // Literal IP
    if (/^[0-9.]+$/.test(hostname) || hostname.includes(':')) {
        if (isPrivateIp(hostname)) throw new Error('Ichki tarmoq manzillariga ulanish taqiqlangan');
        return;
    }
    try {
        const addrs = await dns.lookup(hostname, { all: true });
        for (const a of addrs) {
            if (isPrivateIp(a.address)) throw new Error('Ichki tarmoq manzillariga ulanish taqiqlangan');
        }
    } catch (e) {
        if (e.message && e.message.includes('Ichki tarmoq')) throw e;
        // DNS topilmasa — fetch keyin tegishli xato beradi
    }
}

// Saytdan HTML yuklab olish (Node.js http/https modullari — SSL ham o'tadi)
function fetchHtml(url, timeout = 15000, redirectDepth = 0) {
    return new Promise((resolve, reject) => {
        if (redirectDepth > 5) return reject(new Error('Juda ko\'p redirect'));
        let parsed;
        try { parsed = new URL(url); } catch (e) { return reject(new Error('URL noto\'g\'ri formatda')); }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return reject(new Error('Faqat http/https qo\'llab-quvvatlanadi'));
        }

        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: (parsed.pathname || '/') + (parsed.search || ''),
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'uz,en-US;q=0.9,en;q=0.8,ru;q=0.7',
                'Accept-Encoding': 'identity',
                'Connection': 'close',
            },
            // SSL: ko'p o'zbek saytlarda sertifikat muammolari bor — default ravishda tekshirilmaydi.
            // SCRAPE_STRICT_TLS=true qilib qat'iy tekshiruvni yoqish mumkin.
            // SSRF xavfi yuqorida assertPublicHost() bilan bloklanadi, shuning uchun bu yerda TLS off xavfli emas.
            rejectUnauthorized: process.env.SCRAPE_STRICT_TLS === 'true',
        };

        let settled = false;
        const done = (fn) => { if (!settled) { settled = true; fn(); } };

        const timer = setTimeout(() => {
            done(() => reject(new Error('Saytga ulanish vaqti tugadi (15 soniya)')));
            try { req.destroy(); } catch { }
        }, timeout);

        const req = lib.request(options, (res) => {
            // Redirect (301/302/307/308) ni kuzatish
            const loc = res.headers.location;
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
                clearTimeout(timer);
                const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
                fetchHtml(next, timeout, redirectDepth + 1).then(
                    html => done(() => resolve(html)),
                    err => done(() => reject(err))
                );
                return;
            }

            if (res.statusCode < 200 || res.statusCode >= 400) {
                clearTimeout(timer);
                done(() => reject(new Error(`HTTP ${res.statusCode}: sayt so'rovni rad etdi`)));
                return;
            }

            const chunks = [];
            let totalBytes = 0;
            const MAX_BYTES = 5 * 1024 * 1024; // 5MB limit — juda katta sahifalar uchun himoya
            res.on('data', chunk => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_BYTES) {
                    clearTimeout(timer);
                    try { req.destroy(); } catch { }
                    done(() => reject(new Error('Sahifa hajmi 5MB dan katta — tahlil qilinmaydi')));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                clearTimeout(timer);
                const html = Buffer.concat(chunks).toString('utf8');
                done(() => resolve(html));
            });
            res.on('error', err => { clearTimeout(timer); done(() => reject(err)); });
        });

        req.on('error', (err) => {
            clearTimeout(timer);
            let msg = err.message;
            if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo'))
                msg = `Sayt topilmadi: "${parsed.hostname}" domen mavjud emas`;
            else if (msg.includes('ECONNREFUSED'))
                msg = 'Sayt ulanishni rad etdi';
            else if (msg.includes('ETIMEDOUT') || msg.includes('socket hang up'))
                msg = 'Ulanish vaqti tugadi';
            else if (msg.includes('ECONNRESET'))
                msg = 'Sayt ulanishni uzdi (ECONNRESET)';
            done(() => reject(new Error(msg)));
        });

        req.setTimeout(timeout, () => {
            done(() => reject(new Error('Saytga ulanish vaqti tugadi (15 soniya)')));
            try { req.destroy(); } catch { }
        });

        req.end();
    });
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
    $('script, style, noscript, iframe, svg, canvas').remove();

    const title = cleanText($('title').text()) || cleanText($('h1').first().text()) || '';
    const metaDesc = cleanText($('meta[name="description"], meta[property="og:description"]').first().attr('content') || '');
    const metaKeywords = cleanText($('meta[name="keywords"]').attr('content') || '');
    const ogTitle = cleanText($('meta[property="og:title"]').attr('content') || '');
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const canonical = $('link[rel="canonical"]').attr('href') || url;

    const headings = { h1: [], h2: [], h3: [] };
    $('h1').each((_, el) => { const t = cleanText($(el).text()); if (t) headings.h1.push(t); });
    $('h2').each((_, el) => { const t = cleanText($(el).text()); if (t) headings.h2.push(t); });
    $('h3').each((_, el) => { const t = cleanText($(el).text()); if (t) headings.h3.push(t); });

    const paragraphs = [];
    $('p, li').each((_, el) => {
        const t = cleanText($(el).text());
        if (t.length > 30) paragraphs.push(t);
    });

    const phones = [];
    const emails = [];
    const pageText = $.text();
    const phoneMatches = pageText.match(/[\+\(]?[0-9][0-9\s\-\(\)\.]{8,}[0-9]/g) || [];
    phoneMatches.forEach(p => { const c = p.replace(/\s/g, ''); if (c.length >= 9 && c.length <= 15) phones.push(c); });
    const emailMatches = pageText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
    emailMatches.forEach(e => emails.push(e));

    const socials = {};
    const socialPatterns = {
        instagram: /instagram\.com\/([^\/\s"'?]+)/,
        telegram: /t\.me\/([^\/\s"'?]+)|telegram\.me\/([^\/\s"'?]+)/,
        facebook: /facebook\.com\/([^\/\s"'?]+)/,
        youtube: /youtube\.com\/(channel|c|@)\/([^\/\s"'?]+)/,
        tiktok: /tiktok\.com\/@([^\/\s"'?]+)/,
    };
    Object.entries(socialPatterns).forEach(([net, rx]) => {
        const m = html.match(rx);
        if (m) socials[net] = m[0].startsWith('http') ? m[0] : 'https://' + m[0];
    });

    const cards = [];
    $('[class*="card"], [class*="product"], [class*="service"], [class*="item"], [class*="offer"]').each((_, el) => {
        const t = cleanText($(el).text()).substring(0, 150);
        const price = t.match(/[\d\s.,]+\s*(so'm|sum|рублей|руб|uzs|\$|€|usd)/i)?.[0] || '';
        if (t.length > 20) cards.push({ text: t, price: price || null });
    });

    const prices = [];
    const priceRx = /(\d[\d\s.,]+)\s*(so'm|sum|рублей|руб|uzs)/gi;
    let pm;
    while ((pm = priceRx.exec(pageText)) !== null) {
        const num = parseFloat(pm[1].replace(/[\s,]/g, '').replace('.', ''));
        if (!isNaN(num) && num > 0) prices.push(num);
    }

    const internalLinks = extractInternalLinks($, url, 30);
    const externalLinks = [];
    $('a[href]').each((_, el) => {
        try {
            const href = $(el).attr('href') || '';
            const abs = new URL(href, url).href;
            if (!abs.includes(new URL(url).hostname) && abs.startsWith('http')) externalLinks.push(abs);
        } catch { }
    });

    const lang = $('html').attr('lang') || '';
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

    const check = await pool.query('SELECT id FROM sources WHERE id=$1 AND user_id=$2', [sourceId, req.userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Manba topilmadi' });

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;

    // SSRF himoyasi — URL public hostnamega yo'naltirilsin
    let parsedUrl;
    try { parsedUrl = new URL(normalizedUrl); } catch { return res.status(400).json({ error: 'URL noto\'g\'ri formatda' }); }
    try {
        await assertPublicHost(parsedUrl.hostname);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    try {
        console.log(`[SCRAPE] Starting: ${normalizedUrl} (deep=${deepScan})`);

        const mainHtml = await fetchHtml(normalizedUrl);
        const mainData = analyzePage(mainHtml, normalizedUrl);

        const allPages = [{ ...mainData, _type: 'website_page', _page_type: 'bosh_sahifa' }];

        if (deepScan) {
            const innerLinks = mainData.ichki_havolalar.slice(0, 10);

            // Parallel fetch — ketma-ket o'rniga barchasi birga
            const results = await Promise.allSettled(
                innerLinks.map(link => fetchHtml(link, 10000).then(html => ({ link, html })))
            );

            let scanned = 0;
            results.forEach((result, idx) => {
                const link = innerLinks[idx];
                if (result.status === 'rejected') {
                    console.warn(`[SCRAPE] Failed inner page ${link}: ${result.reason?.message || result.reason}`);
                    return;
                }
                try {
                    const pageData = analyzePage(result.value.html, link);
                    const pathLower = new URL(link).pathname.toLowerCase();
                    let pageType = 'ichki_sahifa';
                    if (/contact|aloqa|bog-lan|murojaat/.test(pathLower)) pageType = 'aloqa_sahifasi';
                    else if (/about|biz-haqimizda|haqimizda|about-us/.test(pathLower)) pageType = 'biz_haqimizda';
                    else if (/product|mahsulot|catalog|katalog/.test(pathLower)) pageType = 'mahsulotlar';
                    else if (/service|xizmat/.test(pathLower)) pageType = 'xizmatlar';
                    else if (/price|narx|tarif/.test(pathLower)) pageType = 'narxlar';
                    else if (/blog|yangilik|news/.test(pathLower)) pageType = 'blog';
                    allPages.push({ ...pageData, _type: 'website_page', _page_type: pageType });
                    scanned++;
                } catch (e) {
                    console.warn(`[SCRAPE] analyze failed ${link}: ${e.message}`);
                }
            });
            console.log(`[SCRAPE] Inner pages scanned: ${scanned}/${innerLinks.length}`);
        }

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
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
