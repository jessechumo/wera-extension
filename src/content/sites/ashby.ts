// Ashby (jobs.ashbyhq.com): its own fields are "_systemfield_…" (name,
// email, resume, location, the EEO questions); the employer's questions
// have generated ids and are read by their labels.
import type { FieldPurpose } from '../../shared/types';
import type { Field } from '../fields';
import type { Site } from './index';

const NAMES: [RegExp, FieldPurpose][] = [
  [/_systemfield_name$/, 'full_name'],
  [/_systemfield_email$/, 'email'],
  [/_systemfield_resume$/, 'resume'],
  [/_systemfield_location$/, 'location'],
  [/_systemfield_eeoc_gender$/, 'gender'],
  [/_systemfield_eeoc_race$/, 'race'],
  [/_systemfield_eeoc_veteran_status$/, 'veteran'],
  [/_systemfield_eeoc_disability_status$/, 'disability'],
];

function purpose(f: Field): FieldPurpose | null | undefined {
  const key = `${f.el.getAttribute('name') ?? ''} ${f.el.id}`.trim();
  for (const [re, p] of NAMES) if (key.split(' ').some((k) => re.test(k))) return p;
  return undefined;
}

export const ashby: Site = {
  name: 'Ashby',
  matches: (doc) => /(^|\.)ashbyhq\.com$/i.test(doc.location?.hostname ?? ''),
  purpose,
};
