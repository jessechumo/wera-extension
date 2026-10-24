// What the user reads when something fails: what went wrong and what to
// do about it, never a bare status code or a stack. Every error shown in
// the panel or the Wera button goes through describeError.
import { ApiError } from './api';

/** "the job not found" -> "The job not found." */
function sentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const first = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?:)]$/.test(first) ? first : `${first}.`;
}

/** A status line with no message of the server's own ("502 Bad Gateway", "530 "). */
const BARE_STATUS = /^\d{3}\b[\w\s-]*$/;

function apiMessage(e: ApiError): string {
  const own = e.message && !BARE_STATUS.test(e.message.trim()) ? e.message : '';
  switch (true) {
    case e.status === 0:
      return sentence(own || "Can't reach your Wera server. Check that it is running and that its address is right");
    case e.status === 401:
      return 'Your Wera sign-in has ended. Sign in again from the Wera panel.';
    case e.status === 403:
      return sentence(own || 'Wera refused this request');
    case e.status === 413:
      return 'That is too large for Wera to take.';
    case e.status === 429:
      return 'Wera has had too many requests from you just now. Wait a minute, then try again.';
    case e.status >= 500 && !own:
      return e.status >= 502
        ? `Your Wera server isn't answering (error ${e.status}). It may be restarting, or its tunnel may be down. Try again in a minute.`
        : `Your Wera server hit a problem (error ${e.status}). Try again; if it keeps happening, check the server's log.`;
    default:
      return sentence(own || `Wera answered with error ${e.status}`);
  }
}

/** Messages Chrome gives for a page cut off from the extension, as the user should read them. */
function browserMessage(msg: string): string {
  if (/context invalidated/i.test(msg)) return 'Wera was updated: reload this page to keep using it.';
  if (/receiving end does not exist|could not establish connection/i.test(msg)) return 'This page lost touch with Wera. Reload it and try again.';
  if (/message port closed/i.test(msg)) return 'The page stopped answering Wera. Reload it and try again.';
  return sentence(msg);
}

/**
 * The error as one or two sentences for the user. With `doing` ("Couldn't
 * load your resume"), the cause follows it as its own sentence.
 */
export function describeError(e: unknown, doing?: string): string {
  const cause = e instanceof ApiError ? apiMessage(e) : browserMessage(e instanceof Error ? e.message : typeof e === 'string' && e ? e : 'Something went wrong');
  return doing ? `${sentence(doing)} ${cause}` : cause;
}

/** Whether the error means the user must sign in again. */
export const isSignedOut = (e: unknown) => e instanceof ApiError && e.status === 401;
