// capture.js — Viewer tab: receives screenshots, stitches, lets user export
'use strict';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const secProgress  = document.getElementById('section-progress');
const secError     = document.getElementById('section-error');
const secResult    = document.getElementById('section-result');
const progressBar  = document.getElementById('progress-bar');
const progressLbl  = document.getElementById('progress-label');
const errorMsg     = document.getElementById('error-message');
const previewImg   = document.getElementById('preview-img');
const captureMeta  = document.getElementById('capture-meta');
const sourceHost   = document.getElementById('source-host');
const stitchCanvas = document.getElementById('stitch-canvas');
const ctx          = stitchCanvas.getContext('2d');

// ─── State ────────────────────────────────────────────────────────────────────
let meta       = null;   // { totalHeight, totalWidth, viewportHeight, viewportWidth, dpr, sourceUrl }
let pendingQ   = [];     // screenshots received before canvas is ready
let canvasReady = false;
let sourceUrl  = '';

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    switch (msg.action) {

      case 'ping':
        sendResponse({ ready: true });
        break;

      case 'init':
        initCanvas(msg);
        sendResponse({ ok: true });
        break;

      case 'screenshot':
        // Queue if canvas not set up yet (shouldn't normally happen)
        if (!canvasReady) {
          pendingQ.push(msg);
        } else {
          drawScreenshot(msg);
        }
        sendResponse({ ok: true });
        break;

      case 'finalize':
        flushQueue();
        finalise();
        sendResponse({ ok: true });
        break;

      case 'error':
        showError(msg.message);
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false });
    }
  } catch (err) {
    console.error('[FWC viewer]', err);
    sendResponse({ ok: false });
  }
  return true;
});

// ─── Canvas initialisation ───────────────────────────────────────────────────
function initCanvas(data) {
  meta = {
    totalHeight:    data.totalHeight,
    totalWidth:     data.totalWidth,
    viewportHeight: data.viewportHeight,
    viewportWidth:  data.viewportWidth,
    dpr:            data.dpr || 1,
    sourceUrl:      data.sourceUrl || ''
  };
  sourceUrl = data.sourceUrl || '';

  // Update header subtitle
  try {
    const host = new URL(sourceUrl).hostname;
    if (host) sourceHost.textContent = host;
  } catch (_) {}

  // Canvas is full-resolution (CSS pixels × device pixel ratio)
  const W = Math.round(meta.viewportWidth  * meta.dpr);
  const H = Math.round(meta.totalHeight    * meta.dpr);

  // Guard against absurdly large pages (> 30 000 px tall @1x)
  const MAX_PX = 30_000 * meta.dpr;
  stitchCanvas.width  = W;
  stitchCanvas.height = Math.min(H, MAX_PX);

  canvasReady = true;

  setProgress(0, `Capturing… 0 of ${estimateSections(meta.totalHeight, meta.viewportHeight)}`);
}

// ─── Draw one screenshot onto the canvas ────────────────────────────────────
function drawScreenshot(msg) {
  if (!ctx || !meta) return;

  const { dataUrl, meta: m } = msg;
  const img = new Image();
  img.onload = () => {
    // Position = scrollY (CSS px) × dpr
    const yPx = Math.round(m.scrollY * meta.dpr);
    ctx.drawImage(img, 0, yPx);
  };
  img.src = dataUrl;

  // Update progress indicator
  const done  = m.index + 1;
  const total = m.total;
  const pct   = Math.round((done / total) * 100);
  setProgress(pct, `Capturing… ${done} of ${total}`);
}

function flushQueue() {
  for (const msg of pendingQ) drawScreenshot(msg);
  pendingQ = [];
}

// ─── Finalise: show the preview ──────────────────────────────────────────────
function finalise() {
  setProgress(100, 'Stitching…');

  // Small delay so the last drawImage calls (async onload) can finish
  setTimeout(() => {
    try {
      const dataUrl = stitchCanvas.toDataURL('image/png');
      previewImg.src = dataUrl;

      // Display dimensions in meta line
      const cssW = Math.round(meta.viewportWidth);
      const cssH = Math.round(meta.totalHeight);
      captureMeta.textContent = `${cssW} × ${cssH} px  ·  ${formatBytes(estimateFileSize(dataUrl))}`;

      // Switch to result view
      secProgress.style.display = 'none';
      secResult.style.display   = 'flex';

    } catch (err) {
      showError('Failed to generate image: ' + err.message);
    }
  }, 500);
}

// ─── Error display ───────────────────────────────────────────────────────────
function showError(msg) {
  secProgress.style.display = 'none';
  secResult.style.display   = 'none';
  errorMsg.textContent      = msg || 'Unknown error.';
  secError.style.display    = 'flex';
}

// ─── Progress helper ─────────────────────────────────────────────────────────
function setProgress(pct, label) {
  progressBar.style.width = `${pct}%`;
  progressLbl.textContent = label;
}

// ─── Button wiring ────────────────────────────────────────────────────────────
document.getElementById('btn-png').addEventListener('click', downloadPNG);
document.getElementById('btn-pdf').addEventListener('click', downloadPDF);
document.getElementById('btn-copy').addEventListener('click', copyClipboard);

// Download PNG
function downloadPNG() {
  const a    = document.createElement('a');
  a.download = buildFilename('png');
  a.href     = stitchCanvas.toDataURL('image/png');
  a.click();
}

// Download PDF
async function downloadPDF() {
  const btn  = document.getElementById('btn-pdf');
  const orig = btn.innerHTML;
  btn.disabled    = true;
  btn.textContent = 'Generating PDF…';

  try {
    if (!window.MiniPDF) throw new Error('MiniPDF not loaded');

    const pdfBlob = await window.MiniPDF.fromCanvas(stitchCanvas, 0.92);
    const url     = URL.createObjectURL(pdfBlob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = buildFilename('pdf');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

  } catch (err) {
    alert('PDF generation failed: ' + err.message);
    console.error('[FWC PDF]', err);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = orig;
  }
}

// Copy PNG to clipboard
async function copyClipboard() {
  const btn  = document.getElementById('btn-copy');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Copying…';

  try {
    await new Promise((resolve, reject) => {
      stitchCanvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          resolve();
        } catch (e) { reject(e); }
      }, 'image/png');
    });

    btn.classList.add('btn-success');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.classList.remove('btn-success');
      btn.innerHTML = orig;
      btn.disabled  = false;
    }, 2200);

  } catch (err) {
    btn.textContent = 'Copy failed ✕';
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2200);
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function buildFilename(ext) {
  let host = 'capture';
  try { host = new URL(sourceUrl).hostname.replace(/^www\./, '') || 'capture'; } catch (_) {}
  const date = new Date().toISOString().slice(0, 10);
  return `fullpage-${host}-${date}.${ext}`;
}

function estimateSections(totalH, vpH) {
  return Math.ceil(totalH / vpH);
}

function estimateFileSize(dataUrl) {
  // dataUrl is base64; actual bytes ≈ (length - header) * 0.75
  const b64len = dataUrl.split(',')[1]?.length || 0;
  return Math.round(b64len * 0.75);
}

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
