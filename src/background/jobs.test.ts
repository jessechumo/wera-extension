import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeraJob } from '../shared/api';
import type { JobDraft } from '../shared/types';
import { handleJobRequest } from './jobs';

const base: WeraJob = {
  id: 9, company: 'Acme', title: 'SRE', url: 'https://jobs.example/acme/1', location_raw: null, location_summary: null, stage: 'scored',
  fit_score: 81, estimated_score: null, verdict: 'strong', reason: null, sponsorship: null, skills_matched: null, skills_missing: null,
  application_status: 'saved', source: 'greenhouse', autofilled_at: null,
};
const draft: JobDraft = { url: 'https://jobs.example/acme/2', company: 'Acme', title: 'Data Engineer', location: '', work_mode: '', employment_type: '', department: '', salary: '', industry: '', description: 'x', source: 'page-data' };

/** chrome.* for the background, and a fake Wera API behind fetch. */
function setup(opts: { signedIn?: boolean; found?: WeraJob | null; autoApplied?: boolean } = {}) {
  const local: Record<string, unknown> = opts.signedIn === false ? {} : { 'wera.session': { server: 'https://w.example', token: 't', user: { id: 1 } } };
  if (opts.autoApplied === false) local['wera.settings'] = { autoApplied: false };
  const session: Record<string, unknown> = {};
  const area = (data: Record<string, unknown>) => ({
    get: vi.fn(async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).filter((x) => x in data).map((x) => [x, data[x]]))),
    set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(data, o)),
    remove: vi.fn(async (k: string) => void delete data[k]),
  });
  const broadcast = vi.fn(async () => {});
  const toTab = vi.fn(async () => {});
  vi.stubGlobal('chrome', {
    storage: { local: area(local), session: area(session) },
    runtime: { sendMessage: broadcast },
    tabs: { sendMessage: toTab, query: vi.fn(async () => []) },
  });
  let job = opts.found === undefined ? { ...base } : opts.found;
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace('https://w.example', '');
    calls.push(`${init.method ?? 'GET'} ${path.replace(/\?.*/, '')}`);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (path.startsWith('/api/ext/jobs/lookup')) return json({ job });
    if (path === '/api/ext/jobs') {
      job = { ...base, id: 12, title: draft.title };
      return json(job, 201);
    }
    if (/^\/api\/jobs\/\d+\/application$/.test(path)) {
      const { status } = JSON.parse(init.body as string) as { status: string };
      job = { ...(job ?? base), application_status: status };
      return json(job);
    }
    if (/^\/api\/jobs\/\d+$/.test(path)) return job ? json(job) : json({ error: 'not found' }, 404);
    return json({ error: 'unexpected' }, 500);
  }));
  return { calls, broadcast, toTab, session };
}

afterEach(() => vi.unstubAllGlobals());

const TAB = 3;
const URL1 = 'https://jobs.example/acme/1';

describe('job requests in the background', () => {
  it('notes what the tab showed, without looking the job up (the panel does)', async () => {
    const { calls, session } = setup();
    expect(await handleJobRequest({ type: 'wera:job-seen', kind: 'form', draft: null }, TAB, URL1)).toBe(true);
    expect(calls).toEqual([]);
    expect(session['wera.tabPages']).toMatchObject({ [TAB]: { formAt: expect.any(Number) } });
  });

  it('knows an application by the posting that led to it, and remembers the job a panel saved', async () => {
    setup();
    // Only the posting's address is in Wera: the form page finds its job through the page it came from.
    const lookups = fetch as unknown as ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;
    lookups.mockImplementation((url) => Promise.resolve(new Response(JSON.stringify(url.includes(encodeURIComponent(URL1)) ? { job: base } : { job: null }), { status: 200 })));
    const apply = 'https://jobs.example/acme/1/apply';
    expect(await handleJobRequest({ type: 'wera:job-resolve', url: apply, title: '', referrer: URL1 }, TAB, apply)).toMatchObject({ id: 9 });
    // A page from another site is no evidence.
    expect(await handleJobRequest({ type: 'wera:job-resolve', url: 'https://other.example/x', title: '', referrer: URL1 }, 4, 'https://other.example/x')).toBeNull();
    // The panel saved a job on tab 5: the tab's next page on that site is for it.
    await handleJobRequest({ type: 'wera:job-remember', jobId: 9 }, 5, 'https://jobs.example/acme/2');
    lookups.mockImplementation((url) => Promise.resolve(new Response(JSON.stringify(url.includes('/api/jobs/9') ? base : { job: null }), { status: 200 })));
    expect(await handleJobRequest({ type: 'wera:job-resolve', url: 'https://jobs.example/acme/2/apply', title: '' }, 5, 'https://jobs.example/acme/2/apply')).toMatchObject({ id: 9 });
  });

  it('marks the job applied when the site confirms an application it showed the form for', async () => {
    const { calls, toTab } = setup();
    await handleJobRequest({ type: 'wera:job-seen', kind: 'form', draft: null }, TAB, `${URL1}/apply`);
    const r = await handleJobRequest({ type: 'wera:job-submitted', url: `${URL1}/thanks` }, TAB, `${URL1}/thanks`);
    expect(r).toMatchObject({ state: 'marked', previous: 'saved', job: { id: 9, status: 'applied' } });
    expect(calls).toContain('PUT /api/jobs/9/application');
    // The tab's Wera panel hears it (in the top frame).
    expect(toTab).toHaveBeenCalledWith(TAB, expect.objectContaining({ type: 'wera:job-changed', applied: true }), { frameId: 0 });
    // Once is enough: the same confirmation again leaves it.
    expect(await handleJobRequest({ type: 'wera:job-submitted', url: `${URL1}/thanks` }, TAB, `${URL1}/thanks`)).toEqual({ state: 'off' });
  });

  it('leaves pages that merely say "thank you for applying", and jobs already further on', async () => {
    setup();
    expect(await handleJobRequest({ type: 'wera:job-submitted', url: URL1 }, TAB, URL1)).toEqual({ state: 'off' });
    setup({ found: { ...base, application_status: 'interviewing' } });
    await handleJobRequest({ type: 'wera:job-seen', kind: 'form', draft: null }, TAB, URL1);
    expect(await handleJobRequest({ type: 'wera:job-submitted', url: URL1 }, TAB, URL1)).toMatchObject({ state: 'already' });
    setup({ autoApplied: false });
    await handleJobRequest({ type: 'wera:job-seen', kind: 'form', draft: null }, TAB, URL1);
    expect(await handleJobRequest({ type: 'wera:job-submitted', url: URL1 }, TAB, URL1)).toEqual({ state: 'off' });
  });

  it('offers to add a job Wera does not have as applied, from the posting the tab showed', async () => {
    setup({ found: null });
    await handleJobRequest({ type: 'wera:job-seen', kind: 'posting', draft }, TAB, draft.url);
    await handleJobRequest({ type: 'wera:job-seen', kind: 'form', draft: null }, TAB, `${draft.url}/apply`);
    expect(await handleJobRequest({ type: 'wera:job-submitted', url: `${draft.url}/done` }, TAB, `${draft.url}/done`))
      .toEqual({ state: 'unknown', draft: { title: 'Data Engineer', company: 'Acme' } });
  });

  it('learns details the profile lacks from a form the user moved on from, and keeps the rest', async () => {
    setup();
    let saved: Record<string, string> | null = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/api/applicant') && init.method === 'PUT') {
        saved = JSON.parse(init.body as string) as Record<string, string>;
        return json({ applicant: saved, saved: true });
      }
      if (url.endsWith('/api/applicant')) return json({ applicant: { first_name: 'Ada', gender: '', race: 'White', veteran: '', phone: '' }, saved: true });
      return json({});
    }));
    const keys = await handleJobRequest({ type: 'wera:job-learn', entries: [
      { purpose: 'gender', value: 'Woman' }, { purpose: 'race', value: 'Asian' }, { purpose: 'veteran', value: 'I am on active duty' }, { purpose: 'phone', value: '512 555 0142' },
    ] }, TAB, URL1);
    expect(keys).toEqual(['gender', 'phone']);
    expect(saved).toMatchObject({ first_name: 'Ada', gender: 'Female', race: 'White', veteran: '', phone: '512 555 0142' });
  });
});
