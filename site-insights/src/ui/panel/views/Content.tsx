import { useMemo } from 'preact/hooks';
import type { PageResult } from '../../../shared/types';
import { contentFindings, readingLevel } from '../../../shared/checks';
import { formatBytes } from '../../../shared/perf';
import { BarList, Card, DataTable, Empty, FindingList, Skeleton, Tile } from '../../components/bits';

const MODERN = new Set(['webp', 'avif', 'svg']);

const shortName = (src: string) => {
  try {
    const u = new URL(src);
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? u.hostname).slice(0, 34);
  } catch {
    return src.slice(0, 34);
  }
};

export function Content({ scan }: { scan: PageResult | null }) {
  const analysis = scan?.ok ? scan.analysis : null;
  const findings = useMemo(() => (analysis ? contentFindings(analysis.content) : []), [analysis]);
  const formats = useMemo(() => {
    const m = new Map<string, number>();
    analysis?.images.forEach((i) => m.set(i.format, (m.get(i.format) ?? 0) + 1));
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [analysis]);

  if (!scan) return <Skeleton h={260} />;
  if (!analysis) {
    return (
      <Card title="Content">
        <Empty title="Can’t scan this page" body={scan.ok ? '' : scan.reason} />
      </Card>
    );
  }

  const c = analysis.content;
  const { images, contacts } = analysis;
  const modern = images.filter((i) => MODERN.has(i.format)).length;
  const oversized = images.filter((i) => i.displayW > 0 && i.naturalW > i.displayW * 2.5).length;
  const noAlt = images.filter((i) => i.alt === null).length;

  return (
    <>
      <Card title="Readability" sub="Main text of this page, without menus and footers">
        <div class="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <Tile label="Words" value={c.words.toLocaleString()} sub={`${c.paragraphs} paragraphs`} />
          <Tile label="Reading time" value={`${c.readingMinutes} min`} />
          <Tile
            label="Reading ease"
            value={c.fleschEase !== null ? String(Math.round(c.fleschEase)) : '—'}
            sub={c.fleschEase !== null ? readingLevel(c.fleschEase) : 'English text of 100+ words only'}
          />
          <Tile label="Sentence length" value={c.avgSentenceWords ? `${c.avgSentenceWords.toFixed(1)} words` : '—'} sub={`${c.longSentences} over 25 words`} />
        </div>
        <div class="muted small" style={{ marginTop: 10 }}>
          Text makes up {(c.textToHtmlRatio * 100).toFixed(0)}% of the page’s HTML.
        </div>
      </Card>

      <Card title="Checks" sub="Problems first">
        <FindingList findings={findings} />
      </Card>

      <Card title="Top keywords" sub="Most repeated meaningful words, as % of all words">
        {c.keywords.length ? (
          <BarList rows={c.keywords.map((k) => ({ label: k.term, value: k.count, note: `${k.count} · ${k.density}%` }))} />
        ) : (
          <div class="muted">Not enough repeated words to list.</div>
        )}
        {c.phrases.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div class="kpi-label" style={{ marginBottom: 6 }}>Common phrases</div>
            <div class="pills">
              {c.phrases.map((p) => (
                <span class="pill" key={p.term}>
                  {p.term}
                  <small>{p.count}</small>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="Heading outline" sub={`${c.outline.length} headings`}>
        {c.outline.length ? (
          c.outline.map((h, i) => (
            <div class="outline-item" key={i} style={{ paddingLeft: (h.level - 1) * 14 }}>
              <span class="lvl">H{h.level}</span>
              {h.text}
            </div>
          ))
        ) : (
          <div class="muted">No headings on this page.</div>
        )}
      </Card>

      <Card title="Images" sub={`${images.length} on this page`}>
        {images.length === 0 ? (
          <div class="muted">No images found.</div>
        ) : (
          <div class="stack">
            <div class="grid-3">
              <Tile label="Modern format" value={`${modern}/${images.length}`} sub="WebP, AVIF, SVG" />
              <Tile label="Oversized" value={String(oversized)} sub="2.5× larger than shown" />
              <Tile label="No alt" value={String(noAlt)} />
            </div>
            <BarList rows={formats.map((f) => ({ label: f.label.toUpperCase(), value: f.value }))} />
            <DataTable
              rows={images}
              empty=""
              columns={[
                { header: 'Image', cell: (i) => <span title={i.src}>{shortName(i.src)}</span> },
                { header: 'Shown', num: true, cell: (i) => (i.displayW ? `${i.displayW}×${i.displayH}` : '—') },
                { header: 'File', num: true, cell: (i) => `${i.naturalW}×${i.naturalH}` },
                { header: 'Size', num: true, cell: (i) => (i.bytes ? formatBytes(i.bytes) : '—') },
              ]}
            />
          </div>
        )}
      </Card>

      <Card title="Contacts and social links" sub="Found on this page">
        {contacts.emails.length + contacts.phones.length + contacts.socials.length === 0 ? (
          <div class="muted">No emails, phone numbers or social profiles on this page.</div>
        ) : (
          <div class="stack">
            {contacts.emails.length > 0 && (
              <div>
                <div class="kpi-label" style={{ marginBottom: 6 }}>Emails</div>
                <div class="pills">{contacts.emails.map((e) => <span class="pill" key={e}>{e}</span>)}</div>
              </div>
            )}
            {contacts.phones.length > 0 && (
              <div>
                <div class="kpi-label" style={{ marginBottom: 6 }}>Phone numbers</div>
                <div class="pills">{contacts.phones.map((p) => <span class="pill" key={p}>{p}</span>)}</div>
              </div>
            )}
            {contacts.socials.length > 0 && (
              <div>
                <div class="kpi-label" style={{ marginBottom: 6 }}>Social profiles</div>
                <div class="pills">
                  {contacts.socials.map((s) => (
                    <span class="pill" key={s.network} title={s.url}>{s.network}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
