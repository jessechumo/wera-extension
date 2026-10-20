// What Wera learns from a page the user finished: answers to remember
// for the next form, and application details it did not have. It never
// learns self-identification, consents or files, and never relearns what
// it filled from the details itself.
import { answerKey, type SavedAnswer } from '../shared/answers';
import type { Applicant, ApplicantKey, FieldPlan, FieldPurpose, FieldSnapshot } from '../shared/types';

const SELF_ID = new Set<FieldPurpose>(['gender', 'pronouns', 'transgender', 'sexual_orientation', 'race', 'hispanic', 'veteran', 'disability']);
// Purposes that are not one detail each.
const DERIVED = new Set<FieldPurpose>(['full_name', 'authorized_no_sponsorship', 'location', 'resume', 'cover_letter', 'question', 'consent']);
const YES_NO = new Set<string>(['authorized_to_work', 'needs_sponsorship', 'willing_to_relocate', 'willing_to_travel', 'over_18']);
const CHOICE = new Set(['select', 'radio', 'checkboxes', 'buttons', 'listbox', 'combobox']);

export interface LearnedAnswer {
  question: string;
  answer: string;
  kind: 'text' | 'long' | 'choice';
  company: string;
}

/** Answers worth remembering: what the user chose or typed where Wera's details did not decide it. */
export function answersToLearn(plan: FieldPlan[], snap: FieldSnapshot[], bank: SavedAnswer[], company: string): LearnedAnswer[] {
  const byId = new Map(plan.map((p) => [p.id, p]));
  const known = new Map(bank.map((a) => [answerKey(a.question), a.answer]));
  const out: LearnedAnswer[] = [];
  for (const s of snap) {
    const p = byId.get(s.id);
    if (!p || !p.label.trim() || answerKey(p.label) === '') continue;
    // A detail (name, phone, sponsorship...) belongs in the application details, not here.
    if (p.group !== 'questions' && p.group !== 'other') continue;
    if (s.kind === 'checkbox') continue;
    const value = s.value.trim();
    const kind = s.kind === 'textarea' ? 'long' : CHOICE.has(s.kind) ? 'choice' : 'text';
    if (!value || (kind === 'long' && value.length < 20) || value.length > 6000) continue;
    if (known.get(answerKey(p.label)) === value) continue;
    out.push({ question: p.label.replace(/\s*\*\s*$/, ''), answer: value, kind, company });
  }
  return out;
}

/** Details the form asked for that Wera did not have and the user typed: worth saving to their application details. */
export function detailsToLearn(plan: FieldPlan[], snap: FieldSnapshot[], applicant: Applicant): Partial<Applicant> {
  const byId = new Map(plan.map((p) => [p.id, p]));
  const out: Partial<Record<ApplicantKey, string>> = {};
  for (const s of snap) {
    const p = byId.get(s.id);
    const key = p?.purpose;
    if (!p || !key || DERIVED.has(key) || SELF_ID.has(key) || !(key in applicant)) continue;
    const k = key as ApplicantKey;
    if ((applicant[k] ?? '').trim() || out[k]) continue;
    let value = s.value.trim();
    if (YES_NO.has(k)) {
      value = /^yes\b/i.test(value) ? 'yes' : /^no\b/i.test(value) ? 'no' : '';
    }
    if (value && value.length <= 300) out[k] = value;
  }
  return out;
}
