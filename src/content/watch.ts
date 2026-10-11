// Notices what a person would: a new step of a multi-page application
// (Workday, iCIMS...) appearing without a page load, and the "thank you
// for applying" message after submitting. It tells the side panel; it
// sends no page content.
import type { ContentEvent } from '../shared/types';
import { classify } from './classify';
import { collectFields } from './fields';

const SUBMITTED = [
  /thank(s| you) for (applying|your application|submitting)/i,
  /application (has been |was )?(successfully )?(submitted|received|sent)/i,
  /we('ve| have) received your application/i,
  /your application is (complete|in)/i,
  /successfully applied/i,
];

/** The page's visible text (textContent where innerText is missing). */
export function bodyText(doc: Document): string {
  return doc.body?.innerText || doc.body?.textContent || '';
}

/** Whether the page text says the application went through. */
export function looksSubmitted(text: string): boolean {
  return SUBMITTED.some((re) => re.test(text.slice(0, 20000)));
}

/** The fillable fields now on the page, as a signature that changes when a new step appears. */
export function formSignature(doc: Document): { count: number; key: string } {
  const fields = collectFields(doc).filter((f) => classify(f) !== null);
  return { count: fields.length, key: fields.map((f) => f.label).join('|') };
}

/** Watches the page; calls notify at most every `delay` ms when something changed. */
export function watchPage(doc: Document, notify: (e: ContentEvent) => void, delay = 700): () => void {
  let last = formSignature(doc).key;
  let submitted = looksSubmitted(bodyText(doc));
  let timer = 0;
  const check = () => {
    timer = 0;
    const sig = formSignature(doc);
    if (sig.key !== last) {
      last = sig.key;
      if (sig.count > 0) notify({ type: 'wera:form-changed', fields: sig.count });
    }
    if (!submitted && looksSubmitted(bodyText(doc))) {
      submitted = true;
      notify({ type: 'wera:submitted' });
    }
  };
  const obs = new MutationObserver(() => {
    if (!timer) timer = window.setTimeout(check, delay);
  });
  obs.observe(doc.body, { childList: true, subtree: true });
  return () => {
    obs.disconnect();
    window.clearTimeout(timer);
  };
}
