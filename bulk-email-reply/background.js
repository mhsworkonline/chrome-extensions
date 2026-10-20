// ============================================================
//  Bulk Email Reply — Background Service Worker
//  Handles OAuth, Gmail API calls, and message routing
// ============================================================

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email'
];

// ── Auth ────────────────────────────────────────────────────

async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive, scopes: SCOPES }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function revokeToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
          resolve(true);
        });
      } else {
        resolve(false);
      }
    });
  });
}

async function getUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  return res.json();
}

// ── Gmail API helpers ────────────────────────────────────────

async function gmailFetch(path, options = {}, token) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    // Token expired — remove cached and retry once
    await new Promise((r) =>
      chrome.identity.removeCachedAuthToken({ token }, r)
    );
    const newToken = await getAuthToken(false);
    const retry = await fetch(`${GMAIL_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${newToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!retry.ok) throw new Error(`Gmail API error: ${retry.status}`);
    return retry.json();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gmail API error: ${res.status}`);
  }
  return res.json();
}

// Get thread details (subject, sender, snippet, body)
async function getThread(threadId, token) {
  return gmailFetch(`/threads/${threadId}?format=full`, {}, token);
}

// List threads in inbox (recent N)
async function listThreads(maxResults = 50, token) {
  return gmailFetch(`/threads?labelIds=INBOX&maxResults=${maxResults}`, {}, token);
}

// Get message details
async function getMessage(messageId, token) {
  return gmailFetch(`/messages/${messageId}?format=full`, {}, token);
}

// Build a MIME message for reply
function buildReplyMime({ to, subject, body, inReplyTo, references, bcc }) {
  const lines = [];
  lines.push(`To: ${to}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject.startsWith('Re:') ? subject : 'Re: ' + subject}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('MIME-Version: 1.0');
  lines.push('');
  lines.push(body);

  const raw = lines.join('\r\n');
  // Base64url encode
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Send a reply to a thread
async function sendReply({ threadId, to, subject, body, inReplyTo, references, bcc }, token) {
  const raw = buildReplyMime({ to, subject, body, inReplyTo, references, bcc });
  return gmailFetch('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, threadId })
  }, token);
}

// Save reply as draft
async function saveDraft({ threadId, to, subject, body, inReplyTo, references, bcc }, token) {
  const raw = buildReplyMime({ to, subject, body, inReplyTo, references, bcc });
  return gmailFetch('/drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw, threadId } })
  }, token);
}

// Parse email headers from a message object
function parseHeaders(message) {
  const headers = message.payload?.headers || [];
  const get = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  return {
    from: get('From'),
    to: get('To'),
    subject: get('Subject'),
    messageId: get('Message-ID'),
    references: get('References'),
    date: get('Date')
  };
}

// Extract plain-text body from message payload
function extractBody(payload) {
  if (!payload) return '';

  // Direct plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Multipart — search recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

function decodeBase64(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      escape(atob(base64))
    );
  } catch {
    return atob(base64);
  }
}

// ── AI response generation ───────────────────────────────────

async function generateAIReply({ originalBody, senderName, subject, apiKey, style }) {
  if (!apiKey) throw new Error('No OpenAI API key configured');

  const systemPrompt = `You are a professional email assistant. Write concise, ${style || 'professional'} email replies.
Keep replies brief (2-4 sentences). Match the tone of the original. Do not include a subject line or greeting prefix — just the reply body.`;

  const userPrompt = `Write a reply to this email:

From: ${senderName}
Subject: ${subject}
---
${originalBody.slice(0, 800)}
---
Reply in a ${style || 'professional'} tone. Be specific and helpful.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'OpenAI API error');
  }

  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() || '';
}

// ── Message router ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // keep channel open for async
});

async function handleMessage(request) {
  const { action } = request;

  switch (action) {

    case 'signin': {
      const token = await getAuthToken(true);
      const user = await getUserInfo(token);
      await chrome.storage.sync.set({ userEmail: user.email, signedIn: true });
      return { email: user.email };
    }

    case 'signout': {
      await revokeToken();
      await chrome.storage.sync.remove(['userEmail', 'signedIn']);
      return { success: true };
    }

    case 'getStatus': {
      const data = await chrome.storage.sync.get(['userEmail', 'signedIn']);
      return data;
    }

    case 'getThreadDetails': {
      const token = await getAuthToken(false);
      const { threadId } = request;
      const thread = await getThread(threadId, token);
      // Get last message in thread
      const messages = thread.messages || [];
      const lastMsg = messages[messages.length - 1];
      const headers = parseHeaders(lastMsg);
      const body = extractBody(lastMsg.payload);
      return {
        threadId,
        messageId: lastMsg.id,
        subject: headers.subject,
        from: headers.from,
        to: headers.to,
        messageIdHeader: headers.messageId,
        references: [headers.references, headers.messageId].filter(Boolean).join(' '),
        snippet: thread.snippet,
        body
      };
    }

    case 'sendReply': {
      const token = await getAuthToken(false);
      const { replyData } = request;
      return sendReply(replyData, token);
    }

    case 'saveDraft': {
      const token = await getAuthToken(false);
      const { replyData } = request;
      return saveDraft(replyData, token);
    }

    case 'bulkAction': {
      const token = await getAuthToken(false);
      const { threads, replyText, bcc, asDraft } = request;
      const results = [];

      for (const thread of threads) {
        try {
          const replyData = {
            threadId: thread.threadId,
            to: thread.from,
            subject: thread.subject,
            body: replyText,
            inReplyTo: thread.messageIdHeader,
            references: thread.references,
            bcc
          };
          if (asDraft) {
            await saveDraft(replyData, token);
          } else {
            await sendReply(replyData, token);
          }
          results.push({ threadId: thread.threadId, status: 'success' });
        } catch (err) {
          results.push({ threadId: thread.threadId, status: 'error', error: err.message });
        }
      }
      return results;
    }

    case 'generateAI': {
      const { originalBody, senderName, subject, style } = request;
      const { openaiApiKey } = await chrome.storage.sync.get(['openaiApiKey']);
      return { reply: await generateAIReply({ originalBody, senderName, subject, apiKey: openaiApiKey, style }) };
    }

    case 'getSettings': {
      return chrome.storage.sync.get(['openaiApiKey', 'defaultBcc', 'defaultTemplate', 'templates']);
    }

    case 'saveSettings': {
      await chrome.storage.sync.set(request.settings);
      return { success: true };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
