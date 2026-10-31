// What a person cannot see on a page. Instructions for AI tools hide in
// labels and postings (tiny, transparent, white on white, pushed off the
// page), and decoy fields sit where only a program would fill them. What
// is hidden from the applicant does not exist for Wera: it is not read,
// sent to the AI or filled. Styles come from the page's own computed
// styles; in a document with no layout (a posting's HTML from job data)
// only what an element's style attribute says is known.

const MIN_FONT = 3; // px: nobody reads smaller
const FAR = 500; // px beyond the page's edge

type Rgba = [number, number, number, number];

/** A computed color as numbers; null for what cannot be compared (a gradient, "color(...)"). */
function rgba(color: string): Rgba | null {
  if (color === 'transparent') return [0, 0, 0, 0];
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(color.trim());
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

/** The color behind an element: the nearest one drawn, else the page's white; null when an image may be behind it. */
function backdrop(el: Element): Rgba | null {
  const view = el.ownerDocument.defaultView;
  for (let n: Element | null = el, i = 0; n && i < 24; n = n.parentElement, i++) {
    const s = view?.getComputedStyle(n);
    if (!s) return null;
    if (s.backgroundImage && s.backgroundImage !== 'none') return null;
    const bg = rgba(s.backgroundColor);
    if (!bg) return null;
    if (bg[3] > 0.9) return bg;
    if (bg[3] > 0.05) return null;
  }
  return [255, 255, 255, 1];
}

const px = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Whether an element's own box is out of sight: not drawn, faded out, clipped away, squeezed flat or pushed off the page. */
export function boxConcealed(s: CSSStyleDeclaration): boolean {
  if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return true;
  if (s.opacity !== '' && parseFloat(s.opacity) < 0.05) return true;
  if (/^rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)$/.test(s.clip) || /^rect\(\s*1px[\s,]+1px[\s,]+1px[\s,]+1px\s*\)$/.test(s.clip)) return true;
  if (/^inset\(\s*(50|100)%/.test(s.clipPath) || /^circle\(\s*0(px|%)?/.test(s.clipPath)) return true;
  if (px(s.textIndent) < -FAR) return true;
  const hides = s.overflow === 'hidden' || s.overflow === 'clip' || s.overflowX === 'hidden' || s.overflowY === 'hidden';
  if (hides && (px(s.width) <= 1 && s.width !== '' && s.width !== 'auto' || px(s.height) <= 1 && s.height !== '' && s.height !== 'auto' || (s.maxHeight !== '' && s.maxHeight !== 'none' && px(s.maxHeight) <= 1))) return true;
  if (s.position === 'absolute' || s.position === 'fixed') {
    if (px(s.left) < -FAR || px(s.top) < -FAR || px(s.right) < -FAR) return true;
  }
  const m = /^matrix\(([^)]+)\)$/.exec(s.transform);
  if (m) {
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = m[1]!.split(',').map(Number);
    if ((a === 0 && b === 0) || (c === 0 && d === 0) || e < -FAR || f < -FAR) return true;
  }
  return false;
}

/** Whether an element's text cannot be read though its box is there: too small, transparent, or the color of what is behind it. */
export function textConcealed(el: Element, s: CSSStyleDeclaration): boolean {
  if (s.fontSize !== '' && px(s.fontSize) < MIN_FONT) return true;
  const ink = rgba(s.color);
  if (!ink) return false;
  // Gradient headings paint their text from the background.
  const paintedByBackground = (s as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip === 'text' || s.backgroundClip === 'text';
  if (ink[3] < 0.1) return !paintedByBackground;
  const bg = backdrop(el);
  return !!bg && Math.abs(ink[0] - bg[0]) < 12 && Math.abs(ink[1] - bg[1]) < 12 && Math.abs(ink[2] - bg[2]) < 12;
}

// The same, for HTML with no layout: what its style attribute says.
const INLINE_HIDDEN = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\.0\d*)?\s*(?:;|$|!)|font-size\s*:\s*[0-2](?:\.\d+)?(?:px|pt|em|rem|%)?\s*(?:;|$|!)|(?:left|top|right|text-indent)\s*:\s*-\d{3,}(?:\.\d+)?px|color\s*:\s*(?:transparent|#fff(?:fff)?\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)))/i;

/** Whether an element's style attribute hides it (the only clue in a document with no layout). */
export const inlineConcealed = (el: Element) => INLINE_HIDDEN.test(el.getAttribute('style') ?? '');

/** Whether a person can't see el or any element around it. */
export function outOfSight(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return inlineConcealed(el);
  for (let n: Element | null = el; n && n !== el.ownerDocument.body; n = n.parentElement ?? (n.parentNode instanceof ShadowRoot ? n.parentNode.host : null)) {
    if ((n as HTMLElement).hidden || n.getAttribute('aria-hidden') === 'true' || boxConcealed(view.getComputedStyle(n))) return true;
  }
  return false;
}

/** Whether a layout engine placed this document (jsdom has none: every box is 0 by 0). */
const hasLayout = (doc: Document) => doc.documentElement.getBoundingClientRect().width > 0;

/** Whether a control's box lands where nobody can reach it: no size, off the page, or inside something squeezed flat. */
export function boxOutOfReach(el: Element): boolean {
  const doc = el.ownerDocument;
  if (!hasLayout(doc)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return true;
  const view = doc.defaultView;
  const x = r.right + (view?.scrollX ?? 0);
  const y = r.bottom + (view?.scrollY ?? 0);
  if (x < 0 || y < 0 || r.left + (view?.scrollX ?? 0) > doc.documentElement.scrollWidth + FAR) return true;
  for (let n = el.parentElement, i = 0; n && i < 8; n = n.parentElement, i++) {
    const box = n.getBoundingClientRect();
    const s = view?.getComputedStyle(n);
    if (s && (s.overflow === 'hidden' || s.overflow === 'clip') && (box.width < 2 || box.height < 2)) return true;
  }
  return false;
}
