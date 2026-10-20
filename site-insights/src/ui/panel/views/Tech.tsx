import { useMemo } from 'preact/hooks';
import type { PageResult, TechHit } from '../../../shared/types';
import { Card, Empty, Skeleton } from '../../components/bits';
import { DonutChart, PALETTE } from '../../components/charts';

const VIA: Record<TechHit['via'], string> = {
  script: 'script',
  global: 'JS global',
  meta: 'meta tag',
  dom: 'page markup',
};

export function Tech(props: { scan: PageResult | null; isDark: boolean; onRescan: () => void }) {
  const { scan } = props;
  const groups = useMemo(() => {
    if (!scan?.ok) return [];
    const map = new Map<string, TechHit[]>();
    for (const t of scan.analysis.tech) map.set(t.category, [...(map.get(t.category) ?? []), t]);
    return Array.from(map, ([category, hits]) => ({ category, hits })).sort((a, b) => b.hits.length - a.hits.length);
  }, [scan]);

  if (!scan) return <Skeleton h={260} />;
  if (!scan.ok) {
    return (
      <Card title="Technologies">
        <Empty title="Can’t scan this page" body={scan.reason} />
      </Card>
    );
  }

  const total = scan.analysis.tech.length;
  const slices = groups.map((g) => ({ label: g.category, value: g.hits.length }));

  return (
    <>
      <Card
        title="Technology mix"
        sub={`${total} detected on this page`}
        right={
          <button class="btn ghost" onClick={props.onRescan}>
            Re-scan
          </button>
        }
      >
        {total ? (
          <>
            <DonutChart slices={slices} isDark={props.isDark} center={String(total)} />
            <div class="legend">
              {slices.map((s, i) => (
                <span key={s.label}>
                  <i style={{ background: PALETTE[i % PALETTE.length] }} />
                  {s.label} · {s.value}
                </span>
              ))}
            </div>
          </>
        ) : (
          <Empty title="Nothing recognised" body="No known technologies were found in this page’s code." />
        )}
      </Card>

      {total > 0 && (
        <Card title="Detected technologies">
          {groups.map((g) => (
            <div class="tech-group" key={g.category}>
              <h3>{g.category}</h3>
              <div class="pills">
                {g.hits.map((h) => (
                  <span class="pill" key={h.name} title={`Found via ${VIA[h.via]}`}>
                    {h.name}
                    <small>{h.version ? `v${h.version}` : VIA[h.via]}</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      <div class="note">
        Detection reads the page itself. Server software, hosting and anything only visible in network headers can’t be
        seen from here.
      </div>
    </>
  );
}
