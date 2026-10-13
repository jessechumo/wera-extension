import { describe, expect, it, vi } from 'vitest';
import type { Applicant, FillResult, PageInfo } from '../shared/types';
import { fill, insert, readPage } from './page';

const tab = { id: 7, url: 'https://acme.example/careers/sre', active: true } as chrome.tabs.Tab;
const top: PageInfo = { url: tab.url!, title: 'SRE', text: 'About us', draft: null, hasForm: false, frameOrigins: ['https://job-boards.greenhouse.io', 'https://other.example'] };
const framed: PageInfo = { url: 'https://job-boards.greenhouse.io/embed/job_app', title: '', text: '', draft: null, hasForm: true, submitted: true };

/** A tab whose top frame (0) is a careers page and frame 4 an embedded Greenhouse form. */
function stubFrames() {
  const sent: { frameId: number; msg: { type: string; id?: string } }[] = [];
  const reply = (frameId: number, msg: { type: string }) => {
    if (msg.type === 'wera:read-page') return frameId === 0 ? top : framed;
    if (msg.type === 'wera:fill') {
      const r: FillResult = { id: 'w1', label: frameId === 0 ? 'Newsletter email' : 'Email', purpose: 'email', status: 'filled', required: false };
      return [r];
    }
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

  it('fills only the frame holding the form, and routes inserts back to it', async () => {
    const sent = stubFrames();
    const out = await fill(tab, {} as Applicant);
    expect(out).toEqual([expect.objectContaining({ id: 'f4/w1', label: 'Email' })]);
    expect(sent.filter((s) => s.msg.type === 'wera:fill').map((s) => s.frameId)).toEqual([4]);
    await insert(tab, 'f4/w1', 'hello');
    expect(sent.at(-1)).toEqual({ frameId: 4, msg: { type: 'wera:insert', id: 'w1', text: 'hello' } });
  });
});
