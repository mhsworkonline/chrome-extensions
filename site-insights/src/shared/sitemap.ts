/** Sitemap parsing. A service worker has no DOMParser, and sitemaps are regular enough for targeted regexes. */

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export const isSitemapIndex = (xml: string) => /<sitemapindex[\s>]/i.test(xml);

/** Entries of a <urlset> or children of a <sitemapindex>; both put the address in <loc>. */
export function parseEntries(xml: string): SitemapEntry[] {
  const tag = isSitemapIndex(xml) ? 'sitemap' : 'url';
  const out: SitemapEntry[] = [];
  for (const block of xml.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'gi'))) {
    const loc = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(block[0])?.[1];
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i.exec(block[0])?.[1] ?? null;
    out.push({ loc: decode(loc.replace(/<!\[CDATA\[|\]\]>/g, '')), lastmod });
  }
  return out;
}

/** First path segment, used to show where a site's pages are concentrated. */
export function sectionOf(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? `/${seg}/` : '/';
  } catch {
    return '/';
  }
}

export const validDate = (s: string | null): string | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};
