import type {
  Message,
  PageResult,
  PerfResult,
  PrivacyResult,
  RankResult,
  SecurityResult,
  SiteResult,
  SitemapResult,
} from '../shared/types';
import { registrableDomain } from '../shared/domain';
import { getRank } from '../sources/tranco';
import { scanTab } from '../sources/page';
import { measureTab } from '../sources/perf';
import { checkSecurity } from '../sources/security';
import { collectPrivacy } from '../sources/privacy';
import { analyzeSitemap } from '../sources/sitemap';
import { ensureWatchAlarm, refreshWatchlist, WATCH_ALARM } from './watchlist';
import { ensureFlushAlarm, registerActivityListeners } from './activity';

/** The tab a request is about: the pinned one if given, else the active tab. */
const targetTab = async (tabId?: number): Promise<chrome.tabs.Tab | undefined> =>
  tabId === undefined
    ? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
    : chrome.tabs.get(tabId).catch(() => undefined);

async function getSite(tabId?: number): Promise<SiteResult> {
  const tab = await targetTab(tabId);
  const domain = registrableDomain(tab?.url);
  if (!domain || !tab?.url || tab.id === undefined) return { ok: false, reason: 'unsupported-page' };

  const base = { ok: true as const, domain, url: tab.url, tabId: tab.id, favIconUrl: tab.favIconUrl };
  try {
    return { ...base, rank: await getRank(domain) };
  } catch (err) {
    console.warn('[site-insights] rank lookup failed', err);
    return { ...base, rank: null, rankError: 'Rank is unavailable right now.' };
  }
}

async function getRankFor(input: string): Promise<RankResult> {
  const domain = registrableDomain(/^https?:\/\//i.test(input) ? input : `https://${input.trim()}`);
  if (!domain) return { ok: false, error: 'That doesn’t look like a website address.' };
  try {
    return { ok: true, domain, rank: await getRank(domain) };
  } catch {
    return { ok: false, error: 'Rank is unavailable right now.' };
  }
}

async function getPage(tabId?: number): Promise<PageResult> {
  const tab = await targetTab(tabId);
  if (!tab) return { ok: false, reason: 'No active tab.' };
  return scanTab(tab);
}

async function getPerf(tabId?: number): Promise<PerfResult> {
  const tab = await targetTab(tabId);
  if (!tab) return { ok: false, reason: 'No active tab.' };
  return measureTab(tab);
}

/** Runs a tab-based check and reports a missing tab the same way every time. */
async function onTab<R extends { ok: boolean }>(tabId: number | undefined, run: (tab: chrome.tabs.Tab) => Promise<R>): Promise<R | { ok: false; reason: string }> {
  const tab = await targetTab(tabId);
  return tab ? run(tab) : { ok: false, reason: 'No active tab.' };
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case 'getSite':
      getSite(msg.tabId).then(sendResponse);
      return true;
    case 'getRank':
      getRankFor(msg.domain).then(sendResponse);
      return true;
    case 'getPage':
      getPage(msg.tabId).then(sendResponse);
      return true;
    case 'getPerf':
      getPerf(msg.tabId).then(sendResponse);
      return true;
    case 'getSecurity':
      onTab<SecurityResult>(msg.tabId, checkSecurity).then(sendResponse);
      return true;
    case 'getPrivacy':
      onTab<PrivacyResult>(msg.tabId, collectPrivacy).then(sendResponse);
      return true;
    case 'getSitemap':
      onTab<SitemapResult>(msg.tabId, analyzeSitemap).then(sendResponse);
      return true;
  }
  return false;
});

registerActivityListeners();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCH_ALARM) void refreshWatchlist();
});

const MENU_ID = 'analyze-site';

chrome.runtime.onInstalled.addListener(() => {
  ensureFlushAlarm();
  ensureWatchAlarm();
  chrome.contextMenus.create({ id: MENU_ID, title: 'Analyze this site with Site Insights', contexts: ['page'] });
});
chrome.runtime.onStartup.addListener(() => {
  ensureFlushAlarm();
  ensureWatchAlarm();
});

// Both of these count as a user gesture, which opening the side panel requires.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-dashboard') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});
