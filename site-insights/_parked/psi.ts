import type { PsiField, PsiMetric, PsiResult } from '../shared/types';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TTL = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 100_000;

export class PsiError extends Error {
  constructor(
    message: string,
    readonly kind: 'quota' | 'key' | 'unreachable' | 'other',
  ) {
    super(message);
  }
}

type Json = Record<string, any>; // Google's response is large and loosely typed; every read below is guarded.

const LAB_AUDITS: [id: string, label: string][] = [
  ['first-contentful-paint', 'First Contentful Paint'],
  ['largest-contentful-paint', 'Largest Contentful Paint'],
  ['total-blocking-time', 'Total Blocking Time'],
  ['cumulative-layout-shift', 'Cumulative Layout Shift'],
  ['speed-index', 'Speed Index'],
];

const FIELD_METRICS: [id: string, label: string, fmt: (p: number) => string][] = [
  ['LARGEST_CONTENTFUL_PAINT_MS', 'LCP', (p) => `${(p / 1000).toFixed(1)} s`],
  ['INTERACTION_TO_NEXT_PAINT', 'INP', (p) => `${Math.round(p)} ms`],
  ['CUMULATIVE_LAYOUT_SHIFT_SCORE', 'CLS', (p) => (p / 100).toFixed(2)],
  ['FIRST_CONTENTFUL_PAINT_MS', 'FCP', (p) => `${(p / 1000).toFixed(1)} s`],
  ['EXPERIMENTAL_TIME_TO_FIRST_BYTE', 'TTFB', (p) => `${Math.round(p)} ms`],
];

const score = (cat: Json | undefined): number | null =>
  typeof cat?.score === 'number' ? Math.round(cat.score * 100) : null;

function parseField(json: Json): PsiField | null {
  const own = json.loadingExperience;
  const useUrl = own?.metrics && Object.keys(own.metrics).length > 0;
  const exp: Json | undefined = useUrl ? own : json.originLoadingExperience;
  if (!exp?.metrics || Object.keys(exp.metrics).length === 0) return null;

  const metrics = FIELD_METRICS.flatMap(([id, label, fmt]) => {
    const m = exp.metrics[id];
    return typeof m?.percentile === 'number' ? [{ label, display: fmt(m.percentile), category: String(m.category ?? '') }] : [];
  });
  return metrics.length ? { scope: useUrl ? 'url' : 'origin', overall: exp.overall_category ?? null, metrics } : null;
}

export function parsePsi(json: Json, url: string, strategy: PsiResult['strategy']): PsiResult {
  const lh: Json | undefined = json.lighthouseResult;
  if (!lh) throw new PsiError('Google returned an unexpected response.', 'other');

  const audits: Json = lh.audits ?? {};
  const lab: PsiMetric[] = LAB_AUDITS.flatMap(([id, label]) => {
    const a = audits[id];
    return a ? [{ label, display: String(a.displayValue ?? '—'), score: typeof a.score === 'number' ? a.score : null }] : [];
  });

  const opportunities = Object.values<Json>(audits)
    .filter((a) => a?.details?.type === 'opportunity' && a.details.overallSavingsMs > 0)
    .map((a) => ({ title: String(a.title), savingsMs: Number(a.details.overallSavingsMs) }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 6);

  return {
    url,
    strategy,
    fetchedAt: Date.now(),
    scores: {
      performance: score(lh.categories?.performance),
      accessibility: score(lh.categories?.accessibility),
      bestPractices: score(lh.categories?.['best-practices']),
      seo: score(lh.categories?.seo),
    },
    lab,
    opportunities,
    field: parseField(json),
  };
}

const cacheKey = (url: string, strategy: string) => `psi:${strategy}:${url}`;

export async function cachedPsi(url: string, strategy: PsiResult['strategy']): Promise<PsiResult | null> {
  const k = cacheKey(url, strategy);
  const got = (await chrome.storage.local.get(k))[k] as PsiResult | undefined;
  return got && Date.now() - got.fetchedAt < TTL ? got : null;
}

/**
 * Runs Google PageSpeed Insights (real Lighthouse, on Google's servers). Only called when the user asks:
 * it sends the page URL to Google. Called from the UI page so a long run isn't cut off by the service worker.
 */
export async function runPsi(url: string, strategy: PsiResult['strategy'], apiKey: string): Promise<PsiResult> {
  const params = new URLSearchParams({ url, strategy });
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) params.append('category', c);
  if (apiKey) params.set('key', apiKey);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new PsiError('Couldn’t reach Google PageSpeed Insights. It may have timed out.', 'unreachable');
  }

  if (!res.ok) {
    const body: Json = await res.json().catch(() => ({}));
    const msg = String(body.error?.message ?? '');
    if (res.status === 429) {
      throw new PsiError(
        apiKey
          ? 'Your Google API key hit its daily limit. Try again tomorrow.'
          : 'The shared free quota is used up. Add your own free Google API key in Settings.',
        'quota',
      );
    }
    if (res.status === 400 && /key/i.test(msg)) throw new PsiError('Google rejected the API key. Check it in Settings.', 'key');
    if (res.status === 403) throw new PsiError('This key can’t use PageSpeed Insights. Enable that API for it in Google Cloud.', 'key');
    if (res.status === 500 || /fail|unable|lighthouse/i.test(msg)) {
      throw new PsiError('Google couldn’t analyse this page. It may be private, blocked or not publicly reachable.', 'other');
    }
    throw new PsiError(`Google responded with an error (${res.status}).`, 'other');
  }

  const result = parsePsi(await res.json(), url, strategy);
  await chrome.storage.local.set({ [cacheKey(url, strategy)]: result });
  return result;
}
