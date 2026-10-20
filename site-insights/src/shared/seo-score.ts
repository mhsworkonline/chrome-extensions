import type { CheckStatus, PageAnalysis } from './types';

export interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
}

const WEIGHT: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

export function runSeoChecks({ seo, robotsTxt }: PageAnalysis): Check[] {
  const checks: Check[] = [];
  const add = (label: string, status: CheckStatus, detail: string) => checks.push({ label, status, detail });

  const t = seo.title?.length ?? 0;
  if (!t) add('Title tag', 'fail', 'Missing. Every page needs a unique title.');
  else if (t < 30 || t > 60) add('Title tag', 'warn', `${t} characters. Aim for 30 to 60 so it isn’t cut off in results.`);
  else add('Title tag', 'pass', `${t} characters.`);

  const d = seo.description?.length ?? 0;
  if (!d) add('Meta description', 'fail', 'Missing. It is the snippet shown under your result.');
  else if (d < 70 || d > 160) add('Meta description', 'warn', `${d} characters. Aim for 70 to 160.`);
  else add('Meta description', 'pass', `${d} characters.`);

  const h1 = seo.headings.h1;
  if (h1 === 0) add('H1 heading', 'fail', 'No H1 found.');
  else if (h1 > 1) add('H1 heading', 'warn', `${h1} H1 headings. One clear H1 is the usual practice.`);
  else add('H1 heading', 'pass', 'Exactly one H1.');

  add('Canonical URL', seo.canonical ? 'pass' : 'warn', seo.canonical ?? 'No canonical link. It helps avoid duplicate-content issues.');
  add('HTTPS', seo.https ? 'pass' : 'fail', seo.https ? 'Served over HTTPS.' : 'Not served over HTTPS.');
  add('Mobile viewport', seo.viewport ? 'pass' : 'fail', seo.viewport ? 'Viewport meta tag present.' : 'No viewport meta tag.');
  add('Language', seo.lang ? 'pass' : 'warn', seo.lang ? `lang="${seo.lang}"` : 'The html element has no lang attribute.');

  if (seo.robotsMeta && /noindex/i.test(seo.robotsMeta)) add('Indexable', 'fail', `Robots meta says "${seo.robotsMeta}", so search engines will skip this page.`);
  else add('Indexable', 'pass', 'No noindex directive.');

  if (seo.images.total === 0) add('Image alt text', 'pass', 'No images on the page.');
  else if (seo.images.missingAlt === 0) add('Image alt text', 'pass', `All ${seo.images.total} images have alt text.`);
  else add('Image alt text', 'warn', `${seo.images.missingAlt} of ${seo.images.total} images have no alt attribute.`);

  const ogOk = !!(seo.og.title && seo.og.description && seo.og.image);
  add('Open Graph tags', ogOk ? 'pass' : 'warn', ogOk ? 'Title, description and image set.' : 'Incomplete. Add og:title, og:description and og:image for better link previews.');
  add('Twitter card', seo.twitter.card ? 'pass' : 'warn', seo.twitter.card ? `Card type: ${seo.twitter.card}.` : 'No twitter:card tag.');
  add('Structured data', seo.jsonLdTypes.length ? 'pass' : 'warn', seo.jsonLdTypes.length ? seo.jsonLdTypes.join(', ') : 'No JSON-LD found.');

  if (robotsTxt === null) add('robots.txt', 'warn', 'Couldn’t be checked.');
  else add('robots.txt', robotsTxt.found ? 'pass' : 'warn', robotsTxt.found ? 'Found.' : 'Not found.');
  if (robotsTxt?.found) {
    add('Sitemap', robotsTxt.sitemaps.length ? 'pass' : 'warn', robotsTxt.sitemaps.length ? `${robotsTxt.sitemaps.length} listed in robots.txt.` : 'No sitemap listed in robots.txt.');
  }
  return checks;
}

export function seoScore(checks: Check[]): number {
  if (!checks.length) return 0;
  return Math.round((checks.reduce((n, c) => n + WEIGHT[c.status], 0) / checks.length) * 100);
}
