// Runs in every frame of every page. It answers the Wera panel (read the
// page, fill the form), puts the panel on job postings and application
// forms, and adds Wera's answer button to open questions. When the site
// then says "thank you for applying", it tells the background, which
// marks the job applied. Nothing leaves the page unless Wera is on it.
import { isNotJobSite, jobSummary, pageKind, type PageKind } from '../content/detect';
import { readJobPosting } from '../content/jsonld';
import { ENTRY_PURPOSES } from '../content/entries';
import { listen } from '../content/listen';
import { groupOf, snapshot } from '../content/plan';
import { bodyText, looksSubmitted, submittedAddress } from '../content/watch';
import { extensionAlive, sendSafe } from '../shared/alive';
import { detailPurpose } from '../shared/details';
import { answersToLearn, type LearnedAnswer } from '../shared/learn';
import type { JobConfirmed, JobRequest, SubmitReply } from '../shared/jobs';
import { HIDDEN_SITES, SETTINGS_KEY, siteKey } from '../shared/settings';
import type { FieldPurpose, JobDraft } from '../shared/types';
import { startAssist } from './assist';

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

const ask = <T>(msg: JobRequest) => sendSafe<T>(msg);

// The buttons that move an application on: what the user entered on the page is final then.
const MOVES_ON = /^(submit|submit application|send|send application|apply|apply now|next|continue|save and continue|save & continue|review|review application|finish)\b/i;
// The buttons that send it: a confirmation that follows is the answer to this click.
const SENDS = /^(submit|submit (my |your )?application|send|send application|apply|apply now|finish|complete application)\b/i;
/**
 * The details the form holds now (name, contact, eligibility,
 * self-identification): what Wera can learn from (the background keeps
 * only those it lacks, see shared/details.ts). Open answers, job and
 * school blocks and lone tick boxes are not details.
 */
export function formDetails(doc: Document, snap = snapshot(doc)): { purpose: FieldPurpose; value: string }[] {
  return snap
    .filter((f): f is typeof f & { purpose: FieldPurpose } => detailPurpose(f.purpose) && !ENTRY_PURPOSES.has(f.purpose) && f.kind !== 'checkbox')
    .map((f) => ({ purpose: f.purpose, value: f.value }));
}

/**
 * The form's own questions as the user answered them (open questions,
 * choices, anything not a detail): what Wera remembers for the next form.
 */
export function formAnswers(doc: Document, company: string, snap = snapshot(doc)): LearnedAnswer[] {
  return answersToLearn(snap.map((s) => ({ id: s.id, label: s.label, group: groupOf(s.purpose) })), snap, [], company);
}

/** Whether the panel may show on this page: turned on, on this site too, and not the user's own Wera. */
async function allowed(doc: Document): Promise<boolean> {
  const got = await chrome.storage.local.get([SETTINGS_KEY, HIDDEN_SITES, 'wera.session']).catch((): Record<string, unknown> => ({}));
  if ((got[SETTINGS_KEY] as { launcher?: boolean } | undefined)?.launcher === false) return false;
  if ((got[HIDDEN_SITES] as Record<string, number> | undefined)?.[siteKey(doc)]) return false;
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
  // Looks in a row that found no job page: each costs the page some time, so they come less and less often.
  let idle = 0;

  // The page's text as laid out costs the page a layout: only when its raw text says it at all.
  const saysSubmitted = () => looksSubmitted(doc.body?.textContent ?? '') && looksSubmitted(bodyText(doc));
  const checkSubmitted = () => {
    const key = doc.location.href;
    if (submittedFor === key || isNotJobSite(key) || !(submittedAddress(key) || saysSubmitted())) return;
    submittedFor = key;
    void ask<SubmitReply>({ type: 'wera:job-submitted', url: key }).then((r) => {
      // A form embedded in a frame: the background tells the top frame (see onConfirmed).
      if (top && r && r.state !== 'off') confirmed(r);
    });
  };
  const confirmed = (r: SubmitReply) => {
    handle.submitted = r;
    subscribers.forEach((fn) => fn(handle));
    // The confirmation page is often not a job page: bring the panel to say what happened.
    void sendSafe({ type: 'wera:panel-ensure' });
  };
  const onConfirmed = (msg: JobConfirmed) => {
    if (msg?.type === 'wera:job-confirmed' && top) confirmed(msg.reply);
    return false;
  };

  const check = async () => {
    timer = 0;
    if (doc.hidden) return;
    const kind = pageKind(doc);
    idle = kind ? 0 : idle + 1;
    if (kind === 'form') sawForm = true;
    if (looksFor !== doc.location.href) {
      looksFor = doc.location.href;
      looks = 0;
    }
    // A form in a frame (an ATS embedded in a careers page) shows its own "thank you".
    if (sawForm || (top && !kind && looks++ < 8)) checkSubmitted();
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
      void ask({ type: 'wera:job-seen', kind, draft: handle.draft });
      void sendSafe({ type: 'wera:panel-ensure' });
    }
  };
  const schedule = () => {
    if (!extensionAlive()) return stop();
    if (timer) return;
    // Another address is another page (a single-page site moved on): look at it as soon as it settles.
    if (doc.location.href !== looksFor) idle = 0;
    // The first look comes at once; later ones wait for the page to settle, longer while it shows no job.
    timer = window.setTimeout(() => void check().catch(() => {}), first ? Math.min(delay, 150) : delay * Math.min(2 ** Math.floor(idle / 3), 16));
    first = false;
  };
  // Moving an application on (Next, Submit): Wera keeps the details it lacked, self-identification included.
  const onClick = (e: Event) => {
    const b = (e.target as Element | null)?.closest?.('button, input[type="submit"], [role="button"], a');
    if (!b || !sawForm) return;
    const text = (b instanceof HTMLInputElement ? b.value : b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!MOVES_ON.test(text)) return;
    if (SENDS.test(text)) void ask({ type: 'wera:job-sending' });
    // Read now: the page may be gone a moment later.
    const snap = snapshot(doc);
    const entries = formDetails(doc, snap);
    const answers = formAnswers(doc, handle.company, snap);
    if (entries.length || answers.length) void ask({ type: 'wera:job-learn', entries, answers });
  };
  // Sent with Enter in a field: the form's own submit.
  const onSubmit = () => {
    if (sawForm) void ask({ type: 'wera:job-sending' });
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('submit', onSubmit, true);
  if (top) chrome.runtime.onMessage?.addListener(onConfirmed);
  // Watched from the document itself: a page that swaps its body or <html> is still seen.
  const obs = new MutationObserver(schedule);
  obs.observe(doc, { childList: true, subtree: true });
  doc.addEventListener('visibilitychange', schedule);
  schedule();
  function stop() {
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('submit', onSubmit, true);
    if (top) chrome.runtime.onMessage?.removeListener(onConfirmed);
    obs.disconnect();
    doc.removeEventListener('visibilitychange', schedule);
    window.clearTimeout(timer);
  }
  return stop;
}

if (typeof window !== 'undefined' && !window.__weraPage && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  listen();
  watchForJobs(document);
  startAssist(document);
}
