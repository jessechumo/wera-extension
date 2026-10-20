import { describe, expect, it, vi } from 'vitest';
import { ApiError, WeraApi } from './api';
import { normalizeServer } from './storage';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('WeraApi', () => {
  it('signs in, then sends the bearer token and never cookies', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(201, { token: 'wera_ext_abc', user: { id: 1, email: 'a@x', name: 'A', is_admin: false } }))
      .mockResolvedValueOnce(json(200, { job: null }));
    const api = new WeraApi('https://wera.example', '', fetcher);
    await api.connect('a@x', 'pw', 'Chrome');
    await api.lookup('https://jobs.example/1?a=b');
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://wera.example/api/ext/jobs/lookup?url=https%3A%2F%2Fjobs.example%2F1%3Fa%3Db');
    expect(init.headers.Authorization).toBe('Bearer wera_ext_abc');
    expect(init.credentials).toBe('omit');
  });

  it('turns errors into ApiError with the server message', async () => {
    const api = new WeraApi('https://w', 't', vi.fn().mockResolvedValue(json(422, { error: 'company and title are required' })));
    await expect(api.addJob({} as never)).rejects.toMatchObject({ status: 422, message: 'company and title are required' });
    const down = new WeraApi('https://w', 't', vi.fn().mockRejectedValue(new TypeError('failed')));
    await expect(down.me()).rejects.toBeInstanceOf(ApiError);
  });

  it('returns null for a missing letter or resume', async () => {
    const api = new WeraApi('https://w', 't', vi.fn().mockResolvedValue(json(404, { error: 'none' })));
    await expect(api.coverLetter(1)).resolves.toBeNull();
    await expect(api.jobResume(1)).resolves.toBeNull();
    await expect(api.resumeFile(1)).resolves.toBeNull();
  });

  it('attaches the tailored copy, else the main resume, else the upload', async () => {
    const pdf = (name: string) => new Response(new TextEncoder().encode('%PDF-1.4'), {
      status: 200, headers: { 'Content-Disposition': `attachment; filename="${name}"` } });
    const resumes = [{ id: 1, job_id: null }, { id: 2, job_id: 9 }];
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/api/resumes')) return json(200, { resumes });
      if (url.includes('/api/resumes/2/pdf')) return pdf('Ada_Acme.pdf');
      if (url.includes('/api/resumes/1/pdf')) return pdf('Ada_Resume.pdf');
      if (url.includes('/api/profile/resume/file')) return pdf('upload.pdf');
      return json(404, {});
    });
    const api = new WeraApi('https://w', 't', fetcher as typeof fetch);
    await expect(api.resumeFile(9)).resolves.toEqual({ name: 'Ada_Acme.pdf', base64: btoa('%PDF-1.4'), kind: 'tailored' });
    await expect(api.resumeFile(5)).resolves.toMatchObject({ name: 'Ada_Resume.pdf', kind: 'base' });
    resumes.length = 0;
    await expect(api.resumeFile(9)).resolves.toMatchObject({ name: 'upload.pdf', kind: 'upload' });
  });
});

describe('autofill, answers and resume calls', () => {
  const calls = () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/applicant/answers') && (!init?.method || init.method === 'GET')) {
        return json(200, { answers: [{ id: 3, question: 'Notice?', answer: 'Two weeks', kind: 'text', company: 'Acme', updated_at: '2026-10-01T00:00:00Z' }] });
      }
      if (url.endsWith('/api/resumes')) return json(200, { resumes: [{ id: 2, job_id: 9 }, { id: 1, job_id: null }] });
      return json(200, {});
    });
    const changed = vi.fn();
    return { fetcher, changed, api: new WeraApi('https://w', 't', fetcher as typeof fetch, changed) };
  };
  const body = (f: ReturnType<typeof vi.fn>, i: number) => JSON.parse((f.mock.calls[i]![1] as RequestInit).body as string) as Record<string, unknown>;

  it('maps saved answers and sends new ones', async () => {
    const { api, fetcher, changed } = calls();
    await expect(api.answers()).resolves.toEqual([{ id: 3, question: 'Notice?', answer: 'Two weeks', kind: 'text', company: 'Acme', at: Date.parse('2026-10-01T00:00:00Z') }]);
    await api.saveAnswers([{ question: 'Q', answer: 'A' }]);
    expect(body(fetcher, 1)).toEqual({ answers: [{ question: 'Q', answer: 'A' }] });
    expect(changed).toHaveBeenCalledWith('/api/applicant/answers');
    await expect(new WeraApi('https://w', 't', vi.fn().mockResolvedValue(json(404, {}))).answers()).resolves.toEqual([]);
  });

  it('asks for page suggestions without telling the dashboard anything changed', async () => {
    const { api, fetcher, changed } = calls();
    await api.suggest([{ id: 'w1', label: 'Clearance', kind: 'select', options: ['Yes', 'No'] }], null, { company: 'Acme', title: 'SRE', description: 'x'.repeat(9000) });
    const b = body(fetcher, 0);
    expect(b).toMatchObject({ job_id: 0, company: 'Acme', title: 'SRE' });
    expect((b.description as string).length).toBe(8000);
    expect(changed).not.toHaveBeenCalled();
    await api.startRun('jobs.example', 4, 10, 2);
    expect(body(fetcher, 1)).toEqual({ host: 'jobs.example', job_id: 4, filled: 10, suggested: 2 });
    await api.addRunPage(8, 3, 0);
    expect(fetcher.mock.calls[2]![0]).toBe('https://w/api/ext/autofill-runs/8/pages');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('steers letters and tailoring, and edits resumes', async () => {
    const { api, fetcher } = calls();
    await api.writeCoverLetter(5, undefined, { tone: 'formal', request: 'Mention Go' });
    expect(body(fetcher, 0)).toEqual({ tone: 'formal', request: 'Mention Go' });
    await api.writeCoverLetter(5, 'Edited');
    expect(body(fetcher, 1)).toEqual({ body: 'Edited' });
    await api.writeCoverLetter(5);
    expect((fetcher.mock.calls[2]![1] as RequestInit).body).toBeUndefined();
    await api.tailorResume(5, '  lead with Kubernetes ');
    expect(body(fetcher, 3)).toEqual({ request: 'lead with Kubernetes' });
    await api.baseResume();
    expect(fetcher.mock.calls[5]![0]).toBe('https://w/api/resumes/1');
    await api.createResume('profile');
    expect(body(fetcher, 6)).toEqual({ source: 'profile' });
    await api.saveResume({ id: 1, title: 'Main', job_id: null, data: { name: 'Ada', sections: [] }, layout: { font_size: 11, spacing: 1, margin: 0.5 }, fit: null, notes: [] });
    expect(body(fetcher, 7)).toMatchObject({ title: 'Main', data: { name: 'Ada' } });
    await api.fitResume(1);
    await api.suggestBullet('Ran things', 'SRE at Acme', null);
    expect(body(fetcher, 9)).toEqual({ text: 'Ran things', role: 'SRE at Acme', job_id: 0 });
  });
});

describe('normalizeServer', () => {
  it.each([
    ['http://192.168.4.68:3000/', 'http://192.168.4.68:3000'],
    ['wera.example.com', 'https://wera.example.com'],
    ['https://wera.example.com/some/path', 'https://wera.example.com'],
    ['javascript:alert(1)', null],
    ['', null],
  ])('%s -> %s', (raw, want) => expect(normalizeServer(raw)).toBe(want));
});
