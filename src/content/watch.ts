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

// Where ATSs send the browser once an application went through.
const SUBMITTED_PATH = /\/(thank[-_]?you|thanks|confirmation|application[-_]?(submitted|received|complete)|submitted|success)(\/|$|\?|#)/i;

/** Whether the address is a "thank you for applying" page. */
export function submittedAddress(url: string): boolean {
  try {
    const u = new URL(url);
    return SUBMITTED_PATH.test(u.pathname + (u.pathname.endsWith('/') ? '' : '/'));
  } catch {
    return false;
  }
}

/** The page's visible text (textContent where innerText is missing). */
export function bodyText(doc: Document): string {
  return doc.body?.innerText || doc.body?.textContent || '';
}

/** Whether the page text says the application went through. */
export function looksSubmitted(text: string): boolean {
  return SUBMITTED.some((re) => re.test(text.slice(0, 20000)));
}

/** The fillable fields now on the page, as a signature that changes when a new step appears. */
export function formSignature(doc: Document): { count: number; key: string; labels: string[] } {
  const labels = collectFields(doc).filter((f) => classify(f) !== null).map((f) => f.label);
  return { count: labels.length, key: labels.join('|'), labels };
}

/** Whether a form is another step, not the same one with a few more fields (a choice revealed them). */
export function isNewStep(before: string[], now: string[]): boolean {
  const known = new Set(before);
  return now.filter((l) => known.has(l)).length < now.length / 2;
}

/** Watches the page; calls notify at most every `delay` ms when something changed. */
export function watchPage(doc: Document, notify: (e: ContentEvent) => void, delay = 700): () => void {
  let last = formSignature(doc);
  let submitted = looksSubmitted(bodyText(doc));
  let href = doc.location.href;
  let timer = 0;
  const check = () => {
    timer = 0;
    // A single-page site moved to another page (another job, the apply step) without loading.
    if (doc.location.href !== href) {
      href = doc.location.href;
      last = formSignature(doc);
      submitted = looksSubmitted(bodyText(doc));
      notify({ type: 'wera:navigated', url: href });
      return;
    }
    const sig = formSignature(doc);
    if (sig.key !== last.key) {
      const step = isNewStep(last.labels, sig.labels);
      last = sig;
      if (sig.count > 0) notify({ type: 'wera:form-changed', fields: sig.count, step });
    }
    if (!submitted && looksSubmitted(bodyText(doc))) {
      submitted = true;
      notify({ type: 'wera:submitted' });
    }
  };
  const schedule = () => {
    if (!timer) timer = window.setTimeout(check, delay);
  };
  const obs = new MutationObserver(schedule);
  obs.observe(doc.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  return () => {
    obs.disconnect();
    window.removeEventListener('popstate', schedule);
    window.clearTimeout(timer);
  };
}
