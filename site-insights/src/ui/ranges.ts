import type { RankPoint } from '../shared/types';
import type { ChipOption } from './components/bits';

export type RangeKey = '7' | '14' | '30' | '90' | '180' | '365' | 'all';

const DEFS: [key: RangeKey, label: string, days: number][] = [
  ['7', '7D', 7],
  ['14', '14D', 14],
  ['30', '30D', 30],
  ['90', '3M', 90],
  ['180', '6M', 180],
  ['365', '1Y', 365],
  ['all', 'All', Infinity],
];

const DAY = 86_400_000;
const t = (d: string) => Date.parse(d);

export function spanDays(points: RankPoint[]): number {
  if (points.length < 2) return points.length;
  return Math.round((t(points[points.length - 1].date) - t(points[0].date)) / DAY) + 1;
}

/** A range is offered only when the saved history actually covers it. */
export function rangeOptions(points: RankPoint[]): ChipOption<RangeKey>[] {
  const span = spanDays(points);
  return DEFS.map(([value, label, days]) => ({
    value,
    label,
    disabledReason:
      value === 'all' || span >= days * 0.9
        ? undefined
        : `Only ${span} day${span === 1 ? '' : 's'} of history so far. It grows as you browse or watch this site.`,
  }));
}

export function sliceRange(points: RankPoint[], key: RangeKey): RankPoint[] {
  const days = DEFS.find(([k]) => k === key)?.[2] ?? Infinity;
  if (!Number.isFinite(days) || !points.length) return points;
  const cutoff = t(points[points.length - 1].date) - (days - 1) * DAY;
  return points.filter((p) => t(p.date) >= cutoff);
}
