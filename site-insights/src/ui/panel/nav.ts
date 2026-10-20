export const TABS = ['Overview', 'Traffic', 'Site health', 'Tech & security', 'My Activity'] as const;
export type Tab = (typeof TABS)[number];

/** Sub-views inside a section, switched with a small segmented control. */
export const SUBS: Partial<Record<Tab, readonly string[]>> = {
  Traffic: ['Rank', 'Visits', 'Compare', 'Watchlist'],
  'Site health': ['Speed', 'SEO', 'Content', 'Accessibility', 'Sitemap'],
  'Tech & security': ['Tech', 'Security', 'Privacy', 'Design'],
};

export const DEFAULT_SUB: Record<string, string> = {
  Traffic: 'Rank',
  'Site health': 'Speed',
  'Tech & security': 'Tech',
};

export type Go = (tab: Tab, sub?: string) => void;
