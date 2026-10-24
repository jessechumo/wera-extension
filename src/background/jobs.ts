// The background's side of the job page: it looks the page's job up in
// Wera, learns details from forms, and marks a job applied when the site confirms
// the application. Signed-in calls happen here, never in the page.
import { WeraApi, type WeraJob } from '../shared/api';
import { notifyDashboard, sameRole, tabHandoff } from '../shared/bridge';
import { learnedDetails } from '../shared/details';
import { briefOf, PAST_APPLIED, type JobRequest, type JobContext, type SubmitReply } from '../shared/jobs';
import { log } from '../shared/log';
import { loadFlow } from '../shared/flow';
import { loadSettings } from '../shared/settings';
import { loadSession, notePage, rememberTabJob, tabJob, tabPages as pages } from '../shared/storage';
import { hostOf, originOf } from '../shared/url';
import type { FieldPurpose } from '../shared/types';

const FORM_TTL = 3 * 3600_000;

/** The signed-in API (null when signed out), telling open dashboards what changed. */
export async function signedInApi(): Promise<WeraApi | null> {
  const s = await loadSession();
  return s ? new WeraApi(s.server, s.token, undefined, (path) => void notifyDashboard(s.server, path)) : null;
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
    const flow = await loadFlow(tabId, hostOf(url));
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

/** Tells the tab's Wera panel that the tab's job changed (applied). */
function broadcast(tabId: number, job: WeraJob, applied = false) {
  setBadge(tabId, job);
  void chrome.tabs.sendMessage(tabId, { type: 'wera:job-changed', job, applied }, { frameId: 0 }).catch(() => {});
}

/** Answers one request about the tab's job from its page script or panel. */
export async function handleJobRequest(msg: JobRequest, tabId: number, tabUrl: string): Promise<unknown> {
  const api = await signedInApi();
  switch (msg.type) {
    case 'wera:job-seen':
      // The panel looks the job up itself; this only notes what the tab showed (for confirmations).
      await notePage(tabId, msg.kind === 'form' ? { formAt: Date.now() } : msg.draft ? { draft: msg.draft } : {});
      return true;
    case 'wera:job-submitted':
      return api ? submitted(api, tabId, msg.url) : ({ state: 'off' } satisfies SubmitReply);
    case 'wera:job-learn':
      return api ? learnDetails(api, msg.entries) : null;
    case 'wera:job-remember':
      await rememberTabJob(tabId, originOf(tabUrl), msg.jobId);
      return true;
    case 'wera:job-resolve': {
      const job = api ? await resolveJob(api, tabId, msg.url, msg.title, msg.referrer) : null;
      setBadge(tabId, job);
      return job;
    }
    case 'wera:job-context': {
      const draft = (await pages())[tabId]?.draft;
      const job = api ? await resolveJob(api, tabId, tabUrl, draft?.title).catch(() => null) : null;
      const posting = draft ? { company: draft.company, title: draft.title, description: draft.description } : null;
      return { jobId: job?.id ?? null, posting: job ? { company: job.company, title: job.title, description: '' } : posting } satisfies JobContext;
    }
    default:
      return null;
  }
}

/**
 * Saves the details a form had that Wera lacked, as the user entered
 * them (see shared/details.ts). Returns the keys saved.
 */
export async function learnDetails(api: WeraApi, entries: { purpose: FieldPurpose; value: string }[]): Promise<string[]> {
  const view = await api.applicant();
  const learned = learnedDetails(view.applicant, entries);
  const keys = Object.keys(learned);
  if (keys.length) await api.saveApplicant({ ...view.applicant, ...learned });
  log.info('jobs', keys.length ? `learned ${keys.join(', ')} from the form` : 'nothing new to learn from the form');
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
  const host = hostOf(url);
  const flow = host ? await loadFlow(tabId, host) : null;
  if (!settings.autoApplied || (!flow && !(seen?.formAt && Date.now() - seen.formAt < FORM_TTL))) return { state: 'off' };
  const job = await resolveJob(api, tabId, url);
  if (!job) {
    const d = seen?.draft;
    return { state: 'unknown', draft: d ? { title: d.title, company: d.company } : null };
  }
  if (job.application_status && PAST_APPLIED.has(job.application_status)) return { state: 'already', job: briefOf(job) };
  const updated = await api.setStatus(job.id, 'applied');
  await notePage(tabId, { formAt: 0 });
  broadcast(tabId, updated, true);
  return { state: 'marked', job: briefOf(updated), previous: job.application_status };
}
