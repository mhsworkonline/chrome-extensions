import { useEffect, useRef, useState } from 'preact/hooks';
import type { SiteResult } from '../../shared/types';
import { buildReport, downloadCsv, downloadJson, downloadPdf } from './export';

type Site = Extract<SiteResult, { ok: true }>;
type Kind = 'pdf' | 'csv' | 'json';

/**
 * Header control for exporting everything about the current site.
 * The main button downloads a PDF; the arrow offers the data formats.
 */
export function ExportMenu({ site }: { site: Site }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'idle' | 'checking' | 'building'>('idle');
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function run(kind: Kind) {
    setOpen(false);
    setFailed(false);
    setStage('checking');
    try {
      const report = await buildReport(site);
      if (kind === 'pdf') {
        setStage('building');
        await downloadPdf(report);
      } else if (kind === 'csv') downloadCsv(report);
      else downloadJson(report);
    } catch (err) {
      console.warn('[site-insights] export failed', err);
      setFailed(true);
    } finally {
      setStage('idle');
    }
  }

  const busy = stage !== 'idle';
  const label = stage === 'checking' ? 'Checking site…' : stage === 'building' ? 'Building PDF…' : failed ? 'Retry PDF' : 'Export PDF';

  return (
    <div ref={root} class="split">
      <button
        class="btn primary split-main"
        onClick={() => void run('pdf')}
        disabled={busy}
        title={failed ? 'The export failed. Click to try again.' : 'Download a PDF report with everything about this site'}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10" />
        </svg>
        {label}
      </button>
      <button
        class="btn primary split-arrow"
        onClick={() => setOpen(!open)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More export formats"
        title="More formats"
      >
        ▾
      </button>
      {open && (
        <div class="menu" role="menu">
          <button role="menuitem" onClick={() => void run('csv')}>Spreadsheet (CSV)</button>
          <button role="menuitem" onClick={() => void run('json')}>All data (JSON)</button>
        </div>
      )}
    </div>
  );
}
