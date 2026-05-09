import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AiUsageAPI, Token } from '../api.js';

/**
 * CostChip — topbar uchun bugungi AI xarajat indikatori.
 * Popup createPortal orqali document.body'ga render qilinadi (overflow:hidden'dan qochish uchun).
 */

const POLL_INTERVAL = 30000;

function pct(spent, cap) {
  if (!cap || cap <= 0) return 0;
  return Math.min(100, Math.round((spent / cap) * 100));
}

function formatCost(usd) {
  if (!usd && usd !== 0) return '—';
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export default function CostChip() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 50, right: 16 });
  const btnRef = useRef(null);

  const fetchData = async () => {
    if (!Token.get()) return; // sessiya yo'q — chaqirmaymiz, 401 cascade'ni oldini olamiz
    try {
      setLoading(true);
      const r = await AiUsageAPI.me();
      setData(r);
    } catch (e) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, POLL_INTERVAL);
    const onChange = () => fetchData();
    window.addEventListener('ai-usage-changed', onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener('ai-usage-changed', onChange);
    };
  }, []);

  // Open bo'lganda popup pozitsiyasini hisoblash
  useEffect(() => {
    if (!open) return;
    const calc = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPopupPos({
        top: r.bottom + 8,
        right: window.innerWidth - r.right,
      });
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [open]);

  if (!data) return null;

  const cap = data.cap || {};
  const isUnlimited = cap.unlimited || cap.daily_usd == null;
  const spent = data.today?.total_cost || 0;
  const calls = data.today?.calls || 0;
  const remaining = cap.remaining ?? null;
  const percentage = isUnlimited ? 0 : pct(spent, cap.daily_usd);

  const tone = isUnlimited ? 'unlimited'
    : percentage >= 80 ? 'danger'
    : percentage >= 50 ? 'warn'
    : 'ok';

  const display = isUnlimited
    ? formatCost(spent)
    : `${formatCost(spent)} / ${formatCost(cap.daily_usd)}`;

  return (
    <>
      <button
        ref={btnRef}
        className={`cost-chip cost-chip-${tone}`}
        onClick={() => setOpen(v => !v)}
        title={isUnlimited ? 'Cheksiz (admin)' : `Bugungi AI xarajat: ${formatCost(spent)} / ${formatCost(cap.daily_usd)}`}
      >
        <span className="cost-chip-dot" />
        <span className="cost-chip-text">{display}</span>
        {!isUnlimited && (
          <span className="cost-chip-bar">
            <span className="cost-chip-bar-fill" style={{ width: `${percentage}%` }} />
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="cost-chip-backdrop" onClick={() => setOpen(false)} />
          <div
            className="cost-chip-popup"
            style={{ top: popupPos.top, right: popupPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cost-chip-popup-head">
              <div>
                <div className="cost-chip-popup-title">AI xarajatlar</div>
                <div className="cost-chip-popup-sub">{calls} chaqiruv · bugun</div>
              </div>
              {!isUnlimited && (
                <div className="cost-chip-budget">
                  <strong>{formatCost(remaining)}</strong>
                  <span>qoldi</span>
                </div>
              )}
            </div>

            {!isUnlimited && (
              <div className="cost-chip-progress">
                <div className="cost-chip-progress-track">
                  <div className={`cost-chip-progress-fill cost-chip-progress-${tone}`} style={{ width: `${percentage}%` }} />
                </div>
                <div className="cost-chip-progress-labels">
                  <span>{formatCost(spent)}</span>
                  <span>{percentage}%</span>
                  <span>{formatCost(cap.daily_usd)}</span>
                </div>
              </div>
            )}

            {isUnlimited && (
              <div className="cost-chip-unlimited">
                <span>∞</span>
                <span>Cheksiz (admin tarif)</span>
              </div>
            )}

            {Array.isArray(data.last_7_days) && data.last_7_days.length > 0 && (
              <div className="cost-chip-section">
                <div className="cost-chip-section-title">7 kunlik trend</div>
                <div className="cost-chip-trend">
                  {data.last_7_days.slice(0, 7).reverse().map((d, i) => {
                    const max = Math.max(...data.last_7_days.map(x => x.cost || 0), 0.001);
                    const h = max > 0 ? Math.max(4, (d.cost / max) * 36) : 4;
                    const day = new Date(d.day).toLocaleDateString('uz-UZ', { weekday: 'short', day: '2-digit' });
                    return (
                      <div key={i} className="cost-chip-trend-bar" title={`${day}: ${formatCost(d.cost)} (${d.calls} chaqiruv)`}>
                        <span className="cost-chip-trend-fill" style={{ height: `${h}px` }} />
                        <span className="cost-chip-trend-day">{day.split(',')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {Array.isArray(data.by_intent_30d) && data.by_intent_30d.length > 0 && (
              <div className="cost-chip-section">
                <div className="cost-chip-section-title">30 kun bo'yicha (top sahifa)</div>
                <div className="cost-chip-intents">
                  {data.by_intent_30d.slice(0, 4).map(i => (
                    <div key={i.intent || 'null'} className="cost-chip-intent-row">
                      <span className="cost-chip-intent-name">{i.intent || '(noma\'lum)'}</span>
                      <span className="cost-chip-intent-meta">{i.calls}× · {formatCost(i.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="cost-chip-foot">
              {loading ? 'Yangilanmoqda...' : 'Har 30 sek avtomatik yangilanadi'}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
