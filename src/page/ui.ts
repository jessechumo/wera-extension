// What Wera draws inside job pages is drawn in Wera's own design (the
// dashboard's tokens, logo, type and icons), in the theme the user picked
// there, inside a closed shadow root: the page's styles cannot touch it,
// and it cannot touch the page.

// The dashboard's design tokens (wera-frontend src/index.css), dark and light.
export const TOKENS = `
.root { --bg: #0A0B0F; --surface: #12141A; --surface-2: #1A1D25; --border: #262A35; --text: #E8EAF0; --muted: #8A90A2; --faint: #5B6173;
  --accent: #FF7A59; --accent-2: #7C9CFF; --good: #3DDC97; --warn: #F5C451; --bad: #FF5C7A;
  --shadow: 0 18px 48px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.02); color-scheme: dark; }
.root[data-theme="light"] { --bg: #F7F6F2; --surface: #FFFFFF; --surface-2: #F1F0EB; --border: #E5E3DC; --text: #1D1F24; --muted: #5F6470; --faint: #8E929C;
  --accent: #D9653F; --accent-2: #4A63C8; --good: #1E8A5F; --warn: #9C6B14; --bad: #C2445A;
  --shadow: 0 2px 4px rgb(29 31 36 / 0.05), 0 16px 36px -10px rgb(29 31 36 / 0.22); color-scheme: light; }`;

export const BASE = `
:host { all: initial; }
${TOKENS}
* { box-sizing: border-box; }
.root { font: 400 13px/1.45 "Wera Geist", "Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text);
  -webkit-font-smoothing: antialiased; }
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
svg.i { width: 16px; height: 16px; flex: none; }`;

// Lucide icons, the set the dashboard uses (fixed markup, never page text).
const ICONS: Record<string, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  shorter: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
  longer: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
};

const SVG = 'http://www.w3.org/2000/svg';

export function icon(doc: Document, name: string, cls = 'i'): SVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: cls })) svg.setAttribute(k, v);
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

export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

/** Geist, Wera's typeface, from the extension (page styles cannot reach into Wera's shadow roots). */
export function loadFonts(doc: Document) {
  if (typeof FontFace === 'undefined' || !chrome.runtime?.getURL || !doc.fonts) return;
  for (const [family, file] of [['Wera Geist', 'fonts/geist.woff2'], ['Wera Geist Mono', 'fonts/geist-mono.woff2']] as const) {
    if ([...doc.fonts].some((f) => f.family.replace(/"/g, '') === family)) continue;
    const face = new FontFace(family, `url(${chrome.runtime.getURL(file)})`, { weight: '100 900' });
    doc.fonts.add(face);
    // A page whose policy refuses extension fonts keeps the system face.
    face.load().catch(() => {});
  }
}

/**
 * A host element with a closed shadow root and Wera's styles, kept on the
 * page: some sites (Greenhouse job boards) rebuild the whole document once
 * loaded, which removes anything added to it, so it is put back.
 */
export function mountShadow(doc: Document, tag: string, css: string): { host: HTMLElement; root: ShadowRoot; box: HTMLElement; stop: () => void } {
  loadFonts(doc);
  const host = doc.createElement(tag);
  const root = host.attachShadow({ mode: __WERA_E2E__ ? 'open' : 'closed' });
  const style = doc.createElement('style');
  style.textContent = css;
  const box = el(doc, 'div', { class: 'root' });
  root.append(style, box);
  doc.documentElement.append(host);
  const keep = new MutationObserver(() => {
    if (!host.isConnected && doc.documentElement) doc.documentElement.append(host);
  });
  keep.observe(doc, { childList: true, subtree: true });
  return { host, root, box, stop: () => keep.disconnect() };
}
