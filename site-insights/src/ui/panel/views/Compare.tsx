import { useMemo, useState } from 'preact/hooks';
import type { Message, RankResult, SiteResult } from '../../../shared/types';
import { estimateVisits, formatRange } from '../../../shared/estimate';
import { Card, DataTable } from '../../components/bits';
import { RankChart } from '../../components/charts';

interface Other {
  domain: string;
  history: { date: string; rank: number }[];
}

export function Compare({ site, isDark }: { site: Extract<SiteResult, { ok: true }>; isDark: boolean }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [other, setOther] = useState<Other | null>(null);

  const mine = site.rank?.payload.history ?? [];
  const series = useMemo(
    () => (other ? [{ label: site.domain, points: mine }, { label: other.domain, points: other.history }] : []),
    [other, site.domain, mine],
  );

  async function submit(e: Event) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    const msg: Message = { type: 'getRank', domain: input };
    const res: RankResult = await chrome.runtime.sendMessage(msg);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (!res.rank.payload.history.length) return setError(`${res.domain} isn’t in the Tranco top 1 million.`);
    setOther({ domain: res.domain, history: res.rank.payload.history });
  }

  const rows = [
    { domain: site.domain, history: mine },
    ...(other ? [{ domain: other.domain, history: other.history }] : []),
  ].map((r) => {
    const latest = r.history[r.history.length - 1];
    const est = latest ? estimateVisits(latest.rank) : null;
    return { domain: r.domain, rank: latest?.rank ?? null, est: est ? formatRange(est) : '—' };
  });

  return (
    <Card title="Compare sites" sub="Rank and estimated visits side by side">
      <form class="row" onSubmit={submit}>
        <input
          class="input"
          placeholder="Enter another site, e.g. example.com"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          aria-label="Site to compare"
        />
        <button class="btn primary" type="submit" disabled={busy}>
          {busy ? '…' : 'Compare'}
        </button>
      </form>
      {error && <div class="error-text" style={{ marginTop: 8 }}>{error}</div>}

      {other && (
        <div class="stack" style={{ marginTop: 14 }}>
          <RankChart series={series} isDark={isDark} height={170} />
          <div class="legend">
            <span><i style={{ background: '#5b67e0' }} />{site.domain}</span>
            <span><i style={{ background: '#f6b84e' }} />{other.domain}</span>
            <span>Log scale</span>
          </div>
          <DataTable
            rows={rows}
            empty=""
            columns={[
              { header: 'Site', cell: (r) => <span class="link">{r.domain}</span> },
              { header: 'Rank', num: true, cell: (r) => (r.rank ? `#${r.rank.toLocaleString()}` : '—') },
              { header: 'Est. visits / mo', num: true, cell: (r) => r.est },
            ]}
          />
        </div>
      )}
    </Card>
  );
}
