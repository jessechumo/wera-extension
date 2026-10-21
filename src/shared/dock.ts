// What the Wera dock (the panel that slides in on job pages, launcher.js)
// and the background say to each other. The dock reads the page; the
// background holds the sign-in and talks to Wera.
import type { ApplicationStatus, WeraJob } from './api';
import type { JobDraft } from './types';

export type DockKind = 'form' | 'posting';
export type PanelView = 'job' | 'apply' | 'letter' | 'resume';

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
  | { type: 'wera:dock-hello'; url: string; kind: DockKind; draft: JobDraft | null }
  | { type: 'wera:dock-open'; view: PanelView; fill?: boolean }
  | { type: 'wera:dock-save'; draft: JobDraft }
  | { type: 'wera:dock-submitted'; url: string }
  | { type: 'wera:dock-status'; jobId: number; status: ApplicationStatus }
  | { type: 'wera:dock-add-applied' };

export const isDockRequest = (m: unknown): m is DockRequest =>
  !!m && typeof m === 'object' && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('wera:dock-');

/** Statuses past applying: a confirmation page never moves a job back to Applied. */
export const PAST_APPLIED = new Set(['applied', 'interviewing', 'offer', 'rejected']);

/** The panel view a dock button asked for (session storage: read once by the side panel). */
export const PENDING_VIEW = 'wera.pendingFill';
export interface PendingView {
  tabId: number;
  at: number;
  view: PanelView;
  fill: boolean;
}
