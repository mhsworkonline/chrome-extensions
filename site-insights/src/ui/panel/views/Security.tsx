import type { SecurityResult } from '../../../shared/types';
import { Badge, Card, DataTable, Empty, FindingList, Skeleton } from '../../components/bits';

const GRADE_TONE = { A: 'good', B: 'good', C: 'warn', D: 'bad', F: 'bad' } as const;

export function Security({ security }: { security: SecurityResult | null }) {
  if (!security) return <Skeleton h={260} />;
  if (!security.ok) {
    return (
      <Card title="Security headers">
        <Empty title="Can’t check this site" body={security.reason} />
      </Card>
    );
  }

  const a = security.analysis;
  const { server } = a;
  const nothingKnown = !server.software && !server.poweredBy && server.platforms.length === 0;

  return (
    <>
      <Card title="Security headers" sub="Read from the site’s own response">
        <div class="row" style={{ gap: 14 }}>
          <div class={`grade ${GRADE_TONE[a.grade]}`}>{a.grade}</div>
          <div>
            <div class="kpi-value sm">{a.score} / 100</div>
            <div class="muted small">
              {a.checks.filter((c) => c.status !== 'pass').length} of {a.checks.length} checks need attention
            </div>
          </div>
        </div>
      </Card>

      <Card title="Checks" sub="Problems first">
        <FindingList findings={a.checks} />
      </Card>

      <Card title="Server and hosting" sub="Clues from the response headers">
        {nothingKnown ? (
          <div class="muted">The site doesn’t reveal its server or platform.</div>
        ) : (
          <div class="stack">
            {server.platforms.length > 0 && (
              <div>
                <div class="kpi-label" style={{ marginBottom: 6 }}>Platform and CDN</div>
                <div class="pills">
                  {server.platforms.map((p) => (
                    <span class="pill" key={p}>{p}</span>
                  ))}
                </div>
              </div>
            )}
            {server.software && (
              <div class="row between">
                <span class="muted">Server software</span>
                <Badge tone="neutral">{server.software}</Badge>
              </div>
            )}
            {server.poweredBy && (
              <div class="row between">
                <span class="muted">Powered by</span>
                <Badge tone="neutral">{server.poweredBy}</Badge>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Response headers" sub={`HTTP ${a.status}`}>
        <DataTable
          rows={a.headers}
          empty="No notable headers."
          pageSize={6}
          columns={[
            { header: 'Header', cell: (h) => <strong>{h.name}</strong> },
            { header: 'Value', cell: (h) => <span class="muted small" style={{ overflowWrap: 'anywhere' }}>{h.value}</span> },
          ]}
        />
      </Card>
    </>
  );
}
