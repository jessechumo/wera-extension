import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { describeError } from './errors';

describe('describeError', () => {
  it('says what to do, never a bare status', () => {
    expect(describeError(new ApiError(401, 'unauthorized'))).toBe('Your Wera sign-in has ended. Sign in again from the Wera panel.');
    expect(describeError(new ApiError(502, '502 Bad Gateway'))).toMatch(/isn't answering \(error 502\).*tunnel/);
    expect(describeError(new ApiError(530, '530 '))).toMatch(/isn't answering \(error 530\)/);
    expect(describeError(new ApiError(500, '500 Internal Server Error'))).toMatch(/hit a problem \(error 500\)/);
    expect(describeError(new ApiError(429, 'slow down'))).toMatch(/Wait a minute/);
  });

  it('keeps the server\'s own words, as a sentence', () => {
    expect(describeError(new ApiError(400, 'finish your profile first'))).toBe('Finish your profile first.');
    expect(describeError(new ApiError(502, 'the AI service did not answer; try again'))).toBe('The AI service did not answer; try again.');
  });

  it('puts the cause after what failed', () => {
    expect(describeError(new ApiError(0, "Can't reach your Wera server at https://w.example."), "Couldn't load your resume"))
      .toBe("Couldn't load your resume. Can't reach your Wera server at https://w.example.");
  });

  it('turns Chrome\'s messages for a cut-off page into what to do', () => {
    expect(describeError(new Error('Extension context invalidated.'))).toBe('Wera was updated: reload this page to keep using it.');
    expect(describeError(new Error('Could not establish connection. Receiving end does not exist.'))).toMatch(/Reload it/);
    expect(describeError(undefined)).toBe('Something went wrong.');
  });
});
