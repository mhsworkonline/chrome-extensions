// popup.js — Popup UI controller for Full Webpage Capture
'use strict';

// ─── DOM ─────────────────────────────────────────────────────────────────────
const states = {
  idle:      document.getElementById('state-idle'),
  capturing: document.getElementById('state-capturing'),
  done:      document.getElementById('state-done'),
  error:     document.getElementById('state-error')
};

function showState(name) {
  Object.values(states).forEach(el => (el.style.display = 'none'));
  states[name].style.display = '';
}

showState('idle');

// ─── Port connection to background service worker ─────────────────────────────
// The port persists as long as the popup is open, giving us a live channel
// for progress updates from the background's capture loop.
const port = chrome.runtime.connect({ name: 'fwc-popup' });

// If background has a capture in progress when popup opens, it immediately
// sends the current status through the port.
port.onMessage.addListener((msg) => {
  switch (msg.action) {
    case 'alreadyCapturing':
      // A capture started before this popup was opened — show its progress
      buildDots(msg.total);
      showState('capturing');
      break;

    case 'progress': {
      showState('capturing');
      const pct = Math.round((msg.index + 1) / msg.total * 100);
      document.getElementById('prog-bar').style.width = `${pct}%`;
      document.getElementById('prog-pct').textContent  = `${pct}%`;
      document.getElementById('cap-sub').textContent   = `Section ${msg.index + 1} of ${msg.total}`;
      updateDots(msg.index, msg.total);
      break;
    }

    case 'done':
      showState('done');
      // Auto-close popup after the viewer tab is revealed
      setTimeout(() => window.close(), 1800);
      break;

    case 'error':
      showState('error');
      document.getElementById('err-title').textContent = msg.message || 'Capture failed';
      document.getElementById('err-sub').textContent   = 'Try a different page or reload and try again.';
      break;
  }
});

// ─── Capture button ───────────────────────────────────────────────────────────
document.getElementById('btn-capture').addEventListener('click', async () => {
  // Get the active tab in the current window
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (/^(chrome|chrome-extension|about|data):/.test(tab.url ?? '')) {
    showState('error');
    document.getElementById('err-title').textContent = 'Cannot capture this page';
    document.getElementById('err-sub').textContent   = 'Chrome system pages cannot be screenshotted.';
    return;
  }

  // Tell background to start, pass the tabId so it knows which tab to capture
  port.postMessage({ action: 'startCapture', tabId: tab.id });

  // Switch to capturing UI immediately (progress messages will follow)
  document.getElementById('cap-sub').textContent   = 'Preparing…';
  document.getElementById('prog-bar').style.width  = '0%';
  document.getElementById('prog-pct').textContent  = '0%';
  document.getElementById('cap-dots').innerHTML    = '';
  showState('capturing');
});

// ─── Retry button ─────────────────────────────────────────────────────────────
document.getElementById('btn-retry').addEventListener('click', () => {
  document.getElementById('cap-dots').innerHTML = '';
  showState('idle');
});

// ─── Section dot helpers ──────────────────────────────────────────────────────
function buildDots(total) {
  const container = document.getElementById('cap-dots');
  container.innerHTML = '';
  // Only render dots if there aren't too many (keeps UI tidy)
  if (total <= 30) {
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'dot';
      d.id = `dot-${i}`;
      container.appendChild(d);
    }
  }
}

function updateDots(currentIndex, total) {
  // Build the dot row on the first progress message
  if (!document.getElementById('dot-0') && total <= 30) {
    buildDots(total);
  }
  for (let i = 0; i < total; i++) {
    const d = document.getElementById(`dot-${i}`);
    if (!d) continue;
    d.className = 'dot ' + (i < currentIndex ? 'done' : i === currentIndex ? 'active' : '');
  }
}
