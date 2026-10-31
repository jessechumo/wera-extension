// Reads a form page into a plan the user reviews before anything is
// typed: every field, what it shows now, and what Wera would enter and
// why. Then fills exactly the values the user approved, one at a time,
// reporting each as it lands.
import { startHasPassed } from '../shared/dates';
import type { Applicant, FieldGroup, FieldPlan, FieldPurpose, FieldSnapshot, FillItem, FillResult, KnownAnswer, PagePlan, Profile, ValueSource } from '../shared/types';
import { datePart, ENTRY_PURPOSES, entryValue, findAdder, placeEntries, type Placed, type Section } from './entries';
import { bestAnswer } from '../shared/answers';
import { log } from '../shared/log';
import { asksOwnWords, trapMeaning, uniqueTraps, type Trap } from '../shared/traps';
import { LETTER, RESUME } from '../shared/markers';
import { SELF_ID } from '../shared/selfId';
import { classify } from './classify';
import { byId, collectFields, isPressed, isWorkdayPrompt, listboxValue, type Field } from './fields';
import { attachFile, base64ToFile, comboboxChoice, enterValue, mark, setNativeValue, wait } from './fill';
import { isPlaceholderOption, matchOption } from './match';
import { countryAnswer, countryIn, norm, sameCountry, stateName } from './places';
import { choicesOf, firstChoice, valueFor } from './values';
import { findNext, invalidCount } from './next';
import { siteFor } from './sites';
import { siteFiller } from './sites/fill';

export { LETTER, RESUME };

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

/** Which part of the form a field belongs to, by what it asks. */
export function groupOf(purpose: FieldPurpose | null): FieldGroup {
  if (purpose === null) return 'other';
  if (purpose === 'consent') return 'consent';
  if (purpose === 'resume' || purpose === 'cover_letter') return 'documents';
  if (purpose === 'question') return 'questions';
  if (SELF_ID.has(purpose)) return 'self_id';
  return 'details';
}

/**
 * A value as the field's own option label when it has options; null when
 * none fits. A box takes the value's first alternative; a dropdown whose
 * choices load later keeps them all, to try in turn when filling.
 */
function asOption(f: Field, value: string, purpose: FieldPurpose | null): string | null {
  if (f.kind === 'text' || f.kind === 'textarea') return firstChoice(value);
  if (!CHOICE.has(f.kind) || f.options.length === 0) return value;
  if (f.kind === 'checkboxes') {
    const hits = choicesOf(value, purpose).map((v) => matchOption(f.options, v, purpose)).filter((o) => o != null);
    return hits.length ? [...new Set(hits.map((o) => o.label))].join(' | ') : null;
  }
  return matchOption(f.options, value, purpose)?.label ?? null;
}

/** What a shown value reads as in a note ("Dallas, TX || Texas" reads "Dallas, TX"). */
const shown = (v: string) => firstChoice(v);

/** Words that don't tell one company from another ("The", "Inc"). */
const COMPANY_FILLER = new Set(['the', 'inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'group', 'and']);

/** Whether the question, or the job, is about another country than the one the user's details are about ("authorized to work in Canada?"). */
function abroad(f: Field, a: Applicant | Profile, jobLocation = ''): boolean {
  const there = countryIn(f.label) || countryIn(jobLocation);
  return !!there && !!a.country && !sameCountry(there, a.country);
}

/**
 * Answers worked out from the question itself: whether the user is in or
 * a citizen of the country it names, whether they worked for the company
 * it names. '' when the question doesn't say enough (the AI may answer).
 */
function derived(purpose: FieldPurpose, f: Field, a: Applicant | Profile, company: string, jobLocation = ''): string {
  switch (purpose) {
    case 'in_country':
      return countryAnswer(f.label, a.country);
    case 'citizen_of':
      return countryAnswer(f.label, a.citizenship ?? '');
    case 'authorized_to_work':
    case 'needs_sponsorship':
    case 'authorized_no_sponsorship':
      return abroad(f, a, jobLocation) ? '' : valueFor(purpose, a, { company });
    case 'previously_employed': {
      // Whether a past employer was this one's customer is not on a resume.
      if (/\b(customer|client|vendor|partner|competitor|supplier)s?\b/i.test(f.label)) return '';
      // Only about this company: "worked for a government agency" is something else.
      const label = ` ${norm(f.label)} `;
      const word = norm(company).split(' ').find((w) => w.length > 2 && !COMPANY_FILLER.has(w));
      const named = !!word && label.includes(` ${word} `);
      if (!named && !/\b(us|our company|this company|here)\b/.test(label)) return '';
      // A question may name several companies, or the one that became this one.
      const mine = (a as Profile).experience?.some((x) => norm(x.company) !== '' && label.includes(` ${norm(x.company)} `));
      return mine ? 'yes' : valueFor(purpose, a, { company });
    }
    default:
      return valueFor(purpose, a, { company });
  }
}

export interface PlanOptions {
  answers?: KnownAnswer[];
  /** The resume file Wera can attach. */
  resumeName?: string;
  /** Whether a cover letter is written for this job. */
  coverLetter?: boolean;
  /** The company the application is for. */
  company?: string;
  /** Where the job is ("Toronto, Ontario, Canada"): work authorization is about a place. */
  jobLocation?: string;
}

/** Questions only the user can answer, never sent to the AI. */
const ONLY_YOU: Partial<Record<FieldPurpose, string>> = {
  referral: 'only you know who referred you',
};

const NOT_IN_PROFILE = 'not in your Wera profile yet: pick it on the form, and Wera saves it for next time';

/** Derived answers that, when Wera can't work them out, the AI may answer. */
const DERIVED = new Set<FieldPurpose>(['in_country', 'citizen_of', 'previously_employed']);
/** Answers about the right to work: the details hold them for where the user lives. */
const WORK_RIGHTS = new Set<FieldPurpose>(['authorized_to_work', 'needs_sponsorship', 'authorized_no_sponsorship']);

/** Whether an upload takes the PDFs Wera has ("accept" may list only Word files). */
function takesPdf(f: Field): boolean {
  const accept = ((f.el as HTMLInputElement).getAttribute('accept') ?? '').toLowerCase();
  return !accept || /pdf|\*\/\*|application\/\*/.test(accept);
}

/** One field's plan: what it shows, what Wera proposes, from where. In a job or school block, placed says which. */
export function planField(f: Field, a: Applicant | Profile, opts: PlanOptions = {}, placed?: Placed): FieldPlan {
  const purpose = f.trap ? null : placed?.purpose ?? classify(f);
  const plan: FieldPlan = {
    id: f.id, label: f.label.slice(0, 200), purpose, kind: f.kind,
    options: f.options.map((o) => o.label).filter((l) => l && !isPlaceholderOption(l)).slice(0, 120),
    required: f.required, current: currentValue(f), value: '', source: null, group: groupOf(purpose),
  };
  // Never Wera's to answer, whatever it knows.
  if (f.trap) {
    plan.trap = f.trap.kind;
    plan.note = trapMeaning(f.trap.kind);
    if (!plan.label) plan.label = 'A box aimed at AI tools';
    return plan;
  }
  if (f.said?.some((t) => t.kind === 'ai_policy') || asksOwnWords(f.label)) {
    plan.ownWords = true;
    plan.note = 'the form asks for your own words: write it yourself, or use the Wera button in the box';
  }
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
    if (!takesPdf(f)) plan.note = 'this form does not take a PDF: attach a copy it accepts yourself';
    else if (opts.resumeName) propose(RESUME, 'resume', opts.resumeName);
    else plan.note = 'upload your resume in Wera to attach it';
    return plan;
  }
  if (purpose === 'cover_letter') {
    if (f.kind === 'file' && !takesPdf(f)) plan.note = 'this form does not take a PDF: attach a copy it accepts yourself';
    else if ((f.kind === 'textarea' || f.kind === 'file') && opts.coverLetter) propose(LETTER, 'letter', f.kind === 'file' ? 'your cover letter for this job, as a PDF' : 'your cover letter for this job');
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
  // A list of skills to pick from: Wera picks them on Workday (one pill each); elsewhere the user does.
  if (purpose === 'skills' && f.kind !== 'text' && f.kind !== 'textarea' && !(f.kind === 'combobox' && isWorkdayPrompt(f.el))) {
    plan.note = 'pick your skills from its list';
    return plan;
  }
  if (purpose && ONLY_YOU[purpose]) {
    plan.note = ONLY_YOU[purpose];
    return plan;
  }
  // A lone tick box that is one answer of a self-identification question ("Yes, I have a disability"): ticked when it is the user's answer.
  if (purpose && SELF_ID.has(purpose) && f.kind === 'checkbox') {
    const mine = valueFor(purpose, a);
    if (mine && matchOption([{ label: f.label, value: 'on' }], mine, purpose)) propose('yes', 'details', `your answer: ${shown(mine)}`);
    else if (!mine) plan.note = NOT_IN_PROFILE;
    return plan;
  }
  let quiet = false;
  // The user's details first (never for open questions), then answers they gave before.
  if (purpose && purpose !== 'question') {
    let raw = derived(purpose, f, a, opts.company ?? '', opts.jobLocation);
    // A saved start date that has gone by would tell the employer you start in the past.
    if (purpose === 'start_date' && startHasPassed(raw)) {
      plan.note = `your saved start date (${raw}) has passed: update it in Wera`;
      raw = '';
    }
    // A city picker lists every Dallas: search with the state to pick the right one.
    if (purpose === 'city' && raw && a.state && (f.kind === 'combobox' || f.kind === 'listbox')) raw = `${raw}, ${a.state}`;
    // A state list may want the name ("Texas") where the details have the code.
    if (purpose === 'state' && raw && CHOICE.has(f.kind)) raw = [raw, stateName(raw)].join(' || ');
    // Typed into a box, a yes/no answer reads as a person writes it.
    const v = (f.kind === 'text' || f.kind === 'textarea') && /^(yes|no)$/.test(raw) ? raw[0]!.toUpperCase() + raw.slice(1) : raw;
    if (v) {
      const fit = asOption(f, v, purpose);
      if (fit != null) {
        propose(fit, 'details');
        return plan;
      }
      plan.note = `no option matches "${shown(v)}"`;
    }
    // Wera couldn't work it out from the question: no note, so the AI may answer it.
    if (!v && (DERIVED.has(purpose) || (WORK_RIGHTS.has(purpose) && abroad(f, a, opts.jobLocation)))) quiet = true;
  }
  if (!SELF_ID.has(purpose as FieldPurpose)) {
    const hit = bestAnswer(opts.answers ?? [], f.label, 0.75, opts.company ?? '');
    // An earlier form's start date is as stale as a saved one.
    if (hit && !(/\bstart|availab/i.test(f.label) && startHasPassed(hit.answer))) {
      const fit = asOption(f, hit.answer, purpose);
      if (fit != null) {
        propose(fit, 'saved', 'your earlier answer');
        return plan;
      }
    }
  }
  if (!plan.note && !quiet) {
    plan.note = purpose === 'question' ? 'draft it, or write your own'
      : purpose && SELF_ID.has(purpose) ? NOT_IN_PROFILE
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

/** The street, city, state and code on one line ("123 Main St, Apt 4, Dallas, TX 75201"). */
export function fullAddress(a: Applicant): string {
  const cityLine = [a.city, [a.state, a.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.address, a.address_line2, cityLine].filter(Boolean).join(', ');
}

/** A form with one address box and no city, state or code boxes wants the whole address in it. */
function wholeAddress(fields: FieldPlan[], a: Applicant) {
  if (fields.some((f) => f.purpose === 'city' || f.purpose === 'state' || f.purpose === 'postal_code' || f.purpose === 'address_line2')) return;
  for (const f of fields) {
    if (f.purpose === 'address' && f.source === 'details' && (f.kind === 'text' || f.kind === 'textarea') && a.address) f.value = fullAddress(a);
  }
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
  const found: Trap[] = [];
  const all = collectFields(root, found);
  const placed = placeFields(all);
  const fields = all.map((f) => planField(f, a, opts, placed.get(f.id))).filter((p) => p.purpose !== null || p.label !== '' || p.required);
  wholeAddress(fields, a);
  const doc = root instanceof Document ? root : (root as Node).ownerDocument;
  const site = doc ? siteFor(doc) : null;
  const traps = uniqueTraps([...found, ...all.flatMap((f) => [...(f.said ?? []), ...(f.trap ? [f.trap] : [])])]);
  return {
    fields, next: findNext(root), errors: invalidCount(root), adders: adders(root, fields, a),
    site: site?.name, step: (doc && site?.step?.(doc)) || undefined, gate: (doc && site?.gate?.(doc)) || undefined,
    ...(traps.length ? { traps } : {}),
  };
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
  const doc = root instanceof Document ? root : (root as Node).ownerDocument;
  // Some sites need time between fields to keep up (Workday re-renders after each one).
  const pace = Math.max(opts.pace ?? 0, (doc && siteFor(doc)?.pace) || 0);
  const out: FillResult[] = [];
  for (const item of items) {
    // A field the page re-rendered since it was read has lost Wera's mark: find it by its label and kind.
    let f = fields.get(item.id) ?? null;
    if ((!f || !f.el.isConnected) && item.label) {
      const again = collectFields(root).filter((x) => x.label.slice(0, 200) === item.label && (!item.kind || x.kind === item.kind));
      if (again.length === 1) f = again[0]!;
    }
    const purpose = f ? classify(f) : null;
    const res: FillResult = { id: item.id, label: f?.label.slice(0, 160) ?? '', purpose, status: 'review', required: f?.required ?? false };
    try {
      if (!f || !f.el.isConnected) {
        res.note = 'this field is no longer on the page';
      } else if (f.trap) {
        // Nothing fills these, whatever was asked.
        res.note = trapMeaning(f.trap.kind);
      } else if (purpose === 'consent') {
        res.note = 'agree yourself after reading it';
      } else if (item.value === RESUME) {
        if (opts.resume && f.kind === 'file') {
          attachFile(f.el as HTMLInputElement, base64ToFile(opts.resume.base64, opts.resume.name));
          res.status = 'filled';
          res.value = opts.resume.name;
          // Some systems read the resume and fill the form from it: let that finish first.
          const reads = doc ? siteFor(doc)?.readsResume : 0;
          if (reads) await wait(reads);
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
        // The site's own widgets (Workday's dropdowns and prompts) are filled its way.
        const own = siteFiller(f.el.ownerDocument);
        const got = own ? await own(f, purpose, item.value.trim()) : undefined;
        if (got === undefined) await enterValue(f, purpose, item.value.trim(), res, true);
        else if (got) {
          res.status = 'filled';
          res.value = got;
        } else {
          res.note = `pick "${item.value.trim()}" yourself: the page did not take it`;
        }
      } else {
        res.status = 'skipped';
      }
    } catch (e) {
      log.error('fill', `"${res.label}" failed`, e);
      res.status = 'review';
      res.note = `Wera hit a problem filling this one (${e instanceof Error ? e.message : String(e)}): fill it yourself`;
    }
    if (f && res.status === 'filled') mark(f.el, 'filled');
    else if (f && res.status === 'review') mark(f.el, 'review');
    out.push(res);
    opts.onProgress?.(res);
    if (pace) await wait(pace);
  }
  // Filling moves the focus from box to box: none is left in the last one, where Wera's button would show.
  if (doc?.activeElement instanceof HTMLElement && out.length) doc.activeElement.blur();
  return out;
}

/** Every field's value as the user left it, to learn answers from (a one-time code or a check is never an answer to keep). */
export function snapshot(root: ParentNode): FieldSnapshot[] {
  return collectFields(root)
    .filter((f) => f.kind !== 'file' && !f.trap)
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
