// content.js — Injected into the source tab during capture
//
// ROLE: Pure command-responder. Background tells us what to do; we do it and reply.
// No loops, no state machine — keeps things simple and avoids SW-lifetime issues.

(function () {
  'use strict';

  // Guard: only register listeners once per page context
  if (window.__fwcInjected) return;
  window.__fwcInjected = true;

  // Page state saved during capture
  let savedScrollX   = 0;
  let savedScrollY   = 0;
  let hiddenEls      = [];
  let savedScrollBehavior = '';

  // ─── Message listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {

      // ── Ping (background checks if content.js is ready) ──────────────────
      case 'ping':
        sendResponse({ ready: true });
        break;

      // ── Report full page dimensions ───────────────────────────────────────
      case 'getPageInfo':
        sendResponse({
          totalHeight:    getFullHeight(),
          totalWidth:     getFullWidth(),
          viewportHeight: window.innerHeight,
          viewportWidth:  window.innerWidth,
          dpr:            window.devicePixelRatio || 1
        });
        break;

      // ── Hide fixed/sticky elements and save page state ───────────────────
      case 'prepareCapture':
        savedScrollX        = window.scrollX;
        savedScrollY        = window.scrollY;
        savedScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        hiddenEls = hideFixed();
        sendResponse({ ok: true });
        break;

      // ── Scroll to a specific Y position, then reply once settled ─────────
      case 'scrollTo': {
        const targetY = msg.y ?? 0;
        window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
        // Wait for scroll + any lazy-loaded images to begin painting, then reply
        setTimeout(() => sendResponse({ ok: true, actualY: window.scrollY }), 150);
        return true; // keep channel open for async sendResponse
      }

      // ── Restore page to original state ───────────────────────────────────
      case 'restoreCapture':
        showFixed(hiddenEls);
        hiddenEls = [];
        document.documentElement.style.scrollBehavior = savedScrollBehavior;
        window.scrollTo({ top: savedScrollY, left: savedScrollX, behavior: 'instant' });
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
    }

    return true; // safe to always return true (channel may be used async)
  });

  // ─── Page dimension helpers ───────────────────────────────────────────────
  function getFullHeight() {
    return Math.max(
      document.body?.scrollHeight    || 0,
      document.body?.offsetHeight    || 0,
      document.body?.clientHeight    || 0,
      document.documentElement?.scrollHeight || 0,
      document.documentElement?.offsetHeight || 0,
      document.documentElement?.clientHeight || 0
    );
  }

  function getFullWidth() {
    return Math.max(
      document.body?.scrollWidth     || 0,
      document.body?.offsetWidth     || 0,
      document.body?.clientWidth     || 0,
      document.documentElement?.scrollWidth  || 0,
      document.documentElement?.offsetWidth  || 0,
      document.documentElement?.clientWidth  || 0
    );
  }

  // ─── Fixed/sticky element hider ──────────────────────────────────────────
  function hideFixed() {
    const hidden = [];
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT
    );
    let node;
    while ((node = walker.nextNode())) {
      try {
        const pos = window.getComputedStyle(node).position;
        if (pos === 'fixed' || pos === 'sticky') {
          hidden.push({ node, was: node.style.visibility });
          node.style.setProperty('visibility', 'hidden', 'important');
        }
      } catch (_) { /* skip cross-origin frame elements */ }
    }
    return hidden;
  }

  function showFixed(hidden) {
    for (const { node, was } of hidden) {
      node.style.visibility = was;
    }
  }

})();
