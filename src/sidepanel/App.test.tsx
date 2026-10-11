import { render, screen, waitFor, within } from '@testing-library/react';
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
      'POST /api/ext/jobs': (init) => ((saved = JSON.parse(String(init.body))), { ...job, fit_score: null, stage: 'pending_score' }),
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
    expect(screen.getByText(/You may lack: Terraform/)).toBeInTheDocument();
  });

  it('asks for access to a site it cannot read yet', async () => {
    const { chrome } = fakeChrome({ page });
    chrome.storage.local.get.mockResolvedValue({ 'wera.session': { server: API, token: 't', user: { id: 1, email: 'a', name: 'A', is_admin: false } } });
    chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents of the page'));
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
    fakeFetch({
      'GET /api/ext/jobs/lookup': () => ({ job }),
      'GET /api/applicant': () => ({ applicant: { email: 'ada@example.com' }, saved: true }),
      'GET /api/profile/resume/file': () => new Response('{"error":"none"}', { status: 404 }),
      'POST /api/ext/answer': () => ({ answer: 'Because robots.' }),
    });
    render(<App />);
    // An application page opens on Apply.
    await waitFor(() => expect(screen.getByRole('tab', { name: /Apply/ })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    expect(await screen.findByText(/Filled 1 field; 1 to check/)).toBeInTheDocument();
    expect(screen.getByText('not in your application details')).toBeInTheDocument();
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
      'PUT /api/jobs/9/cover-letter': (init) => ((body = JSON.parse(String(init.body)).body), { body, edited: true }),
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
    expect(screen.getByRole('link', { name: /Edit in Wera/ })).toHaveAttribute('href', `${API}/resume/7`);
    expect(await screen.findByAltText('Resume preview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalled());
    expect(within(document.body).queryByText('no route')).toBeNull();
  });
});
