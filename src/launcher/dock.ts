// The Wera dock's look: a card at the right of a job page (or a small tab
// on the edge once minimized), and a toast for "marked as applied". It is
// drawn in Wera's own design, the dashboard's tokens, logo, type, badges,
// buttons and toast, in the theme the user picked there, inside a closed
// shadow root so the page's styles cannot touch it and it cannot touch
// the page.
import type { DockHello, DockJob, DockKind, PanelView } from '../shared/dock';
import type { Theme } from '../shared/theme';

// The dashboard's design tokens (wera-frontend src/index.css), dark and light.
const TOKENS = `
.root { --bg: #0A0B0F; --surface: #12141A; --surface-2: #1A1D25; --border: #262A35; --text: #E8EAF0; --muted: #8A90A2; --faint: #5B6173;
  --accent: #FF7A59; --accent-2: #7C9CFF; --good: #3DDC97; --warn: #F5C451; --bad: #FF5C7A;
  --shadow: 0 18px 48px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.02); color-scheme: dark; }
.root[data-theme="light"] { --bg: #F7F6F2; --surface: #FFFFFF; --surface-2: #F1F0EB; --border: #E5E3DC; --text: #1D1F24; --muted: #5F6470; --faint: #8E929C;
  --accent: #D9653F; --accent-2: #4A63C8; --good: #1E8A5F; --warn: #9C6B14; --bad: #C2445A;
  --shadow: 0 2px 4px rgb(29 31 36 / 0.05), 0 16px 36px -10px rgb(29 31 36 / 0.22); color-scheme: light; }`;

const STYLE = `
:host { all: initial; }
${TOKENS}
* { box-sizing: border-box; }
.root { font: 400 13px/1.45 "Wera Geist", "Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text);
  -webkit-font-smoothing: antialiased; }
.mono { font-family: "Wera Geist Mono", "Geist Mono Variable", ui-monospace, "SF Mono", monospace; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
svg.i { width: 16px; height: 16px; flex: none; }
.card { position: fixed; top: 80px; right: 16px; z-index: 2147483646; width: 320px; max-width: calc(100vw - 32px);
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden;
  animation: slide 260ms cubic-bezier(.22,1,.36,1) both; }
@keyframes slide { from { transform: translateX(calc(100% + 24px)); opacity: 0; } }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--border); }
.word { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: var(--text); }
.icon { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 8px; background: transparent; color: var(--faint); }
.icon:hover { color: var(--text); background: var(--surface-2); }
.icon:first-of-type { margin-left: auto; }
.body { padding: 14px; display: grid; gap: 12px; }
.job { display: flex; gap: 12px; align-items: flex-start; }
.title { margin: 0; font-weight: 600; font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.co { margin: 2px 0 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; border: 1px solid; font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; }
.badge svg.i { width: 12px; height: 12px; }
.b-neutral { border-color: var(--border); background: var(--surface-2); color: var(--muted); }
.b-accent { border-color: color-mix(in oklab, var(--accent) 30%, transparent); background: color-mix(in oklab, var(--accent) 10%, transparent); color: var(--accent); }
.b-accent-2 { border-color: color-mix(in oklab, var(--accent-2) 25%, transparent); background: color-mix(in oklab, var(--accent-2) 10%, transparent); color: var(--accent-2); }
.b-good { border-color: color-mix(in oklab, var(--good) 25%, transparent); background: color-mix(in oklab, var(--good) 10%, transparent); color: var(--good); }
.b-warn { border-color: color-mix(in oklab, var(--warn) 25%, transparent); background: color-mix(in oklab, var(--warn) 10%, transparent); color: var(--warn); }
.b-bad { border-color: color-mix(in oklab, var(--bad) 25%, transparent); background: color-mix(in oklab, var(--bad) 10%, transparent); color: var(--bad); }
.big { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 42px; padding: 0 16px; border: 0; border-radius: 8px;
  background: var(--accent); color: var(--bg); font-weight: 600; font-size: 14px; transition: background-color 150ms; }
.big:hover { background: color-mix(in oklab, var(--accent) 85%, transparent); }
.big[disabled] { opacity: .6; cursor: progress; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sec { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface-2); color: var(--text); font-weight: 600; font-size: 12px; transition: border-color 150ms; }
.sec:hover { border-color: color-mix(in oklab, var(--accent) 40%, transparent); }
.sec svg.i { width: 14px; height: 14px; }
.note { margin: 0; color: var(--muted); font-size: 12px; }
.link { border: 0; background: none; padding: 0; color: var(--accent); font-weight: 500; font-size: 12px; justify-self: start; }
.link:hover { text-decoration: underline; }
.skel { height: 12px; border-radius: 6px; background: var(--surface-2); }
.tab { position: fixed; right: 0; top: 40%; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 8px 10px 10px; border: 1px solid var(--border); border-right: 0; border-radius: 14px 0 0 14px; background: var(--surface); box-shadow: var(--shadow);
  animation: peek 200ms ease both; }
.tab:hover { padding-right: 12px; }
.tab b { font-size: 11px; font-weight: 600; }
@keyframes peek { from { transform: translateX(100%); } }
.toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(380px, calc(100vw - 32px)); display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 16px; border-radius: 14px; border: 1px solid color-mix(in oklab, var(--good) 30%, transparent); background: var(--surface); box-shadow: var(--shadow);
  font-size: 14px; animation: rise 220ms cubic-bezier(.22,1,.36,1) both; }
.toast.info { border-color: var(--border); }
.toast > svg.i { margin-top: 2px; color: var(--good); }
.toast.info > svg.i { color: var(--accent); }
@keyframes rise { from { transform: translateY(8px); opacity: 0; } }
.toast h3 { margin: 0; font-size: 14px; font-weight: 600; }
.toast p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
.toast .acts { display: flex; gap: 14px; margin-top: 8px; }
.toast .x { margin-left: auto; padding: 0; border: 0; background: none; color: var(--faint); }
.toast .x:hover { color: var(--text); }
@media (prefers-reduced-motion: reduce) { .card, .tab, .toast { animation: none; } }`;

// Lucide icons, the set the dashboard and side panel use (fixed markup, never page text).
const ICONS: Record<string, string> = {
  zap: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  letter: '<path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  resume: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  save: '<path d="M12 7v6"/><path d="M15 10H9"/><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  minus: '<path d="M5 12h14"/>',
};

const SVG = 'http://www.w3.org/2000/svg';

function icon(doc: Document, name: string): SVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'i' })) svg.setAttribute(k, v);
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

let marks = 0;

/** The Wera briefcase, drawn as the dashboard draws it (wera-frontend src/components/Logo.tsx). */
export function logoMark(doc: Document, size = 22): SVGElement {
  const id = `wera-mark-${++marks}`;
  const svg = doc.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  // Fixed markup: the dashboard's mark, with an id of our own for its gradient.
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="3" y1="6" x2="21" y2="21" gradientUnits="userSpaceOnUse">`
    + '<stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="color-mix(in oklab, var(--accent) 70%, #ff3d6e)"/></linearGradient></defs>'
    + '<path d="M8.75 7V5.25A2.25 2.25 0 0 1 11 3h2a2.25 2.25 0 0 1 2.25 2.25V7" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>'
    + `<rect x="2" y="6.5" width="20" height="14.5" rx="4" fill="url(#${id})"/>`
    + '<path d="M2 12.75h20" stroke="var(--bg)" stroke-opacity="0.35" stroke-width="1.25"/>'
    + '<rect x="10" y="11" width="4" height="3.5" rx="1.25" fill="var(--bg)"/>';
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
}

// The dashboard's tracker statuses and their badge colors (src/components/JobBadges.tsx).
const STATUS: Record<string, [string, string]> = {
  saved: ['Saved', 'b-accent'], applied: ['Applied', 'b-accent-2'], interviewing: ['Interviewing', 'b-warn'], offer: ['Offer', 'b-good'],
  rejected: ['Rejected', 'b-bad'], not_interested: ['Not interested', 'b-neutral'],
};

/** The fit ring as the dashboard draws it (src/components/ScoreRing.tsx): verdict colors, dashed while estimated. */
function ring(doc: Document, job: DockJob | null): SVGElement | HTMLElement {
  const box = 44;
  const stroke = 4;
  const r = (box - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const score = job?.score ?? null;
  const wrap = el(doc, 'div', { style: `position:relative;flex:none;width:${box}px;height:${box}px`, title: score == null ? 'Not scored yet' : job?.estimate ? 'Estimated from your profile; the AI score is on its way' : 'Your fit score' });
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('width', String(box));
  svg.setAttribute('height', String(box));
  svg.setAttribute('style', 'transform:rotate(-90deg)');
  const circle = (strokeColor: string, extra: Record<string, string> = {}) => {
    const ci = doc.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: String(box / 2), cy: String(box / 2), r: String(r), fill: 'none', stroke: strokeColor, 'stroke-width': String(stroke), ...extra })) ci.setAttribute(k, v);
    return ci;
  };
  svg.append(circle('var(--surface-2)'));
  let color = 'var(--faint)';
  if (score != null && job?.estimate) {
    svg.append(circle('var(--faint)', { 'stroke-dasharray': '3 4' }));
    color = 'var(--muted)';
  } else if (score != null) {
    color = score >= 80 ? 'var(--accent)' : score >= 65 ? 'var(--accent-2)' : score >= 45 ? 'var(--muted)' : 'var(--faint)';
    svg.append(circle(color, { 'stroke-linecap': 'round', 'stroke-dasharray': String(c), 'stroke-dashoffset': String(c * (1 - Math.min(Math.max(score, 0), 100) / 100)) }));
  }
  const num = el(doc, 'span', { class: 'mono', style: `position:absolute;inset:0;display:grid;place-items:center;font-weight:600;font-size:13px;color:${color}` }, score == null ? '—' : String(score));
  wrap.append(svg, num);
  return wrap;
}

/** Builds the dock's card (or its edge tab when minimized) for the state. */
export function renderDock(doc: Document, s: DockState, act: DockActions): HTMLElement {
  if (!s.open) {
    const score = s.hello?.job?.score;
    const tab = el(doc, 'button', { class: 'tab', type: 'button', 'aria-label': 'Show the Wera panel', title: 'Wera' },
      logoMark(doc, 22), score != null ? el(doc, 'b', { class: 'mono' }, String(score)) : null);
    tab.addEventListener('click', act.expand);
    return tab;
  }
  const job = s.hello?.job ?? null;
  const signedIn = s.hello?.signedIn ?? true;
  const iconButton = (name: string, label: string, title: string, onClick: () => void) => {
    const b = el(doc, 'button', { class: 'icon', type: 'button', title, 'aria-label': label }, icon(doc, name));
    b.addEventListener('click', onClick);
    return b;
  };
  const head = el(doc, 'div', { class: 'head' },
    logoMark(doc, 20), el(doc, 'span', { class: 'word mono' }, 'wera'),
    el(doc, 'span', { class: 'badge b-neutral' }, s.kind === 'form' ? 'Application' : 'Job posting'),
    iconButton('minus', 'Minimize Wera', 'Minimize', act.minimize));

  const chips = el(doc, 'div', { class: 'chips' });
  if (job?.status) {
    const [label, cls] = STATUS[job.status] ?? [job.status, 'b-neutral'];
    chips.append(el(doc, 'span', { class: `badge ${cls}` }, label));
  } else if (job) {
    chips.append(el(doc, 'span', { class: 'badge b-good' }, 'In your Wera lists'));
  }
  if (job?.autofilled) chips.append(el(doc, 'span', { class: 'badge b-accent-2' }, icon(doc, 'wand'), 'Autofilled'));
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
  /** success: something was done (green, as the dashboard's toasts); info: something to decide. */
  tone: 'success' | 'info';
  title: string;
  text: string;
  actions: { label: string; run: () => void }[];
}

/** The "marked as applied" message (and its undo), as the dashboard's toast. */
export function renderToast(doc: Document, t: ToastSpec, onClose: () => void): HTMLElement {
  const x = el(doc, 'button', { class: 'x', type: 'button', 'aria-label': 'Close' }, icon(doc, 'x'));
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
  return el(doc, 'div', { class: t.tone === 'success' ? 'toast' : 'toast info', role: 'status', 'aria-live': 'polite' },
    icon(doc, t.tone === 'success' ? 'check' : 'save'),
    el(doc, 'div', { style: 'min-width:0' }, el(doc, 'h3', {}, t.title), el(doc, 'p', {}, t.text), t.actions.length ? acts : null), x);
}

/** Geist, Wera's typeface, from the extension (page styles cannot reach into the dock, and the dock must not restyle the page). */
function loadFonts(doc: Document) {
  if (typeof FontFace === 'undefined' || !chrome.runtime?.getURL || !doc.fonts) return;
  for (const [family, file] of [['Wera Geist', 'fonts/geist.woff2'], ['Wera Geist Mono', 'fonts/geist-mono.woff2']] as const) {
    if ([...doc.fonts].some((f) => f.family.replace(/"/g, '') === family)) continue;
    const face = new FontFace(family, `url(${chrome.runtime.getURL(file)})`, { weight: '100 900' });
    doc.fonts.add(face);
    // A page whose policy refuses extension fonts keeps the system face.
    face.load().catch(() => {});
  }
}

/** The dock's host element and shadow root, with its styles, in the given theme. */
export function mountRoot(doc: Document, theme: Theme = 'dark'): { host: HTMLElement; root: ShadowRoot; box: HTMLElement } {
  loadFonts(doc);
  const host = doc.createElement('wera-launcher');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const box = el(doc, 'div', { class: 'root', 'data-theme': theme });
  root.append(style, box);
  doc.documentElement.append(host);
  return { host, root, box };
}
