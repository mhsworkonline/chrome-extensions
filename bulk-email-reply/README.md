# Bulk Email Reply — Chrome Extension

Reply to multiple Gmail emails at once with AI-powered responses, professional templates, and draft support.

---

## Features

- **Bulk reply** — select multiple emails in Gmail and reply to all in one click
- **AI Generate** — uses OpenAI GPT-4o-mini to write smart, personalized responses  
- **5 built-in templates** — Acknowledgement, Follow-up, Not Available, Confirmation, Polite Decline
- **Custom templates** — create and save your own reply templates
- **Send now or save as drafts** — review before sending if you prefer
- **Auto BCC** — automatically BCC a CRM or archive address on every reply
- **Tone selector** — Professional, Friendly, Concise, or Formal

---

## Setup (Required — 5 minutes)

### Step 1: Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Bulk Email Reply")
3. Enable the **Gmail API**: APIs & Services → Library → search "Gmail API" → Enable
4. Configure OAuth consent screen: APIs & Services → OAuth consent screen
   - User Type: **External**
   - Add your email as a test user
   - Scopes: add `gmail.modify` and `gmail.compose`
5. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID**
   - Application type: **Chrome Extension**
   - Item ID: your extension ID (see Step 2)
6. Copy the **Client ID**

### Step 2: Add your Client ID to the manifest

Open `manifest.json` and replace the placeholder:

```json
"oauth2": {
  "client_id": "REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  ...
}
```

### Step 3: Load the extension in Chrome

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `bulk-email-reply` folder
5. Note your **Extension ID** (shown on the card) — use this in Step 1 if needed

### Step 4: Configure OpenAI (optional, for AI Generate)

1. Click the extension icon in Chrome's toolbar
2. Click **Connect Gmail** and authorize
3. In the **AI Settings** tab, paste your OpenAI API key
4. Click **Save Settings**

Get an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

---

## How to Use

1. Open **Gmail** in Chrome
2. Select one or more emails using their checkboxes
3. Click the **Bulk Reply** button that appears in the Gmail toolbar
4. A sidebar panel slides in from the right
5. Choose a template OR click **AI Generate** for a smart response
6. Optionally add a BCC address for CRM sync
7. Choose **Send Now** or **Save Drafts**
8. Click the action button — done!

---

## File Structure

```
bulk-email-reply/
├── manifest.json       Chrome Extension Manifest V3
├── background.js       Service worker: auth + Gmail API
├── content.js          Gmail DOM injection + sidebar UI  
├── popup.html          Extension popup (settings)
├── popup.js            Popup logic
├── popup.css           Popup styles
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Privacy

- Your Gmail OAuth token is handled entirely by Chrome's `chrome.identity` API
- Your OpenAI API key is stored in `chrome.storage.sync` (synced to your Chrome account, encrypted)
- No data is sent to any third-party servers other than Google and OpenAI (when you use AI Generate)
- The extension only reads emails you explicitly select

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Bulk Reply" button not appearing | Reload Gmail (Cmd/Ctrl+R) after installing |
| OAuth error on sign-in | Ensure your email is added as a test user in Google Cloud Console |
| AI Generate fails | Check your OpenAI API key in popup settings |
| Sends fail with 403 | Re-authorize by signing out and back in from the popup |
| Extension ID mismatch | Re-copy the extension ID from `chrome://extensions` and update Google Cloud Console |
