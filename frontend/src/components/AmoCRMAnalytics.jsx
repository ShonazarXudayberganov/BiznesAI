import React, { useMemo, useState } from 'react';
import AdvancedChart from './AdvancedChart';

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace(/\.0+$/, '') + ' mlrd';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace(/\.0+$/, '') + ' mln';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return Math.round(v).toLocaleString('uz-UZ');
}
function fmtNum(n) { if (n === null || n === undefined) return '—'; return Number(n).toLocaleString('uz-UZ'); }

const STAGES = [
  { id: "new", name: "Yangi lid", color: "#94A3B8" },
  { id: "contact", name: "Aloqa", color: "#60A5FA" },
  { id: "qualified", name: "Munosib", color: "#A78BFA" },
  { id: "proposal", name: "Taklif", color: "#F8A839" },
  { id: "negotiation", name: "Muzokara", color: "#FBBF24" },
  { id: "closed_won", name: "Yutib olindi", color: "#10B981" },
  { id: "closed_lost", name: "Yo'qotildi", color: "#EF4444" },
];

export default function AmoCRMAnalytics({ source }) {
  const data = source?.data || [];
  const leads = useMemo(() => data.filter(d => d.type === 'lead'), [data]);
  const contacts = useMemo(() => data.filter(d => d.type === 'contact'), [data]);
  const tasks = useMemo(() => data.filter(d => d.type === 'task'), [data]);
  const calls = useMemo(() => data.filter(d => d.type === 'call'), [data]);
  const notes = useMemo(() => data.filter(d => d.type === 'note'), [data]);

  const [tab, setTab] = useState('pipeline');

  // Header stats
  const stats = useMemo(() => {
    const won = leads.filter(l => l.Won);
    const lost = leads.filter(l => l.Stage === 'closed_lost');
    const active = leads.filter(l => !l.Closed);
    const totalRevenue = won.reduce((a, l) => a + (l.Amount || 0), 0);
    const pipelineValue = active.reduce((a, l) => a + (l.Amount || 0), 0);
    const weightedPipeline = active.reduce((a, l) => a + (l.Amount || 0) * (l.ProbabilityPct || 0) / 100, 0);
    const avgDeal = won.length ? Math.round(totalRevenue / won.length) : 0;
    const conversionRate = leads.length ? +(won.length / leads.length * 100).toFixed(1) : 0;
    const winRateClosed = (won.length + lost.length) ? +(won.length / (won.length + lost.length) * 100).toFixed(1) : 0;
    const avgCycle = won.length ? Math.round(won.reduce((a, l) => a + (l.CycleHours || 0), 0) / won.length / 24) : 0;
    return { won, lost, active, totalRevenue, pipelineValue, weightedPipeline, avgDeal, conversionRate, winRateClosed, avgCycle };
  }, [leads]);

  if (!leads.length) {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🟡</div>
        <h2 style={{ fontFamily: 'var(--fh)', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>AmoCRM ulanmagan</h2>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER */}
      <div style={{
        padding: '24px 28px',
        background: 'linear-gradient(135deg, rgba(255,196,0,0.12) 0%, rgba(255,140,0,0.08) 100%)',
        border: '1px solid rgba(255,196,0,0.30)',
        borderRadius: 18,
        display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 14,
          background: 'linear-gradient(135deg, #FFC400, #FF8C00)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
        }}>🟡</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: '#FFC400', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800, marginBottom: 4 }}>AmoCRM</div>
          <div style={{ fontFamily: 'var(--fh)', fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{source.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {leads.length} lid · {contacts.length} mijoz · {tasks.length} vazifa · {calls.length} qo'ng'iroq
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[
            { l: 'Daromad', v: fmtMoney(stats.totalRevenue), c: '#10B981' },
            { l: 'Pipeline', v: fmtMoney(stats.pipelineValue), c: '#FFC400' },
            { l: 'Weighted', v: fmtMoney(stats.weightedPipeline), c: '#A78BFA' },
            { l: 'Win rate', v: stats.winRateClosed + '%', c: '#10B981' },
            { l: 'O\'rt. tsikl', v: stats.avgCycle + ' kun' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--fm)', fontWeight: 700, marginBottom: 4 }}>{s.l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.c || 'var(--text)', fontFamily: 'var(--fh)', letterSpacing: '-0.4px' }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <Tabs value={tab} onChange={setTab} options={[
        { id: 'pipeline', label: '🪜 Pipeline', count: stats.active.length },
        { id: 'sales', label: '🏆 Sotuvchilar', count: stats.won.length },
        { id: 'customers', label: '👥 Mijozlar', count: contacts.length },
        { id: 'activity', label: '📞 Faoliyat', count: tasks.length + calls.length },
      ]} />

      {tab === 'pipeline' && <PipelineTab leads={leads} stats={stats} />}
      {tab === 'sales' && <SalesTab leads={leads} stats={stats} />}
      {tab === 'customers' && <CustomersTab leads={leads} contacts={contacts} />}
      {tab === 'activity' && <ActivityTab tasks={tasks} calls={calls} notes={notes} />}
    </div>
  );
}

// ── TABS COMPONENT ──
function Tabs({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 9, border: 'none',
              background: active ? 'linear-gradient(135deg, #FFC400, #FF8C00)' : 'transparent',
              color: active ? '#1a1a1a' : 'var(--text2)',
              fontFamily: 'var(--fh)', fontSize: 12.5,
              fontWeight: active ? 700 : 500, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'all .18s var(--ease)',
            }}>
            <span>{o.label}</span>
            {o.count != null && (
              <span style={{ fontSize: 10, padding: '1px 6px', background: active ? 'rgba(0,0,0,0.15)' : 'var(--s3)', borderRadius: 6, fontFamily: 'var(--fm)' }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── TAB 1: PIPELINE ──
function PipelineTab({ leads, stats }) {
  const funnelData = useMemo(() => {
    const counts = {};
    for (const l of leads) counts[l.Stage] = (counts[l.Stage] || 0) + 1;
    return ['new', 'contact', 'qualified', 'proposal', 'negotiation', 'closed_won']
      .map(s => ({ name: STAGES.find(x => x.id === s)?.name, value: counts[s] || 0 })).filter(x => x.value > 0);
  }, [leads]);

  const stageBreakdown = useMemo(() => {
    return STAGES.map(s => {
      const items = leads.filter(l => l.Stage === s.id);
      const amount = items.reduce((a, l) => a + (l.Amount || 0), 0);
      return { name: s.name, count: items.length, amount, color: s.color };
    }).filter(x => x.count > 0);
  }, [leads]);

  const lossReasons = useMemo(() => {
    const map = {};
    for (const l of leads.filter(x => x.Stage === 'closed_lost' && x.LossReason)) {
      map[l.LossReason] = (map[l.LossReason] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [leads]);

  const cycleByStage = useMemo(() => {
    const map = {};
    for (const l of leads.filter(x => x.Won && x.CycleHours)) {
      const stage = l.StageName;
      if (!map[stage]) map[stage] = [];
      map[stage].push(l.CycleHours);
    }
    return Object.entries(map).map(([name, hrs]) => ({
      name, value: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length / 24),
    }));
  }, [leads]);

  const monthlyRevenue = useMemo(() => {
    const map = {};
    for (const l of leads.filter(x => x.Won)) {
      const month = String(l.ClosedAt || l.Date).slice(0, 7);
      map[month] = (map[month] || 0) + (l.Amount || 0);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name: name.slice(5), value }));
  }, [leads]);

  const productCategories = useMemo(() => {
    const map = {};
    for (const l of leads.filter(x => x.Won)) {
      map[l.Category] = (map[l.Category] || 0) + (l.Amount || 0);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [leads]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      <Card title="🪜 Konversiya yo'lakchasi" subtitle="Lid → Mijoz">
        <AdvancedChart chart={{ type: 'funnel', data: funnelData, keys: ['value'] }} height={280} />
      </Card>

      <Card title="📊 Stage bo'yicha summa" subtitle="Pipeline holati">
        <AdvancedChart chart={{
          type: 'bar', data: stageBreakdown.map(s => ({ name: s.name, value: s.amount })),
          xKey: 'name', keys: ['value'], colors: ['#FFC400'],
        }} height={280} />
      </Card>

      <Card title="📈 Oylik daromad trendi" subtitle="Yutib olingan deal'lar">
        <AdvancedChart chart={{
          type: 'area', data: monthlyRevenue,
          xKey: 'name', keys: ['value'], colors: ['#10B981'],
        }} height={260} />
      </Card>

      <Card title="🎯 Probabilty-Weighted Pipeline" subtitle="Real prognoz">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <Stat label="Pipeline summasi" value={fmtMoney(stats.pipelineValue)} color="#FFC400" />
          <Stat label="Weighted (taxminiy)" value={fmtMoney(stats.weightedPipeline)} color="#A78BFA" />
          <Stat label="O'rtacha probability" value={
            (stats.active.reduce((a, l) => a + (l.ProbabilityPct || 0), 0) / Math.max(stats.active.length, 1)).toFixed(0) + '%'
          } color="#60A5FA" />
        </div>
      </Card>

      {lossReasons.length > 0 && (
        <Card title="❌ Yo'qotish sabablari" subtitle={`${stats.lost.length} ta yo'qotilgan deal`}>
          <AdvancedChart chart={{ type: 'pie', data: lossReasons }} height={260} />
        </Card>
      )}

      {cycleByStage.length > 0 && (
        <Card title="⏱ Stage bo'yicha o'rtacha vaqt" subtitle="Won deal'lar uchun">
          <AdvancedChart chart={{
            type: 'bar', data: cycleByStage,
            xKey: 'name', keys: ['value'], colors: ['#A78BFA'],
          }} height={240} />
        </Card>
      )}

      {productCategories.length > 0 && (
        <Card title="📦 Mahsulot kategoriyasi" subtitle="Daromad bo'yicha">
          <AdvancedChart chart={{ type: 'pie', data: productCategories }} height={260} />
        </Card>
      )}

      <Card title="📋 So'nggi 10 lid" subtitle="Eng yangi qayd">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...leads].sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt))).slice(0, 10).map((l, i) => {
            const stage = STAGES.find(s => s.id === l.Stage);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s2)', borderRadius: 8, borderLeft: `3px solid ${stage?.color || '#94A3B8'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.Title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>
                    {l.Date} · {l.Source} · {l.Region}
                  </div>
                </div>
                <span style={{ fontSize: 10, padding: '3px 8px', background: stage?.color + '22', color: stage?.color, borderRadius: 5, fontFamily: 'var(--fm)', fontWeight: 700 }}>
                  {stage?.name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: l.Won ? '#10B981' : 'var(--text)', fontFamily: 'var(--fm)', minWidth: 70, textAlign: 'right' }}>{fmtMoney(l.Amount)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── TAB 2: SALES MANAGERS ──
function SalesTab({ leads, stats }) {
  const managerStats = useMemo(() => {
    const map = {};
    for (const l of leads) {
      if (!map[l.Responsible]) map[l.Responsible] = { name: l.Responsible, total: 0, won: 0, lost: 0, active: 0, revenue: 0, avgDeal: 0 };
      map[l.Responsible].total++;
      if (l.Won) { map[l.Responsible].won++; map[l.Responsible].revenue += l.Amount; }
      else if (l.Stage === 'closed_lost') map[l.Responsible].lost++;
      else map[l.Responsible].active++;
    }
    return Object.values(map).map(m => ({
      ...m,
      winRate: (m.won + m.lost) ? +(m.won / (m.won + m.lost) * 100).toFixed(1) : 0,
      avgDeal: m.won ? Math.round(m.revenue / m.won) : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [leads]);

  const managerComparison = managerStats.map(m => ({
    name: m.name.split(' ')[0],
    revenue: m.revenue,
    won: m.won,
    winRate: m.winRate,
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      {/* Leaderboard */}
      <Card title="🏆 Top sotuvchilar" subtitle="Daromad bo'yicha leaderboard">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {managerStats.map((m, i) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--s2)', borderRadius: 10, borderLeft: i === 0 ? '3px solid #FFD700' : i === 1 ? '3px solid #C0C0C0' : i === 2 ? '3px solid #CD7F32' : '3px solid var(--border)' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--s3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--fh)', fontSize: 14, fontWeight: 800, color: '#1a1a1a',
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>
                  {m.won}/{m.total} won · win rate {m.winRate}% · o'rtacha {fmtMoney(m.avgDeal)}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#10B981', fontFamily: 'var(--fh)' }}>{fmtMoney(m.revenue)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Win rate comparison */}
      <Card title="📊 Win rate solishtirma" subtitle="Sotuvchi bo'yicha %">
        <AdvancedChart chart={{
          type: 'bar', data: managerComparison.map(m => ({ name: m.name, value: m.winRate })),
          xKey: 'name', keys: ['value'], colors: ['#10B981'],
        }} height={240} />
      </Card>

      {/* Revenue comparison */}
      <Card title="💰 Daromad solishtirma" subtitle="Har sotuvchi">
        <AdvancedChart chart={{
          type: 'bar', data: managerComparison,
          xKey: 'name', keys: ['revenue'], colors: ['#FFC400'],
        }} height={240} />
      </Card>

      {/* Won count */}
      <Card title="🎯 Yutilgan deal'lar" subtitle="Soni bo'yicha">
        <AdvancedChart chart={{
          type: 'bar', data: managerComparison,
          xKey: 'name', keys: ['won'], colors: ['#A78BFA'],
        }} height={240} />
      </Card>

      {/* Manager radar */}
      <Card title="🕸️ Multi-metric radar" subtitle="3 ta sotuvchi solishtirma">
        <AdvancedChart chart={{
          type: 'radar',
          data: managerStats.slice(0, 3).map(m => ({
            name: m.name.split(' ')[0],
            won: m.won * 5,
            winRate: m.winRate,
            active: m.active * 3,
            revenue: m.revenue / 1000000,
          })),
          keys: ['won', 'winRate', 'active', 'revenue'],
        }} height={280} />
      </Card>

      {/* Performance table */}
      <Card title="📋 Performance jadvali" subtitle="Barcha sotuvchilar">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--muted)', fontFamily: 'var(--fm)', fontSize: 9, textTransform: 'uppercase' }}>Sotuvchi</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>JAMI</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>WON</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>LOST</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>WR%</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>DAROMAD</th>
              </tr>
            </thead>
            <tbody>
              {managerStats.map(m => (
                <tr key={m.name} style={{ borderBottom: '1px solid var(--border2)' }}>
                  <td style={{ padding: '6px 4px', fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{m.total}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: '#10B981', fontWeight: 700 }}>{m.won}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: '#EF4444' }}>{m.lost}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: m.winRate >= 50 ? '#10B981' : m.winRate >= 30 ? '#FBBF24' : '#EF4444' }}>{m.winRate}%</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700 }}>{fmtMoney(m.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── TAB 3: CUSTOMERS ──
function CustomersTab({ leads, contacts }) {
  const sourceStats = useMemo(() => {
    const map = {};
    for (const l of leads) {
      if (!map[l.Source]) map[l.Source] = { total: 0, won: 0, revenue: 0 };
      map[l.Source].total++;
      if (l.Won) { map[l.Source].won++; map[l.Source].revenue += l.Amount; }
    }
    return Object.entries(map).map(([name, v]) => ({
      name, total: v.total, won: v.won, revenue: v.revenue,
      conversionRate: v.total ? +(v.won / v.total * 100).toFixed(1) : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [leads]);

  const regionStats = useMemo(() => {
    const map = {};
    for (const l of leads) {
      if (!map[l.Region]) map[l.Region] = { count: 0, revenue: 0 };
      map[l.Region].count++;
      if (l.Won) map[l.Region].revenue += l.Amount;
    }
    return Object.entries(map).map(([name, v]) => ({ name, value: v.count, revenue: v.revenue }));
  }, [leads]);

  const repeatCustomers = useMemo(() => {
    return contacts.filter(c => c.WonCount >= 2).sort((a, b) => b.LTV - a.LTV);
  }, [contacts]);

  const newVsRepeat = useMemo(() => {
    const newOnes = contacts.filter(c => c.DealsCount === 1).length;
    const repeat = contacts.filter(c => c.DealsCount >= 2).length;
    return [{ name: 'Yangi', value: newOnes }, { name: 'Takroriy', value: repeat }];
  }, [contacts]);

  const topLTV = useMemo(() => {
    return [...contacts].sort((a, b) => b.LTV - a.LTV).slice(0, 8);
  }, [contacts]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      <Card title="📡 Manba samaradorligi" subtitle="Konversiya % va daromad">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>MANBA</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>JAMI</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>WON</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CR%</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>DAROMAD</th>
              </tr>
            </thead>
            <tbody>
              {sourceStats.map(s => (
                <tr key={s.name} style={{ borderBottom: '1px solid var(--border2)' }}>
                  <td style={{ padding: '7px 4px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{s.total}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: '#10B981', fontWeight: 700 }}>{s.won}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: s.conversionRate >= 30 ? '#10B981' : s.conversionRate >= 15 ? '#FBBF24' : '#EF4444', fontWeight: 700 }}>{s.conversionRate}%</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700 }}>{fmtMoney(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="📡 Manba bo'yicha lidlar (pie)" subtitle="Qaysi kanal ko'p">
        <AdvancedChart chart={{
          type: 'pie',
          data: sourceStats.map(s => ({ name: s.name, value: s.total })),
        }} height={280} />
      </Card>

      <Card title="🌍 Hudud bo'yicha lid" subtitle="Geografiya">
        <AdvancedChart chart={{
          type: 'bar',
          data: regionStats.sort((a, b) => b.value - a.value),
          xKey: 'name', keys: ['value'], colors: ['#A78BFA'],
        }} height={240} />
      </Card>

      <Card title="🔁 Yangi vs Takroriy mijozlar" subtitle="Repeat business">
        <AdvancedChart chart={{ type: 'donut', data: newVsRepeat }} height={260} />
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
          <strong>{repeatCustomers.length}</strong> ta mijoz 2+ deal qildi · O'rtacha LTV:{' '}
          <strong style={{ color: 'var(--text)' }}>{fmtMoney(repeatCustomers.reduce((a, c) => a + c.LTV, 0) / Math.max(repeatCustomers.length, 1))}</strong>
        </div>
      </Card>

      <Card title="💎 Top LTV mijozlar" subtitle="Eng qimmat mijozlar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {topLTV.map((c, i) => (
            <div key={c.ID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s2)', borderRadius: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: i < 3 ? '#FFD700' : 'var(--s3)', color: i < 3 ? '#1a1a1a' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fh)', fontSize: 11, fontWeight: 800 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.Name} {c.Tags?.includes('VIP') && <span style={{ color: '#FBBF24', marginLeft: 4 }}>★ VIP</span>}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>{c.DealsCount} deal · {c.Region} · {c.Phone}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#10B981', fontFamily: 'var(--fh)' }}>{fmtMoney(c.LTV)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="🏷 Tag taqsimoti" subtitle="Mijoz segmentatsiyasi">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(() => {
            const map = {};
            for (const l of leads) for (const t of (l.Tags || [])) map[t] = (map[t] || 0) + 1;
            return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
              <span key={tag} style={{ padding: '6px 12px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--fm)', fontSize: 11, fontWeight: 600 }}>
                <span style={{ color: '#FFC400' }}>#{tag}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{count}</span>
              </span>
            ));
          })()}
        </div>
      </Card>
    </div>
  );
}

// ── TAB 4: ACTIVITY ──
function ActivityTab({ tasks, calls, notes }) {
  const tasksByStatus = useMemo(() => {
    const overdue = tasks.filter(t => !t.Completed && new Date(t.DueDate) < new Date()).length;
    const today = tasks.filter(t => !t.Completed && t.DueDate === new Date().toISOString().slice(0, 10)).length;
    const upcoming = tasks.filter(t => !t.Completed && new Date(t.DueDate) > new Date()).length;
    const completed = tasks.filter(t => t.Completed).length;
    return { overdue, today, upcoming, completed };
  }, [tasks]);

  const tasksByType = useMemo(() => {
    const map = {};
    for (const t of tasks) map[t.Type] = (map[t.Type] || 0) + 1;
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const callsStats = useMemo(() => {
    const total = calls.length;
    const totalDuration = calls.reduce((a, c) => a + (c.Duration || 0), 0);
    const avgDuration = total ? Math.round(totalDuration / total) : 0;
    const incoming = calls.filter(c => c.Direction === 'incoming').length;
    const outgoing = calls.filter(c => c.Direction === 'outgoing').length;
    const successful = calls.filter(c => ['javob_oldi', 'manfaatdor', 'sotuv'].includes(c.Result)).length;
    const successRate = total ? +(successful / total * 100).toFixed(1) : 0;
    return { total, totalDuration, avgDuration, incoming, outgoing, successful, successRate };
  }, [calls]);

  const callsByResult = useMemo(() => {
    const map = {};
    for (const c of calls) map[c.Result] = (map[c.Result] || 0) + 1;
    return Object.entries(map).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  }, [calls]);

  const callsTimeline = useMemo(() => {
    const map = {};
    for (const c of calls) {
      const date = String(c.Date).slice(0, 10);
      map[date] = (map[date] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
      .map(([name, value]) => ({ name: name.slice(5), value }));
  }, [calls]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      {/* Tasks summary */}
      <Card title="📋 Vazifalar holati" subtitle={`${tasks.length} ta jami`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <Stat label="🔴 Muddati o'tgan" value={tasksByStatus.overdue} color="#EF4444" />
          <Stat label="🟡 Bugun" value={tasksByStatus.today} color="#FBBF24" />
          <Stat label="🟢 Kelasi" value={tasksByStatus.upcoming} color="#10B981" />
          <Stat label="✓ Bajarildi" value={tasksByStatus.completed} color="#60A5FA" />
        </div>
      </Card>

      <Card title="📞 Qo'ng'iroqlar statistikasi" subtitle={`${callsStats.total} ta jami`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <Stat label="O'rtacha vaqt" value={Math.floor(callsStats.avgDuration / 60) + ':' + String(callsStats.avgDuration % 60).padStart(2, '0')} />
          <Stat label="Success rate" value={callsStats.successRate + '%'} color="#10B981" />
          <Stat label="↗ Chiquvchi" value={callsStats.outgoing} color="#60A5FA" />
          <Stat label="↘ Kiruvchi" value={callsStats.incoming} color="#A78BFA" />
        </div>
      </Card>

      <Card title="📋 Vazifa turlari" subtitle="Faoliyat ko'rinishi">
        <AdvancedChart chart={{ type: 'pie', data: tasksByType }} height={260} />
      </Card>

      <Card title="📞 Qo'ng'iroq natijalari" subtitle="Mijoz reaksiyasi">
        <AdvancedChart chart={{ type: 'pie', data: callsByResult }} height={260} />
      </Card>

      <Card title="📈 Qo'ng'iroqlar trendi" subtitle="30 kunlik">
        <AdvancedChart chart={{
          type: 'area', data: callsTimeline,
          xKey: 'name', keys: ['value'], colors: ['#FFC400'],
        }} height={240} />
      </Card>

      <Card title="📝 So'nggi 8 yozuv" subtitle="Manager izohlari">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...notes].sort((a, b) => String(b.Date).localeCompare(String(a.Date))).slice(0, 8).map(n => (
            <div key={n.ID} style={{ padding: '8px 12px', background: 'var(--s2)', borderRadius: 8, borderLeft: '3px solid #60A5FA' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text)', marginBottom: 4 }}>{n.Text}</div>
              <div style={{ fontSize: 9.5, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>
                {n.Author} · {String(n.Date).slice(0, 10)} {String(n.Date).slice(11, 16)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--fh)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 12, background: 'var(--s2)', borderRadius: 10, border: `1px solid ${color || 'var(--border)'}30`, textAlign: 'center' }}>
      <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--fm)', fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--fh)' }}>{value}</div>
    </div>
  );
}
