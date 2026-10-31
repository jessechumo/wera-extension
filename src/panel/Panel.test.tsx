import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageHandle } from '../page';
import type { WeraJob } from '../shared/api';
import type { ApplyRequest, FieldPlan, FillItem, FillResult, JobDraft, PageInfo, PagePlan } from '../shared/types';
import { App, type Show } from './index';

// A fill reads the page again as it settles.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20_000 });

const draft: JobDraft = { url: 'https://jobs.example/acme/1', company: 'Acme', title: 'SRE', location: 'Austin, TX', work_mode: '', employment_type: '',
  department: '', salary: '', industry: '', description: 'Keep things up.', source: 'page-data' };
const job: WeraJob = {
  id: 9, company: 'Acme', title: 'SRE', url: draft.url, location_raw: 'Austin, TX', location_summary: null, stage: 'scored', fit_score: 81,
  estimated_score: null, verdict: 'strong', reason: '', sponsorship: 'yes', skills_matched: [], skills_missing: [], application_status: 'saved', source: 'manual',
};
const field = (id: string, label: string, over: Partial<FieldPlan> = {}): FieldPlan => ({
  id, label, purpose: null, kind: 'text', options: [], required: false, current: '', value: '', source: null, group: 'other', ...over,
});

type Fn = (...a: never[]) => unknown;

/** A form that keeps what goes into it, and shows it the next time it is read. */
function formPage(plan: PagePlan, onApply: (req: ApplyRequest) => void = () => {}) {
  const shows = new Map<string, string>();
  return {
    shows,
    scan: () => ({ ...plan, fields: plan.fields.map((f) => ({ ...f, current: shows.get(f.id) ?? f.current })) }),
    apply: (req: ApplyRequest) => {
      onApply(req);
      req.items.forEach((i) => shows.set(i.id, i.value));
      return req.items.map((i): FillResult => ({ id: i.id, label: '', purpose: null, status: 'filled', value: i.value, required: false }));
    },
  };
}

/** A fill has finished: a test that ends sooner leaves it running into the next test's page. */
const finished = () => screen.findByRole('button', { name: /Fill again/ });

/** Just the frames' side of formPage. */
function formPageFrames(plan: PagePlan, onApply?: (req: ApplyRequest) => void): Record<string, Fn> {
  const { scan, apply } = formPage(plan, onApply);
  return { scan, apply };
}

/** The background as the panel talks to it: Wera's API and the page's frames, faked. */
function fakeBackground(opts: { signedIn?: boolean; job?: WeraJob | null; info?: Partial<PageInfo>; api?: Record<string, Fn>; frames?: Record<string, Fn> } = {}) {
  const store: Record<string, unknown> = opts.signedIn === false ? {} : { 'wera.session': { server: 'https://wera.example', token: 't', user: { id: 1 } } };
  const session: Record<string, unknown> = {};
  const changed = new Set<(c: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const listeners = new Set<(m: unknown) => void>();
  const calls: { kind: string; name: string; args: unknown[] }[] = [];
  const api: Record<string, Fn> = {
    applicant: () => ({ applicant: { first_name: 'Ada' }, saved: true, sources: {}, experience: [], education: [], skills: [] }),
    answers: () => [], resumeFile: () => ({ name: 'Ada.pdf', base64: 'JVBERi0=', kind: 'base' }), coverLetter: () => null,
    addJob: () => job, saveAnswers: () => ({ answers: [] }), saveApplicant: () => ({}), startRun: () => ({ id: 3 }), addRunPage: () => ({ id: 3 }),
    ...opts.api,
  };
  const frames: Record<string, Fn> = {
    read: () => ({ url: draft.url, title: 'SRE at Acme', text: 'About the role', draft, hasForm: false, ...opts.info }),
    snapshot: () => [], highlight: () => null,
    ...opts.frames,
  };
  const reply = async (fn: Fn | undefined, name: string, args: unknown[]) => {
    if (!fn) return { ok: false, status: 501, error: `no ${name}` };
    try {
      return { ok: true, value: await fn(...(args as never[])) };
    } catch (e) {
      return { ok: false, status: 500, error: String(e) };
    }
  };
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'x', getURL: (p: string) => p,
      sendMessage: vi.fn(async (m: { type: string; method?: string; op?: string; args?: unknown[]; server?: string }) => {
        if (m.type === 'wera:api') {
          calls.push({ kind: 'api', name: m.method!, args: m.args! });
          return reply(api[m.method!], m.method!, m.args!);
        }
        if (m.type === 'wera:frames') {
          calls.push({ kind: 'frames', name: m.op!, args: m.args! });
          return reply(frames[m.op!], m.op!, m.args!);
        }
        if (m.type === 'wera:job-resolve') return opts.job ?? null;
        if (m.type === 'wera:sign-in') {
          store['wera.session'] = { server: m.server, token: 't', user: { id: 1 } };
          changed.forEach((f) => f({ 'wera.session': { newValue: store['wera.session'] } }, 'local'));
          return { ok: true, value: {} };
        }
        if (m.type === 'wera:sign-out') {
          delete store['wera.session'];
          changed.forEach((f) => f({ 'wera.session': { newValue: undefined } }, 'local'));
          return { ok: true, value: null };
        }
        return null;
      }),
      onMessage: { addListener: (f: (m: unknown) => void) => listeners.add(f), removeListener: (f: (m: unknown) => void) => listeners.delete(f) },
    },
    storage: {
      local: {
        get: vi.fn(async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).filter((x) => x in store).map((x) => [x, store[x]]))),
        set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(store, o)),
      },
      session: {
        get: vi.fn(async (k: string) => (k in session ? { [k]: session[k] } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(session, o)),
      },
      onChanged: { addListener: (f: never) => changed.add(f), removeListener: (f: never) => changed.delete(f) },
    },
  });
  /** A message from the background to the panel (a frame's event, a job change). */
  const emit = (m: unknown) => act(() => listeners.forEach((f) => f(m)));
  return { calls, store, session, emit };
}

const handle = (kind: 'form' | 'posting' | null): PageHandle => ({ kind, title: 'SRE', company: 'Acme', draft, submitted: null, canApply: false, subscribe: () => () => {} });
const show = (over: Partial<Show> = {}): Show => ({ tabId: 5, initial: true, collapsedHere: false, opens: 0, toggles: 0, fills: 0, formFrames: 0, ...over });

afterEach(() => {
  cleanup(); // before the fake chrome goes: unmounting unhooks its listeners
  vi.unstubAllGlobals();
});

describe('the Wera panel', () => {
  it('signs in from the page, then offers to save the posting', async () => {
    const { calls } = fakeBackground({ signedIn: false });
    render(<App handle={handle('posting')} show={show()} />);
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret password');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await userEvent.click(await screen.findByRole('button', { name: /Save to Wera/ }));
    await screen.findByText('Open in Wera');
    expect(calls.find((c) => c.name === 'addJob')?.args[0]).toMatchObject({ company: 'Acme', title: 'SRE' });
  });

  it('collapses to a tab with Wera\'s mark (no score), and opens again', async () => {
    fakeBackground({ job });
    render(<App handle={handle('posting')} show={show({ initial: false })} />);
    const tab = await screen.findByRole('button', { name: 'Show the Wera panel' });
    expect(tab.querySelector('svg')).toHaveAttribute('width', '30');
    expect(tab).toHaveTextContent('');
    await userEvent.click(tab);
    expect(await screen.findByRole('dialog', { name: 'Wera' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the Wera panel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens when an application loads after the page, unless collapsed on this site before', async () => {
    fakeBackground({ job, info: { hasForm: true } });
    const { unmount } = render(<App handle={handle('posting')} show={show({ initial: false })} />);
    expect(await screen.findByRole('dialog', { name: 'Wera' })).toBeInTheDocument();
    unmount();
    render(<App handle={handle('posting')} show={show({ initial: false, collapsedHere: true })} />);
    expect(await screen.findByRole('button', { name: 'Show the Wera panel' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays when a frame holds the form, even if it answered after the page was read', async () => {
    let hasForm = false;
    const { calls } = fakeBackground({ frames: { read: () => ({ url: draft.url, title: 'Careers', text: '', draft: null, hasForm }) } });
    const { rerender } = render(<App handle={handle(null)} show={show({ formFrames: 1 })} />);
    expect(await screen.findByRole('dialog', { name: 'Wera' })).toBeInTheDocument();
    hasForm = true;
    const reads = calls.filter((c) => c.name === 'read').length;
    rerender(<App handle={handle(null)} show={show({ formFrames: 2 })} />);
    await waitFor(() => expect(calls.filter((c) => c.name === 'read').length).toBeGreaterThan(reads));
    await screen.findByRole('button', { name: /^Autofill$/ });
  });

  it('goes at once when the user turns Wera off on this site, and comes back from the toolbar', async () => {
    const { store } = fakeBackground({ job });
    const { rerender } = render(<App handle={handle('posting')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: new RegExp(`Show Wera on ${location.hostname}`) }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(store['wera.hiddenSites']).toHaveProperty(location.hostname));
    rerender(<App handle={handle('posting')} show={show({ toggles: 1 })} />);
    expect(await screen.findByRole('dialog', { name: 'Wera' })).toBeInTheDocument();
  });

  it('autofills: what Wera knows at once, then the AI\'s sure answers and drafts, and lists only what needs the user', async () => {
    const plan: PagePlan = {
      fields: [
        field('w1', 'First name', { purpose: 'first_name', value: 'Ada', source: 'details', group: 'details', required: true }),
        field('w2', 'Years of Python', { group: 'other' }),
        field('w3', 'Clearance level', { group: 'other', kind: 'select', options: ['None', 'Secret'] }),
        field('w4', 'Why do you want to join Acme?', { purpose: 'question', kind: 'textarea', group: 'questions', required: true }),
        field('w5', 'I agree to the privacy policy', { purpose: 'consent', kind: 'checkbox', group: 'consent', required: true }),
      ],
      next: { id: 'n1', label: 'Submit application', final: true }, errors: 0, site: 'Greenhouse',
    };
    const applied: FillItem[][] = [];
    const { scan, apply } = formPage(plan, ({ items }) => applied.push(items.map(({ id, value }) => ({ id, value }))));
    const { calls } = fakeBackground({
      job, info: { hasForm: true },
      frames: { scan, apply },
      api: {
        suggest: () => ({ answers: [{ id: 'w2', value: '4', confidence: 'high', why: 'resume' }, { id: 'w3', value: 'None', confidence: 'low', why: 'a guess' }] }),
        answer: () => ({ answer: 'Because Acme keeps robots running.' }),
      },
    });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await screen.findByText(/Needs you \(3\)/);
    // First what Wera knew, then the AI's sure answer and the drafted question; the guess waits for the user.
    expect(applied[0]).toEqual([{ id: 'w1', value: 'Ada' }]);
    expect(applied.flat()).toEqual(expect.arrayContaining([{ id: 'w2', value: '4' }, { id: 'w4', value: 'Because Acme keeps robots running.' }]));
    expect(applied.flat().some((i) => i.id === 'w3' || i.id === 'w5')).toBe(false);
    expect(calls.filter((c) => c.name === 'suggest')).toHaveLength(1);
    expect(screen.getByText("Wera's guess: None")).toBeInTheDocument();
    expect(screen.getByText(/Wera drafted this answer/)).toBeInTheDocument();
    expect(screen.getByText('agree yourself after reading it')).toBeInTheDocument();
    expect(screen.getByText(/press/)).toHaveTextContent('Submit application');
    expect(screen.getByText('Greenhouse')).toBeInTheDocument();
    // One click uses the guess.
    await userEvent.click(screen.getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(applied.at(-1)).toEqual([{ id: 'w3', value: 'None' }]));
    // The application is counted in Wera.
    expect(calls.some((c) => c.name === 'startRun')).toBe(true);
  });

  it('writes a cover letter for this job when the form asks for one, attaches it, and asks the user to read it', async () => {
    const plan: PagePlan = {
      fields: [field('c1', 'Cover Letter', { purpose: 'cover_letter', kind: 'file', group: 'documents', required: true, note: 'no cover letter for this job yet' })],
      next: null, errors: 0,
    };
    const applied: ApplyRequest[] = [];
    const { calls } = fakeBackground({
      job, info: { hasForm: true },
      frames: { ...formPageFrames(plan, (req) => applied.push(req)) },
      api: {
        writeCoverLetter: () => ({ body: 'Dear Acme, I keep robots running.' }),
        coverLetterPdf: () => ({ name: 'Cover_Letter.pdf', base64: 'JVBERi0=' }),
      },
    });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await waitFor(() => expect(applied.some((r) => r.items.some((i) => i.id === 'c1'))).toBe(true));
    expect(calls.find((c) => c.name === 'writeCoverLetter')?.args[0]).toBe(job.id);
    expect(applied.find((r) => r.items.some((i) => i.id === 'c1'))?.letterFile).toMatchObject({ name: 'Cover_Letter.pdf' });
    expect(await screen.findByText(/Wera wrote this letter for this job/)).toBeInTheDocument();
    await finished();
  });

  it('attaches the files first: many systems read a resume and fill the form themselves', async () => {
    const plan: PagePlan = {
      fields: [
        field('n', 'Full name', { purpose: 'full_name', value: 'Ada Byrne', source: 'details', group: 'details' }),
        field('r', 'Resume', { purpose: 'resume', kind: 'file', value: '__resume__', source: 'resume', group: 'documents' }),
      ],
      next: null, errors: 0,
    };
    const applied: string[] = [];
    fakeBackground({ job, info: { hasForm: true }, frames: formPageFrames(plan, ({ items }) => applied.push(...items.map((i) => i.id))) });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await waitFor(() => expect(applied).toEqual(['r', 'n']));
    await finished();
  });

  it('fills again what the page emptied, and says so when it will not stay', async () => {
    const plan: PagePlan = {
      fields: [
        field('a', 'Phone', { purpose: 'phone', value: '512 555 0142', source: 'details', group: 'details' }),
        field('b', 'City', { purpose: 'city', value: 'Austin', source: 'details', group: 'details' }),
      ],
      next: null, errors: 0,
    };
    const applied: string[] = [];
    const form = formPage(plan, ({ items }) => applied.push(...items.map((i) => i.id)));
    // A page that re-renders: the phone is emptied once, the city every time.
    let wipes = 0;
    const scan = () => {
      if (applied.length) form.shows.set('b', '');
      if (applied.length && wipes++ === 0) form.shows.set('a', '');
      return form.scan();
    };
    fakeBackground({ job, info: { hasForm: true }, frames: { scan, apply: form.apply } });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    expect(await screen.findByText(/the page keeps clearing this/)).toBeInTheDocument();
    expect(applied.filter((i) => i === 'b')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /City/ })).toBeInTheDocument();
  });

  it('fills a question that appears only once the AI has answered another', async () => {
    const first = field('w8', 'Do you have a favorite language?', { group: 'other', kind: 'select', options: ['Yes', 'No'] });
    const follow = field('w9', 'Which language do you prefer?', { group: 'other' });
    const plan: PagePlan = { fields: [first], next: null, errors: 0 };
    const form = formPage(plan);
    const { calls } = fakeBackground({
      job, info: { hasForm: true },
      frames: { apply: form.apply, scan: () => (form.shows.has('w8') ? { ...form.scan(), fields: [...form.scan().fields, follow] } : form.scan()) },
      api: {
        suggest: (fields: { id: string }[]) => ({ answers: fields.map((f) => ({ id: f.id, value: f.id === 'w8' ? 'Yes' : 'Go', confidence: 'high', why: 'resume' })) }),
      },
    });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await waitFor(() => expect(form.shows.get('w9')).toBe('Go'));
    expect(calls.filter((c) => c.name === 'suggest')).toHaveLength(2);
    await finished();
  });

  it('saves a job from a page with no job data, to write its letter', async () => {
    const plan: PagePlan = {
      fields: [field('c1', 'Cover Letter', { purpose: 'cover_letter', kind: 'file', group: 'documents', required: true, note: 'no cover letter for this job yet' })],
      next: null, errors: 0,
    };
    const text = 'About the role. '.repeat(20);
    const { calls } = fakeBackground({
      info: { hasForm: true, draft: null, text },
      frames: formPageFrames(plan),
      api: {
        extract: () => ({ ...draft, is_job_posting: true, title: 'Staff SRE', company: 'Globex' }),
        writeCoverLetter: () => ({ body: 'Dear Globex, I keep robots running.' }),
        coverLetterPdf: () => ({ name: 'Cover_Letter.pdf', base64: 'JVBERi0=' }),
      },
    });
    render(<App handle={{ ...handle('form'), draft: null }} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await waitFor(() => expect(calls.find((c) => c.name === 'addJob')?.args[0]).toMatchObject({ title: 'Staff SRE', company: 'Globex' }));
    await waitFor(() => expect(calls.some((c) => c.name === 'writeCoverLetter')).toBe(true));
    await finished();
  });

  it('keeps filling when the site\'s own Next shows another step', async () => {
    const one: PagePlan = { fields: [field('w1', 'First name', { purpose: 'first_name', value: 'Ada', source: 'details', group: 'details' })], next: { id: 'n1', label: 'Next', final: false }, errors: 0 };
    const two: PagePlan = { fields: [field('w2', 'City', { purpose: 'city', value: 'Austin', source: 'details', group: 'details' })], next: { id: 'n2', label: 'Submit', final: true }, errors: 0 };
    let step = one;
    const applied: string[] = [];
    const { emit } = fakeBackground({
      job, info: { hasForm: true },
      frames: {
        scan: () => ({ ...step, fields: step.fields.map((f) => ({ ...f, current: applied.includes(f.id) ? f.value : '' })) }),
        apply: ({ items }: ApplyRequest) => {
          applied.push(...items.map((i) => i.id));
          return items.map((i): FillResult => ({ id: i.id, label: '', purpose: null, status: 'filled', value: i.value, required: false }));
        },
      },
    });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await screen.findByRole('button', { name: /Continue to the next page/ });
    // A choice revealing a few fields is the same step: nothing starts over.
    emit({ type: 'wera:frame-event', frameId: 0, event: { type: 'wera:form-changed', fields: 2, step: false } });
    await new Promise((r) => setTimeout(r, 50));
    expect(applied.filter((i) => i === 'w1')).toHaveLength(1);
    step = two;
    emit({ type: 'wera:frame-event', frameId: 0, event: { type: 'wera:form-changed', fields: 1, step: true } });
    await waitFor(() => expect(applied).toContain('w2'));
    await finished();
  });

  it('applies from the posting: saves the job, presses Apply, and fills what opens', async () => {
    const { calls, session } = fakeBackground({ info: { hasForm: false, apply: 'Apply now' }, frames: { 'press-apply': () => ({ ok: true }) } });
    render(<App handle={handle('posting')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /Apply with Wera/ }));
    await screen.findByText(/Opening the application/);
    expect(calls.some((c) => c.name === 'addJob')).toBe(true);
    expect(calls.some((c) => c.name === 'press-apply')).toBe(true);
    expect(session['wera.applying']).toHaveProperty('5');
  });

  it('fills on arrival when the user asked from the posting, once', async () => {
    const plan: PagePlan = { fields: [field('w1', 'First name', { purpose: 'first_name', value: 'Ada', source: 'details', group: 'details' })], next: null, errors: 0 };
    const applied: string[] = [];
    const { session } = fakeBackground({ job, info: { hasForm: true }, frames: formPageFrames(plan, ({ items }) => applied.push(...items.map((i) => i.id))) });
    session['wera.applying'] = { 5: Date.now() };
    render(<App handle={handle('form')} show={show()} />);
    await waitFor(() => expect(applied).toEqual(['w1']));
    await finished();
    expect(session['wera.applying']).toEqual({});
  });

  it('says plainly when it cannot press Apply', async () => {
    fakeBackground({ job, info: { hasForm: false, apply: 'Apply' }, frames: { 'press-apply': () => ({ ok: false }) } });
    render(<App handle={handle('posting')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /Apply with Wera/ }));
    expect(await screen.findByText(/Press it yourself/)).toBeInTheDocument();
  });

  it('shows why a job fits: the reason, the resume\'s keywords, sponsorship and H-1B filings', async () => {
    const scored = { ...job, reason: 'Strong SRE match, light on Terraform.', sponsorship: 'yes' as const };
    fakeBackground({
      job: scored,
      api: {
        jobKeywords: () => ({ keywords: ['Go', 'Kubernetes', 'Terraform'], coverage: { matched: ['Go', 'Kubernetes'], missing: ['Terraform'], percent: 67 }, resume_id: 3 }),
        h1b: () => ({ matched: true, filings: 12, new_hires: 3, wage_median: null, similar: [], similar_low: null, similar_high: null, level: '' }),
      },
    });
    render(<App handle={handle('posting')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /has 67% of this job's keywords/ }));
    expect(screen.getByText('Strong SRE match, light on Terraform.')).toBeInTheDocument();
    expect(screen.getByText('Terraform')).toBeInTheDocument();
    expect(screen.getByText(/offers visa sponsorship/)).toBeInTheDocument();
    expect(await screen.findByText(/filed 12 H-1B petitions/)).toBeInTheDocument();
  });

  it('warns when the tracker says the job was applied to', async () => {
    fakeBackground({ job: { ...job, application_status: 'applied' }, info: { hasForm: true } });
    render(<App handle={handle('form')} show={show()} />);
    expect(await screen.findByText(/already applied to this job/)).toBeInTheDocument();
  });

  it('tailors the resume in one click, and swaps it into a filled form', async () => {
    const plan: PagePlan = { fields: [field('r', 'Resume', { purpose: 'resume', kind: 'file', value: '__resume__', source: 'resume', group: 'documents' })], next: null, errors: 0 };
    const sent: ApplyRequest[] = [];
    let tailored = false;
    const { calls } = fakeBackground({
      job, info: { hasForm: true },
      frames: formPageFrames(plan, (req) => sent.push(req)),
      api: {
        tailorResume: () => {
          tailored = true;
          return { resume: {}, coverage_before: {} };
        },
        resumeFile: () => (tailored ? { name: 'Ada_Tailored.pdf', base64: 'JVBERi0=', kind: 'tailored' } : { name: 'Ada.pdf', base64: 'JVBERi0=', kind: 'base' }),
      },
    });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    await finished();
    await userEvent.click(screen.getByRole('button', { name: /Tailor/ }));
    await waitFor(() => expect(sent.at(-1)?.resume?.name).toBe('Ada_Tailored.pdf'));
    expect(calls.find((c) => c.name === 'tailorResume')?.args[0]).toBe(job.id);
    expect(await screen.findByText(/tailored for/)).toBeInTheDocument();
  });

  it('makes room on the page while open on an application, and gives it back', async () => {
    fakeBackground({ job, info: { hasForm: true } });
    render(<App handle={handle('form')} show={show()} />);
    await screen.findByRole('dialog', { name: 'Wera' });
    await waitFor(() => expect(document.documentElement.style.marginRight).toBe('396px'));
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the Wera panel' }));
    await waitFor(() => expect(document.documentElement.style.marginRight).toBe(''));
  });

  it('moves a multi-page application on, and says what Workday wants first', async () => {
    const plan: PagePlan = { fields: [field('w1', 'First name', { purpose: 'first_name', value: 'Ada', group: 'details' })], next: { id: 'n1', label: 'Save and Continue', final: false }, errors: 0, site: 'Workday', step: { name: 'My Information', index: 1, total: 5 } };
    const { calls } = fakeBackground({
      job, info: { hasForm: true, gate: 'Sign in to your Workday account for this company, then press Autofill on the application.' },
      frames: { ...formPageFrames(plan), next: () => ({ ok: true }) },
      api: { suggest: () => ({ answers: [] }) },
    });
    render(<App handle={handle('form')} show={show()} />);
    expect(await screen.findByText(/Sign in to your Workday account/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Autofill$/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Continue to the next page/ }));
    await waitFor(() => expect(calls.some((c) => c.name === 'next')).toBe(true));
    expect(screen.getByText('Workday · Step 1 of 5 · My Information')).toBeInTheDocument();
  });

  it('says what went wrong, and still fills what it can', async () => {
    const plan: PagePlan = {
      fields: [
        field('w1', 'First name', { purpose: 'first_name', value: 'Ada', source: 'details', group: 'details' }),
        // A question no other test asks: AI answers are kept for the page's life.
        field('w2', 'Years of Rust', { group: 'other' }),
      ],
      next: null, errors: 0,
    };
    const applied: FillItem[] = [];
    fakeBackground({
      job, info: { hasForm: true },
      frames: formPageFrames(plan, ({ items }) => applied.push(...items)),
      api: {
        resumeFile: () => {
          throw new Error('502 Bad Gateway');
        },
        suggest: () => {
          throw new Error('the AI service did not answer; try again');
        },
      },
    });
    render(<App handle={handle('form')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Autofill$/ }));
    expect(await screen.findByText(/Couldn't load your resume, so Wera won't attach it/)).toBeInTheDocument();
    expect(await screen.findByText(/Wera's AI couldn't answer 1 field/, undefined, { timeout: 3000 })).toHaveTextContent(/did not answer/);
    expect(applied).toEqual([expect.objectContaining({ id: 'w1', value: 'Ada' })]);
  });

  it('fills when the toolbar shortcut asks', async () => {
    const { calls } = fakeBackground({
      job, info: { hasForm: true },
      frames: { scan: () => ({ fields: [], next: null, errors: 0 }), apply: () => [] },
    });
    const { rerender } = render(<App handle={handle('form')} show={show()} />);
    await screen.findByRole('button', { name: /^Autofill$/ });
    rerender(<App handle={handle('form')} show={show({ fills: 1 })} />);
    await waitFor(() => expect(calls.some((c) => c.name === 'scan')).toBe(true));
  });

  it('settings: turns things off, and signs out', async () => {
    const { store } = fakeBackground({ job });
    render(<App handle={handle('posting')} show={show()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByLabelText(/Draft open questions and cover letters while filling/));
    await waitFor(() => expect(store['wera.settings']).toMatchObject({ aiQuestions: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
  });
});

describe('AI answers that cannot be right', () => {
  it('after the user sends an application, shows the alert over the page; staying keeps the panel\'s note', async () => {
    fakeBackground();
    const sent = { state: 'marked' as const, job: { id: 9, title: 'SRE', company: 'Acme', status: 'applied' }, previous: 'saved', close: true };
    render(<App handle={{ ...handle('form'), submitted: sent }} show={show({ initial: false })} />);
    expect(await screen.findByRole('alertdialog', { name: 'Application submitted' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Application sent. Marked as applied.')).toBeTruthy();
  });

  it('a LinkedIn box only takes a LinkedIn address', async () => {
    const { fitsPurpose } = await import('./rows');
    expect(fitsPurpose('linkedin', 'https://rendercv.com')).toBe(false);
    expect(fitsPurpose('linkedin', 'https://www.linkedin.com/in/ada')).toBe(true);
    expect(fitsPurpose('github', 'https://github.com/ada')).toBe(true);
    expect(fitsPurpose('email', 'ada at example')).toBe(false);
    expect(fitsPurpose('phone', '555')).toBe(false);
    expect(fitsPurpose('question', 'anything')).toBe(true);
  });
});
