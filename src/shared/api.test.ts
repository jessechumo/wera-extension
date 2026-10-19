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

describe('normalizeServer', () => {
  it.each([
    ['http://192.168.4.68:3000/', 'http://192.168.4.68:3000'],
    ['wera.example.com', 'https://wera.example.com'],
    ['https://wera.example.com/some/path', 'https://wera.example.com'],
    ['javascript:alert(1)', null],
    ['', null],
  ])('%s -> %s', (raw, want) => expect(normalizeServer(raw)).toBe(want));
});
