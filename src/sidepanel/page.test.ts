import { describe, expect, it, vi } from 'vitest';
import type { Applicant, FillResult, PageInfo, PagePlan } from '../shared/types';
import { apply, highlightField, insert, pressNext, readPage, scan, snapshotForm } from './page';

const tab = { id: 7, url: 'https://acme.example/careers/sre', active: true } as chrome.tabs.Tab;
const top: PageInfo = { url: tab.url!, title: 'SRE', text: 'About us', draft: null, hasForm: false, frameOrigins: ['https://job-boards.greenhouse.io', 'https://other.example'] };
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
    if (msg.type === 'wera:insert') return { ok: true };
    return null;
  };
  vi.stubGlobal('chrome', {
    scripting: { executeScript: vi.fn(async () => [{ frameId: 0 }, { frameId: 4 }]) },
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
    const plan = await scan(tab, {} as Applicant, []);
    expect(plan.fields.map((f) => f.id)).toEqual(['f4/w1']);
    expect(plan.next).toEqual({ id: 'f4/n1', label: 'Next', final: false });
    expect(plan.errors).toBe(1);
    expect(sent.filter((s) => s.msg.type === 'wera:scan').map((s) => s.frameId)).toEqual([4]);

    const out = await apply(tab, [{ id: 'f4/w1', value: 'a@x' }]);
    expect(out).toEqual([expect.objectContaining({ id: 'f4/w1', status: 'filled' })]);
    expect(sent.find((s) => s.msg.type === 'wera:apply')).toMatchObject({ frameId: 4, msg: { items: [{ id: 'w1', value: 'a@x' }] } });
    expect(await snapshotForm(tab)).toEqual([expect.objectContaining({ id: 'f4/w1', value: 'a@x' })]);
    expect(await pressNext(tab, 'f4/n1')).toEqual({ ok: true, label: 'Next' });
    expect(sent.at(-1)).toMatchObject({ frameId: 4, msg: { type: 'wera:next' } });
    await highlightField(tab, 'f4/w1');
    expect(sent.at(-1)).toEqual({ frameId: 4, msg: { type: 'wera:highlight', id: 'w1' } });
    await insert(tab, 'f4/w1', 'hello');
    expect(sent.at(-1)).toEqual({ frameId: 4, msg: { type: 'wera:insert', id: 'w1', text: 'hello' } });
  });
});
