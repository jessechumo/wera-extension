import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAnswers, matchAnswers, saveAnswer, similarity } from './answers';

// An in-memory chrome.storage.local.
let store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
      set: async (v: Record<string, unknown>) => void Object.assign(store, v),
      remove: async (k: string) => void delete store[k],
    },
  },
});

describe('answer memory', () => {
  beforeEach(() => {
    store = {};
  });

  it('finds earlier answers to similar questions', async () => {
    expect(similarity('Why do you want to work at Acme?', 'Why do you want to work here?')).toBeGreaterThanOrEqual(0.5);
    expect(similarity('Why do you want to work at Acme?', 'Describe a technical challenge')).toBe(0);
    await saveAnswer({ question: 'Why do you want to work at Acme?', answer: 'Because Acme builds reliable robots at scale.', company: 'Acme' });
    await saveAnswer({ question: 'Describe a hard technical challenge you solved', answer: 'I cut deploy time by half by moving to GitHub Actions.', company: 'Acme' });
    await saveAnswer({ question: 'Salary?', answer: 'short', company: 'Acme' }); // too short to keep
    const list = await loadAnswers();
    expect(list).toHaveLength(2);
    expect(matchAnswers(list, 'Why do you want to work here?').map((a) => a.company)).toEqual(['Acme']);
    expect(matchAnswers(list, 'What is your favorite color?')).toEqual([]);
  });

  it('replaces an answer to the same question at the same company', async () => {
    await saveAnswer({ question: 'Why Acme?', answer: 'First draft about robots and reliability.', company: 'Acme' });
    await saveAnswer({ question: 'Why Acme?', answer: 'Second draft about robots and reliability.', company: 'Acme' });
    const list = await loadAnswers();
    expect(list).toHaveLength(1);
    expect(list[0]!.answer).toMatch(/^Second/);
  });
});
