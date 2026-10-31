import { boxConcealed, inlineConcealed, textConcealed } from './hidden';

/** Turns an HTML fragment into readable text with paragraph breaks. */
export function htmlToText(html: string): string {
  if (!html) return '';
  // A detached document: nothing in it runs or loads.
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return blockText(doc.body);
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'BR', 'TR', 'TABLE']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'NAV', 'FOOTER', 'HEADER', 'FORM', 'BUTTON', 'SELECT']);

/**
 * Text of an element with block-level line breaks: what a person can read
 * of it. Hidden parts are skipped (their text goes to hidden, for finding
 * out what they say to AI tools).
 */
export function blockText(root: Element, hidden?: string[]): string {
  const view = root.ownerDocument.defaultView;
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      // Read at the text itself: a parent's "font-size: 0" is a layout trick its children undo.
      const p = n.parentElement;
      if (p && view && textConcealed(p, view.getComputedStyle(p))) hidden?.push(n.textContent ?? '');
      else out.push(n.textContent ?? '');
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (SKIP.has(el.tagName)) return;
    if (el.getAttribute('aria-hidden') === 'true' || (el as HTMLElement).hidden || (view ? boxConcealed(view.getComputedStyle(el)) : inlineConcealed(el))) {
      if (hidden && el.textContent) hidden.push(el.textContent);
      return;
    }
    if (el.tagName === 'LI') {
      // One line per item: a break before each, none after.
      out.push('\n- ');
      for (const c of el.childNodes) walk(c);
      return;
    }
    const block = BLOCK.has(el.tagName);
    if (block) out.push('\n');
    for (const c of el.childNodes) walk(c);
    if (block) out.push('\n');
  };
  walk(root);
  return out
    .join('')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The page's main text: the <main>/<article> region when there is one,
 * else the body without navigation, headers, footers and forms.
 */
export function mainText(doc: Document, max = 24000, hidden?: string[]): string {
  const root =
    doc.querySelector('main, [role="main"], article, #content, .content') ?? doc.body ?? doc.documentElement;
  let text = blockText(root, hidden);
  if (text.length < 400 && root !== doc.body && doc.body) text = blockText(doc.body, hidden);
  return text.slice(0, max);
}
