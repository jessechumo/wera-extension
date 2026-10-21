import type { JobDraft } from './types';
import type { WeraUser } from './api';

/** Where the extension keeps its sign-in (chrome.storage.local). */
export interface Session {
  server: string;
  token: string;
  user: WeraUser;
}

const KEY = 'wera.session';

export async function loadSession(): Promise<Session | null> {
  const got = await chrome.storage.local.get(KEY);
  return (got[KEY] as Session | undefined) ?? null;
}

export async function saveSession(s: Session | null): Promise<void> {
  if (s) await chrome.storage.local.set({ [KEY]: s });
  else await chrome.storage.local.remove(KEY);
}

const TAB_JOBS = 'wera.tabJobs';

/**
 * The job a tab was on, so moving from a posting to its application form
 * (often a different URL) keeps the job. Session storage: cleared when
 * the browser closes.
 */
export async function rememberTabJob(tabId: number, origin: string, jobId: number): Promise<void> {
  const got = await chrome.storage.session.get(TAB_JOBS);
  const map = (got[TAB_JOBS] as Record<string, { origin: string; jobId: number }> | undefined) ?? {};
  map[tabId] = { origin, jobId };
  await chrome.storage.session.set({ [TAB_JOBS]: map });
}

export async function tabJob(tabId: number, origin: string): Promise<number | null> {
  const got = await chrome.storage.session.get(TAB_JOBS);
  const hit = (got[TAB_JOBS] as Record<string, { origin: string; jobId: number }> | undefined)?.[tabId];
  return hit && hit.origin === origin ? hit.jobId : null;
}

/** "http://192.168.4.68:3000/" -> "http://192.168.4.68:3000"; null when not http(s). */
export function normalizeServer(raw: string): string | null {
  try {
    const u = new URL(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

const TAB_PAGES = 'wera.tabPages';

/** What the Wera dock saw in a tab: when it last showed a form, and the posting it last showed. */
export interface TabPage {
  formAt?: number;
  draft?: JobDraft;
  at: number;
}

export async function tabPages(): Promise<Record<string, TabPage>> {
  const got = await chrome.storage.session.get(TAB_PAGES);
  return (got[TAB_PAGES] as Record<string, TabPage> | undefined) ?? {};
}

export async function notePage(tabId: number, patch: Partial<TabPage>): Promise<TabPage> {
  const map = await tabPages();
  const next = { ...map[tabId], ...patch, at: Date.now() };
  map[tabId] = next;
  for (const [k, v] of Object.entries(map)) if (Date.now() - v.at > 12 * 3600_000) delete map[k];
  await chrome.storage.session.set({ [TAB_PAGES]: map });
  return next;
}
