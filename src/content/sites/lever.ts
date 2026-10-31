// Lever (jobs.lever.co): one page, fields named for what they hold
// ("name", "org", "urls[LinkedIn]", "eeo[gender]"), the employer's own
// questions in "cards[…]".
import type { FieldPurpose } from '../../shared/types';
import type { Field } from '../fields';
import type { Site } from './index';

const NAMES: Record<string, FieldPurpose | null> = {
  name: 'full_name', email: 'email', phone: 'phone', location: 'location', org: 'current_company', resume: 'resume',
  'urls[LinkedIn]': 'linkedin', 'urls[GitHub]': 'github', 'urls[Twitter]': 'twitter', 'urls[Portfolio]': 'portfolio', 'urls[Other]': null,
  'eeo[gender]': 'gender', 'eeo[race]': 'race', 'eeo[veteran]': 'veteran', 'eeo[disability]': 'disability',
  // "Additional information": where a cover letter goes on Lever.
  comments: 'cover_letter',
};

function purpose(f: Field): FieldPurpose | null | undefined {
  const name = f.el.getAttribute('name') ?? '';
  return name in NAMES ? NAMES[name] : undefined;
}

export const lever: Site = {
  name: 'Lever',
  matches: (doc) => /^jobs(\.eu)?\.lever\.co$/i.test(doc.location?.hostname ?? ''),
  purpose,
  // Lever reads an attached resume and overwrites the name, email, phone and more.
  readsResume: 2500,
};
