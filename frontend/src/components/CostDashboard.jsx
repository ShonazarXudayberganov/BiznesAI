import React, { useEffect, useState } from 'react';
import { AiUsageAPI } from '../api.js';

/**
 * CostDashboard — admin panel: AI xarajatlar ko'rinishi.
 *
 * Bo'limlar:
 *   - Bugungi katta raqam + 7-kun trend
 *   - Per-intent breakdown
 *   - Top 10 user (cost bo'yicha)
 *   - O'rtacha bir chaqiruv narxi, jami token, web search soni
 */

function formatCost(usd, decimals = 4) {
  if (!usd && usd !== 0) return '—';
  if (usd === 0) return '$0';
  // < 1 cent ($0.01) — 4 decimal place bilan, m$ notatsiyasiz (chalkash)
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  // < $1 — 4 decimal place
  if (usd < 1) return `$${usd.toFixed(decimals)}`;
  // > $1 — 2 decimal place
  return `$${usd.toFixed(2)}`;
}

function formatNum(n) {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function formatDay(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });
}

export default function CostDashboard({ user, push }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (isAdmin) {
        const r = await AiUsageAPI.org(days);
        setData(r);
      } else {
        const r = await AiUsageAPI.me();
        setData({ daily: r.last_7_days || [], by_intent: r.by_intent_30d || [], top_users: [] });
      }
    } catch (e) {
      console.error('[CostDashboard] load xato:', e);
      const msg = e?.message || 'noma\'lum xato';
      setLoadError(msg);
      setData({ daily: [], by_intent: [], top_users: [] });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // AI chaqiruvlaridan keyin auto-refresh
    const onChange = () => load();
    window.addEventListener('ai-usage-changed', onChange);
    return () => window.removeEventListener('ai-usage-changed', onChange);
    /* eslint-disable-next-line */
  }, [days, isAdmin]);

  if (loading) return <div className="cost-dash"><div className="mem-empty"><div className="mem-empty-spinner" />Yuklanmoqda...</div></div>;
  if (loadError) return (
    <div className="cost-dash">
      <div className="mem-error-banner">
        <span>⚠</span>
        <div>
          <strong>Cost dashboard yuklab bo'lmadi</strong>
          <code>{loadError}</code>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={load}>Qayta urinish</button>
      </div>
    </div>
  );
  if (!data) return null;

  const totalCost = (data.daily || []).reduce((a, d) => a + (d.cost || 0), 0);
  const totalCalls = (data.daily || []).reduce((a, d) => a + (d.calls || 0), 0);
  const totalTokens = (data.daily || []).reduce((a, d) => a + (d.input_tokens || 0) + (d.output_tokens || 0), 0);
  const totalWebSearches = (data.daily || []).reduce((a, d) => a + (d.web_searches || 0), 0);
  const avgPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;

  const todayCost = data.daily?.[0]?.cost || 0;
  const yesterdayCost = data.daily?.[1]?.cost || 0;
  const trend = yesterdayCost > 0 ? ((todayCost - yesterdayCost) / yesterdayCost) * 100 : 0;
  const trendKind = trend > 5 ? 'up' : trend < -5 ? 'down' : 'flat';

  // Bar chart max
  const maxDailyCost = Math.max(...(data.daily || []).map(d => d.cost || 0), 0.001);

  return (
    <div className="cost-dash">
      <div className="cost-dash-header">
        <div>
          <h1 className="cost-dash-title">AI Xarajatlar</h1>
          <p className="cost-dash-sub">
            {isAdmin ? 'Tashkilot bo\'yicha umumiy' : 'Sizning xarajatingiz'} · so'nggi {days} kun
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <div className="cost-dash-period">
              {[7, 14, 30, 90].map(d => (
                <button
                  key={d}
                  className={`cost-dash-period-btn ${days === d ? 'active' : ''}`}
                  onClick={() => setDays(d)}
                >
                  {d} kun
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load} title="Yangilash">
            ↻ Yangilash
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="cost-dash-kpis">
        <div className="cost-dash-kpi-card cost-dash-kpi-primary">
          <div className="cost-dash-kpi-label">JAMI XARAJAT</div>
          <div className="cost-dash-kpi-value">{formatCost(totalCost, 2)}</div>
          <div className="cost-dash-kpi-sub">
            {totalCalls} chaqiruv · o'rtacha {formatCost(avgPerCall)} / chaqiruv
          </div>
        </div>

        <div className="cost-dash-kpi-card">
          <div className="cost-dash-kpi-label">BUGUN</div>
          <div className="cost-dash-kpi-value">{formatCost(todayCost)}</div>
          <div className="cost-dash-kpi-sub">
            {trendKind === 'up' && <span style={{ color: 'var(--red)' }}>▲ +{trend.toFixed(0)}%</span>}
            {trendKind === 'down' && <span style={{ color: 'var(--green)' }}>▼ {trend.toFixed(0)}%</span>}
            {trendKind === 'flat' && <span style={{ color: 'var(--muted)' }}>≈ barqaror</span>}
            <span style={{ color: 'var(--muted)' }}> kechagi {formatCost(yesterdayCost)}</span>
          </div>
        </div>

        <div className="cost-dash-kpi-card">
          <div className="cost-dash-kpi-label">JAMI TOKEN</div>
          <div className="cost-dash-kpi-value">{formatNum(totalTokens)}</div>
          <div className="cost-dash-kpi-sub">input + output</div>
        </div>

        <div className="cost-dash-kpi-card">
          <div className="cost-dash-kpi-label">WEB QIDIRUV</div>
          <div className="cost-dash-kpi-value">{totalWebSearches}</div>
          <div className="cost-dash-kpi-sub">{formatCost(totalWebSearches * 0.01)} (Anthropic)</div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="cost-dash-card">
        <div className="cost-dash-card-head">
          <h3>Kunlik xarajat</h3>
          <span className="cost-dash-card-sub">{days} kun</span>
        </div>
        <div className="cost-dash-bars">
          {(data.daily || []).slice().reverse().map((d, i) => {
            const h = d.cost > 0 ? Math.max(8, (d.cost / maxDailyCost) * 100) : 4;
            return (
              <div key={i} className="cost-dash-bar-col" title={`${formatDay(d.day)}: ${formatCost(d.cost)} (${d.calls} chaqiruv)`}>
                <div className="cost-dash-bar-value">{formatCost(d.cost, 3)}</div>
                <div className="cost-dash-bar-wrap">
                  <div className="cost-dash-bar-fill" style={{ height: `${h}%` }} />
                </div>
                <div className="cost-dash-bar-day">{formatDay(d.day)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cost-dash-grid">
        {/* Intent breakdown */}
        <div className="cost-dash-card">
          <div className="cost-dash-card-head">
            <h3>Sahifa bo'yicha taqsim</h3>
            <span className="cost-dash-card-sub">{(data.by_intent || []).length} intent</span>
          </div>
          {(data.by_intent || []).length === 0 ? (
            <div className="cost-dash-empty">Hali ma'lumot yo'q</div>
          ) : (
            <div className="cost-dash-intent-list">
              {(data.by_intent || []).slice(0, 8).map(i => {
                const pct = totalCost > 0 ? (i.cost / totalCost) * 100 : 0;
                return (
                  <div key={i.intent} className="cost-dash-intent-row">
                    <div className="cost-dash-intent-info">
                      <div className="cost-dash-intent-name">{i.intent}</div>
                      <div className="cost-dash-intent-meta">
                        {i.calls} × · ~{i.avg_duration_ms ? (i.avg_duration_ms / 1000).toFixed(1) : '?'}s
                        {i.avg_iterations && ` · ${i.avg_iterations} iter`}
                      </div>
                    </div>
                    <div className="cost-dash-intent-bar-wrap">
                      <div className="cost-dash-intent-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="cost-dash-intent-cost">{formatCost(i.cost)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top users (admin only) */}
        {isAdmin && (
          <div className="cost-dash-card">
            <div className="cost-dash-card-head">
              <h3>Top foydalanuvchilar</h3>
              <span className="cost-dash-card-sub">cost bo'yicha</span>
            </div>
            {(data.top_users || []).length === 0 ? (
              <div className="cost-dash-empty">Hali foydalanish yo'q</div>
            ) : (
              <div className="cost-dash-users">
                {(data.top_users || []).map((u, i) => {
                  const max = Math.max(...(data.top_users || []).map(x => x.cost || 0), 0.001);
                  const pct = max > 0 ? (u.cost / max) * 100 : 0;
                  return (
                    <div key={u.user_id} className="cost-dash-user-row">
                      <div className="cost-dash-user-rank">#{i + 1}</div>
                      <div className="cost-dash-user-info">
                        <div className="cost-dash-user-id">User #{u.user_id}</div>
                        <div className="cost-dash-user-meta">{u.calls} chaqiruv</div>
                      </div>
                      <div className="cost-dash-user-bar-wrap">
                        <div className="cost-dash-user-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="cost-dash-user-cost">{formatCost(u.cost)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="cost-dash-info">
        💡 Cost har AI chaqiruvi uchun real-time hisoblanadi va <code>ai_usage_log</code> jadvaliga yoziladi.
        Default kunlik cap har user uchun $2 (admin <code>PUT /api/admin/ai/cap/:userId</code> orqali o'zgartiradi).
      </div>
    </div>
  );
}
