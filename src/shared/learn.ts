// The answers Wera remembers from a page the user finished, for the next
// form: what the user chose or typed in the form's own questions. The page
// script sends them when the user moves the form on (Next, Submit), with
// the details (name, contact, self-identification, see details.ts); the
// panel's Continue does too. It never learns consents or files, and never
// relearns an answer Wera already has.
import { answerKey, type SavedAnswer } from './answers';
import type { FieldPlan, FieldSnapshot } from './types';

const CHOICE = new Set(['select', 'radio', 'checkboxes', 'buttons', 'listbox', 'combobox']);

export interface LearnedAnswer {
  question: string;
  answer: string;
  kind: 'text' | 'long' | 'choice';
  company: string;
}

/** Answers worth remembering: what the user chose or typed where Wera's details did not decide it. */
export function answersToLearn(plan: Pick<FieldPlan, 'id' | 'label' | 'group'>[], snap: FieldSnapshot[], bank: SavedAnswer[], company: string): LearnedAnswer[] {
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
