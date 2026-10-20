import type { RankPayload, Snapshot } from '../shared/types';
import { isFresh, readSnapshot, writeSnapshot } from '../shared/cache';
import { mergeRankHistory } from '../shared/history';

const SOURCE = 'tranco';
const TTL = 12 * 60 * 60 * 1000; // the list updates daily; 12h keeps lookups rare
const TIMEOUT_MS = 8000;

interface TrancoResponse {
  ranks?: { date: string; rank: number }[];
}

async function fetchOnce(domain: string): Promise<TrancoResponse> {
  const res = await fetch(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Tranco throttles bursts and answers with an HTML page rather than JSON.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(`Tranco responded ${res.status} (${res.headers.get('content-type')})`);
  }
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getRank(domain: string): Promise<Snapshot<RankPayload>> {
  const cached = await readSnapshot<RankPayload>(domain, SOURCE);
  if (cached && isFresh(cached)) return cached;

  try {
    let data: TrancoResponse;
    try {
      data = await fetchOnce(domain);
    } catch {
      await sleep(2000); // back off once; hammering a throttled endpoint only extends the block
      data = await fetchOnce(domain);
    }
    const history = (data.ranks ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const snap: Snapshot<RankPayload> = {
      fetchedAt: Date.now(),
      ttl: TTL,
      span: history.length ? { from: history[0].date, to: history[history.length - 1].date } : null,
      source: 'measured',
      payload: { history },
    };
    await writeSnapshot(domain, SOURCE, snap);
    await mergeRankHistory(domain, history);
    return snap;
  } catch (err) {
    if (cached) return cached; // stale beats nothing
    throw err;
  }
}
