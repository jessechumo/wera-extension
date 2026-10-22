// Repeating sections of an application: "Work Experience" and
// "Education", one block of fields per job or school (Workday, iCIMS,
// Greenhouse's education, SuccessFactors...). Works out which section a
// field is in, what it asks within its block, which block it is (the
// first job, the second...), and the value from the resume's jobs and
// schools, shaped the way the field takes it.
import type { EntryPurpose, FieldPurpose, Profile } from '../shared/types';
import type { Field } from './fields';

export type Section = 'experience' | 'education';

const EXP_ATTR = /work.?experience|workhistory|employment|experience|jobhistory|previous.?employ/i;
const EDU_ATTR = /education|school|academic/i;
const EXP_HEAD = /^(my )?(work|professional|employment|job|relevant)? ?(experience|history|employment)s?\b|^employment|^work history|^previous employ|^employer/i;
const EDU_HEAD = /^(my )?education|^schools?\b|^academic|^degrees?\b|^educational background/i;
const HEADINGS = 'h1, h2, h3, h4, h5, h6, legend, [role="heading"]';

function headingText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** The section a field sits in, from its blocks' ids (Workday's "workExperience-3") or the nearest heading above it. */
export function sectionOf(el: HTMLElement): Section | null {
  let n: Element | null = el.parentElement;
  for (let depth = 0; n && depth < 12; depth++, n = n.parentElement) {
    const attrs = `${n.id} ${n.getAttribute('data-automation-id') ?? ''} ${n.getAttribute('data-section') ?? ''} ${n.getAttribute('name') ?? ''}`;
    if (EDU_ATTR.test(attrs)) return 'education';
    if (EXP_ATTR.test(attrs) && !/years/i.test(attrs)) return 'experience';
    // The nearest heading decides: one that opens this block, or one just before it.
    const own = n.querySelector(':scope > ' + HEADINGS.split(', ').join(', :scope > '));
    const h = own ?? siblingsBefore(n)[0];
    if (h) {
      const t = headingText(h);
      return EDU_HEAD.test(t) ? 'education' : EXP_HEAD.test(t) ? 'experience' : null;
    }
    if (n.tagName === 'FORM' || n.tagName === 'BODY') break;
  }
  return null;
}

/** Headings right before el at its level (up to three siblings back). */
function siblingsBefore(el: Element): Element[] {
  const out: Element[] = [];
  let s = el.previousElementSibling;
  for (let i = 0; s && i < 3; i++, s = s.previousElementSibling) {
    if (s.matches(HEADINGS)) out.push(s);
    else {
      const inner = s.querySelector(HEADINGS);
      if (inner && s.querySelectorAll('input, select, textarea').length === 0) out.push(inner);
      if (s.querySelector('input, select, textarea')) break; // another field block: stop
    }
  }
  return out;
}

/** Which part of a date a box takes when it takes only one ("MM", "Year"). */
export function datePart(f: Field): 'month' | 'year' | null {
  const el = f.el;
  const own = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''} ${f.hints} ${f.label}`.toLowerCase();
  if (/month/.test(own) || /^\s*mm\s*$/i.test(el.getAttribute('placeholder') ?? '')) return 'month';
  if (/\byear\b|dateSectionYear/i.test(own) || /^\s*yyyy\s*$/i.test(el.getAttribute('placeholder') ?? '')) return /mm|month/.test(own) ? null : 'year';
  return null;
}

const DATE_LABEL = /\b(date|from|to|start|end|began|until|month|year|mm|yyyy|graduat|attended|completion|completed)\b/i;
const END = /\b(to|end|until|left|graduat\w*|completion|completed|finish)\b/i;
const START = /\b(from|start|began|beginning|started)\b/i;

/** What a field in a job or school block asks; null when it is not one of a block's usual fields. */
export function entryPurpose(f: Field, section: Section): EntryPurpose | null {
  const text = `${f.label} ${f.hints}`.toLowerCase();
  const isDate = f.inputType === 'date' || f.inputType === 'month' || DATE_LABEL.test(text) || datePart(f) != null;
  if (section === 'experience') {
    if (f.kind === 'checkbox') return /current|present|i work here|still work|currently/.test(text) ? 'exp_current' : null;
    if (/\b(job |position |role )?title\b|\bposition\b|\brole\b(?! description)/.test(text) && !/description|responsib/.test(text)) return 'exp_title';
    if (/company|employer|organi[sz]ation|business name/.test(text)) return 'exp_company';
    if (/description|responsibilit|duties|summary|accomplish|what did you do/.test(text) || f.kind === 'textarea') return 'exp_description';
    if (isDate) return END.test(text) && !START.test(text) ? 'exp_end' : 'exp_start';
    if (/location|city|where/.test(text)) return 'exp_location';
    return null;
  }
  if (/school|university|college|institution/.test(text)) return 'edu_school';
  if (/field of study|major|discipline|concentration|area of study|program|specialization/.test(text)) return 'edu_major';
  if (/\bdegree\b|qualification|level of education/.test(text)) return 'edu_degree';
  if (/\bgpa\b|grade point|overall result|grade\b/.test(text)) return 'edu_gpa';
  if (isDate) return END.test(text) && !START.test(text) ? 'edu_end' : 'edu_start';
  return null;
}

export const ENTRY_PURPOSES = new Set<FieldPurpose>(['exp_title', 'exp_company', 'exp_location', 'exp_start', 'exp_end', 'exp_current', 'exp_description', 'edu_school', 'edu_degree', 'edu_major', 'edu_start', 'edu_end', 'edu_gpa']);

export interface Placed {
  purpose: EntryPurpose;
  /** 0 for the first job (or school) block on the page. */
  entry: number;
}

/**
 * Numbers the blocks: a field that asks again what its block already
 * asked (a second "Job title") starts the next block. A start date seen
 * twice in a block without an end date between is that block's end
 * (forms that label both "Month" and "Year").
 */
export function placeEntries(fields: { id: string; purpose: FieldPurpose | null; part: 'month' | 'year' | null }[]): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const state: Record<Section, { entry: number; seen: Set<string> }> = { experience: { entry: -1, seen: new Set() }, education: { entry: -1, seen: new Set() } };
  for (const f of fields) {
    if (!f.purpose || !ENTRY_PURPOSES.has(f.purpose)) continue;
    const section: Section = f.purpose.startsWith('exp_') ? 'experience' : 'education';
    const st = state[section];
    let purpose = f.purpose as EntryPurpose;
    const key = (p: string) => `${p}:${f.part ?? ''}`;
    if (st.entry < 0) st.entry = 0;
    if ((purpose === 'exp_start' || purpose === 'edu_start') && st.seen.has(key(purpose))) {
      const end = (section === 'experience' ? 'exp_end' : 'edu_end') as EntryPurpose;
      if (!st.seen.has(key(end))) purpose = end;
    }
    if (st.seen.has(key(purpose))) {
      st.entry++;
      st.seen = new Set();
    }
    st.seen.add(key(purpose));
    out.set(f.id, { purpose, entry: st.entry });
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A resume date ("2022-01" or "2022") shaped for the field: the month or
 * year alone for split boxes, ISO for date inputs, the placeholder's
 * order for typed ones ("MM/YYYY", "MM/DD/YYYY"), else "MM/YYYY".
 */
export function shapeDate(f: Field, ym: string | undefined): string {
  if (!ym || !/^\d{4}(-\d{2})?$/.test(ym)) return '';
  const year = ym.slice(0, 4);
  const month = ym.length === 7 ? Number(ym.slice(5, 7)) : 0;
  const part = datePart(f);
  if (part === 'year') return year;
  if (part === 'month') {
    if (!month) return '';
    return f.kind === 'select' || f.kind === 'listbox' || f.kind === 'combobox' ? MONTHS[month - 1]! : pad(month);
  }
  if (f.kind === 'select' || f.kind === 'listbox' || f.kind === 'combobox') return month ? `${MONTHS[month - 1]} ${year}` : year;
  const el = f.el as HTMLInputElement;
  if (el.type === 'month') return `${year}-${pad(month || 1)}`;
  if (el.type === 'date') return `${year}-${pad(month || 1)}-01`;
  const ph = (el.getAttribute('placeholder') ?? '').toLowerCase();
  if (/^\s*yyyy\s*$/.test(ph)) return year;
  if (/yyyy[-/.]mm/.test(ph)) return `${year}-${pad(month || 1)}`;
  if (/mm[-/.]dd[-/.]yyyy/.test(ph)) return `${pad(month || 1)}/01/${year}`;
  if (/dd[-/.]mm[-/.]yyyy/.test(ph)) return `01/${pad(month || 1)}/${year}`;
  if (/month/.test(ph) || /[a-z]{3} yyyy/.test(ph)) return month ? `${MONTHS[month - 1]} ${year}` : year;
  return month ? `${pad(month)}/${year}` : year;
}

const LEVEL_WORDS: Record<string, string> = {
  high_school: 'High School', associate: "Associate's Degree", bachelor: "Bachelor's Degree", master: "Master's Degree", doctorate: 'Doctorate',
};

/** The value for one field of a job or school block, from the profile; '' when the resume does not say. */
export function entryValue(f: Field, placed: Placed, p: Profile): string {
  if (placed.purpose.startsWith('exp_')) {
    const x = p.experience?.[placed.entry];
    if (!x) return '';
    switch (placed.purpose) {
      case 'exp_title': return x.title;
      case 'exp_company': return x.company;
      case 'exp_location': return x.location ?? '';
      case 'exp_start': return shapeDate(f, x.start);
      case 'exp_end': return x.current ? '' : shapeDate(f, x.end);
      case 'exp_current': return x.current ? 'yes' : '';
      case 'exp_description': return x.description ?? '';
      default: return '';
    }
  }
  const e = p.education?.[placed.entry];
  if (!e) return '';
  switch (placed.purpose) {
    case 'edu_school': return e.school;
    case 'edu_degree':
      // A dropdown of levels takes the level; a text box the degree as written.
      return f.kind === 'text' || f.kind === 'textarea' ? (e.degree || LEVEL_WORDS[e.level ?? ''] || '') : (LEVEL_WORDS[e.level ?? ''] || e.degree || '');
    case 'edu_major': return e.major ?? '';
    case 'edu_gpa': return e.gpa ?? '';
    case 'edu_start': return shapeDate(f, e.start);
    case 'edu_end': return shapeDate(f, e.end);
    default: return '';
  }
}

const ADD_EXP = /^\+?\s*add( another| more| an?)?( work| job| employment)?( experience| history| position| employer| job)s?\b/i;
const ADD_EDU = /^\+?\s*add( another| more| an?)?( education| school| degree| institution)s?\b/i;
const ADD_BARE = /^\+?\s*add( another| more| new)?\s*$/i;

/** The button that adds another job (or school) block, when the page has one. */
export function findAdder(root: ParentNode, section: Section): HTMLElement | null {
  const buttons = [...root.querySelectorAll<HTMLElement>('button, [role="button"], a')].filter((b) => {
    const style = b.ownerDocument.defaultView?.getComputedStyle(b);
    return !(b as HTMLButtonElement).disabled && style?.display !== 'none' && style?.visibility !== 'hidden';
  });
  const re = section === 'experience' ? ADD_EXP : ADD_EDU;
  for (const b of buttons) {
    const text = `${b.getAttribute('aria-label') ?? ''}`.trim() || (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (re.test(text) || re.test((b.textContent ?? '').replace(/\s+/g, ' ').trim())) return b;
  }
  // A bare "Add" under the section's heading (Workday).
  for (const b of buttons) {
    const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (ADD_BARE.test(text) && sectionOf(b) === section) return b;
  }
  return null;
}
