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
    const [url, init] = fetcher.mock.calls[1]!;
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
    await expect(api.resumePdf()).resolves.toBeNull();
  });

  it('downloads the resume as base64 with its file name', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4');
    const api = new WeraApi('https://w', 't', vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { 'Content-Disposition': 'attachment; filename="Ada_Resume.pdf"' } })));
    await expect(api.resumePdf()).resolves.toEqual({ name: 'Ada_Resume.pdf', base64: btoa('%PDF-1.4') });
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
