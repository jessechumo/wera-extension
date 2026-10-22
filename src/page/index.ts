// Runs in every frame of every page. It answers the Wera panel (read the
// page, fill the form) and puts the panel on job postings and application
// forms. When the site then says "thank you for applying", it tells the
// background, which marks the job applied. Nothing leaves the page unless
// Wera is on it.
import { jobSummary, pageKind, type PageKind } from '../content/detect';
import { readJobPosting } from '../content/jsonld';
import { ENTRY_PURPOSES } from '../content/entries';
import { listen } from '../content/listen';
import { snapshot } from '../content/plan';
import { bodyText, looksSubmitted } from '../content/watch';
import { extensionAlive, sendSafe } from '../shared/alive';
import type { DockRequest, SubmitReply } from '../shared/dock';
import { SETTINGS_KEY } from '../shared/settings';
import type { JobDraft } from '../shared/types';

export { pageKind } from '../content/detect';

/** What the panel (panel.js, in the same frame) reads from the page script. */
export interface PageHandle {
  kind: PageKind;
  title: string;
  company: string;
  draft: JobDraft | null;
  /** The site confirmed an application while the panel was not there yet. */
  submitted: SubmitReply | null;
  /** Called with the page's kind whenever it changes (a single-page job board moved on). */
  subscribe: (fn: (h: PageHandle) => void) => () => void;
}

declare global {
  interface Window {
    __weraPage?: PageHandle;
  }
}

const ask = <T>(msg: DockRequest) => sendSafe<T>(msg);

// The buttons that move an application on: what the user entered on the page is final then.
const MOVES_ON = /^(submit|submit application|send|send application|apply|apply now|next|continue|save and continue|save & continue|review|review application|finish)\b/i;
const NOT_DETAILS = new Set(['question', 'consent', 'resume', 'cover_letter', 'skills', 'full_name', 'location', 'authorized_no_sponsorship', 'phone_type', 'phone_code', 'start_date']);

/** The details a form holds now (name, contact, eligibility, self-identification): what Wera can learn from. */
export function formDetails(doc: Document): { purpose: NonNullable<ReturnType<typeof snapshot>[number]['purpose']>; value: string }[] {
  return snapshot(doc)
    .filter((f) => f.purpose && !NOT_DETAILS.has(f.purpose) && !ENTRY_PURPOSES.has(f.purpose) && f.kind !== 'checkbox')
    .map((f) => ({ purpose: f.purpose!, value: f.value }));
}

/** Whether the panel may show on this page: turned on, and not the user's own Wera. */
async function allowed(doc: Document): Promise<boolean> {
  const got = await chrome.storage.local.get([SETTINGS_KEY, 'wera.session']).catch((): Record<string, unknown> => ({}));
  if ((got[SETTINGS_KEY] as { launcher?: boolean } | undefined)?.launcher === false) return false;
  return (got['wera.session'] as { server?: string } | undefined)?.server !== doc.location.origin;
}

/**
 * Watches the page (single-page job boards change without loading): on a
 * job page it asks for the panel and keeps the panel's handle current;
 * it notices confirmations. Returns a stop.
 */
export function watchForJobs(doc: Document, delay = 1200): () => void {
  const top = doc.defaultView === doc.defaultView?.top;
  const subscribers = new Set<(h: PageHandle) => void>();
  const handle: PageHandle = {
    kind: null, title: '', company: '', draft: null, submitted: null,
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
  if (doc.defaultView) doc.defaultView.__weraPage = handle;
  let timer = 0;
  let first = true;
  let shownFor = '';
  let sawForm = false;
  let submittedFor = '';
  // Pages that are not job pages are read for a confirmation only for a while after they load.
  let looks = 0;
  let looksFor = '';
  let asked = false;

  const checkSubmitted = () => {
    const key = doc.location.href;
    if (submittedFor === key || !looksSubmitted(bodyText(doc))) return;
    submittedFor = key;
    void ask<SubmitReply>({ type: 'wera:dock-submitted', url: key }).then((r) => {
      if (!r || r.state === 'off') return;
      handle.submitted = r;
      subscribers.forEach((fn) => fn(handle));
      // The confirmation page is often not a job page: bring the panel to say what happened.
      void sendSafe({ type: 'wera:panel-ensure' });
    });
  };

  const check = async () => {
    timer = 0;
    if (doc.hidden) return;
    const kind = pageKind(doc);
    if (kind === 'form') sawForm = true;
    if (looksFor !== doc.location.href) {
      looksFor = doc.location.href;
      looks = 0;
    }
    if (top && (sawForm || (!kind && looks++ < 8))) checkSubmitted();
    const key = `${doc.location.href}|${kind}`;
    if (key === shownFor) return;
    shownFor = key;
    if (!top) {
      // An application form embedded in a careers page: the panel (in the top frame) fills it.
      if (kind === 'form' && !asked && (await allowed(doc))) {
        asked = true;
        void sendSafe({ type: 'wera:panel-ensure' });
      }
      return;
    }
    const { title, company } = jobSummary(doc);
    Object.assign(handle, { kind, title, company, draft: readJobPosting(doc, doc.location.href) });
    subscribers.forEach((fn) => fn(handle));
    if (kind && !asked && (await allowed(doc))) {
      asked = true;
      void ask({ type: 'wera:dock-hello', url: doc.location.href, kind, draft: handle.draft, referrer: doc.referrer });
      void sendSafe({ type: 'wera:panel-ensure' });
    }
  };
  const schedule = () => {
    if (!extensionAlive()) return stop();
    if (timer) return;
    // The first look comes at once; later ones wait for the page to settle.
    timer = window.setTimeout(() => void check().catch(() => {}), first ? Math.min(delay, 150) : delay);
    first = false;
  };
  // Moving an application on (Next, Submit): Wera keeps the details it lacked, self-identification included.
  const onClick = (e: Event) => {
    const b = (e.target as Element | null)?.closest?.('button, input[type="submit"], [role="button"], a');
    if (!b || !sawForm) return;
    const text = (b instanceof HTMLInputElement ? b.value : b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!MOVES_ON.test(text)) return;
    const entries = formDetails(doc);
    if (entries.length) void ask({ type: 'wera:dock-learn', entries });
  };
  doc.addEventListener('click', onClick, true);
  // Watched from the document itself: a page that swaps its body or <html> is still seen.
  const obs = new MutationObserver(schedule);
  obs.observe(doc, { childList: true, subtree: true });
  doc.addEventListener('visibilitychange', schedule);
  schedule();
  function stop() {
    doc.removeEventListener('click', onClick, true);
    obs.disconnect();
    doc.removeEventListener('visibilitychange', schedule);
    window.clearTimeout(timer);
  }
  return stop;
}

if (typeof window !== 'undefined' && !window.__weraPage && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  listen();
  watchForJobs(document);
}
