/**
 * Cost cap middleware — bugungi AI cost cheklov.
 *
 * Mantiq:
 *   1. Bugungi `SUM(cost_usd)` foydalanuvchi bo'yicha
 *   2. User'ning `daily_cost_cap_usd` (NULL bo'lsa global default — env)
 *   3. Cap >= bugungi total bo'lsa — 402 Payment Required xatosi qaytariladi
 *
 * Admin va super_admin role'i bypass qiladi.
 *
 * Frontend: response.status === 402 bo'lsa, foydalanuvchiga toza xabar (modal yoki banner).
 *
 * Default cap: $2.00/user/day (env: AI_DAILY_COST_CAP_USD)
 */
const pool = require('../db/pool');

const DEFAULT_CAP = parseFloat(process.env.AI_DAILY_COST_CAP_USD || '2.00');

/**
 * Joriy foydalanuvchi cap'ini hisoblash:
 *   - users.daily_cost_cap_usd bo'lsa shu (NULL bo'lsa default)
 *   - 0 bo'lsa to'liq blok (foydalanuvchi AI'ga ruxsatsiz)
 *   - manfiy bo'lsa cheksiz (admin uchun foydali)
 */
async function getUserCap(userId) {
  if (!userId) return DEFAULT_CAP;
  try {
    const r = await pool.query(`SELECT daily_cost_cap_usd FROM users WHERE id = $1`, [userId]);
    if (r.rows.length === 0) return DEFAULT_CAP;
    const v = r.rows[0].daily_cost_cap_usd;
    if (v === null || v === undefined) return DEFAULT_CAP;
    return parseFloat(v);
  } catch {
    return DEFAULT_CAP;
  }
}

/**
 * Bugungi total cost hisoblash.
 */
async function getTodaySpent(userId) {
  if (!userId) return 0;
  const r = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total
     FROM ai_usage_log
     WHERE user_id = $1
       AND created_at >= date_trunc('day', NOW())
       AND status = 'ok'`,
    [userId]
  );
  return parseFloat(r.rows[0]?.total || 0);
}

/**
 * Express middleware — cap'ga yetgan bo'lsa, 402 qaytaradi.
 */
async function checkCostCap(req, res, next) {
  try {
    // Admin/super_admin bypass
    if (req.user?.role === 'admin' || req.user?.role === 'super_admin') {
      return next();
    }

    const userId = req.userId;
    if (!userId) return next();

    const cap = await getUserCap(userId);
    // Manfiy = cheksiz
    if (cap < 0) return next();
    // 0 = to'liq blok
    if (cap === 0) {
      return res.status(402).json({
        error: 'AI ishlatish o\'chirilgan (kunlik cap: $0). Admin\'ga murojaat qiling.',
        cap_usd: 0,
        spent_usd: 0,
      });
    }

    const spent = await getTodaySpent(userId);
    if (spent >= cap) {
      // Cap'ga yetdi — log'ga ham yozamiz
      pool.query(
        `INSERT INTO ai_usage_log (user_id, status, error_message, created_at)
         VALUES ($1, 'cap_hit', $2, NOW())`,
        [userId, `Daily cap $${cap} reached (spent $${spent.toFixed(4)})`]
      ).catch(() => {});

      return res.status(402).json({
        error: `Bugungi AI xarajat limiti tugadi ($${cap.toFixed(2)}). Ertaga davom etadi yoki admin'ga limit oshirish uchun murojaat qiling.`,
        cap_usd: cap,
        spent_usd: Number(spent.toFixed(4)),
        reset_at: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(), // tongi 00:00
      });
    }

    // Spent va cap'ni request'ga biriktiramiz — kelajakda response header'iga qo'yish mumkin
    req._aiCostInfo = { cap, spent, remaining: cap - spent };
    next();
  } catch (e) {
    console.warn('[costCap] middleware xato:', e.message);
    // Xato bo'lsa, ehtiyotkorlik bilan o'tkazamiz (deny qilmaymiz — qora list emas)
    next();
  }
}

module.exports = {
  checkCostCap,
  getUserCap,
  getTodaySpent,
  DEFAULT_CAP,
};
