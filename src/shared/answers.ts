// Answers the user inserted into application forms, remembered in this
// browser only (chrome.storage.local), so the same question on the next
// form can reuse them.

export interface SavedAnswer {
  question: string;
  answer: string;
  company: string;
  at: number;
}

const KEY = 'wera.answers';
const MAX = 200;

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'you', 'your', 'in', 'for', 'at', 'with', 'is', 'are', 'do', 'please', 'this', 'our', 'we', 'us', 'what', 'why', 'how', 'tell', 'describe']);

function words(q: string): Set<string> {
  return new Set(q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
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

export async function loadAnswers(): Promise<SavedAnswer[]> {
  const got = await chrome.storage.local.get(KEY);
  return (got[KEY] as SavedAnswer[] | undefined) ?? [];
}

/** Remembers an answer (replacing an earlier one to the same question at the same company). */
export async function saveAnswer(a: Omit<SavedAnswer, 'at'>): Promise<void> {
  if (a.answer.trim().length < 20) return;
  const list = (await loadAnswers()).filter((x) => !(x.company === a.company && similarity(x.question, a.question) > 0.9));
  list.unshift({ ...a, at: Date.now() });
  await chrome.storage.local.set({ [KEY]: list.slice(0, MAX) });
}

/** Earlier answers to questions like this one, best first. */
export function matchAnswers(list: SavedAnswer[], question: string, limit = 3): SavedAnswer[] {
  return list
    .map((a) => ({ a, s: similarity(a.question, question) }))
    .filter((x) => x.s >= 0.5)
    .sort((x, y) => y.s - x.s || y.a.at - x.a.at)
    .slice(0, limit)
    .map((x) => x.a);
}

export async function forgetAnswers(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
