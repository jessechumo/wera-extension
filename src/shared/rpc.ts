// What the Wera panel and the answer button (both run inside the job
// page) ask the background for. A page script cannot call the user's Wera
// server (the page's own rules forbid it) or reach the page's other
// frames, so the background does both and replies.
import { ApiError, type WeraApi } from './api';
import type { LogEntry } from './log';
import type { ApplyRequest, FieldSnapshot, FillResult, PageInfo, PagePlan, ScanRequest } from './types';

/** Work done in the frames of the tab that holds the form (see background/frames.ts): each op's arguments and result. */
export interface FrameOps {
  read: { args: []; result: PageInfo };
  scan: { args: [req: ScanRequest]; result: PagePlan };
  apply: { args: [req: ApplyRequest]; result: FillResult[] };
  'add-entries': { args: [frameId: number, section: 'experience' | 'education', count: number]; result: number };
  snapshot: { args: []; result: FieldSnapshot[] };
  next: { args: [nextId: string]; result: { ok: boolean; label?: string; final?: boolean } };
  'press-apply': { args: []; result: { ok: boolean } };
  highlight: { args: [id: string]; result: void };
  options: { args: [ids: string[]]; result: Record<string, string[]> };
  log: { args: []; result: { frameId: number; url: string; entries: LogEntry[] }[] };
}

export type FrameOp = keyof FrameOps;

export type PanelRequest =
  | { type: 'wera:api'; method: string; args: unknown[] }
  | { type: 'wera:frames'; op: FrameOp; args: unknown[] }
  | { type: 'wera:sign-in'; server: string; email: string; password: string }
  | { type: 'wera:sign-out' }
  /** The page script found a job page (or a form in a frame): show the panel. */
  | { type: 'wera:panel-ensure'; open?: boolean; fill?: boolean }
  /** The application went through and the user wants the tab gone (see panel/AppliedAlert.tsx). */
  | { type: 'wera:tab-close' }
  /** The user takes up the next match from the application they just sent: it opens in this tab. */
  | { type: 'wera:open-next'; jobId: number; url: string };

export const isPanelRequest = (m: unknown): m is PanelRequest => {
  const t = (m as { type?: unknown } | null)?.type;
  return t === 'wera:api' || t === 'wera:frames' || t === 'wera:sign-in' || t === 'wera:sign-out' || t === 'wera:panel-ensure' || t === 'wera:tab-close' || t === 'wera:open-next';
};

export type RpcReply<T = unknown> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** Runs fn and packs its outcome for sending back (errors keep their HTTP status). */
export async function settle<T>(fn: () => Promise<T>): Promise<RpcReply<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, status: e instanceof ApiError ? e.status : 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Asks the background; throws an ApiError when it failed or did not answer. */
export async function rpc<T>(msg: PanelRequest): Promise<T> {
  let r: RpcReply<T> | undefined;
  try {
    r = await chrome.runtime.sendMessage<PanelRequest, RpcReply<T>>(msg);
  } catch {
    throw new ApiError(0, 'Wera was updated: reload this page to keep using it.');
  }
  if (!r) throw new ApiError(0, 'Wera did not answer. Reload this page and try again.');
  if (!r.ok) throw new ApiError(r.status, r.error);
  return r.value;
}

// Methods a page may not call through the background: signing in has its own request.
const LOCAL_ONLY = new Set(['connect', 'call', 'download', 'constructor']);

/** Methods the background runs for a page. */
export const remoteCallable = (method: string) => !LOCAL_ONLY.has(method) && !method.startsWith('_');

/**
 * The Wera API as a page script uses it: every call runs in the
 * background, which holds the sign-in. dashboardUrl is worked out here.
 */
export function remoteApi(server: string): WeraApi {
  return new Proxy({} as WeraApi, {
    get(_, key) {
      if (key === 'server') return server;
      if (key === 'dashboardUrl') return (path = '/') => `${server}${path}`;
      if (typeof key !== 'string' || key === 'then') return undefined;
      return (...args: unknown[]) => rpc({ type: 'wera:api', method: key, args });
    },
  });
}

/** Work in the tab's frames, done by the background. */
export function frames<K extends FrameOp>(op: K, ...args: FrameOps[K]['args']): Promise<FrameOps[K]['result']> {
  return rpc<FrameOps[K]['result']>({ type: 'wera:frames', op, args });
}
