import { useMemo, useState } from 'preact/hooks';
import type { PageResult } from '../../../shared/types';
import { runSeoChecks, seoScore } from '../../../shared/seo-score';
import { Badge, Card, Empty, Gauge, Skeleton } from '../../components/bits';

const MARK = { pass: '✓', warn: '!', fail: '✕' } as const;

function Stat(props: { label: string; value: string | number }) {
  return (
    <div class="tile">
      <div class="kpi-label">{props.label}</div>
      <div class="kpi-value sm">{typeof props.value === 'number' ? props.value.toLocaleString() : props.value}</div>
    </div>
  );
}

export function Seo(props: { scan: PageResult | null; onRescan: () => void }) {
  const { scan } = props;
  const checks = useMemo(() => (scan?.ok ? runSeoChecks(scan.analysis) : []), [scan]);
  const [showPassed, setShowPassed] = useState(false);

  if (!scan) return <Skeleton h={260} />;
  if (!scan.ok) {
    return (
      <Card title="On-page SEO">
        <Empty title="Can’t scan this page" body={scan.reason} />
      </Card>
    );
  }

  const { seo } = scan.analysis;
  const score = seoScore(checks);
  const count = (s: 'pass' | 'warn' | 'fail') => checks.filter((c) => c.status === s).length;

  return (
    <>
      <Card
        title="On-page SEO"
        sub="This page only, not the whole site"
        right={
          <button class="btn ghost" onClick={props.onRescan}>
            Re-scan
          </button>
        }
      >
        <div class="gauge-wrap">
          <Gauge value={score} />
          <div class="stack" style={{ gap: 6 }}>
            <div class="row"><Badge tone="good">{count('pass')} passed</Badge></div>
            <div class="row"><Badge tone="warn">{count('warn')} to improve</Badge></div>
            <div class="row"><Badge tone="bad">{count('fail')} failing</Badge></div>
          </div>
        </div>
      </Card>

      <Card title="Checks" sub={checks.some((c) => c.status !== 'pass') ? 'Problems first' : 'Everything passes'}>
        <div class="stack">
          {checks.filter((c) => showPassed || c.status !== 'pass').map((c) => (
            <div class="check" key={c.label}>
              <span class={`dot ${c.status}`}>{MARK[c.status]}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{c.label}</div>
                <div class="muted small" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div>
              </div>
            </div>
          ))}
          {count('pass') > 0 && (
            <button class="btn ghost" onClick={() => setShowPassed(!showPassed)}>
              {showPassed ? 'Hide passed checks' : `Show ${count('pass')} passed checks`}
            </button>
          )}
        </div>
      </Card>

      <div class="grid-3">
        <Stat label="Words" value={seo.wordCount} />
        <Stat label="Internal links" value={seo.links.internal} />
        <Stat label="External links" value={seo.links.external} />
      </div>

      <Card title="Headings">
        <div class="pills" style={{ marginBottom: seo.h1Texts.length ? 10 : 0 }}>
          {(Object.keys(seo.headings) as (keyof typeof seo.headings)[]).map((h) => (
            <span class="pill" key={h}>
              {h.toUpperCase()}
              <small>{seo.headings[h]}</small>
            </span>
          ))}
        </div>
        {seo.h1Texts.map((t) => (
          <div class="muted small" key={t}>“{t}”</div>
        ))}
      </Card>

      {scan.analysis.jsonLd.length > 0 && (
        <Card title="Structured data" sub={`${scan.analysis.jsonLd.length} JSON-LD block${scan.analysis.jsonLd.length > 1 ? 's' : ''}`}>
          <div class="stack">
            {scan.analysis.jsonLd.map((b, i) => (
              <details class="fold" key={i}>
                <summary>{b.type}</summary>
                <pre>{b.json}</pre>
              </details>
            ))}
          </div>
        </Card>
      )}

      {(seo.og.title || seo.og.image) && (
        <Card title="Link preview" sub="How the page looks when shared">
          <div class="tile" style={{ padding: 0, overflow: 'hidden', boxShadow: 'none' }}>
            {seo.og.image && (
              <img
                src={seo.og.image}
                alt=""
                referrerpolicy="no-referrer"
                style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }}
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 650 }}>{seo.og.title ?? seo.title}</div>
              {seo.og.description && <div class="muted small">{seo.og.description}</div>}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
