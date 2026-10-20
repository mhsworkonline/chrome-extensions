# Chrome Extensions

A collection of Manifest V3 Chrome extensions. Each folder is a self-contained extension.

| Extension | What it does | Needs a build? |
|---|---|---|
| [site-insights](site-insights) | Free, lightweight insights for any website: rank, estimated traffic, tech stack, SEO, speed, security headers, privacy, content, sitemap, a watchlist with local history, and a one-click PDF report. No API keys. | Yes |
| [bulk-email-reply](bulk-email-reply) | Select several Gmail emails and reply to all of them at once, using templates or AI-written drafts. | No (needs [setup](bulk-email-reply/README.md)) |
| [full-webpage-capture](full-webpage-capture) | Capture a full-length screenshot of any page, then download it as PNG or PDF, or copy it to the clipboard. | No |
| [sniptext](sniptext) | Drag over any text on screen to copy it instantly, using OCR that runs locally. | No |

## Loading an extension in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the extension's folder.

For **site-insights**, build it first and load the generated `dist` folder instead:

```bash
cd site-insights
npm install
npm run build
```

After changing the code, run `npm run build` again and click the reload icon on the extension's card.

## site-insights and privacy

site-insights works without any API key or paid service. Besides reading the page you are on, it makes only these requests:

- the public [Tranco](https://tranco-list.eu) list, for a site's rank;
- the inspected site's own `robots.txt`, `sitemap.xml` and response headers.

Your browsing activity, cookies (names only, never values) and saved history stay in the browser.

## Pushing changes to GitHub

`deploy.js` commits everything and pushes it to this repository. It needs only [Node.js](https://nodejs.org) and Git.

```bash
node deploy.js                      # commit with an automatic message, then push
node deploy.js "Describe change"    # commit with your own message
node deploy.js --dry-run            # check everything, change nothing
```

Before committing it scans the changes for secrets (API keys, tokens, private keys, `.env` files) and for files over GitHub's size limit, and stops if it finds any. It never force-pushes.

`node_modules/`, `dist/`, `*.zip` and `.claude/` are ignored by `.gitignore`. Publish packaged zips through GitHub Releases rather than committing them.
