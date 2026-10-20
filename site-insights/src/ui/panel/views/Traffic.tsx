import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SiteResult } from '../../../shared/types';
import { estimateVisits, formatRange } from '../../../shared/estimate';
import { bySite, formatDuration, formatPercent, summarize } from '../../../shared/activity-stats';
import { Badge, Card, Chips, Empty, Tile } from '../../components/bits';
import { VisitsChart, type BandPoint } from '../../components/charts';
import { useRankHistory, useSettings, useVisits } from '../../hooks';
import { rangeOptions, sliceRange, type RangeKey } from '../../ranges';

export function Traffic({ site, isDark }: { site: Extract<SiteResult, { ok: true }>; isDark: boolean }) {
  const history = useRankHistory(site);
  const options = useMemo(() => rangeOptions(history), [history]);
  const [range, setRange] = useState<RangeKey>('30');
  const settings = useSettings();
  const visits = useVisits(0);

  useEffect(() => {
    if (options.find((o) => o.value === range)?.disabledReason) setRange('all');
  }, [options, range]);

  const band = useMemo<BandPoint[]>(
    () =>
      sliceRange(history, range).flatMap((p) => {
        const e = estimateVisits(p.rank);
        return e ? [{ date: p.date, ...e }] : [];
      }),
    [history, range],
  );

  const mine = useMemo(() => (visits ?? []).filter((v) => v.domain === site.domain), [visits, site.domain]);
  const mineSummary = summarize(mine);
  const mineRow = bySite(mine)[0];

  return (
    <>
      <Card
        title="Estimated monthly visits"
        sub={band.length ? `${band[0].date} to ${band[band.length - 1].date} · modeled from rank` : 'Modeled from rank'}
        right={<Chips options={options} value={range} onChange={setRange} />}
      >
        {band.length ? (
          <>
            <div class="row" style={{ marginBottom: 8 }}>
              <span class="kpi-value">{formatRange(band[band.length - 1])}</span>
              <Badge tone="warn">Estimated</Badge>
            </div>
            <VisitsChart points={band} isDark={isDark} />
            <div class="note" style={{ marginTop: 12 }}>
              The line is the midpoint and the shaded band is the likely range. It moves only when the site’s rank
              moves, so it shows relative change, not exact traffic. Tranco blends link and DNS data, not visits, so
              it can over-rank sites that are heavily linked but rarely visited.
            </div>
          </>
        ) : (
          <Empty title="No estimate" body="This site isn’t in the top 1 million, so its traffic can’t be estimated." />
        )}
      </Card>

      <Card title="Your activity on this site" sub="Stored only on this device" right={<Badge tone="neutral">Local</Badge>}>
        {settings && !settings.trackActivity ? (
          <div class="muted">Turn on tracking in My Activity to see your own visits, time and bounce rate here.</div>
        ) : mineSummary.visits === 0 ? (
          <div class="muted">No visits recorded for {site.domain} yet.</div>
        ) : (
          <div class="grid-3">
            <Tile label="Visits" value={String(mineSummary.visits)} />
            <Tile label="Time" value={formatDuration(mineSummary.activeMs)} />
            <Tile label="Bounce" value={formatPercent(mineRow?.bounceRate ?? null)} />
          </div>
        )}
      </Card>

      <Card title="What isn’t available" sub="Needs data this extension can’t get for free">
        <div class="note">
          Bounce rate, visit duration, pages per visit and traffic sources for sites you don’t own come from paid
          panel data, so they aren’t shown here rather than being invented. Your own numbers above are real.
        </div>
      </Card>
    </>
  );
}
