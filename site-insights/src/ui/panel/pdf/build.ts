import type { jsPDF } from 'jspdf';
import type { CellHookData } from 'jspdf-autotable';
import { formatRange } from '../../../shared/estimate';
import { a11yFindings, consentToolsOf, exposureLevel, perfA11y, privacyFindings, trackersOf, contentFindings, readingLevel } from '../../../shared/checks';
import { formatBytes, formatMs, rate, type Rating } from '../../../shared/perf';
import { runSeoChecks } from '../../../shared/seo-score';
import type { Report } from '../export';
import { PDF_PALETTE } from './palette';

export interface ChartImages {
  rank?: string;
  visits?: string;
  weight?: string;
  speed?: string;
}

type RGB = readonly [number, number, number];
const C = {
  primary: [91, 103, 224] as RGB,
  ink: [27, 32, 51] as RGB,
  muted: [107, 115, 133] as RGB,
  line: [227, 230, 239] as RGB,
  soft: [246, 247, 251] as RGB,
  good: [21, 128, 61] as RGB,
  warn: [180, 110, 0] as RGB,
  bad: [198, 40, 40] as RGB,
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 16;

/**
 * jsPDF's built-in fonts only cover Latin-1, so typographic punctuation is swapped for plain
 * equivalents and anything else outside Latin-1 becomes "?". Non-Latin page text therefore
 * appears as question marks in the PDF.
 */
export function pdfSafe(input: unknown): string {
  return String(input ?? '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/[✓✔]/g, 'OK')
    .replace(/[✕✖]/g, 'x')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]/g, '?');
}

const S = pdfSafe;
const STATUS = { pass: 'Pass', warn: 'Improve', fail: 'Fail' } as const;
const RATING: Record<Rating, string> = { good: 'Good', warn: 'Needs work', bad: 'Poor' };

type Cell = string | number;

export async function buildPdf(r: Report, charts: ChartImages = {}, logo?: string): Promise<jsPDF> {
  const [{ jsPDF: PDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new PDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Site Insights report: ${S(r.domain)}`, subject: S(r.url), creator: 'Site Insights' });

  let y = 0;

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = M + 2;
    }
  };

  const heading = (title: string) => {
    ensure(48);
    y += 5;
    doc.setFont('helvetica', 'bold').setFontSize(13);
    color(C.ink);
    doc.text(S(title), M, y);
    y += 2.5;
    doc.setDrawColor(...C.primary).setLineWidth(0.7).line(M, y, M + 20, y);
    y += 5;
  };

  const sub = (title: string) => {
    ensure(14);
    doc.setFont('helvetica', 'bold').setFontSize(9.5);
    color(C.muted);
    doc.text(S(title).toUpperCase(), M, y);
    y += 4.5;
  };

  const note = (text: string) => {
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    color(C.muted);
    const lines = doc.splitTextToSize(S(text), W) as string[];
    ensure(lines.length * 3.8 + 3);
    doc.text(lines, M, y);
    y += lines.length * 3.8 + 2.5;
  };

  const picture = (data: string | undefined, ratio: number, width = W) => {
    if (!data) return;
    const h = width * ratio;
    ensure(h + 3);
    doc.addImage(data, 'PNG', M, y, width, h);
    y += h + 4;
  };

  /** Colours status words so pass, improve and fail read at a glance. */
  const tint = (data: CellHookData) => {
    if (data.section !== 'body') return;
    const v = String(data.cell.raw);
    const c = v === 'Pass' || v === 'Good' ? C.good : v === 'Improve' || v === 'Needs work' ? C.warn : v === 'Fail' || v === 'Poor' ? C.bad : null;
    if (c) {
      data.cell.styles.textColor = [c[0], c[1], c[2]];
      data.cell.styles.fontStyle = 'bold';
    }
  };

  const table = (head: string[], body: Cell[][], widths?: (number | 'auto')[]) => {
    if (!body.length) return;
    autoTable(doc, {
      startY: y,
      head: [head.map(S)],
      body: body.map((row) => row.map((c) => S(c))),
      margin: { left: M, right: M, bottom: 18 },
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.9, textColor: [...C.ink], lineColor: [...C.line], overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [...C.primary], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [...C.soft] },
      columnStyles: widths ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])) : undefined,
      didParseCell: tint,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  };

  const facts = (rows: [string, Cell][]) => {
    autoTable(doc, {
      startY: y,
      body: rows.map(([k, v]) => [S(k), S(v)]),
      margin: { left: M, right: M, bottom: 18 },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.4, bottom: 1.4, left: 1, right: 1 }, textColor: [...C.ink], overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 52, textColor: [...C.muted] }, 1: { fontStyle: 'bold' } },
      didParseCell: tint,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  const unavailable = (what: string, reason: string) => note(`${what} is not available: ${reason}`);

  // =====================================================================
  // Cover
  // =====================================================================
  doc.setFillColor(...C.primary).rect(0, 0, PAGE_W, 40, 'F');
  if (logo) doc.addImage(logo, 'PNG', M, 9, 20, 20);
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(255, 255, 255);
  doc.text(S(r.domain), logo ? M + 25 : M, 20);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(235, 237, 255);
  doc.text(S(r.url).slice(0, 95), logo ? M + 25 : M, 27);
  doc.text(`Site Insights report  |  ${new Date(r.generatedAt).toLocaleString()}`, logo ? M + 25 : M, 33);
  y = 49;

  // ----- scorecards -----
  const seo = r.seoScore;
  const priv = r.scan.ok || r.privacy.ok ? privacyFindings(r.scan.ok ? r.scan.analysis : null, r.privacy.ok ? r.privacy.facts : null) : null;
  const level = priv ? exposureLevel(priv) : null;
  const cards: { label: string; value: string; tone: RGB }[] = [
    { label: 'GLOBAL RANK', value: r.traffic.rank ? `#${r.traffic.rank.toLocaleString()}` : 'Not ranked', tone: C.ink },
    { label: 'EST. VISITS / MONTH', value: r.traffic.estimate ? formatRange(r.traffic.estimate) : 'n/a', tone: C.ink },
    { label: 'SEO SCORE', value: seo === null ? 'n/a' : `${seo} / 100`, tone: seo === null ? C.muted : seo >= 80 ? C.good : seo >= 50 ? C.warn : C.bad },
    { label: 'SECURITY', value: r.security.ok ? `Grade ${r.security.analysis.grade}` : 'n/a', tone: !r.security.ok ? C.muted : 'AB'.includes(r.security.analysis.grade) ? C.good : r.security.analysis.grade === 'C' ? C.warn : C.bad },
    { label: 'PRIVACY', value: level ? `${level} exposure` : 'n/a', tone: level === 'Low' ? C.good : level === 'Medium' ? C.warn : level === 'High' ? C.bad : C.muted },
  ];
  const gap = 3;
  const cw = (W - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => {
    const x = M + i * (cw + gap);
    doc.setDrawColor(...C.line).setLineWidth(0.3).setFillColor(...C.soft).roundedRect(x, y, cw, 20, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold').setFontSize(6.5);
    color(C.muted);
    doc.text(c.label, x + 3, y + 6);
    doc.setFontSize(11);
    color(c.tone);
    doc.text(S(c.value), x + 3, y + 14, { maxWidth: cw - 5 });
  });
  y += 27;

  // =====================================================================
  // Top things to fix
  // =====================================================================
  heading('Top things to fix');
  if (r.issues.length) {
    note(`${r.issues.length} findings across security, privacy, SEO, speed, accessibility and content, most serious first.`);
    table(
      ['Area', 'Issue', 'Severity', 'Detail'],
      r.issues.map((i) => [i.area, i.label, i.status === 'fail' ? 'Fail' : 'Improve', i.detail]),
      [26, 36, 20, 'auto'],
    );
  } else {
    note('No issues were found by the checks that could run on this page.');
  }

  // =====================================================================
  // Traffic
  // =====================================================================
  heading('Traffic');
  const hist = r.traffic.history;
  if (r.traffic.rank && r.traffic.estimate) {
    const last = hist[hist.length - 1];
    const first = hist[0];
    const month = hist.filter((p) => Date.parse(p.date) >= Date.parse(last.date) - 29 * 86_400_000);
    const change = month.length > 1 ? month[0].rank - last.rank : 0;
    facts([
      ['Global rank (Tranco)', `#${r.traffic.rank.toLocaleString()}`],
      ['Estimated monthly visits', `${formatRange(r.traffic.estimate)}   (estimate)`],
      ['Rank change, last 30 days', change === 0 ? 'No change' : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change).toLocaleString()} places`],
      ['Best / worst saved rank', `#${Math.min(...hist.map((p) => p.rank)).toLocaleString()} / #${Math.max(...hist.map((p) => p.rank)).toLocaleString()}`],
      ['History saved', `${hist.length} days (${first.date} to ${last.date})`],
    ]);
    if (charts.rank) {
      sub('Rank over time (lower is better)');
      picture(charts.rank, 0.36);
    }
    if (charts.visits) {
      sub('Estimated monthly visits (line = midpoint, band = likely range)');
      picture(charts.visits, 0.36);
    }
    note('The visit figure is modeled from the rank and shown as a range. It is an estimate, not a measurement. Tranco blends link and DNS data rather than visits, so it can over-rank sites that are heavily linked but rarely visited. Bounce rate, visit duration and traffic sources for other sites are not available without paid panel data.');
  } else {
    note('This site is not in the Tranco top 1 million, so its rank and traffic cannot be estimated.');
  }

  // =====================================================================
  // Technology
  // =====================================================================
  heading('Technology');
  if (r.scan.ok) {
    const byCat = new Map<string, string[]>();
    for (const t of r.scan.analysis.tech) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t.version ? `${t.name} ${t.version}` : t.name]);
    if (byCat.size) {
      note(`${r.scan.analysis.tech.length} technologies detected in the page's own code.`);
      table(['Category', 'Technologies'], Array.from(byCat, ([c, names]) => [c, names.join(', ')]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [45, 'auto']);
    } else note('No known technologies were recognised.');
  } else unavailable('Technology detection', r.scan.reason);

  // =====================================================================
  // SEO
  // =====================================================================
  heading('SEO');
  if (r.scan.ok) {
    const a = r.scan.analysis;
    const s = a.seo;
    facts([
      ['Score', seo === null ? 'n/a' : `${seo} / 100`],
      ['Title', s.title ?? 'Missing'],
      ['Meta description', s.description ?? 'Missing'],
      ['Canonical URL', s.canonical ?? 'None'],
      ['Language', s.lang ?? 'Not set'],
      ['Headings', (Object.keys(s.headings) as (keyof typeof s.headings)[]).map((h) => `${h.toUpperCase()}: ${s.headings[h]}`).join('   ')],
      ['Links', `${s.links.internal} internal, ${s.links.external} external, ${s.links.nofollow} nofollow`],
      ['Images missing alt text', `${s.images.missingAlt} of ${s.images.total}`],
      ['Structured data', s.jsonLdTypes.length ? s.jsonLdTypes.join(', ') : 'None'],
      ['Open Graph tags', Object.keys(s.og).length ? Object.keys(s.og).slice(0, 8).join(', ') : 'None'],
    ]);
    sub('Checks');
    table(['Check', 'Result', 'Detail'], runSeoChecks(a).map((c) => [c.label, STATUS[c.status], c.detail]), [42, 20, 'auto']);
  } else unavailable('SEO analysis', r.scan.reason);

  // =====================================================================
  // Content
  // =====================================================================
  heading('Content');
  if (r.scan.ok) {
    const a = r.scan.analysis;
    const c = a.content;
    facts([
      ['Words', c.words.toLocaleString()],
      ['Reading time', `${c.readingMinutes} min`],
      ['Reading ease', c.fleschEase !== null ? `${Math.round(c.fleschEase)} (${readingLevel(c.fleschEase)})` : 'n/a (English text of 100+ words only)'],
      ['Sentences / paragraphs', `${c.sentences} / ${c.paragraphs}`],
      ['Average sentence length', c.avgSentenceWords ? `${c.avgSentenceWords.toFixed(1)} words (${c.longSentences} over 25 words)` : 'n/a'],
      ['Text share of HTML', `${(c.textToHtmlRatio * 100).toFixed(0)}%`],
    ]);
    const cf = contentFindings(c);
    if (cf.length) table(['Check', 'Result', 'Detail'], cf.map((f) => [f.label, STATUS[f.status], f.detail]), [42, 20, 'auto']);
    if (c.keywords.length) {
      sub('Top keywords');
      table(['Keyword', 'Count', '% of words'], c.keywords.map((k) => [k.term, k.count, `${k.density}%`]), ['auto', 25, 30]);
    }
    if (c.phrases.length) {
      sub('Common phrases');
      note(c.phrases.map((p) => `${p.term} (${p.count})`).join('   |   '));
    }
    if (c.outline.length) {
      sub('Heading outline');
      table(['Level', 'Heading'], c.outline.slice(0, 60).map((h) => [`H${h.level}`, `${'   '.repeat(Math.max(0, h.level - 1))}${h.text}`]), [16, 'auto']);
      if (c.outline.length > 60) note(`Showing 60 of ${c.outline.length} headings.`);
    }

    const imgs = a.images;
    if (imgs.length) {
      sub('Images');
      const modern = imgs.filter((i) => ['webp', 'avif', 'svg'].includes(i.format)).length;
      facts([
        ['Images found', String(imgs.length)],
        ['Modern formats', `${modern} of ${imgs.length}`],
        ['Much larger than shown', String(imgs.filter((i) => i.displayW > 0 && i.naturalW > i.displayW * 2.5).length)],
        ['Without alt attribute', String(imgs.filter((i) => i.alt === null).length)],
      ]);
      const name = (src: string) => {
        try {
          return decodeURIComponent(new URL(src).pathname.split('/').filter(Boolean).pop() ?? src).slice(0, 38);
        } catch {
          return src.slice(0, 38);
        }
      };
      table(
        ['Image', 'Format', 'Shown', 'File', 'Size'],
        imgs.slice(0, 15).map((i) => [name(i.src), i.format.toUpperCase(), i.displayW ? `${i.displayW}x${i.displayH}` : '-', `${i.naturalW}x${i.naturalH}`, i.bytes ? formatBytes(i.bytes) : '-']),
      );
    }

    const k = a.contacts;
    if (k.emails.length || k.phones.length || k.socials.length) {
      sub('Contacts and social links');
      facts([
        ...(k.emails.length ? ([['Emails', k.emails.join(', ')]] as [string, string][]) : []),
        ...(k.phones.length ? ([['Phone numbers', k.phones.join(', ')]] as [string, string][]) : []),
        ...(k.socials.length ? ([['Social profiles', k.socials.map((s) => s.network).join(', ')]] as [string, string][]) : []),
      ]);
    }
  } else unavailable('Content analysis', r.scan.reason);

  // =====================================================================
  // Speed
  // =====================================================================
  heading('Speed');
  if (r.perf.ok) {
    const a = r.perf.analysis;
    const f = a.facts;
    note('Measured in this browser on one device and connection, not simulated. These timings differ from Lighthouse scores, which simulate a throttled phone.');
    const metric = (label: string, key: 'lcp' | 'fcp' | 'cls' | 'inp' | 'ttfb', fmt: (v: number) => string): Cell[] => {
      const v = f[key];
      const rt = rate(key, v);
      return [label, v === null ? 'n/a' : fmt(v), rt ? RATING[rt] : '-'];
    };
    table(
      ['Metric', 'Value', 'Rating'],
      [
        metric('Largest Contentful Paint', 'lcp', formatMs),
        metric('First Contentful Paint', 'fcp', formatMs),
        metric('Cumulative Layout Shift', 'cls', (v) => v.toFixed(3)),
        metric('Interaction to Next Paint', 'inp', formatMs),
        metric('Server response (TTFB)', 'ttfb', formatMs),
        ['Fully loaded', f.load === null ? 'n/a' : formatMs(f.load), '-'],
      ],
      ['auto', 38, 32],
    );
    if (charts.speed) {
      sub('Largest Contentful Paint over your measurements');
      picture(charts.speed, 0.36);
    }

    sub('Page weight');
    facts([
      ['Transferred', formatBytes(a.totalBytes)],
      ['Requests', String(a.requests)],
      ...(a.unknownSizeRequests ? ([['Size not reported', `${a.unknownSizeRequests} cross-origin files (real total is higher)`]] as [string, string][]) : []),
    ]);
    const weighted = a.byType.filter((t) => t.bytes > 0);
    if (charts.weight && weighted.length) {
      ensure(46);
      doc.addImage(charts.weight, 'PNG', M, y, 42, 42);
      weighted.slice(0, 7).forEach((t, i) => {
        const ly = y + 8 + i * 6;
        const rgb = [1, 3, 5].map((k) => parseInt(PDF_PALETTE[i % PDF_PALETTE.length].slice(k, k + 2), 16));
        doc.setFillColor(rgb[0], rgb[1], rgb[2]).roundedRect(M + 50, ly - 3, 4, 4, 0.8, 0.8, 'F');
        doc.setFont('helvetica', 'normal').setFontSize(9);
        color(C.ink);
        doc.text(`${S(t.type)}   ${formatBytes(t.bytes)}`, M + 57, ly + 0.3);
      });
      y += 46;
    }
    table(['Type', 'Requests', 'Size'], a.byType.map((t) => [t.type, t.count, t.bytes ? formatBytes(t.bytes) : '-']), ['auto', 30, 36]);

    sub('Heaviest files');
    const fname = (u: string) => {
      try {
        const x = new URL(u);
        return (decodeURIComponent(x.pathname.split('/').filter(Boolean).pop() ?? '') || x.hostname).slice(0, 42);
      } catch {
        return u.slice(0, 42);
      }
    };
    table(['File', 'Type', 'Size', 'Time'], a.heaviest.slice(0, 15).map((x) => [fname(x.url), x.type, x.bytes ? formatBytes(x.bytes) : '-', formatMs(x.durationMs)]));

    if (a.thirdParties.length) {
      sub('Third parties');
      table(['Domain', 'Requests', 'Size'], a.thirdParties.slice(0, 15).map((t) => [t.domain, t.requests, t.bytes ? formatBytes(t.bytes) : '-']), ['auto', 30, 36]);
    }

    sub('Checks');
    table(
      ['Check', 'Result', 'Detail'],
      a.checks.filter((c) => c.group !== 'Accessibility').map((c) => [`${c.label}`, STATUS[c.status], c.detail]),
      [42, 20, 'auto'],
    );
  } else unavailable('Speed measurement', r.perf.reason);

  // =====================================================================
  // Accessibility
  // =====================================================================
  heading('Accessibility');
  const a11y = [...(r.scan.ok ? a11yFindings(r.scan.analysis.a11y) : []), ...(r.perf.ok ? perfA11y(r.perf.analysis.checks) : [])];
  if (a11y.length) {
    note('Automated checks catch only part of what matters and do not replace testing with real users. Contrast ignores text over images and gradients.');
    table(['Check', 'Result', 'Detail'], a11y.map((f) => [f.label, STATUS[f.status], f.detail]), [42, 20, 'auto']);
    if (r.scan.ok && r.scan.analysis.a11y.worst.length) {
      sub('Lowest contrast text');
      table(
        ['Text', 'Foreground', 'Background', 'Ratio', 'Size'],
        r.scan.analysis.a11y.worst.map((w) => [w.text, w.fg, w.bg, `${w.ratio} : 1`, `${w.sizePx}px`]),
      );
    }
  } else unavailable('Accessibility checks', 'the page could not be scanned');

  // =====================================================================
  // Security
  // =====================================================================
  heading('Security');
  if (r.security.ok) {
    const a = r.security.analysis;
    facts([
      ['Grade', `${a.grade}  (${a.score} / 100)`],
      ['HTTP status', String(a.status)],
      ['Server software', a.server.software ?? 'Not disclosed'],
      ['Powered by', a.server.poweredBy ?? 'Not disclosed'],
      ['Platform / CDN', a.server.platforms.length ? a.server.platforms.join(', ') : 'Not identified'],
    ]);
    table(['Check', 'Result', 'Detail'], a.checks.map((c) => [c.label, STATUS[c.status], c.detail]), [42, 20, 'auto']);
    if (a.headers.length) {
      sub('Response headers');
      table(['Header', 'Value'], a.headers.map((h) => [h.name, h.value.slice(0, 160)]), [48, 'auto']);
    }
  } else unavailable('The security header check', r.security.reason);

  // =====================================================================
  // Privacy
  // =====================================================================
  heading('Privacy');
  if (priv) {
    const trackers = r.scan.ok ? trackersOf(r.scan.analysis) : [];
    const consent = r.scan.ok ? consentToolsOf(r.scan.analysis) : [];
    const pf = r.privacy.ok ? r.privacy.facts : null;
    facts([
      ['Exposure', level ?? 'n/a'],
      ['Trackers', r.scan.ok ? String(trackers.length) : 'n/a'],
      ['Consent tool', r.scan.ok ? (consent.length ? consent[0].name : 'None detected') : 'n/a'],
      ['Other sites contacted', pf ? String(pf.thirdPartyDomains.length) : 'n/a'],
      ['Cookies set by this site', pf ? String(pf.cookies.length) : 'n/a'],
      ['Browser storage keys', r.scan.ok ? `${r.scan.analysis.storage.local} local, ${r.scan.analysis.storage.session} session` : 'n/a'],
    ]);
    table(['Check', 'Result', 'Detail'], priv.map((f) => [f.label, STATUS[f.status], f.detail]), [42, 20, 'auto']);
    if (trackers.length) {
      sub('Trackers detected');
      table(['Name', 'Category'], trackers.map((t) => [t.name, t.category]));
    }
    if (pf?.cookies.length) {
      sub('Cookies (names and flags only; values are never read)');
      table(
        ['Cookie', 'Flags', 'Expires', 'Known tracker'],
        pf.cookies.slice(0, 25).map((c) => [
          c.name.slice(0, 30),
          [c.secure ? 'Secure' : 'Not secure', c.httpOnly ? 'HttpOnly' : null, c.sameSite !== 'unspecified' ? c.sameSite : null].filter(Boolean).join(', '),
          c.session ? 'Session' : c.expiresInDays !== null ? `${c.expiresInDays} days` : '-',
          c.tracking ? 'Yes' : 'No',
        ]),
      );
    }
    if (pf?.thirdPartyDomains.length) {
      sub('Other sites contacted');
      table(['Domain', 'Requests', 'Cookies held'], pf.thirdPartyDomains.slice(0, 20).map((d) => [d.domain, d.requests, d.cookies]), ['auto', 30, 36]);
    }
  } else unavailable('The privacy check', r.privacy.ok ? 'the page could not be scanned' : r.privacy.reason);

  // =====================================================================
  // Sitemap
  // =====================================================================
  heading('Sitemap');
  if (r.sitemap.ok) {
    const s = r.sitemap.analysis;
    facts([
      ['Pages listed', `${s.urlCount.toLocaleString()}${s.truncated ? ' (at least)' : ''}`],
      ['Sitemap files', `${s.sitemapCount}${s.isIndex ? ' (from a sitemap index)' : ''}`],
      ['With last-modified date', s.urlCount ? `${Math.round((s.withLastmod / s.urlCount) * 100)}%` : 'n/a'],
      ['Newest / oldest update', `${s.newest ?? 'n/a'} / ${s.oldest ?? 'n/a'}`],
    ]);
    if (s.problems.length) table(['Things to check'], s.problems.map((p) => [p]));
    if (s.sections.length) {
      sub('Where the pages are');
      table(['Folder', 'Pages'], s.sections.map((x) => [x.path, x.count.toLocaleString()]), ['auto', 36]);
    }
  } else unavailable('The sitemap analysis', r.sitemap.reason);

  // =====================================================================
  // Design
  // =====================================================================
  if (r.scan.ok) {
    const d = r.scan.analysis.design;
    heading('Design');
    if (d.fonts.length) {
      sub('Fonts');
      table(['Family', 'Elements', 'Web font'], d.fonts.map((f) => [f.family, f.count, f.webFont ? 'Yes' : 'No']), ['auto', 30, 30]);
    }
    if (d.sizes.length) note(`Text sizes: ${d.sizes.map((s) => `${s.px}px (${s.count})`).join(', ')}`);

    const swatches = (title: string, colors: { hex: string; count: number }[]) => {
      if (!colors.length) return;
      sub(title);
      colors.forEach((c, i) => {
        const col = i % 4;
        if (col === 0 && i > 0) y += 8;
        ensure(10);
        const x = M + col * (W / 4);
        const rgb = [1, 3, 5].map((k) => parseInt(c.hex.slice(k, k + 2), 16));
        doc.setFillColor(rgb[0], rgb[1], rgb[2]).setDrawColor(...C.line).roundedRect(x, y - 3.5, 6, 6, 1, 1, 'FD');
        doc.setFont('helvetica', 'normal').setFontSize(8.5);
        color(C.ink);
        doc.text(`${c.hex}  (${c.count})`, x + 8, y + 0.8);
      });
      y += 10;
    };
    swatches('Text colours', d.textColors);
    swatches('Background colours', d.backgrounds);
  }

  // =====================================================================
  // Notes
  // =====================================================================
  heading('About this report');
  note('Created by Site Insights. Every figure was collected in your own browser: the page was read directly, its own headers, robots.txt and sitemap were requested from the site itself, and rank data came from the public Tranco list. No API keys or paid services were used.');
  note('Traffic figures are estimates modeled from rank. Speed figures are real timings from one device and connection. Accessibility and privacy checks are automated and indicative, not audits.');

  // =====================================================================
  // Footer on every page
  // =====================================================================
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.line).setLineWidth(0.25).line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11);
    doc.setFont('helvetica', 'normal').setFontSize(7.5);
    color(C.muted);
    doc.text(`Site Insights  |  ${S(r.domain)}`, M, PAGE_H - 6.5);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 6.5, { align: 'right' });
  }

  return doc;
}
