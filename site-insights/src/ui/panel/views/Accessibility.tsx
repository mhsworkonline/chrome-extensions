import { useMemo } from 'preact/hooks';
import type { PageResult, PerfResult } from '../../../shared/types';
import { a11yFindings, perfA11y } from '../../../shared/checks';
import { Card, Empty, FindingList, Gauge, Skeleton } from '../../components/bits';

const WEIGHT = { pass: 1, warn: 0.5, fail: 0 } as const;

export function Accessibility({ scan, perf }: { scan: PageResult | null; perf: PerfResult | null }) {
  const findings = useMemo(
    () => [
      ...(scan?.ok ? a11yFindings(scan.analysis.a11y) : []),
      ...(perf?.ok ? perfA11y(perf.analysis.checks) : []),
    ],
    [scan, perf],
  );

  if (scan === null || perf === null) return <Skeleton h={260} />;
  if (!scan.ok && !perf.ok) {
    return (
      <Card title="Accessibility">
        <Empty title="Can’t scan this page" body={scan.ok ? '' : scan.reason} />
      </Card>
    );
  }

  const score = findings.length ? Math.round((findings.reduce((n, f) => n + WEIGHT[f.status], 0) / findings.length) * 100) : 0;
  const samples = scan.ok ? scan.analysis.a11y.worst : [];

  return (
    <>
      <Card title="Accessibility" sub="Automated checks catch only part of what matters; they don’t replace testing with real users">
        <div class="gauge-wrap">
          <Gauge value={score} />
          <div class="muted small">
            {findings.filter((f) => f.status !== 'pass').length} of {findings.length} checks need attention.
          </div>
        </div>
      </Card>

      <Card title="Checks" sub="Problems first">
        <FindingList findings={findings} />
      </Card>

      {samples.length > 0 && (
        <Card title="Lowest contrast text" sub="WCAG AA needs 4.5 : 1 (3 : 1 for large text)">
          <div class="stack">
            {samples.map((s, i) => (
              <div class="row between" key={i}>
                <span style={{ background: s.bg, color: s.fg, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.text}
                </span>
                <span class="muted small">
                  {s.fg} on {s.bg} · {s.ratio} : 1
                </span>
              </div>
            ))}
          </div>
          <div class="muted small" style={{ marginTop: 10 }}>
            Approximate: text over images or gradients can’t be measured.
          </div>
        </Card>
      )}
    </>
  );
}
