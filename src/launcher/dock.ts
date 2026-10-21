// The Wera dock's look: a card that slides in at the right of a job page
// (or a small tab on the edge once minimized), and a toast for "marked as
// applied". Built in a closed shadow root, so the page's styles cannot
// touch it and it cannot touch the page.
import type { DockHello, DockJob, DockKind, PanelView } from '../shared/dock';

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { font: 400 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d1f24; }
button { font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid #ff7a59; outline-offset: 2px; }
.card { position: fixed; top: 84px; right: 16px; z-index: 2147483646; width: 312px; max-width: calc(100vw - 32px);
  background: #fff; border-radius: 16px; box-shadow: 0 18px 50px rgba(17,19,24,.22), 0 0 0 1px rgba(17,19,24,.07);
  overflow: hidden; animation: slide .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes slide { from { transform: translateX(calc(100% + 24px)); opacity: .4; } }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; background: #1d1f24; color: #fff; }
.logo { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: #ff7a59; font-weight: 800; font-size: 12px; }
.brand { font-weight: 700; letter-spacing: .01em; }
.kind { margin-left: 2px; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,.12); font-size: 11px; color: #e9eaee; white-space: nowrap; }
.icon { margin-left: auto; display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 7px; background: transparent; color: #c9ccd3; font-size: 16px; line-height: 1; }
.icon + .icon { margin-left: 0; }
.icon:hover { background: rgba(255,255,255,.12); color: #fff; }
.body { padding: 14px; display: grid; gap: 12px; }
.job { display: flex; gap: 11px; align-items: flex-start; }
.ring { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
  background: conic-gradient(var(--c) calc(var(--p) * 1%), #eceef2 0); }
.ring span { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: #fff; font-weight: 700; font-size: 13px; color: var(--c); }
.ring.none span { color: #9aa0ab; font-weight: 600; }
.title { margin: 0; font-weight: 650; font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.co { margin: 2px 0 0; color: #5b6170; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.chip { padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #eef1f6; color: #4a5060; }
.chip.good { background: #e6f4ea; color: #1e7a3c; }
.chip.accent { background: #fff0eb; color: #c4532f; }
.big { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; min-height: 50px; border: 0; border-radius: 12px;
  background: linear-gradient(135deg, #ff8a5c, #ff5f6d); color: #fff; font-weight: 750; font-size: 15px; letter-spacing: .01em;
  box-shadow: 0 8px 22px rgba(255,95,109,.35); transition: transform .12s ease, box-shadow .12s ease; }
.big:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(255,95,109,.42); }
.big:active { transform: translateY(0); }
.big[disabled] { opacity: .65; cursor: progress; transform: none; }
.big svg { width: 20px; height: 20px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sec { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; border: 1px solid #dfe2e8; border-radius: 10px; background: #fff;
  color: #1d1f24; font-weight: 600; font-size: 12.5px; }
.sec:hover { border-color: #ff7a59; color: #c4532f; }
.sec svg { width: 15px; height: 15px; }
.note { margin: 0; color: #6b7180; font-size: 11.5px; }
.link { border: 0; background: none; padding: 0; color: #c4532f; font-weight: 600; font-size: 12px; justify-self: start; }
.link:hover { text-decoration: underline; }
.skel { height: 12px; border-radius: 6px; background: linear-gradient(90deg, #eef0f3, #f7f8fa, #eef0f3); background-size: 200% 100%; animation: shine 1.2s infinite linear; }
@keyframes shine { to { background-position: -200% 0; } }
.tab { position: fixed; right: 0; top: 40%; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 9px 7px 9px 9px; border: 0; border-radius: 12px 0 0 12px; background: #1d1f24; color: #fff;
  box-shadow: 0 8px 24px rgba(17,19,24,.28); animation: peek .25s ease both; }
.tab:hover { padding-right: 11px; }
.tab .logo { width: 24px; height: 24px; }
.tab b { font-size: 11px; color: #ffb29c; }
@keyframes peek { from { transform: translateX(100%); } }
.toast { position: fixed; right: 16px; bottom: 18px; z-index: 2147483647; width: 330px; max-width: calc(100vw - 32px); display: flex; gap: 11px;
  padding: 13px 14px; border-radius: 14px; background: #1d1f24; color: #fff; box-shadow: 0 18px 44px rgba(17,19,24,.35);
  animation: rise .35s cubic-bezier(.22,1,.36,1) both; }
@keyframes rise { from { transform: translateY(16px); opacity: 0; } }
.toast .emoji { font-size: 22px; line-height: 1; }
.toast h3 { margin: 0; font-size: 14px; font-weight: 700; }
.toast p { margin: 3px 0 0; color: #c9ccd3; font-size: 12px; }
.toast .acts { display: flex; gap: 12px; margin-top: 8px; }
.toast .link { color: #ffb29c; }
.toast .x { align-self: flex-start; margin-left: auto; border: 0; background: none; color: #9aa0ab; font-size: 16px; line-height: 1; }
@media (prefers-color-scheme: dark) {
  .card { background: #17191e; color: #eceef2; box-shadow: 0 18px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08); }
  .head { background: #0f1114; }
  .ring { background: conic-gradient(var(--c) calc(var(--p) * 1%), #2a2e36 0); }
  .ring span { background: #17191e; }
  .co, .note { color: #a3a8b3; }
  .chip { background: #262a32; color: #c9ccd3; }
  .chip.good { background: #173523; color: #7fd49b; }
  .chip.accent { background: #3a231b; color: #ffb29c; }
  .sec { background: #17191e; border-color: #2f343d; color: #eceef2; }
  .sec:hover { color: #ffb29c; }
  .link { color: #ffb29c; }
  .skel { background: linear-gradient(90deg, #22262d, #2b3038, #22262d); background-size: 200% 100%; }
}
@media (prefers-reduced-motion: reduce) { .card, .tab, .toast, .skel { animation: none; } .big { transition: none; } }`;

// Small inline icons (lucide shapes), so the dock needs no files from the page.
const ICONS: Record<string, string> = {
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  letter: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  resume: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/>',
  save: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
};

function icon(doc: Document, name: string): SVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  // Fixed markup from ICONS above, never page or user text.
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

type Child = Node | string | null | false | undefined;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

export interface DockState {
  kind: DockKind;
  /** What the page shows, until Wera knows the job. */
  title: string;
  company: string;
  /** null while asking Wera. */
  hello: DockHello | null;
  /** The page has schema.org job data, so "Save to Wera" works without the AI. */
  canSave: boolean;
  open: boolean;
  busy: boolean;
  error: string;
}

export interface DockActions {
  /** Opens the side panel at a view (and fills a form). */
  open: (view: PanelView, fill?: boolean) => void;
  save: () => void;
  minimize: () => void;
  expand: () => void;
  hide: () => void;
}

const STATUS: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', not_interested: 'Not interested',
};

function scoreColor(score: number): string {
  return score >= 80 ? '#1e7a3c' : score >= 65 ? '#3157c4' : '#8a8f9a';
}

function ring(doc: Document, job: DockJob | null): HTMLElement {
  const score = job?.score ?? null;
  const r = el(doc, 'div', { class: score == null ? 'ring none' : 'ring', title: score == null ? 'Not scored yet' : job?.estimate ? 'Estimated fit; the AI score is on its way' : 'Your fit score' },
    el(doc, 'span', {}, score == null ? 'W' : `${job?.estimate ? '~' : ''}${score}`));
  r.style.setProperty('--p', String(score ?? 0));
  r.style.setProperty('--c', score == null ? '#9aa0ab' : scoreColor(score));
  return r;
}

/** Builds the dock's card (or its edge tab when minimized) for the state. */
export function renderDock(doc: Document, s: DockState, act: DockActions): HTMLElement {
  if (!s.open) {
    const score = s.hello?.job?.score;
    const tab = el(doc, 'button', { class: 'tab', type: 'button', 'aria-label': 'Show the Wera panel', title: 'Wera' },
      el(doc, 'span', { class: 'logo' }, 'W'), score != null ? el(doc, 'b', {}, String(score)) : null);
    tab.addEventListener('click', act.expand);
    return tab;
  }
  const job = s.hello?.job ?? null;
  const signedIn = s.hello?.signedIn ?? true;
  const min = el(doc, 'button', { class: 'icon', type: 'button', title: 'Minimize', 'aria-label': 'Minimize Wera' }, '–');
  min.addEventListener('click', act.minimize);
  const close = el(doc, 'button', { class: 'icon', type: 'button', title: 'Hide on this site for a week', 'aria-label': 'Hide Wera on this site' }, '×');
  close.addEventListener('click', act.hide);
  const head = el(doc, 'div', { class: 'head' },
    el(doc, 'span', { class: 'logo' }, 'W'), el(doc, 'span', { class: 'brand' }, 'Wera'),
    el(doc, 'span', { class: 'kind' }, s.kind === 'form' ? 'Application' : 'Job posting'), min, close);

  const chips = el(doc, 'div', { class: 'chips' });
  if (job?.status) chips.append(el(doc, 'span', { class: job.status === 'applied' ? 'chip good' : 'chip' }, STATUS[job.status] ?? job.status));
  else if (job) chips.append(el(doc, 'span', { class: 'chip good' }, 'In your Wera lists'));
  if (job?.autofilled) chips.append(el(doc, 'span', { class: 'chip accent' }, 'Autofilled'));
  const loading = s.hello == null;
  const info = el(doc, 'div', { style: 'min-width:0;flex:1' },
    el(doc, 'p', { class: 'title' }, job?.title || s.title || 'This job'),
    el(doc, 'p', { class: 'co' }, job?.company || s.company || ''),
    loading ? el(doc, 'div', { class: 'skel', style: 'margin-top:8px;width:60%' }) : chips.childElementCount ? chips : null);

  const btn = (cls: string, iconName: string, label: string, onClick: () => void, title = '') => {
    const b = el(doc, 'button', { class: cls, type: 'button', ...(title ? { title } : {}) }, icon(doc, iconName), label);
    b.addEventListener('click', onClick);
    return b;
  };
  let big: HTMLButtonElement;
  let note: string;
  if (!signedIn) {
    big = btn('big', 'panel', 'Sign in to Wera', () => act.open('job'));
    note = 'Connect your Wera account to save jobs, see your fit and autofill applications.';
  } else if (s.kind === 'form') {
    big = btn('big', 'zap', 'Autofill application', () => act.open('apply', true), 'Alt+Shift+F');
    note = job ? 'Wera fills what it knows and lists the rest for you. You review and submit.' : 'Wera fills it, and adds this job to your Wera lists as it does.';
  } else if (job) {
    big = btn('big', 'panel', 'Open in Wera', () => act.open('job'));
    note = "Press the site's Apply button: Wera autofills the form there.";
  } else {
    big = btn('big', 'save', s.busy ? 'Saving…' : 'Save to Wera', s.canSave ? act.save : () => act.open('job'));
    big.disabled = s.busy;
    note = s.canSave ? 'Saves it to your Jobs and Tracker with a fit score.' : 'Wera reads the posting with AI, you check it, then it saves.';
  }
  const row = el(doc, 'div', { class: 'row' },
    btn('sec', 'letter', 'Cover letter', () => act.open('letter')),
    btn('sec', 'resume', 'Tailor resume', () => act.open('resume')));
  const more = el(doc, 'button', { class: 'link', type: 'button' }, 'Open the Wera side panel');
  more.addEventListener('click', () => act.open(s.kind === 'form' ? 'apply' : 'job'));

  const body = el(doc, 'div', { class: 'body' },
    el(doc, 'div', { class: 'job' }, ring(doc, job), info),
    big, signedIn ? row : null,
    el(doc, 'p', { class: 'note' }, s.error || note),
    signedIn ? more : null);
  return el(doc, 'section', { class: 'card', role: 'dialog', 'aria-label': 'Wera' }, head, body);
}

export interface ToastSpec {
  emoji: string;
  title: string;
  text: string;
  actions: { label: string; run: () => void }[];
}

/** The "marked as applied" message (and its undo). */
export function renderToast(doc: Document, t: ToastSpec, onClose: () => void): HTMLElement {
  const x = el(doc, 'button', { class: 'x', type: 'button', 'aria-label': 'Close' }, '×');
  x.addEventListener('click', onClose);
  const acts = el(doc, 'div', { class: 'acts' });
  for (const a of t.actions) {
    const b = el(doc, 'button', { class: 'link', type: 'button' }, a.label);
    b.addEventListener('click', () => {
      a.run();
      onClose();
    });
    acts.append(b);
  }
  return el(doc, 'div', { class: 'toast', role: 'status', 'aria-live': 'polite' },
    el(doc, 'span', { class: 'emoji', 'aria-hidden': 'true' }, t.emoji),
    el(doc, 'div', {}, el(doc, 'h3', {}, t.title), el(doc, 'p', {}, t.text), t.actions.length ? acts : null), x);
}

/** The dock's host element and shadow root, with its styles. */
export function mountRoot(doc: Document): { host: HTMLElement; root: ShadowRoot; box: HTMLElement } {
  const host = doc.createElement('wera-launcher');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const box = el(doc, 'div', { class: 'root' });
  root.append(style, box);
  doc.documentElement.append(host);
  return { host, root, box };
}
