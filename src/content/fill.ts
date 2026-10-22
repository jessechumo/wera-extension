import type { Applicant, FieldPurpose, FillResult, Profile } from '../shared/types';
import { ENTRY_PURPOSES } from './entries';
import { classify } from './classify';
import { collectFields, isHidden, isPressed, listboxValue, scopeOf, type Field, type Option } from './fields';

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const US_NAMES = ['united states', 'united states of america', 'usa', 'us', 'u.s.', 'u.s.a.'];
const DECLINE = /decline|prefer not|don.?t wish|do not wish|do not want|don.?t want|wish not|not to (say|answer|disclose|identify|self-identify)|rather not|choose not|not declared|no answer|not specified|undisclosed/;

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

/** The value Wera would enter for a purpose, from the applicant details (a job or school block's fields are planned per block). */
export function valueFor(p: FieldPurpose, a: Applicant | Profile): string {
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
    case 'location':
      return [a.city, a.state, a.country && !US_NAMES.includes(norm(a.country)) ? a.country : ''].filter(Boolean).join(', ');
    case 'authorized_no_sponsorship':
      if (!a.authorized_to_work || !a.needs_sponsorship) return '';
      return a.authorized_to_work === 'yes' && a.needs_sponsorship === 'no' ? 'yes' : 'no';
    case 'resume':
    case 'cover_letter':
    case 'question':
    case 'consent':
      return '';
    default:
      return a[p as keyof Applicant] ?? '';
  }
}

// What the details' self-identification and education answers mean, as forms word them.
const MEANINGS: Partial<Record<FieldPurpose, [RegExp, RegExp][]>> = {
  gender: [
    [/^(male|man|m)$/, /^(male|man|men|cis ?(gender )?(male|man))\b|\bhe ?\/ ?him/],
    [/^(female|woman|f)$/, /^(female|woman|women|cis ?(gender )?(female|woman))\b|\bshe ?\/ ?her/],
    [/non.?binary|genderqueer|gender non/, /non.?binary|genderqueer|gender ?non|gender ?fluid|gender ?expansive/],
  ],
  sexual_orientation: [
    [/heterosexual|straight/, /heterosexual|straight/],
    [/gay|lesbian|homosexual/, /gay|lesbian|homosexual/],
    [/bisexual/, /bisexual/],
    [/asexual/, /asexual/],
    [/pansexual/, /pansexual/],
    [/queer/, /queer/],
  ],
  race: [
    [/black|african/, /black|african american/],
    [/^white/, /^white|caucasian/],
    [/^asian/, /^asian/],
    [/american indian|alaska/, /american indian|alaska(n)? native|native american|indigenous/],
    [/hawaiian|pacific/, /hawaiian|pacific islander/],
    [/two or more|multi/, /two or more|multi.?racial|multiple races|mixed/],
    [/hispanic|latin/, /hispanic|latin[oaxe]/],
  ],
  veteran: [
    [/not a protected veteran|not a veteran|^no$/, /not a (protected )?veteran|i am not|^no\b|not protected/],
    [/protected veteran|^yes$/, /^(i identify as|i am a|yes)\b.*veteran|^yes\b|identify as one or more|protected veteran(?!.*not)/],
  ],
  disability: [
    [/^no\b|do not have|don.?t have/, /^no\b|do not have|don.?t have|not have a disab/],
    [/^yes\b|have a disab/, /^yes\b|i have a disab|have (or have )?had a disab/],
  ],
};

const LEVELS: [string, RegExp][] = [
  ['doctorate', /\b(ph\.? ?d|doctor|doctorate|doctoral|d\.?phil|ed\.?d|j\.?d|m\.?d)\b/],
  ['master', /\b(master|masters|m\.? ?s\.?c?|m\.? ?a|mba|m\.?eng|meng|msn|mph|mfa|graduate degree)\b/],
  ['bachelor', /\b(bachelor|bachelors|b\.? ?s\.?c?|b\.? ?a|bba|b\.?eng|beng|bsn|b\.?tech|undergraduate|4.year)\b/],
  ['associate', /\b(associate|associates|a\.? ?s|a\.? ?a|adn|2.year)\b/],
  ['high_school', /high school|secondary|ged|diploma/],
];

/** A degree's level ("B.S. in Biology" is bachelor), '' when unclear. */
export function degreeLevel(text: string): string {
  const t = text.toLowerCase().replace(/[’']/g, '');
  return LEVELS.find(([, re]) => re.test(t))?.[0] ?? '';
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A month's number (1-12) in "March", "Mar", "03" or "3"; 0 when it is not a month. */
function monthOf(s: string): number {
  const t = s.trim().toLowerCase();
  if (/^(0?[1-9]|1[0-2])$/.test(t)) return Number(t);
  const i = MONTH_NAMES.findIndex((m) => t.length >= 3 && (m === t || m.startsWith(t.slice(0, 3)) && /^[a-z]+\.?$/.test(t)));
  return i + 1;
}

/** The option whose range ("3-5 years", "5+", "Less than 1 year") holds the number in value. */
function rangeOption(options: Option[], value: string): Option | null {
  const n = Number(/\d+(\.\d+)?/.exec(value)?.[0] ?? NaN);
  if (!Number.isFinite(n)) return null;
  for (const o of options) {
    const t = o.label.toLowerCase();
    const nums = (t.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    if (!nums.length) continue;
    if (/less than|under|fewer than|<|up to/.test(t) && n < nums[0]!) return o;
    if (/\+|or more|more than|over|above|at least|>|plus/.test(t) && nums.length === 1 && n >= nums[0]!) return o;
    if (nums.length >= 2 && n >= nums[0]! && n <= nums[1]!) return o;
    if (nums.length === 1 && n === nums[0] && !/less|under|more|over|\+/.test(t)) return o;
  }
  // Between ranges ("2.5" with "1-2" and "3-5"): the nearest lower one.
  return null;
}

/** The option for the same place: its city first, then the state by code or name ("Dallas, TX" is "Dallas, Texas, United States"). */
function samePlace(real: Option[], value: string): Option | null {
  const [city = '', state = ''] = value.split(',').map((p) => p.trim());
  if (!city) return null;
  const c = norm(city);
  const code = state.toUpperCase();
  const names = [norm(state), US_STATES[code] ? norm(US_STATES[code]) : '', code.length === 2 ? code.toLowerCase() : ''].filter(Boolean);
  const inCity = real.filter((o) => norm(o.label) === c || norm(o.label).startsWith(`${c} `));
  if (!names.length) return inCity[0] ?? null;
  return inCity.find((o) => {
    const rest = ` ${norm(o.label).slice(c.length)} `;
    return names.some((n) => rest.includes(` ${n} `));
  }) ?? null;
}

// Lists of names (schools, majors, employers) word the same name differently: "The University of Texas at Dallas".
const NAMED = new Set<FieldPurpose>(['school', 'edu_school', 'major', 'edu_major', 'current_company', 'exp_company', 'how_heard']);
const FILLER = new Set(['the', 'of', 'at', 'in', 'and', 'for', 'a', 'an', 'university', 'college', 'school', 'institute', 'inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company']);
const nameWords = (s: string) => norm(s).replace(/\+/g, ' ').split(' ').filter((w) => w.length > 1 && !FILLER.has(w));

/** The option naming the same thing: every telling word of value, and the fewest others (none when two tie). */
function sameName(real: Option[], value: string): Option | null {
  const want = nameWords(value);
  if (!want.length) return null;
  let best: Option | null = null;
  let bestExtra = Infinity;
  let tie = false;
  for (const o of real) {
    const words = nameWords(o.label);
    if (!want.every((w) => words.includes(w))) continue;
    const extra = words.length - want.length;
    if (extra > 2) continue;
    if (extra < bestExtra) {
      best = o;
      bestExtra = extra;
      tie = false;
    } else if (extra === bestExtra) tie = true;
  }
  return tie ? null : best;
}

/** The option that means value by sense rather than wording (self-identification, degrees, months, ranges). */
function meaningOption(real: Option[], value: string, purpose: FieldPurpose | null): Option | null {
  const v = value.toLowerCase();
  let answers = real.filter((o) => !DECLINE.test(o.label.toLowerCase()));
  const rules = purpose ? MEANINGS[purpose] : undefined;
  // "I am a protected veteran" is never "I am not a protected veteran".
  if (rules && !NEGATED.test(norm(value))) answers = answers.filter((o) => !NEGATED.test(norm(o.label)) || purpose === 'race' || purpose === 'gender');
  if (rules) {
    for (const [isValue, isOption] of rules) {
      if (!isValue.test(v)) continue;
      // The first meaning the value has is the only one: "I am not a protected veteran"
      // must never fall through to the option for "protected veteran".
      return answers.find((o) => isOption.test(o.label.toLowerCase().trim())) ?? null;
    }
  }
  if (purpose === 'degree' || purpose === 'edu_degree') {
    const level = degreeLevel(value) || ({ "high school": 'high_school' } as Record<string, string>)[v] || '';
    if (level) {
      const hit = answers.find((o) => degreeLevel(o.label) === level);
      if (hit) return hit;
    }
  }
  const month = monthOf(value);
  if (month && answers.some((o) => monthOf(o.label) || monthOf(o.value))) {
    return answers.find((o) => monthOf(o.label) === month || monthOf(o.value) === month) ?? null;
  }
  if (purpose === 'years_experience') return rangeOption(answers, value);
  return null;
}

// On normalized text, where "don't" reads "don t".
const NEGATED = /\b(not|no|never|cannot)\b|n t\b/;

/** A dropdown's prompt ("Select...", "Choose one", "-- Please select --"), not an answer ("Choose not to disclose" is one). */
export function isPlaceholderOption(label: string): boolean {
  return /^(-{2,}.*|(please )?(select|choose|pick)( one| an? (option|answer|item)| your answer| from the list)?\s*(\.{3}|…|:)?\s*(-{2,})?|month|year|day)$/i.test(label.trim());
}

/** Picks the option that means value, or null. */
export function matchOption(options: Option[], value: string, purpose: FieldPurpose | null): Option | null {
  const real = options.filter((o) => norm(o.label) !== '' && !isPlaceholderOption(o.label));
  if (!value) return null;
  const v = norm(value);
  if (v === 'decline') return real.find((o) => DECLINE.test(o.label.toLowerCase())) ?? null;
  if (v === 'yes' || v === 'no') {
    const direct = real.find((o) => new RegExp(`^${v}\\b`).test(norm(o.label)));
    if (direct) return direct;
    // "I am authorized..." / "I am not authorized...": the one without a negation means yes.
    const answers = real.filter((o) => !DECLINE.test(o.label.toLowerCase()));
    if (answers.length === 2) {
      const neg = answers.map((o) => NEGATED.test(norm(o.label)));
      if (neg[0] !== neg[1]) return answers[neg.indexOf(v === 'no')] ?? null;
    }
    return null;
  }
  const wanted = new Set([v]);
  if ((purpose === 'country' || purpose === 'phone_code') && US_NAMES.includes(v)) US_NAMES.forEach((n) => wanted.add(norm(n)));
  if (purpose === 'phone_code' && US_NAMES.includes(v)) wanted.add('+1');
  if (purpose === 'state') {
    const up = value.trim().toUpperCase();
    if (US_STATES[up]) wanted.add(norm(US_STATES[up]));
    for (const [abbr, name] of Object.entries(US_STATES)) if (norm(name) === v) wanted.add(abbr.toLowerCase());
  }
  const exact = real.find((o) => wanted.has(norm(o.label)) || wanted.has(norm(o.value)));
  if (exact) return exact;
  if (purpose === 'location' || purpose === 'city') {
    const place = samePlace(real, value);
    if (place) return place;
  }
  const meant = meaningOption(real, value, purpose);
  if (meant) return meant;
  return (
    real.find((o) => [...wanted].some((w) => w.length > 2 && norm(o.label).startsWith(w))) ??
    (purpose && NAMED.has(purpose) ? sameName(real, value) : null) ??
    // A whole-word match ("Computer Science" in "B.S. Computer Science"), never inside a word ("male" in "female").
    real.find((o) => [...wanted].some((w) => w.length > 3 && new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(norm(o.label)))) ??
    null
  );
}

/** What to type into a searchable dropdown so the right option shows: full names, not codes. */
export function searchText(value: string, purpose: FieldPurpose | null): string {
  const v = norm(value);
  if (v === 'decline') return '';
  if (v === 'yes' || v === 'no') return v === 'yes' ? 'Yes' : 'No';
  if (purpose === 'state' && US_STATES[value.trim().toUpperCase()]) return US_STATES[value.trim().toUpperCase()]!;
  // Place searches find "Dallas" more often than "Dallas, TX".
  if (purpose === 'location' || purpose === 'city') return value.split(',')[0]!.trim();
  if ((purpose === 'country' || purpose === 'phone_code') && US_NAMES.includes(v)) return 'United States';
  return value;
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
  if (purpose === 'start_date' || purpose === 'graduation_year') {
    const ph = (el.getAttribute('placeholder') ?? '').toLowerCase();
    const d = /\b(mm|dd)\b.*\byyyy\b/.test(ph) ? parseDate(value) : null;
    if (d) return ph.indexOf('dd') < ph.indexOf('mm') ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }
  return value;
}

/** Types a search into a dropdown's box: input only, no change or blur (which would close and clear the list). */
function typeSearch(el: HTMLInputElement, value: string) {
  // The native setter, called on el (see setNativeValue).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  // Some boxes search on a typed character's key events, not on input (Lever's location).
  const key = value.slice(-1);
  if (key) for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
}

/** Sets a value the way typing would, so React/Vue/Angular forms see it. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  // The prototype's native setter, called on el: it bypasses the
  // framework's own value tracking so the events below register.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus?.();
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function check(input: HTMLInputElement) {
  if (input.checked) return;
  input.click(); // fires the events frameworks listen for
  if (!input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** A click as a pointer makes it: some widgets open or pick on mousedown, others on click. */
export function press(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.click();
}

function escape(el: HTMLElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

const STYLE_ID = 'wera-fill-style';
export function mark(el: HTMLElement, kind: 'filled' | 'review') {
  // A shadow root needs its own copy of the outline style.
  const scope = scopeOf(el);
  if (!scope.getElementById(STYLE_ID)) {
    const style = el.ownerDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `[data-wera-filled]{outline:2px solid rgba(34,197,94,.55)!important;outline-offset:2px}
[data-wera-review]{outline:2px solid rgba(245,158,11,.7)!important;outline-offset:2px}`;
    (scope instanceof ShadowRoot ? scope : scope.head)?.appendChild(style);
  }
  el.removeAttribute('data-wera-filled');
  el.removeAttribute('data-wera-review');
  el.setAttribute(kind === 'filled' ? 'data-wera-filled' : 'data-wera-review', '');
}

export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** The visible options of an open dropdown: its own list when it names one, else any listbox on the page. */
function openOptions(el: HTMLElement): (Option & { node: HTMLElement })[] {
  const scope = scopeOf(el);
  const ref = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const lists: ParentNode[] = [];
  const own = ref ? scope.getElementById(ref) ?? el.ownerDocument.getElementById(ref) : null;
  if (own) lists.push(own);
  else lists.push(...el.ownerDocument.querySelectorAll('[role="listbox"]'), scope);
  for (const list of lists) {
    const nodes = [...list.querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isHidden(o));
    if (nodes.length) return nodes.map((node) => ({ label: (node.textContent ?? '').trim(), value: '', node }));
  }
  return [];
}

/** Whether an open list says it has nothing for the search (react-select's "No options", "No results found"). */
function saysNoOptions(el: HTMLElement): boolean {
  const ref = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const scopes: ParentNode[] = [];
  const own = ref ? scopeOf(el).getElementById(ref) ?? el.ownerDocument.getElementById(ref) : null;
  if (own) scopes.push(own);
  let n: HTMLElement | null = el.parentElement;
  for (let i = 0; n && i < 5; i++, n = n.parentElement) scopes.push(n);
  return scopes.some((sc) => [...sc.querySelectorAll<HTMLElement>('[class*="no-options"], [class*="noOptions"], [class*="no-results"], [class*="menu-notice"]')]
    .some((m) => !isHidden(m) && /^no (options|results|matches)|nothing found/i.test((m.textContent ?? '').trim())));
}

/** Waits up to ~2s (lists that search as you type load late) for an option that means value to show, then picks it. */
async function pickOpen(el: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  const start = Date.now();
  let shownSince = 0;
  while (Date.now() - start < 2000) {
    await wait(50);
    const options = openOptions(el);
    const hit = matchOption(options, value, purpose) as (Option & { node: HTMLElement }) | null;
    if (hit) {
      press(hit.node);
      return hit.label;
    }
    // A list that has shown its choices for a while without this one does not have it
    // ("Loading..." and "Searching..." rows are not choices yet).
    const real = options.filter((o) => !/^(loading|searching)\b/i.test(o.label));
    // The list says it has nothing for this search ("No options"): no point waiting.
    if (!real.length && saysNoOptions(el)) return null;
    if (!real.length) shownSince = 0;
    else if (!shownSince) shownSince = Date.now();
    else if (Date.now() - shownSince > 500) return null;
  }
  return null;
}

/** react-select and friends show the choice beside the input, which stays empty. */
export function comboboxChoice(el: HTMLInputElement): string {
  if (el.value.trim()) return el.value.trim();
  let n: Element | null = el.parentElement;
  for (let i = 0; n && i < 4; i++, n = n.parentElement) {
    if (n.querySelectorAll('input, select, textarea').length > 1) break; // reached a neighbour's field
    const shown = n.querySelector('[class*="singleValue"], [class*="single-value"], [class*="SingleValue"]');
    if (shown?.textContent?.trim()) return shown.textContent.trim();
  }
  return '';
}

/**
 * Focus as the page sees it. The user is clicking in Wera's side panel,
 * so the page itself has no focus and focus() alone fires no events;
 * dropdowns that open only once focused (react-select) need them.
 */
export function focusField(el: HTMLElement) {
  el.focus?.();
  if (!el.ownerDocument.hasFocus()) {
    el.dispatchEvent(new FocusEvent('focus'));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }
}

/** The arrow key a person presses to open a list: down and up, since some open on keyup (Greenhouse). */
function arrowDown(el: HTMLElement) {
  for (const type of ['keydown', 'keyup']) {
    el.dispatchEvent(new KeyboardEvent(type, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true }));
  }
}

/** Searchable dropdowns: type, then pick the option that appears; else list everything and look. */
async function fillCombobox(el: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  // A long answer ("No, I do not have a disability") is rarely worded the same in the list:
  // look through the whole list first, then search.
  const search = searchText(value, purpose);
  for (const typed of [...new Set(search.length > 24 ? ['', search] : [search, ''])]) {
    focusField(el);
    typeSearch(el, typed);
    arrowDown(el);
    const got = await pickOpen(el, value, purpose);
    if (got) return got;
  }
  // Leave no half-typed search behind.
  typeSearch(el, '');
  escape(el);
  return null;
}

/** Dropdowns that are buttons (Workday) or ARIA comboboxes: open, then pick. */
async function fillListbox(el: HTMLElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  focusField(el);
  press(el);
  const got = await pickOpen(el, value, purpose);
  if (!got) escape(el);
  return got;
}

export function base64ToFile(b64: string, name: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'application/pdf' });
}

export function attachFile(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export interface FillOptions {
  resume?: { name: string; base64: string };
  coverLetter?: string;
  /** Rounds over the form: answers can reveal fields ("If yes...") or load options (states after country). */
  passes?: number;
  /** How long to let the page react between rounds, in ms. */
  settle?: number;
}

/** Outcomes worth another try once the page has reacted (options may have loaded). Dropdowns that are slow to search are not retried. */
const RETRY = /^no (option|choice) matches/;

/**
 * Fills every field Wera understands from the applicant details. It never
 * overwrites what is already filled, never ticks consent boxes and never
 * submits; filled fields are outlined green and ones to check amber.
 * After a round that changed something it looks again for fields that
 * just appeared or options that just loaded.
 */
export async function fillForm(root: ParentNode, a: Applicant, opts: FillOptions = {}): Promise<FillResult[]> {
  const results = new Map<string, FillResult>();
  const passes = opts.passes ?? 3;
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (const f of collectFields(root)) {
      const prev = results.get(f.id);
      if (prev && !(prev.status === 'review' && RETRY.test(prev.note ?? ''))) continue;
      const purpose = classify(f);
      const res: FillResult = { id: f.id, label: f.label.slice(0, 160), purpose, status: 'skipped', required: f.required };
      const max = (f.el as HTMLTextAreaElement).maxLength;
      if (purpose === 'question' && max > 0) res.maxLength = max;
      try {
        await fillOne(f, purpose, a, opts, res);
      } catch (e) {
        res.status = 'review';
        res.note = `could not fill: ${String(e)}`;
      }
      results.set(f.id, res);
      if (res.status === 'filled') {
        changed = true;
        mark(f.el, 'filled');
      } else if (res.status === 'review' || (res.status !== 'already' && f.required)) {
        mark(f.el, 'review');
      }
    }
    if (!changed) break;
    if (pass < passes - 1) await wait(opts.settle ?? 300);
  }
  // In page order, including fields that appeared on a later round.
  const order = new Map(collectFields(root).map((f, i) => [f.id, i]));
  return [...results.values()].sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9));
}

async function fillOne(f: Field, purpose: FieldPurpose | null, a: Applicant, opts: FillOptions, res: FillResult) {
  if (purpose === null) return;
  if (purpose === 'consent') {
    res.status = 'review';
    res.note = 'agree yourself after reading it';
    return;
  }
  if (purpose === 'question') {
    res.status = 'question';
    return;
  }
  if (purpose === 'resume') {
    if (f.kind !== 'file') return;
    const input = f.el as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      res.status = 'already';
      return;
    }
    if (!opts.resume) {
      res.status = 'review';
      res.note = 'upload your resume in Wera to attach it';
      return;
    }
    attachFile(input, base64ToFile(opts.resume.base64, opts.resume.name));
    res.status = 'filled';
    res.value = opts.resume.name;
    return;
  }
  if (purpose === 'cover_letter') {
    if (f.kind === 'textarea' && opts.coverLetter && !(f.el as HTMLTextAreaElement).value) {
      setNativeValue(f.el as HTMLTextAreaElement, opts.coverLetter);
      res.status = 'filled';
      res.value = 'cover letter';
    } else {
      res.status = 'review';
      res.note = 'write or attach your cover letter';
    }
    return;
  }

  const value = valueFor(purpose, a);
  if (!value) {
    res.status = f.required ? 'review' : 'skipped';
    res.note = 'not in your application details';
    return;
  }
  await enterValue(f, purpose, value, res);
}

// Text boxes that suggest places as you type (Lever's location, Google Places): a suggestion must be picked.
const SUGGESTING = new Set<FieldPurpose>(['location', 'city']);
const SUGGESTIONS = '[role="option"], .dropdown-location, [class*="suggestion"] li, [class*="suggestion-item"], [class*="autocomplete"] li, [class*="results"]:not([class*="no-results"]):not([class*="loading"]) > div, .pac-item';
// "Loading...", "No results": what a list shows instead of suggestions.
const NOT_A_SUGGESTION = /loading|no-results|empty|spinner/i;

/** Suggestions showing beside a text box (in its field, or Google's list at the end of the page). */
function suggestionsNear(el: HTMLElement): (Option & { node: HTMLElement })[] {
  const scopes: ParentNode[] = [];
  let n: HTMLElement | null = el.parentElement;
  for (let i = 0; n && i < 3; i++, n = n.parentElement) scopes.push(n);
  scopes.push(...el.ownerDocument.querySelectorAll('.pac-container'));
  for (const scope of scopes) {
    const nodes = [...scope.querySelectorAll<HTMLElement>(SUGGESTIONS)].filter((o) => o !== el && !o.contains(el) && !isHidden(o) && (o.textContent ?? '').trim()
      && !NOT_A_SUGGESTION.test(`${o.className} ${o.parentElement?.className ?? ''}`) && !/^(loading|searching)\b/i.test((o.textContent ?? '').trim()));
    if (nodes.length) return nodes.map((node) => ({ label: (node.textContent ?? '').replace(/\s+/g, ' ').trim(), value: '', node }));
  }
  return [];
}

/**
 * Whether a text box suggests as you type (so a suggestion must be
 * picked): it says so (aria), or its name or the list beside it does.
 * Plain boxes are filled at once instead of waiting for a list.
 */
export function looksSuggesting(el: HTMLInputElement): boolean {
  if (el.getAttribute('aria-autocomplete') || el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup')) return true;
  if (/location|autocomplete|typeahead|places|suggest|geo/i.test(`${el.className} ${el.id} ${el.name} ${el.getAttribute('data-qa') ?? ''}`)) return true;
  // A list in the box's own wrapper (one holding no other field), as Lever has.
  let n: HTMLElement | null = el.parentElement;
  for (let i = 0; n && i < 3 && n.querySelectorAll('input, select, textarea').length === 1; i++, n = n.parentElement) {
    if (n.querySelector('[class*="dropdown"], [class*="autocomplete"], [class*="suggest"], [class*="results"], [role="listbox"]')) return true;
  }
  return !!el.ownerDocument.querySelector('.pac-container');
}

/** Types into a suggesting box and picks the suggestion that means value; null when none shows. */
async function pickSuggestion(el: HTMLInputElement, value: string, purpose: FieldPurpose | null): Promise<string | null> {
  focusField(el);
  // Search by the place's first part ("Dallas" for "Dallas, TX"), then pick the full match.
  typeSearch(el, value.split(',')[0]!.trim());
  arrowDown(el);
  for (let i = 0; i < 25; i++) {
    await wait(100);
    const found = suggestionsNear(el);
    if (!found.length) continue;
    const hit = (matchOption(found, value, purpose) ?? found.find((o) => norm(o.label).startsWith(norm(value.split(',')[0]!)))) as (Option & { node: HTMLElement }) | null;
    // The list may still be filling in: keep looking until time runs out.
    if (!hit) continue;
    press(hit.node);
    await wait(80);
    return el.value.trim() || hit.label;
  }
  return null;
}

/**
 * Enters one value into a field of any kind and records the outcome in
 * res. A field that already holds something is left alone unless
 * overwrite (the user approved this value for it). Checkboxes take
 * several choices separated by " | ".
 */
export async function enterValue(f: Field, purpose: FieldPurpose | null, value: string, res: FillResult, overwrite = false) {
  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const el = f.el as HTMLInputElement;
      if (el.value.trim() && (!overwrite || el.value === value)) {
        res.status = 'already';
        res.value = el.value;
        return;
      }
      if (purpose && SUGGESTING.has(purpose) && f.kind === 'text' && looksSuggesting(el)) {
        const picked = await pickSuggestion(el, value, purpose);
        if (picked) {
          res.status = 'filled';
          res.value = picked;
          return;
        }
      }
      const shaped = formatFor(el, value, purpose);
      if (shaped == null) {
        res.status = 'review';
        res.note = `enter it yourself ("${value}" doesn't fit this field)`;
        return;
      }
      setNativeValue(el, shaped);
      // The page may refuse a value (a date box, a mask): check it took.
      if (!el.value.trim()) {
        res.status = 'review';
        res.note = `the form didn't accept "${shaped}"`;
        return;
      }
      res.status = 'filled';
      res.value = el.value;
      return;
    }
    case 'combobox': {
      const el = f.el as HTMLInputElement;
      const shown = comboboxChoice(el);
      if (shown && (!overwrite || norm(shown) === norm(value))) {
        res.status = 'already';
        res.value = shown;
        return;
      }
      const got = await fillCombobox(el, value, purpose);
      res.status = got ? 'filled' : 'review';
      res.value = got ?? value;
      if (!got) res.note = 'pick the matching option';
      return;
    }
    case 'listbox': {
      const shown = listboxValue(f.el);
      if (shown && (!overwrite || norm(shown) === norm(value))) {
        res.status = 'already';
        res.value = shown;
        return;
      }
      const got = await fillListbox(f.el, value, purpose);
      res.status = got ? 'filled' : 'review';
      res.value = got ?? value;
      if (!got) res.note = 'pick the matching option';
      return;
    }
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      const hit = matchOption(f.options, value, purpose);
      if (sel.value && sel.selectedIndex > 0 && (!overwrite || hit?.value === sel.value)) {
        res.status = 'already';
        res.value = sel.options[sel.selectedIndex]?.textContent?.trim() ?? sel.value;
        return;
      }
      if (!hit) {
        res.status = 'review';
        res.note = `no option matches "${value}"`;
        return;
      }
      setNativeValue(sel, hit.value);
      res.status = 'filled';
      res.value = hit.label;
      return;
    }
    case 'radio':
    case 'checkboxes':
    case 'buttons': {
      const chosen = (o: Option) => (f.kind === 'buttons' ? isPressed(o.el!) : (o.el as HTMLInputElement).checked);
      const wanted = f.kind === 'checkboxes' ? value.split(/\s*\|\s*/).filter(Boolean) : [value];
      const hits = wanted.map((w) => matchOption(f.options, w, purpose)).filter((o): o is Option => o != null);
      if (f.options.some(chosen) && (!overwrite || (hits.length > 0 && hits.every(chosen)))) {
        res.status = 'already';
        res.value = f.options.filter(chosen).map((o) => o.label).join(' | ');
        return;
      }
      if (!hits.length) {
        res.status = 'review';
        res.note = `no choice matches "${value}"`;
        return;
      }
      for (const hit of hits) {
        if (chosen(hit)) continue;
        if (f.kind === 'buttons') press(hit.el!);
        else check(hit.el as HTMLInputElement);
      }
      res.status = 'filled';
      res.value = hits.map((o) => o.label).join(' | ');
      return;
    }
    case 'checkbox': {
      // A lone box ("I am willing to relocate"): ticked for yes, left alone for no.
      const box = f.el as HTMLInputElement;
      if (box.checked) {
        res.status = 'already';
        res.value = 'yes';
        return;
      }
      if (norm(value) !== 'yes') return;
      check(box);
      res.status = 'filled';
      res.value = 'yes';
      return;
    }
    default:
      return;
  }
}

/** Puts text into one field (an AI-drafted answer or a cover letter). */
export function insertText(el: HTMLElement | null, text: string): boolean {
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  setNativeValue(el, text);
  mark(el, 'filled');
  return true;
}
