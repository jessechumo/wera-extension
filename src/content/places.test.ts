import { describe, expect, it } from 'vitest';
import { countryAnswer, countryIn, countryNamed, sameCountry } from './places';

describe('places', () => {
  it('knows a country by any of its names', () => {
    expect(countryNamed('USA')).toBe('United States');
    expect(countryNamed('American')).toBe('United States');
    expect(countryNamed('uk')).toBe('United Kingdom');
    expect(countryNamed('Narnia')).toBe('');
    expect(sameCountry('U.S.', 'United States of America')).toBe(true);
    expect(sameCountry('Canada', 'United States')).toBe(false);
  });

  it('finds the one country a question names, never "us" the word', () => {
    expect(countryIn('Are you currently located in the US?')).toBe('United States');
    expect(countryIn('Do you currently reside in the U.S.?')).toBe('United States');
    expect(countryIn('Are you a Singapore citizen?')).toBe('Singapore');
    expect(countryIn('Are you a Canadian citizen?')).toBe('Canada');
    expect(countryIn('Why do you want to join us?')).toBe('');
    expect(countryIn('Are you based in the US or Canada?')).toBe('');
  });

  it('answers yes for the user\'s country, no for another, and nothing when unsure', () => {
    expect(countryAnswer('Are you currently located in the United States?', 'United States')).toBe('yes');
    expect(countryAnswer('Are you a Singapore citizen?', 'United States')).toBe('no');
    expect(countryAnswer('Are you located in the Bay Area?', 'United States')).toBe('');
    expect(countryAnswer('Are you a Singapore citizen?', '')).toBe('');
  });
});
