import { useEffect, useState } from 'preact/hooks';
import type { PsiResult } from '../../../shared/types';
import { cachedPsi, PsiError, runPsi } from '../../../sources/psi';
import { Badge, Card, Chips, Gauge, type ChipOption } from '../../components/bits';
import { useSettings } from '../../hooks';

type Strategy = PsiResult['strategy'];
const STRATEGIES: ChipOption<Strategy>[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
];

const tone = (category: string) =>
  category === 'FAST' ? 'good' : category === 'AVERAGE' ? 'warn' : category === 'SLOW' ? 'bad' : 'neutral';
const toneLabel = (category: string) =>
  category === 'FAST' ? 'Good' : category === 'AVERAGE' ? 'Needs work' : category === 'SLOW' ? 'Poor' : '—';

const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Official Lighthouse run through Google PageSpeed Insights. Only runs when the user clicks. */
export function Lighthouse({ url, onOpenSettings }: { url: string; onOpenSettings: () => void }) {
  const settings = useSettings();
  const [strategy, setStrategy] = useState<Strategy>('mobile');
  const [result, setResult] = useState<PsiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PsiError | null>(null);

  // A recent run for the same page is shown straight away so a re-open doesn't cost quota.
  useEffect(() => {
    let stale = false;
    setResult(null);
    setError(null);
    void cachedPsi(url, strategy).then((r) => !stale && setResult(r));
    return () => {
      stale = true;
    };
  }, [url, strategy]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await runPsi(url, strategy, settings?.googleApiKey ?? ''));
    } catch (e) {
      setError(e instanceof PsiError ? e : new PsiError('Something went wrong.', 'other'));
    } finally {
      setBusy(false);
    }
  }

  const hasKey = !!settings?.googleApiKey;

  return (
    <Card
      title="Full Lighthouse"
      sub="Official scores from Google PageSpeed Insights"
      right={<Chips options={STRATEGIES} value={strategy} onChange={setStrategy} />}
    >
      <div class="stack">
        <div class="note">
          Clicking Run sends this page’s address to Google, who run Lighthouse on their servers (10 to 40 seconds). Pages
          behind a login can’t be tested.
          {!hasKey && ' A free Google API key is needed in practice, because the shared anonymous quota is usually used up.'}
        </div>

        <div class="row">
          <button class="btn primary" onClick={run} disabled={busy}>
            {busy ? 'Running Lighthouse…' : result ? 'Run again' : 'Run full Lighthouse'}
          </button>
          {!hasKey && (
            <button class="btn ghost" onClick={onOpenSettings}>
              Add API key
            </button>
          )}
        </div>

        {error && (
          <div class="error-text">
            {error.message}{' '}
            {(error.kind === 'quota' || error.kind === 'key') && (
              <button class="link" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={onOpenSettings}>
                Open Settings
              </button>
            )}
          </div>
        )}

        {result && (
          <>
            <div class="row between muted small">
              <span>{result.strategy === 'mobile' ? 'Mobile' : 'Desktop'} · {ago(result.fetchedAt)}</span>
              <Badge tone="neutral">Google</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center' }}>
              {(
                [
                  ['Performance', result.scores.performance],
                  ['Accessibility', result.scores.accessibility],
                  ['Best practices', result.scores.bestPractices],
                  ['SEO', result.scores.seo],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  {value === null ? <div class="muted" style={{ height: 72, lineHeight: '72px' }}>—</div> : <Gauge value={value} size={72} />}
                  <div class="muted small">{label}</div>
                </div>
              ))}
            </div>

            <table class="table">
              <tbody>
                {result.lab.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td class="num">
                      <strong>{m.display}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.opportunities.length > 0 && (
              <div>
                <div class="kpi-label" style={{ marginBottom: 6 }}>Biggest opportunities</div>
                <div class="stack" style={{ gap: 6 }}>
                  {result.opportunities.map((o) => (
                    <div class="row between" key={o.title}>
                      <span>{o.title}</span>
                      <Badge tone="warn">−{(o.savingsMs / 1000).toFixed(1)} s</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.field ? (
              <div>
                <div class="row between" style={{ marginBottom: 6 }}>
                  <span class="kpi-label">Real-user data (Chrome UX Report)</span>
                  <Badge tone={tone(result.field.overall ?? '')}>{toneLabel(result.field.overall ?? '')}</Badge>
                </div>
                <div class="muted small" style={{ marginBottom: 6 }}>
                  {result.field.scope === 'url' ? 'This page, last 28 days.' : 'Whole site, because this page has too little data.'}
                </div>
                <div class="pills">
                  {result.field.metrics.map((m) => (
                    <span class="pill" key={m.label}>
                      {m.label} <strong>{m.display}</strong>
                      <Badge tone={tone(m.category)}>{toneLabel(m.category)}</Badge>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div class="muted small">Not enough real-user traffic for field data on this page.</div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
