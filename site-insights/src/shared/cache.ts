import type { Snapshot } from './types';

const key = (domain: string, source: string) => `snap:${domain}:${source}`;

export async function readSnapshot<T>(domain: string, source: string): Promise<Snapshot<T> | null> {
  const k = key(domain, source);
  const got = await chrome.storage.local.get(k);
  return (got[k] as Snapshot<T> | undefined) ?? null;
}

export async function writeSnapshot<T>(domain: string, source: string, snap: Snapshot<T>): Promise<void> {
  await chrome.storage.local.set({ [key(domain, source)]: snap });
}

export const isFresh = (s: Snapshot<unknown>) => Date.now() - s.fetchedAt < s.ttl;
