// Runs on every page (top frame). On a job posting or an application form
// it slides in the Wera dock: the job, your fit, a big Autofill button,
// cover letter and resume. When the site then says "thank you for
// applying", it tells the background, which marks the job applied, and
// shows a toast with an undo. It reads what it needs to tell a job page
// from any other; only the dock's own requests leave the page, to Wera.
import { jobSummary, pageKind, type PageKind } from '../content/detect';
import { readJobPosting } from '../content/jsonld';
import { ENTRY_PURPOSES } from '../content/entries';
import { snapshot } from '../content/plan';
import { bodyText, looksSubmitted } from '../content/watch';
import { extensionAlive, sendSafe } from '../shared/alive';
import type { ApplicationStatus } from '../shared/api';
import type { DockHello, DockJob, DockRequest, PanelView, SubmitReply } from '../shared/dock';
import { SETTINGS_KEY } from '../shared/settings';
import { followTheme } from '../shared/theme';
import { mountRoot, renderDock, renderToast, type DockState, type ToastSpec } from './dock';

declare global {
  interface Window {
    __weraLauncher?: boolean;
  }
}

export { pageKind } from '../content/detect';

const DISMISSED = 'wera.launcherDismissed';
const COLLAPSED = 'wera.dockCollapsed';
const DISMISS_FOR = 7 * 86_400_000;

function ask<T>(msg: DockRequest): Promise<T | null> {
  return sendSafe<T>(msg);
}

async function local<T>(key: string): Promise<T | undefined> {
  return ((await chrome.storage.local.get(key))[key] as T | undefined) ?? undefined;
}

/** Whether the dock may show on this site: turned on, not hidden here, not the user's own Wera. */
async function allowed(doc: Document): Promise<boolean> {
  const got = await chrome.storage.local.get([SETTINGS_KEY, DISMISSED, 'wera.session']);
  if ((got[SETTINGS_KEY] as { launcher?: boolean } | undefined)?.launcher === false) return false;
  if ((got['wera.session'] as { server?: string } | undefined)?.server === doc.location.origin) return false;
  const until = (got[DISMISSED] as Record<string, number> | undefined)?.[doc.location.host] ?? 0;
  return until < Date.now();
}

async function setHostFlag(key: string, host: string, value: number | null) {
  const map = { ...(await local<Record<string, number>>(key)) };
  if (value == null) delete map[host];
  else map[host] = value;
  if (key === DISMISSED) for (const [k, v] of Object.entries(map)) if (v < Date.now()) delete map[k];
  await chrome.storage.local.set({ [key]: map });
}

/** The toast for what the background did after a confirmation page. */
export function submitToast(r: SubmitReply, act: { undo: (j: DockJob, to: ApplicationStatus) => void; open: (v: PanelView) => void; add: () => void }): ToastSpec | null {
  if (r.state === 'marked') {
    const back = (r.previous ?? 'saved') as ApplicationStatus;
    return {
      tone: 'success', title: 'Marked as applied',
      text: `${r.job.title} at ${r.job.company} is in Applied in your Wera tracker. Good luck!`,
      actions: [{ label: 'Undo', run: () => act.undo(r.job, back) }, { label: 'View in Wera', run: () => act.open('job') }],
    };
  }
  if (r.state === 'unknown') {
    return r.draft
      ? { tone: 'info', title: 'Applied? Track it in Wera', text: `${r.draft.title}${r.draft.company ? ` at ${r.draft.company}` : ''} is not in your Wera lists yet.`, actions: [{ label: 'Add as applied', run: act.add }] }
      : { tone: 'info', title: 'Applied? Track it in Wera', text: 'This job is not in your Wera lists yet. Save it to keep your tracker current.', actions: [{ label: 'Open Wera', run: () => act.open('job') }] };
  }
  return null;
}

// The buttons that move an application on: what the user entered on the page is final then.
const MOVES_ON = /^(submit|submit application|send|send application|apply|apply now|next|continue|save and continue|save & continue|review|review application|finish)\b/i;
const NOT_DETAILS = new Set(['question', 'consent', 'resume', 'cover_letter', 'skills', 'full_name', 'location', 'authorized_no_sponsorship', 'phone_type', 'phone_code']);

/** The details a form holds now (name, contact, eligibility, self-identification): what Wera can learn from. */
export function formDetails(doc: Document): { purpose: NonNullable<ReturnType<typeof snapshot>[number]['purpose']>; value: string }[] {
  return snapshot(doc)
    .filter((f) => f.purpose && !NOT_DETAILS.has(f.purpose) && !ENTRY_PURPOSES.has(f.purpose) && f.kind !== 'checkbox')
    .map((f) => ({ purpose: f.purpose!, value: f.value }));
}

/** Watches the page (single-page job boards change without loading) and keeps the dock in step; returns a stop. */
export function start(doc: Document, delay = 1200): () => void {
  const { host, box } = mountRoot(doc);
  // The theme the user picked in the dashboard.
  const stopTheme = followTheme((t) => {
    box.dataset.theme = t;
  });
  host.hidden = true;
  let state: DockState | null = null;
  let shownFor = ''; // url|kind the dock was built for
  let timer = 0;
  let toastTimer = 0;
  let submittedFor = '';
  let sawForm = false;
  // Pages that are not job pages are read for a confirmation only for a while after they load.
  let looks = 0;
  let looksFor = '';
  const siteHost = doc.location.host;
  const own = chrome.storage.local.get('wera.session')
    .then((g) => (g['wera.session'] as { server?: string } | undefined)?.server === doc.location.origin, () => false);

  const draw = () => {
    box.querySelector('.card, .tab')?.remove();
    if (!state) {
      host.hidden = !box.querySelector('.toast');
      return;
    }
    host.hidden = false;
    box.prepend(renderDock(doc, state, actions));
  };
  const patch = (p: Partial<DockState>) => {
    if (state) {
      state = { ...state, ...p };
      draw();
    }
  };
  const setJob = (job: DockJob | null) => state?.hello && patch({ hello: { ...state.hello, job } });

  const actions = {
    // Opening the side panel needs this click: the background does it at once.
    open: (view: PanelView, fill = false) => void ask({ type: 'wera:dock-open', view, fill }),
    save: () => {
      const draft = readJobPosting(doc, doc.location.href);
      if (!draft) return actions.open('job');
      patch({ busy: true, error: '' });
      void ask<DockJob>({ type: 'wera:dock-save', draft }).then((job) => {
        patch({ busy: false, error: job ? '' : 'Could not save it. Open the Wera panel to try again.' });
        if (job) setJob(job);
      });
    },
    minimize: () => {
      patch({ open: false });
      void setHostFlag(COLLAPSED, siteHost, 1);
    },
    expand: () => {
      patch({ open: true });
      void setHostFlag(COLLAPSED, siteHost, null);
    },
    hide: () => {
      state = null;
      draw();
      void setHostFlag(DISMISSED, siteHost, Date.now() + DISMISS_FOR);
    },
  };

  const toast = (t: ToastSpec | null) => {
    box.querySelector('.toast')?.remove();
    window.clearTimeout(toastTimer);
    if (!t) return draw();
    const close = () => {
      box.querySelector('.toast')?.remove();
      draw();
    };
    box.append(renderToast(doc, t, close));
    host.hidden = false;
    toastTimer = window.setTimeout(close, 14_000);
  };

  const checkSubmitted = () => {
    const key = doc.location.href;
    if (submittedFor === key || !looksSubmitted(bodyText(doc))) return;
    submittedFor = key;
    void ask<SubmitReply>({ type: 'wera:dock-submitted', url: key }).then((r) => {
      if (!r) return;
      if (r.state === 'marked' || r.state === 'already') setJob(r.job);
      toast(submitToast(r, {
        undo: (j, to) => void ask<DockJob>({ type: 'wera:dock-status', jobId: j.id, status: to }).then((u) => u && setJob(u)),
        open: actions.open,
        add: () => void ask<DockJob>({ type: 'wera:dock-add-applied' }).then((j) => {
          if (j) toast({ tone: 'success', title: 'Added as applied', text: `${j.title} at ${j.company} is in Applied in your Wera tracker.`, actions: [] });
        }),
      }));
    });
  };

  const check = async () => {
    timer = 0;
    if (doc.hidden || (await own)) return;
    const kind: PageKind = pageKind(doc);
    if (kind === 'form') sawForm = true;
    // A confirmation replaces the form (often without a page load), or
    // is the next page, shown within moments of loading.
    if (looksFor !== doc.location.href) {
      looksFor = doc.location.href;
      looks = 0;
    }
    if (sawForm || (!kind && looks++ < 8)) checkSubmitted();
    const key = `${doc.location.href}|${kind}`;
    if (key === shownFor) return;
    shownFor = key;
    if (!kind || !(await allowed(doc))) {
      state = null;
      return draw();
    }
    const { title, company } = jobSummary(doc);
    const draft = readJobPosting(doc, doc.location.href);
    const collapsed = (await local<Record<string, number>>(COLLAPSED))?.[siteHost];
    state = { kind, title, company, hello: null, canSave: !!draft, open: !collapsed, busy: false, error: '' };
    draw();
    const hello = await ask<DockHello>({ type: 'wera:dock-hello', url: doc.location.href, kind, draft });
    if (shownFor === key && state) patch({ hello: hello ?? { signedIn: true, job: null } });
  };
  const schedule = () => {
    // The extension was reloaded: this dock can no longer reach it, so it goes.
    if (!extensionAlive()) return stop();
    if (!timer) timer = window.setTimeout(() => void check().catch(() => {}), delay);
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
  const obs = new MutationObserver(schedule);
  obs.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  doc.addEventListener('visibilitychange', schedule);

  // The side panel changed the job (saved it, moved it on the tracker): show it as Wera has it now.
  const onMessage = (msg: { type?: string; job?: DockJob }) => {
    if (msg?.type === 'wera:dock-job' && msg.job) setJob(msg.job);
  };
  chrome.runtime.onMessage?.addListener(onMessage);
  schedule();
  function stop() {
    doc.removeEventListener('click', onClick, true);
    obs.disconnect();
    doc.removeEventListener('visibilitychange', schedule);
    try {
      stopTheme();
      chrome.runtime.onMessage?.removeListener(onMessage);
    } catch {
      // Cut off from a reloaded extension: nothing left to unhook.
    }
    window.clearTimeout(timer);
    window.clearTimeout(toastTimer);
    host.remove();
  }
  return stop;
}

if (typeof window !== 'undefined' && !window.__weraLauncher && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  window.__weraLauncher = true;
  // Embedded frames (an ATS form inside a careers page) are reached from the top page's dock.
  if (window.top === window) start(document);
}
