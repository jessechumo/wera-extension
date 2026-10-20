// Runs on the sites the user allowed Wera on (registered by the
// background). On a job posting or an application form it shows a small
// Wera button in the corner; one click opens the side panel (and, on a
// form, starts filling). It reads nothing beyond what it needs to tell
// a job page from any other, and sends nothing anywhere.
import { classify } from '../content/classify';
import { collectFields } from '../content/fields';
import { readJobPosting } from '../content/jsonld';
import { SETTINGS_KEY } from '../shared/settings';

declare global {
  interface Window {
    __weraLauncher?: boolean;
  }
}

const DISMISSED = 'wera.launcherDismissed';
const DISMISS_FOR = 7 * 86_400_000;

export type PageKind = 'form' | 'posting' | null;

/** Whether the page is an application form, a job posting, or neither. */
export function pageKind(doc: Document): PageKind {
  // The bridge marks the user's own Wera dashboard: its forms are not applications.
  if (doc.documentElement.dataset.weraExtension) return null;
  const fields = collectFields(doc).map(classify);
  const known = fields.filter((p) => p !== null && p !== 'question' && p !== 'consent').length;
  // An application asks who you are: a name or an email, and more.
  if (known >= 3 && fields.some((p) => p === 'email' || p === 'first_name' || p === 'full_name' || p === 'resume')) return 'form';
  if (readJobPosting(doc, doc.location.href)) return 'posting';
  return null;
}

const STYLE = `
:host { all: initial; }
.w { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; align-items: center; gap: 6px;
  font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
  animation: in .25s cubic-bezier(.22,1,.36,1) both; }
.b { display: flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 10px 14px 10px 10px; cursor: pointer;
  background: #FF7A59; color: #fff; font: inherit; box-shadow: 0 6px 24px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.06); }
.b:hover { background: #ff6a45; }
.b:focus-visible, .x:focus-visible { outline: 2px solid #1D1F24; outline-offset: 2px; }
.m { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,.22); font-size: 12px; }
.x { border: 0; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; background: rgba(29,31,36,.72); color: #fff; font: 14px/1 system-ui; }
.x:hover { background: #1D1F24; }
@keyframes in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .w { animation: none; } }`;

/** Builds the button in a shadow root, so the page's styles cannot touch it (nor it the page). */
export function mountButton(doc: Document, kind: Exclude<PageKind, null>, onOpen: () => void, onDismiss: () => void): { host: HTMLElement; root: ShadowRoot } {
  const host = doc.createElement('wera-launcher');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const wrap = doc.createElement('div');
  wrap.className = 'w';
  const open = doc.createElement('button');
  open.className = 'b';
  open.type = 'button';
  const mark = doc.createElement('span');
  mark.className = 'm';
  mark.textContent = 'W';
  open.append(mark, doc.createTextNode(kind === 'form' ? 'Autofill with Wera' : 'Save to Wera'));
  open.title = kind === 'form' ? 'Open Wera and fill this application (Alt+Shift+F)' : 'Open Wera: save this job, see your fit (Alt+Shift+W)';
  open.addEventListener('click', onOpen);
  const close = doc.createElement('button');
  close.className = 'x';
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Hide on this site for a week';
  close.setAttribute('aria-label', 'Hide the Wera button on this site');
  close.addEventListener('click', () => {
    host.remove();
    onDismiss();
  });
  wrap.append(open, close);
  root.append(style, wrap);
  doc.documentElement.append(host);
  return { host, root };
}

async function allowed(siteHost: string): Promise<boolean> {
  const got = await chrome.storage.local.get([SETTINGS_KEY, DISMISSED]);
  if ((got[SETTINGS_KEY] as { launcher?: boolean } | undefined)?.launcher === false) return false;
  const until = (got[DISMISSED] as Record<string, number> | undefined)?.[siteHost] ?? 0;
  return until < Date.now();
}

async function dismiss(siteHost: string) {
  const got = await chrome.storage.local.get(DISMISSED);
  const map = { ...(got[DISMISSED] as Record<string, number> | undefined) };
  map[siteHost] = Date.now() + DISMISS_FOR;
  for (const [k, v] of Object.entries(map)) if (v < Date.now()) delete map[k];
  await chrome.storage.local.set({ [DISMISSED]: map });
}

/** Watches the page (single-page job boards change without loading) and keeps the button in step. */
export function start(doc: Document, delay = 1200) {
  let host: HTMLElement | null = null;
  let shown: PageKind = null;
  let timer = 0;
  const siteHost = doc.location.host;
  const check = async () => {
    timer = 0;
    const kind = pageKind(doc);
    if (kind === shown) return;
    host?.remove();
    host = null;
    shown = kind;
    if (!kind || !(await allowed(siteHost))) return;
    host = mountButton(doc, kind, () => {
      // Opening the side panel needs this click: the background does it at once.
      void chrome.runtime.sendMessage({ type: 'wera:launcher-open', fill: kind === 'form' }).catch(() => {});
    }, () => void dismiss(siteHost)).host;
  };
  const schedule = () => {
    if (!timer) timer = window.setTimeout(() => void check(), delay);
  };
  schedule();
  new MutationObserver(schedule).observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined' && !window.__weraLauncher && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  window.__weraLauncher = true;
  // Embedded frames (an ATS form inside a careers page) are reached from the top page's button.
  if (window.top === window) start(document);
}
