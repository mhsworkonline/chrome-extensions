import type { Signature } from '../data/signatures';
import type { A11yFacts, ContactInfo, ContentData, DesignInfo, ImageInfo, JsonLdBlock, SeoData, TechHit } from '../shared/types';

export interface PageScan {
  tech: TechHit[];
  seo: SeoData;
  content: ContentData;
  images: ImageInfo[];
  contacts: ContactInfo;
  design: DesignInfo;
  a11y: A11yFacts;
  jsonLd: JsonLdBlock[];
  storage: { local: number; session: number };
}

/**
 * Runs INSIDE the inspected page (MAIN world) via chrome.scripting.executeScript.
 * It is serialized with toString(), so it must stay fully self-contained:
 * no helpers or constants from outside this function body.
 */
export function analyzePage(sigs: Signature[]): PageScan {
  const doc = document;
  const w = window as unknown as Record<string, unknown>;

  // =====================================================================
  // Technology detection
  // =====================================================================
  const urls: string[] = [];
  doc.querySelectorAll('script[src]').forEach((e) => urls.push((e as HTMLScriptElement).src));
  doc.querySelectorAll('link[href]').forEach((e) => urls.push((e as HTMLLinkElement).href));
  doc.querySelectorAll('iframe[src]').forEach((e) => urls.push((e as HTMLIFrameElement).src));
  Array.from(doc.querySelectorAll('img[src]'))
    .slice(0, 120)
    .forEach((e) => urls.push((e as HTMLImageElement).src));
  const inline = Array.from(doc.querySelectorAll('script:not([src])'))
    .slice(0, 40)
    .map((s) => (s.textContent || '').slice(0, 4000))
    .join('\n');
  const haystack = urls.join('\n') + '\n' + inline;

  const metas: Record<string, string> = {};
  doc.querySelectorAll('meta[name],meta[property]').forEach((m) => {
    const k = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase();
    if (k && !(k in metas)) metas[k] = m.getAttribute('content') || '';
  });

  const hasGlobal = (path: string): boolean => {
    try {
      let o: unknown = w;
      for (const p of path.split('.')) {
        if (o === null || o === undefined || !(p in Object(o))) return false;
        o = (o as Record<string, unknown>)[p];
      }
      return true;
    } catch {
      return false;
    }
  };
  const hasSelector = (sel: string): boolean => {
    try {
      return !!doc.querySelector(sel);
    } catch {
      return false;
    }
  };

  const tech: TechHit[] = [];
  const seen = new Set<string>();
  const add = (name: string, category: string, via: TechHit['via'], version?: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    tech.push(version ? { name, category, via, version } : { name, category, via });
  };

  for (const s of sigs) {
    let via: TechHit['via'] | null = null;
    let version: string | undefined;
    if (s.m) {
      for (const [k, re] of Object.entries(s.m)) {
        const v = metas[k];
        if (v === undefined) continue;
        const hit = new RegExp(re, 'i').exec(v);
        if (hit) {
          via = 'meta';
          version = hit[1] || undefined;
          break;
        }
      }
    }
    if (!via && s.g && s.g.some(hasGlobal)) via = 'global';
    if (!via && s.s && s.s.some((p) => new RegExp(p, 'i').test(haystack))) via = 'script';
    if (!via && s.d && s.d.some(hasSelector)) via = 'dom';
    if (via) add(s.n, s.c, via, version);
  }

  // React and Vue leave private keys on their root elements rather than globals.
  const roots = Array.from(doc.querySelectorAll('body > *, body > * > *')).slice(0, 250);
  const keysOf = (el: Element) => Object.keys(el);
  if (roots.some((el) => keysOf(el).some((k) => k.startsWith('__reactContainer$') || k.startsWith('_reactRootContainer')))) {
    add('React', 'JavaScript framework', 'dom');
  } else if (hasGlobal('__REACT_DEVTOOLS_GLOBAL_HOOK__') && hasSelector('[data-reactroot]')) {
    add('React', 'JavaScript framework', 'dom');
  }
  if (roots.some((el) => keysOf(el).some((k) => k === '__vue_app__' || k === '__vue__'))) {
    add('Vue.js', 'JavaScript framework', 'dom');
  } else if (hasGlobal('Vue.version') || hasGlobal('__VUE__')) {
    add('Vue.js', 'JavaScript framework', 'global');
  }
  if (seen.has('Next.js')) add('React', 'JavaScript framework', 'dom');
  if (seen.has('Nuxt')) add('Vue.js', 'JavaScript framework', 'dom');

  // =====================================================================
  // On-page SEO
  // =====================================================================
  const attr = (sel: string, a: string) => doc.querySelector(sel)?.getAttribute(a)?.trim() || null;
  const host = location.hostname.replace(/^www\./, '');

  const headings = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  (Object.keys(headings) as (keyof typeof headings)[]).forEach((h) => {
    headings[h] = doc.querySelectorAll(h).length;
  });

  const imgEls = Array.from(doc.querySelectorAll('img'));
  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let total = 0;
  const socialHosts: [RegExp, string][] = [
    [/(^|\.)(twitter|x)\.com$/, 'X (Twitter)'],
    [/(^|\.)facebook\.com$/, 'Facebook'],
    [/(^|\.)instagram\.com$/, 'Instagram'],
    [/(^|\.)linkedin\.com$/, 'LinkedIn'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
    [/(^|\.)tiktok\.com$/, 'TikTok'],
    [/(^|\.)github\.com$/, 'GitHub'],
    [/(^|\.)pinterest\.com$/, 'Pinterest'],
    [/(^|\.)reddit\.com$/, 'Reddit'],
    [/(^|\.)threads\.net$/, 'Threads'],
    [/(^|\.)(t\.me|telegram\.me)$/, 'Telegram'],
    [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'],
    [/(^|\.)discord\.(gg|com)$/, 'Discord'],
  ];
  const emails = new Set<string>();
  const phones = new Set<string>();
  const socials = new Map<string, { network: string; url: string }>();

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (/^mailto:/i.test(href)) {
      const e = href.slice(7).split('?')[0].trim();
      if (e) emails.add(e);
      return;
    }
    if (/^tel:/i.test(href)) {
      const p = href.slice(4).trim();
      if (p) phones.add(p);
      return;
    }
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(href, location.href);
    } catch {
      return;
    }
    total++;
    const h = u.hostname.replace(/^www\./, '');
    if (h === host) internal++;
    else {
      external++;
      const net = socialHosts.find(([re]) => re.test(h));
      if (net && !socials.has(net[1])) socials.set(net[1], { network: net[1], url: u.href });
    }
    if ((a.getAttribute('rel') || '').toLowerCase().includes('nofollow')) nofollow++;
  });

  const prefixed = (prefix: string) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(metas)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    return out;
  };

  const jsonLdTypes: string[] = [];
  const jsonLd: JsonLdBlock[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const parsed = JSON.parse(s.textContent || '');
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type'];
          if (typeof t === 'string') jsonLdTypes.push(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && jsonLdTypes.push(x));
          const g = (node as Record<string, unknown>)['@graph'];
          if (g) walk(g);
        }
      };
      walk(parsed);
      if (jsonLd.length < 6) {
        const t = (Array.isArray(parsed) ? parsed[0] : parsed)?.['@type'];
        jsonLd.push({
          type: Array.isArray(t) ? t.join(', ') : typeof t === 'string' ? t : 'Structured data',
          json: JSON.stringify(parsed, null, 2).slice(0, 3000),
        });
      }
    } catch {
      /* malformed JSON-LD is itself a finding, but not one we can parse here */
    }
  });

  const seo: SeoData = {
    url: location.href,
    https: location.protocol === 'https:',
    title: doc.title.trim() || null,
    description: attr('meta[name="description" i]', 'content'),
    canonical: attr('link[rel="canonical"]', 'href'),
    robotsMeta: attr('meta[name="robots" i]', 'content'),
    viewport: !!doc.querySelector('meta[name="viewport"]'),
    lang: doc.documentElement.getAttribute('lang'),
    charset: doc.characterSet || null,
    favicon: !!doc.querySelector('link[rel~="icon"]'),
    headings,
    h1Texts: Array.from(doc.querySelectorAll('h1'))
      .slice(0, 5)
      .map((h) => (h.textContent || '').trim().slice(0, 120))
      .filter(Boolean),
    wordCount: ((doc.body && doc.body.innerText) || '').trim().split(/\s+/).filter(Boolean).length,
    images: { total: imgEls.length, missingAlt: imgEls.filter((i) => !i.hasAttribute('alt')).length },
    links: { total, internal, external, nofollow },
    og: prefixed('og:'),
    twitter: prefixed('twitter:'),
    jsonLdTypes: Array.from(new Set(jsonLdTypes)),
    hreflangCount: doc.querySelectorAll('link[rel="alternate"][hreflang]').length,
  };

  // =====================================================================
  // Content analysis
  // =====================================================================
  const STOP = new Set(
    ('a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours get got one two new use used using may might must like make made see via')
      .split(' '),
  );
  const rootEl = (doc.querySelector('main, article, [role="main"]') as HTMLElement | null) || doc.body;
  const SKIP = 'nav, footer, aside, script, style, noscript, template, [aria-hidden="true"], [hidden]';
  let text = '';
  if (rootEl) {
    const walker = doc.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) && text.length < 200_000) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) continue;
      const t = (node.nodeValue || '').trim();
      if (t) text += t + ' ';
    }
  }
  const wordList = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const sentenceList = text.split(/[.!?]+(?:\s|$)/).filter((s) => /[\p{L}]/u.test(s));
  const lang = (doc.documentElement.getAttribute('lang') || '').toLowerCase() || null;

  const syllables = (word: string) => {
    const wd = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!wd) return 0;
    const groups = wd.replace(/e$/, '').match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
  };
  const isEnglish = !lang || lang.startsWith('en');
  const fleschEase =
    isEnglish && wordList.length >= 100 && sentenceList.length > 0
      ? 206.835 -
        1.015 * (wordList.length / sentenceList.length) -
        84.6 * (wordList.reduce((n, wd) => n + syllables(wd), 0) / wordList.length)
      : null;

  const tokens = wordList.map((x) => x.toLowerCase().replace(/^[-'’]+|[-'’]+$/g, '')).filter(Boolean);
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  tokens.forEach((tk, i) => {
    const ok = tk.length >= 3 && !STOP.has(tk) && !/^\d+$/.test(tk);
    if (ok) uni.set(tk, (uni.get(tk) || 0) + 1);
    const next = tokens[i + 1];
    if (ok && next && next.length >= 3 && !STOP.has(next) && !/^\d+$/.test(next)) {
      const k = tk + ' ' + next;
      bi.set(k, (bi.get(k) || 0) + 1);
    }
  });
  const top = (m: Map<string, number>, n: number, min: number) =>
    Array.from(m)
      .filter(([, c]) => c >= min)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  const content: ContentData = {
    lang,
    words: wordList.length,
    sentences: sentenceList.length,
    paragraphs: rootEl ? rootEl.querySelectorAll('p').length : 0,
    readingMinutes: Math.max(1, Math.round(wordList.length / 230)),
    fleschEase,
    avgSentenceWords: sentenceList.length ? wordList.length / sentenceList.length : 0,
    longSentences: sentenceList.filter((s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length > 25).length,
    textToHtmlRatio: Math.min(1, text.length / Math.max(1, doc.documentElement.innerHTML.length)),
    keywords: top(uni, 10, 2).map(([term, count]) => ({
      term,
      count,
      density: wordList.length ? Math.round((count / wordList.length) * 1000) / 10 : 0,
    })),
    phrases: top(bi, 8, 2).map(([term, count]) => ({ term, count })),
    outline: Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .slice(0, 80)
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 110) }))
      .filter((h) => h.text),
  };

  // =====================================================================
  // Images
  // =====================================================================
  const sizeByUrl = new Map<string, number>();
  for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    sizeByUrl.set(r.name, r.encodedBodySize || r.transferSize || 0);
  }
  const formatOf = (src: string) => {
    if (src.startsWith('data:')) return src.slice(5, src.indexOf(';')).replace('image/', '') || 'data';
    const m = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(?:[?#]|$)/i.exec(src.split('?')[0] + (src.includes('?') ? '?' : ''));
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'other';
  };
  const images: ImageInfo[] = imgEls
    .slice(0, 150)
    .map((i) => {
      const src = i.currentSrc || i.src || '';
      return {
        src: src.startsWith('data:') ? 'data:' + src.slice(5, 30) : src,
        alt: i.hasAttribute('alt') ? i.getAttribute('alt') : null,
        format: formatOf(src),
        displayW: Math.round(i.clientWidth),
        displayH: Math.round(i.clientHeight),
        naturalW: i.naturalWidth,
        naturalH: i.naturalHeight,
        lazy: i.loading === 'lazy',
        bytes: sizeByUrl.get(src) || 0,
      };
    })
    .filter((i) => i.src)
    .sort((a, b) => b.bytes - a.bytes || b.naturalW * b.naturalH - a.naturalW * a.naturalH)
    .slice(0, 60);

  // =====================================================================
  // Contacts
  // =====================================================================
  const visible = ((doc.body && doc.body.innerText) || '').slice(0, 100_000);
  (visible.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 10).forEach((e) => emails.add(e));
  const contacts: ContactInfo = {
    emails: Array.from(emails).slice(0, 10),
    phones: Array.from(phones).slice(0, 10),
    socials: Array.from(socials.values()),
  };

  // =====================================================================
  // Design (fonts, sizes, colors) and contrast, from one pass over computed styles
  // =====================================================================
  type RGBA = [number, number, number, number];
  const parseColor = (c: string): RGBA | null => {
    if (!c || c === 'transparent') return [0, 0, 0, 0];
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const hex = (c: RGBA) => '#' + [c[0], c[1], c[2]].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  const lum = (c: RGBA) => {
    const [r, g, b] = [c[0], c[1], c[2]].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratioOf = (a: RGBA, b: RGBA) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (top: RGBA, base: RGBA): RGBA => {
    const a = top[3];
    return [top[0] * a + base[0] * (1 - a), top[1] * a + base[1] * (1 - a), top[2] * a + base[2] * (1 - a), 1];
  };

  const bgCache = new Map<Element, RGBA>();
  const backgroundOf = (el: Element): RGBA => {
    const cached = bgCache.get(el);
    if (cached) return cached;
    const own = parseColor(getComputedStyle(el).backgroundColor);
    let result: RGBA;
    if (own && own[3] >= 0.98) result = own;
    else {
      const parent = el.parentElement;
      const base = parent ? backgroundOf(parent) : ([255, 255, 255, 1] as RGBA);
      result = own && own[3] > 0 ? over(own, base) : base;
    }
    bgCache.set(el, result);
    return result;
  };

  const fontCount = new Map<string, number>();
  const sizeCount = new Map<number, number>();
  const textColorCount = new Map<string, number>();
  const bgColorCount = new Map<string, number>();
  const loadedFonts = new Set<string>();
  try {
    doc.fonts.forEach((f) => {
      if (f.status === 'loaded') loadedFonts.add(f.family.replace(/["']/g, '').toLowerCase());
    });
  } catch {
    /* document.fonts unavailable */
  }

  let checked = 0;
  let failing = 0;
  const worst: { text: string; fg: string; bg: string; ratio: number; sizePx: number }[] = [];
  const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) || 0) + 1);

  const all = Array.from(doc.body ? doc.body.querySelectorAll('*') : []).slice(0, 1500);
  for (const el of all) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH'].includes(el.tagName.toUpperCase())) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    const bg = parseColor(cs.backgroundColor);
    if (bg && bg[3] > 0.05) bump(bgColorCount, hex(bg));

    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.nodeValue || '').trim())
      .join(' ')
      .trim();
    if (!ownText) continue;

    const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (family) bump(fontCount, family);
    const size = Math.round(parseFloat(cs.fontSize));
    if (size) bump(sizeCount, size);
    const fg = parseColor(cs.color);
    if (fg) bump(textColorCount, hex(fg));

    if (fg && checked < 300) {
      const base = backgroundOf(el);
      const solid = over(fg, base);
      const ratio = ratioOf(solid, base);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      checked++;
      if (ratio < (large ? 3 : 4.5)) {
        failing++;
        worst.push({ text: ownText.slice(0, 40), fg: hex(solid), bg: hex(base), ratio: Math.round(ratio * 100) / 100, sizePx: size });
      }
    }
  }
  worst.sort((a, b) => a.ratio - b.ratio);

  const rank = <K>(m: Map<K, number>, n: number) =>
    Array.from(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  const design: DesignInfo = {
    fonts: rank(fontCount, 8).map(([family, count]) => ({ family, count, webFont: loadedFonts.has(family.toLowerCase()) })),
    sizes: rank(sizeCount, 8).map(([px, count]) => ({ px, count })).sort((a, b) => a.px - b.px),
    textColors: rank(textColorCount, 8).map(([h, count]) => ({ hex: h, count })),
    backgrounds: rank(bgColorCount, 8).map(([h, count]) => ({ hex: h, count })),
  };

  // =====================================================================
  // Accessibility structure
  // =====================================================================
  const ids = new Map<string, number>();
  doc.querySelectorAll('[id]').forEach((e) => ids.set(e.id, (ids.get(e.id) || 0) + 1));
  const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const mains = doc.querySelectorAll('main, [role="main"]').length;
  const a11y: A11yFacts = {
    checked,
    failing,
    worst: worst.slice(0, 5),
    hasMain: mains > 0,
    multiMain: mains > 1,
    hasNav: !!doc.querySelector('nav, [role="navigation"]'),
    ariaHiddenFocusable: Array.from(doc.querySelectorAll('[aria-hidden="true"]')).filter(
      (e) => e.matches(focusable) || !!e.querySelector(focusable),
    ).length,
    positiveTabindex: Array.from(doc.querySelectorAll('[tabindex]')).filter((e) => Number(e.getAttribute('tabindex')) > 0).length,
    duplicateIds: Array.from(ids.values()).filter((n) => n > 1).length,
    iframesNoTitle: Array.from(doc.querySelectorAll('iframe')).filter((f) => !f.getAttribute('title') && !f.getAttribute('aria-label')).length,
    hasSkipLink: Array.from(doc.querySelectorAll('a[href^="#"]'))
      .slice(0, 8)
      .some((a) => /skip|main content|jump/i.test((a.textContent || '') + (a.getAttribute('aria-label') || ''))),
  };

  // =====================================================================
  // Storage
  // =====================================================================
  let local = 0;
  let session = 0;
  try {
    local = localStorage.length;
    session = sessionStorage.length;
  } catch {
    /* storage blocked for this page */
  }

  return { tech, seo, content, images, contacts, design, a11y, jsonLd, storage: { local, session } };
}
