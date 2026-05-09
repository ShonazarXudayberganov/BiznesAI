/**
 * White-label branding endpoint'lari.
 *
 *   GET    /api/branding             — joriy organisatsiya branding (auth) yoki domen-bazali (public)
 *   GET    /api/branding/by-domain   — public, custom domain ?domain= bo'yicha
 *   PUT    /api/branding             — organisatsiya brandingini yangilash (CEO/admin)
 *
 * branding JSONB schema:
 *   {
 *     logo_url:        "https://...",
 *     favicon_url:     "https://...",
 *     primary_color:   "#00C9BE",
 *     accent_color:    "#F2A93B",
 *     app_name:        "Sizning Brand",
 *     hide_powered_by: false,
 *     contact_email:   "support@yours.com",
 *   }
 */

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_BRANDING = {
  app_name: 'BiznesAI',
  primary_color: '#00C9BE',
  accent_color: '#F2A93B',
  logo_url: null,
  favicon_url: null,
  hide_powered_by: false,
  contact_email: null,
};

function mergeBranding(orgRow) {
  if (!orgRow) return { ...DEFAULT_BRANDING };
  const stored = typeof orgRow.branding === 'string' ? JSON.parse(orgRow.branding) : (orgRow.branding || {});
  return {
    ...DEFAULT_BRANDING,
    app_name: stored.app_name || orgRow.name || DEFAULT_BRANDING.app_name,
    logo_url: stored.logo_url || orgRow.logo_url || DEFAULT_BRANDING.logo_url,
    favicon_url: stored.favicon_url || DEFAULT_BRANDING.favicon_url,
    primary_color: stored.primary_color || orgRow.color || DEFAULT_BRANDING.primary_color,
    accent_color: stored.accent_color || DEFAULT_BRANDING.accent_color,
    hide_powered_by: !!stored.hide_powered_by,
    contact_email: stored.contact_email || DEFAULT_BRANDING.contact_email,
  };
}

// Public — domain bo'yicha branding (loginsiz)
router.get('/by-domain', async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.json(DEFAULT_BRANDING);
    const r = await pool.query(
      'SELECT id, name, logo_url, color, branding FROM organizations WHERE custom_domain=$1 AND active=TRUE LIMIT 1',
      [String(domain).toLowerCase().trim()]
    );
    res.json(mergeBranding(r.rows[0]));
  } catch (e) {
    res.json(DEFAULT_BRANDING);
  }
});

// Auth — joriy org branding
router.get('/', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json(DEFAULT_BRANDING);
    const r = await pool.query(
      'SELECT id, name, logo_url, color, branding, custom_domain FROM organizations WHERE id=$1',
      [orgId]
    );
    res.json({ ...mergeBranding(r.rows[0]), custom_domain: r.rows[0]?.custom_domain || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT — branding yangilash (CEO yoki admin)
router.put('/', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.status(400).json({ error: 'Tashkilot topilmadi' });
    const role = req.user.role;
    if (role !== 'ceo' && role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Faqat CEO yoki admin brandingni o\'zgartira oladi' });
    }
    const { branding, custom_domain } = req.body || {};
    if (!branding || typeof branding !== 'object') {
      return res.status(400).json({ error: 'branding obyekti majburiy' });
    }
    // Sanitize — faqat ma'lum maydonlar
    const allowed = ['app_name', 'logo_url', 'favicon_url', 'primary_color', 'accent_color', 'hide_powered_by', 'contact_email'];
    const cleaned = {};
    for (const k of allowed) {
      if (k in branding) cleaned[k] = branding[k];
    }

    if (custom_domain !== undefined) {
      const dom = custom_domain ? String(custom_domain).toLowerCase().trim() : null;
      await pool.query(
        'UPDATE organizations SET branding=$1, custom_domain=$2, updated_at=NOW() WHERE id=$3',
        [JSON.stringify(cleaned), dom, orgId]
      );
    } else {
      await pool.query(
        'UPDATE organizations SET branding=$1, updated_at=NOW() WHERE id=$2',
        [JSON.stringify(cleaned), orgId]
      );
    }
    res.json({ ok: true, branding: cleaned });
  } catch (e) {
    if (String(e.message).includes('idx_org_custom_domain')) {
      return res.status(409).json({ error: 'Bu domen boshqa tashkilot tomonidan band qilingan' });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
