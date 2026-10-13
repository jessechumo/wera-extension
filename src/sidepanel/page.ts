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

/** Sends a request to one frame's content script. */
function sendTo<T>(tab: chrome.tabs.Tab, frameId: number, msg: ContentRequest): Promise<T> {
  return (frameId === 0
    ? chrome.tabs.sendMessage(tab.id!, msg)
    : chrome.tabs.sendMessage(tab.id!, msg, { frameId })) as Promise<T>;
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
const frameField = (frameId: number, id: string) => (frameId === 0 ? id : `f${frameId}/${id}`);
function parseField(id: string): { frameId: number; id: string } {
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

/**
 * Fills the form in every frame that has one (or every frame when none
 * looks like a form), so a newsletter box beside an embedded form is left alone.
 */
export async function fill(tab: chrome.tabs.Tab, applicant: Applicant, resume?: { name: string; base64: string }, coverLetter?: string): Promise<FillResult[]> {
  const frames = await inject(tab);
  let targets = frames;
  if (frames.length > 1) {
    const pages = await sendAll<PageInfo>(tab, frames, { type: 'wera:read-page' });
    const withForm = pages.filter((p) => p.value.hasForm).map((p) => p.frameId);
    if (withForm.length) targets = withForm;
  }
  const replies = await sendAll<FillResult[]>(tab, targets, { type: 'wera:fill', applicant, resume, coverLetter });
  return replies.flatMap(({ frameId, value }) => value.map((r) => ({ ...r, id: frameField(frameId, r.id) })));
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
