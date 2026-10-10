import type { Applicant, ContentRequest, FillResult, PageInfo } from '../shared/types';

/** The tab the side panel is working with. */
export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Opened as a tab of its own (not as the side panel): work on the page
  // the user was on before.
  if (tab?.url?.startsWith(location.origin)) {
    const others = (await chrome.tabs.query({ currentWindow: true }))
      .filter((t) => !t.url?.startsWith(location.origin))
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    return others[0] ?? null;
  }
  return tab ?? null;
}

export class NeedsPermission extends Error {
  constructor(readonly origin: string) {
    super(`Wera needs permission to read ${origin}`);
  }
}

function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}/*` : null;
  } catch {
    return null;
  }
}

/** Asks for access to the tab's site (needs a click: call from a handler). */
export async function requestSite(url: string): Promise<boolean> {
  const p = originPattern(url);
  return p ? chrome.permissions.request({ origins: [p] }) : false;
}

/** Injects the content script (once per page) and sends it a request. */
async function send<T>(tab: chrome.tabs.Tab, msg: ContentRequest): Promise<T> {
  if (tab.id == null || !tab.url || !originPattern(tab.url)) throw new Error('Open a job page to use Wera here.');
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) {
    const origin = new URL(tab.url).origin;
    if (/permission|Cannot access/i.test(String(e))) throw new NeedsPermission(origin);
    throw e;
  }
  return chrome.tabs.sendMessage(tab.id, msg) as Promise<T>;
}

export const readPage = (tab: chrome.tabs.Tab) => send<PageInfo>(tab, { type: 'wera:read-page' });
export const listQuestions = (tab: chrome.tabs.Tab) =>
  send<{ id: string; label: string; required: boolean; filled: boolean }[]>(tab, { type: 'wera:questions' });
export const insert = (tab: chrome.tabs.Tab, id: string, text: string) =>
  send<{ ok: boolean }>(tab, { type: 'wera:insert', id, text });
export const fill = (tab: chrome.tabs.Tab, applicant: Applicant, resume?: { name: string; base64: string }, coverLetter?: string) =>
  send<FillResult[]>(tab, { type: 'wera:fill', applicant, resume, coverLetter });
export const insertCoverLetter = (tab: chrome.tabs.Tab, text: string) =>
  send<{ ok: boolean }>(tab, { type: 'wera:insert-cover-letter', text });
