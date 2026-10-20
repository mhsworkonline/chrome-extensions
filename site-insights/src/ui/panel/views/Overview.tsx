import { useMemo } from 'preact/hooks';
import type { PageResult, PerfResult, PrivacyResult, SecurityResult, SiteResult } from '../../../shared/types';
import { estimateVisits, formatRange } from '../../../shared/estimate';
import { exposureLevel, privacyFindings, trackersOf } from '../../../shared/checks';
import { collectIssues } from '../../../shared/issues';
import { rate, formatMs, type Rating } from '../../../shared/perf';
import { runSeoChecks, seoScore } from '../../../shared/seo-score';
import { Badge, Card, Empty, Skeleton } from '../../components/bits';
import { useRankHistory } from '../../hooks';
import type { Go } from '../nav';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

function ScoreTile(props: {
  label: string;
  value?: string;
  sub?: string;
  tone?: Tone;
  badge?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button class="score-tile" onClick={props.onClick}>
      <div class="row between">
        <span class="kpi-label">{props.label}</span>
        {props.badge && <Badge tone="warn">{props.badge}</Badge>}
      </div>
      {props.loading ? (
        <div class="skeleton" style={{ height: 28, width: '70%', margin: '6px 0 4px' }} />
      ) : (
        <div class={`score-value tone-${props.tone ?? 'neutral'}`}>{props.value ?? '—'}</div>
      )}
      <div class="muted small">{props.loading ? ' ' : props.sub}</div>
    </button>
  );
}

const worstOf = (ratings: Rating[]): Tone => (ratings.includes('bad') ? 'bad' : ratings.includes('warn') ? 'warn' : 'good');
const LEVEL_TONE: Record<'Low' | 'Medium' | 'High', Tone> = { Low: 'good', Medium: 'warn', High: 'bad' };
const GRADE_TONE: Record<string, Tone> = { A: 'good', B: 'good', C: 'warn', D: 'bad', F: 'bad' };

export function Overview(props: {
  site: Extract<SiteResult, { ok: true }>;
  scan: PageResult | null;
  perf: PerfResult | null;
  security: SecurityResult | null;
  privacy: PrivacyResult | null;
  onGo: Go;
}) {
  const { site, scan, perf, security, privacy, onGo } = props;
  const issues = useMemo(() => collectIssues({ scan, perf, security, privacy }), [scan, perf, security, privacy]);

  // ----- tile data -----
  const history = useRankHistory(site);
  const latest = history[history.length - 1];
  const est = latest ? estimateVisits(latest.rank) : null;

  const seoChecks = scan?.ok ? runSeoChecks(scan.analysis) : null;
  const seo = seoChecks ? seoScore(seoChecks) : null;
  const seoIssues = seoChecks ? seoChecks.filter((c) => c.status !== 'pass').length : 0;

  const facts = perf?.ok ? perf.analysis.facts : null;
  const ratings = facts
    ? ([rate('lcp', facts.lcp), rate('fcp', facts.fcp), rate('cls', facts.cls), rate('ttfb', facts.ttfb)].filter(Boolean) as Rating[])
    : [];
  const goodCount = ratings.filter((r) => r === 'good').length;

  const tech = scan?.ok ? scan.analysis.tech : null;
  const sec = security?.ok ? security.analysis : null;
  const priv = scan?.ok || privacy?.ok ? privacyFindings(scan?.ok ? scan.analysis : null, privacy?.ok ? privacy.facts : null) : null;
  const level = priv ? exposureLevel(priv) : null;

  const scanFailed = scan !== null && !scan.ok;
  const perfFailed = perf !== null && !perf.ok;
  const allDone = scan !== null && perf !== null && security !== null && privacy !== null;
  const nothingWorked = scanFailed && perfFailed && security !== null && !security.ok;

  return (
    <>
      <div class="score-grid">
        <ScoreTile
          label="Traffic"
          value={est ? formatRange(est) : 'Not ranked'}
          sub={est ? `Est. visits / month · rank #${latest.rank.toLocaleString()}` : 'Not in the top 1 million'}
          badge={est ? 'Estimated' : undefined}
          onClick={() => onGo('Traffic', est ? 'Visits' : 'Rank')}
        />
        <ScoreTile
          label="Speed"
          loading={perf === null}
          value={perfFailed || !ratings.length ? '—' : `${goodCount} of ${ratings.length} good`}
          sub={perfFailed ? 'Can’t measure this page' : facts?.lcp != null ? `LCP ${formatMs(facts.lcp)}` : 'Core web vitals'}
          tone={ratings.length ? worstOf(ratings) : 'neutral'}
          onClick={() => onGo('Site health', 'Speed')}
        />
        <ScoreTile
          label="SEO"
          loading={scan === null}
          value={seo === null ? '—' : `${seo} / 100`}
          sub={scanFailed ? 'Can’t scan this page' : seoIssues ? `${seoIssues} to improve` : 'All checks pass'}
          tone={seo === null ? 'neutral' : seo >= 80 ? 'good' : seo >= 50 ? 'warn' : 'bad'}
          onClick={() => onGo('Site health', 'SEO')}
        />
        <ScoreTile
          label="Security"
          loading={security === null}
          value={sec ? `Grade ${sec.grade}` : '—'}
          sub={security && !security.ok ? 'Couldn’t check headers' : sec ? `${sec.checks.filter((c) => c.status !== 'pass').length} to review` : undefined}
          tone={sec ? GRADE_TONE[sec.grade] : 'neutral'}
          onClick={() => onGo('Tech & security', 'Security')}
        />
        <ScoreTile
          label="Privacy"
          loading={scan === null || privacy === null}
          value={level ? `${level} exposure` : '—'}
          sub={scan?.ok ? `${trackersOf(scan.analysis).length} trackers${privacy?.ok ? ` · ${privacy.facts.thirdPartyDomains.length} other sites` : ''}` : 'Can’t check this page'}
          tone={level ? LEVEL_TONE[level] : 'neutral'}
          onClick={() => onGo('Tech & security', 'Privacy')}
        />
        <ScoreTile
          label="Technology"
          loading={scan === null}
          value={tech ? `${tech.length} detected` : '—'}
          sub={scanFailed ? 'Can’t scan this page' : tech?.slice(0, 3).map((t) => t.name).join(', ') || 'Nothing recognised'}
          onClick={() => onGo('Tech & security', 'Tech')}
        />
      </div>

      <Card
        title="Top things to fix"
        sub={issues.length ? `${issues.length} found across security, privacy, SEO, speed, accessibility and content` : undefined}
      >
        {!allDone && issues.length === 0 ? (
          <div class="stack">
            <Skeleton h={34} />
            <Skeleton h={34} />
            <Skeleton h={34} />
          </div>
        ) : issues.length === 0 ? (
          <Empty
            title={nothingWorked ? 'Nothing to check on this page' : 'No issues found'}
            body={nothingWorked ? 'Chrome doesn’t allow scanning this kind of page.' : 'Every check passed.'}
          />
        ) : (
          <div class="stack" style={{ gap: 4 }}>
            {issues.slice(0, 6).map((i) => (
              <button class="issue" key={`${i.area}:${i.label}`} onClick={() => onGo(i.tab, i.sub)}>
                <span class={`dot ${i.status}`}>{i.status === 'fail' ? '✕' : '!'}</span>
                <span class="issue-text">
                  <span style={{ fontWeight: 600 }}>{i.label}</span>
                  <span class="muted small">{i.detail}</span>
                </span>
                <Badge tone="neutral">{i.area}</Badge>
              </button>
            ))}
            {issues.length > 6 && (
              <div class="muted small" style={{ padding: '6px 8px' }}>
                {issues.length - 6} more, listed in each section.
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
