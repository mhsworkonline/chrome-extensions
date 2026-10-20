// background.js — Service Worker for Full Webpage Capture
//
// ARCHITECTURE: Background owns the full capture loop in one async function
// (keeps SW alive throughout). Popup connects via a Port for live progress.
// content.js is a simple command-responder (scroll, getPageInfo, etc.).

'use strict';

// ─── Popup port ───────────────────────────────────────────────────────────────
// Null when popup is closed. We send progress updates through this port.
let popupPort  = null;
let isCapturing = false;
// Track progress so we can report it to a popup opened mid-capture
let liveProgress = null; // { index, total } | null

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'fwc-popup') return;

  popupPort = port;

  // If a capture is already running, immediately send its current state
  if (isCapturing && liveProgress) {
    port.postMessage({ action: 'alreadyCapturing', total: liveProgress.total });
    port.postMessage({ action: 'progress', index: liveProgress.index, total: liveProgress.total });
  }

  port.onMessage.addListener(async (msg) => {
    if (msg.action === 'startCapture') {
      if (isCapturing) {
        port.postMessage({ action: 'error', message: 'A capture is already in progress.' });
        return;
      }
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        await startCapture(tab);
      } catch (err) {
        toPopup({ action: 'error', message: err.message });
      }
    }
  });

  port.onDisconnect.addListener(() => {
    // Popup closed — capture continues silently in background
    popupPort = null;
  });
});

// ─── Helper: send to popup (no-op if popup is closed) ────────────────────────
function toPopup(msg) {
  if (popupPort) {
    try { popupPort.postMessage(msg); } catch (_) {}
  }
}

// ─── Main capture flow ────────────────────────────────────────────────────────
async function startCapture(tab) {
  if (isCapturing) return;

  if (!tab?.id || !tab?.url || /^(chrome|chrome-extension|about|data):/.test(tab.url)) {
    toPopup({ action: 'error', message: 'Cannot capture this type of page.' });
    return;
  }

  isCapturing  = true;
  liveProgress = null;
  let viewerTabId = null;

  try {
    // 1. Open viewer tab (inactive — source tab stays focused)
    const viewerTab = await chrome.tabs.create({
      url:    chrome.runtime.getURL('capture.html'),
      active: false,
      index:  tab.index + 1
    });
    viewerTabId = viewerTab.id;

    // 2. Re-activate source tab (creating a tab can shift focus)
    await chrome.tabs.update(tab.id, { active: true });

    // 3. Wait for viewer to load then confirm its listener is live
    await waitForTabComplete(viewerTabId);
    const viewerReady = await pingTab(viewerTabId, 20, 250);
    if (!viewerReady) throw new Error('Viewer tab did not respond to ping.');

    // 4. Inject content script (guard in content.js prevents double-inject)
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await sleep(100);

    // 5. Read page dimensions from content.js
    const info = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
    if (!info?.totalHeight) throw new Error('Could not read page dimensions.');
    const { totalHeight, totalWidth, viewportHeight, viewportWidth, dpr } = info;

    // 6. Initialise viewer canvas
    await chrome.tabs.sendMessage(viewerTabId, {
      action: 'init', totalHeight, totalWidth, viewportHeight, viewportWidth, dpr,
      sourceUrl: tab.url
    });

    // 7. Tell content.js to hide fixed elements and save scroll state
    await chrome.tabs.sendMessage(tab.id, { action: 'prepareCapture' });

    // 8. Build scroll stop-points
    const positions = buildScrollPositions(totalHeight, viewportHeight);
    const total     = positions.length;

    // ── 9. CAPTURE LOOP ──────────────────────────────────────────────────────
    for (let i = 0; i < total; i++) {
      // Track for popup-reconnect reporting
      liveProgress = { index: i, total };

      // Send progress to popup
      toPopup({ action: 'progress', index: i, total });

      // Scroll content.js to this position; it replies when settled (150 ms)
      await chrome.tabs.sendMessage(tab.id, { action: 'scrollTo', y: positions[i] });

      // Ensure source tab is active right before capture
      await chrome.tabs.update(tab.id, { active: true });
      await sleep(200); // let Chrome render the now-active tab

      // Screenshot with retry
      const dataUrl = await captureWithRetry(tab.id, tab.windowId);

      // Stream to viewer
      await chrome.tabs.sendMessage(viewerTabId, {
        action: 'screenshot',
        dataUrl,
        meta: { scrollY: positions[i], viewportHeight, viewportWidth, totalHeight, dpr, index: i, total }
      });
    }

    // 10. Restore page, finalise viewer, reveal it
    await chrome.tabs.sendMessage(tab.id, { action: 'restoreCapture' }).catch(() => {});
    await chrome.tabs.sendMessage(viewerTabId, { action: 'finalize' });

    toPopup({ action: 'done' });
    await sleep(400); // tiny pause before switching tabs (popup 'done' animation)
    await chrome.tabs.update(viewerTabId, { active: true });

  } catch (err) {
    console.error('[FWC] Capture failed:', err.message);
    toPopup({ action: 'error', message: err.message });
    if (viewerTabId) {
      chrome.tabs.sendMessage(viewerTabId, { action: 'error', message: err.message }).catch(() => {});
    }
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'restoreCapture' }).catch(() => {});
  } finally {
    isCapturing  = false;
    liveProgress = null;
  }
}

// ─── captureVisibleTab with retry ─────────────────────────────────────────────
async function captureWithRetry(sourceTabId, sourceWinId, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(sourceWinId, { format: 'png' });
      if (dataUrl) return dataUrl;
    } catch (err) {
      lastErr = err;
      console.warn(`[FWC] captureVisibleTab attempt ${attempt}/${maxAttempts}:`, err.message);
      await chrome.tabs.update(sourceTabId, { active: true }).catch(() => {});
      await sleep(300);
    }
  }
  throw lastErr || new Error('captureVisibleTab failed after all retries.');
}

// ─── Scroll position calculator ───────────────────────────────────────────────
function buildScrollPositions(totalHeight, viewportHeight) {
  if (totalHeight <= viewportHeight) return [0];
  const positions = [];
  let y = 0;
  while (y < totalHeight - viewportHeight) {
    positions.push(y);
    y += viewportHeight;
  }
  const bottom = Math.max(0, totalHeight - viewportHeight);
  if (positions[positions.length - 1] < bottom) positions.push(bottom);
  return [...new Set(positions)];
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError) return;
      if (t?.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpdated); resolve(); }
    });
  });
}

async function pingTab(tabId, maxAttempts = 20, delayMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (resp?.ready) return true;
    } catch (_) {}
    await sleep(delayMs);
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
