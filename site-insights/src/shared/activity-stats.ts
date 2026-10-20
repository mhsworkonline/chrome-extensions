import type { Visit } from './types';

export interface Summary {
  sites: number;
  visits: number;
  activeMs: number;
  /** Share of visits that bounced, 0 to 1. Null when there are no visits. */
  bounceRate: number | null;
}

export interface SiteRow {
  domain: string;
  visits: number;
  activeMs: number;
  bounceRate: number;
}

export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function summarize(visits: Visit[]): Summary {
  const bounced = visits.filter((v) => v.bounced).length;
  return {
    sites: new Set(visits.map((v) => v.domain)).size,
    visits: visits.length,
    activeMs: visits.reduce((n, v) => n + v.activeMs, 0),
    bounceRate: visits.length ? bounced / visits.length : null,
  };
}

export function bySite(visits: Visit[]): SiteRow[] {
  const map = new Map<string, Visit[]>();
  for (const v of visits) map.set(v.domain, [...(map.get(v.domain) ?? []), v]);
  return Array.from(map, ([domain, vs]) => ({
    domain,
    visits: vs.length,
    activeMs: vs.reduce((n, v) => n + v.activeMs, 0),
    bounceRate: vs.filter((v) => v.bounced).length / vs.length,
  })).sort((a, b) => b.activeMs - a.activeMs);
}

/** Active minutes per calendar day, with empty days filled so the chart has no gaps. */
export function perDay(visits: Visit[], fromTs: number, now = Date.now()) {
  const totals = new Map<string, number>();
  for (const v of visits) totals.set(dayKey(v.startedAt), (totals.get(dayKey(v.startedAt)) ?? 0) + v.activeMs);

  const labels: string[] = [];
  const values: number[] = [];
  for (let t = fromTs; dayKey(t) <= dayKey(now); t += 24 * 60 * 60 * 1000) {
    const k = dayKey(t);
    labels.push(k);
    values.push((totals.get(k) ?? 0) / 60_000);
  }
  return { labels, values };
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const formatPercent = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
