import type { Settings } from './types';

const DEFAULTS: Settings = { trackActivity: false };

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(got.settings as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}
