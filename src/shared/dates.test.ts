import { describe, expect, it } from 'vitest';
import { startHasPassed } from './dates';

const today = new Date(2026, 9, 22);

describe('a start date', () => {
  it('has passed when the date, month or year is behind us', () => {
    for (const v of ['2025-01-15', '01/15/2025', '2026-09', 'January 2025', 'Sept 2026', '2025', '2026-10-21']) expect(startHasPassed(v, today), v).toBe(true);
  });
  it('is fine today, later, this month, or in words', () => {
    for (const v of ['2026-10-22', '11/03/2026', '2026-10', 'October 2026', '2027', 'Two weeks after an offer', 'Immediately', '']) expect(startHasPassed(v, today), v).toBe(false);
  });
});
