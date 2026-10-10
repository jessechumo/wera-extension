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
