/**
 * Google Sheets API parser.
 * Public ("Anyone with the link") sheets'ni API Key orqali to'liq oladi.
 *
 * Olinadigan ma'lumot:
 *   - Barcha varaqlar (sheets/tabs)
 *   - Barcha qator/ustunlar (cheklov yo'q)
 *   - Formula qiymatlari (FORMATTED_VALUE — ekran'dagi kabi)
 *   - Birlashtirilgan yacheykalar metadata
 */
const { google } = require('googleapis');

const API_KEY = process.env.GOOGLE_API_KEY || '';
if (!API_KEY) {
  console.warn('[SHEETS] GOOGLE_API_KEY env yo\'q — Sheets integratsiyasi ishlamaydi');
}

const sheets = google.sheets({ version: 'v4', auth: API_KEY });

/**
 * URL yoki ID dan workbook ID'ni ajratadi.
 * Qabul qiladi:
 *   - https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
 *   - https://docs.google.com/spreadsheets/d/{ID}/
 *   - {ID} (44 belgili ID o'zi)
 */
function extractWorkbookId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // To'g'ridan-to'g'ri ID (Google ID lar 25-44 belgi, alfanumerik + _ + -)
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) return trimmed;

  // URL'dan ajratish
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];

  return null;
}

/**
 * Foydalanuvchi xato'larini do'stona matnga aylantirish
 */
function friendlyError(err) {
  const code = err?.code || err?.response?.status;
  const msg = err?.errors?.[0]?.message || err?.message || '';

  if (code === 403 || /forbidden/i.test(msg)) {
    return 'Sheet ommaviy emas. Google Sheets\'da "Share" → "Anyone with the link" → Viewer qilib ulashing.';
  }
  if (code === 404 || /not found/i.test(msg)) {
    return 'Sheet topilmadi. URL\'ni tekshiring yoki sheet o\'chirilgan bo\'lishi mumkin.';
  }
  if (code === 400) return 'URL noto\'g\'ri formatda';
  if (code === 429 || /quota/i.test(msg)) return 'Vaqtincha cheklov, biroz kutib qayta urinib ko\'ring';
  return msg || 'Sheets xato: ' + (code || 'noma\'lum');
}

/**
 * Workbook metadatasini olish (varaqlar ro'yxati + asosiy info).
 * Tezkor — preview uchun ishlatiladi.
 */
async function fetchWorkbookMeta(workbookId) {
  if (!API_KEY) throw new Error('GOOGLE_API_KEY sozlanmagan');
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId: workbookId,
      includeGridData: false,
      fields: 'properties.title,properties.locale,properties.timeZone,sheets.properties(sheetId,title,index,gridProperties,hidden)',
    });
    const data = res.data;
    return {
      id: workbookId,
      title: data.properties?.title || 'Untitled',
      locale: data.properties?.locale || null,
      timeZone: data.properties?.timeZone || null,
      sheets: (data.sheets || []).map(s => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        index: s.properties.index,
        rowCount: s.properties.gridProperties?.rowCount || 0,
        colCount: s.properties.gridProperties?.columnCount || 0,
        hidden: !!s.properties.hidden,
      })),
    };
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/**
 * Bitta varaqning to'liq ma'lumotini olish.
 * Default: FORMATTED_VALUE — formula natijalari, sanalar, valyuta — ekran'dagi kabi.
 */
async function fetchSheetValues(workbookId, sheetTitle) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: workbookId,
      range: `'${sheetTitle.replace(/'/g, "''")}'`,  // butun varaq
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    return res.data.values || [];  // 2D massiv: [[row1col1, row1col2, ...], ...]
  } catch (e) {
    throw new Error(`"${sheetTitle}" varagi: ${friendlyError(e)}`);
  }
}

/**
 * Workbook'dagi BARCHA varaqlarni to'liq olish.
 * Yashirin varaqlar ham — biznes egasiga shaffof bo'lsin.
 *
 * @param {string} workbookId
 * @param {object} opts
 * @param {boolean} [opts.skipHidden=false] - yashirin varaqlarni o'tkazish
 * @returns {Promise<{title, sheets: Array<{title, rows, headers, data}>}>}
 */
async function fetchWorkbookFull(workbookId, opts = {}) {
  const meta = await fetchWorkbookMeta(workbookId);
  const result = {
    workbookId,
    title: meta.title,
    locale: meta.locale,
    timeZone: meta.timeZone,
    sheets: [],
    totalRows: 0,
  };

  const tabs = opts.skipHidden ? meta.sheets.filter(s => !s.hidden) : meta.sheets;

  for (const tab of tabs) {
    try {
      const values = await fetchSheetValues(workbookId, tab.title);
      const rowsRaw = values || [];

      // Maksimal ustun soni — eng keng qatorga qarab (varaqda noyob hisoblansin)
      let maxCols = 0;
      for (const r of rowsRaw) {
        if (r && r.length > maxCols) maxCols = r.length;
      }

      // Barcha qator-ustunlarni to'g'rilab to'ldirish (bo'sh hujayralar '' bo'lsin)
      // A1'dan eng oxirgi qiymatga ega hujayragacha — hammasi shu yerga tushadi.
      const fullRaw = rowsRaw.map(r => {
        const out = new Array(maxCols).fill('');
        if (r) for (let i = 0; i < r.length; i++) out[i] = r[i] !== undefined ? r[i] : '';
        return out;
      });

      // Smart header detection — AI uchun strukturali qator obyektlari yaratamiz.
      // RAW data bilan parallel ishlaydi (raw saqlanadi, ob'ektlar AI uchun qulay).
      let headerIdx = -1;
      let maxFilled = 0;
      for (let i = 0; i < Math.min(5, fullRaw.length); i++) {
        const filled = fullRaw[i].filter(c => String(c || '').trim() !== '').length;
        if (filled > maxFilled) { maxFilled = filled; headerIdx = i; }
      }
      if (headerIdx === -1) headerIdx = 0;

      const rawHeaders = fullRaw[headerIdx] || [];
      const headers = [];
      for (let i = 0; i < maxCols; i++) {
        const h = String(rawHeaders[i] || '').trim();
        headers.push(h || `col_${i + 1}`);
      }

      // Obyekt shaklidagi qatorlar (header'dan keyingi)
      const objectRows = fullRaw.slice(headerIdx + 1).map(row => {
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = row[i] !== undefined ? row[i] : '';
        }
        return obj;
      });

      result.sheets.push({
        sheetId: tab.sheetId,
        title: tab.title,
        index: tab.index,
        hidden: tab.hidden,
        // To'liq raw ma'lumot — A1'dan oxirigacha hammasi
        rawRows: fullRaw,
        rawRowCount: fullRaw.length,
        rawColCount: maxCols,
        // Smart-parse natija (AI uchun qulay)
        headerRow: headerIdx,
        headers,
        rows: objectRows,
        rowCount: objectRows.length,
        colCount: headers.length,
      });
      // totalRows — to'liq RAW soni (A1'dan oxirigacha)
      result.totalRows += fullRaw.length;
    } catch (e) {
      console.warn(`[SHEETS] varaq "${tab.title}" o'tkazildi:`, e.message);
      result.sheets.push({
        sheetId: tab.sheetId,
        title: tab.title,
        error: e.message,
        rawRows: [],
        rawRowCount: 0,
        rowCount: 0,
        rows: [],
      });
    }
  }

  return result;
}

module.exports = {
  extractWorkbookId,
  fetchWorkbookMeta,
  fetchSheetValues,
  fetchWorkbookFull,
  friendlyError,
};
