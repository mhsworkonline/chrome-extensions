import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SiteResult } from '../../../shared/types';
import { Badge, Card, Chips, Empty, RankDelta, Tile } from '../../components/bits';
import { RankChart } from '../../components/charts';
import { useRankHistory } from '../../hooks';
import { rangeOptions, sliceRange, spanDays, type RangeKey } from '../../ranges';

export function Rank({ site, isDark }: { site: Extract<SiteResult, { ok: true }>; isDark: boolean }) {
  const history = useRankHistory(site);
  const options = useMemo(() => rangeOptions(history), [history]);
  const [range, setRange] = useState<RangeKey>('30');

  // If the chosen range isn't covered for this site, fall back to the widest one that is.
  useEffect(() => {
    if (options.find((o) => o.value === range)?.disabledReason) setRange('all');
  }, [options, range]);

  const points = useMemo(() => sliceRange(history, range), [history, range]);
  const series = useMemo(() => [{ label: site.domain, points }], [site.domain, points]);

  if (!points.length) {
    return (
      <Card title="Global rank">
        <Empty
          title={site.rankError ? 'Rank unavailable' : 'Not ranked'}
          body={site.rankError ?? 'This site isn’t in the Tranco top 1 million.'}
        />
      </Card>
    );
  }

  const ranks = points.map((p) => p.rank);
  const latest = points[points.length - 1];
  const saved = spanDays(history);

  return (
    <>
      <Card
        title="Global rank"
        sub={`${points[0].date} to ${latest.date} · Tranco`}
        right={<Chips options={options} value={range} onChange={setRange} />}
      >
        <div class="row" style={{ marginBottom: 8 }}>
          <span class="kpi-value">#{latest.rank.toLocaleString()}</span>
          <RankDelta points={points} />
          <Badge>Measured</Badge>
        </div>
        <RankChart series={series} isDark={isDark} />
        {saved > 40 && <div class="muted small" style={{ marginTop: 8 }}>{saved} days of history saved in this browser.</div>}
      </Card>

      <div class="grid-3">
        <Tile label="Best rank" value={`#${Math.min(...ranks).toLocaleString()}`} />
        <Tile label="Worst rank" value={`#${Math.max(...ranks).toLocaleString()}`} />
        <Tile label="Days" value={String(points.length)} />
      </div>
    </>
  );
}
