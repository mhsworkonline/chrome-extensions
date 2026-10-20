import { estimateVisits, formatRange } from '../../shared/estimate';
import { useTheme } from '../useTheme';
import { useSite } from '../useSite';
import { Badge, Empty, RankDelta, Skeleton, Sparkline } from '../components/bits';

async function openDashboard() {
  const win = await chrome.windows.getCurrent();
  if (win.id !== undefined) await chrome.sidePanel.open({ windowId: win.id });
  window.close();
}

export function App() {
  useTheme();
  const site = useSite();

  if (!site) {
    return (
      <main class="popup">
        <Skeleton h={32} w="60%" />
        <div class="card">
          <Skeleton h={90} />
        </div>
      </main>
    );
  }

  if (!site.ok) {
    return (
      <main class="popup">
        <div class="card">
          <Empty title="Open a website" body="Site Insights works on regular http(s) pages." />
        </div>
      </main>
    );
  }

  const history = site.rank?.payload.history ?? [];
  const latest = history.length ? history[history.length - 1] : null;
  const est = latest ? estimateVisits(latest.rank) : null;

  return (
    <main class="popup">
      <div class="site-head">
        {site.favIconUrl && <img class="favicon" src={site.favIconUrl} alt="" />}
        <div>
          <div class="site-name">{site.domain}</div>
          <div class="muted small">Site overview</div>
        </div>
      </div>

      <div class="card">
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <span class="kpi-label">Global rank</span>
          <Badge>Measured</Badge>
        </div>
        {latest ? (
          <>
            <div class="row" style={{ margin: '2px 0 8px' }}>
              <span class="kpi-value">#{latest.rank.toLocaleString()}</span>
              <RankDelta points={history} />
            </div>
            <Sparkline values={history.map((p) => p.rank)} />
            <div class="footer" style={{ marginTop: 8 }}>
              <span>{site.rank!.span!.from}</span>
              <span>{site.rank!.span!.to}</span>
            </div>
          </>
        ) : (
          <div class="muted" style={{ paddingTop: 6 }}>
            {site.rankError ?? 'Not in the top 1 million sites.'}
          </div>
        )}
      </div>

      {est && (
        <div class="card">
          <div class="row between">
            <span class="kpi-label">Est. monthly visits</span>
            <Badge tone="warn">Estimated</Badge>
          </div>
          <div class="kpi-value sm" style={{ marginTop: 4 }}>{formatRange(est)}</div>
        </div>
      )}

      <button class="btn primary" onClick={openDashboard}>
        Open full dashboard →
      </button>
    </main>
  );
}
