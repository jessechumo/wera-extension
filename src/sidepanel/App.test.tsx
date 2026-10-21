import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WeraJob } from '../shared/api';
import type { FieldPlan, PageInfo, PagePlan } from '../shared/types';
import { fakeChrome } from '../test/chrome';
import { App } from './App';

const API = 'http://192.168.4.68:3000';
const page: PageInfo = {
  url: 'https://jobs.example/acme/1', title: 'SRE at Acme', text: 'About the role '.repeat(30), hasForm: false,
  draft: { url: 'https://jobs.example/acme/1', company: 'Acme', title: 'SRE', location: 'Austin, TX', work_mode: '', employment_type: '',
    department: '', salary: '', industry: '', description: 'Keep things up.', source: 'page-data' },
};
const job: WeraJob = {
  id: 9, company: 'Acme', title: 'SRE', url: page.url, location_raw: 'Austin, TX', location_summary: null, stage: 'scored', fit_score: 81,
  estimated_score: null, verdict: 'strong', reason: 'Strong match for your Go work.', sponsorship: 'yes', skills_matched: [], skills_missing: ['Terraform'],
  application_status: 'saved', source: 'manual',
};

type Route = (init: RequestInit) => unknown;

/** The JSON body a faked request sent. */
function jsonBody<T = Record<string, unknown>>(init: RequestInit): T {
  if (typeof init.body !== 'string') throw new Error('the request has no JSON body');
  return JSON.parse(init.body) as T;
}
function fakeFetch(routes: Record<string, Route>) {
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url.replace(API, '').split('?')[0]}`;
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ error: `no route ${key}` }), { status: 501 });
    const out = h(init);
    if (out instanceof Response) return out;
    return new Response(out === undefined ? null : JSON.stringify(out), { status: out === undefined ? 204 : 200 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

async function signIn() {
  await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'secret password');
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

describe('side panel', () => {
  it('signs in, then saves the job read from the page', async () => {
    const { chrome, store } = fakeChrome({ page });
    let saved: unknown;
    fakeFetch({
      'POST /api/ext/tokens': () => ({ token: 'wera_ext_t', user: { id: 1, email: 'ada@example.com', name: 'Ada', is_admin: false } }),
      'GET /api/ext/jobs/lookup': () => ({ job: null }),
      'POST /api/ext/jobs': (init) => ((saved = jsonBody(init)), { ...job, fit_score: null, stage: 'pending_score' }),
    });
    render(<App />);
    await signIn();
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: [`${API}/*`] });
    expect(store['wera.session']).toMatchObject({ server: API, token: 'wera_ext_t' });

    expect(await screen.findByText(/Filled from the page's job data/)).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Site Reliability Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Save to Wera' }));
    expect(await screen.findByText('In your Wera lists')).toBeInTheDocument();
    expect(saved).toMatchObject({ company: 'Acme', title: 'Site Reliability Engineer', url: page.url });
  });

  it('refuses to sign in without permission for the server', async () => {
    fakeChrome({ page, granted: false });
    fakeFetch({});
    render(<App />);
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('needs permission');
  });

  it('shows a known job with its fit, and asks for site access when needed', async () => {
    const { chrome } = fakeChrome({ page });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 'wera_ext_t', user: { id: 1, email: 'a', name: 'A', is_admin: false } } });
    fakeFetch({ 'GET /api/ext/jobs/lookup': () => ({ job }) });
    render(<App />);
    expect(await screen.findByText('Strong match for your Go work.')).toBeInTheDocument();
    expect(screen.getByLabelText('fit 81')).toBeInTheDocument();
    expect(screen.getByText('You lack')).toBeInTheDocument();
    expect(screen.getByText('Terraform')).toBeInTheDocument();
  });

  it('offers to read or fill in a page with no job data', async () => {
    const { chrome } = fakeChrome({ page: { ...page, draft: null } });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } });
    fakeFetch({ 'GET /api/ext/jobs/lookup': () => ({ job: null }) });
    render(<App />);
    expect(await screen.findByText('No job found on this page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Fill in/ }));
    expect(screen.getByText('Save this job to Wera')).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toHaveValue('');
  });

  it('asks for access to a site it cannot read yet', async () => {
    const { chrome } = fakeChrome({ page });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } });
    chrome.scripting.executeScript.mockRejectedValue(new Error('Cannot access contents of the page'));
    fakeFetch({ 'GET /api/ext/jobs/lookup': () => ({ job: null }) });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Allow on this site' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow on this site' }));
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://jobs.example/*'] });
  });

  it('writes, edits and inserts a cover letter; tailors the resume', async () => {
    const { chrome } = fakeChrome({ page });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'Ada', is_admin: false } } });
    let body = '';
    let tailored: unknown = null;
    let tailorAsked: unknown;
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/cover-letter': () => (body ? { body, edited: false } : new Response('{"error":"none"}', { status: 404 })),
      'POST /api/jobs/9/cover-letter': () => ((body = 'Dear Hiring Team,\n\nHello.'), { body, edited: false }),
      'PUT /api/jobs/9/cover-letter': (init) => ((body = jsonBody<{ body: string }>(init).body), { body, edited: true }),
      'GET /api/jobs/9/keywords': () => ({ keywords: ['Go', 'Terraform'], coverage: tailored ? { matched: ['Go', 'Terraform'], missing: [], percent: 100 } : { matched: ['Go'], missing: ['Terraform'], percent: 50 }, resume_id: 1 }),
      'GET /api/jobs/9/resume': () => tailored ?? new Response('{"error":"none"}', { status: 404 }),
      'POST /api/jobs/9/resume': (init) => {
        tailorAsked = init.body ? jsonBody(init) : null;
        tailored = { id: 7, title: 'SRE, Acme', job_id: 9, data: { name: 'Ada', sections: [] }, layout: { font_size: 11, spacing: 1, margin: 0.5 }, fit: { one_page: true, summary: '' }, notes: ['Led with reliability'] };
        return { resume: tailored, coverage_before: { matched: ['Go'], missing: ['Terraform'], percent: 50 } };
      },
      'POST /api/resumes/preview': () => ({ pages: ['<svg xmlns="http://www.w3.org/2000/svg"/>'], measure: { pages: 1, fill: 0.9 } }),
      'GET /api/resumes/7/pdf': () => new Response('%PDF', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="Ada.pdf"' } }),
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await userEvent.click(screen.getByRole('tab', { name: /Letter/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Write my letter/ }));
    expect(await screen.findByText('Hello.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const editor = screen.getByLabelText('Cover letter');
    await userEvent.type(editor, ' Thanks.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Hello. Thanks.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to application' }));
    expect(await screen.findByText('Added to the cover letter box on the form.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Resume/ }));
    expect(await screen.findByText('50%')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What to lead with'), 'my on-call work');
    await userEvent.click(screen.getByRole('button', { name: /Tailor my resume/ }));
    expect(await screen.findByText('Led with reliability')).toBeInTheDocument();
    expect(tailorAsked).toEqual({ request: 'my on-call work' });
    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Edit in Wera/ })).toHaveAttribute('href', `${API}/profile/resume/7`);
    expect(await screen.findByAltText('Resume preview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalled());
    expect(within(document.body).queryByText('no route')).toBeNull();
  });
});

describe('side panel: resume and letter', () => {
  const signedIn = (chrome: ReturnType<typeof fakeChrome>['chrome']) =>
    chrome.storage.local.get.mockImplementation(async (k: string) =>
      k === 'wera.session' ? { 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } } : {});

  it('creates the main resume (CV) and edits it in the panel', async () => {
    const { chrome } = fakeChrome({ page });
    signedIn(chrome);
    const base = {
      id: 1, title: 'Main', job_id: null, fit: null, notes: [], layout: { font_size: 11, spacing: 1, margin: 0.5, template: 'ivy' },
      data: { name: 'Ada', sections: [
        { id: 's1', kind: 'summary', title: 'Summary', text: 'SRE.' },
        { id: 's2', kind: 'entries', title: 'Experience', entries: [{ id: 'e1', heading: 'Acme', subheading: 'SRE Intern', bullets: [{ id: 'b1', text: 'Ran deploys' }] }] },
      ] },
    };
    let created = false;
    let saved: { data: typeof base.data; layout: typeof base.layout } | null = null;
    let fits = 0;
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job: null }),
      'GET /api/resumes': () => ({ resumes: created ? [{ id: 1, job_id: null }] : [] }),
      'POST /api/resumes/import': (init) => (created = jsonBody<{ source: string }>(init).source === 'profile', base),
      'GET /api/resumes/templates': () => ({ templates: [{ id: 'ivy', name: 'Ivy', tagline: '', uses_accent: false }, { id: 'parse', name: 'Parse', tagline: '', uses_accent: false }] }),
      'POST /api/resumes/preview': () => ({ pages: ['<svg xmlns="http://www.w3.org/2000/svg"/>'], measure: { pages: 2, fill: 1 } }),
      'POST /api/resumes/suggest-bullet': () => ({ suggestions: ['Automated deploys for 12 services with GitHub Actions'] }),
      'PUT /api/resumes/1': (init) => { const got = jsonBody<NonNullable<typeof saved>>(init); saved = got; return { ...base, data: got.data, layout: got.layout }; },
      'POST /api/resumes/1/fit': () => (fits++, { ...base, fit: { one_page: true, summary: 'Fits on one page.' } }),
    });
    render(<App />);
    await screen.findByText('Save this job to Wera');
    await userEvent.click(screen.getByRole('tab', { name: /Resume/ }));
    // No job saved: the main resume view, and none exists yet.
    await userEvent.click(await screen.findByRole('button', { name: /Build it from my uploaded resume/ }));
    expect(await screen.findByLabelText('Name')).toHaveValue('Ada');
    expect(await screen.findByText(/This runs to 2 pages/)).toBeInTheDocument();
    expect(await screen.findByAltText('Resume preview')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Headline'), 'Site Reliability Engineer');
    await userEvent.click(screen.getByRole('button', { name: /^Acme/, expanded: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Improve this bullet' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Automated deploys for 12 services with GitHub Actions' }));
    expect(screen.getByLabelText('Bullet')).toHaveValue('Automated deploys for 12 services with GitHub Actions');
    await userEvent.selectOptions(screen.getByLabelText('Template'), 'parse');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(saved?.data.sections[1]).toMatchObject({ entries: [{ bullets: [{ text: 'Automated deploys for 12 services with GitHub Actions' }] }] }));
    expect(saved).toMatchObject({ data: { headline: 'Site Reliability Engineer' }, layout: { template: 'parse' } });
    await userEvent.click(screen.getByRole('button', { name: /Fit/ }));
    expect(await screen.findByText('Fits on one page.')).toBeInTheDocument();
    expect(fits).toBe(1);
  });

  it('steers a cover letter rewrite', async () => {
    const { chrome } = fakeChrome({ page });
    signedIn(chrome);
    const asks: unknown[] = [];
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => ({ matched: false, filings: 0, new_hires: 0, wage_median: null, similar: [], similar_low: null, similar_high: null, level: '' }),
      'GET /api/jobs/9/cover-letter': () => ({ body: 'Dear Hiring Team,\n\nHello.', edited: false }),
      'POST /api/jobs/9/cover-letter': (init) => (asks.push(jsonBody(init)), { body: 'Dear Hiring Team,\n\nFormal hello.', edited: false }),
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await userEvent.click(screen.getByRole('tab', { name: /Letter/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Rewrite…/ }));
    await userEvent.selectOptions(screen.getByLabelText('Tone'), 'formal');
    await userEvent.selectOptions(screen.getByLabelText('Length'), 'short');
    await userEvent.type(screen.getByLabelText(/Anything to stress/), 'Mention Go');
    await userEvent.click(screen.getByRole('button', { name: /Rewrite the letter/ }));
    expect(await screen.findByText('Formal hello.')).toBeInTheDocument();
    expect(asks).toEqual([{ tone: 'formal', length: 'short', request: 'Mention Go' }]);
  });
});

describe('side panel: tracking, steps and shortcuts', () => {
  const signedIn = (chrome: ReturnType<typeof fakeChrome>['chrome']) =>
    chrome.storage.local.get.mockImplementation(async (k: string) =>
      k === 'wera.session' ? { 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } } : {});
  const h1b = { matched: true, filings: 294, new_hires: 112, wage_median: 163000, level: '',
    similar: [{ title: 'Site Reliability Engineer', wage_from: 150000, wage_to: null, level: 'II', place: 'Austin, TX' }], similar_low: 140000, similar_high: 190000 };

  it('shows the fit on the toolbar icon, H-1B filings, and tracks the job', async () => {
    const { chrome } = fakeChrome({ page });
    signedIn(chrome);
    let status = '';
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'PUT /api/jobs/9/application': (init) => ((status = jsonBody<{ status: string }>(init).status), { ...job, application_status: status }),
    });
    render(<App />);
    expect(await screen.findByText(/294/)).toBeInTheDocument();
    expect(screen.getByText('$140k – $190k')).toBeInTheDocument();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '81' });
    await userEvent.selectOptions(screen.getByLabelText('Tracker status'), 'interviewing');
    await waitFor(() => expect(status).toBe('interviewing'));
  });

  it('follows a single-page site to its next page, and shows changes made in the dashboard', async () => {
    const { chrome, emit } = fakeChrome({ page });
    signedIn(chrome);
    let lookups = 0;
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => (lookups++, { job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'GET /api/jobs/9': () => ({ ...job, application_status: 'interviewing' }),
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    emit({ type: 'wera:navigated', url: 'https://jobs.example/acme/2' });
    await waitFor(() => expect(lookups).toBe(2), { timeout: 2000 });

    // Back from the dashboard, where the job moved to Interviewing.
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByLabelText('Tracker status')).toHaveValue('interviewing'));
  });

  it('knows the job the dashboard opened this tab for, until told otherwise', async () => {
    const careers: PageInfo = { ...page, url: 'https://acme.example/careers/sre?gh_jid=123', draft: { ...page.draft!, title: 'Site Reliability Engineer, Platform', url: 'https://acme.example/careers/sre' } };
    const { chrome, setSession } = fakeChrome({ page: careers });
    signedIn(chrome);
    await setSession('wera.handoffs', { 7: { jobId: 9, url: job.url, at: Date.now() } });
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job: null }),
      'GET /api/jobs/9': () => ({ ...job, title: 'Site Reliability Engineer' }),
      'GET /api/jobs/9/h1b': () => h1b,
    });
    render(<App />);
    expect(await screen.findByText(/opened from your dashboard/)).toBeInTheDocument();
    expect(screen.getByLabelText('fit 81')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not this job?' }));
    expect(await screen.findByText('Save this job to Wera')).toBeInTheDocument();
  });

  it('ignores a dashboard handoff once the tab shows a different posting', async () => {
    const other: PageInfo = { ...page, url: 'https://acme.example/careers/ae', draft: { ...page.draft!, title: 'Account Executive' } };
    const { chrome, setSession } = fakeChrome({ page: other });
    signedIn(chrome);
    await setSession('wera.handoffs', { 7: { jobId: 9, url: job.url, at: Date.now() } });
    fakeFetch({ 'GET /api/ext/jobs/lookup': () => ({ job: null }), 'GET /api/jobs/9': () => job });
    render(<App />);
    expect(await screen.findByText('Save this job to Wera')).toBeInTheDocument();
  });

  it('tells open dashboards when it changes something', async () => {
    const { chrome, sent } = fakeChrome({ page });
    signedIn(chrome);
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'PUT /api/jobs/9/application': () => ({ ...job, application_status: 'applied' }),
    });
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText('Tracker status'), 'applied');
    await waitFor(() => expect(sent).toContainEqual({ type: 'wera:extension-changed', what: '/api/jobs/9/application' }));
    // Reading the page or a lookup is not a change.
    expect(sent.filter((m) => (m as { type: string }).type === 'wera:extension-changed')).toHaveLength(1);
  });
});

describe('side panel: guided autofill', () => {
  const session = { 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } };
  const signedIn = (chrome: ReturnType<typeof fakeChrome>['chrome'], store: Record<string, unknown> = {}) =>
    chrome.storage.local.get.mockImplementation(async (k: string) => (k === 'wera.session' ? session : k in store ? { [k]: store[k] } : {}));
  const field = (id: string, label: string, over: Partial<FieldPlan> = {}): FieldPlan => ({
    id, label, purpose: null, kind: 'text', options: [], required: false, current: '', value: '', source: null, group: 'other', ...over,
  });
  const noResume = {
    'GET /api/resumes': () => ({ resumes: [] }),
    'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
    'GET /api/jobs/9/cover-letter': () => new Response('{"error":"none"}', { status: 404 }),
    'GET /api/jobs/9/h1b': () => ({ matched: false, filings: 0, new_hires: 0, wage_median: null, similar: [], similar_low: null, similar_high: null, level: '' }),
  };
  const sentOf = (sent: unknown[], type: string) => sent.filter((m) => (m as { type: string }).type === type) as Record<string, unknown>[];

  it('lists every field with its value and source, fills the ticked ones live, and learns', async () => {
    const plan: PagePlan = {
      fields: [
        field('w1', 'Email', { purpose: 'email', value: 'ada@example.com', source: 'details', group: 'details', required: true }),
        field('w2', 'Phone', { purpose: 'phone', group: 'details', required: true, note: 'not in your application details' }),
        field('w3', 'Favorite tool'),
        field('w4', 'Clearance level', { kind: 'select', options: ['None', 'Secret'] }),
        field('w5', 'I agree to the terms', { purpose: 'consent', kind: 'checkbox', group: 'consent', note: 'agree yourself after reading it' }),
      ],
      next: null, errors: 0,
    };
    const { chrome, sent } = fakeChrome({
      page: { ...page, hasForm: true }, plan,
      snapshot: [{ id: 'w1', label: 'Email', purpose: 'email', kind: 'text', value: 'ada@example.com' }, { id: 'w2', label: 'Phone', purpose: 'phone', kind: 'text', value: '512 555 0142' },
        { id: 'w3', label: 'Favorite tool', purpose: null, kind: 'text', value: 'Terraform' }],
    });
    signedIn(chrome);
    let asked: { fields: { id: string }[] } = { fields: [] };
    let details: Record<string, string> = {};
    let learned: unknown = null;
    let run: unknown = null;
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: { email: 'ada@example.com', phone: '' }, saved: true }),
      'PUT /api/applicant': (init) => ((details = jsonBody(init)), { applicant: details, saved: true }),
      'GET /api/applicant/answers': () => ({ answers: [] }),
      'PUT /api/applicant/answers': (init) => ((learned = jsonBody(init)), { answers: [] }),
      'POST /api/ext/autofill': (init) => ((asked = jsonBody(init)), {
        answers: [{ id: 'w3', value: 'Terraform', confidence: 'high', why: 'from your resume' }, { id: 'w4', value: 'None', confidence: 'low' }],
      }),
      'POST /api/ext/autofill-runs': (init) => ((run = jsonBody(init)), { id: 5, job_id: 9, host: 'jobs.example', pages: 1, filled: 3, suggested: 1 }),
    });
    render(<App />);
    // A form page opens on Apply and is read at once.
    await waitFor(() => expect(screen.getByRole('tab', { name: /Apply/ })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByLabelText('Value for Email')).toHaveValue('ada@example.com');
    await waitFor(() => expect(screen.getByLabelText('Value for Favorite tool')).toHaveValue('Terraform'));
    // The AI is asked only about what Wera's details and answers did not cover, never the consent.
    expect(asked.fields.map((f) => f.id)).toEqual(['w2', 'w3', 'w4']);
    expect(screen.getByLabelText('Fill Favorite tool')).toBeChecked();
    expect(screen.getByLabelText('Fill Clearance level')).not.toBeChecked(); // a guess: the user decides
    expect(screen.getByLabelText('Fill I agree to the terms')).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Value for Phone'), '512 555 0142');
    expect(screen.getByLabelText('Fill Phone')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Fill 3 fields' }));
    await waitFor(() => expect(sentOf(sent, 'wera:apply')).toHaveLength(1));
    expect(sentOf(sent, 'wera:apply')[0]!.items).toEqual([
      { id: 'w1', value: 'ada@example.com' }, { id: 'w2', value: '512 555 0142' }, { id: 'w3', value: 'Terraform' },
    ]);
    expect(await screen.findAllByLabelText('Filled')).toHaveLength(3);
    // Learned: the phone goes to the details, the tool to the saved answers.
    await waitFor(() => expect(details.phone).toBe('512 555 0142'));
    await waitFor(() => expect(learned).toEqual({ answers: [{ question: 'Favorite tool', answer: 'Terraform', kind: 'text', company: 'Acme' }] }));
    expect(await screen.findByText(/Saved for next time/)).toBeInTheDocument();
    expect(run).toEqual({ host: 'jobs.example', job_id: 9, filled: 3, suggested: 1 });
    // No Next button: the last page is the user's to submit.
    expect(screen.getByText(/Check everything on the page, then submit it yourself/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show Email on the page' }));
    expect(sentOf(sent, 'wera:highlight')).toEqual([{ type: 'wera:highlight', id: 'w1' }]);
  });

  it('approves a page, presses Next, fills the next step on its own, and stops at Submit', async () => {
    let step = 1;
    const plans: Record<number, PagePlan> = {
      1: { fields: [field('w1', 'First name', { purpose: 'first_name', value: 'Ada', source: 'details', group: 'details' })], next: { id: 'n1', label: 'Save and continue', final: false }, errors: 0 },
      2: { fields: [field('w9', 'Phone', { purpose: 'phone', value: '512', source: 'details', group: 'details' })], next: { id: 'n2', label: 'Submit application', final: true }, errors: 0 },
    };
    const { chrome, sent, emit } = fakeChrome({ page: { ...page, hasForm: true }, plan: () => plans[step]! });
    signedIn(chrome);
    const pages: unknown[] = [];
    let status = '';
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: {}, saved: true }),
      'GET /api/applicant/answers': () => ({ answers: [] }),
      'POST /api/ext/autofill-runs': () => ({ id: 5 }),
      'POST /api/ext/autofill-runs/5/pages': (init) => (pages.push(jsonBody(init)), { id: 5 }),
      'PUT /api/jobs/9/application': (init) => ((status = jsonBody<{ status: string }>(init).status), { ...job, application_status: status }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fill 1 field' }));
    await userEvent.click(await screen.findByRole('button', { name: /Approve & continue/ }));
    await waitFor(() => expect(sentOf(sent, 'wera:next')).toHaveLength(1));
    expect(await screen.findByText('Moving to the next page…')).toBeInTheDocument();

    // The site shows step 2 without a page load; Wera reads and fills it.
    step = 2;
    emit({ type: 'wera:form-changed', fields: 1 }, 99); // another tab: ignored
    emit({ type: 'wera:form-changed', fields: 1 });
    await waitFor(() => expect(sentOf(sent, 'wera:apply')).toHaveLength(2));
    expect(sentOf(sent, 'wera:apply')[1]!.items).toEqual([{ id: 'w9', value: '512' }]);
    await waitFor(() => expect(pages).toEqual([{ filled: 1, suggested: 0 }]));
    expect(await screen.findByText(/This is the last page/)).toHaveTextContent('Submit application');
    expect(screen.getByRole('heading', { name: 'Application, page 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve & continue/ })).toBeNull();

    emit({ type: 'wera:submitted' });
    expect(await screen.findByText(/Looks like you submitted it/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark as applied' })[0]!);
    await waitFor(() => expect(status).toBe('applied'));
  });

  it('says when Wera marked the job applied after the site confirmed it, with an undo', async () => {
    const { chrome, emit } = fakeChrome({ page });
    signedIn(chrome);
    let status = '';
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'PUT /api/jobs/9/application': (init) => ((status = jsonBody<{ status: string }>(init).status), { ...job, application_status: status }),
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await userEvent.click(screen.getByRole('tab', { name: /Apply/ }));
    act(() => emit({ type: 'wera:job-changed', tabId: 7, job: { ...job, application_status: 'applied' }, applied: true }));
    expect(await screen.findByText(/Application sent. Marked as applied/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(status).toBe('saved'));
    await waitFor(() => expect(screen.queryByText(/Application sent/)).toBeNull());
  });

  it("opens at the view the page's dock asked for", async () => {
    const { chrome, sent, setSession } = fakeChrome({ page });
    signedIn(chrome);
    fakeFetch({ ...noResume, 'GET /api/ext/jobs/lookup': () => ({ job }) });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await setSession('wera.pendingFill', { tabId: 7, at: Date.now(), view: 'letter', fill: false });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Letter/ })).toHaveAttribute('aria-selected', 'true'));
    expect(sentOf(sent, 'wera:apply')).toHaveLength(0);
  });

  it('fills when the keyboard shortcut asks', async () => {
    const plan: PagePlan = { fields: [field('w1', 'Email', { purpose: 'email', value: 'a@x', source: 'details', group: 'details' })], next: null, errors: 0 };
    const { chrome, sent, setSession } = fakeChrome({ page, plan });
    signedIn(chrome);
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: { email: 'a@x' }, saved: true }),
      'GET /api/applicant/answers': () => ({ answers: [] }),
      'POST /api/ext/autofill-runs': () => ({ id: 1 }),
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await setSession('wera.pendingFill', { tabId: 7, at: Date.now() });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Apply/ })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(sentOf(sent, 'wera:apply')).toHaveLength(1));
  });

  it('moves answers kept in this browser to Wera and offers them for the same question', async () => {
    const plan: PagePlan = { fields: [field('w3', 'Why do you want to work here?', { purpose: 'question', kind: 'textarea', group: 'questions' })], next: null, errors: 0 };
    const store: Record<string, unknown> = {
      'wera.answers': [{ question: 'Why do you want to work here?', answer: 'Acme keeps robots running in hospitals.', company: 'Acme', at: Date.now() - 86_400_000 * 3 }],
    };
    const { chrome, sent } = fakeChrome({ page: { ...page, hasForm: true }, plan });
    signedIn(chrome, store);
    chrome.storage.local.remove.mockImplementation(async (k: string) => void delete store[k]);
    let moved: unknown = null;
    const saves: unknown[] = [];
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: {}, saved: true }),
      'GET /api/applicant/answers': () => ({ answers: [] }),
      'PUT /api/applicant/answers': (init) => (moved ??= jsonBody(init), saves.push(jsonBody(init)), { answers: [] }),
    });
    render(<App />);
    const reuse = await screen.findByRole('button', { name: /Your answer for Acme, 3 days ago/ });
    expect(moved).toEqual({ answers: [{ question: 'Why do you want to work here?', answer: 'Acme keeps robots running in hospitals.', kind: 'long', company: 'Acme' }] });
    expect(store['wera.answers']).toBeUndefined();
    await userEvent.click(reuse);
    await userEvent.type(screen.getByLabelText(/Answer to Why do you want/), ' I love that work.');
    await userEvent.click(screen.getByRole('button', { name: 'Insert into form' }));
    await waitFor(() => expect(sentOf(sent, 'wera:insert')).toEqual([{ type: 'wera:insert', id: 'w3', text: 'Acme keeps robots running in hospitals. I love that work.' }]));
    await waitFor(() => expect(saves).toHaveLength(2));
  });

  it('reads the form again when the page reloads', async () => {
    const live: PageInfo = { ...page, hasForm: true, docId: 'd1' };
    const plan: PagePlan = { fields: [field('w1', 'Email', { purpose: 'email', value: 'a@x', source: 'details', group: 'details' })], next: null, errors: 0 };
    const { chrome, sent } = fakeChrome({ page: live, plan });
    signedIn(chrome);
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: {}, saved: true }),
      'GET /api/applicant/answers': () => ({ answers: [] }),
    });
    render(<App />);
    await screen.findByLabelText('Value for Email');
    live.docId = 'd2';
    const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0]![0] as (id: number, info: object, tab: object) => void;
    act(() => onUpdated(7, { status: 'complete' }, { id: 7, active: true }));
    await waitFor(() => expect(sentOf(sent, 'wera:scan')).toHaveLength(2));
    expect(await screen.findByLabelText('Value for Email')).toHaveValue('a@x');
  });

  it('drafts answers for an unsaved job from the posting on the page, sized to the box', async () => {
    const plan: PagePlan = { fields: [field('w3', 'Why Acme?', { purpose: 'question', kind: 'textarea', group: 'questions', required: true, maxLength: 700 })], next: null, errors: 0 };
    const { chrome } = fakeChrome({ page: { ...page, hasForm: true }, plan });
    signedIn(chrome);
    let asked: Record<string, unknown> = {};
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job: null }),
      'GET /api/applicant': () => ({ applicant: {}, saved: true }),
      'GET /api/applicant/answers': () => new Response('{"error":"not found"}', { status: 404 }),
      'POST /api/ext/answer': (init) => ((asked = jsonBody(init)), { answer: 'Robots.' }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Draft an answer/ }));
    expect(await screen.findByLabelText('Answer to Why Acme?')).toHaveValue('Robots.');
    expect(asked).toMatchObject({ question: 'Why Acme?', job_id: 0, max_words: 100, company: 'Acme', title: 'SRE', description: 'Keep things up.' });
  });

  it('keeps settings', async () => {
    const { chrome, store } = fakeChrome({ page });
    signedIn(chrome, store);
    fakeFetch({
      ...noResume,
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant/answers': () => ({ answers: [{ id: 1, question: 'Q', answer: 'A', kind: 'text', company: '', updated_at: '2026-10-01T00:00:00Z' }] }),
      'DELETE /api/applicant/answers': () => undefined,
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByLabelText(/Suggest the rest with AI/));
    await waitFor(() => expect(store['wera.settings']).toMatchObject({ aiSuggest: false, launcher: true, autoApplied: true }));
    await userEvent.click(screen.getByLabelText(/Mark jobs applied when I submit/));
    await waitFor(() => expect(store['wera.settings']).toMatchObject({ autoApplied: false }));
    expect(screen.getByRole('link', { name: /1 saved answer/ })).toHaveAttribute('href', `${API}/profile#answers`);
    await userEvent.click(screen.getByRole('button', { name: 'Forget all' }));
    expect(await screen.findByRole('link', { name: /0 saved answers/ })).toBeInTheDocument();
  });
});
