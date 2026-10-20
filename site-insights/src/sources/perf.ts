import { measurePage } from '../page/measure';
import { registrableDomain } from '../shared/domain';
import { analyzeFacts } from '../shared/perf';
import { recordPerf } from '../shared/history';
import type { PerfResult } from '../shared/types';

/** Measures the active tab from the browser's own performance timeline. Nothing leaves the browser. */
export async function measureTab(tab: chrome.tabs.Tab): Promise<PerfResult> {
  const domain = registrableDomain(tab.url);
  if (!domain || tab.id === undefined || !tab.url) return { ok: false, reason: 'This page can’t be measured.' };

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: measurePage,
    });
    if (!injection?.result) return { ok: false, reason: 'The page returned no data. Try reloading it.' };
    const analysis = analyzeFacts(injection.result, domain, tab.url.startsWith('https:'));
    const f = analysis.facts;
    // Only keep readings from a finished load, so half-loaded pages don't pollute the trend.
    if (f.load !== null) {
      await recordPerf(domain, {
        ts: Date.now(),
        url: tab.url,
        lcp: f.lcp,
        fcp: f.fcp,
        cls: f.cls,
        ttfb: f.ttfb,
        load: f.load,
        bytes: analysis.totalBytes,
        requests: analysis.requests,
      });
    }
    return { ok: true, url: tab.url, analysis };
  } catch (err) {
    console.warn('[site-insights] measure failed', err);
    return { ok: false, reason: 'Chrome doesn’t allow measuring this page (for example the Web Store or a PDF).' };
  }
}
