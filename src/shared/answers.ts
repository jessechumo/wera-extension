// Answers the user gave on application forms, so the same question on the
// next form is filled the same way. They live in Wera (every connected
// browser shares them); this module matches questions to answers. Older
// versions kept them in this browser only: those are moved to Wera once.

export interface SavedAnswer {
  id?: number;
  question: string;
  answer: string;
  company: string;
  kind?: 'text' | 'long' | 'choice';
  at: number;
}

const LEGACY_KEY = 'wera.answers';

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'you', 'your', 'in', 'for', 'at', 'with', 'is', 'are', 'do', 'please', 'this', 'our', 'we', 'us', 'what', 'why', 'how', 'tell', 'describe', 'any', 'have', 'will', 'can', 'if']);

function words(q: string): Set<string> {
  return new Set(q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

/** The question normalized as Wera keys it (case, punctuation, a "required" marker). */
export function answerKey(q: string): string {
  return q.toLowerCase().trim().replace(/\s*(\*|\(required\)|required)\s*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** How alike two questions are (0 to 1): shared meaningful words. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.max(x.size, y.size);
}

/** The answer to this question, or to one very like it (the closest, then the newest). */
export function bestAnswer<T extends { question: string; answer: string }>(list: T[], question: string, min = 0.75): T | null {
  const key = answerKey(question);
  if (!key) return null;
  const exact = list.find((a) => answerKey(a.question) === key);
  if (exact) return exact;
  let best: T | null = null;
  let score = min;
  for (const a of list) {
    const s = similarity(a.question, question);
    if (s >= score && (s > score || !best)) {
      best = a;
      score = s;
    }
  }
  return best;
}

/** Earlier answers to questions like this one, best first (for open questions). */
export function matchAnswers(list: SavedAnswer[], question: string, limit = 3): SavedAnswer[] {
  return list
    .map((a) => ({ a, s: answerKey(a.question) === answerKey(question) ? 1 : similarity(a.question, question) }))
    .filter((x) => x.s >= 0.5)
    .sort((x, y) => y.s - x.s || y.a.at - x.a.at)
    .slice(0, limit)
    .map((x) => x.a);
}

/** Answers an older version kept in this browser (to move to Wera). */
export async function loadLegacyAnswers(): Promise<SavedAnswer[]> {
  const got = await chrome.storage.local.get(LEGACY_KEY);
  return (got[LEGACY_KEY] as SavedAnswer[] | undefined) ?? [];
}

export async function clearLegacyAnswers(): Promise<void> {
  await chrome.storage.local.remove(LEGACY_KEY);
}
