// The user's choices for how the extension behaves (this browser only).

export interface Settings {
  /** Show the Wera dock on job postings and application forms. */
  launcher: boolean;
  /** Move the job to Applied when the site confirms the application. */
  autoApplied: boolean;
  /** Ask the AI for fields Wera could not fill from what it knows. */
  aiSuggest: boolean;
  /** After Continue, fill the next page as soon as it appears. */
  autoContinue: boolean;
  /** Remember answers typed into forms (in Wera, for every browser). */
  learn: boolean;
}

export const DEFAULT_SETTINGS: Settings = { launcher: true, autoApplied: true, aiSuggest: true, autoContinue: true, learn: true };

export const SETTINGS_KEY = 'wera.settings';

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
