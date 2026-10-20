import { useState } from 'preact/hooks';
import type { Message, RankPoint, RankResult } from '../../../shared/types';
import { estimateVisits, formatRange } from '../../../shared/estimate';
import { addWatch, rankKey, removeWatch, WATCHLIST_KEY } from '../../../shared/history';
import { Card, Empty, RankDelta, Sparkline } from '../../components/bits';
import { useStored } from '../../hooks';
import { spanDays } from '../../ranges';

function Row({ domain }: { domain: string }) {
  const history = useStored<RankPoint[]>(rankKey(domain), []);
  const latest = history[history.length - 1];
  const est = latest ? estimateVisits(latest.rank) : null;
  const recent = history.slice(-30);

  return (
    <div class="watch-row">
      <div>
        <div class="row" style={{ gap: 8 }}>
          <strong>{domain}</strong>
          {recent.length > 1 && <RankDelta points={recent} />}
        </div>
        <div class="muted small">
          {latest ? `#${latest.rank.toLocaleString()}` : 'Not ranked yet'}
          {est ? ` · ~${formatRange(est)} visits / month` : ''}
          {history.length > 1 ? ` · ${spanDays(history)} days saved` : ''}
        </div>
      </div>
      <div>{recent.length > 1 && <Sparkline values={recent.map((p) => p.rank)} />}</div>
      <button class="icon-btn" aria-label={`Stop watching ${domain}`} title="Stop watching" onClick={() => void removeWatch(domain)}>
        ✕
      </button>
    </div>
  );
}

export function Watchlist() {
  const list = useStored<string[]>(WATCHLIST_KEY, []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: Event) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    // The worker normalises the address and saves the rank history as a side effect of this lookup.
    const msg: Message = { type: 'getRank', domain: input };
    const res: RankResult = await chrome.runtime.sendMessage(msg);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await addWatch(res.domain);
    setInput('');
  }

  return (
    <>
      <Card title="Watchlist" sub="Ranks are saved in this browser, so trends can grow past five weeks">
        <form class="row" onSubmit={add}>
          <input
            class="input"
            placeholder="Add a site, e.g. example.com"
            value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            aria-label="Site to watch"
          />
          <button class="btn primary" type="submit" disabled={busy}>
            {busy ? '…' : 'Watch'}
          </button>
        </form>
        {error && <div class="error-text" style={{ marginTop: 8 }}>{error}</div>}
      </Card>

      <Card title="Watched sites">
        {list.length === 0 ? (
          <Empty title="Nothing watched yet" body="Add a site above, or click the ☆ next to a site’s name in the header." />
        ) : (
          list.map((d) => <Row key={d} domain={d} />)
        )}
        <div class="muted small" style={{ marginTop: 10 }}>
          Watched sites refresh about once a day while the browser is open.
        </div>
      </Card>
    </>
  );
}
