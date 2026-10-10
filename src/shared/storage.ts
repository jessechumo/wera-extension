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
