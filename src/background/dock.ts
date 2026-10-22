// The background's side of the job page: it looks the page's job up in
// Wera, saves a posting, and marks a job applied when the site confirms
// the application. Signed-in calls happen here, never in the page.
import { WeraApi, type WeraJob } from '../shared/api';
import { notifyDashboard, sameRole, tabHandoff } from '../shared/bridge';
import { dockJob, PAST_APPLIED, type DockHello, type DockRequest, type JobContext, type SubmitReply } from '../shared/dock';
import { loadFlow } from '../shared/flow';
import { loadSettings } from '../shared/settings';
import { SELF_ID_KEYS, selfIdValue } from '../shared/selfId';
import { loadSession, notePage, rememberTabJob, tabJob, tabPages as pages } from '../shared/storage';
import type { FieldPurpose } from '../shared/types';

const FORM_TTL = 3 * 3600_000;

/** The signed-in API (null when signed out), telling open dashboards what changed. */
export async function signedInApi(): Promise<WeraApi | null> {
  const s = await loadSession();
  return s ? new WeraApi(s.server, s.token, undefined, (path) => void notifyDashboard(s.server, path)) : null;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * The job a tab is on: by its address, else by the page it came from on
 * the same site (the posting whose Apply button led here), else the one
 * this tab showed on the same site, else the one the dashboard opened it
 * for, else the one an autofill in progress is for.
 */
export async function resolveJob(api: WeraApi, tabId: number, url: string, title = '', referrer = ''): Promise<WeraJob | null> {
  const origin = originOf(url);
  let job = await api.lookup(url).then((r) => r.job).catch(() => null);
  if (!job && referrer && referrer !== url && originOf(referrer) === origin) job = await api.lookup(referrer).then((r) => r.job).catch(() => null);
  if (!job) {
    const remembered = await tabJob(tabId, origin);
    if (remembered) job = await api.job(remembered).catch(() => null);
  }
  if (!job) {
    const h = await tabHandoff(tabId);
    const handed = h ? await api.job(h.jobId).catch(() => null) : null;
    if (handed && (!title || sameRole(title, handed.title))) job = handed;
  }
  if (!job && origin) {
    const flow = await loadFlow(tabId, new URL(url).host);
    if (flow?.jobId) job = await api.job(flow.jobId).catch(() => null);
  }
  if (job && origin) await rememberTabJob(tabId, origin, job.id);
  return job;
}

/** The fit score on the toolbar icon for the tab (a check for a job without one, nothing without a job). */
export function setBadge(tabId: number, job: WeraJob | null) {
  if (!chrome.action?.setBadgeText) return;
  const score = job ? (job.fit_score ?? job.estimated_score) : null;
  void chrome.action.setBadgeText({ tabId, text: score != null ? String(score) : job ? '✓' : '' }).catch(() => {});
  if (score != null) void chrome.action.setBadgeBackgroundColor({ tabId, color: score >= 80 ? '#1e7a3c' : score >= 65 ? '#3157c4' : '#6b7180' }).catch(() => {});
}

/** Tells the tab's Wera panel that the tab's job changed (saved, moved on the tracker, applied). */
function broadcast(tabId: number, job: WeraJob, applied = false) {
  setBadge(tabId, job);
  void chrome.tabs.sendMessage(tabId, { type: 'wera:job-changed', job, applied }, { frameId: 0 }).catch(() => {});
}

/** Answers one dock request from tab `tabId` (opening the panel is done by the caller, inside the click). */
export async function handleDock(msg: DockRequest, tabId: number, tabUrl: string): Promise<unknown> {
  const api = await signedInApi();
  switch (msg.type) {
    case 'wera:dock-hello': {
      await notePage(tabId, msg.kind === 'form' ? { formAt: Date.now() } : msg.draft ? { draft: msg.draft } : {});
      if (!api) return { signedIn: false, job: null } satisfies DockHello;
      const job = await resolveJob(api, tabId, msg.url, msg.draft?.title, msg.referrer);
      setBadge(tabId, job);
      return { signedIn: true, job: job && dockJob(job) } satisfies DockHello;
    }
    case 'wera:dock-save': {
      if (!api) return null;
      const job = await api.addJob(msg.draft);
      await rememberTabJob(tabId, originOf(tabUrl), job.id);
      broadcast(tabId, job);
      return dockJob(job);
    }
    case 'wera:dock-status': {
      if (!api) return null;
      const job = await api.setStatus(msg.jobId, msg.status);
      broadcast(tabId, job);
      return dockJob(job);
    }
    case 'wera:dock-submitted':
      return api ? submitted(api, tabId, msg.url) : ({ state: 'off' } satisfies SubmitReply);
    case 'wera:dock-learn':
      return api ? learnDetails(api, msg.entries) : null;
    case 'wera:dock-remember':
      await rememberTabJob(tabId, originOf(tabUrl), msg.jobId);
      return true;
    case 'wera:dock-resolve': {
      const job = api ? await resolveJob(api, tabId, msg.url, msg.title, msg.referrer) : null;
      setBadge(tabId, job);
      return job;
    }
    case 'wera:dock-context': {
      const draft = (await pages())[tabId]?.draft;
      const job = api ? await resolveJob(api, tabId, tabUrl, draft?.title).catch(() => null) : null;
      const posting = draft ? { company: draft.company, title: draft.title, description: draft.description } : null;
      return { jobId: job?.id ?? null, posting: job ? { company: job.company, title: job.title, description: '' } : posting } satisfies JobContext;
    }
    case 'wera:dock-add-applied': {
      const draft = (await pages())[tabId]?.draft;
      if (!api || !draft) return null;
      const added = await api.addJob(draft);
      const job = await api.setStatus(added.id, 'applied');
      await rememberTabJob(tabId, originOf(tabUrl), job.id);
      broadcast(tabId, job, true);
      return dockJob(job);
    }
    default:
      return null;
  }
}

const YES_NO = new Set<FieldPurpose>(['authorized_to_work', 'needs_sponsorship', 'willing_to_relocate', 'willing_to_travel', 'over_18']);

/**
 * Saves the details a form had that Wera lacked, as the user entered
 * them, self-identification in the dashboard's values. Nothing already in
 * the profile is replaced. Returns the keys saved.
 */
export async function learnDetails(api: WeraApi, entries: { purpose: FieldPurpose; value: string }[]): Promise<string[]> {
  const view = await api.applicant();
  const a = view.applicant as unknown as Record<string, string>;
  const learned: Record<string, string> = {};
  for (const { purpose, value } of entries.slice(0, 80)) {
    // A start date belongs to one application; kept, it goes stale.
    if (purpose === 'start_date' || !(purpose in a) || (a[purpose] ?? '').trim() || learned[purpose]) continue;
    let v = value.trim();
    if (SELF_ID_KEYS.has(purpose)) v = selfIdValue(purpose, v);
    else if (YES_NO.has(purpose)) v = /^yes\b/i.test(v) ? 'yes' : /^no\b/i.test(v) ? 'no' : '';
    if (v && v.length <= 300) learned[purpose] = v;
  }
  const keys = Object.keys(learned);
  if (keys.length) await api.saveApplicant({ ...view.applicant, ...learned });
  return keys;
}

/**
 * The site confirmed an application. When this tab showed a form lately
 * (so it is the user's own application, not a page that merely says the
 * words), the job moves to Applied.
 */
async function submitted(api: WeraApi, tabId: number, url: string): Promise<SubmitReply> {
  const settings = await loadSettings();
  const seen = (await pages())[tabId];
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  })();
  const flow = host ? await loadFlow(tabId, host) : null;
  if (!settings.autoApplied || (!flow && !(seen?.formAt && Date.now() - seen.formAt < FORM_TTL))) return { state: 'off' };
  const job = await resolveJob(api, tabId, url);
  if (!job) {
    const d = seen?.draft;
    return { state: 'unknown', draft: d ? { title: d.title, company: d.company } : null };
  }
  if (job.application_status && PAST_APPLIED.has(job.application_status)) return { state: 'already', job: dockJob(job) };
  const updated = await api.setStatus(job.id, 'applied');
  await notePage(tabId, { formAt: 0 });
  broadcast(tabId, updated, true);
  return { state: 'marked', job: dockJob(updated), previous: job.application_status };
}
