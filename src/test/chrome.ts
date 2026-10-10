import { vi } from 'vitest';
import type { FillResult, PageInfo } from '../shared/types';

/**
 * A small fake of the chrome.* APIs the side panel uses. `content` answers
 * what the content script would; `granted` decides permission prompts.
 */
export function fakeChrome(opts: { page?: PageInfo; fill?: FillResult[]; granted?: boolean; insertOk?: boolean } = {}) {
  const store: Record<string, unknown> = {};
  const session: Record<string, unknown> = {};
  const area = (data: Record<string, unknown>) => ({
    get: vi.fn(async (k: string) => (k in data ? { [k]: data[k] } : {})),
    set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(data, o)),
    remove: vi.fn(async (k: string) => void delete data[k]),
  });
  const tab = { id: 7, url: opts.page?.url ?? 'https://jobs.example/acme/1', active: true, windowId: 1 };
  const sent: unknown[] = [];
  const chromeFake = {
    storage: { local: area(store), session: area(session) },
    permissions: { request: vi.fn(async () => opts.granted ?? true) },
    tabs: {
      query: vi.fn(async () => [tab]),
      create: vi.fn(),
      sendMessage: vi.fn(async (_id: number, msg: { type: string }) => {
        sent.push(msg);
        if (msg.type === 'wera:read-page') return opts.page;
        if (msg.type === 'wera:fill') return opts.fill ?? [];
        if (msg.type === 'wera:insert' || msg.type === 'wera:insert-cover-letter') return { ok: opts.insertOk ?? true };
        return null;
      }),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn(async () => []) },
  };
  vi.stubGlobal('chrome', chromeFake);
  return { chrome: chromeFake, store, sent };
}
