import { describe, expect, it } from 'vitest';
import { selfIdValue } from './selfId';

describe('self-identification from a form', () => {
  it('stores what the user chose in the dashboard\'s values', () => {
    expect(selfIdValue('gender', 'Man')).toBe('Male');
    expect(selfIdValue('gender', 'Female')).toBe('Female');
    expect(selfIdValue('gender', 'Genderqueer / Non-binary')).toBe('Non-binary');
    expect(selfIdValue('gender', 'Decline To Self Identify')).toBe('decline');
    expect(selfIdValue('race', 'Black or African American (Not Hispanic or Latino)')).toBe('Black or African American');
    expect(selfIdValue('race', 'Two or More Races (Not Hispanic or Latino)')).toBe('Two or more races');
    expect(selfIdValue('hispanic', 'Not Hispanic or Latino')).toBe('no');
    expect(selfIdValue('hispanic', 'Hispanic or Latino')).toBe('yes');
    expect(selfIdValue('veteran', 'I identify as a non-protected veteran')).toBe('I am not a protected veteran');
    expect(selfIdValue('veteran', 'I identify as one or more of the classifications of protected veteran')).toBe('I am a protected veteran');
    expect(selfIdValue('disability', "No, I don't have a disability and have not had one in the past")).toBe('No, I do not have a disability');
    expect(selfIdValue('disability', 'Yes, I have a disability (or previously had a disability)')).toBe('Yes, I have a disability');
    expect(selfIdValue('sexual_orientation', 'Straight / Heterosexual')).toBe('Heterosexual or straight');
  });

  it('saves nothing it cannot place', () => {
    expect(selfIdValue('race', 'Martian')).toBe('');
    expect(selfIdValue('veteran', 'I am on active duty')).toBe('');
    expect(selfIdValue('gender', '')).toBe('');
  });
});
