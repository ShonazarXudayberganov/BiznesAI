import React, { useEffect } from 'react';

/**
 * CapHitModal — kunlik AI cap'ga yetganda ko'rsatiladigan modal.
 *
 * Trigger: AiBrainAPI yoki boshqa AI chaqiruvlari `err.code === 'COST_CAP_HIT'`
 * qaytarganda App-level event ('ai-cap-hit') chiqariladi va shu modal ko'rinadi.
 *
 * Foydalanish:
 *   <CapHitModal />   — App.jsx'da bir marta render qilinadi
 *   window.dispatchEvent(new CustomEvent('ai-cap-hit', { detail: { cap, spent, resetAt } }))
 */

function formatCost(usd) {
  if (!usd && usd !== 0) return '—';
  if (usd < 0.01) return `${(usd * 1000).toFixed(2)} mili-cent`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${Number(usd).toFixed(2)}`;
}

function formatResetTime(resetAt) {
  if (!resetAt) return 'tongi 00:00';
  try {
    const d = new Date(resetAt);
    const now = new Date();
    const hours = Math.max(0, Math.floor((d - now) / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor(((d - now) % (1000 * 60 * 60)) / (1000 * 60)));
    if (hours === 0 && minutes === 0) return 'hozir tiklanadi';
    if (hours === 0) return `${minutes} daqiqadan keyin`;
    return `${hours} soat ${minutes} daqiqadan keyin`;
  } catch {
    return 'tongi 00:00';
  }
}

export default function CapHitModal() {
  const [info, setInfo] = React.useState(null);

  useEffect(() => {
    const onHit = (e) => setInfo(e.detail || {});
    window.addEventListener('ai-cap-hit', onHit);
    return () => window.removeEventListener('ai-cap-hit', onHit);
  }, []);

  if (!info) return null;

  const close = () => setInfo(null);

  return (
    <div className="cap-modal-overlay" onClick={close}>
      <div className="cap-modal" onClick={e => e.stopPropagation()}>
        <button className="cap-modal-close" onClick={close} aria-label="Yopish">×</button>

        <div className="cap-modal-icon">⛔</div>
        <h2 className="cap-modal-title">Kunlik AI limit tugadi</h2>

        <p className="cap-modal-msg">
          Bugun <strong>{formatCost(info.spent)}</strong> sarfladingiz —
          kunlik chegara: <strong>{formatCost(info.cap)}</strong>.
        </p>

        <div className="cap-modal-bar">
          <div className="cap-modal-bar-fill" style={{ width: '100%' }} />
        </div>
        <div className="cap-modal-meta">
          {info.cap > 0 && info.spent > 0 ? `${Math.round((info.spent / info.cap) * 100)}% ishlatildi` : ''}
        </div>

        <div className="cap-modal-info-box">
          <div className="cap-modal-info-icon">⏰</div>
          <div>
            <div className="cap-modal-info-title">Tiklash vaqti</div>
            <div className="cap-modal-info-value">{formatResetTime(info.resetAt)}</div>
            <div className="cap-modal-info-sub">Tongi 00:00 da avtomatik tiklanadi</div>
          </div>
        </div>

        <div className="cap-modal-actions">
          <div className="cap-modal-hint">
            <strong>Tezroq davom etmoqchimisiz?</strong> Adminga murojaat qiling — limit oshirilishi mumkin.
          </div>
          <button className="cap-modal-btn" onClick={close}>Tushunarli</button>
        </div>
      </div>
    </div>
  );
}
