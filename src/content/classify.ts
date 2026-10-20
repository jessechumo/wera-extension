import type { FieldPurpose } from '../shared/types';
import type { Field } from './fields';

// Browser autocomplete tokens say exactly what a field is.
const AUTOCOMPLETE: Record<string, FieldPurpose> = {
  'given-name': 'first_name', 'family-name': 'last_name', name: 'full_name', nickname: 'preferred_name',
  email: 'email', tel: 'phone', 'tel-national': 'phone', 'street-address': 'address', 'address-line1': 'address',
  'additional-name': 'middle_name', 'address-line2': 'address_line2',
  'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'postal_code', country: 'country',
  'country-name': 'country', organization: 'current_company', 'organization-title': 'current_title',
};

// Ordered: the first match wins, so specific patterns come before general ones.
const RULES: [FieldPurpose, RegExp][] = [
  ['cover_letter', /cover\s*letter/],
  ['resume', /\b(resume|résumé|cv|curriculum)\b/],
  ['preferred_name', /preferred (first )?name|nick ?name|goes by/],
  ['middle_name', /middle[\s_-]*(name|initial)/],
  ['first_name', /first[\s_-]*name|given[\s_-]*name|forename|\bfname\b/],
  ['last_name', /last[\s_-]*name|surname|family[\s_-]*name|\blname\b/],
  ['full_name', /^(full |legal |your )?name\b|full[\s_-]*name|legal[\s_-]*name/],
  ['email', /e-?mail/],
  ['phone', /phone|mobile|cell\b|telephone/],
  ['linkedin', /linked\s*in/],
  ['github', /git\s*hub/],
  ['twitter', /twitter|\bx\.com\b|\bx \(twitter\)/],
  ['portfolio', /portfolio|personal (web)?site|website|personal url|other (link|url|website)|^url\b/],
  ['visa_status', /visa (status|type)|immigration status|current (work )?visa|type of (work )?visa/],
  ['needs_sponsorship', /sponsor|visa|h-?1b/],
  ['authorized_to_work', /(authori[sz]ed|eligible|legally (able|permitted)) to work|work authori[sz]ation|right to work/],
  ['willing_to_relocate', /relocat/],
  ['over_18', /\b(18|eighteen)\b.{0,20}(years|older|age)|at least 18|legal (working )?age|over (the age of )?18/],
  ['willing_to_travel', /(willing|able|open) to travel|travel (requirement|up to|is required)|\d+ ?% (of the time )?travel/],
  ['security_clearance', /clearance/],
  ['citizenship', /citizenship|country of (citizen|nationality)|nationality/],
  ['work_preference', /work (arrangement|preference|setting|model|style)|(remote|hybrid|on-?site) (or|preference)|prefer to work (remotely|from)|preferred work (location|mode|type)/],
  ['notice_period', /notice period|weeks.? notice|how much notice/],
  ['salary_expectation', /salary|compensation|pay (expectation|range)|desired pay|expected pay/],
  ['start_date', /start date|available to start|earliest (possible )?start|when can you start|date available|availability date/],
  ['how_heard', /how did you (hear|find|learn)|where did you (hear|find|learn)|referral source|^source\b|how were you referred/],
  ['languages', /^(?!.*programming).*(languages? (do you )?(speak|spoken|fluent)|which languages|language proficiency|fluent in|languages you speak)/],
  ['pronouns', /pronoun/],
  ['transgender', /transgender|identify as trans\b|gender identity (is )?(the same|different)/],
  ['sexual_orientation', /sexual orientation/],
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
  ['address_line2', /address (line )?2|\bapt\b|apartment|^suite\b/],
  ['address', /street|address/],
  ['city', /\bcity\b|\btown\b/],
  // "State", not the verb ("Please state why...").
  ['state', /\bstate\b(?! (your|why|how|what|the|any|briefly))|province|region/],
  ['country', /country/],
  ['location', /location|where are you (currently )?(located|based)|where do you (live|reside)/],
];

/** Voluntary self-identification: only the user's own choices fill these. */
export const SELF_ID = new Set<FieldPurpose>(['gender', 'pronouns', 'transgender', 'sexual_orientation', 'race', 'hispanic', 'veteran', 'disability']);

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
