import { runSeoChecks } from './seo-score';
import { a11yFindings, contentFindings, perfA11y, privacyFindings } from './checks';
import type { PageResult, PerfResult, PrivacyResult, SecurityResult } from './types';

export type Area = 'Security' | 'Privacy' | 'SEO' | 'Speed' | 'Accessibility' | 'Content' | 'Best practices';

export interface Issue {
  area: Area;
  label: string;
  detail: string;
  status: 'warn' | 'fail';
  /** Where the full detail lives. */
  tab: 'Site health' | 'Tech & security';
  sub: string;
}

const WHERE: Record<Area, Pick<Issue, 'tab' | 'sub'>> = {
  Security: { tab: 'Tech & security', sub: 'Security' },
  Privacy: { tab: 'Tech & security', sub: 'Privacy' },
  SEO: { tab: 'Site health', sub: 'SEO' },
  Speed: { tab: 'Site health', sub: 'Speed' },
  'Best practices': { tab: 'Site health', sub: 'Speed' },
  Accessibility: { tab: 'Site health', sub: 'Accessibility' },
  Content: { tab: 'Site health', sub: 'Content' },
};

/** Listed in this order when two problems are equally serious. */
const ORDER: Area[] = ['Security', 'Privacy', 'SEO', 'Speed', 'Accessibility', 'Content', 'Best practices'];

export interface Sources {
  scan: PageResult | null;
  perf: PerfResult | null;
  security: SecurityResult | null;
  privacy: PrivacyResult | null;
}

/** Everything that isn't passing, most serious first. Passing checks are not issues. */
export function collectIssues({ scan, perf, security, privacy }: Sources): Issue[] {
  const issues: Issue[] = [];
  const push = (area: Area, f: { label: string; status: string; detail: string }) => {
    if (f.status === 'pass') return;
    issues.push({ area, label: f.label, detail: f.detail, status: f.status as 'warn' | 'fail', ...WHERE[area] });
  };

  if (security?.ok) security.analysis.checks.forEach((c) => push('Security', c));
  if (scan?.ok || privacy?.ok) {
    privacyFindings(scan?.ok ? scan.analysis : null, privacy?.ok ? privacy.facts : null).forEach((f) => push('Privacy', f));
  }
  if (scan?.ok) runSeoChecks(scan.analysis).forEach((c) => push('SEO', c));
  if (perf?.ok) perf.analysis.checks.filter((c) => c.group !== 'Accessibility').forEach((c) => push(c.group === 'Performance' ? 'Speed' : 'Best practices', c));
  if (scan?.ok) a11yFindings(scan.analysis.a11y).forEach((f) => push('Accessibility', f));
  if (perf?.ok) perfA11y(perf.analysis.checks).forEach((f) => push('Accessibility', f));
  if (scan?.ok) contentFindings(scan.analysis.content).forEach((f) => push('Content', f));

  // Array.sort is stable, so checks keep their natural order within a severity and area.
  return issues.sort(
    (a, b) => Number(b.status === 'fail') - Number(a.status === 'fail') || ORDER.indexOf(a.area) - ORDER.indexOf(b.area),
  );
}
