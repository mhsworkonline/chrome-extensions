import { estimateVisits, type VisitEstimate } from '../../shared/estimate';
import { mergePoints, perfKey, rankKey } from '../../shared/history';
import { collectIssues, type Issue } from '../../shared/issues';
import { runSeoChecks, seoScore } from '../../shared/seo-score';
import type {
  Message,
  PageResult,
  PerfPoint,
  PerfResult,
  PrivacyResult,
  RankPoint,
  SecurityResult,
  SiteResult,
  SitemapResult,
} from '../../shared/types';

type Site = Extract<SiteResult, { ok: true }>;

export interface Report {
  generatedAt: string;
  domain: string;
  url: string;
  traffic: { rank: number | null; estimate: VisitEstimate | null; history: RankPoint[] };
  seoScore: number | null;
  scan: PageResult;
  perf: PerfResult;
  security: SecurityResult;
  privacy: PrivacyResult;
  sitemap: SitemapResult;
  issues: Issue[];
  /** Speed readings saved in this browser for the site. */
  perfHistory: PerfPoint[];
}

const ask = <T>(msg: Message): Promise<T> => chrome.runtime.sendMessage(msg);

/** Runs every check for the site and gathers the results. Everything stays in the browser. */
export async function buildReport(site: Site): Promise<Report> {
  const tabId = site.tabId;
  const [scan, perf, security, privacy, sitemap, saved, savedPerf] = await Promise.all([
    ask<PageResult>({ type: 'getPage', tabId }),
    ask<PerfResult>({ type: 'getPerf', tabId }),
    ask<SecurityResult>({ type: 'getSecurity', tabId }),
    ask<PrivacyResult>({ type: 'getPrivacy', tabId }),
    ask<SitemapResult>({ type: 'getSitemap', tabId }),
    chrome.storage.local.get(rankKey(site.domain)),
    chrome.storage.local.get(perfKey(site.domain)),
  ]);

  const history = mergePoints((saved[rankKey(site.domain)] as RankPoint[] | undefined) ?? [], site.rank?.payload.history ?? []);
  const rank = history.length ? history[history.length - 1].rank : null;

  return {
    generatedAt: new Date().toISOString(),
    domain: site.domain,
    url: site.url,
    traffic: { rank, estimate: rank ? estimateVisits(rank) : null, history },
    seoScore: scan.ok ? seoScore(runSeoChecks(scan.analysis)) : null,
    scan,
    perf,
    security,
    privacy,
    sitemap,
    issues: collectIssues({ scan, perf, security, privacy }),
    perfHistory: (savedPerf[perfKey(site.domain)] as PerfPoint[] | undefined) ?? [],
  };
}

function save(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const stamp = (r: Report) => `${r.domain}-${r.generatedAt.slice(0, 10)}`;

export function downloadJson(r: Report) {
  save(`site-insights-${stamp(r)}.json`, 'application/json', JSON.stringify(r, null, 2));
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  // Quote anything that could break a row, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** A flat section / item / value table that opens cleanly in a spreadsheet. */
export function reportRows(r: Report): [string, string, string | number][] {
  const rows: [string, string, string | number][] = [
    ['Site', 'Domain', r.domain],
    ['Site', 'URL', r.url],
    ['Site', 'Generated', r.generatedAt],
    ['Traffic', 'Global rank', r.traffic.rank ?? 'Not ranked'],
  ];
  if (r.traffic.estimate) {
    rows.push(['Traffic', 'Estimated visits / month (low)', r.traffic.estimate.low], ['Traffic', 'Estimated visits / month (high)', r.traffic.estimate.high]);
  }
  if (r.seoScore !== null) rows.push(['SEO', 'Score', r.seoScore]);
  if (r.perf.ok) {
    const f = r.perf.analysis.facts;
    rows.push(
      ['Speed', 'LCP (ms)', Math.round(f.lcp ?? 0) || ''],
      ['Speed', 'FCP (ms)', Math.round(f.fcp ?? 0) || ''],
      ['Speed', 'CLS', f.cls ?? ''],
      ['Speed', 'TTFB (ms)', Math.round(f.ttfb ?? 0) || ''],
      ['Speed', 'Transferred (bytes)', r.perf.analysis.totalBytes],
      ['Speed', 'Requests', r.perf.analysis.requests],
    );
  }
  if (r.security.ok) rows.push(['Security', 'Grade', r.security.analysis.grade], ['Security', 'Score', r.security.analysis.score]);
  if (r.scan.ok) {
    const c = r.scan.analysis.content;
    rows.push(['Content', 'Words', c.words], ['Content', 'Reading time (min)', c.readingMinutes], ['Technology', 'Detected', r.scan.analysis.tech.map((t) => t.name).join('; ')]);
  }
  if (r.sitemap.ok) rows.push(['Sitemap', 'Pages listed', r.sitemap.analysis.urlCount]);
  for (const i of r.issues) rows.push(['Issue', `${i.area}: ${i.label}`, `${i.status.toUpperCase()} - ${i.detail}`]);
  return rows;
}

export function downloadCsv(r: Report) {
  const lines = ['Section,Item,Value', ...reportRows(r).map((row) => row.map(csvCell).join(','))];
  save(`site-insights-${stamp(r)}.csv`, 'text/csv', lines.join('\n'));
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Builds the PDF here in the page and saves it straight to Downloads.
 * The PDF library is imported on demand, so it costs nothing until someone exports.
 */
export async function downloadPdf(r: Report) {
  const [{ buildPdf }, charts, { formatMs }] = await Promise.all([
    import('./pdf/build'),
    import('./pdf/charts'),
    import('../../shared/perf'),
  ]);
  const make = charts.browserCanvas;
  const hist = r.traffic.history;
  const weighted = r.perf.ok ? r.perf.analysis.byType.filter((t) => t.bytes > 0).map((t) => ({ label: t.type, value: t.bytes })) : [];

  const images = {
    rank: hist.length >= 2 ? charts.rankChart(hist, make) : undefined,
    visits: hist.length >= 2 && r.traffic.estimate ? charts.visitsChart(hist, make) : undefined,
    weight: weighted.length ? charts.weightChart(weighted, make) : undefined,
    speed: r.perfHistory.filter((p) => p.lcp !== null).length >= 2 ? charts.speedChart(r.perfHistory, formatMs, make) : undefined,
  };

  const logo = await fetch(chrome.runtime.getURL('icons/icon-128.png'))
    .then((res) => res.blob())
    .then(blobToDataUrl)
    .catch(() => undefined);

  const doc = await buildPdf(r, images, logo);
  doc.save(`site-insights-${stamp(r)}.pdf`);
}
