import { deleteVisitsBefore, putVisits } from '../shared/db';
import { registrableDomain } from '../shared/domain';
import { getSettings } from '../shared/settings';
import type { Visit } from '../shared/types';

/**
 * Local-only activity tracking. A "visit" is a run of page views on one site in one tab;
 * active time counts only while that tab is visible, the window is focused and the user is not idle.
 * State lives in storage.session because the service worker can be stopped at any time.
 */

const KEY = 'activity';
const BOUNCE_MS = 10_000;
const RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
export const FLUSH_ALARM = 'activity-flush';

interface OpenVisit {
  id: string;
  domain: string;
  startedAt: number;
  activeMs: number;
  pageViews: number;
}

interface State {
  visits: Record<number, OpenVisit>;
  /** Tab currently receiving the user's attention, and since when. */
  active: { tabId: number; since: number } | null;
  focused: boolean;
  userActive: boolean;
}

const fresh = (): State => ({ visits: {}, active: null, focused: true, userActive: true });

async function load(): Promise<State> {
  const got = await chrome.storage.session.get(KEY);
  return (got[KEY] as State | undefined) ?? fresh();
}
const save = (s: State) => chrome.storage.session.set({ [KEY]: s });

/** Handlers read-modify-write the same state, so they run one at a time. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue(fn: (s: State) => void | Promise<void>): Promise<void> {
  const run = queue.then(async () => {
    if (!(await getSettings()).trackActivity) return;
    const s = await load();
    await fn(s);
    await save(s);
  });
  queue = run.catch((e) => console.warn('[site-insights] activity', e));
  return run.catch(() => undefined);
}

const toVisit = (v: OpenVisit): Visit => ({
  ...v,
  bounced: v.pageViews <= 1 && v.activeMs < BOUNCE_MS,
});

/** Moves elapsed attention time into the tab's visit. */
function settle(s: State, now: number) {
  if (!s.active) return;
  const v = s.visits[s.active.tabId];
  if (v) v.activeMs += now - s.active.since;
  s.active.since = now;
}

async function refocus(s: State, now: number) {
  settle(s, now);
  s.active = null;
  if (!s.focused || !s.userActive) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id !== undefined) s.active = { tabId: tab.id, since: now };
}

async function finalize(s: State, tabId: number) {
  const v = s.visits[tabId];
  if (!v) return;
  delete s.visits[tabId];
  await putVisits([toVisit(v)]);
}

function startVisit(s: State, tabId: number, domain: string, now: number) {
  s.visits[tabId] = { id: crypto.randomUUID(), domain, startedAt: now, activeMs: 0, pageViews: 1 };
}

export function registerActivityListeners() {
  chrome.tabs.onActivated.addListener(() => void enqueue((s) => refocus(s, Date.now())));

  chrome.windows.onFocusChanged.addListener((windowId) =>
    void enqueue((s) => {
      settle(s, Date.now());
      s.focused = windowId !== chrome.windows.WINDOW_ID_NONE;
      return refocus(s, Date.now());
    }),
  );

  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((state) =>
    void enqueue((s) => {
      settle(s, Date.now());
      s.userActive = state === 'active';
      return refocus(s, Date.now());
    }),
  );

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete') return;
    void enqueue(async (s) => {
      const now = Date.now();
      const domain = registrableDomain(tab.url);
      const current = s.visits[tabId];
      settle(s, now);
      if (current && current.domain === domain) {
        current.pageViews += 1;
        return;
      }
      await finalize(s, tabId);
      if (domain) startVisit(s, tabId, domain, now);
      if (tab.active && !s.active && s.focused && s.userActive) s.active = { tabId, since: now };
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) =>
    void enqueue(async (s) => {
      settle(s, Date.now());
      await finalize(s, tabId);
      if (s.active?.tabId === tabId) s.active = null;
    }),
  );

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== FLUSH_ALARM) return;
    void enqueue(async (s) => {
      const now = Date.now();
      settle(s, now);
      await putVisits(Object.values(s.visits).map(toVisit));
      await deleteVisitsBefore(now - RETENTION_MS);
    });
  });

  // Turning tracking on starts from the current tab; turning it off drops in-flight state.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const was = (changes.settings.oldValue as { trackActivity?: boolean } | undefined)?.trackActivity ?? false;
    const now = (changes.settings.newValue as { trackActivity?: boolean } | undefined)?.trackActivity ?? false;
    if (was === now) return;
    if (!now) {
      void chrome.storage.session.remove(KEY);
      return;
    }
    void enqueue(async (s) => {
      const t = Date.now();
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const domain = registrableDomain(tab?.url);
      if (tab?.id !== undefined && domain) {
        startVisit(s, tab.id, domain, t);
        s.active = { tabId: tab.id, since: t };
      }
    });
  });
}

export function ensureFlushAlarm() {
  void chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
}
