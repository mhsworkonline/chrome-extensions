import { useEffect, useState } from 'preact/hooks';
import type { Message, SiteResult } from '../shared/types';
import { pinnedTabId } from './pinned';

/** Loads the active tab's site; with `live`, reloads when the user switches or navigates tabs. */
export function useSite(live = false): SiteResult | null {
  const [site, setSite] = useState<SiteResult | null>(null);

  useEffect(() => {
    let stale = false;
    const load = () => {
      const msg: Message = { type: 'getSite', tabId: pinnedTabId };
      chrome.runtime.sendMessage(msg).then((r: SiteResult) => {
        if (!stale) setSite(r);
      });
    };
    load();
    if (!live) return () => (stale = true);

    // A pinned dashboard follows only its own tab; the side panel follows whichever tab is active.
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.status === 'complete' && (pinnedTabId === undefined || id === pinnedTabId)) load();
    };
    if (pinnedTabId === undefined) chrome.tabs.onActivated.addListener(load);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      stale = true;
      chrome.tabs.onActivated.removeListener(load);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [live]);

  return site;
}
