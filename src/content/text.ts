/** Turns an HTML fragment into readable text with paragraph breaks. */
export function htmlToText(html: string): string {
  if (!html) return '';
  // A detached document: nothing in it runs or loads.
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return blockText(doc.body);
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'BR', 'TR', 'TABLE']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'NAV', 'FOOTER', 'HEADER', 'FORM', 'BUTTON', 'SELECT']);

/** Text of an element with block-level line breaks, hidden parts skipped. */
export function blockText(root: Element): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out.push(n.textContent ?? '');
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (SKIP.has(el.tagName) || el.getAttribute('aria-hidden') === 'true' || (el as HTMLElement).hidden) return;
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
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The page's main text: the <main>/<article> region when there is one,
 * else the body without navigation, headers, footers and forms.
 */
export function mainText(doc: Document, max = 24000): string {
  const root =
    doc.querySelector('main, [role="main"], article, #content, .content') ?? doc.body ?? doc.documentElement;
  let text = blockText(root);
  if (text.length < 400 && root !== doc.body && doc.body) text = blockText(doc.body);
  return text.slice(0, max);
}
