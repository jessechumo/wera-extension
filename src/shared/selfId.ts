// Voluntary self-identification answers, as Wera stores them: the same
// values the dashboard's Application details offer (wera-frontend
// src/profile/ApplicationDetails.tsx), whatever words a form used. An
// answer Wera cannot place is not saved.
import type { FieldPurpose } from './types';

/** Voluntary self-identification: only the user's own choices fill these, and the AI never sees them. */
export const SELF_ID = new Set<FieldPurpose>(['gender', 'pronouns', 'transgender', 'sexual_orientation', 'race', 'hispanic', 'veteran', 'disability', 'lgbtq']);

/** An answer that declines to say ("Decline to self-identify", "I don't wish to answer"). */
export const DECLINE = /decline|prefer not|don.?t wish|do not wish|do not want|don.?t want|wish not|not to (say|answer|disclose|identify|self.identify)|rather not|choose not|not declared|no answer|not specified|undisclosed/i;
const NEGATED = /\b(not|no|never|non)\b|n['’]t\b|non-/i;

const RULES: Partial<Record<FieldPurpose, [RegExp, string][]>> = {
  gender: [[/non.?binary|genderqueer|gender ?non|gender ?fluid/i, 'Non-binary'], [/\b(female|woman|women)\b|she\s*\/\s*her/i, 'Female'], [/\b(male|man|men)\b|he\s*\/\s*him/i, 'Male']],
  sexual_orientation: [[/heterosexual|straight/i, 'Heterosexual or straight'], [/\bgay\b|lesbian|homosexual/i, 'Gay or lesbian'], [/bisexual/i, 'Bisexual'], [/asexual/i, 'Asexual'], [/pansexual/i, 'Pansexual'], [/queer/i, 'Queer']],
  race: [[/two or more|multi.?racial|multiple races|mixed/i, 'Two or more races'], [/black|african american/i, 'Black or African American'], [/\bwhite\b|caucasian/i, 'White'],
    [/\basian\b/i, 'Asian'], [/american indian|alaska(n)? native|native american/i, 'American Indian or Alaska Native'], [/hawaiian|pacific islander/i, 'Native Hawaiian or Other Pacific Islander']],
};

/**
 * The stored value for what the user chose on a form, or '' when it
 * cannot be placed (Wera then leaves the detail unset rather than guess).
 */
export function selfIdValue(purpose: FieldPurpose, chosen: string): string {
  const v = chosen.trim();
  if (!v || v.length > 200) return '';
  if (DECLINE.test(v)) return 'decline';
  switch (purpose) {
    case 'pronouns':
      return v.length <= 40 ? v : '';
    case 'hispanic':
    case 'transgender':
      if (/^yes\b/i.test(v) || (purpose === 'hispanic' && /hispanic|latin/i.test(v) && !NEGATED.test(v))) return 'yes';
      if (/^no\b/i.test(v) || NEGATED.test(v)) return 'no';
      return '';
    case 'veteran':
      if (/non-?protected|not a (protected )?veteran|never served|^no\b|i am not/i.test(v)) return 'I am not a protected veteran';
      if (/protected veteran|identify as one or more|^yes\b/i.test(v) && !NEGATED.test(v)) return 'I am a protected veteran';
      return '';
    case 'disability':
      if (/^no\b|do not have|don['’]?t have/i.test(v)) return 'No, I do not have a disability';
      if (/^yes\b|have (or have had )?a disab|i have a disab/i.test(v)) return 'Yes, I have a disability';
      return '';
    default:
      return RULES[purpose]?.find(([re]) => re.test(v))?.[1] ?? '';
  }
}
