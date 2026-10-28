import { describe, expect, it } from 'vitest';
import type { FieldPlan, FieldSnapshot } from './types';
import { answersToLearn } from './learn';

const plan = (id: string, label: string, over: Partial<FieldPlan> = {}): FieldPlan => ({
  id, label, purpose: null, kind: 'text', options: [], required: false, current: '', value: '', source: null, group: 'other', ...over,
});
const snap = (id: string, value: string, kind = 'text', label = ''): FieldSnapshot => ({ id, label, purpose: null, kind, value });

const fields = [
  plan('a', 'Favorite tool *'),
  plan('b', 'Why us?', { group: 'questions', purpose: 'question', kind: 'textarea' }),
  plan('c', 'Phone', { group: 'details', purpose: 'phone' }),
  plan('d', 'Gender', { group: 'self_id', purpose: 'gender', kind: 'select' }),
  plan('e', 'I agree', { group: 'consent', purpose: 'consent', kind: 'checkbox' }),
  plan('f', 'Clearance level', { kind: 'select' }),
  plan('g', 'Short why', { group: 'questions', purpose: 'question', kind: 'textarea' }),
  plan('h', 'Willing to travel?', { group: 'details', purpose: 'willing_to_travel', kind: 'radio' }),
  plan('i', 'Full name', { group: 'details', purpose: 'full_name' }),
];

describe('answersToLearn', () => {
  it('keeps answers to questions and unknown fields only', () => {
    const got = answersToLearn(fields, [
      snap('a', 'Terraform'), snap('b', 'Because you build reliable robots at scale.', 'textarea'), snap('c', '512 555 0142'),
      snap('d', 'Female', 'select'), snap('e', 'yes', 'checkbox'), snap('f', 'Secret', 'select'), snap('g', 'Robots.', 'textarea'),
      snap('zz', 'gone'),
    ], [{ question: 'Clearance level', answer: 'Secret', company: '', at: 1 }], 'Acme');
    expect(got).toEqual([
      { question: 'Favorite tool', answer: 'Terraform', kind: 'text', company: 'Acme' },
      { question: 'Why us?', answer: 'Because you build reliable robots at scale.', kind: 'long', company: 'Acme' },
    ]);
  });
});
