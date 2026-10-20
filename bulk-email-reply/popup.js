// ============================================================
//  Bulk Email Reply — Popup Script
// ============================================================

const DEFAULT_TEMPLATES = [
  { id: 'ack', name: 'Acknowledgement', builtin: true },
  { id: 'followup', name: 'Follow-up Request', builtin: true },
  { id: 'notavail', name: 'Not Available', builtin: true },
  { id: 'confirm', name: 'Confirmation', builtin: true },
  { id: 'decline', name: 'Polite Decline', builtin: true }
];

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

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await checkAuthStatus();
  await loadSettings();
  setupListeners();
});

// ── Tabs ─────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });
}

// ── Auth ─────────────────────────────────────────────────────

async function checkAuthStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot loading';
  text.textContent = 'Checking...';

  try {
    const status = await msg('getStatus');
    if (status?.signedIn && status?.userEmail) {
      setConnected(status.userEmail);
    } else {
      setDisconnected();
    }
  } catch (_) {
    setDisconnected();
  }
}

function setConnected(email) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const emailEl = document.getElementById('user-email-display');
  const signinBtn = document.getElementById('signin-btn');
  const signoutBtn = document.getElementById('signout-btn');

  dot.className = 'status-dot connected';
  text.textContent = 'Connected';
  emailEl.textContent = email;
  emailEl.style.display = 'block';
  signinBtn.style.display = 'none';
  signoutBtn.style.display = 'flex';
}

function setDisconnected() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const emailEl = document.getElementById('user-email-display');
  const signinBtn = document.getElementById('signin-btn');
  const signoutBtn = document.getElementById('signout-btn');

  dot.className = 'status-dot';
  text.textContent = 'Not connected';
  emailEl.style.display = 'none';
  signinBtn.style.display = 'flex';
  signoutBtn.style.display = 'none';
}

// ── Settings ─────────────────────────────────────────────────

async function loadSettings() {
  try {
    const settings = await msg('getSettings');

    if (settings.openaiApiKey) {
      document.getElementById('openai-key').value = settings.openaiApiKey;
    }
    if (settings.defaultBcc) {
      document.getElementById('default-bcc').value = settings.defaultBcc;
    }
    if (settings.defaultTone) {
      document.getElementById('default-tone').value = settings.defaultTone;
    }
    if (settings.defaultMode) {
      const radio = document.querySelector(`input[name="default-mode"][value="${settings.defaultMode}"]`);
      if (radio) radio.checked = true;
    }

    renderTemplates(settings.templates || []);
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
}

// ── Templates ─────────────────────────────────────────────────

function renderTemplates(customTemplates) {
  const list = document.getElementById('templates-list');
  const allTemplates = [
    ...DEFAULT_TEMPLATES.map((t) => ({ ...t, builtin: true })),
    ...customTemplates.map((t) => ({ ...t, builtin: false }))
  ];

  list.innerHTML = allTemplates.map((t) => `
    <div class="tpl-item" data-id="${t.id}">
      <div>
        <div class="tpl-item-name">${escHtml(t.name)}</div>
        <div class="tpl-item-type">${t.builtin ? 'Built-in' : 'Custom'}</div>
      </div>
      ${!t.builtin ? `
        <button class="tpl-delete" data-id="${t.id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      ` : ''}
    </div>
  `).join('');

  // Delete listeners
  list.querySelectorAll('.tpl-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const data = await chrome.storage.sync.get(['templates']);
      const templates = (data.templates || []).filter((t) => t.id !== id);
      await chrome.storage.sync.set({ templates });
      renderTemplates(templates);
    });
  });
}

// ── Listeners ─────────────────────────────────────────────────

function setupListeners() {
  // Sign in
  document.getElementById('signin-btn').addEventListener('click', async () => {
    const btn = document.getElementById('signin-btn');
    btn.textContent = 'Connecting...';
    btn.disabled = true;
    try {
      const result = await msg('signin');
      setConnected(result.email);
    } catch (err) {
      btn.textContent = 'Connect Gmail';
      btn.disabled = false;
      showSaveStatus('Auth failed: ' + err.message, 'error');
    }
  });

  // Sign out
  document.getElementById('signout-btn').addEventListener('click', async () => {
    await msg('signout');
    setDisconnected();
  });

  // Toggle API key visibility
  document.getElementById('toggle-key-vis').addEventListener('click', () => {
    const input = document.getElementById('openai-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Add template toggle
  document.getElementById('add-template-btn').addEventListener('click', () => {
    document.getElementById('add-template-form').style.display = 'flex';
    document.getElementById('add-template-btn').style.display = 'none';
  });

  document.getElementById('cancel-template-btn').addEventListener('click', () => {
    document.getElementById('add-template-form').style.display = 'none';
    document.getElementById('add-template-btn').style.display = 'inline-flex';
    document.getElementById('new-tpl-name').value = '';
    document.getElementById('new-tpl-body').value = '';
  });

  document.getElementById('save-template-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-tpl-name').value.trim();
    const body = document.getElementById('new-tpl-body').value.trim();
    if (!name || !body) return;

    const data = await chrome.storage.sync.get(['templates']);
    const templates = data.templates || [];
    templates.push({ id: 'custom_' + Date.now(), name, body, builtin: false });
    await chrome.storage.sync.set({ templates });
    renderTemplates(templates);

    document.getElementById('add-template-form').style.display = 'none';
    document.getElementById('add-template-btn').style.display = 'inline-flex';
    document.getElementById('new-tpl-name').value = '';
    document.getElementById('new-tpl-body').value = '';
  });

  // Save settings
  document.getElementById('save-btn').addEventListener('click', async () => {
    const settings = {
      openaiApiKey: document.getElementById('openai-key').value.trim(),
      defaultBcc: document.getElementById('default-bcc').value.trim(),
      defaultTone: document.getElementById('default-tone').value,
      defaultMode: document.querySelector('input[name="default-mode"]:checked')?.value || 'send'
    };

    try {
      await msg('saveSettings', { settings });
      showSaveStatus('✓ Settings saved', 'success');
    } catch (err) {
      showSaveStatus('Failed to save: ' + err.message, 'error');
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────

function showSaveStatus(message, type) {
  const el = document.getElementById('save-status');
  el.textContent = message;
  el.className = `save-status ${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'save-status';
  }, 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
