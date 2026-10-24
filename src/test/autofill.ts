// The panel's autofill without the panel, for tests of the page side:
// read the form, fill what Wera knows into empty fields, read again for
// fields an answer revealed (or options that loaded), and report every
// field the way the panel lists it.
import { applyItems, planForm } from '../content/plan';
import type { Applicant, FieldPlan, FileData, FillResult, Profile } from '../shared/types';

export interface AutofillOptions {
  resume?: FileData;
  coverLetter?: string;
  company?: string;
  /** Rounds over the form (answers can reveal fields or load options). */
  passes?: number;
  /** How long to let the page react between rounds (ms). */
  settle?: number;
}

/** What the panel shows for a field Wera did not fill. */
function unfilled(f: FieldPlan): FillResult {
  const base = { id: f.id, label: f.label.slice(0, 160), purpose: f.purpose, required: f.required };
  if (f.purpose === 'question') return { ...base, status: 'question', note: f.note, ...(f.maxLength ? { maxLength: f.maxLength } : {}) };
  if (f.current) return { ...base, status: 'already', value: f.current };
  if (f.group === 'consent') return { ...base, status: 'review', note: f.note };
  return { ...base, status: f.required || /no (option|choice) matches/.test(f.note ?? '') ? 'review' : 'skipped', note: f.note };
}

/** A field worth another round: its options may have loaded since. */
const retry = (r: FillResult) => r.status === 'review' && /no (option|choice) matches/.test(r.note ?? '');

export async function autofill(root: ParentNode, a: Applicant | Profile, opts: AutofillOptions = {}): Promise<FillResult[]> {
  const results = new Map<string, FillResult>();
  const order = new Map<string, number>();
  for (let pass = 0; pass < (opts.passes ?? 3); pass++) {
    const plan = planForm(root, a, { resumeName: opts.resume?.name, coverLetter: !!opts.coverLetter, company: opts.company });
    plan.fields.forEach((f, i) => order.set(f.id, i));
    const todo = plan.fields.filter((f) => !results.has(f.id) || retry(results.get(f.id)!));
    const items = todo.filter((f) => f.value && !f.current && f.group !== 'consent').map((f) => ({ id: f.id, value: f.value, label: f.label, kind: f.kind }));
    for (const f of todo) results.set(f.id, unfilled(f));
    const got = await applyItems(root, items, opts);
    for (const r of got) results.set(r.id, r);
    if (!got.some((r) => r.status === 'filled')) break;
    await new Promise((r) => setTimeout(r, opts.settle ?? 60));
  }
  return [...results.values()].sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9));
}
