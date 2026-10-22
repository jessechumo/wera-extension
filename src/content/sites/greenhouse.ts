// Greenhouse: job boards (job-boards.greenhouse.io), the older boards, and
// the form embedded in careers pages. Fields are named for what they hold
// ("first_name", "school--0", "question_8692471006" for the employer's own).
import type { FieldPurpose } from '../../shared/types';
import type { Field } from '../fields';
import type { Site } from './index';

const NAMES: [RegExp, FieldPurpose | null][] = [
  [/^(job_application\[)?first_name\]?$/, 'first_name'],
  [/^(job_application\[)?last_name\]?$/, 'last_name'],
  [/^preferred_name$/, 'preferred_name'],
  [/^(job_application\[)?email\]?$/, 'email'],
  [/^(job_application\[)?phone\]?$/, 'phone'],
  [/^country$/, 'country'],
  [/^candidate-location$|^job_application\[location\]$/, 'location'],
  [/^(job_application\[)?resume\]?$/, 'resume'],
  [/^(job_application\[)?cover_letter\]?$/, 'cover_letter'],
  [/^school--\d+$/, 'edu_school'],
  [/^degree--\d+$/, 'edu_degree'],
  [/^discipline--\d+$/, 'edu_major'],
  [/^start-(month|year)--\d+$/, 'edu_start'],
  [/^end-(month|year)--\d+$/, 'edu_end'],
  [/^gender$/, 'gender'],
  [/^hispanic_ethnicity$/, 'hispanic'],
  [/^race$/, 'race'],
  [/^veteran_status$/, 'veteran'],
  [/^disability_status$/, 'disability'],
  // The phone box's country picker: part of the phone, not a question.
  [/^iti-\d+__search-input$/, null],
];

function purpose(f: Field): FieldPurpose | null | undefined {
  const key = f.el.id || f.el.getAttribute('name') || '';
  for (const [re, p] of NAMES) if (re.test(key)) return p;
  return undefined;
}

export const greenhouse: Site = {
  name: 'Greenhouse',
  matches: (doc) => /(^|\.)greenhouse\.io$/i.test(doc.location?.hostname ?? '') || !!doc.querySelector('#application_form, #grnhse_app form'),
  purpose,
};
