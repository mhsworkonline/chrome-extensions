import { useEffect, useRef } from 'preact/hooks';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import type { RankPoint } from '../../shared/types';
import { formatCompact } from '../../shared/estimate';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
);

/** Series colors, taken from the reference dashboard. They hold up in both themes. */
export const PALETTE = ['#5b67e0', '#f6b84e', '#38bdf8', '#2f6b9a', '#b9a4ec', '#4ec9a0', '#f27c7c'];

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function tooltipTheme() {
  return {
    backgroundColor: css('--surface'),
    titleColor: css('--muted'),
    bodyColor: css('--text'),
    borderColor: css('--border'),
    borderWidth: 1,
    padding: 10,
  };
}

/** Mounts a Chart.js chart and rebuilds it when its inputs or the theme change. */
function useChart(build: () => ChartConfiguration, deps: unknown[]) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, build());
    return () => chart.destroy();
  }, deps);
  return canvas;
}

const axisBase = () => ({
  grid: { color: css('--border') },
  border: { display: false },
  ticks: { color: css('--muted') },
});

const xAxis = () => ({
  grid: { display: false },
  border: { display: false },
  ticks: { color: css('--muted'), maxTicksLimit: 5, maxRotation: 0 },
});

export interface RankSeries {
  label: string;
  points: RankPoint[];
}

/** Rank over time. Reversed axis so a better (lower) rank sits higher; log scale when comparing sites. */
export function RankChart(props: { series: RankSeries[]; isDark: boolean; height?: number }) {
  const log = props.series.length > 1;
  const canvas = useChart(
    () => {
      const dates = Array.from(new Set(props.series.flatMap((s) => s.points.map((p) => p.date)))).sort();
      return {
        type: 'line',
        data: {
          labels: dates,
          datasets: props.series.map((s, i) => {
            const byDate = new Map(s.points.map((p) => [p.date, p.rank]));
            return {
              label: s.label,
              data: dates.map((d) => byDate.get(d) ?? null),
              borderColor: PALETTE[i % PALETTE.length],
              backgroundColor: PALETTE[i % PALETTE.length] + '22',
              fill: props.series.length === 1,
              tension: 0.3,
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 5,
              spanGaps: true,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: xAxis(),
            y: {
              ...axisBase(),
              type: log ? 'logarithmic' : 'linear',
              reverse: true,
              ticks: {
                color: css('--muted'),
                maxTicksLimit: 4,
                callback: (v) => `#${formatCompact(Number(v))}`,
              },
              afterDataLimits: (axis) => {
                if (axis.max === axis.min) {
                  axis.max += 1;
                  axis.min = Math.max(1, axis.min - 1);
                }
              },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltipTheme(),
              displayColors: props.series.length > 1,
              callbacks: { label: (c) => `${c.dataset.label}: #${Number(c.parsed.y).toLocaleString()}` },
            },
          },
        },
      };
    },
    [props.series, props.isDark],
  );
  return (
    <div style={{ height: props.height ?? 180 }}>
      <canvas ref={canvas} />
    </div>
  );
}

export interface BandPoint {
  date: string;
  low: number;
  mid: number;
  high: number;
}

/** Estimated visits as a shaded low-to-high band around the midpoint. */
export function VisitsChart(props: { points: BandPoint[]; isDark: boolean }) {
  const canvas = useChart(
    () => ({
      type: 'line',
      data: {
        labels: props.points.map((p) => p.date),
        datasets: [
          { label: 'Low', data: props.points.map((p) => p.low), borderColor: 'transparent', pointRadius: 0, fill: false },
          {
            label: 'High',
            data: props.points.map((p) => p.high),
            borderColor: 'transparent',
            backgroundColor: PALETTE[0] + '24',
            pointRadius: 0,
            fill: '-1',
          },
          {
            label: 'Estimate',
            data: props.points.map((p) => p.mid),
            borderColor: PALETTE[0],
            borderWidth: 2.5,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: xAxis(),
          y: { ...axisBase(), ticks: { color: css('--muted'), maxTicksLimit: 4, callback: (v) => formatCompact(Number(v)) } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipTheme(),
            displayColors: false,
            callbacks: { label: (c) => `${c.dataset.label}: ~${formatCompact(Number(c.parsed.y))} / month` },
          },
        },
      },
    }),
    [props.points, props.isDark],
  );
  return (
    <div style={{ height: 180 }}>
      <canvas ref={canvas} />
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
}

export function DonutChart(props: { slices: Slice[]; isDark: boolean; center?: string }) {
  const canvas = useChart(
    () => ({
      type: 'doughnut',
      data: {
        labels: props.slices.map((s) => s.label),
        datasets: [
          {
            data: props.slices.map((s) => s.value),
            backgroundColor: props.slices.map((_, i) => PALETTE[i % PALETTE.length]),
            borderColor: css('--surface'),
            borderWidth: 3,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { display: false }, tooltip: { ...tooltipTheme(), displayColors: true } },
      },
    }),
    [props.slices, props.isDark],
  );
  return (
    <div style={{ height: 170, position: 'relative' }}>
      <canvas ref={canvas} />
      {props.center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            fontWeight: 750,
            fontSize: 22,
          }}
        >
          {props.center}
        </div>
      )}
    </div>
  );
}

export function BarChart(props: { labels: string[]; values: number[]; isDark: boolean; format: (v: number) => string }) {
  const canvas = useChart(
    () => ({
      type: 'bar',
      data: {
        labels: props.labels,
        datasets: [
          {
            data: props.values,
            backgroundColor: PALETTE[0],
            borderRadius: 5,
            maxBarThickness: 22,
            hoverBackgroundColor: PALETTE[1],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: xAxis(),
          y: { ...axisBase(), beginAtZero: true, ticks: { color: css('--muted'), maxTicksLimit: 4, callback: (v) => props.format(Number(v)) } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipTheme(), displayColors: false, callbacks: { label: (c) => props.format(Number(c.parsed.y)) } },
        },
      },
    }),
    [props.labels, props.values, props.isDark],
  );
  return (
    <div style={{ height: 170 }}>
      <canvas ref={canvas} />
    </div>
  );
}

export interface TrendPoint {
  label: string;
  value: number;
}

/** A plain line chart for one measured value over time. */
export function TrendChart(props: { points: TrendPoint[]; isDark: boolean; format: (v: number) => string; height?: number }) {
  const canvas = useChart(
    () => ({
      type: 'line',
      data: {
        labels: props.points.map((p) => p.label),
        datasets: [
          {
            data: props.points.map((p) => p.value),
            borderColor: PALETTE[0],
            backgroundColor: PALETTE[0] + '22',
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: props.points.length < 12 ? 3 : 0,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: xAxis(),
          y: { ...axisBase(), beginAtZero: true, ticks: { color: css('--muted'), maxTicksLimit: 4, callback: (v) => props.format(Number(v)) } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipTheme(), displayColors: false, callbacks: { label: (c) => props.format(Number(c.parsed.y)) } },
        },
      },
    }),
    [props.points, props.isDark],
  );
  return (
    <div style={{ height: props.height ?? 160 }}>
      <canvas ref={canvas} />
    </div>
  );
}
