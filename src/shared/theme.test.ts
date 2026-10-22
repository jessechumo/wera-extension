import { describe, expect, it } from 'vitest';
import { asPref, resolveTheme } from './theme';

describe('theme', () => {
  it('follows the dashboard choice, and the system for "system"', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(asPref('nonsense')).toBe('system');
  });
});
