import { SIGNATURES } from '../data/signatures';
import { analyzePage } from '../page/analyze';
import { registrableDomain } from '../shared/domain';
import type { PageAnalysis, PageResult } from '../shared/types';

async function fetchRobotsTxt(origin: string): Promise<PageAnalysis['robotsTxt']> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('html')) return { found: false, sitemaps: [] };
    const body = (await res.text()).slice(0, 200_000);
    const sitemaps = Array.from(body.matchAll(/^\s*sitemap:\s*(\S+)/gim)).map((m) => m[1]);
    return { found: true, sitemaps };
  } catch {
    return null; // unknown, not "missing"
  }
}

/** Scans the active tab's page. Nothing leaves the browser except the same-site robots.txt request. */
export async function scanTab(tab: chrome.tabs.Tab): Promise<PageResult> {
  const domain = registrableDomain(tab.url);
  if (!domain || tab.id === undefined || !tab.url) return { ok: false, reason: 'This page can’t be analysed.' };

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: analyzePage,
      args: [SIGNATURES],
    });
    const result = injection?.result;
    if (!result) return { ok: false, reason: 'The page returned no data. Try reloading it.' };

    const robotsTxt = await fetchRobotsTxt(new URL(tab.url).origin);
    return { ok: true, domain, url: tab.url, analysis: { ...result, robotsTxt } };
  } catch (err) {
    console.warn('[site-insights] scan failed', err);
    return { ok: false, reason: 'Chrome doesn’t allow scanning this page (for example the Web Store or a PDF).' };
  }
}
