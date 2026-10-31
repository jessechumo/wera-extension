import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectFields } from '../content/fields';
import { isOpenQuestion, startAssist, wordsFor } from './assist';

const FORM = `<form>
  <label for="fn">First name</label><input id="fn">
  <label for="em">Email</label><input id="em" type="email">
  <label for="ph">Phone</label><input id="ph" type="tel">
  <label for="why">Tell us about a time you fixed something under pressure.</label><textarea id="why" maxlength="650"></textarea>
  <label for="cl">Cover letter</label><textarea id="cl"></textarea>
  <label for="nt">Notes</label><input id="nt">
</form>`;

describe('which boxes get the Wera button', () => {
  beforeEach(() => {
    document.body.innerHTML = FORM;
  });

  it('open questions and cover letter boxes, never names or emails', () => {
    const got = collectFields(document).filter(isOpenQuestion).map((f) => f.el.id);
    expect(got).toEqual(['why', 'cl']);
  });

  it('answers fit the box: its character limit, else a short answer for a one-line box', () => {
    const [why] = collectFields(document).filter((f) => f.el.id === 'why');
    expect(wordsFor(why!)).toBe(100);
  });
});

describe('the Wera button', () => {
  let stop: () => void;
  const calls: { method: string; args: unknown[] }[] = [];
  beforeEach(() => {
    calls.length = 0;
    document.body.innerHTML = FORM;
    window.__weraPage = { kind: 'form', title: 'SRE', company: 'Acme', draft: null, submitted: null, canApply: false, subscribe: () => () => {} };
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'x', getURL: (p: string) => p,
        sendMessage: vi.fn(async (m: { type: string; method?: string; args?: unknown[] }) => {
          if (m.type === 'wera:job-context') return { jobId: 7, posting: null };
          if (m.type !== 'wera:api') return null;
          calls.push({ method: m.method!, args: m.args! });
          if (m.method === 'answers') return { ok: true, value: [] };
          const rework = m.args![4] as { instructions?: string } | undefined;
          return { ok: true, value: { answer: rework?.instructions ? 'One sentence about the outage.' : 'When the payments queue stalled, I traced it to a lock and shipped a fix in an hour.' } };
        }),
      },
      storage: {
        local: { get: vi.fn(async (k: string) => (k === 'wera.session' ? { 'wera.session': { server: 'https://wera.example' } } : { 'wera.settings': {} })) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    stop = startAssist(document);
  });
  afterEach(() => {
    stop();
    delete window.__weraPage;
    vi.unstubAllGlobals();
  });

  const shadow = () => document.querySelector('wera-assist')?.shadowRoot ?? null;
  const button = (name: string) => [...(shadow()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(name));

  it('shows on an open question, drafts from the profile, reworks on request, and inserts', async () => {
    const why = document.querySelector<HTMLTextAreaElement>('#why')!;
    why.focus();
    await vi.waitFor(() => expect(button('Draft this answer with Wera')).toBeTruthy());
    button('Draft this answer with Wera')!.click();
    await vi.waitFor(() => expect(shadow()!.querySelector('.draft')!.textContent).toMatch(/payments queue/));
    expect(calls.find((c) => c.method === 'answer')!.args.slice(0, 3)).toEqual(['Tell us about a time you fixed something under pressure.', 7, 100]);

    const steer = shadow()!.querySelector<HTMLInputElement>('input')!;
    steer.value = 'one sentence';
    steer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(shadow()!.querySelector('.draft')!.textContent).toBe('One sentence about the outage.'));
    expect(calls.filter((c) => c.method === 'answer').at(-1)!.args[4]).toEqual({ draft: expect.stringMatching(/payments queue/), instructions: 'one sentence' });

    button('Insert')!.click();
    expect(why.value).toBe('One sentence about the outage.');
    expect(shadow()!.querySelector('.pop')).toBeNull();
  });

  it('never shows on a name box', async () => {
    document.querySelector<HTMLInputElement>('#fn')!.focus();
    await new Promise((r) => setTimeout(r, 50));
    expect(button('Draft this answer with Wera')).toBeUndefined();
  });

  it('stays off pages that are not applications', async () => {
    window.__weraPage!.kind = null;
    document.body.innerHTML = '<label for="c">Comment</label><textarea id="c"></textarea>';
    document.querySelector<HTMLTextAreaElement>('#c')!.focus();
    await new Promise((r) => setTimeout(r, 50));
    expect(button('Draft this answer with Wera')).toBeUndefined();
  });
});
