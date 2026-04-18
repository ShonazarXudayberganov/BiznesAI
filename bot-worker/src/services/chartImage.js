/**
 * Chart.js konfiguratsiyani QuickChart.io orqali PNG ga aylantiradi.
 * Bot grafik so'rasa ishlatamiz.
 */
const QC_URL = 'https://quickchart.io/chart';

/**
 * @param {object} chartConfig — Chart.js konfiguratsiya obyekti
 * @param {object} opts — { width, height, backgroundColor }
 */
async function renderChart(chartConfig, opts = {}) {
  const params = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: String(opts.width || 800),
    height: String(opts.height || 500),
    backgroundColor: opts.backgroundColor || 'white',
    devicePixelRatio: '2',
  });
  const url = `${QC_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`QuickChart: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Quruvchi yordamchilar ──
function lineChart(title, labels, datasets) {
  return {
    type: 'line',
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data,
      borderColor: d.color || '#00C9BE', backgroundColor: (d.color || '#00C9BE') + '33',
      tension: 0.3, fill: true,
    })) },
    options: {
      plugins: { title: { display: !!title, text: title, font: { size: 16 } }, legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    },
  };
}

function barChart(title, labels, datasets) {
  return {
    type: 'bar',
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, backgroundColor: d.color || '#D4A853',
    })) },
    options: {
      plugins: { title: { display: !!title, text: title, font: { size: 16 } }, legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    },
  };
}

module.exports = { renderChart, lineChart, barChart };
