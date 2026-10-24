import { describe, expect, it, vi } from 'vitest';
import type { FillResult, PageInfo, PagePlan, ScanRequest } from '../shared/types';
import { apply, highlight, options, pressNext, readPage, scan, snapshot } from './frames';

const req = { profile: {}, answers: [] } as unknown as ScanRequest;

const tab = 7;
const top: PageInfo = { url: 'https://acme.example/careers/sre', title: 'SRE', text: 'About us', draft: null, hasForm: false, frameOrigins: ['https://job-boards.greenhouse.io', 'https://other.example'] };
const framed: PageInfo = { url: 'https://job-boards.greenhouse.io/embed/job_app', title: '', text: '', draft: null, hasForm: true, submitted: true };

/** A tab whose top frame (0) is a careers page and frame 4 an embedded Greenhouse form. */
function stubFrames() {
  const sent: { frameId: number; msg: { type: string; id?: string } }[] = [];
  const reply = (frameId: number, msg: { type: string }) => {
    if (msg.type === 'wera:read-page') return frameId === 0 ? top : framed;
    if (msg.type === 'wera:scan') {
      const plan: PagePlan = {
        fields: [{ id: 'w1', label: 'Email', purpose: 'email', kind: 'text', options: [], required: true, current: '', value: 'a@x', source: 'details', group: 'details' }],
        next: { id: 'n1', label: 'Next', final: false }, errors: 1,
      };
      return plan;
    }
    if (msg.type === 'wera:apply') {
      const r: FillResult = { id: 'w1', label: 'Email', purpose: 'email', status: 'filled', required: false };
      return [r];
    }
    if (msg.type === 'wera:snapshot') return [{ id: 'w1', label: 'Email', purpose: 'email', kind: 'text', value: 'a@x' }];
    if (msg.type === 'wera:next') return { ok: true, label: 'Next' };
    if (msg.type === 'wera:highlight') return { ok: true };
    if (msg.type === 'wera:options') return { w1: ['Yes', 'No'] };
    return null;
  };
  vi.stubGlobal('chrome', {
    // Both frames have Wera's page script (the background checks before working them).
    scripting: { executeScript: vi.fn(async () => [{ frameId: 0, result: true }, { frameId: 4, result: true }]) },
    tabs: {
      sendMessage: vi.fn(async (_tab: number, msg: { type: string }, opts?: { frameId: number }) => {
        const frameId = opts?.frameId ?? 0;
        sent.push({ frameId, msg });
        return reply(frameId, msg);
      }),
    },
  });
  return sent;
}

describe('pages with embedded forms', () => {
  it('adds the page script to frames opened before Wera was installed, once', async () => {
    stubFrames();
    const exec = chrome.scripting.executeScript as unknown as ReturnType<typeof vi.fn<(o: unknown) => Promise<unknown>>>;
    exec.mockImplementationOnce(() => Promise.resolve([{ frameId: 0, result: true }, { frameId: 4, result: false }]));
    await readPage(tab);
    expect(exec.mock.calls.some(([o]) => (o as { files?: string[] }).files?.[0] === 'page.js')).toBe(true);
  });

  it('merges what the frames report and drops prompts for frames it already reads', async () => {
    stubFrames();
    const p = await readPage(tab);
    expect(p.title).toBe('SRE');
    expect(p.hasForm).toBe(true);
    expect(p.submitted).toBe(true);
    expect(p.frameOrigins).toEqual(['https://other.example']);
  });

  it('reads and fills only the frame holding the form, and routes every request back to it', async () => {
    const sent = stubFrames();
    const plan = await scan(tab, req);
    expect(plan.fields.map((f) => f.id)).toEqual(['f4/w1']);
    expect(plan.next).toEqual({ id: 'f4/n1', label: 'Next', final: false });
    expect(plan.errors).toBe(1);
    expect(sent.filter((s) => s.msg.type === 'wera:scan').map((s) => s.frameId)).toEqual([4]);

    const out = await apply(tab, { items: [{ id: 'f4/w1', value: 'a@x' }], pace: 30 });
    expect(out).toEqual([expect.objectContaining({ id: 'f4/w1', status: 'filled' })]);
    expect(sent.find((s) => s.msg.type === 'wera:apply')).toMatchObject({ frameId: 4, msg: { req: { items: [{ id: 'w1', value: 'a@x' }], pace: 30 } } });
    expect(await snapshot(tab)).toEqual([expect.objectContaining({ id: 'f4/w1', value: 'a@x' })]);
    expect(await pressNext(tab, 'f4/n1')).toEqual({ ok: true, label: 'Next' });
    expect(sent.at(-1)).toMatchObject({ frameId: 4, msg: { type: 'wera:next' } });
    await highlight(tab, 'f4/w1');
    expect(sent.at(-1)).toEqual({ frameId: 4, msg: { type: 'wera:highlight', id: 'w1' } });
    expect(await options(tab, ['f4/w1'])).toEqual({ 'f4/w1': ['Yes', 'No'] });
    expect(sent.at(-1)).toEqual({ frameId: 4, msg: { type: 'wera:options', ids: ['w1'] } });
  });

  it('waits for an embedded form that is still loading instead of filling the page around it', async () => {
    const sent = stubFrames();
    let reads = 0;
    const send = chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn<(id: number, msg: { type: string }, opts?: { frameId: number }) => Promise<unknown>>>;
    const real = send.getMockImplementation()!;
    send.mockImplementation(async (id: number, msg: { type: string }, opts?: { frameId: number }) => {
      // The framed form answers only from the second read on.
      if (msg.type === 'wera:read-page' && opts?.frameId === 4 && reads++ === 0) throw new Error('not loaded yet');
      return real(id, msg, opts);
    });
    const plan = await scan(tab, req);
    expect(plan.fields.map((f) => f.id)).toEqual(['f4/w1']);
    expect(sent.filter((s) => s.msg.type === 'wera:scan').map((s) => s.frameId)).toEqual([4]);
  });
});

