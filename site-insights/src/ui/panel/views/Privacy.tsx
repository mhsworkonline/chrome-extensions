import { useMemo } from 'preact/hooks';
import type { PageResult, PrivacyResult } from '../../../shared/types';
import { consentToolsOf, exposureLevel, privacyFindings, trackersOf } from '../../../shared/checks';
import { Badge, Card, DataTable, Empty, FindingList, Skeleton, Tile } from '../../components/bits';

const TONE = { Low: 'good', Medium: 'warn', High: 'bad' } as const;

export function Privacy({ scan, privacy }: { scan: PageResult | null; privacy: PrivacyResult | null }) {
  const page = scan?.ok ? scan.analysis : null;
  const facts = privacy?.ok ? privacy.facts : null;
  const findings = useMemo(() => privacyFindings(page, facts), [page, facts]);

  if (scan === null || privacy === null) return <Skeleton h={260} />;
  if (!page && !facts) {
    return (
      <Card title="Privacy">
        <Empty title="Can’t check this page" body={privacy.ok ? 'The page scan failed.' : privacy.reason} />
      </Card>
    );
  }

  const trackers = page ? trackersOf(page) : [];
  const consent = page ? consentToolsOf(page) : [];
  const level = exposureLevel(findings);
  const cookies = facts?.cookies ?? [];

  return (
    <>
      <Card title="Privacy exposure" sub="What this page shares with other companies">
        <div class="row" style={{ gap: 14, marginBottom: 12 }}>
          <div class={`grade ${TONE[level]}`} style={{ fontSize: 15, width: 76 }}>{level}</div>
          <div class="muted small">
            Based on trackers, third-party requests and cookies. It describes the page, not a verdict on the site.
          </div>
        </div>
        <div class="grid-3">
          <Tile label="Trackers" value={page ? String(trackers.length) : '—'} />
          <Tile label="Other sites" value={facts ? String(facts.thirdPartyDomains.length) : '—'} />
          <Tile label="Cookies" value={facts ? String(cookies.length) : '—'} sub="this site" />
        </div>
      </Card>

      <Card title="Checks" sub="Problems first">
        <FindingList findings={findings} />
      </Card>

      {trackers.length > 0 && (
        <Card title="Trackers detected" sub={consent.length ? `Consent tool: ${consent[0].name}` : 'No consent tool detected'}>
          <div class="pills">
            {trackers.map((t) => (
              <span class="pill" key={t.name}>
                {t.name}
                <small>{t.category}</small>
              </span>
            ))}
          </div>
        </Card>
      )}

      {facts && (
        <Card title="Cookies on this site" sub="Names and flags only; values are never read">
          <DataTable
            rows={cookies}
            empty="This site hasn’t set any cookies in this browser."
            columns={[
              {
                header: 'Cookie',
                cell: (c) => (
                  <span title={c.domain}>
                    {c.name.slice(0, 24)}
                    {c.tracking && <> <Badge tone="warn">Tracking</Badge></>}
                  </span>
                ),
              },
              {
                header: 'Flags',
                cell: (c) => (
                  <span class="muted small">
                    {[c.secure ? 'Secure' : 'Not secure', c.httpOnly ? 'HttpOnly' : null, c.sameSite !== 'unspecified' ? c.sameSite : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ),
              },
              { header: 'Expires', num: true, cell: (c) => (c.session ? 'Session' : c.expiresInDays !== null ? `${c.expiresInDays}d` : '—') },
            ]}
          />
        </Card>
      )}

      {facts && facts.thirdPartyDomains.length > 0 && (
        <Card title="Other sites contacted" sub="Domains this page loads files from">
          <DataTable
            rows={facts.thirdPartyDomains}
            empty=""
            columns={[
              { header: 'Domain', cell: (d) => <span class="link">{d.domain}</span> },
              { header: 'Requests', num: true, cell: (d) => d.requests },
              { header: 'Cookies held', num: true, cell: (d) => d.cookies },
            ]}
          />
          <div class="muted small" style={{ marginTop: 8 }}>
            “Cookies held” counts cookies your browser stores for that domain, which may have come from any site that uses it.
          </div>
        </Card>
      )}

      {page && (
        <Card title="Browser storage" sub="Data this page keeps in your browser">
          <div class="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Tile label="localStorage keys" value={String(page.storage.local)} />
            <Tile label="sessionStorage keys" value={String(page.storage.session)} />
          </div>
        </Card>
      )}
    </>
  );
}
