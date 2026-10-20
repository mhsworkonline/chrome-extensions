import {
  ArcElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  type ChartConfiguration,
} from 'chart.js';
import { formatCompact, estimateVisits } from '../../../shared/estimate';
import type { PerfPoint, RankPoint } from '../../../shared/types';
import { PDF_PALETTE } from './palette';

Chart.register(ArcElement, CategoryScale, DoughnutController, Filler, LineController, LineElement, LinearScale, LogarithmicScale, PointElement);

/** Fixed print colours, so the PDF looks the same whatever theme the dashboard is in. */
const INK = '#1b2033';
const MUTED = '#6b7385';
const GRID = '#e3e6ef';
const PRIMARY = '#5b67e0';
const PALETTE = PDF_PALETTE;

export type MakeCanvas = (width: number, height: number) => HTMLCanvasElement;

export const browserCanvas: MakeCanvas = (width, height) => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
};

const W = 1000;
const H = 360;

// Line and doughnut configs have different option types; both are plain Chart.js configs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(make: MakeCanvas, config: ChartConfiguration<any>, height = H, width = W): string {
  const canvas = make(width, height);
  // A white page behind the chart, drawn before everything else.
  const background = {
    id: 'page-background',
    beforeDraw(chart: Chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    },
  };
  const chart = new Chart(canvas, {
    ...config,
    plugins: [background],
    options: { ...config.options, animation: false, responsive: false, devicePixelRatio: 1 },
  });
  const url = chart.toBase64Image('image/png', 1);
  chart.destroy();
  return url;
}

const axes = (yFormat: (v: number) => string, extra: object = {}) => ({
  x: { grid: { display: false }, border: { display: false }, ticks: { color: MUTED, maxTicksLimit: 8, maxRotation: 0, font: { size: 18 } } },
  y: { grid: { color: GRID }, border: { display: false }, ticks: { color: MUTED, maxTicksLimit: 5, font: { size: 18 }, callback: (v: unknown) => yFormat(Number(v)) }, ...extra },
});

export function rankChart(points: RankPoint[], make: MakeCanvas): string {
  return render(make, {
    type: 'line',
    data: {
      labels: points.map((p) => p.date),
      datasets: [{ data: points.map((p) => p.rank), borderColor: PRIMARY, backgroundColor: PRIMARY + '22', fill: true, tension: 0.3, borderWidth: 4, pointRadius: 0 }],
    },
    options: { plugins: { legend: { display: false } }, scales: axes((v) => `#${formatCompact(v)}`, { reverse: true }) },
  });
}

/** Estimated visits as a low-to-high band around the midpoint. */
export function visitsChart(points: RankPoint[], make: MakeCanvas): string {
  const est = points.map((p) => estimateVisits(p.rank));
  return render(make, {
    type: 'line',
    data: {
      labels: points.map((p) => p.date),
      datasets: [
        { label: 'Low', data: est.map((e) => e?.low ?? null), borderColor: 'transparent', pointRadius: 0, fill: false },
        { label: 'High', data: est.map((e) => e?.high ?? null), borderColor: 'transparent', backgroundColor: PRIMARY + '30', pointRadius: 0, fill: '-1' },
        { label: 'Estimate', data: est.map((e) => e?.mid ?? null), borderColor: PRIMARY, borderWidth: 4, tension: 0.3, pointRadius: 0, fill: false },
      ],
    },
    options: { plugins: { legend: { display: false } }, scales: axes((v) => formatCompact(v)) },
  });
}

export function speedChart(readings: PerfPoint[], formatMs: (v: number) => string, make: MakeCanvas): string {
  const pts = readings.filter((r) => r.lcp !== null);
  return render(make, {
    type: 'line',
    data: {
      labels: pts.map((r) => new Date(r.ts).toISOString().slice(5, 10)),
      datasets: [{ data: pts.map((r) => r.lcp as number), borderColor: PRIMARY, backgroundColor: PRIMARY + '22', fill: true, tension: 0.3, borderWidth: 4, pointRadius: pts.length < 12 ? 5 : 0 }],
    },
    options: { plugins: { legend: { display: false } }, scales: axes(formatMs, { beginAtZero: true }) },
  });
}

export function weightChart(slices: { label: string; value: number }[], make: MakeCanvas): string {
  return render(
    make,
    {
      type: 'doughnut',
      data: {
        labels: slices.map((s) => s.label),
        datasets: [{ data: slices.map((s) => s.value), backgroundColor: slices.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: '#ffffff', borderWidth: 6 }],
      },
      options: { cutout: '60%', plugins: { legend: { display: false } } },
    },
    360,
    360,
  );
}

export { INK };
