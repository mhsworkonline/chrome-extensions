import { useMemo, useState } from 'preact/hooks';
import { clearVisits } from '../../../shared/db';
import { updateSettings } from '../../../shared/settings';
import {
  bySite,
  formatDuration,
  formatPercent,
  perDay,
  summarize,
} from '../../../shared/activity-stats';
import { Badge, Card, Chips, DataTable, Empty, Skeleton, Switch, type ChipOption } from '../../components/bits';
import { BarChart } from '../../components/charts';
import { useSettings, useVisits } from '../../hooks';

type Range = '7' | '30' | '90' | 'all';
const OPTIONS: ChipOption<Range>[] = [
  { value: '7', label: '7D' },
  { value: '30', label: '30D' },
  { value: '90', label: '3M' },
  { value: 'all', label: 'All' },
];
const DAY = 24 * 60 * 60 * 1000;

function Tile(props: { label: string; value: string }) {
  return (
    <div class="tile">
      <div class="kpi-label">{props.label}</div>
      <div class="kpi-value sm">{props.value}</div>
    </div>
  );
}

export function Activity({ isDark }: { isDark: boolean }) {
  const settings = useSettings();
  const [range, setRange] = useState<Range>('7');
  const [confirming, setConfirming] = useState(false);
  const all = useVisits(0);

  const since = useMemo(() => {
    if (range !== 'all') return Date.now() - (Number(range) - 1) * DAY;
    const first = (all ?? []).reduce((m, v) => Math.min(m, v.startedAt), Date.now());
    return first;
  }, [range, all]);

  const visits = useMemo(() => (all ?? []).filter((v) => v.startedAt >= startOfDay(since)), [all, since]);
  const summary = summarize(visits);
  const sites = useMemo(() => bySite(visits), [visits]);
  const days = useMemo(() => perDay(visits, startOfDay(since)), [visits, since]);

  if (!settings) return <Skeleton h={200} />;

  async function clear() {
    if (!confirming) return setConfirming(true);
    await clearVisits();
    setConfirming(false);
    location.reload();
  }

  return (
    <>
      <Card title="Track my browsing" sub="Visits, time on site and bounce rate" right={<Badge tone="neutral">Local only</Badge>}>
        <div class="row between">
          <div class="muted small" style={{ maxWidth: 270 }}>
            Saved on this device only. Nothing is uploaded. Time counts only while a tab is visible, focused and you’re
            not idle. A bounce is a single page view under 10 seconds.
          </div>
          <Switch
            checked={settings.trackActivity}
            label="Track my browsing"
            onChange={(v) => void updateSettings({ trackActivity: v })}
          />
        </div>
      </Card>

      {!settings.trackActivity && !(all && all.length) ? (
        <section class="card soon">
          <Empty title="Tracking is off" body="Turn it on to start building your own activity history." />
        </section>
      ) : (
        <>
          <Card title="Overview" right={<Chips options={OPTIONS} value={range} onChange={setRange} />}>
            <div class="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <Tile label="Sites" value={String(summary.sites)} />
              <Tile label="Visits" value={String(summary.visits)} />
              <Tile label="Active time" value={formatDuration(summary.activeMs)} />
              <Tile label="Bounce rate" value={formatPercent(summary.bounceRate)} />
            </div>
          </Card>

          <Card title="Active time per day" sub="Minutes">
            {summary.visits ? (
              <BarChart
                labels={days.labels}
                values={days.values}
                isDark={isDark}
                format={(v) => (v >= 60 ? `${(v / 60).toFixed(1)}h` : `${Math.round(v)}m`)}
              />
            ) : (
              <Empty title="No activity yet" body="Browse for a minute and check back." />
            )}
          </Card>

          <Card title="Top sites" sub="By active time">
            <DataTable
              rows={sites}
              empty="No sites in this range."
              columns={[
                { header: 'Site', cell: (r) => <span class="link">{r.domain}</span> },
                { header: 'Visits', num: true, cell: (r) => r.visits },
                { header: 'Time', num: true, cell: (r) => formatDuration(r.activeMs) },
                { header: 'Bounce', num: true, cell: (r) => formatPercent(r.bounceRate) },
              ]}
            />
          </Card>

          <button class="btn ghost" onClick={clear} onBlur={() => setConfirming(false)}>
            {confirming ? 'Click again to delete all activity data' : 'Clear activity data'}
          </button>
        </>
      )}
    </>
  );
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
