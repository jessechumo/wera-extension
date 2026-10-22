// The user's choices for how the extension behaves (this browser only).

export interface Settings {
  /** Show the Wera panel on job postings and application forms. */
  launcher: boolean;
  /** Move the job to Applied when the site confirms the application. */
  autoApplied: boolean;
  /** Ask the AI for fields Wera could not fill from what it knows. */
  aiSuggest: boolean;
  /** After Continue, fill the next page as soon as it appears. */
  autoContinue: boolean;
  /** Remember answers typed into forms (in Wera, for every browser). */
  learn: boolean;
  /** Draft answers to open questions ("Tell me about a time...") while autofilling. */
  aiQuestions: boolean;
  /** The Wera button in open questions, to draft and rework an answer. */
  assist: boolean;
}

export const DEFAULT_SETTINGS: Settings = { launcher: true, autoApplied: true, aiSuggest: true, autoContinue: true, learn: true, aiQuestions: true, assist: true };

export const SETTINGS_KEY = 'wera.settings';

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
