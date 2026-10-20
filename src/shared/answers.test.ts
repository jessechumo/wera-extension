import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerKey, bestAnswer, clearLegacyAnswers, loadLegacyAnswers, matchAnswers, similarity, type SavedAnswer } from './answers';

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

const a = (question: string, answer: string, at = 1, company = 'Acme'): SavedAnswer => ({ question, answer, company, at });

describe('matching questions to answers', () => {
  it('keys questions the way Wera does', () => {
    expect(answerKey('What is your notice period? *')).toBe('what is your notice period');
    expect(answerKey('  WHAT is your notice-period (required)')).toBe('what is your notice period');
    expect(answerKey('?!')).toBe('');
  });

  it('finds the same question, then a very similar one', () => {
    const list = [a('What is your notice period?', 'Two weeks'), a('Do you hold an active security clearance?', 'No')];
    expect(bestAnswer(list, 'what is your notice period *')?.answer).toBe('Two weeks');
    expect(bestAnswer(list, 'Do you currently hold an active security clearance?')?.answer).toBe('No');
    expect(bestAnswer(list, 'What is your favorite color?')).toBeNull();
    expect(bestAnswer(list, '')).toBeNull();
  });

  it('ranks earlier answers to open questions', () => {
    expect(similarity('Why do you want to work at Acme?', 'Why do you want to work here?')).toBeGreaterThanOrEqual(0.5);
    expect(similarity('Why do you want to work at Acme?', 'Describe a technical challenge')).toBe(0);
    const list = [a('Why do you want to work at Acme?', 'Robots.', 1), a('Why do you want to work at Initech?', 'Printers.', 2, 'Initech')];
    expect(matchAnswers(list, 'Why do you want to work here?').map((x) => x.company)).toEqual(['Initech', 'Acme']);
    expect(matchAnswers(list, 'What is your favorite color?')).toEqual([]);
  });
});

describe('answers kept by older versions', () => {
  beforeEach(() => {
    store = {};
  });

  it('loads and clears them', async () => {
    expect(await loadLegacyAnswers()).toEqual([]);
    store['wera.answers'] = [a('Why Acme?', 'Robots and reliability at scale.')];
    expect(await loadLegacyAnswers()).toHaveLength(1);
    await clearLegacyAnswers();
    expect(await loadLegacyAnswers()).toEqual([]);
  });
});
