// Matching a value to a list's choices the way a person would: by
// wording, then by meaning ("Male" is "Man", "I am not a protected
// veteran" is never "I am a protected veteran", "B.S." is a bachelor's,
// "Dallas, TX" is "Dallas, Texas, United States", 5 years is "3-5 years").
import { DECLINE } from '../shared/selfId';
import type { FieldPurpose } from '../shared/types';
import type { Option } from './fields';
import { norm, US_NAMES, US_STATES } from './places';
import { alternatives, firstChoice } from './values';

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
  let answers = real.filter((o) => !DECLINE.test(o.label));
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

/** Picks the option that means value (or its first alternative that fits), or null. */
export function matchOption(options: Option[], value: string, purpose: FieldPurpose | null): Option | null {
  const alts = alternatives(value);
  if (alts.length > 1) {
    for (const alt of alts) {
      const hit = matchOption(options, alt, purpose);
      if (hit) return hit;
    }
    return null;
  }
  const real = options.filter((o) => norm(o.label) !== '' && !isPlaceholderOption(o.label));
  if (!value) return null;
  const v = norm(value);
  if (v === 'decline') return real.find((o) => DECLINE.test(o.label)) ?? null;
  if (v === 'yes' || v === 'no') {
    const direct = real.filter((o) => new RegExp(`^${v}\\b`).test(norm(o.label)));
    // Several ways of saying yes ("Yes, I live nearby", "Yes, I would relocate"): which one takes more than a yes.
    if (direct.length > 1) return null;
    if (direct[0]) return direct[0];
    // "I am authorized..." / "I am not authorized...": the one without a negation means yes.
    const answers = real.filter((o) => !DECLINE.test(o.label));
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
  value = firstChoice(value);
  const v = norm(value);
  if (v === 'decline') return '';
  if (v === 'yes' || v === 'no') return v === 'yes' ? 'Yes' : 'No';
  if (purpose === 'state' && US_STATES[value.trim().toUpperCase()]) return US_STATES[value.trim().toUpperCase()]!;
  // Place searches find "Dallas" more often than "Dallas, TX".
  if (purpose === 'location' || purpose === 'city') return value.split(',')[0]!.trim();
  if ((purpose === 'country' || purpose === 'phone_code') && US_NAMES.includes(v)) return 'United States';
  return value;
}
