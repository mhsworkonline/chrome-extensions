// ============================================================
//  Bulk Email Reply — Gmail Content Script
//  Injects toolbar button + full sidebar panel into Gmail
// ============================================================

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const POLL_INTERVAL = 800;
  const SIDEBAR_ID = 'ber-sidebar';
  const BTN_ID = 'ber-toolbar-btn';

  // ── Built-in templates ─────────────────────────────────────
  const DEFAULT_TEMPLATES = [
    {
      id: 'ack',
      name: 'Acknowledgement',
      body: `Thank you for your email. I've received your message and will get back to you shortly.\n\nBest regards`
    },
    {
      id: 'followup',
      name: 'Follow-up Request',
      body: `Thank you for reaching out. Could you please provide more details so I can assist you better?\n\nLooking forward to your response.\n\nBest regards`
    },
    {
      id: 'notavail',
      name: 'Not Available',
      body: `Thank you for your email. I'm currently unavailable and will respond when I return.\n\nI appreciate your patience.\n\nBest regards`
    },
    {
      id: 'confirm',
      name: 'Confirmation',
      body: `Thank you for your message. I can confirm receipt and will action this promptly.\n\nBest regards`
    },
    {
      id: 'decline',
      name: 'Polite Decline',
      body: `Thank you for thinking of me. Unfortunately, I'm unable to assist with this at this time, but I appreciate you reaching out.\n\nBest regards`
    }
  ];

  // ── State ──────────────────────────────────────────────────
  let selectedThreadIds = new Set();
  let threadDetails = [];
  let sidebarOpen = false;
  let pollTimer = null;
  let lastSelectedCount = 0;
  let shadowHost = null;
  let shadow = null;

  // ── Utility ─────────────────────────────────────────────────

  function msg(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...payload }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (res?.ok === false) {
          reject(new Error(res.error));
        } else {
          resolve(res?.data ?? res);
        }
      });
    });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractSenderName(from) {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from;
  }

  function extractEmail(from) {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  }

  // ── Gmail DOM: detect selected threads ──────────────────────

  function getSelectedThreadIds() {
    const ids = new Set();

    // Strategy 1: checked rows with data-thread-id or data-legacy-thread-id
    const rows = document.querySelectorAll('tr.zA, div[role="row"]');
    rows.forEach((row) => {
      const cb = row.querySelector('input[type="checkbox"]');
      if (!cb || !cb.checked) return;

      // Try various attribute locations
      let tid =
        row.getAttribute('data-thread-id') ||
        row.getAttribute('data-legacy-thread-id') ||
        row.querySelector('[data-thread-id]')?.getAttribute('data-thread-id') ||
        row.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id');

      // Fallback: look for the thread ID in any child element
      if (!tid) {
        const link = row.querySelector('a[href*="#"]');
        if (link) {
          const m = link.href.match(/#(?:inbox|all|sent)\/([a-f0-9]+)/i);
          if (m) tid = m[1];
        }
      }

      if (tid) ids.add(tid);
    });

    // Strategy 2: Gmail's internal JS object (if accessible)
    // Gmail stores selected items in a JS state; we try to find thread IDs
    // from checked checkboxes' closest parent with an ID hint
    if (ids.size === 0) {
      const checked = document.querySelectorAll('input[type="checkbox"]:checked');
      checked.forEach((cb) => {
        let el = cb.closest('[data-thread-id], [data-legacy-thread-id]');
        if (el) {
          const tid =
            el.getAttribute('data-thread-id') ||
            el.getAttribute('data-legacy-thread-id');
          if (tid) ids.add(tid);
        }
      });
    }

    return ids;
  }

  // Count how many rows are selected (even if we can't get the ID)
  function getSelectedCount() {
    const checked = document.querySelectorAll(
      'tr.zA input[type="checkbox"]:checked, div[role="row"] input[type="checkbox"]:checked'
    );
    return checked.length;
  }

  // ── Toolbar Button ──────────────────────────────────────────

  function findToolbar() {
    // Gmail's main toolbar (above inbox list)
    return (
      document.querySelector('div.G-atb') ||
      document.querySelector('[gh="mtb"]') ||
      document.querySelector('.aqJ') ||
      document.querySelector('[data-tooltip="Select"]')?.closest('div[role="toolbar"]')
    );
  }

  function injectToolbarButton() {
    if (document.getElementById(BTN_ID)) return;
    const toolbar = findToolbar();
    if (!toolbar) return;

    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.title = 'Bulk Email Reply';
    btn.innerHTML = `
      <span class="ber-btn-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 17H4M9 14H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="ber-btn-label">Bulk Reply</span>
      <span class="ber-btn-count" id="ber-count">0</span>
    `;

    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      margin-left: 8px;
      background: #1a1a2e;
      color: #9eff00;
      border: 1px solid #9eff00;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      transition: all 0.2s ease;
      user-select: none;
      position: relative;
      z-index: 100;
    `;

    btn.querySelector('.ber-btn-count').style.cssText = `
      background: #9eff00;
      color: #1a1a2e;
      border-radius: 10px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 700;
      min-width: 18px;
      text-align: center;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#9eff00';
      btn.style.color = '#1a1a2e';
      btn.querySelector('.ber-btn-count').style.background = '#1a1a2e';
      btn.querySelector('.ber-btn-count').style.color = '#9eff00';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#1a1a2e';
      btn.style.color = '#9eff00';
      btn.querySelector('.ber-btn-count').style.background = '#9eff00';
      btn.querySelector('.ber-btn-count').style.color = '#1a1a2e';
    });

    btn.addEventListener('click', () => {
      if (selectedThreadIds.size === 0 && getSelectedCount() === 0) {
        showToast('Select at least one email first', 'warn');
        return;
      }
      openSidebar();
    });

    toolbar.appendChild(btn);
  }

  function updateButtonCount(count) {
    const countEl = document.getElementById('ber-count');
    if (countEl) countEl.textContent = count;
  }

  // ── Shadow DOM Sidebar ──────────────────────────────────────

  function createSidebar() {
    if (document.getElementById(SIDEBAR_ID)) return;

    shadowHost = document.createElement('div');
    shadowHost.id = SIDEBAR_ID;
    shadowHost.style.cssText = `
      position: fixed;
      top: 0;
      right: -480px;
      width: 480px;
      height: 100vh;
      z-index: 99999;
      transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    document.body.appendChild(shadowHost);
    shadow = shadowHost.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        :host {
          --bg: #0d0d0d;
          --bg2: #161616;
          --bg3: #1f1f1f;
          --border: #2a2a2a;
          --accent: #9eff00;
          --accent2: #00d4ff;
          --text: #e8e8e8;
          --text2: #888;
          --text3: #555;
          --success: #22c55e;
          --error: #ef4444;
          --warn: #f59e0b;
          --font-mono: 'JetBrains Mono', 'Courier New', monospace;
          --font-sans: 'Syne', system-ui, sans-serif;
          --radius: 6px;
          --shadow: 0 0 40px rgba(0,0,0,0.6);
        }

        .panel {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg);
          border-left: 1px solid var(--border);
          box-shadow: var(--shadow);
          overflow: hidden;
          font-family: var(--font-sans);
          color: var(--text);
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          flex-shrink: 0;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-logo {
          width: 28px;
          height: 28px;
          background: var(--accent);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-logo svg { color: #0d0d0d; }

        .header-title {
          font-family: var(--font-sans);
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .header-subtitle {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text2);
          margin-top: 1px;
        }

        .header-close {
          width: 30px;
          height: 30px;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text2);
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .header-close:hover {
          background: var(--error);
          border-color: var(--error);
          color: #fff;
        }

        /* ── Email List ── */
        .section-label {
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text3);
          padding: 12px 20px 6px;
          flex-shrink: 0;
        }

        .email-list {
          max-height: 200px;
          overflow-y: auto;
          padding: 0 20px 8px;
          flex-shrink: 0;
        }

        .email-list::-webkit-scrollbar { width: 4px; }
        .email-list::-webkit-scrollbar-track { background: transparent; }
        .email-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        .email-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          margin-bottom: 6px;
          position: relative;
          transition: border-color 0.2s;
        }

        .email-item.loading { opacity: 0.5; }
        .email-item.loaded { border-color: var(--bg3); }
        .email-item.success { border-left: 3px solid var(--success); }
        .email-item.error { border-left: 3px solid var(--error); }

        .email-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent);
          color: #0d0d0d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
          text-transform: uppercase;
        }

        .email-info { flex: 1; min-width: 0; }

        .email-from {
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .email-subject {
          font-size: 11px;
          color: var(--text2);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }

        .email-status {
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .email-status.pending { background: var(--bg3); color: var(--text3); }
        .email-status.sending { background: rgba(158,255,0,0.15); color: var(--accent); }
        .email-status.done { background: rgba(34,197,94,0.15); color: var(--success); }
        .email-status.draft { background: rgba(0,212,255,0.15); color: var(--accent2); }
        .email-status.fail { background: rgba(239,68,68,0.15); color: var(--error); }

        .email-loading-dots {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text3);
          animation: dots 1.4s infinite;
        }

        @keyframes dots {
          0%, 20% { content: '.'; }
          40% { content: '..'; }
          60%, 100% { content: '...'; }
        }

        /* ── Divider ── */
        .divider {
          height: 1px;
          background: var(--border);
          margin: 8px 20px;
          flex-shrink: 0;
        }

        /* ── Composer area (scrollable) ── */
        .composer-area {
          flex: 1;
          overflow-y: auto;
          padding: 0 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .composer-area::-webkit-scrollbar { width: 4px; }
        .composer-area::-webkit-scrollbar-track { background: transparent; }
        .composer-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        /* Template row */
        .template-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .template-select {
          flex: 1;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 8px 10px;
          appearance: none;
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 28px;
          transition: border-color 0.2s;
        }

        .template-select:focus {
          outline: none;
          border-color: var(--accent);
        }

        .template-select option {
          background: var(--bg2);
          color: var(--text);
        }

        /* AI button */
        .ai-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border: 1px solid #4a3f8a;
          border-radius: var(--radius);
          color: #b794f4;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .ai-btn:hover {
          background: linear-gradient(135deg, #2d2060, #1e3a5f);
          border-color: #b794f4;
          color: #fff;
        }

        .ai-btn.loading {
          pointer-events: none;
          opacity: 0.6;
        }

        .ai-spinner {
          width: 12px;
          height: 12px;
          border: 1.5px solid rgba(183,148,244,0.3);
          border-top-color: #b794f4;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Tone selector */
        .tone-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .tone-chip {
          padding: 4px 10px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 20px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text2);
          cursor: pointer;
          transition: all 0.15s;
        }

        .tone-chip:hover { border-color: var(--text2); color: var(--text); }

        .tone-chip.active {
          background: rgba(158,255,0,0.1);
          border-color: var(--accent);
          color: var(--accent);
        }

        /* Textarea */
        .reply-textarea {
          width: 100%;
          min-height: 140px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
          padding: 12px 14px;
          resize: vertical;
          transition: border-color 0.2s;
        }

        .reply-textarea:focus {
          outline: none;
          border-color: var(--accent);
        }

        .reply-textarea::placeholder { color: var(--text3); }

        /* Char count */
        .char-count {
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--text3);
          text-align: right;
          margin-top: -8px;
        }

        /* BCC field */
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .field-label {
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text3);
        }

        .field-input {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 8px 12px;
          transition: border-color 0.2s;
        }

        .field-input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .field-input::placeholder { color: var(--text3); }

        /* Signature toggle */
        .sig-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toggle {
          position: relative;
          width: 36px;
          height: 20px;
          flex-shrink: 0;
        }

        .toggle input { opacity: 0; width: 0; height: 0; }

        .toggle-track {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle input:checked + .toggle-track {
          background: rgba(158,255,0,0.2);
          border-color: var(--accent);
        }

        .toggle-track::after {
          content: '';
          position: absolute;
          top: 2px; left: 2px;
          width: 14px; height: 14px;
          background: var(--text3);
          border-radius: 50%;
          transition: transform 0.2s, background 0.2s;
        }

        .toggle input:checked + .toggle-track::after {
          transform: translateX(16px);
          background: var(--accent);
        }

        .toggle-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text2);
        }

        /* ── Footer actions ── */
        .footer {
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          background: var(--bg);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .action-mode {
          display: flex;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }

        .mode-btn {
          flex: 1;
          padding: 8px;
          background: transparent;
          border: none;
          color: var(--text2);
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }

        .mode-btn.active {
          background: var(--bg3);
          color: var(--text);
        }

        .mode-btn:first-child { border-right: 1px solid var(--border); }

        .send-btn {
          width: 100%;
          padding: 12px;
          background: var(--accent);
          border: none;
          border-radius: var(--radius);
          color: #0d0d0d;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }

        .send-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0);
          transition: background 0.2s;
        }

        .send-btn:hover::after { background: rgba(255,255,255,0.15); }
        .send-btn:active { transform: scale(0.98); }

        .send-btn.loading {
          pointer-events: none;
          background: var(--bg3);
          color: var(--text2);
        }

        .send-btn .btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0,0,0,0.2);
          border-top-color: #0d0d0d;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .progress-bar {
          height: 3px;
          background: var(--bg3);
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.4s ease;
          width: 0%;
        }

        /* ── Toast ── */
        .toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          padding: 10px 16px;
          border-radius: var(--radius);
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 500;
          z-index: 100;
          transform: translateY(60px);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          max-width: 300px;
        }

        .toast.show {
          transform: translateY(0);
          opacity: 1;
        }

        .toast.success { background: rgba(34,197,94,0.15); border: 1px solid var(--success); color: var(--success); }
        .toast.error { background: rgba(239,68,68,0.15); border: 1px solid var(--error); color: var(--error); }
        .toast.warn { background: rgba(245,158,11,0.15); border: 1px solid var(--warn); color: var(--warn); }
        .toast.info { background: rgba(158,255,0,0.1); border: 1px solid var(--accent); color: var(--accent); }

        /* ── Empty state ── */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 30px 20px;
          color: var(--text3);
          font-family: var(--font-mono);
          font-size: 11px;
          text-align: center;
        }

        .empty-state svg { opacity: 0.3; }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      </style>

      <div class="panel">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <div class="header-logo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div>
              <div class="header-title">Bulk Email Reply</div>
              <div class="header-subtitle" id="ber-header-count">0 emails selected</div>
            </div>
          </div>
          <div class="header-close" id="ber-close-btn" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>

        <!-- Email list -->
        <div class="section-label">Selected Emails</div>
        <div class="email-list" id="ber-email-list">
          <div class="empty-state">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Loading emails...
          </div>
        </div>

        <div class="divider"></div>

        <!-- Composer -->
        <div class="composer-area">

          <!-- Template + AI row -->
          <div class="section-label">Reply Composer</div>
          <div class="template-row">
            <select class="template-select" id="ber-template-select">
              <option value="">— Choose template —</option>
            </select>
            <button class="ai-btn" id="ber-ai-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              AI Generate
            </button>
          </div>

          <!-- Tone chips -->
          <div class="tone-row" id="ber-tone-row">
            <span class="tone-chip active" data-tone="professional">Professional</span>
            <span class="tone-chip" data-tone="friendly">Friendly</span>
            <span class="tone-chip" data-tone="concise">Concise</span>
            <span class="tone-chip" data-tone="formal">Formal</span>
          </div>

          <!-- Textarea -->
          <textarea class="reply-textarea" id="ber-reply-text" placeholder="Type your reply here, or use AI Generate / a template above..."></textarea>
          <div class="char-count"><span id="ber-char-count">0</span> characters</div>

          <!-- BCC -->
          <div class="field-group">
            <div class="field-label">BCC (Auto-archive / CRM)</div>
            <input type="email" class="field-input" id="ber-bcc" placeholder="crm@yourcompany.com">
          </div>

          <!-- Signature toggle -->
          <div class="sig-row">
            <label class="toggle">
              <input type="checkbox" id="ber-sig-toggle" checked>
              <div class="toggle-track"></div>
            </label>
            <span class="toggle-label">Append email signature</span>
          </div>

        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="action-mode">
            <button class="mode-btn active" id="ber-mode-send" data-mode="send">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send Now
            </button>
            <button class="mode-btn" id="ber-mode-draft" data-mode="draft">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Save Drafts
            </button>
          </div>
          <div class="progress-bar" id="ber-progress-bar" style="display:none">
            <div class="progress-fill" id="ber-progress-fill"></div>
          </div>
          <button class="send-btn" id="ber-send-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span id="ber-send-label">Reply to 0 Emails</span>
          </button>
        </div>

        <!-- Toast -->
        <div class="toast" id="ber-toast"></div>
      </div>
    `;

    attachSidebarListeners();
  }

  function attachSidebarListeners() {
    if (!shadow) return;

    // Close
    shadow.getElementById('ber-close-btn').addEventListener('click', closeSidebar);

    // Tone chips
    shadow.querySelectorAll('.tone-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        shadow.querySelectorAll('.tone-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Char count
    const textarea = shadow.getElementById('ber-reply-text');
    textarea.addEventListener('input', () => {
      shadow.getElementById('ber-char-count').textContent = textarea.value.length;
    });

    // Template select
    shadow.getElementById('ber-template-select').addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      const allTemplates = [...DEFAULT_TEMPLATES];
      const t = allTemplates.find((t) => t.id === val);
      if (t) {
        textarea.value = t.body;
        shadow.getElementById('ber-char-count').textContent = t.body.length;
      }
    });

    // AI generate
    shadow.getElementById('ber-ai-btn').addEventListener('click', handleAIGenerate);

    // Mode toggle
    shadow.getElementById('ber-mode-send').addEventListener('click', () => setMode('send'));
    shadow.getElementById('ber-mode-draft').addEventListener('click', () => setMode('draft'));

    // Send / draft button
    shadow.getElementById('ber-send-btn').addEventListener('click', handleBulkAction);

    // Load saved BCC from settings
    chrome.storage.sync.get(['defaultBcc'], (data) => {
      if (data.defaultBcc) {
        shadow.getElementById('ber-bcc').value = data.defaultBcc;
      }
    });

    // Load custom templates
    loadTemplatesIntoSelect();
  }

  async function loadTemplatesIntoSelect() {
    const select = shadow?.getElementById('ber-template-select');
    if (!select) return;

    let templates = [...DEFAULT_TEMPLATES];
    try {
      const data = await chrome.storage.sync.get(['templates']);
      if (data.templates?.length) templates = [...templates, ...data.templates];
    } catch (_) {}

    select.innerHTML = '<option value="">— Choose template —</option>';
    templates.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  }

  let currentMode = 'send';

  function setMode(mode) {
    currentMode = mode;
    const sendBtn = shadow?.getElementById('ber-mode-send');
    const draftBtn = shadow?.getElementById('ber-mode-draft');
    const actionBtn = shadow?.getElementById('ber-send-btn');
    const label = shadow?.getElementById('ber-send-label');
    if (!sendBtn) return;

    if (mode === 'send') {
      sendBtn.classList.add('active');
      draftBtn.classList.remove('active');
      if (label) label.textContent = `Reply to ${threadDetails.length} Email${threadDetails.length !== 1 ? 's' : ''}`;
    } else {
      draftBtn.classList.add('active');
      sendBtn.classList.remove('active');
      if (label) label.textContent = `Save ${threadDetails.length} Draft${threadDetails.length !== 1 ? 's' : ''}`;
    }
  }

  // ── AI Generate ─────────────────────────────────────────────

  async function handleAIGenerate() {
    const btn = shadow?.getElementById('ber-ai-btn');
    if (!btn) return;

    const tone = shadow.querySelector('.tone-chip.active')?.dataset.tone || 'professional';
    const textarea = shadow.getElementById('ber-reply-text');

    // Use first email as context
    const firstThread = threadDetails[0];
    if (!firstThread) {
      showToast('No emails loaded yet', 'warn');
      return;
    }

    btn.classList.add('loading');
    btn.innerHTML = `<div class="ai-spinner"></div> Generating...`;

    try {
      const result = await msg('generateAI', {
        originalBody: firstThread.body || firstThread.snippet || '',
        senderName: extractSenderName(firstThread.from || ''),
        subject: firstThread.subject || '',
        style: tone
      });
      textarea.value = result.reply || '';
      shadow.getElementById('ber-char-count').textContent = textarea.value.length;
      showToast('AI reply generated!', 'success');
    } catch (err) {
      if (err.message.includes('No OpenAI API key')) {
        showToast('Add your OpenAI API key in the extension popup', 'warn');
      } else {
        showToast('AI generation failed: ' + err.message, 'error');
      }
    } finally {
      btn.classList.remove('loading');
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        AI Generate`;
    }
  }

  // ── Bulk Action ─────────────────────────────────────────────

  async function handleBulkAction() {
    const replyText = shadow?.getElementById('ber-reply-text')?.value?.trim();
    if (!replyText) {
      showToast('Please write a reply first', 'warn');
      return;
    }
    if (threadDetails.length === 0) {
      showToast('No emails loaded', 'warn');
      return;
    }

    const bcc = shadow.getElementById('ber-bcc')?.value?.trim() || '';
    const asDraft = currentMode === 'draft';
    const sendBtn = shadow.getElementById('ber-send-btn');
    const progressBar = shadow.getElementById('ber-progress-bar');
    const progressFill = shadow.getElementById('ber-progress-fill');
    const label = shadow.getElementById('ber-send-label');

    sendBtn.classList.add('loading');
    sendBtn.innerHTML = `<div class="btn-spinner"></div> <span>${asDraft ? 'Saving drafts' : 'Sending replies'}...</span>`;
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';

    // Update each email item to "sending" status
    threadDetails.forEach((t) => updateEmailItemStatus(t.threadId, 'sending'));

    let done = 0;
    const results = [];

    for (const thread of threadDetails) {
      try {
        const replyData = {
          threadId: thread.threadId,
          to: extractEmail(thread.from),
          subject: thread.subject,
          body: replyText,
          inReplyTo: thread.messageIdHeader,
          references: thread.references,
          bcc
        };

        if (asDraft) {
          await msg('saveDraft', { replyData });
        } else {
          await msg('sendReply', { replyData });
        }

        updateEmailItemStatus(thread.threadId, asDraft ? 'draft' : 'done');
        results.push({ threadId: thread.threadId, status: 'success' });
      } catch (err) {
        updateEmailItemStatus(thread.threadId, 'fail');
        results.push({ threadId: thread.threadId, status: 'error', error: err.message });
      }

      done++;
      progressFill.style.width = `${(done / threadDetails.length) * 100}%`;
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.filter((r) => r.status === 'error').length;

    sendBtn.classList.remove('loading');
    sendBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Done — ${successCount} ${asDraft ? 'draft' : 'sent'}${failCount > 0 ? `, ${failCount} failed` : ''}</span>
    `;

    if (failCount > 0) {
      showToast(`${failCount} email(s) failed. Check permissions.`, 'error');
    } else {
      showToast(
        asDraft
          ? `${successCount} draft${successCount !== 1 ? 's' : ''} saved!`
          : `${successCount} repl${successCount !== 1 ? 'ies' : 'y'} sent!`,
        'success'
      );
    }

    // Reset button after 3s
    setTimeout(() => {
      sendBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        <span id="ber-send-label">Reply to ${threadDetails.length} Email${threadDetails.length !== 1 ? 's' : ''}</span>
      `;
    }, 3000);
  }

  function updateEmailItemStatus(threadId, status) {
    const el = shadow?.querySelector(`[data-thread-id="${threadId}"] .email-status`);
    if (!el) return;
    el.className = `email-status ${status}`;
    const labels = { pending: 'PENDING', sending: 'SENDING', done: 'SENT', draft: 'DRAFT', fail: 'FAILED' };
    el.textContent = labels[status] || status.toUpperCase();
  }

  // ── Open / Close Sidebar ────────────────────────────────────

  async function openSidebar() {
    if (!shadow) createSidebar();
    sidebarOpen = true;

    // Slide in
    shadowHost.style.right = '0px';

    // Gather selected thread IDs
    const ids = getSelectedThreadIds();
    selectedThreadIds = ids.size > 0 ? ids : new Set();

    // If we couldn't extract IDs from DOM, use count-based fallback placeholder
    const count = ids.size > 0 ? ids.size : getSelectedCount();
    updateHeaderCount(count);
    setMode(currentMode);
    renderEmailList([...selectedThreadIds].map((id) => ({ threadId: id })));

    // Fetch thread details
    await loadThreadDetails([...selectedThreadIds]);
  }

  function closeSidebar() {
    sidebarOpen = false;
    if (shadowHost) shadowHost.style.right = '-480px';
  }

  function updateHeaderCount(count) {
    const el = shadow?.getElementById('ber-header-count');
    if (el) el.textContent = `${count} email${count !== 1 ? 's' : ''} selected`;
  }

  // ── Render email list ───────────────────────────────────────

  function renderEmailList(items) {
    const list = shadow?.getElementById('ber-email-list');
    if (!list) return;

    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        No emails selected
      </div>`;
      return;
    }

    list.innerHTML = items.map((item) => {
      const name = item.from ? extractSenderName(item.from) : item.threadId.slice(0, 8) + '...';
      const initial = name.charAt(0).toUpperCase();
      const subject = esc(item.subject || 'Loading...');
      const fromDisplay = esc(item.from ? extractSenderName(item.from) : 'Loading...');

      return `
        <div class="email-item ${item.loaded ? 'loaded' : 'loading'}" data-thread-id="${esc(item.threadId)}">
          <div class="email-avatar" style="background: ${avatarColor(name)}">${initial}</div>
          <div class="email-info">
            <div class="email-from">${fromDisplay}</div>
            <div class="email-subject">${subject}</div>
          </div>
          <div class="email-status pending">PENDING</div>
        </div>
      `;
    }).join('');
  }

  function avatarColor(name) {
    const colors = ['#9eff00', '#00d4ff', '#ff6b6b', '#ffd93d', '#c77dff', '#ff9f43', '#2ed573'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  async function loadThreadDetails(threadIds) {
    threadDetails = [];
    const list = shadow?.getElementById('ber-email-list');

    for (const threadId of threadIds) {
      try {
        const detail = await msg('getThreadDetails', { threadId });
        detail.threadId = threadId;
        detail.loaded = true;
        threadDetails.push(detail);

        // Update the email item in the DOM
        const item = shadow?.querySelector(`[data-thread-id="${threadId}"]`);
        if (item) {
          const name = extractSenderName(detail.from || '');
          const initial = name.charAt(0).toUpperCase();
          item.classList.remove('loading');
          item.classList.add('loaded');
          item.querySelector('.email-avatar').style.background = avatarColor(name);
          item.querySelector('.email-avatar').textContent = initial;
          item.querySelector('.email-from').textContent = name;
          item.querySelector('.email-subject').textContent = detail.subject || '(no subject)';
        }
      } catch (err) {
        console.warn('[BulkReply] Failed to load thread', threadId, err);
        threadDetails.push({ threadId, error: err.message, loaded: false });
      }
    }

    // Update send button count
    setMode(currentMode);
  }

  // ── Toast ────────────────────────────────────────────────────

  function showToast(message, type = 'info') {
    const toast = shadow?.getElementById('ber-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type}`;

    // Show
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // ── Polling loop ─────────────────────────────────────────────

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      // Ensure toolbar button exists
      injectToolbarButton();

      // Count selected
      const count = getSelectedCount();
      if (count !== lastSelectedCount) {
        lastSelectedCount = count;
        updateButtonCount(count);

        // Update button visibility
        const btn = document.getElementById(BTN_ID);
        if (btn) {
          btn.style.opacity = count > 0 ? '1' : '0.5';
        }
      }

      // If sidebar is open, sync IDs
      if (sidebarOpen) {
        updateHeaderCount(count);
      }
    }, POLL_INTERVAL);
  }

  // ── MutationObserver for Gmail navigation ────────────────────

  function setupObserver() {
    const observer = new MutationObserver(() => {
      injectToolbarButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ── Init ─────────────────────────────────────────────────────

  function init() {
    // Wait for Gmail to be ready
    const readyCheck = setInterval(() => {
      if (document.querySelector('div.G-atb, [gh="mtb"], .aqJ, div[role="main"]')) {
        clearInterval(readyCheck);
        createSidebar();
        injectToolbarButton();
        startPolling();
        setupObserver();
      }
    }, 500);
  }

  // Kick off
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
