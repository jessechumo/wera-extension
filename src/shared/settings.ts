// The user's choices for how the extension behaves (this browser only).

export interface Settings {
  /** Show the Wera button on job pages Wera may read. */
  launcher: boolean;
  /** Ask the AI for fields Wera could not fill from what it knows. */
  aiSuggest: boolean;
  /** After Continue, fill the next page as soon as it appears. */
  autoContinue: boolean;
  /** Remember answers typed into forms (in Wera, for every browser). */
  learn: boolean;
}

export const DEFAULT_SETTINGS: Settings = { launcher: true, aiSuggest: true, autoContinue: true, learn: true };

export const SETTINGS_KEY = 'wera.settings';

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
