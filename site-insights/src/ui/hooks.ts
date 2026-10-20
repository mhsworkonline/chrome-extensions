import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getVisitsSince } from '../shared/db';
import { getSettings } from '../shared/settings';
import { mergePoints, rankKey } from '../shared/history';
import type { Message, RankPoint, Settings, SiteResult, Visit } from '../shared/types';
import { pinnedTabId } from './pinned';

/** Live view of extension settings, updated when they change anywhere. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const load = () => void getSettings().then(setSettings);
    load();
    const onChange = (_c: unknown, area: string) => area === 'local' && load();
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return settings;
}

/** Locally stored visits since `since` (ms epoch), refreshed every 30s because the worker flushes each minute. */
export function useVisits(since: number): Visit[] | null {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  useEffect(() => {
    let stale = false;
    const load = () =>
      void getVisitsSince(since).then((v) => {
        if (!stale) setVisits(v);
      });
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [since]);
  return visits;
}

/** Asks the worker to scan the active page when `enabled`, and again whenever `key` (the page URL) changes. */
export type ScanType = 'getPage' | 'getPerf' | 'getSecurity' | 'getPrivacy' | 'getSitemap';

export function usePageScan<T>(type: ScanType, enabled: boolean, key: string | null) {
  const [result, setResult] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  /** The page+request the current result belongs to, so switching sections doesn't throw it away. */
  const ran = useRef('');

  useEffect(() => {
    if (!enabled || !key) return;
    const id = `${key}|${nonce}`;
    if (ran.current === id) return;
    ran.current = id;
    let stale = false;
    setResult(null);
    const msg: Message = { type, tabId: pinnedTabId };
    chrome.runtime.sendMessage(msg).then((r: T) => {
      if (!stale && ran.current === id) setResult(r);
    });
    return () => {
      stale = true;
    };
  }, [type, enabled, key, nonce]);

  const rescan = useCallback(() => setNonce((n) => n + 1), []);
  return { result, rescan };
}

/** A value from storage.local that updates live when the worker or another page changes it. */
export function useStored<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const load = () => void chrome.storage.local.get(key).then((got) => setValue((got[key] as T | undefined) ?? fallback));
    load();
    const onChange = (changes: Record<string, unknown>, area: string) => area === 'local' && key in changes && load();
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [key]);
  return value;
}

/** Rank history for a site: what Tranco returned just now, merged with everything this browser has saved. */
export function useRankHistory(site: Extract<SiteResult, { ok: true }>): RankPoint[] {
  const stored = useStored<RankPoint[]>(rankKey(site.domain), []);
  const fresh = site.rank?.payload.history;
  return useMemo(() => mergePoints(stored, fresh ?? []), [stored, fresh]);
}
