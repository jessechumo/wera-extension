// The values Wera enters, from the user's details: one detail as it is,
// or worked out (a full name, a location with fallbacks for lists,
// whether the user worked for this company before), and shaped for the
// field that takes it (dates for a date box, digits for a number box).
import type { Applicant, FieldPurpose, Profile } from '../shared/types';
import { ENTRY_PURPOSES } from './entries';
import { norm, stateName, US_NAMES } from './places';

/**
 * Values to try in turn, best first: "Dallas, TX || Texas || United
 * States" fits a city box, a list of states or a list of countries.
 * A text box takes the first.
 */
export const OR = ' || ';
export const alternatives = (value: string) => value.split(OR).map((v) => v.trim()).filter(Boolean);
export const firstChoice = (value: string) => alternatives(value)[0] ?? '';

/** The choices a multi-select takes from value: " | " between them, or commas for lists (languages, skills). */
export function choicesOf(value: string, purpose: FieldPurpose | null): string[] {
  const sep = purpose === 'languages' || purpose === 'skills' ? /\s*[|,;]\s*/ : /\s*\|\s*/;
  return firstChoice(value).split(sep).filter(Boolean);
}

const LGBTQ_ORIENTATION = /gay|lesbian|bisexual|asexual|pansexual|queer/i;

/** Extra context for derived answers: the company the application is for. */
export interface ValueContext {
  company?: string;
}

/** The company's telling words, to compare employers ("Acme, Inc." is "Acme"). */
const companyKey = (s: string) => norm(s).replace(/\b(inc|llc|ltd|co|corp|corporation|company|group|technologies|labs|the)\b/g, '').replace(/\s+/g, ' ').trim();

/**
 * The value Wera would enter for a purpose, from the applicant details
 * (a job or school block's fields are planned per block). Some are
 * worked out: a full name, a location with fallbacks for lists, whether
 * the user worked for this company before (from their resume).
 */
export function valueFor(p: FieldPurpose, a: Applicant | Profile, ctx: ValueContext = {}): string {
  if (ENTRY_PURPOSES.has(p)) return '';
  switch (p) {
    case 'skills':
      return ((a as Profile).skills ?? []).slice(0, 25).join(', ');
    case 'phone_type':
      return a.phone ? 'Mobile' : '';
    case 'phone_code':
      return a.phone ? a.country || 'United States' : '';
    case 'full_name':
      return [a.first_name, a.last_name].filter(Boolean).join(' ');
    case 'preferred_name':
      return a.preferred_name || a.first_name;
    case 'location': {
      // A place box takes "Dallas, TX"; a list may only have the state, or the country.
      const place = [a.city, a.state, a.country && !US_NAMES.includes(norm(a.country)) ? a.country : ''].filter(Boolean).join(', ');
      const state = a.state ? stateName(a.state) : '';
      return [...new Set([place, state, a.country].filter(Boolean))].join(OR);
    }
    case 'previously_employed': {
      const here = ctx.company ? companyKey(ctx.company) : '';
      const jobs = (a as Profile).experience;
      if (!here || !jobs) return '';
      return jobs.some((x) => companyKey(x.company) === here) ? 'yes' : 'no';
    }
    case 'lgbtq': {
      const o = a.sexual_orientation ?? '';
      const t = a.transgender ?? '';
      if (o === 'decline' || t === 'decline') return 'decline';
      if (LGBTQ_ORIENTATION.test(o) || t === 'yes') return 'yes';
      return o && t !== 'yes' ? 'no' : '';
    }
    case 'race':
      // One list for race and ethnicity (Lever, Workday): "Hispanic or Latino" is the answer for a Hispanic user.
      return a.hispanic === 'yes' && a.race !== 'decline' ? ['Hispanic or Latino', a.race].filter(Boolean).join(OR) : a.race;
    case 'referral':
      return '';
    case 'authorized_no_sponsorship':
      if (!a.authorized_to_work || !a.needs_sponsorship) return '';
      return a.authorized_to_work === 'yes' && a.needs_sponsorship === 'no' ? 'yes' : 'no';
    case 'today': {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    case 'resume':
    case 'cover_letter':
    case 'question':
    case 'consent':
      return '';
    default:
      return a[p as keyof Applicant] ?? '';
  }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A date in the value ("2026-11-01", "11/01/2026", "November 1, 2026"), or null ("Immediately", "2 weeks"). */
export function parseDate(value: string): Date | null {
  const t = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/i.exec(t);
  const month = m ? MONTHS.findIndex((x) => x.startsWith(m[1]!.toLowerCase().slice(0, 3))) : -1;
  if (m && month >= 0) return new Date(Number(m[3]), month, Number(m[2]));
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The value in the shape the field takes: ISO dates for date inputs, the
 * placeholder's order for "MM/DD/YYYY" boxes, digits for number inputs
 * ("$120k" becomes 120000). Null when it cannot be entered there.
 */
export function formatFor(el: HTMLInputElement | HTMLTextAreaElement, value: string, purpose: FieldPurpose | null): string | null {
  // A job's or school's dates were shaped for this box when planned.
  if (purpose && ENTRY_PURPOSES.has(purpose)) return value;
  const type = el instanceof HTMLInputElement ? el.type : 'textarea';
  if (type === 'date' || type === 'month') {
    const d = parseDate(value);
    if (!d) return null;
    return type === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (type === 'number') {
    const m = /(\d[\d,]*(?:\.\d+)?)\s*(k)?/i.exec(value);
    if (!m) return null;
    const n = Number(m[1]!.replace(/,/g, '')) * (m[2] ? 1000 : 1);
    return Number.isFinite(n) ? String(n) : null;
  }
  if (purpose === 'start_date' || purpose === 'graduation_year' || purpose === 'today') {
    const ph = (el.getAttribute('placeholder') ?? '').toLowerCase();
    const d = /\b(mm|dd)\b.*\byyyy\b/.test(ph) ? parseDate(value) : null;
    if (d) return ph.indexOf('dd') < ph.indexOf('mm') ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }
  return value;
}
