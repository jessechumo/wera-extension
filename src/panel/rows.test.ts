import { describe, expect, it } from 'vitest';
import type { FieldPlan } from '../shared/types';
import { needsDraft, needsSuggestion, rowsFor, type Row } from './rows';

const row = (over: Partial<Row>): Row => ({
  id: 'w1', label: 'Field', purpose: null, kind: 'text', options: [], required: false, current: '', value: '', source: null, group: 'other', checked: false, ...over,
});

describe('which rows Wera fills, asks the AI about, or drafts', () => {
  it('fills what it knows into empty fields, never consents, and leaves what the page shows', () => {
    const fields: FieldPlan[] = [
      row({ id: 'a', value: 'Ada', group: 'details', source: 'details' }),
      row({ id: 'b', value: 'yes', group: 'consent' }),
      row({ id: 'c', value: 'Ada', current: 'Ada', group: 'details' }),
    ];
    expect(rowsFor({ fields, next: null, errors: 0 }).map((r) => [r.id, r.checked, r.status])).toEqual([['a', true, undefined], ['b', false, undefined], ['c', false, 'already']]);
  });

  it('never asks the AI about self-identification or who referred the user', () => {
    expect(needsSuggestion(row({ group: 'details', purpose: 'years_experience' }))).toBe(true);
    expect(needsSuggestion(row({ group: 'details', purpose: 'referral' }))).toBe(false);
    expect(needsSuggestion(row({ group: 'self_id', purpose: 'lgbtq', kind: 'select' }))).toBe(false);
    expect(needsSuggestion(row({ group: 'questions', purpose: 'question', kind: 'textarea' }))).toBe(false);
  });

  it('drafts real questions, not an optional "Additional information" box', () => {
    const q = (label: string, required = false) => row({ label, required, group: 'questions', purpose: 'question', kind: 'textarea' });
    expect(needsDraft(q('Why do you want to join Figma?'))).toBe(true);
    expect(needsDraft(q('Additional Information'))).toBe(false);
    expect(needsDraft(q('Anything else you would like us to know?'))).toBe(false);
    expect(needsDraft(q('Additional information', true))).toBe(true);
  });
});
