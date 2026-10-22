// A start date is about the future: one that has gone by is never put
// on a form (it reads as "I start in 2025") and never kept as a detail.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Whether v names a date (or month, or year) that is wholly before today; words like "Two weeks" never are. */
export function startHasPassed(v: string, today = new Date()): boolean {
  const s = v.trim().toLowerCase();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!) < day;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return new Date(+m[3]!, +m[1]! - 1, +m[2]!) < day;
  m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return new Date(+m[1]!, +m[2]!, 1) <= day; // the whole month has gone by
  m = /^([a-z]{3})[a-z]*\.? (\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[1]!)) return new Date(+m[2]!, MONTHS.indexOf(m[1]!) + 1, 1) <= day;
  m = /^(\d{4})$/.exec(s);
  if (m) return +m[1]! < today.getFullYear();
  return false;
}
