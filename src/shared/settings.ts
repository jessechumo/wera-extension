// The user's choices for how the extension behaves (this browser only).

export interface Settings {
  /** Show the Wera panel on job postings and application forms. */
  launcher: boolean;
  /** Move the job to Applied when the site confirms the application. */
  autoApplied: boolean;
  /** After the site confirms an application the user just sent: say so on the page, then close the tab. */
  closeAfterApply: boolean;
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
  /** Write what Wera does to the console of each page (for finding out why a field was missed). */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = { launcher: true, autoApplied: true, closeAfterApply: true, aiSuggest: true, autoContinue: true, learn: true, aiQuestions: true, assist: true, debug: false };

export const SETTINGS_KEY = 'wera.settings';

/** Sites the user keeps Wera off (it still opens from the toolbar icon there). */
export const HIDDEN_SITES = 'wera.hiddenSites';

/** The site a document belongs to: a frame's is the page around it. */
export function siteKey(doc: Document): string {
  const ancestors = doc.location.ancestorOrigins;
  const top = ancestors?.length ? ancestors[ancestors.length - 1]! : doc.location.origin;
  try {
    return new URL(top).hostname;
  } catch {
    return doc.location.hostname;
  }
}

export async function isSiteHidden(site: string): Promise<boolean> {
  const got = await chrome.storage.local.get(HIDDEN_SITES);
  return !!(got[HIDDEN_SITES] as Record<string, number> | undefined)?.[site];
}

export async function setSiteHidden(site: string, hidden: boolean): Promise<void> {
  const got = await chrome.storage.local.get(HIDDEN_SITES);
  const map = { ...(got[HIDDEN_SITES] as Record<string, number> | undefined) };
  if (hidden) map[site] = Date.now();
  else delete map[site];
  await chrome.storage.local.set({ [HIDDEN_SITES]: map });
}

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
