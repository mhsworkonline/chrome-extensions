import { getRank } from '../sources/tranco';
import { getWatchlist } from '../shared/history';

export const WATCH_ALARM = 'watchlist-refresh';
const PER_TICK = 5;
const GAP_MS = 2500; // Tranco throttles bursts

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Refreshes watched sites a few at a time. getRank skips sites whose data is still fresh,
 * so a tick that runs hourly ends up fetching each site about once a day without a long-running job.
 */
export async function refreshWatchlist(): Promise<void> {
  const domains = (await getWatchlist()).slice(0, PER_TICK * 10);
  let fetched = 0;
  for (const domain of domains) {
    if (fetched >= PER_TICK) break;
    const before = Date.now();
    try {
      const snap = await getRank(domain);
      if (snap.fetchedAt >= before) {
        fetched++;
        await sleep(GAP_MS);
      }
    } catch {
      // A throttled or failed lookup is retried on the next tick.
    }
  }
}

export function ensureWatchAlarm() {
  void chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 60 });
}
