import type { SitemapResult } from '../../../shared/types';
import { BarList, Card, Empty, Skeleton, Tile } from '../../components/bits';

export function Sitemap({ sitemap }: { sitemap: SitemapResult | null }) {
  if (!sitemap) return <Skeleton h={260} />;
  if (!sitemap.ok) {
    return (
      <Card title="Sitemap">
        <Empty title="No sitemap found" body={sitemap.reason} />
      </Card>
    );
  }

  const a = sitemap.analysis;
  const pct = a.urlCount ? Math.round((a.withLastmod / a.urlCount) * 100) : 0;

  return (
    <>
      <Card title="Sitemap" sub={a.isIndex ? 'Sitemap index with child sitemaps' : 'Single sitemap'}>
        <div class="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <Tile label="Pages listed" value={a.urlCount.toLocaleString()} sub={a.truncated ? 'at least' : undefined} />
          <Tile label="Sitemap files" value={String(a.sitemapCount)} />
          <Tile label="With last-modified" value={`${pct}%`} />
          <Tile label="Newest update" value={a.newest ?? '—'} sub={a.oldest ? `oldest ${a.oldest}` : undefined} />
        </div>
      </Card>

      {a.problems.length > 0 && (
        <Card title="Things to check">
          <div class="stack">
            {a.problems.map((p) => (
              <div class="check" key={p}>
                <span class="dot warn">!</span>
                <div>{p}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Where the pages are" sub="By first folder in the address">
        <BarList rows={a.sections.map((s) => ({ label: s.path, value: s.count, note: s.count.toLocaleString() }))} />
      </Card>

      <Card title="Sample pages" sub="First in the list">
        <div class="stack small">
          {a.sample.map((u) => (
            <div key={u} class="muted" style={{ overflowWrap: 'anywhere' }}>{u}</div>
          ))}
        </div>
        <div class="muted small" style={{ marginTop: 10 }}>
          Read from {a.sources.length} source{a.sources.length === 1 ? '' : 's'}: {a.sources.map((s) => new URL(s).pathname).join(', ')}
        </div>
      </Card>
    </>
  );
}
