import type { PerfFacts } from '../shared/types';

/**
 * Runs INSIDE the inspected page via chrome.scripting.executeScript.
 * Serialized with toString(), so it must stay fully self-contained.
 * Reads the browser's own performance timeline: real numbers from this device, not simulated.
 */
export async function measurePage(): Promise<PerfFacts> {
  const doc = document;

  /** Buffered entries for one entry type; resolves empty after a short wait if there are none. */
  const entriesOf = (type: string, extra: Record<string, unknown> = {}) =>
    new Promise<PerformanceEntry[]>((resolve) => {
      try {
        const po = new PerformanceObserver((list) => {
          resolve(list.getEntries());
          po.disconnect();
        });
        po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        setTimeout(() => {
          resolve([]);
          po.disconnect();
        }, 400);
      } catch {
        resolve([]);
      }
    });

  const [paints, lcps, shifts, events] = await Promise.all([
    entriesOf('paint'),
    entriesOf('largest-contentful-paint'),
    entriesOf('layout-shift'),
    entriesOf('event', { durationThreshold: 16 }),
  ]);

  const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
  const lcp = lcps.length ? lcps[lcps.length - 1].startTime : null;

  // CLS: the worst "session window" of shifts (gap < 1s, window < 5s), ignoring shifts right after input.
  let cls: number | null = null;
  if (shifts.length || lcps.length) {
    let best = 0;
    let sum = 0;
    let first = 0;
    let last = 0;
    for (const e of shifts as unknown as { startTime: number; value: number; hadRecentInput: boolean }[]) {
      if (e.hadRecentInput) continue;
      if (sum && (e.startTime - last > 1000 || e.startTime - first > 5000)) {
        sum = 0;
      }
      if (!sum) first = e.startTime;
      sum += e.value;
      last = e.startTime;
      best = Math.max(best, sum);
    }
    cls = best;
  }

  // INP: the slowest interaction (98th percentile once there are 50+). Null if the user hasn't interacted yet.
  const worst = new Map<number, number>();
  for (const e of events as unknown as { interactionId: number; duration: number }[]) {
    if (!e.interactionId) continue;
    worst.set(e.interactionId, Math.max(worst.get(e.interactionId) ?? 0, e.duration));
  }
  const durations = Array.from(worst.values()).sort((a, b) => b - a);
  const inp = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length / 50))] : null;

  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .slice(0, 600)
    .map((r) => ({
      url: r.name,
      initiator: r.initiatorType,
      // Cross-origin resources without Timing-Allow-Origin report 0; those are counted as "size unknown".
      bytes: r.transferSize || 0,
      durationMs: r.duration,
    }));

  // ----- DOM audits -----
  const imgs = Array.from(doc.querySelectorAll('img'));
  const vh = window.innerHeight;
  const hasName = (el: Element) =>
    !!(el.textContent || '').trim() ||
    !!el.getAttribute('aria-label') ||
    !!el.getAttribute('aria-labelledby') ||
    !!el.getAttribute('title') ||
    !!el.querySelector('img[alt]:not([alt=""]), svg title');

  const inputsNoLabel = Array.from(
    doc.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]), select, textarea'),
  ).filter((el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
    if (el.closest('label')) return false;
    const id = el.getAttribute('id');
    return !(id && doc.querySelector(`label[for="${CSS.escape(id)}"]`));
  }).length;

  let headingSkips = 0;
  let prev = 0;
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) headingSkips++;
    prev = level;
  });

  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  const max = /maximum-scale\s*=\s*([\d.]+)/i.exec(viewport);
  const zoomBlocked = /user-scalable\s*=\s*(no|0)/i.test(viewport) || (!!max && Number(max[1]) < 2);

  const insecure = location.protocol === 'https:' ? resources.filter((r) => r.url.startsWith('http://')).length : 0;

  const head = doc.head;
  return {
    fcp,
    lcp,
    cls,
    inp,
    ttfb: nav ? nav.responseStart : null,
    domContentLoaded: nav && nav.domContentLoadedEventEnd ? nav.domContentLoadedEventEnd : null,
    load: nav && nav.loadEventEnd ? nav.loadEventEnd : null,
    protocol: nav?.nextHopProtocol ?? '',
    documentCompressed: nav && nav.decodedBodySize > 0 ? nav.encodedBodySize < nav.decodedBodySize : null,
    resources,
    dom: {
      nodes: doc.getElementsByTagName('*').length,
      imagesNoDimensions: imgs.filter(
        (i) => !(i.getAttribute('width') && i.getAttribute('height')) && !i.style.aspectRatio && !i.style.height,
      ).length,
      imagesOversized: imgs.filter((i) => i.clientWidth > 0 && i.naturalWidth > i.clientWidth * 2.5).length,
      imagesBelowFoldEager: imgs.filter(
        (i) => i.loading !== 'lazy' && i.getBoundingClientRect().top + window.scrollY > vh * 1.5,
      ).length,
      renderBlockingScripts: head
        ? Array.from(head.querySelectorAll('script[src]')).filter(
            (s) => !s.hasAttribute('async') && !s.hasAttribute('defer') && s.getAttribute('type') !== 'module',
          ).length
        : 0,
      renderBlockingStyles: head
        ? head.querySelectorAll('link[rel="stylesheet"]:not([media="print"]):not([disabled])').length
        : 0,
      inputsNoLabel,
      buttonsNoName: Array.from(doc.querySelectorAll('button, [role=button]')).filter((b) => !hasName(b)).length,
      linksNoName: Array.from(doc.querySelectorAll('a[href]')).filter((a) => !hasName(a)).length,
      headingSkips,
      zoomBlocked,
      hasDoctype: !!doc.doctype,
      hasCharset: !!doc.characterSet,
      mixedContent: insecure,
      lang: !!doc.documentElement.getAttribute('lang'),
    },
  };
}
