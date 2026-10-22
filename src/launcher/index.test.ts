import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isJobUrl, jobSummary, pageKind } from '../content/detect';
import type { DockHello, DockJob, SubmitReply } from '../shared/dock';
import { renderDock, type DockActions, type DockState } from './dock';
import { start, submitToast } from './index';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'content', '__fixtures__', name), 'utf8');
const posting = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'SRE', hiringOrganization: { name: 'Acme' }, description: 'Run things.' })}</script><h1>SRE</h1>`;
// A company's own careers page: no job data, but it reads like a posting.
const plain = `<h1>Senior Registered Nurse, ICU</h1><a href="/apply">Apply now</a>
  <h2>About the role</h2><p>Care for patients.</p><h2>Responsibilities</h2><ul><li>Rounds</li></ul>
  <h2>Qualifications</h2><p>3+ years of experience</p><h2>Benefits</h2><p>Good ones.</p>`;
const job: DockJob = { id: 4, title: 'SRE', company: 'Acme', score: 82, estimate: false, verdict: 'strong', status: 'saved', autofilled: true };

function at(url: string) {
  window.history.replaceState(null, '', url);
}

let stops: (() => void)[] = [];
const run = (doc: Document, delay: number) => stops.push(start(doc, delay));

afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
  at('/');
  document.querySelectorAll('wera-launcher').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

describe('telling job pages from other pages', () => {
  it('knows application forms, postings with job data, and everything else', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    expect(pageKind(document)).toBe('form');
    document.body.innerHTML = posting;
    expect(pageKind(document)).toBe('posting');
    document.body.innerHTML = '<form><label>Search <input name="q"></label><label>Email <input type="email"></label></form>';
    expect(pageKind(document)).toBeNull();
  });

  it('reads a posting without job data by what is on it', () => {
    at('/careers/icu-nurse-4411');
    document.body.innerHTML = plain;
    expect(pageKind(document)).toBe('posting');
    // The same words in a blog post, without an Apply button or a job address, are not a posting.
    at('/blog/what-nurses-do');
    document.body.innerHTML = '<h1>What ICU nurses do</h1><p>Responsibilities and qualifications vary.</p>';
    expect(pageKind(document)).toBeNull();
  });

  it('knows the addresses of job boards', () => {
    for (const url of [
      'https://boards.greenhouse.io/acme/jobs/123', 'https://jobs.lever.co/acme/2f1c3b0e-4b8f-4c55-9a7e-5c0d1e2f3a4b',
      'https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/SRE_R123', 'https://www.linkedin.com/jobs/view/4012345678/',
      'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678', 'https://www.indeed.com/viewjob?jk=abc',
      'https://apply.workable.com/acme/j/1A2B3C4D5E/', 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210512345',
    ]) expect(isJobUrl(url), url).toBe(true);
    expect(isJobUrl('https://www.linkedin.com/feed/')).toBe(false);
    expect(isJobUrl('https://boards.greenhouse.io/acme')).toBe(false);
  });

  it('names the job and company for the dock', () => {
    document.body.innerHTML = posting;
    expect(jobSummary(document)).toEqual({ title: 'SRE', company: 'Acme' });
    document.body.innerHTML = plain;
    expect(jobSummary(document).title).toBe('Senior Registered Nurse, ICU');
  });

  it('stays off the Wera dashboard (its own forms are not applications)', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    document.documentElement.dataset.weraExtension = '0.3.0';
    expect(pageKind(document)).toBeNull();
    delete document.documentElement.dataset.weraExtension;
  });
});

describe('the dock', () => {
  const actions = (): DockActions => ({ open: vi.fn(), save: vi.fn(), minimize: vi.fn(), expand: vi.fn() });
  const state = (p: Partial<DockState> = {}): DockState => ({
    kind: 'form', title: 'SRE', company: 'Acme', hello: { signedIn: true, job }, canSave: true, open: true, busy: false, error: '', ...p,
  });
  const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')].map((b) => b.textContent);

  it('on a form: a big Autofill button that opens Wera and fills, plus letter and resume', () => {
    const act = actions();
    const card = renderDock(document, state(), act);
    expect(card.textContent).toContain('82');
    expect(card.textContent).toContain('Autofilled');
    const big = card.querySelector<HTMLButtonElement>('.big')!;
    expect(big.textContent).toBe('Autofill application');
    big.click();
    expect(act.open).toHaveBeenCalledWith('apply', true);
    [...card.querySelectorAll<HTMLButtonElement>('.sec')].find((b) => b.textContent === 'Cover letter')!.click();
    expect(act.open).toHaveBeenLastCalledWith('letter');
    expect(buttons(card)).toContain('Tailor resume');
  });

  it('on a posting not in Wera: saves it, or reads it with AI in the panel when it has no job data', () => {
    const act = actions();
    renderDock(document, state({ kind: 'posting', hello: { signedIn: true, job: null } }), act).querySelector<HTMLButtonElement>('.big')!.click();
    expect(act.save).toHaveBeenCalledOnce();
    renderDock(document, state({ kind: 'posting', canSave: false, hello: { signedIn: true, job: null } }), act).querySelector<HTMLButtonElement>('.big')!.click();
    expect(act.open).toHaveBeenCalledWith('job');
  });

  it('asks to sign in when the extension is not connected', () => {
    const card = renderDock(document, state({ hello: { signedIn: false, job: null } }), actions());
    expect(card.querySelector('.big')!.textContent).toBe('Sign in to Wera');
    expect(buttons(card)).not.toContain('Cover letter');
  });

  it('minimizes to a tab on the edge, with the score', () => {
    const act = actions();
    const tab = renderDock(document, state({ open: false }), act);
    expect(tab.getAttribute('aria-label')).toBe('Show the Wera panel');
    expect(tab.textContent).toContain('82');
    tab.click();
    expect(act.expand).toHaveBeenCalledOnce();
  });

  it('page text never becomes markup', () => {
    const card = renderDock(document, state({ hello: { signedIn: true, job: { ...job, title: '<img src=x onerror=alert(1)>' } } }), actions());
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('after submitting', () => {
  it('says the job is marked applied, with an undo back to where it was', () => {
    const act = { undo: vi.fn(), open: vi.fn(), add: vi.fn() };
    const t = submitToast({ state: 'marked', job, previous: 'saved' }, act)!;
    expect(t.title).toBe('Marked as applied');
    t.actions[0]!.run();
    expect(act.undo).toHaveBeenCalledWith(job, 'saved');
    expect(submitToast({ state: 'unknown', draft: { title: 'SRE', company: 'Acme' } }, act)!.actions[0]!.label).toBe('Add as applied');
    expect(submitToast({ state: 'already', job }, act)).toBeNull();
    expect(submitToast({ state: 'off' }, act)).toBeNull();
  });
});

describe('on a page', () => {
  function fakeChrome(hello: DockHello, submit: SubmitReply = { state: 'off' }, storage: Record<string, unknown> = {}) {
    const sent: { type: string }[] = [];
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'x',
        sendMessage: vi.fn(async (m: { type: string }) => {
          sent.push(m);
          return m.type === 'wera:dock-hello' ? hello : m.type === 'wera:dock-submitted' ? submit : null;
        }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: { local: { get: vi.fn(async () => storage), set: vi.fn(async (o: object) => Object.assign(storage, o)) } },
    });
    return sent;
  }
  // The dock's shadow root is closed: tests read what it rendered through its host's text.
  const dockText = () => {
    const host = document.querySelector<HTMLElement>('wera-launcher');
    return host && !host.hidden ? 'shown' : '';
  };

  it('slides in on a job page and asks Wera about it', async () => {
    const sent = fakeChrome({ signedIn: true, job });
    document.body.innerHTML = fixture('greenhouse.html');
    run(document, 5);
    await vi.waitFor(() => expect(dockText()).toBe('shown'));
    expect(sent[0]).toMatchObject({ type: 'wera:dock-hello', kind: 'form' });
  });

  it('stays away when turned off, and on the Wera server', async () => {
    fakeChrome({ signedIn: true, job }, { state: 'off' }, { 'wera.settings': { launcher: false } });
    document.body.innerHTML = posting;
    run(document, 5);
    await new Promise((r) => setTimeout(r, 40));
    expect(dockText()).toBe('');
  });

  it('keeps what the user answered (self-identification too) when they move the application on', async () => {
    const sent = fakeChrome({ signedIn: true, job });
    document.body.innerHTML = `<form><label for="fn">First name</label><input id="fn" value="Ada">
      <label for="em">Email</label><input id="em" type="email" value="ada@example.com">
      <label for="ph">Phone</label><input id="ph" value="512 555 0142">
      <label for="g">Gender</label><select id="g"><option value="">Select</option><option selected>Woman</option></select>
      <label for="w">Why us?</label><textarea id="w">Robots.</textarea>
      <button type="button" id="next">Save and Continue</button></form>`;
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:dock-hello')).toBe(true));
    document.querySelector<HTMLButtonElement>('#next')!.click();
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:dock-learn')).toBe(true));
    const learn = sent.find((m) => m.type === 'wera:dock-learn') as unknown as { entries: { purpose: string; value: string }[] };
    expect(learn.entries).toEqual(expect.arrayContaining([{ purpose: 'gender', value: 'Woman' }, { purpose: 'phone', value: '512 555 0142' }]));
    // Open questions are answers for that job, not details.
    expect(learn.entries.some((e) => e.purpose === 'question')).toBe(false);
  });

  it('comes back when the page rebuilds itself and wipes it (Greenhouse job boards)', async () => {
    fakeChrome({ signedIn: true, job });
    document.body.innerHTML = fixture('greenhouse.html');
    run(document, 5);
    await vi.waitFor(() => expect(dockText()).toBe('shown'));
    // What a framework re-rendering the whole document does: a new body, and nothing it did not render.
    const html = document.body.innerHTML;
    document.querySelector('wera-launcher')!.remove();
    document.documentElement.replaceChild(document.createElement('body'), document.body);
    document.body.innerHTML = html;
    await vi.waitFor(() => expect(dockText()).toBe('shown'));
  });

  it('goes quietly when the extension is reloaded under it', async () => {
    fakeChrome({ signedIn: true, job });
    document.body.innerHTML = fixture('greenhouse.html');
    run(document, 5);
    await vi.waitFor(() => expect(dockText()).toBe('shown'));
    // What Chrome does to scripts left in open tabs: the runtime is gone and every call throws.
    const runtime = chrome.runtime as unknown as { id?: string; sendMessage: () => never };
    delete runtime.id;
    runtime.sendMessage = () => {
      throw new Error('Extension context invalidated.');
    };
    document.body.append(document.createElement('div'));
    await vi.waitFor(() => expect(document.querySelector('wera-launcher')).toBeNull());
  });

  it('tells Wera when the form gives way to a thank-you message', async () => {
    const sent = fakeChrome({ signedIn: true, job }, { state: 'marked', job: { ...job, status: 'applied' }, previous: 'saved' });
    document.body.innerHTML = fixture('greenhouse.html');
    run(document, 5);
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:dock-hello')).toBe(true));
    document.body.innerHTML = '<h1>Thank you for applying!</h1><p>We will be in touch.</p>';
    await vi.waitFor(() => expect(sent.some((m) => m.type === 'wera:dock-submitted')).toBe(true));
    expect(sent.filter((m) => m.type === 'wera:dock-submitted')).toHaveLength(1);
  });
});
