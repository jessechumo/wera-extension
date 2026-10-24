// The tab's frames, as the Wera panel works with them: an application
// form is often embedded from another site (Greenhouse inside a careers
// page), so reading and filling happens in every frame that holds the
// form, each field in its own frame. The page script runs in every frame
// (manifest), so this only talks to it; pages opened before Wera was
// installed or updated get it injected first.
import type { LogEntry } from '../shared/log';
import type { FrameOps } from '../shared/rpc';
import type { ApplyRequest, ContentRequest, FieldSnapshot, FillItem, FillResult, PageInfo, PagePlan, ScanRequest } from '../shared/types';
import { originOf } from '../shared/url';

/** The tab's frames with Wera's page script, the top frame (0) first. */
async function reach(tabId: number): Promise<number[]> {
  // Every frame Wera may read says whether its page script is there.
  const ping = async () => {
    const got = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => !!(window as { __weraPage?: unknown }).__weraPage })
      .catch(() => chrome.scripting.executeScript({ target: { tabId }, func: () => !!(window as { __weraPage?: unknown }).__weraPage }).catch(() => []));
    return { all: got.length, ids: got.filter((r) => r.result).map((r) => r.frameId ?? 0) };
  };
  let found = await ping();
  // A frame without it (opened before Wera was installed or updated): add it there; it runs once per frame.
  if (found.ids.length < found.all || !found.ids.includes(0)) {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['page.js'] }).catch(() =>
      chrome.scripting.executeScript({ target: { tabId }, files: ['page.js'] }).catch(() => null));
    found = await ping();
  }
  return [...new Set([0, ...found.ids])].sort((a, b) => a - b);
}

/** Sends to one frame, always by id: sent to the tab, an embedded form's frame could answer for the top one. */
function sendTo<T>(tabId: number, frameId: number, msg: ContentRequest): Promise<T> {
  return chrome.tabs.sendMessage(tabId, msg, { frameId });
}

async function sendAll<T>(tabId: number, frameIds: number[], msg: ContentRequest): Promise<{ frameId: number; value: T }[]> {
  const got = await Promise.all(frameIds.map((frameId) => sendTo<T | null>(tabId, frameId, msg).then((value) => ({ frameId, value }), () => ({ frameId, value: null }))));
  return got.filter((g): g is { frameId: number; value: T } => g.value != null);
}

// Field ids from other frames carry the frame: "f12/w3" (the top frame's stay "w3").
export const frameField = (frameId: number, id: string) => (frameId === 0 ? id : `f${frameId}/${id}`);
export function parseField(id: string): { frameId: number; id: string } {
  const m = /^f(\d+)\/(.+)$/.exec(id);
  return m ? { frameId: Number(m[1]), id: m[2]! } : { frameId: 0, id };
}

/** The top frame's job data and text, and whether any frame holds the form. */
export async function readPage(tabId: number): Promise<PageInfo> {
  const ids = await reach(tabId);
  const replies = await sendAll<PageInfo>(tabId, ids, { type: 'wera:read-page' });
  const top = replies.find((r) => r.frameId === 0)?.value;
  if (!top) throw new Error("Wera couldn't read this page. Reload it and try again (pages opened before Wera was installed or updated need a reload).");
  const others = replies.filter((r) => r.frameId !== 0).map((r) => r.value);
  const reached = new Set(others.map((p) => originOf(p.url)));
  // An embedded form's frame knows its site, step and what it wants first.
  const form = others.find((p) => p.hasForm && (p.site || p.gate));
  return {
    ...top,
    site: top.site ?? form?.site,
    step: top.step ?? form?.step,
    gate: top.gate ?? form?.gate,
    hasForm: top.hasForm || others.some((p) => p.hasForm),
    submitted: !!top.submitted || others.some((p) => p.submitted),
    frameOrigins: (top.frameOrigins ?? []).filter((o) => !reached.has(o)),
  };
}

/** The frames whose page holds the form (all of them when none looks like one yet). */
async function formFrames(tabId: number, tries = 3, delay = 400): Promise<number[]> {
  for (let i = 0; ; i++) {
    const ids = await reach(tabId);
    if (ids.length === 1) return ids;
    const pages = await sendAll<PageInfo>(tabId, ids, { type: 'wera:read-page' });
    const withForm = pages.filter((p) => p.value.hasForm).map((p) => p.frameId);
    if (withForm.length) return withForm;
    // An embedded form still loading would leave only the page around it: give it a moment.
    if (i >= tries - 1) return ids;
    await new Promise((r) => setTimeout(r, delay));
  }
}

/** The form read in every frame that holds it. Changes nothing. */
export async function scan(tabId: number, req: ScanRequest): Promise<PagePlan> {
  const ids = await formFrames(tabId);
  const replies = await sendAll<PagePlan>(tabId, ids, { type: 'wera:scan', req });
  if (!replies.length) throw new Error("The page didn't answer Wera. Reload it and try again.");
  const plan: PagePlan = { fields: [], next: null, errors: 0 };
  let nextFields = -1;
  for (const { frameId, value } of replies) {
    plan.fields.push(...value.fields.map((f) => ({ ...f, id: frameField(frameId, f.id) })));
    plan.errors += value.errors;
    if (value.adders?.length) plan.adders = [...(plan.adders ?? []), ...value.adders.map((a) => ({ ...a, frameId }))];
    // The way forward (and the site, its step, what it wants first) is in the frame with the most fields: the form, not a header.
    if (value.fields.length > nextFields) {
      plan.next = value.next ? { ...value.next, id: frameField(frameId, value.next.id) } : plan.next;
      plan.site = value.site ?? plan.site;
      plan.step = value.step ?? plan.step;
      plan.gate = value.gate ?? plan.gate;
      nextFields = value.fields.length;
    }
  }
  return plan;
}

export async function addEntries(tabId: number, frameId: number, section: 'experience' | 'education', count: number): Promise<number> {
  const r = await sendTo<{ added: number } | null>(tabId, frameId, { type: 'wera:add-entries', section, count }).catch(() => null);
  return r?.added ?? 0;
}

/** Fills the approved values, each frame's fields in its frame. Progress comes as events. */
export async function apply(tabId: number, req: ApplyRequest): Promise<FillResult[]> {
  const byFrame = new Map<number, FillItem[]>();
  for (const it of req.items) {
    const f = parseField(it.id);
    byFrame.set(f.frameId, [...(byFrame.get(f.frameId) ?? []), { ...it, id: f.id }]);
  }
  const out: FillResult[] = [];
  for (const [frameId, list] of byFrame) {
    const got = await sendTo<FillResult[] | null>(tabId, frameId, { type: 'wera:apply', req: { ...req, items: list } }).catch(() => null);
    out.push(...(got ?? list.map((i) => ({ id: i.id, label: i.label ?? '', purpose: null, status: 'review' as const, required: false, note: "the page stopped answering Wera (it may have reloaded): fill it yourself or press Autofill again" })))
      .map((r) => ({ ...r, id: frameField(frameId, r.id) })));
  }
  return out;
}

export async function snapshot(tabId: number): Promise<FieldSnapshot[]> {
  const ids = await formFrames(tabId);
  const replies = await sendAll<FieldSnapshot[]>(tabId, ids, { type: 'wera:snapshot' });
  return replies.flatMap(({ frameId, value }) => value.map((s) => ({ ...s, id: frameField(frameId, s.id) })));
}

/** Presses the page's Next button (never a Submit button). */
export async function pressNext(tabId: number, nextId: string): Promise<{ ok: boolean; label?: string; final?: boolean }> {
  const f = parseField(nextId);
  return sendTo<{ ok: boolean; label?: string; final?: boolean }>(tabId, f.frameId, { type: 'wera:next' }).catch(() => ({ ok: false }));
}

export async function highlight(tabId: number, id: string): Promise<void> {
  const f = parseField(id);
  await sendTo(tabId, f.frameId, { type: 'wera:highlight', id: f.id }).catch(() => {});
}

/** The choices custom dropdowns offer, by field id (each frame opens its own and closes them again). */
export async function options(tabId: number, ids: string[]): Promise<Record<string, string[]>> {
  const byFrame = new Map<number, string[]>();
  for (const id of ids) {
    const f = parseField(id);
    byFrame.set(f.frameId, [...(byFrame.get(f.frameId) ?? []), f.id]);
  }
  const out: Record<string, string[]> = {};
  for (const [frameId, list] of byFrame) {
    const got = await sendTo<Record<string, string[]> | null>(tabId, frameId, { type: 'wera:options', ids: list }).catch(() => null);
    for (const [id, opts] of Object.entries(got ?? {})) out[frameField(frameId, id)] = opts;
  }
  return out;
}

/** Each frame's recent log, for Copy diagnostics. */
export async function logs(tabId: number): Promise<{ frameId: number; url: string; entries: LogEntry[] }[]> {
  const ids = await reach(tabId);
  return (await sendAll<{ url: string; entries: LogEntry[] }>(tabId, ids, { type: 'wera:log' })).map(({ frameId, value }) => ({ frameId, ...value }));
}

/** Runs one of the panel's frame operations on the tab. */
export const run: { [K in keyof FrameOps]: (tabId: number, ...args: FrameOps[K]['args']) => Promise<FrameOps[K]['result']> } = {
  read: readPage,
  scan,
  apply,
  'add-entries': addEntries,
  snapshot,
  next: pressNext,
  highlight,
  options,
  log: logs,
};
