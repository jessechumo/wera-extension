import { describe, expect, it, vi } from 'vitest';

describe('dashboard bridge script', () => {
  it('marks the page, passes dashboard notes on, and relays extension changes', async () => {
    let onMessage: ((m: unknown) => void) | undefined;
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => ({ version: '0.3.0' }),
        sendMessage,
        onMessage: { addListener: (f: (m: unknown) => void) => (onMessage = f) },
      },
    });
    await import('./index');
    expect(document.documentElement.dataset.weraExtension).toBe('0.3.0');

    const post = (data: unknown, origin = location.origin) =>
      window.dispatchEvent(new MessageEvent('message', { data, origin, source: window }));
    post({ source: 'wera-dashboard', type: 'open-job', jobId: 9, url: 'https://jobs.example/9' });
    post({ source: 'wera-dashboard', type: 'open-job', jobId: 1, url: 'https://evil.example' }, 'https://evil.example');
    post({ source: 'someone-else', type: 'open-job', jobId: 2, url: 'https://x.example' });
    expect(sendMessage.mock.calls).toEqual([[{ source: 'wera-dashboard', type: 'wera:dashboard-open-job', jobId: 9, url: 'https://jobs.example/9' }]]);

    const seen: unknown[] = [];
    window.addEventListener('message', (e) => seen.push(e.data));
    onMessage!({ type: 'wera:extension-changed', what: '/api/jobs/9/application' });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toContainEqual({ source: 'wera-extension', type: 'changed', what: '/api/jobs/9/application' });
  });
});

describe('the dashboard theme', () => {
  it('passes the theme picked in the dashboard to the extension, and changes with it', async () => {
    const set = vi.fn(async () => {});
    vi.stubGlobal('chrome', { storage: { local: { set } } });
    const { syncTheme } = await import('./index');
    localStorage.setItem('wera-theme', 'light');
    const stop = syncTheme(document);
    expect(set).toHaveBeenLastCalledWith({ 'wera.theme': 'light' });
    localStorage.setItem('wera-theme', 'dark');
    document.documentElement.dataset.theme = 'dark';
    await new Promise((r) => setTimeout(r, 0));
    expect(set).toHaveBeenLastCalledWith({ 'wera.theme': 'dark' });
    localStorage.removeItem('wera-theme');
    document.documentElement.dataset.theme = 'light';
    await new Promise((r) => setTimeout(r, 0));
    expect(set).toHaveBeenLastCalledWith({ 'wera.theme': 'system' });
    stop();
  });
});
