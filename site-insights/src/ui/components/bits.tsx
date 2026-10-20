import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { RankPoint } from '../../shared/types';

export function Card(props: {
  title: string;
  sub?: string;
  right?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">{props.title}</h2>
          {props.sub && <div class="card-sub">{props.sub}</div>}
        </div>
        {props.right}
      </div>
      {props.children}
    </section>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Why this option is unavailable; presence disables the chip. */
  disabledReason?: string;
}

export function Chips<T extends string>(props: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div class="chips" role="group">
      {props.options.map((o) => (
        <button
          key={o.value}
          class="chip"
          aria-pressed={o.value === props.value}
          disabled={!!o.disabledReason}
          title={o.disabledReason}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge(props: { tone?: 'good' | 'bad' | 'warn' | 'neutral'; children: ComponentChildren }) {
  return <span class={`badge ${props.tone ?? ''}`}>{props.children}</span>;
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      class="switch"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

/** Circular score gauge, 0 to 100. */
export function Gauge({ value, size = 92 }: { value: number; size?: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? 'var(--good)' : value >= 50 ? 'var(--warn)' : 'var(--bad)';
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Score ${value} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" stroke-width="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="56" text-anchor="middle" font-size="24" font-weight="750" fill="var(--text)">
        {value}
      </text>
    </svg>
  );
}

export interface Column<T> {
  header: string;
  num?: boolean;
  cell: (row: T) => ComponentChildren;
}

/** Table with the numbered pager from the reference design. */
export function DataTable<T>(props: { rows: T[]; columns: Column<T>[]; pageSize?: number; empty: string }) {
  const size = props.pageSize ?? 5;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(props.rows.length / size));
  const current = Math.min(page, pages - 1);
  if (!props.rows.length) return <div class="muted small">{props.empty}</div>;

  return (
    <>
      <table class="table">
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th key={c.header} class={c.num ? 'num' : ''}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.slice(current * size, current * size + size).map((row, i) => (
            <tr key={i}>
              {props.columns.map((c) => (
                <td key={c.header} class={c.num ? 'num' : ''}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div class="pager">
          <button disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
            ‹
          </button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} aria-current={i === current} onClick={() => setPage(i)}>
              {i + 1}
            </button>
          ))}
          <button disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
            ›
          </button>
        </div>
      )}
    </>
  );
}

export function Skeleton(props: { h: number; w?: string }) {
  return <div class="skeleton" style={{ height: props.h, width: props.w ?? '100%' }} />;
}

export function Empty(props: { title: string; body: string }) {
  return (
    <div class="empty">
      <strong>{props.title}</strong>
      <span>{props.body}</span>
    </div>
  );
}

/** Rank change over a window. Lower rank number is better. */
export function RankDelta({ points }: { points: RankPoint[] }) {
  if (points.length < 2) return null;
  const change = points[0].rank - points[points.length - 1].rank;
  if (change === 0) return <Badge tone="neutral">No change</Badge>;
  const up = change > 0;
  return (
    <Badge tone={up ? 'good' : 'bad'}>
      {up ? '▲' : '▼'} {Math.abs(change).toLocaleString()} {Math.abs(change) === 1 ? 'place' : 'places'}
    </Badge>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 300;
  const h = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // Better (lower) rank plots higher on the chart.
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = ((v - min) / span) * (h - 10) + 5;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Rank trend">
      <polygon points={area} fill="var(--primary)" opacity="0.1" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--primary)"
        stroke-width="2"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Tile(props: { label: string; value: string; sub?: string }) {
  return (
    <div class="tile">
      <div class="kpi-label">{props.label}</div>
      <div class="kpi-value sm">{props.value}</div>
      {props.sub && <div class="muted small">{props.sub}</div>}
    </div>
  );
}

/** Horizontal bars, one per row, scaled to the largest value. */
export function BarList(props: { rows: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  return (
    <div class="stack" style={{ gap: 8 }}>
      {props.rows.map((r) => (
        <div class="bar-row" key={r.label}>
          <span class="bar-label" title={r.label}>{r.label}</span>
          <span class="bar-track">
            <span class="bar-fill" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </span>
          <span class="bar-note">{r.note ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Swatch(props: { hex: string; count?: number }) {
  return (
    <button
      class="swatch"
      title="Copy colour"
      onClick={() => void navigator.clipboard?.writeText(props.hex).catch(() => undefined)}
    >
      <span class="swatch-chip" style={{ background: props.hex }} />
      <span>{props.hex}</span>
      {props.count !== undefined && <small class="muted">{props.count}</small>}
    </button>
  );
}

export type Finding = { label: string; status: 'pass' | 'warn' | 'fail'; detail: string };

const MARKS = { pass: '✓', warn: '!', fail: '✕' } as const;

/** Findings with problems first and passes folded behind a toggle. */
export function FindingList(props: { findings: Finding[] }) {
  const [showPassed, setShowPassed] = useState(false);
  const passed = props.findings.filter((f) => f.status === 'pass').length;
  const rows = props.findings.filter((f) => showPassed || f.status !== 'pass');
  return (
    <div class="stack">
      {rows.length === 0 && <div class="muted">Everything passes.</div>}
      {rows.map((f) => (
        <div class="check" key={f.label}>
          <span class={`dot ${f.status}`}>{MARKS[f.status]}</span>
          <div>
            <div style={{ fontWeight: 600 }}>{f.label}</div>
            <div class="muted small" style={{ overflowWrap: 'anywhere' }}>{f.detail}</div>
          </div>
        </div>
      ))}
      {passed > 0 && (
        <button class="btn ghost" onClick={() => setShowPassed(!showPassed)}>
          {showPassed ? 'Hide passed checks' : `Show ${passed} passed checks`}
        </button>
      )}
    </div>
  );
}
