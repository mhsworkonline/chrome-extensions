import { registrableDomain } from '../shared/domain';
import { analyzeSecurity } from '../shared/security';
import type { SecurityResult } from '../shared/types';

/** Reads the inspected site's own response headers. Only that site is contacted. */
export async function checkSecurity(tab: chrome.tabs.Tab): Promise<SecurityResult> {
  if (!tab.url || !registrableDomain(tab.url)) return { ok: false, reason: 'This page can’t be checked.' };

  const request = (method: 'HEAD' | 'GET') =>
    fetch(tab.url!, { method, redirect: 'follow', credentials: 'omit', signal: AbortSignal.timeout(8000), cache: 'no-store' });

  try {
    let res = await request('HEAD');
    // Some servers reject HEAD or answer it with different headers.
    if (res.status === 405 || res.status === 501 || res.status === 403) res = await request('GET');

    const headers: Record<string, string> = {};
    res.headers.forEach((value, name) => (headers[name.toLowerCase()] = value));
    return { ok: true, analysis: analyzeSecurity(res.url || tab.url, res.status, headers) };
  } catch (err) {
    console.warn('[site-insights] header check failed', err);
    return { ok: false, reason: 'The site didn’t answer the header check.' };
  }
}
