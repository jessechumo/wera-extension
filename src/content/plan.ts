// Reads a form page into a plan the user reviews before anything is
// typed: every field, what it shows now, and what Wera would enter and
// why. Then fills exactly the values the user approved, one at a time,
// reporting each as it lands.
import { startHasPassed } from '../shared/dates';
import type { Applicant, FieldGroup, FieldPlan, FieldPurpose, FieldSnapshot, FillItem, FillResult, KnownAnswer, PagePlan, Profile, ValueSource } from '../shared/types';
import { datePart, ENTRY_PURPOSES, entryValue, findAdder, placeEntries, type Placed, type Section } from './entries';
import { bestAnswer } from '../shared/answers';
import { classify, SELF_ID } from './classify';
import { byId, collectFields, isPressed, listboxValue, type Field } from './fields';
import { attachFile, base64ToFile, comboboxChoice, enterValue, isPlaceholderOption, mark, matchOption, setNativeValue, valueFor, wait } from './fill';
import { findNext, invalidCount } from './next';

/** The value marker for "attach the resume" (a file input). */
export const RESUME = '__resume__';
/** The value marker for "insert the cover letter". */
export const LETTER = '__letter__';

/** Kinds whose answer is one of their options. */
const CHOICE = new Set(['select', 'radio', 'checkboxes', 'buttons']);

/** What a field shows now: its text, chosen option(s), ticked state or file. */
export function currentValue(f: Field): string {
  switch (f.kind) {
    case 'text':
    case 'textarea':
      return (f.el as HTMLInputElement).value.trim();
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      return sel.selectedIndex > 0 || (sel.selectedIndex === 0 && sel.value) ? (sel.options[sel.selectedIndex]?.textContent ?? '').trim() : '';
    }
    case 'radio':
    case 'checkboxes':
      return f.options.filter((o) => (o.el as HTMLInputElement).checked).map((o) => o.label).join(' | ');
    case 'buttons':
      return f.options.filter((o) => isPressed(o.el!)).map((o) => o.label).join(' | ');
    case 'checkbox':
      return (f.el as HTMLInputElement).checked ? 'yes' : '';
    case 'combobox':
      return comboboxChoice(f.el as HTMLInputElement);
    case 'listbox':
      return listboxValue(f.el);
    case 'file':
      return (f.el as HTMLInputElement).files?.[0]?.name ?? '';
    default:
      return '';
  }
}

function groupOf(purpose: FieldPurpose | null): FieldGroup {
  if (purpose === null) return 'other';
  if (purpose === 'consent') return 'consent';
  if (purpose === 'resume' || purpose === 'cover_letter') return 'documents';
  if (purpose === 'question') return 'questions';
  if (SELF_ID.has(purpose)) return 'self_id';
  return 'details';
}

/** A value as the field's own option label when it has options; null when none fits. */
function asOption(f: Field, value: string, purpose: FieldPurpose | null): string | null {
  if (!CHOICE.has(f.kind) || f.options.length === 0) return value;
  if (f.kind === 'checkboxes') {
    const hits = value.split(/\s*\|\s*/).map((v) => matchOption(f.options, v, purpose)).filter((o) => o != null);
    return hits.length ? hits.map((o) => o.label).join(' | ') : null;
  }
  return matchOption(f.options, value, purpose)?.label ?? null;
}

export interface PlanOptions {
  answers?: KnownAnswer[];
  /** The resume file Wera can attach. */
  resumeName?: string;
  /** Whether a cover letter is written for this job. */
  coverLetter?: boolean;
}

/** One field's plan: what it shows, what Wera proposes, from where. In a job or school block, placed says which. */
export function planField(f: Field, a: Applicant | Profile, opts: PlanOptions = {}, placed?: Placed): FieldPlan {
  const purpose = placed?.purpose ?? classify(f);
  const plan: FieldPlan = {
    id: f.id, label: f.label.slice(0, 200), purpose, kind: f.kind,
    options: f.options.map((o) => o.label).filter((l) => l && !isPlaceholderOption(l)).slice(0, 120),
    required: f.required, current: currentValue(f), value: '', source: null, group: groupOf(purpose),
  };
  const max = (f.el as HTMLTextAreaElement).maxLength;
  if (max > 0 && (f.kind === 'text' || f.kind === 'textarea')) plan.maxLength = max;
  const propose = (value: string, source: ValueSource, note?: string) => {
    plan.value = value;
    plan.source = source;
    if (note) plan.note = note;
  };

  if (purpose === 'consent') {
    plan.note = 'agree yourself after reading it';
    return plan;
  }
  if (purpose === 'resume') {
    if (f.kind !== 'file') return plan;
    if (opts.resumeName) propose(RESUME, 'resume', opts.resumeName);
    else plan.note = 'upload your resume in Wera to attach it';
    return plan;
  }
  if (purpose === 'cover_letter') {
    if ((f.kind === 'textarea' || f.kind === 'file') && opts.coverLetter) propose(LETTER, 'letter', f.kind === 'file' ? 'your cover letter for this job, as a PDF' : 'your cover letter for this job');
    else plan.note = f.kind === 'file' || f.kind === 'textarea' ? 'no cover letter for this job yet' : 'paste your cover letter yourself';
    return plan;
  }
  if (f.kind === 'file') {
    plan.note = 'attach this file yourself';
    return plan;
  }
  if (placed) {
    plan.entry = placed.entry;
    const what = placed.purpose.startsWith('exp_') ? 'job' : 'school';
    const v = entryValue(f, placed, a);
    if (v) {
      const shown = asOption(f, v, purpose);
      if (shown != null) {
        propose(shown, 'resume', `${ordinal(placed.entry)} ${what} on your resume`);
        return plan;
      }
      plan.note = `no option matches "${v}"`;
      return plan;
    }
    const have = placed.purpose.startsWith('exp_') ? (a as Profile).experience?.length ?? 0 : (a as Profile).education?.length ?? 0;
    plan.note = placed.entry >= have ? `your resume lists ${have} ${what}${have === 1 ? '' : 's'}` : placed.purpose === 'exp_end' ? 'you still work there' : 'not on your resume';
    return plan;
  }

  // A skills picker takes one tag at a time: the user picks them.
  if (purpose === 'skills' && f.kind !== 'text' && f.kind !== 'textarea') {
    plan.note = 'pick your skills from its list';
    return plan;
  }
  // The user's details first (never for open questions), then answers they gave before.
  if (purpose && purpose !== 'question') {
    let raw = valueFor(purpose, a);
    // A saved start date that has gone by would tell the employer you start in the past.
    if (purpose === 'start_date' && startHasPassed(raw)) {
      plan.note = `your saved start date (${raw}) has passed: update it in Wera`;
      raw = '';
    }
    // A city picker lists every Dallas: search with the state to pick the right one.
    if (purpose === 'city' && raw && a.state && (f.kind === 'combobox' || f.kind === 'listbox')) raw = `${raw}, ${a.state}`;
    // Typed into a box, a yes/no answer reads as a person writes it.
    const v = (f.kind === 'text' || f.kind === 'textarea') && /^(yes|no)$/.test(raw) ? raw[0]!.toUpperCase() + raw.slice(1) : raw;
    if (v) {
      const shown = asOption(f, v, purpose);
      if (shown != null) {
        propose(shown, 'details');
        return plan;
      }
      plan.note = `no option matches "${v}"`;
    }
  }
  if (!SELF_ID.has(purpose as FieldPurpose)) {
    const hit = bestAnswer(opts.answers ?? [], f.label);
    // An earlier form's start date is as stale as a saved one.
    if (hit && !(/\bstart|availab/i.test(f.label) && startHasPassed(hit.answer))) {
      const shown = asOption(f, hit.answer, purpose);
      if (shown != null) {
        propose(shown, 'saved', 'your earlier answer');
        return plan;
      }
    }
  }
  if (!plan.note) {
    plan.note = purpose === 'question' ? 'draft it, or write your own'
      : purpose && SELF_ID.has(purpose) ? 'not in your profile yet: pick it here or on the form, and Wera saves it for next time'
      : purpose ? 'not in your application details' : '';
  }
  return plan;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
const ordinal = (i: number) => (ORDINALS[i] ?? `#${i + 1}`).replace(/^./, (c) => c.toUpperCase());

/** The fields with their purposes, job and school blocks numbered. */
export function placeFields(fields: Field[]): Map<string, Placed> {
  return placeEntries(fields.map((f) => {
    const purpose = classify(f);
    return { id: f.id, purpose, part: purpose && ENTRY_PURPOSES.has(purpose) ? datePart(f) : null };
  }));
}

// How many blocks Wera adds at most: forms rarely want more than the recent ones.
const MAX_BLOCKS: Record<Section, number> = { experience: 3, education: 2 };

/** Sections that could take more of the resume's jobs or schools through their Add button. */
function adders(root: ParentNode, fields: FieldPlan[], p: Profile): NonNullable<PagePlan['adders']> {
  const out: NonNullable<PagePlan['adders']> = [];
  for (const section of ['experience', 'education'] as Section[]) {
    const have = (section === 'experience' ? p.experience : p.education)?.length ?? 0;
    const blocks = fields.filter((f) => f.entry != null && f.purpose?.startsWith(section === 'experience' ? 'exp_' : 'edu_'));
    const shown = blocks.length ? Math.max(...blocks.map((f) => f.entry!)) + 1 : 0;
    const want = Math.min(have, MAX_BLOCKS[section]);
    if (want > shown && findAdder(root, section)) out.push({ section, missing: want - shown });
  }
  return out;
}

/** Presses a section's Add button count times, waiting for each new block. */
export async function addEntries(root: ParentNode, section: Section, count: number, delay = 600): Promise<number> {
  let added = 0;
  for (let i = 0; i < Math.min(count, 4); i++) {
    const b = findAdder(root, section);
    if (!b) break;
    b.click();
    added++;
    await wait(delay);
  }
  return added;
}

/** The whole page: its fields in order, its Next button, and fields the site flags. */
export function planForm(root: ParentNode, a: Applicant | Profile, opts: PlanOptions = {}): PagePlan {
  const all = collectFields(root);
  const placed = placeFields(all);
  const fields = all.map((f) => planField(f, a, opts, placed.get(f.id))).filter((p) => p.purpose !== null || p.label !== '' || p.required);
  return { fields, next: findNext(root), errors: invalidCount(root), adders: adders(root, fields, a) };
}

export interface ApplyOptions {
  resume?: { name: string; base64: string };
  coverLetter?: string;
  /** The cover letter as a PDF, for a file input. */
  letterFile?: { name: string; base64: string };
  /** Pause between fields (ms), so the page keeps up and the user sees each land. */
  pace?: number;
  onProgress?: (r: FillResult) => void;
}

/**
 * Fills the approved values in page order, overwriting what a field
 * shows (the user chose this value for it). It never submits. Fields
 * that are gone (the page changed) are reported for review.
 */
export async function applyItems(root: ParentNode, items: FillItem[], opts: ApplyOptions = {}): Promise<FillResult[]> {
  const fields = new Map(collectFields(root).map((f) => [f.id, f]));
  const out: FillResult[] = [];
  for (const item of items) {
    const f = fields.get(item.id) ?? null;
    const purpose = f ? classify(f) : null;
    const res: FillResult = { id: item.id, label: f?.label.slice(0, 160) ?? '', purpose, status: 'review', required: f?.required ?? false };
    try {
      if (!f || !f.el.isConnected) {
        res.note = 'this field is no longer on the page';
      } else if (purpose === 'consent') {
        res.note = 'agree yourself after reading it';
      } else if (item.value === RESUME) {
        if (opts.resume && f.kind === 'file') {
          attachFile(f.el as HTMLInputElement, base64ToFile(opts.resume.base64, opts.resume.name));
          res.status = 'filled';
          res.value = opts.resume.name;
        } else {
          res.note = 'no resume to attach';
        }
      } else if (item.value === LETTER) {
        if (opts.coverLetter && (f.kind === 'textarea' || f.kind === 'text')) {
          setNativeValue(f.el as HTMLTextAreaElement, opts.coverLetter);
          res.status = 'filled';
          res.value = 'cover letter';
        } else if (opts.letterFile && f.kind === 'file') {
          attachFile(f.el as HTMLInputElement, base64ToFile(opts.letterFile.base64, opts.letterFile.name));
          res.status = 'filled';
          res.value = opts.letterFile.name;
        } else {
          res.note = 'write your cover letter first';
        }
      } else if (item.value.trim()) {
        await enterValue(f, purpose, item.value.trim(), res, true);
      } else {
        res.status = 'skipped';
      }
    } catch (e) {
      res.status = 'review';
      res.note = `could not fill: ${String(e)}`;
    }
    if (f && res.status === 'filled') mark(f.el, 'filled');
    else if (f && res.status === 'review') mark(f.el, 'review');
    out.push(res);
    opts.onProgress?.(res);
    if (opts.pace) await wait(opts.pace);
  }
  return out;
}

/** Every field's value as the user left it, to learn answers from. */
export function snapshot(root: ParentNode): FieldSnapshot[] {
  return collectFields(root)
    .filter((f) => f.kind !== 'file')
    .map((f) => ({ id: f.id, label: f.label.slice(0, 300), purpose: classify(f), kind: f.kind, value: currentValue(f) }))
    .filter((s) => s.value !== '');
}

/** Scrolls a field into view and flashes it, so the user finds it on the page. */
export function highlight(root: ParentNode, id: string): boolean {
  const el = byId(root, id);
  if (!el) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  el.focus?.({ preventScroll: true });
  el.animate?.([{ boxShadow: '0 0 0 4px rgba(255,122,89,.7)' }, { boxShadow: '0 0 0 0 rgba(255,122,89,0)' }], { duration: 1200 });
  return true;
}
