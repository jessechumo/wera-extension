// A page that wants an account before it shows the application, on any
// site: what stands between the user and the form. Sites that word it their
// own way have a rule of their own (see sites/workday.ts).
import { collectFields, isHidden } from './fields';
import { siteFor } from './sites';

const SIGN_IN = /^(sign|log) ?in\b/i;
const NEW_ACCOUNT = /^(create|register|sign ?up)\b/i;
// A few boxes are a sign-in form; more than that is the application itself.
const MOST_SIGN_IN_BOXES = 2;

const ASK = 'This site wants an account first. Sign in or create one here, and Wera fills the application when it shows.';

export function accountWall(doc: Document): string | null {
  const password = [...doc.querySelectorAll('input[type="password"]')].some((i) => !isHidden(i));
  const words = [...doc.querySelectorAll<HTMLElement>('button, a, [role="button"], input[type="submit"]')]
    .filter((c) => !isHidden(c)).map((c) => (c.textContent || (c as HTMLInputElement).value || '').trim());
  if (!password && !(words.some((w) => SIGN_IN.test(w)) && words.some((w) => NEW_ACCOUNT.test(w)))) return null;
  return collectFields(doc).filter((f) => f.kind !== 'file').length > MOST_SIGN_IN_BOXES ? null : ASK;
}

/** What the page wants first, if anything. */
export function gateOf(doc: Document): string | null {
  return siteFor(doc)?.gate?.(doc) ?? accountWall(doc);
}
