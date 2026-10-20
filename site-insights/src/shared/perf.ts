import { parse } from 'tldts';
import type { CheckStatus, PerfAnalysis, PerfCheck, PerfFacts, PerfResource } from './types';

export type Rating = 'good' | 'warn' | 'bad';

/** Google's published Core Web Vitals thresholds: [good up to, poor beyond]. */
const THRESHOLDS: Record<'fcp' | 'lcp' | 'cls' | 'inp' | 'ttfb', [number, number]> = {
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  ttfb: [800, 1800],
};

export function rate(metric: keyof typeof THRESHOLDS, value: number | null): Rating | null {
  if (value === null) return null;
  const [good, poor] = THRESHOLDS[metric];
  return value <= good ? 'good' : value <= poor ? 'warn' : 'bad';
}

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|#|$)/i;
const FONT = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;

function resourceType(url: string, initiator: string): string {
  const path = url.split(/[?#]/)[0];
  if (/\.m?js$/i.test(path)) return 'Script';
  if (/\.css$/i.test(path)) return 'Stylesheet';
  if (FONT.test(url)) return 'Font';
  if (IMAGE.test(url)) return 'Image';
  switch (initiator) {
    case 'script':
      return 'Script';
    case 'img':
    case 'image':
      return 'Image';
    case 'fetch':
    case 'xmlhttprequest':
      return 'Fetch / XHR';
    case 'iframe':
    case 'frame':
      return 'Document';
    case 'css':
    case 'link':
      return 'Stylesheet';
    default:
      return 'Other';
  }
}

export function buildPerfChecks(f: PerfFacts, totalBytes: number, unknown: number, isHttps: boolean): PerfCheck[] {
  const out: PerfCheck[] = [];
  const add = (group: PerfCheck['group'], label: string, status: CheckStatus, detail: string) =>
    out.push({ group, label, status, detail });
  const count = (n: number, ok: string, bad: (n: number) => string, level: CheckStatus = 'warn') =>
    n === 0 ? ([ 'pass', ok ] as const) : ([ level, bad(n) ] as const);
  const d = f.dom;

  // ----- Performance -----
  let [s, t] = count(d.renderBlockingScripts, 'No render-blocking scripts in the head.', (n) => `${n} script${n > 1 ? 's' : ''} in the head without async or defer block the first paint.`);
  add('Performance', 'Render-blocking scripts', s, t);

  const css = d.renderBlockingStyles;
  add('Performance', 'Render-blocking stylesheets', css <= 2 ? 'pass' : 'warn', `${css} stylesheet${css === 1 ? '' : 's'} load before the page can render.`);

  [s, t] = count(d.imagesNoDimensions, 'All images declare their size.', (n) => `${n} image${n > 1 ? 's' : ''} without width and height can shift the layout as they load.`);
  add('Performance', 'Image dimensions', s, t);

  [s, t] = count(d.imagesOversized, 'No images much larger than they are shown.', (n) => `${n} image${n > 1 ? 's are' : ' is'} far larger than displayed. Serve a smaller size.`);
  add('Performance', 'Image sizing', s, t);

  [s, t] = count(d.imagesBelowFoldEager, 'Offscreen images are lazy-loaded.', (n) => `${n} image${n > 1 ? 's' : ''} far below the fold load immediately. Add loading="lazy".`);
  add('Performance', 'Lazy loading', s, t);

  add('Performance', 'DOM size', d.nodes <= 800 ? 'pass' : d.nodes <= 1400 ? 'warn' : 'fail', `${d.nodes.toLocaleString()} elements. Under 800 is ideal.`);

  const weightNote = unknown ? ` (${unknown} cross-origin files didn’t report a size, so the real total is higher)` : '';
  add('Performance', 'Page weight', totalBytes <= 1.6e6 ? 'pass' : totalBytes <= 4e6 ? 'warn' : 'fail', `${formatBytes(totalBytes)} transferred${weightNote}.`);

  if (f.documentCompressed !== null) {
    add('Performance', 'Text compression', f.documentCompressed ? 'pass' : 'warn', f.documentCompressed ? 'The HTML is served compressed.' : 'The HTML is not compressed. Enable gzip or Brotli.');
  }
  if (f.protocol) {
    const modern = f.protocol === 'h2' || f.protocol === 'h3';
    add('Performance', 'Modern HTTP', modern ? 'pass' : 'warn', `Served over ${f.protocol}.${modern ? '' : ' HTTP/2 or HTTP/3 loads pages faster.'}`);
  }

  // ----- Accessibility -----
  const a11y = (n: number, label: string, ok: string, bad: string) => {
    add('Accessibility', label, n === 0 ? 'pass' : n <= 3 ? 'warn' : 'fail', n === 0 ? ok : `${n} ${bad}`);
  };
  a11y(d.inputsNoLabel, 'Form labels', 'Every form field has a label.', 'form field(s) have no label.');
  a11y(d.buttonsNoName, 'Button names', 'Every button has an accessible name.', 'button(s) have no accessible name.');
  a11y(d.linksNoName, 'Link names', 'Every link has readable text.', 'link(s) have no text or label.');
  add('Accessibility', 'Heading order', d.headingSkips === 0 ? 'pass' : 'warn', d.headingSkips === 0 ? 'Headings don’t skip levels.' : `${d.headingSkips} place(s) where a heading skips a level.`);
  add('Accessibility', 'Zoom allowed', d.zoomBlocked ? 'fail' : 'pass', d.zoomBlocked ? 'The viewport blocks pinch-zoom.' : 'Users can zoom.');
  add('Accessibility', 'Page language', d.lang ? 'pass' : 'warn', d.lang ? 'The html element sets a language.' : 'The html element has no lang attribute.');

  // ----- Best practices -----
  add('Best practices', 'HTTPS', isHttps ? 'pass' : 'fail', isHttps ? 'Served over HTTPS.' : 'Not served over HTTPS.');
  add('Best practices', 'No mixed content', d.mixedContent === 0 ? 'pass' : 'fail', d.mixedContent === 0 ? 'No insecure requests on a secure page.' : `${d.mixedContent} insecure (http) request(s) on an https page.`);
  add('Best practices', 'Doctype', d.hasDoctype ? 'pass' : 'warn', d.hasDoctype ? 'Present.' : 'Missing, so browsers use quirks mode.');
  add('Best practices', 'Character set', d.hasCharset ? 'pass' : 'warn', d.hasCharset ? 'Declared.' : 'Not declared.');
  return out;
}

export function analyzeFacts(facts: PerfFacts, pageDomain: string, isHttps: boolean): PerfAnalysis {
  const resources: PerfResource[] = facts.resources.map((r) => ({
    url: r.url,
    type: resourceType(r.url, r.initiator),
    bytes: r.bytes,
    durationMs: r.durationMs,
    thirdParty: parse(new URL(r.url, 'https://x').hostname).domain !== pageDomain,
  }));

  const totalBytes = resources.reduce((n, r) => n + r.bytes, 0);
  const unknownSizeRequests = resources.filter((r) => r.bytes === 0 && r.thirdParty).length;

  const types = new Map<string, { count: number; bytes: number }>();
  for (const r of resources) {
    const t = types.get(r.type) ?? { count: 0, bytes: 0 };
    types.set(r.type, { count: t.count + 1, bytes: t.bytes + r.bytes });
  }

  const tp = new Map<string, { requests: number; bytes: number }>();
  for (const r of resources) {
    if (!r.thirdParty) continue;
    const domain = parse(new URL(r.url, 'https://x').hostname).domain ?? 'unknown';
    const t = tp.get(domain) ?? { requests: 0, bytes: 0 };
    tp.set(domain, { requests: t.requests + 1, bytes: t.bytes + r.bytes });
  }

  const checks = buildPerfChecks(facts, totalBytes, unknownSizeRequests, isHttps);

  return {
    facts,
    totalBytes,
    requests: resources.length,
    unknownSizeRequests,
    byType: Array.from(types, ([type, v]) => ({ type, ...v })).sort((a, b) => b.bytes - a.bytes),
    heaviest: [...resources].sort((a, b) => b.bytes - a.bytes).slice(0, 25),
    thirdParties: Array.from(tp, ([domain, v]) => ({ domain, ...v })).sort((a, b) => b.requests - a.requests),
    checks,
  };
}
