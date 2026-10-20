import { useState } from 'preact/hooks';
import { useSite } from '../useSite';
import { useTheme } from '../useTheme';
import { usePageScan, useStored } from '../hooks';
import { openInTab, pinnedTabId } from '../pinned';
import { Card, Chips, Empty, Skeleton } from '../components/bits';
import { addWatch, removeWatch, WATCHLIST_KEY } from '../../shared/history';
import type { PageResult, PerfResult, PrivacyResult, SecurityResult, SitemapResult } from '../../shared/types';
import { DEFAULT_SUB, SUBS, TABS, type Go, type Tab } from './nav';
import { ExportMenu } from './ExportMenu';
import { Overview } from './views/Overview';
import { Rank } from './views/Rank';
import { Traffic } from './views/Traffic';
import { Compare } from './views/Compare';
import { Watchlist } from './views/Watchlist';
import { Performance } from './views/Performance';
import { Seo } from './views/Seo';
import { Content } from './views/Content';
import { Accessibility } from './views/Accessibility';
import { Sitemap } from './views/Sitemap';
import { Tech } from './views/Tech';
import { Security } from './views/Security';
import { Privacy } from './views/Privacy';
import { Design } from './views/Design';
import { Activity } from './views/Activity';

export function App() {
  const { isDark, toggle } = useTheme();
  const site = useSite(true);
  const [tab, setTab] = useState<Tab>('Overview');
  const [subs, setSubs] = useState<Record<string, string>>(DEFAULT_SUB);
  const watched = useStored<string[]>(WATCHLIST_KEY, []);

  const sub = subs[tab];
  const on = (t: Tab, s?: string) => tab === t && (s === undefined || sub === s);

  /** Each check runs only when something on screen needs it. */
  const wants = {
    scan: on('Overview') || on('Site health') || on('Tech & security'),
    perf: on('Overview') || on('Site health'),
    security: on('Overview') || on('Tech & security', 'Security'),
    privacy: on('Overview') || on('Tech & security', 'Privacy'),
    sitemap: on('Site health', 'Sitemap'),
  };

  const url = site?.ok ? site.url : null;
  const { result: scan, rescan } = usePageScan<PageResult>('getPage', wants.scan, url);
  const { result: perf, rescan: remeasure } = usePageScan<PerfResult>('getPerf', wants.perf, url);
  const { result: security } = usePageScan<SecurityResult>('getSecurity', wants.security, url);
  const { result: privacy } = usePageScan<PrivacyResult>('getPrivacy', wants.privacy, url);
  const { result: sitemap } = usePageScan<SitemapResult>('getSitemap', wants.sitemap, url);

  const go: Go = (next, s) => {
    setTab(next);
    if (s) setSubs((prev) => ({ ...prev, [next]: s }));
  };

  const options = SUBS[tab];

  const body = () => {
    if (tab === 'My Activity') return <Activity isDark={isDark} />;
    if (!site) {
      return (
        <>
          <Skeleton h={90} />
          <Skeleton h={230} />
        </>
      );
    }
    if (!site.ok) {
      return (
        <Card title="Nothing to analyse">
          <Empty title="Open a website" body="Switch to a regular http(s) page to see its insights." />
        </Card>
      );
    }

    switch (`${tab}/${sub ?? ''}`) {
      case 'Overview/':
        return <Overview site={site} scan={scan} perf={perf} security={security} privacy={privacy} onGo={go} />;
      case 'Traffic/Rank':
        return <Rank site={site} isDark={isDark} />;
      case 'Traffic/Visits':
        return <Traffic site={site} isDark={isDark} />;
      case 'Traffic/Compare':
        return <Compare site={site} isDark={isDark} />;
      case 'Traffic/Watchlist':
        return <Watchlist />;
      case 'Site health/Speed':
        return <Performance site={site} perf={perf} isDark={isDark} onRemeasure={remeasure} />;
      case 'Site health/SEO':
        return <Seo scan={scan} onRescan={rescan} />;
      case 'Site health/Content':
        return <Content scan={scan} />;
      case 'Site health/Accessibility':
        return <Accessibility scan={scan} perf={perf} />;
      case 'Site health/Sitemap':
        return <Sitemap sitemap={sitemap} />;
      case 'Tech & security/Tech':
        return <Tech scan={scan} isDark={isDark} onRescan={rescan} />;
      case 'Tech & security/Security':
        return <Security security={security} />;
      case 'Tech & security/Privacy':
        return <Privacy scan={scan} privacy={privacy} />;
      case 'Tech & security/Design':
        return <Design scan={scan} />;
      default:
        return null;
    }
  };

  const isWatched = site?.ok ? watched.includes(site.domain) : false;

  return (
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="row">
            <img class="logo" src="/logo.svg" alt="" width="28" height="28" />
            <span class="brand-name">Site Insights</span>
          </div>
          <div class="row" style={{ gap: 6 }}>
            {site?.ok && <ExportMenu site={site} />}
            {pinnedTabId === undefined && site?.ok && (
              <button
                class="icon-btn"
                onClick={() => void openInTab(site.tabId)}
                aria-label="Open dashboard in a new tab"
                title="Open in a new tab"
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
                </svg>
              </button>
            )}
            <button class="icon-btn" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
              {isDark ? '☀' : '☾'}
            </button>
          </div>
        </div>

        {site?.ok && (
          <div class="site-row">
            {site.favIconUrl && <img class="favicon" src={site.favIconUrl} alt="" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div class="site-name">{site.domain}</div>
              <div class="muted small">Website overview</div>
            </div>
            <button
              class="star"
              aria-pressed={isWatched}
              aria-label={isWatched ? 'Stop watching this site' : 'Watch this site'}
              title={isWatched ? 'Watching. Click to stop.' : 'Watch this site: keep its rank history'}
              onClick={() => void (isWatched ? removeWatch(site.domain) : addWatch(site.domain))}
            >
              {isWatched ? '★' : '☆'}
            </button>
          </div>
        )}

        <nav class="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} class="tab" role="tab" aria-selected={t === tab} onClick={() => go(t)}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main class="content">
        {options && options.length > 1 && (
          <div class="subnav">
            <Chips
              options={options.map((o) => ({ value: o, label: o }))}
              value={sub ?? options[0]}
              onChange={(v) => go(tab, v)}
            />
          </div>
        )}
        {body()}
      </main>
    </div>
  );
}
