import type { PageResult } from '../../../shared/types';
import { BarList, Card, Empty, Skeleton, Swatch } from '../../components/bits';

export function Design({ scan }: { scan: PageResult | null }) {
  if (!scan) return <Skeleton h={260} />;
  if (!scan.ok) {
    return (
      <Card title="Design">
        <Empty title="Can’t scan this page" body={scan.reason} />
      </Card>
    );
  }
  const d = scan.analysis.design;

  return (
    <>
      <Card title="Fonts" sub="Families used for text, by number of elements">
        {d.fonts.length ? (
          <BarList
            rows={d.fonts.map((f) => ({ label: f.family, value: f.count, note: f.webFont ? `${f.count} · web font` : String(f.count) }))}
          />
        ) : (
          <div class="muted">No text found.</div>
        )}
      </Card>

      <Card title="Text sizes" sub="In pixels">
        <div class="pills">
          {d.sizes.map((s) => (
            <span class="pill" key={s.px}>
              {s.px}px
              <small>{s.count}</small>
            </span>
          ))}
        </div>
      </Card>

      <Card title="Text colours" sub="Click a colour to copy it">
        <div class="swatches">
          {d.textColors.map((c) => (
            <Swatch key={c.hex} hex={c.hex} count={c.count} />
          ))}
        </div>
      </Card>

      <Card title="Background colours">
        <div class="swatches">
          {d.backgrounds.length ? d.backgrounds.map((c) => <Swatch key={c.hex} hex={c.hex} count={c.count} />) : <span class="muted">No solid backgrounds.</span>}
        </div>
      </Card>
    </>
  );
}
