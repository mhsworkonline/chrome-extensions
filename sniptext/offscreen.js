// SnipText offscreen - runs Tesseract OCR in extension context (no page CSP)
var ocrWorker = null;

chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.action !== 'ocr') return;
  (async function() {
    var tabId = msg.tabId;
    try {
      var img = new Image();
      await new Promise(function(res, rej) { img.onload = res; img.onerror = rej; img.src = msg.imageData; });
      var d = msg.dpr || 1;
      var canvas = document.getElementById('c');
      canvas.width  = Math.round(msg.rect.w * d);
      canvas.height = Math.round(msg.rect.h * d);
      canvas.getContext('2d').drawImage(img,
        Math.round(msg.rect.x*d), Math.round(msg.rect.y*d), canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height);

      if (!ocrWorker) {
        // workerBlobURL:false tells Tesseract to create the Worker directly from the
        // chrome-extension:// URL instead of wrapping it in a blob first.
        // A worker spawned from a chrome-extension:// URL can freely importScripts
        // other chrome-extension:// URLs (same origin), which fixes the importScripts error.
        ocrWorker = await Tesseract.createWorker('eng', 1, {
          workerPath:    chrome.runtime.getURL('lib/worker.min.js'),
          corePath:      chrome.runtime.getURL('lib/tesseract-core-simd-lstm.js'),
          langPath:      chrome.runtime.getURL('lib'),
          workerBlobURL: false
        });
      }

      var result = await ocrWorker.recognize(canvas);
      var text = result.data.text;
      await ocrWorker.terminate();
      ocrWorker = null;
      chrome.runtime.sendMessage({ action: 'ocrResult', text: text, tabId: tabId });
    } catch(err) {
      console.error('SnipText OCR error:', err);
      if (ocrWorker) { try { await ocrWorker.terminate(); } catch(_) {} ocrWorker = null; }
      chrome.runtime.sendMessage({ action: 'ocrResult', text: '', tabId: tabId });
    }
  })();
});

// Signal background that this document is loaded and ready to receive 'ocr' messages
chrome.runtime.sendMessage({ action: 'offscreenReady' }).catch(() => {});
