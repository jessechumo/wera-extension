import type { FieldPurpose } from '../shared/types';
import type { Field } from './fields';

// Browser autocomplete tokens say exactly what a field is.
const AUTOCOMPLETE: Record<string, FieldPurpose> = {
  'given-name': 'first_name', 'family-name': 'last_name', name: 'full_name', nickname: 'preferred_name',
  email: 'email', tel: 'phone', 'tel-national': 'phone', 'street-address': 'address', 'address-line1': 'address',
  'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'postal_code', country: 'country',
  'country-name': 'country', organization: 'current_company', 'organization-title': 'current_title',
};

// Ordered: the first match wins, so specific patterns come before general ones.
const RULES: [FieldPurpose, RegExp][] = [
  ['cover_letter', /cover\s*letter/],
  ['resume', /\b(resume|résumé|cv|curriculum)\b/],
  ['preferred_name', /preferred (first )?name|nick ?name|goes by/],
  ['first_name', /first[\s_-]*name|given[\s_-]*name|forename|\bfname\b/],
  ['last_name', /last[\s_-]*name|surname|family[\s_-]*name|\blname\b/],
  ['full_name', /^(full |legal |your )?name\b|full[\s_-]*name|legal[\s_-]*name/],
  ['email', /e-?mail/],
  ['phone', /phone|mobile|cell\b|telephone/],
  ['linkedin', /linked\s*in/],
  ['github', /git\s*hub/],
  ['portfolio', /portfolio|personal (web)?site|website|personal url|other (link|url|website)|^url\b/],
  ['needs_sponsorship', /sponsor|visa|h-?1b/],
  ['authorized_to_work', /(authori[sz]ed|eligible|legally (able|permitted)) to work|work authori[sz]ation|right to work/],
  ['willing_to_relocate', /relocat/],
  ['salary_expectation', /salary|compensation|pay (expectation|range)|desired pay|expected pay/],
  ['start_date', /start date|available to start|earliest (possible )?start|when can you start|notice period/],
  ['how_heard', /how did you (hear|find|learn)|where did you (hear|find|learn)|referral source|^source\b|how were you referred/],
  ['pronouns', /pronoun/],
  ['hispanic', /hispanic|latin[oaxe]/],
  ['race', /\brace\b|ethnic/],
  ['gender', /gender|\bsex\b/],
  ['veteran', /veteran|military|armed forces/],
  ['disability', /disabilit/],
  ['graduation_year', /graduat/],
  ['gpa', /\bgpa\b|grade point/],
  ['major', /major|field of study|discipline|concentration|area of study/],
  ['degree', /\bdegree\b|level of education|highest education/],
  ['school', /school|university|college|institution/],
  ['years_experience', /years of (professional |relevant |work |industry )?experience|how many years/],
  ['current_title', /current (job )?(title|role|position)|job title|^title\b/],
  ['current_company', /current (company|employer)|(most recent|latest) (company|employer)|^company( name)?\b|^employer\b/],
  ['postal_code', /zip|postal/],
  ['address', /street|address/],
  ['city', /\bcity\b|\btown\b/],
  // "State", not the verb ("Please state why...").
  ['state', /\bstate\b(?! (your|why|how|what|the|any|briefly))|province|region/],
  ['country', /country/],
  ['location', /location|where are you (currently )?(located|based)|where do you (live|reside)/],
];

const CONSENT = /\b(i agree|agree|consent|acknowledge|certify|privacy|terms|confirm that)\b/;

/** What a field asks for, or null when Wera cannot tell. */
export function classify(f: Field): FieldPurpose | null {
  if (f.autocomplete) {
    for (const tok of f.autocomplete.split(/\s+/)) {
      const p = AUTOCOMPLETE[tok];
      if (p) return p;
    }
  }
  if (f.inputType === 'email') return 'email';
  if (f.inputType === 'tel') return 'phone';
  const label = f.label.toLowerCase();
  if (f.kind === 'checkbox' && CONSENT.test(label)) return 'consent';
  // "Authorized to work without sponsorship?" asks both things at once.
  if (/without (the )?(need (for|of) |requiring )?(any )?(employer |visa )?sponsor/.test(label)) return 'authorized_no_sponsorship';
  for (const text of [label, f.hints]) {
    if (!text) continue;
    for (const [purpose, re] of RULES) {
      if (!re.test(text)) continue;
      if (purpose === 'resume' && f.kind !== 'file' && !/upload|attach|link|url/.test(text)) continue;
      return purpose;
    }
  }
  // An unrecognized long question or free-text box is for the person (AI can draft it).
  if (f.kind === 'textarea' || (f.kind === 'text' && (label.includes('?') || label.length > 60))) return 'question';
  return null;
}
