import type { PerfPoint, RankPoint } from './types';

/** Local history lives in storage.local, so it outlives Tranco's ~5 weeks and never leaves the browser. */

const MAX_RANK_POINTS = 1100; // about three years of daily points
const MAX_PERF_POINTS = 120;

export const rankKey = (domain: string) => `rank:${domain}`;
export const perfKey = (domain: string) => `perf:${domain}`;
export const WATCHLIST_KEY = 'watchlist';

async function read<T>(key: string, fallback: T): Promise<T> {
  const got = await chrome.storage.local.get(key);
  return (got[key] as T | undefined) ?? fallback;
}

/** Union of stored and new points; a date seen again takes the newer value. */
export function mergePoints(old: RankPoint[], fresh: RankPoint[]): RankPoint[] {
  const byDate = new Map(old.map((p) => [p.date, p.rank]));
  for (const p of fresh) byDate.set(p.date, p.rank);
  return Array.from(byDate, ([date, rank]) => ({ date, rank }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_RANK_POINTS);
}

export async function mergeRankHistory(domain: string, points: RankPoint[]): Promise<void> {
  if (!points.length) return;
  const merged = mergePoints(await read<RankPoint[]>(rankKey(domain), []), points);
  await chrome.storage.local.set({ [rankKey(domain)]: merged });
}

export async function recordPerf(domain: string, point: PerfPoint): Promise<void> {
  const old = await read<PerfPoint[]>(perfKey(domain), []);
  const last = old[old.length - 1];
  // Re-measuring the same page within a few minutes replaces the reading instead of piling up near-duplicates.
  const base = last && last.url === point.url && point.ts - last.ts < 5 * 60_000 ? old.slice(0, -1) : old;
  await chrome.storage.local.set({ [perfKey(domain)]: [...base, point].slice(-MAX_PERF_POINTS) });
}

export const getWatchlist = () => read<string[]>(WATCHLIST_KEY, []);

export async function addWatch(domain: string): Promise<void> {
  const list = await getWatchlist();
  if (!list.includes(domain)) await chrome.storage.local.set({ [WATCHLIST_KEY]: [...list, domain].slice(0, 50) });
}

export async function removeWatch(domain: string): Promise<void> {
  const list = await getWatchlist();
  await chrome.storage.local.set({ [WATCHLIST_KEY]: list.filter((d) => d !== domain) });
}
