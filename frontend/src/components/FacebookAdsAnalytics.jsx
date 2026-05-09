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
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  if (Number(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Number(n).toLocaleString('uz-UZ');
}

export default function FacebookAdsAnalytics({ source }) {
  const data = source?.data || [];
  const campaigns = useMemo(() => data.filter(d => d.type === 'campaign'), [data]);
  const adsets = useMemo(() => data.filter(d => d.type === 'adset'), [data]);
  const ads = useMemo(() => data.filter(d => d.type === 'ad'), [data]);
  const placement = useMemo(() => data.filter(d => d.type === 'demo_placement'), [data]);
  const device = useMemo(() => data.filter(d => d.type === 'demo_device'), [data]);
  const ageGender = useMemo(() => data.filter(d => d.type === 'demo_age_gender'), [data]);
  const region = useMemo(() => data.filter(d => d.type === 'demo_region'), [data]);
  const hourly = useMemo(() => data.filter(d => d.type === 'demo_hour'), [data]);
  const daily = useMemo(() => data.filter(d => d.type === 'demo_daily'), [data]);

  const [tab, setTab] = useState('campaigns');

  const totals = useMemo(() => {
    const spend = campaigns.reduce((a, c) => a + (c.Spend || 0), 0);
    const reach = campaigns.reduce((a, c) => a + (c.Reach || 0), 0);
    const impressions = campaigns.reduce((a, c) => a + (c.Impressions || 0), 0);
    const clicks = campaigns.reduce((a, c) => a + (c.Clicks || 0), 0);
    const conversions = campaigns.reduce((a, c) => a + (c.Conversions || 0), 0);
    const revenue = campaigns.reduce((a, c) => a + (c.Revenue || 0), 0);
    const ctr = impressions ? +((clicks / impressions) * 100).toFixed(2) : 0;
    const cpc = clicks ? Math.round(spend / clicks) : 0;
    const cpl = conversions ? Math.round(spend / conversions) : 0;
    const cpm = impressions ? Math.round((spend * 1000) / impressions) : 0;
    const roas = spend ? +(revenue / spend).toFixed(2) : 0;
    const active = campaigns.filter(c => c.Status === 'ACTIVE').length;
    return { spend, reach, impressions, clicks, conversions, revenue, ctr, cpc, cpl, cpm, roas, active };
  }, [campaigns]);

  if (!campaigns.length) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📣</div>
        <h2>Facebook Ads ulanmagan</h2>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER */}
      <div style={{
        padding: '24px 28px',
        background: 'linear-gradient(135deg, rgba(24,119,242,0.12) 0%, rgba(0,75,168,0.08) 100%)',
        border: '1px solid rgba(24,119,242,0.30)',
        borderRadius: 18,
        display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 14,
          background: 'linear-gradient(135deg, #1877F2, #004BA8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
        }}>📣</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: '#1877F2', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800, marginBottom: 4 }}>Facebook Ads</div>
          <div style={{ fontFamily: 'var(--fh)', fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{source.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {campaigns.length} kampaniya · {adsets.length} ad set · {ads.length} ad · {totals.active} faol
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[
            { l: 'Sarflandi', uz: 'reklama narxi', v: fmtMoney(totals.spend), c: '#EF4444' },
            { l: 'Daromad', uz: 'qaytarib kelingan', v: fmtMoney(totals.revenue), c: '#10B981' },
            { l: 'ROAS', uz: 'har 1 so\'mga qaytadi', v: totals.roas + 'x', c: totals.roas >= 2 ? '#10B981' : totals.roas >= 1 ? '#FBBF24' : '#EF4444' },
            { l: 'Konversiya', uz: 'maqsadli amallar', v: fmtNum(totals.conversions), c: '#1877F2' },
            { l: 'CPM', uz: '1000 ko\'rsatuv narxi', v: fmtMoney(totals.cpm) },
          ].map((s, i) => (
            <div key={i} title={s.uz} style={{ textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--fm)', fontWeight: 700, marginBottom: 4 }}>{s.l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.c || 'var(--text)', fontFamily: 'var(--fh)' }}>{s.v}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 2 }}>{s.uz}</div>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} options={[
        { id: 'campaigns', label: '🎯 Kampaniyalar', count: campaigns.length },
        { id: 'audience', label: '👥 Audience', count: ageGender.length + region.length },
        { id: 'creative', label: '🎨 Creative', count: ads.length },
        { id: 'conversion', label: '💰 Konversiya', count: totals.conversions },
      ]} />

      {tab === 'campaigns' && <CampaignsTab campaigns={campaigns} adsets={adsets} daily={daily} totals={totals} />}
      {tab === 'audience' && <AudienceTab placement={placement} device={device} ageGender={ageGender} region={region} hourly={hourly} />}
      {tab === 'creative' && <CreativeTab campaigns={campaigns} ads={ads} />}
      {tab === 'conversion' && <ConversionTab campaigns={campaigns} totals={totals} />}
    </div>
  );
}

function Tabs({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 9, border: 'none',
              background: active ? 'linear-gradient(135deg, #1877F2, #004BA8)' : 'transparent',
              color: active ? '#fff' : 'var(--text2)',
              fontFamily: 'var(--fh)', fontSize: 12.5,
              fontWeight: active ? 700 : 500, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            <span>{o.label}</span>
            {o.count != null && (
              <span style={{ fontSize: 10, padding: '1px 6px', background: active ? 'rgba(0,0,0,0.25)' : 'var(--s3)', borderRadius: 6, fontFamily: 'var(--fm)' }}>{fmtNum(o.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── TAB 1: CAMPAIGNS ──
function CampaignsTab({ campaigns, adsets, daily, totals }) {
  // Daily spend trend
  const dailyTotal = useMemo(() => {
    const map = {};
    for (const d of daily) map[d.date] = (map[d.date] || 0) + d.spend;
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
      .map(([name, value]) => ({ name: name.slice(5), value }));
  }, [daily]);

  // Funnel
  const funnelData = [
    { name: 'Reach', value: totals.reach },
    { name: 'Impressions', value: totals.impressions },
    { name: 'Clicks', value: totals.clicks },
    { name: 'Conversions', value: totals.conversions },
  ].filter(x => x.value > 0);

  // Spend vs Revenue per campaign
  const spendRevenue = useMemo(() => campaigns.map(c => ({
    name: c.Title.length > 22 ? c.Title.slice(0, 20) + '…' : c.Title,
    spend: c.Spend, revenue: c.Revenue,
  })), [campaigns]);

  // Objective taqsimoti
  const byObjective = useMemo(() => {
    const map = {};
    for (const c of campaigns) map[c.Objective] = (map[c.Objective] || 0) + (c.Spend || 0);
    return Object.entries(map).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  }, [campaigns]);

  // Top by ROAS
  const topRoas = useMemo(() => [...campaigns].sort((a, b) => (b.ROAS || 0) - (a.ROAS || 0)), [campaigns]);

  return (
    <>
      {/* Mini KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        {[
          { l: 'Reach', uz: 'qancha odam ko\'rdi', v: fmtNum(totals.reach), i: '👁' },
          { l: 'Imp', uz: 'jami ko\'rsatuvlar', v: fmtNum(totals.impressions), i: '🔁' },
          { l: 'Clicks', uz: 'bosishlar', v: fmtNum(totals.clicks), i: '👆' },
          { l: 'CTR', uz: 'ko\'rib bosganlar %', v: totals.ctr + '%', i: '📊' },
          { l: 'CPC', uz: '1 bosish narxi', v: fmtMoney(totals.cpc), i: '💸' },
          { l: 'CPM', uz: '1000 ko\'rsatuv narxi', v: fmtMoney(totals.cpm), i: '🎯' },
          { l: 'CPL', uz: '1 lid narxi', v: fmtMoney(totals.cpl), i: '🎯' },
        ].map((s, i) => (
          <div key={i} title={s.uz} style={{ padding: '12px 14px', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{s.i}</span>
              <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--fm)', fontWeight: 700 }}>{s.l}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--fh)' }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 3, opacity: 0.85 }}>{s.uz}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14, marginTop: 14 }}>
        <Card title="📈 Kunlik sarf trendi" subtitle="30 kun">
          <AdvancedChart chart={{
            type: 'area', data: dailyTotal, xKey: 'name', keys: ['value'], colors: ['#1877F2'],
          }} height={240} />
        </Card>

        <Card title="🪜 Reklama yo'lakchasi" subtitle="Reach → Conversion">
          <AdvancedChart chart={{ type: 'funnel', data: funnelData, keys: ['value'] }} height={240} />
        </Card>

        <Card title="💰 Sarf vs Daromad" subtitle="Har kampaniya">
          <AdvancedChart chart={{
            type: 'composed', data: spendRevenue, xKey: 'name',
            barKeys: ['spend'], lineKeys: ['revenue'], colors: ['#EF4444', '#10B981'],
          }} height={240} />
        </Card>

        <Card title="🎯 Maqsad bo'yicha sarf" subtitle="Objective breakdown">
          <AdvancedChart chart={{ type: 'pie', data: byObjective }} height={240} />
        </Card>

        <Card title="📊 ROAS solishtirma" subtitle="Kampaniya bo'yicha">
          <AdvancedChart chart={{
            type: 'bar',
            data: campaigns.map(c => ({ name: c.Title.length > 18 ? c.Title.slice(0, 16) + '…' : c.Title, roas: c.ROAS })),
            xKey: 'name', keys: ['roas'], colors: ['#1877F2'],
          }} height={240} />
        </Card>

        <Card title="🏆 Eng samarali" subtitle="Top 5 ROAS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topRoas.slice(0, 5).map((c, i) => {
              const status = c.ROAS >= 2 ? { c: '#10B981', l: 'A\'lo' } : c.ROAS >= 1 ? { c: '#FBBF24', l: 'O\'rtacha' } : { c: '#EF4444', l: 'Past' };
              return (
                <div key={c.ID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--s2)', borderRadius: 8, borderLeft: `3px solid ${status.c}` }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: i === 0 ? '#FFD700' : 'var(--s3)', color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'var(--fh)' }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.Title}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>Sarf: {fmtMoney(c.Spend)} · Daromad: {fmtMoney(c.Revenue)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: status.c, fontFamily: 'var(--fh)' }}>{c.ROAS}x</div>
                    <div style={{ fontSize: 8.5, color: status.c, fontFamily: 'var(--fm)' }}>{status.l}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="📋 Barcha kampaniyalar" subtitle={`${campaigns.length} ta`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>KAMPANIYA</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>SARF</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CTR</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CONV</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.ID} style={{ borderBottom: '1px solid var(--border2)' }}>
                    <td style={{ padding: '7px 4px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.Title}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtMoney(c.Spend)}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: c.CTR > 1.5 ? '#10B981' : 'var(--text2)' }}>{c.CTR}%</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{c.Conversions}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: c.ROAS >= 2 ? '#10B981' : c.ROAS >= 1 ? '#FBBF24' : '#EF4444' }}>{c.ROAS}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

// ── TAB 2: AUDIENCE ──
function AudienceTab({ placement, device, ageGender, region, hourly }) {
  // Age breakdown (sum across genders)
  const ageData = useMemo(() => {
    const map = {};
    for (const a of ageGender) map[a.Age] = (map[a.Age] || 0) + (a.Reach || 0);
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [ageGender]);

  // Gender pie
  const genderData = useMemo(() => {
    const map = {};
    for (const a of ageGender) map[a.Gender] = (map[a.Gender] || 0) + (a.Reach || 0);
    return Object.entries(map).map(([name, value]) => ({ name: name === 'female' ? 'Ayol' : name === 'male' ? 'Erkak' : "Noma'lum", value }));
  }, [ageGender]);

  // Best ROAS by age+gender
  const bestSegments = useMemo(() => {
    return [...ageGender].sort((a, b) => b.ROAS - a.ROAS).slice(0, 6);
  }, [ageGender]);

  // Hourly heatmap
  const hourlyData = useMemo(() => {
    return hourly.map(h => ({ name: h.Hour + 'h', value: h.Conversions }));
  }, [hourly]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      <Card title="📍 Joylashtirish (Placement)" subtitle="Qaysi joydan ko'p effekt">
        <AdvancedChart chart={{
          type: 'bar',
          data: placement.map(p => ({ name: p.Placement, value: p.Spend })).sort((a, b) => b.value - a.value),
          xKey: 'name', keys: ['value'], colors: ['#1877F2'],
        }} height={260} />
      </Card>

      <Card title="📱 Qurilma turi" subtitle="iOS / Android / Desktop">
        <AdvancedChart chart={{
          type: 'pie',
          data: device.map(d => ({ name: d.Device, value: d.Reach })),
        }} height={260} />
      </Card>

      <Card title="🎂 Yosh taqsimoti" subtitle="Reach bo'yicha">
        <AdvancedChart chart={{
          type: 'bar', data: ageData, xKey: 'name', keys: ['value'], colors: ['#A78BFA'],
        }} height={240} />
      </Card>

      <Card title="⚥ Jins taqsimoti" subtitle="Audience">
        <AdvancedChart chart={{ type: 'donut', data: genderData }} height={240} />
      </Card>

      <Card title="🌍 Hudud bo'yicha" subtitle="Konversiya solishtirma">
        <AdvancedChart chart={{
          type: 'bar',
          data: region.sort((a, b) => b.Conversions - a.Conversions).map(r => ({ name: r.Region, value: r.Conversions })),
          xKey: 'name', keys: ['value'], colors: ['#10B981'],
        }} height={260} />
      </Card>

      <Card title="🏆 Eng yaxshi segmentlar" subtitle="ROAS bo'yicha (yosh+jins)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bestSegments.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--s2)', borderRadius: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: i === 0 ? '#FFD700' : 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#1a1a1a', fontFamily: 'var(--fh)' }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.Age} · {s.Gender === 'female' ? 'Ayol' : s.Gender === 'male' ? 'Erkak' : "Aralash"}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>{fmtNum(s.Reach)} reach · {fmtNum(s.Conversions)} conv</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.ROAS >= 2 ? '#10B981' : '#FBBF24', fontFamily: 'var(--fh)' }}>{s.ROAS}x</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="⏰ Soat bo'yicha konversiya" subtitle="24 soatlik taqsimot">
        <AdvancedChart chart={{
          type: 'bar', data: hourlyData, xKey: 'name', keys: ['value'], colors: ['#F8A839'],
        }} height={240} />
        <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--muted)' }}>
          Eng yaxshi soat: <strong style={{ color: 'var(--text)' }}>
            {hourly.sort((a, b) => b.Conversions - a.Conversions)[0]?.Hour}:00
          </strong>
        </div>
      </Card>

      <Card title="📋 Placement jadvali" subtitle="To'liq breakdown">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>JOYI</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>SARF</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>REACH</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CLICKS</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CONV</th>
              </tr>
            </thead>
            <tbody>
              {placement.map(p => (
                <tr key={p.Placement} style={{ borderBottom: '1px solid var(--border2)' }}>
                  <td style={{ padding: '7px 4px', fontWeight: 600 }}>{p.Placement}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtMoney(p.Spend)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtNum(p.Reach)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtNum(p.Clicks)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: '#10B981' }}>{p.Conversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── TAB 3: CREATIVE ──
function CreativeTab({ campaigns, ads }) {
  // Top performing creatives by CTR
  const topCreatives = useMemo(() => [...ads].sort((a, b) => b.CTR - a.CTR).slice(0, 8), [ads]);

  // Creative types
  const creativeTypes = useMemo(() => {
    const map = {};
    for (const a of ads) {
      const type = a.Creative.split('—')[0].trim();
      if (!map[type]) map[type] = { count: 0, spend: 0, clicks: 0, conv: 0 };
      map[type].count++;
      map[type].spend += a.Spend || 0;
      map[type].clicks += a.Clicks || 0;
      map[type].conv += a.Conversions || 0;
    }
    return Object.entries(map).map(([name, v]) => ({
      name, count: v.count, spend: v.spend, clicks: v.clicks, conv: v.conv,
      ctr: v.spend ? +(v.clicks / (v.spend / 1000) * 100).toFixed(2) : 0,
    }));
  }, [ads]);

  // Video metrics
  const videoCampaigns = campaigns.filter(c => c.VideoViews_3sec > 0);
  const videoFunnel = videoCampaigns.length ? [
    { name: '3sec view', value: videoCampaigns.reduce((a, c) => a + c.VideoViews_3sec, 0) },
    { name: '25%', value: videoCampaigns.reduce((a, c) => a + c.VideoViews_25pct, 0) },
    { name: '50%', value: videoCampaigns.reduce((a, c) => a + c.VideoViews_50pct, 0) },
    { name: '75%', value: videoCampaigns.reduce((a, c) => a + c.VideoViews_75pct, 0) },
    { name: '100%', value: videoCampaigns.reduce((a, c) => a + c.VideoViews_100pct, 0) },
  ] : [];

  // Engagement totals
  const engagementTotal = campaigns.reduce((acc, c) => ({
    likes: acc.likes + (c.Likes || 0),
    comments: acc.comments + (c.Comments || 0),
    shares: acc.shares + (c.Shares || 0),
    saves: acc.saves + (c.Saves || 0),
  }), { likes: 0, comments: 0, shares: 0, saves: 0 });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      <Card title="🎬 Video tomosha yo'lakchasi" subtitle="Drop-off rate ko'rish">
        {videoFunnel.length > 0 ? (
          <AdvancedChart chart={{ type: 'funnel', data: videoFunnel, keys: ['value'] }} height={260} />
        ) : (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Video kampaniyalar yo'q</div>
        )}
      </Card>

      <Card title="🎨 Creative turlari" subtitle="Format bo'yicha samaradorlik">
        <AdvancedChart chart={{
          type: 'bar', data: creativeTypes.map(c => ({ name: c.name, conv: c.conv })),
          xKey: 'name', keys: ['conv'], colors: ['#1877F2'],
        }} height={260} />
      </Card>

      <Card title="❤️💬🔁💾 Engagement metrikalar" subtitle="Reklama orqali olingan">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <Stat label="❤️ Likes" value={fmtNum(engagementTotal.likes)} color="#E1306C" />
          <Stat label="💬 Comments" value={fmtNum(engagementTotal.comments)} color="#60A5FA" />
          <Stat label="🔁 Shares" value={fmtNum(engagementTotal.shares)} color="#10B981" />
          <Stat label="💾 Saves" value={fmtNum(engagementTotal.saves)} color="#A78BFA" />
        </div>
      </Card>

      <Card title="🏆 Top 8 creative" subtitle="CTR bo'yicha">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {topCreatives.map((a, i) => (
            <div key={a.ID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s2)', borderRadius: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, background: i < 3 ? '#FFD700' : 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#1a1a1a', fontFamily: 'var(--fh)' }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.Creative}</div>
                <div style={{ fontSize: 9.5, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>Sarf: {fmtMoney(a.Spend)} · {a.Clicks} click</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: a.CTR > 2 ? '#10B981' : a.CTR > 1 ? '#FBBF24' : 'var(--text2)', fontFamily: 'var(--fh)' }}>{a.CTR}%</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="📊 Format bo'yicha sarf" subtitle="Investitsiya taqsimoti">
        <AdvancedChart chart={{
          type: 'pie',
          data: creativeTypes.map(c => ({ name: c.name, value: c.spend })),
        }} height={260} />
      </Card>

      <Card title="📋 Creative jadvali" subtitle={`${ads.length} ta ad`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>FORMAT</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>SONI</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>SARF</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CLICKS</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CONV</th>
              </tr>
            </thead>
            <tbody>
              {creativeTypes.map(t => (
                <tr key={t.name} style={{ borderBottom: '1px solid var(--border2)' }}>
                  <td style={{ padding: '7px 4px', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{t.count}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtMoney(t.spend)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtNum(t.clicks)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: '#10B981' }}>{t.conv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── TAB 4: CONVERSION ──
function ConversionTab({ campaigns, totals }) {
  const conversionByObj = useMemo(() => {
    const map = {};
    for (const c of campaigns) {
      if (!map[c.Objective]) map[c.Objective] = { conv: 0, spend: 0, revenue: 0 };
      map[c.Objective].conv += c.Conversions || 0;
      map[c.Objective].spend += c.Spend || 0;
      map[c.Objective].revenue += c.Revenue || 0;
    }
    return Object.entries(map).map(([name, v]) => ({
      name: name.replace(/_/g, ' '), conv: v.conv, spend: v.spend,
      cpl: v.conv ? Math.round(v.spend / v.conv) : 0,
      roas: v.spend ? +(v.revenue / v.spend).toFixed(2) : 0,
    }));
  }, [campaigns]);

  const profitable = campaigns.filter(c => c.ROAS >= 1).length;
  const profitablePct = campaigns.length ? +(profitable / campaigns.length * 100).toFixed(1) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
      <Card title="💰 Konversiya summary" subtitle="Asosiy ko'rsatkichlar">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <Stat label="Jami sarf" value={fmtMoney(totals.spend)} color="#EF4444" />
          <Stat label="Jami daromad" value={fmtMoney(totals.revenue)} color="#10B981" />
          <Stat label="Foyda" value={fmtMoney(totals.revenue - totals.spend)} color={totals.revenue > totals.spend ? "#10B981" : "#EF4444"} />
          <Stat label="ROAS" value={totals.roas + 'x'} color={totals.roas >= 2 ? "#10B981" : totals.roas >= 1 ? "#FBBF24" : "#EF4444"} />
          <Stat label="Konversiya" value={fmtNum(totals.conversions)} color="#1877F2" />
          <Stat label="CPL" value={fmtMoney(totals.cpl)} />
        </div>
      </Card>

      <Card title="🎯 Foyda olib kelayotgan kampaniyalar" subtitle="ROAS ≥ 1">
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ position: 'relative', display: 'inline-block', width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="60" fill="none" stroke="var(--s3)" strokeWidth="12" />
              <circle cx="70" cy="70" r="60" fill="none"
                stroke={profitablePct >= 70 ? '#10B981' : profitablePct >= 40 ? '#FBBF24' : '#EF4444'}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${(profitablePct / 100) * 376.99} 376.99`}
                transform="rotate(-90 70 70)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--fh)' }}>{profitablePct}%</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', textTransform: 'uppercase' }}>{profitable}/{campaigns.length}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="📊 Maqsad bo'yicha CPL" subtitle="Lid narxi">
        <AdvancedChart chart={{
          type: 'bar', data: conversionByObj.map(c => ({ name: c.name, value: c.cpl })),
          xKey: 'name', keys: ['value'], colors: ['#FBBF24'],
        }} height={240} />
      </Card>

      <Card title="📊 Maqsad bo'yicha ROAS" subtitle="Effektivlik">
        <AdvancedChart chart={{
          type: 'bar', data: conversionByObj.map(c => ({ name: c.name, value: c.roas })),
          xKey: 'name', keys: ['value'], colors: ['#10B981'],
        }} height={240} />
      </Card>

      <Card title="📋 Konversiya jadvali" subtitle="Maqsad bo'yicha">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>MAQSAD</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CONV</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>CPL</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--muted)', fontSize: 9 }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {conversionByObj.map(c => (
                <tr key={c.name} style={{ borderBottom: '1px solid var(--border2)' }}>
                  <td style={{ padding: '7px 4px', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{c.conv}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtMoney(c.cpl)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: c.roas >= 2 ? '#10B981' : c.roas >= 1 ? '#FBBF24' : '#EF4444' }}>{c.roas}x</td>
                </tr>
              ))}
            </tbody>
          </table>
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
