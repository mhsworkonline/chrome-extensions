/** Set when the dashboard was opened in its own tab for one specific site (`panel.html?tab=<id>`). */
const raw = new URLSearchParams(location.search).get('tab');
export const pinnedTabId: number | undefined = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;

export const openInTab = (tabId: number) =>
  chrome.tabs.create({ url: chrome.runtime.getURL(`panel.html?tab=${tabId}`) });
