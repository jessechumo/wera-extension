// What the page script and the Wera panel (both inside the job page) ask
// the background about the page's job. The page reads itself; the
// background holds the sign-in and talks to Wera.
import type { WeraJob } from './api';
import type { FieldPurpose, JobDraft } from './types';

/** A job as the panel's confirmation shows it. */
export interface JobBrief {
  id: number;
  title: string;
  company: string;
  status: string | null;
}

export function briefOf(j: WeraJob): JobBrief {
  return { id: j.id, title: j.title, company: j.company, status: j.application_status };
}

export interface JobContext {
  jobId: number | null;
  posting: { company: string; title: string; description: string } | null;
}

/**
 * What the background did when the page said "thank you for applying".
 * `close`: the user sent the application moments ago and wants the tab
 * closed once Wera has said so (the panel shows the alert, then closes it).
 */
export type SubmitReply =
  /** Moved to Applied; `added`: the job was not in Wera, so it was added from the posting. */
  | { state: 'marked'; job: JobBrief; previous: string | null; added?: boolean; close?: boolean }
  | { state: 'already'; job: JobBrief; close?: boolean }
  /** Not in Wera: the posting this tab showed earlier, if any, can be added as applied. */
  | { state: 'unknown'; draft: { title: string; company: string } | null; close?: boolean }
  | { state: 'off' };

export type JobRequest =
  /** The page script found a job page: the tab showed a form now, or this posting. */
  | { type: 'wera:job-seen'; kind: 'form' | 'posting'; draft: JobDraft | null }
  | { type: 'wera:job-submitted'; url: string }
  /** The user clicked the form's Submit (or sent it with Enter): a confirmation that follows is theirs. */
  | { type: 'wera:job-sending' }
  /** Which job the tab's application is for, and its posting: what drafted answers are written for. */
  | { type: 'wera:job-context' }
  /** The job the tab is on, as Wera has it (the panel's job card); null when not in Wera or signed out. */
  | { type: 'wera:job-resolve'; url: string; title: string; referrer?: string }
  /** The panel saved or found the tab's job: remember it for the tab's next pages (the application after its posting). */
  | { type: 'wera:job-remember'; jobId: number }
  /** What the user left in a form's detail fields when moving on (Next, Submit). */
  | { type: 'wera:job-learn'; entries: { purpose: FieldPurpose; value: string }[] };

export const isJobRequest = (m: unknown): m is JobRequest =>
  !!m && typeof m === 'object' && typeof (m as { type?: unknown }).type === 'string' && (m as { type: string }).type.startsWith('wera:job-')
  && (m as { type: string }).type !== 'wera:job-changed' && (m as { type: string }).type !== 'wera:job-confirmed';

/** The background tells the top frame's page script about a confirmation an embedded form showed. */
export interface JobConfirmed {
  type: 'wera:job-confirmed';
  reply: SubmitReply;
}

/** Statuses past applying: a confirmation page never moves a job back to Applied. */
export const PAST_APPLIED = new Set(['applied', 'interviewing', 'offer', 'rejected']);
