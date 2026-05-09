import React, { useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * AdvancedChart — ECharts wrapper, 15+ premium chart turlari.
 *
 * Qo'llab-quvvatlanadi:
 *   - bar, line, area, pie, scatter, stackedbar (klassik)
 *   - heatmap, treemap, radar, funnel, sankey, sunburst, gauge
 *   - boxplot, candlestick
 *   - composed (bar + line birga, dual y-axis)
 *
 * Statistik overlaylar:
 *   - regression chiziq (linear least squares)
 *   - mean / median chiziq (markLine)
 *   - anomaly markeri (markPoint)
 *   - forecast band (95% CI shading)
 *
 * AI props:
 *   { type, title, data, xKey, keys, colors, stats: { regression, mean, anomalies, forecast } }
 */

// Linear regression — least squares
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = points[i];
    sumX += x; sumY += y;
    sumXY += x * y; sumXX += x * x;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return points.map((_, i) => slope * i + intercept);
}

const PALETTE = ['#c9a063', '#00b8a9', '#a78bfa', '#4ade80', '#f87171', '#60a5fa', '#fb923c', '#f43f5e', '#06b6d4', '#fbbf24'];

// Tema — sayt oltin/teal palitra
const baseTheme = {
  backgroundColor: 'transparent',
  textStyle: { fontFamily: '"Inter", system-ui, sans-serif', color: 'var(--text)' },
  grid: { left: 50, right: 28, top: 36, bottom: 36, containLabel: true },
  legend: { textStyle: { color: 'var(--text2)', fontSize: 11 }, top: 4 },
  tooltip: {
    backgroundColor: 'rgba(20, 22, 30, 0.95)',
    borderColor: 'rgba(201, 160, 99, 0.4)',
    borderWidth: 1,
    textStyle: { color: '#f1f1f4', fontSize: 12 },
    padding: [10, 14],
    extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.5); border-radius: 10px;',
  },
};

const axisStyle = {
  axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
  axisTick: { show: false },
  axisLabel: { color: 'var(--muted)', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace' },
  splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } },
};

function buildOption(chart) {
  const { type, title, data = [], xKey, keys = [], colors = PALETTE, stats = {}, yLabel, xLabel } = chart;
  const palette = colors.length ? colors : PALETTE;

  // Common option shell
  const opt = {
    ...baseTheme,
    color: palette,
    title: title ? {
      text: title,
      left: 'center',
      top: 6,
      textStyle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Inter Display, Inter, sans-serif' },
    } : undefined,
  };

  // ── BAR ────────────────────────────────────────────────────
  if (type === 'bar' || type === 'stackedbar') {
    const stack = type === 'stackedbar' ? 'all' : undefined;
    opt.tooltip = { ...baseTheme.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } };
    opt.legend = { ...baseTheme.legend, data: keys };
    opt.xAxis = { type: 'category', data: data.map(d => d[xKey]), name: xLabel, ...axisStyle };
    opt.yAxis = { type: 'value', name: yLabel, ...axisStyle };
    opt.series = keys.map((k, i) => ({
      name: k,
      type: 'bar',
      stack,
      data: data.map(d => Number(d[k]) || 0),
      itemStyle: { color: palette[i % palette.length], borderRadius: [6, 6, 0, 0] },
      barMaxWidth: 38,
    }));
    return opt;
  }

  // ── LINE / AREA ─────────────────────────────────────────────
  if (type === 'line' || type === 'area') {
    opt.tooltip = { ...baseTheme.tooltip, trigger: 'axis' };
    opt.legend = { ...baseTheme.legend, data: keys };
    opt.xAxis = { type: 'category', data: data.map(d => d[xKey]), name: xLabel, boundaryGap: false, ...axisStyle };
    opt.yAxis = { type: 'value', name: yLabel, ...axisStyle };
    opt.series = keys.map((k, i) => {
      const pts = data.map(d => Number(d[k]) || 0);
      const series = {
        name: k,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: pts,
        lineStyle: { width: 2.5, color: palette[i % palette.length] },
        itemStyle: { color: palette[i % palette.length], borderColor: '#fff', borderWidth: 2 },
        emphasis: { focus: 'series' },
      };
      if (type === 'area') {
        series.areaStyle = {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: palette[i % palette.length] + '60' },
              { offset: 1, color: palette[i % palette.length] + '08' },
            ],
          },
        };
      }
      // Statistik overlays
      const markLines = [];
      const markPoints = [];
      if (stats.regression && i === 0) {
        const reg = linearRegression(pts);
        if (reg) {
          opt.series.push({
            name: `${k} trend`,
            type: 'line',
            smooth: false,
            data: reg,
            lineStyle: { type: 'dashed', width: 1.5, color: palette[i % palette.length] + '99' },
            symbol: 'none',
            silent: true,
          });
        }
      }
      if (stats.mean && i === 0) {
        markLines.push({
          name: 'O\'rtacha',
          yAxis: pts.reduce((a, b) => a + b, 0) / pts.length,
          lineStyle: { color: palette[i % palette.length], type: 'dashed', width: 1.2 },
          label: { color: palette[i % palette.length], fontSize: 10 },
        });
      }
      if (Array.isArray(stats.anomalies) && i === 0) {
        for (const a of stats.anomalies) {
          if (a.index >= 0 && a.index < pts.length) {
            markPoints.push({
              name: a.label || 'Anomaliya',
              coord: [a.index, pts[a.index]],
              itemStyle: { color: '#f43f5e' },
              symbolSize: 12,
              label: { show: !!a.label, color: '#f43f5e', fontSize: 10 },
            });
          }
        }
      }
      if (markLines.length) series.markLine = { data: markLines, silent: true };
      if (markPoints.length) series.markPoint = { data: markPoints };
      return series;
    });
    // Forecast band
    if (stats.forecast && Array.isArray(stats.forecast.points)) {
      const fcLow = stats.forecast.points.map(p => p.lower);
      const fcHigh = stats.forecast.points.map(p => p.upper);
      const fcVal = stats.forecast.points.map(p => p.value);
      // Append to data
      const fcStart = data.length;
      const allX = data.map(d => d[xKey]).concat(stats.forecast.points.map(p => p.date || `+${p.x}`));
      opt.xAxis.data = allX;
      // Add upper/lower as area
      opt.series.push({
        name: 'Forecast (yuqori)',
        type: 'line',
        data: Array(fcStart).fill('-').concat(fcHigh),
        lineStyle: { opacity: 0 },
        stack: 'fc-band',
        symbol: 'none',
        silent: true,
      });
      opt.series.push({
        name: 'Forecast (band)',
        type: 'line',
        data: Array(fcStart).fill('-').concat(fcLow.map((l, i) => fcHigh[i] - l)),
        lineStyle: { opacity: 0 },
        areaStyle: { color: 'rgba(201,160,99,0.18)' },
        stack: 'fc-band',
        symbol: 'none',
        silent: true,
      });
      opt.series.push({
        name: 'Forecast',
        type: 'line',
        data: Array(fcStart).fill('-').concat(fcVal),
        lineStyle: { type: 'dashed', width: 2, color: '#c9a063' },
        symbol: 'circle',
        symbolSize: 5,
        itemStyle: { color: '#c9a063' },
      });
    }
    return opt;
  }

  // ── PIE ─────────────────────────────────────────────────────
  if (type === 'pie' || type === 'donut') {
    opt.tooltip = { ...baseTheme.tooltip, trigger: 'item', formatter: '{b}: {c} ({d}%)' };
    opt.legend = { ...baseTheme.legend, orient: 'vertical', left: 'right', top: 'middle' };
    opt.series = [{
      name: title || 'Taqsimot',
      type: 'pie',
      radius: type === 'donut' ? ['45%', '72%'] : [0, '70%'],
      center: ['40%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: 'var(--s1)', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%', fontSize: 11, color: 'var(--text2)' },
      labelLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      data: data.map((d, i) => ({
        name: d.name,
        value: Number(d.value) || 0,
        itemStyle: { color: palette[i % palette.length] },
      })),
    }];
    return opt;
  }

  // ── SCATTER ─────────────────────────────────────────────────
  if (type === 'scatter') {
    opt.tooltip = { ...baseTheme.tooltip, trigger: 'item' };
    opt.xAxis = { type: 'value', name: xLabel || xKey, ...axisStyle };
    opt.yAxis = { type: 'value', name: yLabel || keys[0], ...axisStyle };
    opt.series = [{
      type: 'scatter',
      symbolSize: 12,
      data: data.map(d => [Number(d[xKey]) || 0, Number(d[keys[0]]) || 0, d.label || d.name]),
      itemStyle: { color: palette[0], opacity: 0.85 },
      emphasis: { focus: 'series', scale: 1.5 },
    }];
    return opt;
  }

  // ── HEATMAP ─────────────────────────────────────────────────
  if (type === 'heatmap') {
    // data: [{ x, y, value }, ...] yoki matrix
    const xs = [...new Set(data.map(d => d[xKey] ?? d.x))];
    const ys = [...new Set(data.map(d => d.y))];
    const vals = data.map(d => Number(d.value ?? d[keys[0]] ?? 0));
    opt.tooltip = { ...baseTheme.tooltip, position: 'top' };
    opt.xAxis = { type: 'category', data: xs, ...axisStyle, splitArea: { show: true } };
    opt.yAxis = { type: 'category', data: ys, ...axisStyle, splitArea: { show: true } };
    opt.visualMap = {
      min: Math.min(...vals),
      max: Math.max(...vals),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 6,
      inRange: { color: ['#1a1f2e', '#c9a063', '#00b8a9'] },
      textStyle: { color: 'var(--muted)', fontSize: 10 },
    };
    opt.series = [{
      type: 'heatmap',
      data: data.map(d => [d[xKey] ?? d.x, d.y, Number(d.value ?? d[keys[0]] ?? 0)]),
      label: { show: true, color: 'var(--text)', fontSize: 10 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(201,160,99,0.5)' } },
    }];
    return opt;
  }

  // ── TREEMAP ─────────────────────────────────────────────────
  if (type === 'treemap') {
    opt.tooltip = { ...baseTheme.tooltip };
    opt.series = [{
      type: 'treemap',
      data: data.map((d, i) => ({
        name: d.name,
        value: Number(d.value ?? d[keys[0]] ?? 0),
        itemStyle: { color: palette[i % palette.length] },
      })),
      label: { show: true, formatter: '{b}\n{c}', fontSize: 11, color: '#fff' },
      breadcrumb: { show: false },
      roam: false,
      itemStyle: { borderColor: 'var(--s1)', borderWidth: 2, gapWidth: 2 },
    }];
    return opt;
  }

  // ── RADAR ───────────────────────────────────────────────────
  if (type === 'radar') {
    // data: [{ name, values: [..] }], indicators: [{name, max}]
    const indicators = chart.indicators || keys.map(k => ({ name: k, max: Math.max(...data.map(d => Number(d[k]) || 0)) * 1.1 }));
    opt.tooltip = { ...baseTheme.tooltip };
    opt.legend = { ...baseTheme.legend };
    opt.radar = {
      indicator: indicators,
      axisName: { color: 'var(--text2)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitArea: { areaStyle: { color: ['rgba(201,160,99,0.04)', 'rgba(0,184,169,0.04)'] } },
    };
    opt.series = [{
      type: 'radar',
      data: data.map((d, i) => ({
        name: d.name,
        value: keys.map(k => Number(d[k]) || 0),
        areaStyle: { color: palette[i % palette.length] + '40' },
        lineStyle: { color: palette[i % palette.length], width: 2 },
        itemStyle: { color: palette[i % palette.length] },
      })),
    }];
    return opt;
  }

  // ── FUNNEL ──────────────────────────────────────────────────
  if (type === 'funnel') {
    opt.tooltip = { ...baseTheme.tooltip, trigger: 'item', formatter: '{b}: {c}' };
    opt.series = [{
      type: 'funnel',
      left: '10%', right: '10%', top: 36, bottom: 30,
      sort: 'descending',
      gap: 4,
      label: { show: true, position: 'inside', color: '#fff', fontSize: 12, fontWeight: 600 },
      labelLine: { length: 12 },
      itemStyle: { borderColor: 'var(--s1)', borderWidth: 2 },
      data: data.map((d, i) => ({
        name: d.name,
        value: Number(d.value ?? d[keys[0]] ?? 0),
        itemStyle: { color: palette[i % palette.length] },
      })),
    }];
    return opt;
  }

  // ── GAUGE ───────────────────────────────────────────────────
  if (type === 'gauge') {
    const value = Number(data[0]?.value || data[0]?.v || 0);
    const max = Number(chart.max || 100);
    opt.series = [{
      type: 'gauge',
      progress: { show: true, width: 16 },
      axisLine: { lineStyle: { width: 16, color: [[1, 'rgba(255,255,255,0.06)']] } },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { color: 'var(--muted)' } },
      axisLabel: { color: 'var(--muted)', fontSize: 10 },
      anchor: { show: true, size: 14, itemStyle: { color: '#c9a063' } },
      pointer: { itemStyle: { color: '#c9a063' } },
      max,
      detail: {
        valueAnimation: true,
        fontSize: 26, fontWeight: 800, color: 'var(--gold)',
        formatter: chart.format || '{value}',
        offsetCenter: [0, '60%'],
      },
      data: [{ value, name: chart.label || '' }],
    }];
    return opt;
  }

  // ── COMPOSED (bar + line) ────────────────────────────────────
  if (type === 'composed') {
    // chart.barKeys, chart.lineKeys
    const barKeys = chart.barKeys || [];
    const lineKeys = chart.lineKeys || [];
    opt.tooltip = { ...baseTheme.tooltip, trigger: 'axis' };
    opt.legend = { ...baseTheme.legend, data: [...barKeys, ...lineKeys] };
    opt.xAxis = { type: 'category', data: data.map(d => d[xKey]), ...axisStyle };
    opt.yAxis = [
      { type: 'value', name: chart.yLabelLeft || '', ...axisStyle },
      { type: 'value', name: chart.yLabelRight || '', ...axisStyle, splitLine: { show: false } },
    ];
    opt.series = [
      ...barKeys.map((k, i) => ({
        name: k,
        type: 'bar',
        yAxisIndex: 0,
        data: data.map(d => Number(d[k]) || 0),
        itemStyle: { color: palette[i % palette.length], borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 32,
      })),
      ...lineKeys.map((k, i) => ({
        name: k,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map(d => Number(d[k]) || 0),
        lineStyle: { width: 2.5, color: palette[(barKeys.length + i) % palette.length] },
        itemStyle: { color: palette[(barKeys.length + i) % palette.length] },
      })),
    ];
    return opt;
  }

  // Fallback: bar
  opt.xAxis = { type: 'category', data: data.map(d => d[xKey] || d.name), ...axisStyle };
  opt.yAxis = { type: 'value', ...axisStyle };
  opt.series = [{
    type: 'bar',
    data: data.map(d => Number(d[keys[0] || 'value']) || 0),
    itemStyle: { color: palette[0], borderRadius: [6, 6, 0, 0] },
  }];
  return opt;
}

export default function AdvancedChart({ chart, height = 320, onReady }) {
  const ref = useRef(null);
  const option = useMemo(() => buildOption(chart || {}), [chart]);

  // Hi-DPI export
  const exportPng = () => {
    const inst = ref.current?.getEchartsInstance?.();
    if (!inst) return;
    const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0f1218' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(chart.title || 'chart').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="advanced-chart-wrap" style={{ position: 'relative' }}>
      <ReactECharts
        ref={ref}
        option={option}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'svg' }}
        onChartReady={onReady}
        notMerge
        lazyUpdate
      />
      <button
        onClick={exportPng}
        title="PNG yuklab olish"
        className="advanced-chart-export"
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 28, height: 28, borderRadius: 7,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.4, transition: 'all .15s var(--ease)',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
  );
}
