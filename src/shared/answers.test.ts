import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerKey, bestAnswer, clearLegacyAnswers, loadLegacyAnswers, matchAnswers, reusableFor, similarity, type SavedAnswer } from './answers';

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

describe('answers given for one company', () => {
  const stripe = { question: 'Why do you want to work at Stripe?', answer: 'I have built on Stripe for years and love its docs.', company: 'Stripe', at: 1 };
  const plain = { question: 'Why are you leaving your current job?', answer: 'I want to work on bigger data problems.', company: 'Stripe, Inc.', at: 2 };

  it('are not given on another company\'s form when they name the company', () => {
    expect(reusableFor(stripe, 'Ramp')).toBe(false);
    expect(reusableFor({ ...stripe, question: 'Why us?' }, 'Ramp')).toBe(false);
    expect(reusableFor(stripe, 'Stripe Inc.')).toBe(true);
    expect(reusableFor(plain, 'Ramp')).toBe(true);
    // A company whose name is inside another word is not named ("Ramp" in "ramping up").
    expect(reusableFor({ question: 'How do you get up to speed?', answer: 'Ramping up fast.', company: 'Ramp' }, 'Notion')).toBe(true);
  });

  it('are left out when matching a question for another company', () => {
    expect(bestAnswer([stripe], 'Why do you want to work at Ramp?', 0.75, 'Ramp')).toBeNull();
    expect(bestAnswer([stripe], 'Why do you want to work at Stripe?', 0.75, 'Stripe')).toBe(stripe);
    expect(bestAnswer([stripe, plain], 'Why are you leaving your current job?', 0.75, 'Ramp')).toBe(plain);
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
