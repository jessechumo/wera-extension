import { vi } from 'vitest';
import type { FieldSnapshot, FillItem, FillResult, PageInfo, PagePlan } from '../shared/types';

/**
 * A small fake of the chrome.* APIs the side panel uses. `content` answers
 * what the content script would; `granted` decides permission prompts.
 */
export function fakeChrome(opts: {
  page?: PageInfo; granted?: boolean; insertOk?: boolean;
  /** What reading the form returns (a function to change it between reads). */
  plan?: PagePlan | (() => PagePlan);
  /** How each approved field fills (default: filled with its value). */
  applyItem?: (item: FillItem) => Partial<FillResult>;
  snapshot?: FieldSnapshot[] | (() => FieldSnapshot[]);
  next?: { ok: boolean; label?: string; final?: boolean };
} = {}) {
  const store: Record<string, unknown> = {};
  const session: Record<string, unknown> = {};
  const area = (data: Record<string, unknown>) => ({
    get: vi.fn(async (k: string) => (k in data ? { [k]: data[k] } : {})),
    set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(data, o)),
    remove: vi.fn(async (k: string) => void delete data[k]),
  });
  type Listener = (...args: never[]) => void;
  const listeners = { message: new Set<Listener>(), changed: new Set<Listener>() };
  const tab = { id: 7, url: opts.page?.url ?? 'https://jobs.example/acme/1', active: true, windowId: 1 };
  const sent: unknown[] = [];
  const chromeFake = {
    storage: { local: area(store), session: area(session) },
    permissions: { request: vi.fn(async () => opts.granted ?? true), contains: vi.fn(async () => false) },
    tabs: {
      query: vi.fn(async () => [tab]),
      create: vi.fn(),
      sendMessage: vi.fn(async (_id: number, msg: { type: string }) => {
        sent.push(msg);
        if (msg.type === 'wera:read-page') return opts.page;
        if (msg.type === 'wera:insert' || msg.type === 'wera:insert-cover-letter') return { ok: opts.insertOk ?? true };
        if (msg.type === 'wera:scan') return typeof opts.plan === 'function' ? opts.plan() : (opts.plan ?? { fields: [], next: null, errors: 0 });
        if (msg.type === 'wera:apply') {
          const results = (msg as unknown as { items: FillItem[] }).items.map((it): FillResult => ({
            id: it.id, label: it.id, purpose: null, status: 'filled', value: it.value, required: false, ...opts.applyItem?.(it),
          }));
          // The page script reports each field as it lands.
          for (const result of results) emit({ type: 'wera:fill-progress', result });
          return results;
        }
        if (msg.type === 'wera:snapshot') return typeof opts.snapshot === 'function' ? opts.snapshot() : (opts.snapshot ?? []);
        if (msg.type === 'wera:next') return opts.next ?? { ok: true, label: 'Next' };
        if (msg.type === 'wera:highlight') return { ok: true };
        if (msg.type === 'wera:add-entries') return { added: (msg as unknown as { count: number }).count };
        return null;
      }),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn(async () => []) },
    runtime: {
      onMessage: { addListener: (f: Listener) => listeners.message.add(f), removeListener: (f: Listener) => listeners.message.delete(f) },
    },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
  };
  Object.assign(chromeFake.storage, {
    onChanged: { addListener: (f: Listener) => listeners.changed.add(f), removeListener: (f: Listener) => listeners.changed.delete(f) },
  });
  /** A message from the page script of `tabId` (default: the active tab). */
  function emit(msg: unknown, tabId = tab.id) {
    listeners.message.forEach((f) => (f as (m: unknown, s: unknown) => void)(msg, { tab: { id: tabId }, frameId: 0 }));
  }
  /** What the background does for a shortcut: leaves a value in session storage. */
  const setSession = async (key: string, value: unknown) => {
    session[key] = value;
    listeners.changed.forEach((f) => (f as (c: unknown, a: string) => void)({ [key]: { newValue: value } }, 'session'));
  };
  vi.stubGlobal('chrome', chromeFake);
  return { chrome: chromeFake, store, sent, emit, setSession };
}
