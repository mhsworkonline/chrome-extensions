import type { CheckStatus, SecurityAnalysis, SecurityCheck } from './types';

type Headers = Record<string, string>;

/** Headers worth showing in the raw list. */
const NOTABLE = [
  'server',
  'x-powered-by',
  'via',
  'content-type',
  'content-encoding',
  'cache-control',
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'alt-svc',
  'server-timing',
];

/** Each rule reads the lower-cased response headers and names a platform when it matches. */
const PLATFORMS: [name: string, test: (h: Headers) => boolean][] = [
  ['Cloudflare', (h) => /cloudflare/i.test(h.server ?? '') || 'cf-ray' in h],
  ['Fastly', (h) => 'x-fastly-request-id' in h || /fastly/i.test(h['x-served-by'] ?? '') || 'fastly-debug-digest' in h],
  ['Akamai', (h) => /akamai/i.test(h.server ?? '') || 'akamai-grn' in h || Object.keys(h).some((k) => k.startsWith('x-akamai'))],
  ['Amazon CloudFront', (h) => 'x-amz-cf-id' in h || /cloudfront/i.test(h.via ?? '')],
  ['Amazon S3 / AWS', (h) => /amazons3/i.test(h.server ?? '') || 'x-amz-request-id' in h || 'x-amzn-requestid' in h],
  ['Vercel', (h) => /vercel/i.test(h.server ?? '') || 'x-vercel-id' in h],
  ['Netlify', (h) => /netlify/i.test(h.server ?? '') || 'x-nf-request-id' in h],
  ['GitHub', (h) => /github\.com/i.test(h.server ?? '') || 'x-github-request-id' in h],
  ['Google Cloud', (h) => /^(gws|gse|esf|google frontend)/i.test(h.server ?? '') || /google/i.test(h.via ?? '') || 'x-goog-generation' in h],
  ['Microsoft Azure', (h) => 'x-azure-ref' in h || 'x-ms-request-id' in h || /azure/i.test(h.server ?? '')],
  ['Heroku', (h) => /vegur/i.test(h.via ?? '') || /cowboy/i.test(h.server ?? '')],
  ['Fly.io', (h) => 'fly-request-id' in h],
  ['Render', (h) => 'rndr-id' in h || 'x-render-origin-server' in h],
  ['WP Engine', (h) => /wp engine/i.test(h['x-powered-by'] ?? '') || 'x-wpe-request-id' in h],
  ['Kinsta', (h) => 'x-kinsta-cache' in h],
  ['Pantheon', (h) => 'x-pantheon-styx-hostname' in h],
  ['Shopify', (h) => 'x-shopid' in h || 'x-shopify-stage' in h],
  ['Wix', (h) => 'x-wix-request-id' in h],
  ['Squarespace', (h) => /squarespace/i.test(h.server ?? '')],
  ['Varnish cache', (h) => 'x-varnish' in h || /varnish/i.test(h.via ?? '')],
];

const mark = (ok: boolean, whenNot: CheckStatus = 'warn'): CheckStatus => (ok ? 'pass' : whenNot);

export function analyzeSecurity(url: string, status: number, headers: Headers): SecurityAnalysis {
  const checks: SecurityCheck[] = [];
  const add = (label: string, st: CheckStatus, detail: string, weight = 1) => checks.push({ label, status: st, detail, weight });

  const https = url.startsWith('https:');
  add('HTTPS', mark(https, 'fail'), https ? 'The page is served over HTTPS.' : 'The page is served over plain HTTP.', 3);

  const hsts = headers['strict-transport-security'];
  if (!hsts) {
    add('HSTS', https ? 'warn' : 'fail', 'No Strict-Transport-Security header, so browsers may still try plain HTTP first.', 2);
  } else {
    const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    add('HSTS', mark(age >= 15552000), age >= 15552000 ? `Enabled for ${Math.round(age / 86400)} days.` : `max-age is only ${Math.round(age / 86400)} days. Six months or more is recommended.`, 2);
  }

  const csp = headers['content-security-policy'];
  if (!csp) {
    add('Content-Security-Policy', 'warn', 'Missing. A CSP limits what scripts can run and greatly reduces the damage of XSS.', 2);
  } else {
    const loose = /'unsafe-inline'|'unsafe-eval'/.test(csp);
    add('Content-Security-Policy', mark(!loose), loose ? 'Present, but allows unsafe-inline or unsafe-eval, which weakens it.' : 'Present.', 2);
  }

  const xfo = headers['x-frame-options'];
  const frameAncestors = csp ? /frame-ancestors/i.test(csp) : false;
  add('Clickjacking protection', mark(!!xfo || frameAncestors), xfo ? `X-Frame-Options: ${xfo}` : frameAncestors ? 'Set through CSP frame-ancestors.' : 'Neither X-Frame-Options nor CSP frame-ancestors is set, so other sites can embed this page.', 2);

  const nosniff = /nosniff/i.test(headers['x-content-type-options'] ?? '');
  add('X-Content-Type-Options', mark(nosniff), nosniff ? 'nosniff is set.' : 'Missing nosniff, so browsers may guess content types.', 2);

  add('Referrer-Policy', mark(!!headers['referrer-policy']), headers['referrer-policy'] ?? 'Missing. Browsers fall back to their default of sending the origin.', 2);
  add('Permissions-Policy', mark(!!headers['permissions-policy']), headers['permissions-policy'] ? 'Set.' : 'Missing. It restricts access to camera, location and similar features.');

  const server = headers.server ?? null;
  const poweredBy = headers['x-powered-by'] ?? null;
  const versioned = !!server && /[\w-]+\/\d/.test(server);
  add('Server version hidden', mark(!versioned), versioned ? `The Server header reveals a version (${server}).` : 'No version number in the Server header.');
  add('Technology hidden', mark(!poweredBy), poweredBy ? `X-Powered-By reveals "${poweredBy}".` : 'No X-Powered-By header.');

  const encoding = headers['content-encoding'];
  add('Compression', mark(!!encoding), encoding ? `Served with ${encoding}.` : 'The response is not compressed.');
  const altSvc = headers['alt-svc'] ?? '';
  if (altSvc) add('HTTP/3', 'pass', /h3/.test(altSvc) ? 'HTTP/3 is advertised.' : 'Alt-Svc is set.');

  // Weighted score: a failure loses the whole weight, a warning half of it.
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce((n, c) => n + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  const score = Math.round((earned / total) * 100);

  return {
    url,
    status,
    score,
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    checks,
    server: {
      software: server ? server.split(/[\s(]/)[0] : null,
      poweredBy,
      platforms: PLATFORMS.filter(([, test]) => test(headers)).map(([name]) => name),
    },
    headers: NOTABLE.filter((n) => headers[n] !== undefined).map((n) => ({ name: n, value: headers[n].slice(0, 300) })),
  };
}
