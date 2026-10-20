import { parse } from 'tldts';
import { isTrackingCookie } from '../shared/checks';
import { registrableDomain } from '../shared/domain';
import type { CookieInfo, PrivacyResult } from '../shared/types';

const toInfo = (c: chrome.cookies.Cookie): CookieInfo => ({
  name: c.name,
  domain: c.domain.replace(/^\./, ''),
  secure: c.secure,
  httpOnly: c.httpOnly,
  sameSite: c.sameSite,
  session: c.session,
  expiresInDays: c.expirationDate ? Math.round((c.expirationDate * 1000 - Date.now()) / 86_400_000) : null,
  size: c.name.length + c.value.length,
  tracking: isTrackingCookie(c.name),
});

/**
 * Cookie metadata (never values) for the page and for the other sites it loads from.
 * Everything comes from this browser's own cookie jar.
 */
export async function collectPrivacy(tab: chrome.tabs.Tab): Promise<PrivacyResult> {
  const pageDomain = registrableDomain(tab.url);
  if (!pageDomain || tab.id === undefined || !tab.url) return { ok: false, reason: 'This page can’t be checked.' };

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((r) => new URL(r.name).hostname),
    });

    const requests = new Map<string, number>();
    for (const host of (injection?.result as string[] | undefined) ?? []) {
      const d = parse(host).domain;
      if (d && d !== pageDomain) requests.set(d, (requests.get(d) ?? 0) + 1);
    }

    const firstParty = (await chrome.cookies.getAll({ url: tab.url })).map(toInfo);

    // Cookie counts for the busiest third-party domains; capped to keep the lookup quick.
    const busiest = Array.from(requests).sort((a, b) => b[1] - a[1]);
    const counts = await Promise.all(
      busiest.slice(0, 15).map(async ([domain]) => [domain, (await chrome.cookies.getAll({ domain })).length] as const),
    );
    const cookieCount = new Map(counts);

    return {
      ok: true,
      facts: {
        cookies: firstParty.sort((a, b) => Number(b.tracking) - Number(a.tracking)),
        thirdPartyDomains: busiest.map(([domain, n]) => ({ domain, requests: n, cookies: cookieCount.get(domain) ?? 0 })),
      },
    };
  } catch (err) {
    console.warn('[site-insights] privacy check failed', err);
    return { ok: false, reason: 'Chrome doesn’t allow reading this page.' };
  }
}
