import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeraJob } from '../shared/api';
import type { JobDraft } from '../shared/types';
import { handleDock } from './dock';

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

describe('the dock in the background', () => {
  it('says who is signed in and which job the page is', async () => {
    setup();
    expect(await handleDock({ type: 'wera:dock-hello', url: URL1, kind: 'posting', draft: null }, TAB, URL1))
      .toEqual({ signedIn: true, job: expect.objectContaining({ id: 9, score: 81, status: 'saved', autofilled: false }) });
    setup({ signedIn: false });
    expect(await handleDock({ type: 'wera:dock-hello', url: URL1, kind: 'posting', draft: null }, TAB, URL1)).toEqual({ signedIn: false, job: null });
  });

  it('marks the job applied when the site confirms an application it showed the form for', async () => {
    const { calls, broadcast, toTab } = setup();
    await handleDock({ type: 'wera:dock-hello', url: `${URL1}/apply`, kind: 'form', draft: null }, TAB, `${URL1}/apply`);
    const r = await handleDock({ type: 'wera:dock-submitted', url: `${URL1}/thanks` }, TAB, `${URL1}/thanks`);
    expect(r).toMatchObject({ state: 'marked', previous: 'saved', job: { id: 9, status: 'applied' } });
    expect(calls).toContain('PUT /api/jobs/9/application');
    // The side panel and the page's dock hear of it.
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'wera:job-changed', tabId: TAB, applied: true }));
    expect(toTab).toHaveBeenCalledWith(TAB, expect.objectContaining({ type: 'wera:dock-job' }));
    // Once is enough: the same confirmation again leaves it.
    expect(await handleDock({ type: 'wera:dock-submitted', url: `${URL1}/thanks` }, TAB, `${URL1}/thanks`)).toEqual({ state: 'off' });
  });

  it('leaves pages that merely say "thank you for applying", and jobs already further on', async () => {
    setup();
    expect(await handleDock({ type: 'wera:dock-submitted', url: URL1 }, TAB, URL1)).toEqual({ state: 'off' });
    setup({ found: { ...base, application_status: 'interviewing' } });
    await handleDock({ type: 'wera:dock-hello', url: URL1, kind: 'form', draft: null }, TAB, URL1);
    expect(await handleDock({ type: 'wera:dock-submitted', url: URL1 }, TAB, URL1)).toMatchObject({ state: 'already' });
    setup({ autoApplied: false });
    await handleDock({ type: 'wera:dock-hello', url: URL1, kind: 'form', draft: null }, TAB, URL1);
    expect(await handleDock({ type: 'wera:dock-submitted', url: URL1 }, TAB, URL1)).toEqual({ state: 'off' });
  });

  it('offers to add a job Wera does not have as applied, from the posting the tab showed', async () => {
    const { calls } = setup({ found: null });
    await handleDock({ type: 'wera:dock-hello', url: draft.url, kind: 'posting', draft }, TAB, draft.url);
    await handleDock({ type: 'wera:dock-hello', url: `${draft.url}/apply`, kind: 'form', draft: null }, TAB, `${draft.url}/apply`);
    expect(await handleDock({ type: 'wera:dock-submitted', url: `${draft.url}/done` }, TAB, `${draft.url}/done`))
      .toEqual({ state: 'unknown', draft: { title: 'Data Engineer', company: 'Acme' } });
    expect(await handleDock({ type: 'wera:dock-add-applied' }, TAB, `${draft.url}/done`)).toMatchObject({ id: 12, status: 'applied' });
    expect(calls).toEqual(expect.arrayContaining(['POST /api/ext/jobs', 'PUT /api/jobs/12/application']));
  });

  it('saves a posting from its job data', async () => {
    const { calls } = setup({ found: null });
    expect(await handleDock({ type: 'wera:dock-save', draft }, TAB, draft.url)).toMatchObject({ id: 12, title: 'Data Engineer' });
    expect(calls).toContain('POST /api/ext/jobs');
  });
});
