// Workday. Every field sits in a wrapper named for what it is
// (data-automation-id="formField-legalNameSection_firstName"; newer
// tenants use ids like "name--legalName--firstName" or
// "workExperience-3--jobTitle"), so Wera reads the meaning from the name
// rather than the label. Steps show in a progress bar; the way forward is
// a footer button; some steps want a Workday account first.
import type { FieldPurpose } from '../../shared/types';
import type { Field } from '../fields';
import type { Site, Step } from './index';

const HOST = /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/i;

/** Automation ids that name a widget part, not the field (the field's name is on its wrapper). */
const PART = /^(searchBox|dateSection(Month|Day|Year)-input|file-upload-input-ref|selectinput|textInputBox|checkboxPanel|radioBtn)$/i;

/** The field's own name in Workday's words, lowercased: its id path, else its wrapper's name. */
export function workdayKey(el: HTMLElement): string {
  const own = el.getAttribute('data-automation-id') ?? '';
  const keys: string[] = [];
  if (el.id && /--|_/.test(el.id)) keys.push(el.id);
  if (own && !PART.test(own)) keys.push(own);
  const wrap = el.closest('[data-automation-id^="formField-"]')?.getAttribute('data-automation-id')?.slice('formField-'.length);
  if (wrap) keys.push(wrap);
  if (own === 'file-upload-input-ref') keys.push('resume');
  return keys.join(' ').toLowerCase();
}

// Workday's field names and what they hold. Tested on the name's last part
// ("…--firstName", "…_firstName", "firstName"), in this order.
// A function decides by the block the field sits in (undefined: the general rules decide; null: leave it).
const NAMES: [RegExp, FieldPurpose | ((f: Field) => FieldPurpose | null | undefined)][] = [
  [/preferredname[\w-]*firstname/, 'preferred_name'],
  [/firstname\b/, 'first_name'],
  [/middlename\b/, 'middle_name'],
  [/lastname\b/, 'last_name'],
  [/addressline1\b/, 'address'],
  [/addressline2\b/, 'address_line2'],
  [/countryregion\b/, 'state'],
  [/postalcode\b/, 'postal_code'],
  [/countryphonecode\b|country-phone-code\b/, 'phone_code'],
  [/phonetype\b|phone-device-type\b|devicetype\b/, 'phone_type'],
  // Before the number: the extension sits under phoneNumber too ("phoneNumber--extension").
  [/phone-?extension\b|(^|[-_])extension\b/, () => null],
  [/phone-?number\b/, 'phone'],
  [/emailaddress\b|(^|[\s_-])email\b/, 'email'],
  [/(^|[\s_-])source(prompt)?\b/, 'how_heard'],
  [/linkedin/, 'linkedin'],
  [/(^|[\s_-])skills\b/, 'skills'],
  [/resume|attachments\b/, 'resume'],
  [/hispanicorlatino\b/, 'hispanic'],
  [/ethnicity/, 'race'],
  [/veteranstatus\b/, 'veteran'],
  [/disabilitystatus\b|(^|[\s_-])disability\b/, 'disability'],
  [/(^|[\s_-])gender\b/, 'gender'],
  [/datesignedon\b|todaysdate\b/, 'today'],
  [/selfidentifieddisabilitydata--name\b/, 'full_name'],
  // A job block (Work Experience N).
  [/jobtitle\b/, 'exp_title'],
  [/(^|[\s_-])company(name)?\b/, 'exp_company'],
  [/currentlyworkhere\b/, 'exp_current'],
  [/roledescription\b/, 'exp_description'],
  // A school block (Education N).
  [/(^|[\s_-])school(name)?\b|school-name\b/, 'edu_school'],
  [/(^|[\s_-])degree\b/, 'edu_degree'],
  [/fieldofstudy\b|field-of-study\b/, 'edu_major'],
  [/(^|[\s_-])gpa\b|gradeaverage\b/, 'edu_gpa'],
  [/firstyearattended\b/, 'edu_start'],
  [/lastyearattended\b/, 'edu_end'],
  // Names whose meaning depends on the block they sit in.
  [/(^|[\s_-])startdate\b/, (f) => (f.section === 'education' ? 'edu_start' : f.section === 'experience' ? 'exp_start' : undefined)],
  [/(^|[\s_-])enddate\b/, (f) => (f.section === 'education' ? 'edu_end' : f.section === 'experience' ? 'exp_end' : undefined)],
  [/(^|[\s_-])description\b/, (f) => (f.section === 'experience' ? 'exp_description' : undefined)],
  [/(^|[\s_-])location\b/, (f) => (f.section === 'experience' ? 'exp_location' : undefined)],
  [/(^|[\s_-])(country|countrydropdown)\b|address(section)?[-_]+country\b|country--country\b/, 'country'],
  [/(^|[\s_-])city\b/, 'city'],
  [/(^|[\s_-])(url|website|webaddress)\b/, 'portfolio'],
];

function purpose(f: Field): FieldPurpose | null | undefined {
  const key = workdayKey(f.el);
  if (!key) return undefined;
  for (const [re, p] of NAMES) if (re.test(key)) return typeof p === 'function' ? p(f) : p;
  return undefined;
}

const NEXT_IDS = ['pageFooterNextButton', 'bottom-navigation-next-button', 'bottom-navigation-save-continue', 'wd-CommandButton_next'];

function next(doc: Document): HTMLElement | null {
  for (const id of NEXT_IDS) {
    const b = doc.querySelector<HTMLElement>(`[data-automation-id="${id}"]`);
    if (b && !/submit/i.test(b.textContent ?? '')) return b;
  }
  return null;
}

function step(doc: Document): Step | null {
  const active = doc.querySelector('[data-automation-id="progressBarActiveStep"]');
  if (!active) return null;
  const bar = active.closest('[data-automation-id="progressBar"]') ?? active.parentElement;
  const all = bar ? [...bar.querySelectorAll('[data-automation-id^="progressBar"][data-automation-id$="Step"]')] : [active];
  const steps = all.length ? all : [active];
  // "current step 2 of 6 My Experience": the step's own words are the last part.
  const text = (active.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/^current step \d+ of \d+\s*/i, '');
  return { name: text, index: Math.max(0, steps.indexOf(active)) + 1, total: steps.length };
}

function gate(doc: Document): string | null {
  const q = (id: string) => doc.querySelector(`[data-automation-id="${id}"]`);
  if (q('createAccountSubmitButton')) return 'Workday wants an account for this company. Create one here (Wera fills your email; pick a password), then press Autofill on the next page.';
  if (q('signInSubmitButton') || q('signInContent')) return 'Sign in to your Workday account for this company, then press Autofill on the application.';
  if (q('applyManually') || q('autofillWithResume')) return 'Choose "Apply Manually" (or "Autofill with Resume"): Wera fills the application on the next page.';
  return null;
}

export const workday: Site = {
  name: 'Workday',
  matches: (doc) => HOST.test(doc.location?.hostname ?? '') || !!doc.querySelector('[data-automation-id="applyFlowPage"], [data-automation-id^="formField-"]'),
  purpose,
  next,
  step,
  gate,
  // Workday re-renders after each choice and loses input typed too soon.
  pace: 120,
};
