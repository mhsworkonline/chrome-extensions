import type { A11yFacts, CheckStatus, ContentData, PageAnalysis, PerfCheck, PrivacyFacts } from './types';

export interface Finding {
  label: string;
  status: CheckStatus;
  detail: string;
}

/** Trackers are scripts whose purpose is advertising, profiling or cross-site analytics. */
const TRACKER_CATEGORIES = new Set(['Advertising', 'Analytics', 'Marketing', 'A/B testing']);

export const trackersOf = (a: PageAnalysis) => a.tech.filter((t) => TRACKER_CATEGORIES.has(t.category));
export const consentToolsOf = (a: PageAnalysis) => a.tech.filter((t) => t.category === 'Consent');

/** Cookie names that belong to well-known advertising and analytics products. */
const TRACKING_COOKIE = /^(_ga|_gid|_gat|_gcl_|_fbp|_fbc|fr$|IDE$|NID$|_uet|_hj|ajs_|mp_|_pk_|_clck|_clsk|__utm|_tt_|_pin_unauth|_scid|li_|bcookie|lidc|personalization_id|guest_id|MUID|ANONCHK|test_cookie)/i;
export const isTrackingCookie = (name: string) => TRACKING_COOKIE.test(name);

export function privacyFindings(page: PageAnalysis | null, facts: PrivacyFacts | null): Finding[] {
  const out: Finding[] = [];
  if (page) {
    const trackers = trackersOf(page);
    out.push({
      label: 'Trackers',
      status: trackers.length <= 2 ? 'pass' : trackers.length <= 6 ? 'warn' : 'fail',
      detail: trackers.length ? `${trackers.length} advertising or analytics tools: ${trackers.slice(0, 4).map((t) => t.name).join(', ')}${trackers.length > 4 ? '…' : ''}.` : 'No advertising or analytics scripts found.',
    });
    if (trackers.length > 0) {
      const consent = consentToolsOf(page);
      out.push({
        label: 'Consent tool',
        status: consent.length ? 'pass' : 'warn',
        detail: consent.length ? `${consent[0].name} detected.` : 'Trackers are present but no consent tool was found on the page. One may load after interaction.',
      });
    }
  }
  if (facts) {
    const d = facts.thirdPartyDomains.length;
    out.push({
      label: 'Third-party domains',
      status: d <= 5 ? 'pass' : d <= 15 ? 'warn' : 'fail',
      detail: `${d} other sites receive requests from this page.`,
    });
    const insecure = facts.cookies.filter((c) => !c.secure).length;
    out.push({
      label: 'Cookie security',
      status: insecure === 0 ? 'pass' : 'warn',
      detail: insecure === 0 ? 'Every cookie is marked Secure.' : `${insecure} cookie${insecure > 1 ? 's' : ''} without the Secure flag.`,
    });
    const tracking = facts.cookies.filter((c) => c.tracking).length;
    out.push({
      label: 'Tracking cookies',
      status: tracking === 0 ? 'pass' : tracking <= 3 ? 'warn' : 'fail',
      detail: tracking === 0 ? 'No cookies from well-known tracking products.' : `${tracking} cookie${tracking > 1 ? 's' : ''} from known tracking products.`,
    });
  }
  return out;
}

export function exposureLevel(findings: Finding[]): 'Low' | 'Medium' | 'High' {
  if (findings.some((f) => f.status === 'fail')) return 'High';
  return findings.filter((f) => f.status === 'warn').length >= 2 ? 'Medium' : 'Low';
}

export function contentFindings(c: ContentData): Finding[] {
  const out: Finding[] = [];
  out.push({
    label: 'Content length',
    status: c.words >= 300 ? 'pass' : c.words >= 100 ? 'warn' : 'fail',
    detail: `${c.words.toLocaleString()} words. Pages under 300 words are often considered thin.`,
  });
  if (c.fleschEase !== null) {
    out.push({
      label: 'Readability',
      status: c.fleschEase >= 50 ? 'pass' : c.fleschEase >= 30 ? 'warn' : 'fail',
      detail: `Flesch score ${Math.round(c.fleschEase)}. ${readingLevel(c.fleschEase)}.`,
    });
  }
  if (c.avgSentenceWords > 0) {
    out.push({
      label: 'Sentence length',
      status: c.avgSentenceWords <= 20 ? 'pass' : c.avgSentenceWords <= 25 ? 'warn' : 'fail',
      detail: `Average ${c.avgSentenceWords.toFixed(1)} words per sentence; ${c.longSentences} over 25 words.`,
    });
  }
  return out;
}

export function readingLevel(score: number): string {
  if (score >= 90) return 'Very easy';
  if (score >= 70) return 'Easy';
  if (score >= 60) return 'Plain English';
  if (score >= 50) return 'Fairly difficult';
  if (score >= 30) return 'Difficult';
  return 'Very difficult';
}

export function a11yFindings(a: A11yFacts): Finding[] {
  const out: Finding[] = [];
  const f = (label: string, n: number, ok: string, bad: string, level: CheckStatus = 'warn') =>
    out.push({ label, status: n === 0 ? 'pass' : level, detail: n === 0 ? ok : bad });

  if (a.checked > 0) {
    const share = a.failing / a.checked;
    out.push({
      label: 'Text contrast',
      status: a.failing === 0 ? 'pass' : share > 0.1 ? 'fail' : 'warn',
      detail: a.failing === 0 ? `All ${a.checked} sampled text elements meet WCAG AA contrast.` : `${a.failing} of ${a.checked} sampled text elements are below WCAG AA contrast. Background images aren't considered.`,
    });
  }
  out.push({ label: 'Main landmark', status: a.hasMain && !a.multiMain ? 'pass' : 'warn', detail: !a.hasMain ? 'No <main> landmark, which screen readers use to skip to the content.' : a.multiMain ? 'More than one <main> landmark.' : 'One <main> landmark.' });
  out.push({ label: 'Skip link', status: a.hasSkipLink ? 'pass' : 'warn', detail: a.hasSkipLink ? 'A skip-to-content link is present.' : 'No skip-to-content link for keyboard users.' });
  f('Focusable content hidden', a.ariaHiddenFocusable, 'No focusable elements are hidden from assistive tech.', `${a.ariaHiddenFocusable} focusable element(s) are inside aria-hidden regions.`, 'fail');
  f('Tab order', a.positiveTabindex, 'No positive tabindex values.', `${a.positiveTabindex} element(s) use a positive tabindex, which breaks natural tab order.`);
  f('Unique IDs', a.duplicateIds, 'All element IDs are unique.', `${a.duplicateIds} duplicate ID(s), which can break labels and ARIA references.`);
  f('Frame titles', a.iframesNoTitle, 'Every iframe has a title.', `${a.iframesNoTitle} iframe(s) without a title.`);
  return out;
}

/** The speed measurement also checks labels, names, zoom and headings; this picks out those accessibility ones. */
export const perfA11y = (checks: PerfCheck[]): Finding[] =>
  checks.filter((c) => c.group === 'Accessibility').map(({ label, status, detail }) => ({ label, status, detail }));
