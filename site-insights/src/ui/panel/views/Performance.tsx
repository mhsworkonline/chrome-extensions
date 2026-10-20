import { useMemo, useState } from 'preact/hooks';
import type { PerfCheck, PerfPoint, PerfResult, SiteResult } from '../../../shared/types';
import { formatBytes, formatMs, rate, type Rating } from '../../../shared/perf';
import { Badge, Card, DataTable, Empty, Skeleton } from '../../components/bits';
import { DonutChart, PALETTE, TrendChart } from '../../components/charts';
import { perfKey } from '../../../shared/history';
import { useStored } from '../../hooks';

const RATING_LABEL: Record<Rating, string> = { good: 'Good', warn: 'Needs work', bad: 'Poor' };
const MARK = { pass: '✓', warn: '!', fail: '✕' } as const;

function Metric(props: { label: string; value: string; rating: Rating | null; hint?: string }) {
  return (
    <div class="tile">
      <div class="kpi-label">{props.label}</div>
      <div class="kpi-value sm">{props.value}</div>
      {props.rating ? (
        <Badge tone={props.rating}>{RATING_LABEL[props.rating]}</Badge>
      ) : (
        <span class="muted small">{props.hint}</span>
      )}
    </div>
  );
}

const shortName = (url: string) => {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last).slice(0, 38) : u.hostname;
  } catch {
    return url.slice(0, 38);
  }
};

function CheckList({ checks }: { checks: PerfCheck[] }) {
  const groups = ['Performance', 'Best practices'] as const;
  const [showPassed, setShowPassed] = useState(false);
  const passed = checks.filter((c) => c.status === 'pass').length;
  return (
    <>
      {groups.map((g) => {
        const all = checks.filter((c) => c.group === g);
        const issues = all.filter((c) => c.status !== 'pass').length;
        const items = showPassed ? all : all.filter((c) => c.status !== 'pass');
        return (
          <div class="tech-group" key={g}>
            <h3>
              {g} · {issues ? `${issues} to review` : 'all clear'}
            </h3>
            <div class="stack">
              {items.map((c) => (
                <div class="check" key={c.label}>
                  <span class={`dot ${c.status}`}>{MARK[c.status]}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.label}</div>
                    <div class="muted small" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {passed > 0 && (
        <button class="btn ghost" style={{ marginTop: 12 }} onClick={() => setShowPassed(!showPassed)}>
          {showPassed ? 'Hide passed checks' : `Show ${passed} passed checks`}
        </button>
      )}
    </>
  );
}

export function Performance(props: {
  site: Extract<SiteResult, { ok: true }>;
  perf: PerfResult | null;
  isDark: boolean;
  onRemeasure: () => void;
}) {
  const { perf } = props;
  const readings = useStored<PerfPoint[]>(perfKey(props.site.domain), []);
  const lcpTrend = useMemo(
    () =>
      readings
        .filter((r) => r.lcp !== null)
        .map((r) => ({ label: new Date(r.ts).toISOString().slice(5, 10), value: r.lcp as number })),
    [readings],
  );
  const slices = useMemo(
    () => (perf?.ok ? perf.analysis.byType.filter((t) => t.bytes > 0).map((t) => ({ label: t.type, value: t.bytes })) : []),
    [perf],
  );

  if (!perf) return <Skeleton h={260} />;
  if (!perf.ok) {
    return (
      <Card title="Page speed">
        <Empty title="Can’t measure this page" body={perf.reason} />
      </Card>
    );
  }

  const a = perf.analysis;
  const f = a.facts;

  return (
    <>
      <Card
        title="Page speed"
        sub="Measured in this browser, not throttled"
        right={
          <button class="btn ghost" onClick={props.onRemeasure}>
            Re-measure
          </button>
        }
      >
        <div class="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <Metric label="Largest Contentful Paint" value={f.lcp === null ? '—' : formatMs(f.lcp)} rating={rate('lcp', f.lcp)} hint="Not recorded" />
          <Metric label="First Contentful Paint" value={f.fcp === null ? '—' : formatMs(f.fcp)} rating={rate('fcp', f.fcp)} hint="Not recorded" />
          <Metric label="Layout shift (CLS)" value={f.cls === null ? '—' : f.cls.toFixed(3)} rating={rate('cls', f.cls)} hint="Not recorded" />
          <Metric label="Interaction (INP)" value={f.inp === null ? '—' : formatMs(f.inp)} rating={rate('inp', f.inp)} hint="Click or type, then re-measure" />
          <Metric label="Server response (TTFB)" value={f.ttfb === null ? '—' : formatMs(f.ttfb)} rating={rate('ttfb', f.ttfb)} hint="Not recorded" />
          <Metric label="Fully loaded" value={f.load === null ? '—' : formatMs(f.load)} rating={null} hint="Still loading" />
        </div>
        <div class="note" style={{ marginTop: 12 }}>
          These are real timings from your connection and device, so they differ from Lighthouse scores, which simulate
          a throttled phone. Reload the page, then re-measure, for a fresh reading. A page that loaded in a background tab
          reports very late paint times, so reload it in the foreground first.
        </div>
      </Card>

      {lcpTrend.length >= 2 && (
        <Card title="Your measurements over time" sub={`Largest Contentful Paint · ${lcpTrend.length} readings in this browser`}>
          <TrendChart points={lcpTrend} isDark={props.isDark} format={formatMs} />
        </Card>
      )}

      <Card title="Page weight" sub={`${a.requests} requests`}>
        <div class="row" style={{ marginBottom: 8 }}>
          <span class="kpi-value">{formatBytes(a.totalBytes)}</span>
          <span class="muted small">transferred</span>
        </div>
        {slices.length > 0 && (
          <>
            <DonutChart slices={slices} isDark={props.isDark} />
            <div class="legend">
              {a.byType
                .filter((t) => t.bytes > 0)
                .map((t, i) => (
                  <span key={t.type}>
                    <i style={{ background: PALETTE[i % PALETTE.length] }} />
                    {t.type} · {formatBytes(t.bytes)}
                  </span>
                ))}
            </div>
          </>
        )}
        {a.unknownSizeRequests > 0 && (
          <div class="note" style={{ marginTop: 12 }}>
            {a.unknownSizeRequests} cross-origin files don’t report their size to the browser, so the real total is
            higher than shown.
          </div>
        )}
      </Card>

      <Card title="Heaviest files" sub="Largest transfers first">
        <DataTable
          rows={a.heaviest}
          empty="No resource data."
          columns={[
            { header: 'File', cell: (r) => <span title={r.url}>{shortName(r.url)}</span> },
            { header: 'Type', cell: (r) => <span class="muted">{r.type}</span> },
            { header: 'Size', num: true, cell: (r) => (r.bytes ? formatBytes(r.bytes) : '—') },
            { header: 'Time', num: true, cell: (r) => formatMs(r.durationMs) },
          ]}
        />
      </Card>

      <Card title="Third parties" sub="Requests to other sites">
        <DataTable
          rows={a.thirdParties}
          empty="No third-party requests."
          columns={[
            { header: 'Domain', cell: (r) => <span class="link">{r.domain}</span> },
            { header: 'Requests', num: true, cell: (r) => r.requests },
            { header: 'Size', num: true, cell: (r) => (r.bytes ? formatBytes(r.bytes) : '—') },
          ]}
        />
      </Card>

      <Card title="Checks" sub="Performance and best practices on this page">
        <CheckList checks={a.checks} />
      </Card>

    </>
  );
}
