import { parse } from 'tldts';

/** Registrable domain for an http(s) URL, or null for pages we can't analyse. */
export function registrableDomain(url: string | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const r = parse(u.hostname);
  if (r.isIp || !r.domain) return null;
  return r.domain;
}
