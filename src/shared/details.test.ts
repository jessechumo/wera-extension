import { describe, expect, it } from 'vitest';
import { learnedDetails } from './details';
import type { Applicant } from './types';

const blank = { phone: '', willing_to_travel: '', gender: '', race: '', first_name: 'Ada', start_date: '', veteran: '' } as unknown as Applicant;

describe('learnedDetails', () => {
  it('saves details Wera lacked, as yes/no where the detail is one, and self-identification in the dashboard\'s values', () => {
    expect(learnedDetails(blank, [
      { purpose: 'phone', value: '512 555 0142' }, { purpose: 'willing_to_travel', value: 'Yes, up to 25%' },
      { purpose: 'gender', value: 'Woman' }, { purpose: 'full_name', value: 'Ada L' },
    ])).toEqual({ phone: '512 555 0142', willing_to_travel: 'yes', gender: 'Female' });
  });

  it('never replaces what the details hold, and leaves what it cannot place', () => {
    expect(learnedDetails({ ...blank, gender: 'Female' }, [{ purpose: 'gender', value: 'Decline To Self Identify' }])).toEqual({});
    expect(learnedDetails({ ...blank, phone: 'kept' }, [{ purpose: 'phone', value: '512' }])).toEqual({});
    expect(learnedDetails(blank, [{ purpose: 'willing_to_travel', value: 'Sometimes' }])).toEqual({});
    // "Hispanic or Latino" in a race list is not one of the dashboard's races.
    expect(learnedDetails(blank, [{ purpose: 'race', value: 'Hispanic or Latino' }])).toEqual({});
    expect(learnedDetails(blank, [{ purpose: 'veteran', value: 'I am on active duty' }])).toEqual({});
  });

  it('keeps nothing that belongs to one application or is not a detail', () => {
    expect(learnedDetails(blank, [
      { purpose: 'start_date', value: '2026-11-01' }, { purpose: 'question', value: 'Because robots.' }, { purpose: null, value: 'x' },
    ])).toEqual({});
  });
});
