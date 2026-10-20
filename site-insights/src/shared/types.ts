export type SourceTag = 'measured' | 'estimated' | 'provider' | 'local';

export interface Snapshot<T> {
  fetchedAt: number;
  ttl: number;
  /** The real date range the data covers (ISO dates). */
  span: { from: string; to: string } | null;
  source: SourceTag;
  payload: T;
}

export interface RankPoint {
  date: string;
  rank: number;
}

export interface RankPayload {
  history: RankPoint[];
}

export type SiteResult =
  | {
      ok: true;
      domain: string;
      url: string;
      tabId: number;
      favIconUrl?: string;
      rank: Snapshot<RankPayload> | null;
      rankError?: string;
    }
  | { ok: false; reason: 'unsupported-page' };

export type RankResult =
  | { ok: true; domain: string; rank: Snapshot<RankPayload> }
  | { ok: false; error: string };

export interface TechHit {
  name: string;
  category: string;
  via: 'script' | 'global' | 'meta' | 'dom';
  version?: string;
}

export interface SeoData {
  url: string;
  https: boolean;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  viewport: boolean;
  lang: string | null;
  charset: string | null;
  favicon: boolean;
  headings: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', number>;
  h1Texts: string[];
  wordCount: number;
  images: { total: number; missingAlt: number };
  links: { total: number; internal: number; external: number; nofollow: number };
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonLdTypes: string[];
  hreflangCount: number;
}

export interface ContentData {
  lang: string | null;
  words: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
  /** Flesch reading ease, 0 to 100 (higher is easier). Null when the text isn't English or is too short. */
  fleschEase: number | null;
  avgSentenceWords: number;
  longSentences: number;
  /** Visible text length divided by HTML length, 0 to 1. */
  textToHtmlRatio: number;
  keywords: { term: string; count: number; density: number }[];
  phrases: { term: string; count: number }[];
  outline: { level: number; text: string }[];
}

export interface ImageInfo {
  src: string;
  alt: string | null;
  format: string;
  displayW: number;
  displayH: number;
  naturalW: number;
  naturalH: number;
  lazy: boolean;
  /** Transfer size, 0 when the browser doesn't expose it (cross-origin). */
  bytes: number;
}

export interface ContactInfo {
  emails: string[];
  phones: string[];
  socials: { network: string; url: string }[];
}

export interface DesignInfo {
  fonts: { family: string; count: number; webFont: boolean }[];
  sizes: { px: number; count: number }[];
  textColors: { hex: string; count: number }[];
  backgrounds: { hex: string; count: number }[];
}

export interface ContrastSample {
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  sizePx: number;
}

export interface A11yFacts {
  checked: number;
  failing: number;
  worst: ContrastSample[];
  hasMain: boolean;
  multiMain: boolean;
  hasNav: boolean;
  ariaHiddenFocusable: number;
  positiveTabindex: number;
  duplicateIds: number;
  iframesNoTitle: number;
  hasSkipLink: boolean;
}

export interface JsonLdBlock {
  type: string;
  json: string;
}

export interface PageAnalysis {
  tech: TechHit[];
  seo: SeoData;
  robotsTxt: { found: boolean; sitemaps: string[] } | null;
  content: ContentData;
  images: ImageInfo[];
  contacts: ContactInfo;
  design: DesignInfo;
  a11y: A11yFacts;
  jsonLd: JsonLdBlock[];
  storage: { local: number; session: number };
}

export type PageResult =
  | { ok: true; domain: string; url: string; analysis: PageAnalysis }
  | { ok: false; reason: string };

export interface Visit {
  id: string;
  domain: string;
  startedAt: number;
  activeMs: number;
  pageViews: number;
  bounced: boolean;
}

export interface Settings {
  trackActivity: boolean;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface PerfCheck {
  group: 'Performance' | 'Accessibility' | 'Best practices';
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PerfResource {
  url: string;
  type: string;
  bytes: number;
  durationMs: number;
  thirdParty: boolean;
}

/** Raw measurements gathered inside the page; interpreted in the worker. */
export interface PerfFacts {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  domContentLoaded: number | null;
  load: number | null;
  protocol: string;
  documentCompressed: boolean | null;
  resources: { url: string; initiator: string; bytes: number; durationMs: number }[];
  dom: {
    nodes: number;
    imagesNoDimensions: number;
    imagesOversized: number;
    imagesBelowFoldEager: number;
    renderBlockingScripts: number;
    renderBlockingStyles: number;
    inputsNoLabel: number;
    buttonsNoName: number;
    linksNoName: number;
    headingSkips: number;
    zoomBlocked: boolean;
    hasDoctype: boolean;
    hasCharset: boolean;
    mixedContent: number;
    lang: boolean;
  };
}

export interface PerfAnalysis {
  facts: PerfFacts;
  totalBytes: number;
  requests: number;
  unknownSizeRequests: number;
  byType: { type: string; count: number; bytes: number }[];
  heaviest: PerfResource[];
  thirdParties: { domain: string; requests: number; bytes: number }[];
  checks: PerfCheck[];
}

export type PerfResult = { ok: true; url: string; analysis: PerfAnalysis } | { ok: false; reason: string };

/** `tabId` pins a request to one tab; without it the worker uses whichever tab is active. */
export type Message =
  | { type: 'getSite'; tabId?: number }
  | { type: 'getRank'; domain: string }
  | { type: 'getPage'; tabId?: number }
  | { type: 'getPerf'; tabId?: number }
  | { type: 'getSecurity'; tabId?: number }
  | { type: 'getPrivacy'; tabId?: number }
  | { type: 'getSitemap'; tabId?: number };

// ----- Security headers -----
export interface SecurityCheck {
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
}

export interface SecurityAnalysis {
  url: string;
  status: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  checks: SecurityCheck[];
  server: { software: string | null; poweredBy: string | null; platforms: string[] };
  headers: { name: string; value: string }[];
}

export type SecurityResult = { ok: true; analysis: SecurityAnalysis } | { ok: false; reason: string };

// ----- Privacy -----
export interface CookieInfo {
  name: string;
  domain: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  session: boolean;
  expiresInDays: number | null;
  size: number;
  tracking: boolean;
}

export interface PrivacyFacts {
  cookies: CookieInfo[];
  thirdPartyDomains: { domain: string; requests: number; cookies: number }[];
}

export type PrivacyResult = { ok: true; facts: PrivacyFacts } | { ok: false; reason: string };

// ----- Sitemap -----
export interface SitemapAnalysis {
  sources: string[];
  isIndex: boolean;
  sitemapCount: number;
  urlCount: number;
  withLastmod: number;
  newest: string | null;
  oldest: string | null;
  sections: { path: string; count: number }[];
  sample: string[];
  /** True when some child sitemaps weren't fetched. */
  truncated: boolean;
  problems: string[];
}

export type SitemapResult = { ok: true; analysis: SitemapAnalysis } | { ok: false; reason: string };

// ----- Local history -----
export interface PerfPoint {
  ts: number;
  url: string;
  lcp: number | null;
  fcp: number | null;
  cls: number | null;
  ttfb: number | null;
  load: number | null;
  bytes: number;
  requests: number;
}
