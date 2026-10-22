// What the page script and the Wera panel (both inside the job page) ask
// the background about the page's job. The page reads itself; the
// background holds the sign-in and talks to Wera.
import type { ApplicationStatus, WeraJob } from './api';
import type { FieldPurpose, JobDraft } from './types';

export type DockKind = 'form' | 'posting';

/** The job as the dock shows it. */
export interface DockJob {
  id: number;
  title: string;
  company: string;
  score: number | null;
  /** The score is Wera's estimate; the AI score is on its way. */
  estimate: boolean;
  verdict: string | null;
  status: string | null;
  autofilled: boolean;
}

export function dockJob(j: WeraJob): DockJob {
  return {
    id: j.id, title: j.title, company: j.company,
    score: j.fit_score ?? j.estimated_score, estimate: j.fit_score == null && j.estimated_score != null,
    verdict: j.verdict, status: j.application_status, autofilled: !!j.autofilled_at,
  };
}

export interface JobContext {
  jobId: number | null;
  posting: { company: string; title: string; description: string } | null;
}

export interface DockHello {
  signedIn: boolean;
  job: DockJob | null;
}

/** What the background did when the page said "thank you for applying". */
export type SubmitReply =
  | { state: 'marked'; job: DockJob; previous: string | null }
  | { state: 'already'; job: DockJob }
  /** Not in Wera: the posting this tab showed earlier, if any, can be added as applied. */
  | { state: 'unknown'; draft: { title: string; company: string } | null }
  | { state: 'off' };

export type DockRequest =
  | { type: 'wera:dock-hello'; url: string; kind: DockKind; draft: JobDraft | null; referrer?: string }
  | { type: 'wera:dock-save'; draft: JobDraft }
  | { type: 'wera:dock-submitted'; url: string }
  | { type: 'wera:dock-status'; jobId: number; status: ApplicationStatus }
  | { type: 'wera:dock-add-applied' }
  /** Which job the tab's application is for, and its posting: what drafted answers are written for. */
  | { type: 'wera:dock-context' }
  /** The job the tab is on, as Wera has it (the panel's job card); null when not in Wera or signed out. */
  | { type: 'wera:dock-resolve'; url: string; title: string; referrer?: string }
  /** The panel saved or found the tab's job: remember it for the tab's next pages (the application after its posting). */
  | { type: 'wera:dock-remember'; jobId: number }
  /** What the user left in a form's detail fields when moving on (Next, Submit). */
  | { type: 'wera:dock-learn'; entries: { purpose: FieldPurpose; value: string }[] };

export const isDockRequest = (m: unknown): m is DockRequest =>
  !!m && typeof m === 'object' && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('wera:dock-');

/** Statuses past applying: a confirmation page never moves a job back to Applied. */
export const PAST_APPLIED = new Set(['applied', 'interviewing', 'offer', 'rejected']);
