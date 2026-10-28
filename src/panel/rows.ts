// The panel's view of one form page: a row per field with what Wera will
// enter and how filling went, and the rules for which rows Wera fills,
// asks the AI about, drafts, or leaves to the user. Pure functions, so
// each rule can be tested on its own.
import { SELF_ID } from '../shared/selfId';
import type { FieldPlan, FillStatus, PagePlan } from '../shared/types';

export { LETTER, RESUME } from '../shared/markers';

/** One field as the panel tracks it: the plan, what Wera will enter, and how filling went. */
export interface Row extends FieldPlan {
  /** Filled when Wera fills the page (a value Wera trusts). */
  checked: boolean;
  status?: FillStatus | 'filling';
  result?: string;
  /** Wera drafted this answer (an open question): the user should read it. */
  drafted?: boolean;
}

/** The rows for a plan: values Wera trusts are filled; what the page already shows is left. */
export function rowsFor(plan: PagePlan, sources: Record<string, string> = {}): Row[] {
  return plan.fields.map((f) => ({
    ...f,
    source: f.source === 'details' && f.purpose && sources[f.purpose] ? (sources[f.purpose] === 'resume' ? 'resume' : 'profile') : f.source,
    checked: f.value !== '' && f.group !== 'consent' && f.current === '',
    status: f.current !== '' && f.current === f.value ? 'already' : undefined,
  }));
}

/** Questions the AI never answers: self-identification, and what only the user knows (who referred them). */
const NOT_FOR_AI = new Set(['referral', ...SELF_ID]);

/** Fields worth asking the AI about: empty, not answered by anything Wera knows, and not the user's to answer. */
export function needsSuggestion(r: Row): boolean {
  return r.value === '' && r.current === '' && r.entry == null && !(r.purpose && NOT_FOR_AI.has(r.purpose))
    && (r.group === 'details' || r.group === 'other' || (r.group === 'questions' && r.kind !== 'textarea'))
    && r.kind !== 'file' && r.kind !== 'checkbox';
}

/** A box for anything else ("Additional information"), not a question: left empty unless the form insists. */
const CATCH_ALL = /^(additional|other|further) (information|info|comments|details|notes)\b|^anything else\b|^comments?$|^notes?$/i;

/** Open questions Wera drafts an answer for: an empty text area asking something (not the cover letter). */
export function needsDraft(r: Row): boolean {
  return r.group === 'questions' && r.kind === 'textarea' && r.purpose === 'question' && r.value === '' && r.current === ''
    && r.label.trim().length >= 8 && (r.required || !CATCH_ALL.test(r.label.trim()));
}

/**
 * A cover letter box or upload Wera has nothing for yet (no letter for
 * this job) that is worth writing one for: the form insists, or asks for a
 * cover letter by name (not Lever's "Additional information").
 */
export function needsLetter(r: Row): boolean {
  return r.purpose === 'cover_letter' && (r.kind === 'file' || r.kind === 'textarea') && r.value === '' && r.current === ''
    && (r.required || /cover\s*letter|motivation(al)?\s*letter|letter of (motivation|interest)/i.test(r.label));
}

/**
 * What still needs the user once Wera is done: required fields left
 * empty or that did not take, self-identification not in their profile,
 * consents, AI guesses to confirm, and answers Wera drafted.
 */
export function needsYou(rows: Row[]): Row[] {
  return rows.filter((r) => {
    if (r.status === 'filled' && r.drafted) return true;
    if (r.status === 'filled' || r.status === 'already') return false;
    if (r.status === 'review') return true;
    if (r.source === 'ai' && r.value && !r.checked) return true;
    return r.group === 'consent' || r.group === 'self_id' || (r.required && r.current === '');
  });
}

/** Whether an AI answer can be what the field asks for: a LinkedIn box takes a LinkedIn address, not any link from the resume. */
export function fitsPurpose(purpose: FieldPlan['purpose'], value: string): boolean {
  switch (purpose) {
    case 'linkedin':
      return /linkedin\.com\//i.test(value);
    case 'github':
      return /github\.com\//i.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    case 'phone':
      return (value.match(/\d/g) ?? []).length >= 7;
    default:
      return true;
  }
}

/** A row's name: a job's or school's field says which ("Job 2 · Month"). */
export function rowLabel(r: Row): string {
  const label = (r.label || 'Field').replace(/\s*\*\s*$/, '');
  if (r.entry == null || !r.purpose) return label;
  return `${r.purpose.startsWith('exp_') ? 'Job' : 'School'} ${r.entry + 1} · ${label}`;
}

/** Runs fn over items, at most n at a time. */
export async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
  }));
}

export const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
