import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WeraJob } from '../shared/api';
import type { PageInfo } from '../shared/types';
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

  it('fills an application and drafts an answer to insert', async () => {
    const { chrome, sent } = fakeChrome({
      page: { ...page, hasForm: true },
      fill: [
        { id: 'w1', label: 'Email', purpose: 'email', status: 'filled', value: 'ada@example.com', required: true },
        { id: 'w2', label: 'Phone', purpose: 'phone', status: 'review', note: 'not in your application details', required: true },
        { id: 'w3', label: 'Why Acme?', purpose: 'question', status: 'question', required: false },
      ],
    });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } });
    let savedDetails: unknown;
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: { email: 'ada@example.com', city: 'Austin' }, saved: true }),
      'PUT /api/applicant': (init) => ((savedDetails = jsonBody(init)), { applicant: savedDetails, saved: true }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
      'POST /api/ext/answer': () => ({ answer: 'Because robots.' }),
    });
    render(<App />);
    // An application page opens on Apply.
    await waitFor(() => expect(screen.getByRole('tab', { name: /Apply/ })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    expect(await screen.findByText(/Filled 1 field; 1 to check/)).toBeInTheDocument();

    // The phone is missing: add it here, saved to Wera, and the form is filled again.
    await userEvent.type(screen.getByLabelText('Your phone'), '(512) 555-0142');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedDetails).toEqual({ email: 'ada@example.com', city: 'Austin', phone: '(512) 555-0142' }));
    await waitFor(() => expect(sent.filter((m) => (m as { type: string }).type === 'wera:fill')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: /Draft an answer/ }));
    expect(await screen.findByLabelText('Answer to Why Acme?')).toHaveValue('Because robots.');
    await userEvent.click(screen.getByRole('button', { name: 'Insert into form' }));
    await waitFor(() => expect(sent).toContainEqual({ type: 'wera:insert', id: 'w3', text: 'Because robots.' }));
  });

  it('writes, edits and inserts a cover letter; tailors the resume', async () => {
    const { chrome } = fakeChrome({ page });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'Ada', is_admin: false } } });
    let body = '';
    let tailored: unknown = null;
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/cover-letter': () => (body ? { body, edited: false } : new Response('{"error":"none"}', { status: 404 })),
      'POST /api/jobs/9/cover-letter': () => ((body = 'Dear Hiring Team,\n\nHello.'), { body, edited: false }),
      'PUT /api/jobs/9/cover-letter': (init) => ((body = jsonBody<{ body: string }>(init).body), { body, edited: true }),
      'GET /api/jobs/9/keywords': () => ({ keywords: ['Go', 'Terraform'], coverage: tailored ? { matched: ['Go', 'Terraform'], missing: [], percent: 100 } : { matched: ['Go'], missing: ['Terraform'], percent: 50 }, resume_id: 1 }),
      'GET /api/jobs/9/resume': () => tailored ?? new Response('{"error":"none"}', { status: 404 }),
      'POST /api/jobs/9/resume': () => {
        tailored = { id: 7, title: 'SRE, Acme', job_id: 9, data: {}, layout: {}, fit: { one_page: true, summary: '' }, notes: ['Led with reliability'] };
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
    await userEvent.click(screen.getByRole('button', { name: 'Insert into page' }));
    expect(await screen.findByText('Inserted into the cover letter box.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Resume/ }));
    expect(await screen.findByText('50%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tailor my resume/ }));
    expect(await screen.findByText('Led with reliability')).toBeInTheDocument();
    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Edit in Wera/ })).toHaveAttribute('href', `${API}/profile/resume/7`);
    expect(await screen.findByAltText('Resume preview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalled());
    expect(within(document.body).queryByText('no route')).toBeNull();
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

  it('offers to fill a new step, then to mark the application as applied', async () => {
    const { chrome, emit, sent } = fakeChrome({
      page: { ...page, hasForm: true },
      fill: [{ id: 'w1', label: 'Email', purpose: 'email', status: 'filled', value: 'ada@example.com', required: true }],
    });
    signedIn(chrome);
    let status = '';
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'GET /api/applicant': () => ({ applicant: { email: 'ada@example.com' }, saved: true }),
      'GET /api/resumes': () => ({ resumes: [] }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
      'PUT /api/jobs/9/application': (init) => ((status = jsonBody<{ status: string }>(init).status), { ...job, application_status: status }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fill the form' }));
    await screen.findByText(/Filled 1 field/);
    const fills = () => sent.filter((m) => (m as { type: string }).type === 'wera:fill').length;
    expect(fills()).toBe(1);

    emit({ type: 'wera:form-changed', fields: 6 }, 99); // another tab: ignored
    emit({ type: 'wera:form-changed', fields: 6 });
    await userEvent.click(await screen.findByRole('button', { name: 'Fill this step' }));
    await waitFor(() => expect(fills()).toBe(2));
    await waitFor(() => expect(screen.queryByText(/A new step appeared/)).toBeNull());

    emit({ type: 'wera:submitted' });
    expect(await screen.findByText(/Looks like you submitted it/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark as applied' })[0]!);
    await waitFor(() => expect(status).toBe('applied'));
    expect(await screen.findByText(/Marked as applied in your Wera tracker/)).toBeInTheDocument();
  });

  it('fills when the keyboard shortcut asks', async () => {
    const { chrome, sent, setSession } = fakeChrome({ page, fill: [] });
    signedIn(chrome);
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'GET /api/applicant': () => ({ applicant: { email: 'ada@example.com' }, saved: true }),
      'GET /api/resumes': () => ({ resumes: [] }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
    });
    render(<App />);
    await screen.findByText('In your Wera lists');
    await setSession('wera.pendingFill', { tabId: 7, at: Date.now() });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Apply/ })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(sent.some((m) => (m as { type: string }).type === 'wera:fill')).toBe(true));
  });

  it('remembers an inserted answer and offers it for the same question later', async () => {
    const question = { id: 'w3', label: 'Why do you want to work here?', purpose: 'question' as const, status: 'question' as const, required: false };
    const { chrome, store } = fakeChrome({ page: { ...page, hasForm: true }, fill: [question] });
    signedIn(chrome);
    chrome.storage.local.get.mockImplementation(async (k: string) =>
      k === 'wera.session' ? { 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } } : k in store ? { [k]: store[k] } : {});
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'GET /api/applicant': () => ({ applicant: {}, saved: true }),
      'GET /api/resumes': () => ({ resumes: [] }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
      'POST /api/ext/answer': () => ({ answer: 'Acme keeps robots running in hospitals, and that is the reliability work I love.' }),
    });
    const first = render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fill the form' }));
    await userEvent.click(await screen.findByRole('button', { name: /Draft an answer/ }));
    await screen.findByLabelText(/Answer to Why do you want/);
    await userEvent.click(screen.getByRole('button', { name: 'Insert into form' }));
    await waitFor(() => expect(store['wera.answers']).toHaveLength(1));
    first.unmount();

    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fill the form' }));
    const reuse = await screen.findByRole('button', { name: /Your answer for Acme/ });
    await userEvent.click(reuse);
    expect(screen.getByLabelText(/Answer to Why do you want/)).toHaveValue('Acme keeps robots running in hospitals, and that is the reliability work I love.');
  });

  it('clears stale results when the page reloads and offers to fill again', async () => {
    const live: PageInfo = { ...page, hasForm: true, docId: 'd1' };
    const { chrome, sent } = fakeChrome({
      page: live,
      fill: [{ id: 'w1', label: 'Email', purpose: 'email', status: 'filled', value: 'ada@example.com', required: true }],
    });
    signedIn(chrome);
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/jobs/9/h1b': () => h1b,
      'GET /api/applicant': () => ({ applicant: { email: 'ada@example.com' }, saved: true }),
      'GET /api/resumes': () => ({ resumes: [] }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fill the form' }));
    await screen.findByText(/Filled 1 field/);

    // The user reloads the tab: a new document at the same address.
    live.docId = 'd2';
    const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0]![0] as (id: number, info: object, tab: object) => void;
    act(() => onUpdated(7, { status: 'complete' }, { id: 7, active: true }));
    await waitFor(() => expect(screen.queryByText(/Filled 1 field/)).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: 'Fill again' }));
    await waitFor(() => expect(sent.filter((m) => (m as { type: string }).type === 'wera:fill')).toHaveLength(2));
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

  it('drafts answers for an unsaved job from the posting on the page, sized to the box', async () => {
    const { chrome } = fakeChrome({
      page: { ...page, hasForm: true },
      fill: [{ id: 'w3', label: 'Why Acme?', purpose: 'question', status: 'question', required: true, maxLength: 700 }],
    });
    signedIn(chrome);
    let asked: Record<string, unknown> = {};
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job: null }),
      'GET /api/applicant': () => ({ applicant: {}, saved: true }),
      'GET /api/resumes': () => ({ resumes: [] }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
      'POST /api/ext/answer': (init) => ((asked = jsonBody(init)), { answer: 'Robots.' }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fill the form' }));
    await userEvent.click(await screen.findByRole('button', { name: /Draft an answer/ }));
    await screen.findByLabelText('Answer to Why Acme?');
    expect(asked).toMatchObject({ question: 'Why Acme?', job_id: 0, max_words: 100, company: 'Acme', title: 'SRE', description: 'Keep things up.' });
  });
});
