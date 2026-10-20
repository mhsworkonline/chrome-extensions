import { registrableDomain } from '../shared/domain';
import { isSitemapIndex, parseEntries, sectionOf, validDate } from '../shared/sitemap';
import type { SitemapAnalysis, SitemapResult } from '../shared/types';

const MAX_CHILDREN = 6;
const MAX_CHARS = 12_000_000;

async function readXml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), credentials: 'omit', redirect: 'follow' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    // .xml.gz files arrive as raw gzip; ordinary Content-Encoding is already undone by fetch.
    const gz = url.split('?')[0].endsWith('.gz') || /gzip/i.test(type);
    const body = gz && res.body ? await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text() : await res.text();
    return /<(urlset|sitemapindex)[\s>]/i.test(body) ? body.slice(0, MAX_CHARS) : null;
  } catch {
    return null;
  }
}

async function declaredSitemaps(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000), credentials: 'omit' });
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('html')) return [];
    const body = (await res.text()).slice(0, 200_000);
    return Array.from(body.matchAll(/^\s*sitemap:\s*(\S+)/gim)).map((m) => m[1]);
  } catch {
    return [];
  }
}

export async function analyzeSitemap(tab: chrome.tabs.Tab): Promise<SitemapResult> {
  if (!tab.url || !registrableDomain(tab.url)) return { ok: false, reason: 'This page can’t be checked.' };
  const origin = new URL(tab.url).origin;
  const siteDomain = registrableDomain(origin);

  const declared = await declaredSitemaps(origin);
  const candidates = declared.length ? declared : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  const sources: string[] = [];
  const documents: string[] = [];
  let isIndex = false;
  let truncated = false;

  for (const url of candidates.slice(0, 4)) {
    const xml = await readXml(url);
    if (!xml) continue;
    sources.push(url);
    if (!isSitemapIndex(xml)) {
      documents.push(xml);
      continue;
    }
    isIndex = true;
    const children = parseEntries(xml).map((e) => e.loc);
    if (children.length > MAX_CHILDREN) truncated = true;
    for (const child of children.slice(0, MAX_CHILDREN)) {
      const childXml = await readXml(child);
      if (childXml && !isSitemapIndex(childXml)) documents.push(childXml);
    }
  }

  if (!documents.length) {
    return { ok: false, reason: 'No sitemap found. Checked robots.txt and the usual /sitemap.xml addresses.' };
  }

  const entries = documents.flatMap(parseEntries);
  const dates = entries.map((e) => validDate(e.lastmod)).filter((d): d is string => !!d).sort();
  const sections = new Map<string, number>();
  for (const e of entries) sections.set(sectionOf(e.loc), (sections.get(sectionOf(e.loc)) ?? 0) + 1);

  const problems: string[] = [];
  if (entries.length > 50_000) problems.push('A single sitemap should list at most 50,000 URLs.');
  if (entries.length && dates.length === 0) problems.push('No <lastmod> dates, so crawlers can’t tell which pages changed.');
  if (entries.some((e) => registrableDomain(e.loc) !== siteDomain)) problems.push('Some URLs belong to a different domain than the site.');
  if (origin.startsWith('https:') && entries.some((e) => e.loc.startsWith('http:'))) problems.push('Some URLs use http:// although the site uses https.');
  if (truncated) problems.push(`Only the first ${MAX_CHILDREN} child sitemaps were read, so the total is higher.`);

  const analysis: SitemapAnalysis = {
    sources,
    isIndex,
    sitemapCount: documents.length,
    urlCount: entries.length,
    withLastmod: dates.length,
    newest: dates[dates.length - 1] ?? null,
    oldest: dates[0] ?? null,
    sections: Array.from(sections, ([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    sample: entries.slice(0, 10).map((e) => e.loc),
    truncated,
    problems,
  };
  return { ok: true, analysis };
}
