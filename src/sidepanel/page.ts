import type { ContentRequest, Profile, FieldSnapshot, FillItem, FillResult, KnownAnswer, PageInfo, PagePlan } from '../shared/types';

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

/** Asks for access to the sites of embedded application forms (needs a click). */
export function requestOrigins(origins: string[]): Promise<boolean> {
  return chrome.permissions.request({ origins: origins.map((o) => `${o}/*`) });
}

/**
 * Injects the content script (once per frame) into the tab and every frame
 * Wera may read; returns those frames' ids, the top frame (0) first.
 */
async function inject(tab: chrome.tabs.Tab): Promise<number[]> {
  if (tab.id == null || !tab.url || !originPattern(tab.url)) throw new Error('Open a job page to use Wera here.');
  const files = ['content.js'];
  let results: chrome.scripting.InjectionResult[] | undefined;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files });
  } catch {
    // Some frame refused: the top frame alone still works.
    try {
      results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
    } catch (e) {
      if (/permission|Cannot access/i.test(String(e))) throw new NeedsPermission(new URL(tab.url).origin);
      throw e;
    }
  }
  const ids = [...new Set([0, ...(results ?? []).map((r) => r.frameId ?? 0)])];
  return ids.sort((a, b) => a - b);
}

/**
 * Sends a request to one frame's content script. Always by frame id: sent
 * to the tab, a request reaches every frame, and an embedded form's frame
 * could answer for the top one (and fill the page's own fields).
 */
function sendTo<T>(tab: chrome.tabs.Tab, frameId: number, msg: ContentRequest): Promise<T> {
  return chrome.tabs.sendMessage(tab.id!, msg, { frameId });
}

/** Sends a request to every frame; frames that do not answer are left out. */
async function sendAll<T>(tab: chrome.tabs.Tab, frames: number[], msg: ContentRequest): Promise<{ frameId: number; value: T }[]> {
  const got = await Promise.all(
    frames.map((frameId) =>
      sendTo<T | null>(tab, frameId, msg).then(
        (value) => ({ frameId, value }),
        () => ({ frameId, value: null }),
      ),
    ),
  );
  return got.filter((g): g is { frameId: number; value: T } => g.value != null);
}

// Field ids from other frames carry the frame: "f12/w3" (the top frame's stay "w3").
export const frameField = (frameId: number, id: string) => (frameId === 0 ? id : `f${frameId}/${id}`);
export function parseField(id: string): { frameId: number; id: string } {
  const m = /^f(\d+)\/(.+)$/.exec(id);
  return m ? { frameId: Number(m[1]), id: m[2]! } : { frameId: 0, id };
}

/** Reads the page: the top frame's job data and text, and whether any frame holds the form. */
export async function readPage(tab: chrome.tabs.Tab): Promise<PageInfo> {
  const frames = await inject(tab);
  const replies = await sendAll<PageInfo>(tab, frames, { type: 'wera:read-page' });
  const top = replies.find((r) => r.frameId === 0)?.value;
  if (!top) throw new Error('Wera could not read this page. Reload it and try again.');
  const others = replies.filter((r) => r.frameId !== 0).map((r) => r.value);
  // Frames Wera already reads need no permission prompt.
  const reached = new Set(others.map((p) => safeOrigin(p.url)));
  return {
    ...top,
    hasForm: top.hasForm || others.some((p) => p.hasForm),
    submitted: !!top.submitted || others.some((p) => p.submitted),
    frameOrigins: (top.frameOrigins ?? []).filter((o) => !reached.has(o)),
  };
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Puts text into one field (in whichever frame it is). */
export async function insert(tab: chrome.tabs.Tab, id: string, text: string): Promise<{ ok: boolean }> {
  await inject(tab);
  const f = parseField(id);
  return sendTo<{ ok: boolean }>(tab, f.frameId, { type: 'wera:insert', id: f.id, text }).catch(() => ({ ok: false }));
}

/** Puts a cover letter into the first cover letter box found in any frame. */
export async function insertCoverLetter(tab: chrome.tabs.Tab, text: string): Promise<{ ok: boolean }> {
  for (const frameId of await inject(tab)) {
    const r = await sendTo<{ ok: boolean } | null>(tab, frameId, { type: 'wera:insert-cover-letter', text }).catch(() => null);
    if (r?.ok) return r;
  }
  return { ok: false };
}

/** Attaches a file to the form's resume or cover letter upload, in whichever frame has one. */
export async function attachToForm(tab: chrome.tabs.Tab, what: 'resume' | 'cover_letter', file: { name: string; base64: string }): Promise<{ ok: boolean }> {
  for (const frameId of await inject(tab)) {
    const r = await sendTo<{ ok: boolean } | null>(tab, frameId, { type: 'wera:attach', what, file }).catch(() => null);
    if (r?.ok) return r;
  }
  return { ok: false };
}

/** The frames whose page holds the form (all frames when none looks like one). */
async function formFrames(tab: chrome.tabs.Tab, tries = 3, delay = 400): Promise<number[]> {
  for (let i = 0; ; i++) {
    const frames = await inject(tab);
    if (frames.length === 1) return frames;
    const pages = await sendAll<PageInfo>(tab, frames, { type: 'wera:read-page' });
    const withForm = pages.filter((p) => p.value.hasForm).map((p) => p.frameId);
    if (withForm.length) return withForm;
    // An embedded form still loading would leave only the page around it
    // (and its newsletter box): give it a moment before using every frame.
    if (i >= tries - 1) return frames;
    await new Promise((r) => setTimeout(r, delay));
  }
}

/** A form page read in every frame that holds it: what each field shows and what Wera would enter. Changes nothing. */
export async function scan(tab: chrome.tabs.Tab, applicant: Profile, answers: KnownAnswer[], resumeName?: string, coverLetter?: boolean): Promise<PagePlan> {
  const frames = await formFrames(tab);
  const replies = await sendAll<PagePlan>(tab, frames, { type: 'wera:scan', applicant, answers, resumeName, coverLetter });
  const plan: PagePlan = { fields: [], next: null, errors: 0 };
  let nextFields = -1;
  for (const { frameId, value } of replies) {
    plan.fields.push(...value.fields.map((f) => ({ ...f, id: frameField(frameId, f.id) })));
    plan.errors += value.errors;
    if (value.adders?.length) plan.adders = [...(plan.adders ?? []), ...value.adders.map((a) => ({ ...a, frameId }))];
    // The way forward is in the frame with the most fields (the form, not a header).
    if (value.next && value.fields.length > nextFields) {
      plan.next = { ...value.next, id: frameField(frameId, value.next.id) };
      nextFields = value.fields.length;
    }
  }
  return plan;
}

/** Presses a section's Add button in the frame that has it, so the resume's other jobs or schools get blocks. */
export async function addEntries(tab: chrome.tabs.Tab, frameId: number, section: 'experience' | 'education', count: number): Promise<number> {
  const r = await sendTo<{ added: number } | null>(tab, frameId, { type: 'wera:add-entries', section, count }).catch(() => null);
  return r?.added ?? 0;
}

/** Fills the approved values, each frame's fields in its frame; results come back as each frame finishes. */
export async function apply(tab: chrome.tabs.Tab, items: FillItem[], resume?: { name: string; base64: string }, coverLetter?: string, pace = 30, letterFile?: { name: string; base64: string }): Promise<FillResult[]> {
  await inject(tab);
  const byFrame = new Map<number, FillItem[]>();
  for (const it of items) {
    const f = parseField(it.id);
    byFrame.set(f.frameId, [...(byFrame.get(f.frameId) ?? []), { id: f.id, value: it.value }]);
  }
  const out: FillResult[] = [];
  for (const [frameId, list] of byFrame) {
    const got = await sendTo<FillResult[] | null>(tab, frameId, { type: 'wera:apply', items: list, resume, coverLetter, letterFile, pace }).catch(() => null);
    out.push(...(got ?? list.map((i) => ({ id: i.id, label: '', purpose: null, status: 'review' as const, required: false, note: 'the page did not answer' })))
      .map((r) => ({ ...r, id: frameField(frameId, r.id) })));
  }
  return out;
}

/** What the user left in every field of the form, to learn answers from. */
export async function snapshotForm(tab: chrome.tabs.Tab): Promise<FieldSnapshot[]> {
  const frames = await formFrames(tab);
  const replies = await sendAll<FieldSnapshot[]>(tab, frames, { type: 'wera:snapshot' });
  return replies.flatMap(({ frameId, value }) => value.map((s) => ({ ...s, id: frameField(frameId, s.id) })));
}

/** Presses the page's Next button (in the frame it is in); never a Submit button. */
export async function pressNext(tab: chrome.tabs.Tab, nextId: string): Promise<{ ok: boolean; label?: string; final?: boolean }> {
  await inject(tab);
  const f = parseField(nextId);
  return sendTo<{ ok: boolean; label?: string; final?: boolean }>(tab, f.frameId, { type: 'wera:next' }).catch(() => ({ ok: false }));
}

/** Scrolls the page to a field and flashes it. */
export async function highlightField(tab: chrome.tabs.Tab, id: string): Promise<void> {
  const f = parseField(id);
  await sendTo(tab, f.frameId, { type: 'wera:highlight', id: f.id }).catch(() => {});
}
