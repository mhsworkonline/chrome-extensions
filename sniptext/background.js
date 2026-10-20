// SnipText background
var _keepaliveTimer = null;
var _offscreenReadyResolve = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  var p = new Promise(function(r) {
    _offscreenReadyResolve = r;
    setTimeout(r, 5000); // fallback if ready signal never arrives
  });
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: ['DOM_SCRAPING'],
    justification: 'Run Tesseract OCR on captured screenshots'
  });
  await p;
}

function startKeepalive() {
  if (_keepaliveTimer) return;
  _keepaliveTimer = setInterval(async () => {
    if (await chrome.offscreen.hasDocument()) {
      chrome.runtime.sendMessage({ action: 'ping' }).catch(() => {});
    }
  }, 5000);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'startSnip' });
  } catch (e) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, { action: 'startSnip' });
    } catch (e2) { console.error('SnipText:', e2.message); }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'offscreenReady') {
    if (_offscreenReadyResolve) { _offscreenReadyResolve(); _offscreenReadyResolve = null; }
    return;
  }
  if (msg.action === 'capture') {
    (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
        await ensureOffscreen();
        startKeepalive();
        chrome.runtime.sendMessage({ action: 'ocr', imageData: dataUrl, rect: msg.rect, dpr: msg.dpr, tabId: sender.tab.id });
      } catch (e) {
        console.error('SnipText capture:', e.message);
        chrome.tabs.sendMessage(sender.tab.id, { action: 'showResult', text: '' });
      }
    })();
    return true;
  }
  if (msg.action === 'ocrResult') {
    chrome.tabs.sendMessage(msg.tabId, { action: 'showResult', text: msg.text });
  }
});
