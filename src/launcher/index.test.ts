import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { launcherMatches, syncLauncher } from '../shared/launcher';
import { mountButton, pageKind, start } from './index';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'content', '__fixtures__', name), 'utf8');
const posting = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'SRE', hiringOrganization: { name: 'Acme' }, description: 'Run things.' })}</script><h1>SRE</h1>`;

describe('the Wera button', () => {
  it('tells application forms and postings from other pages', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    expect(pageKind(document)).toBe('form');
    document.body.innerHTML = posting;
    expect(pageKind(document)).toBe('posting');
    document.body.innerHTML = '<form><label>Search <input name="q"></label><label>Email <input type="email"></label></form>';
    expect(pageKind(document)).toBeNull();
  });

  it('opens Wera on click and hides for the site when dismissed', () => {
    const open = vi.fn();
    const dismiss = vi.fn();
    const { host, root } = mountButton(document, 'form', open, dismiss);
    const [go, close] = root.querySelectorAll('button');
    expect(go!.textContent).toContain('Autofill with Wera');
    go!.click();
    expect(open).toHaveBeenCalledOnce();
    close!.click();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(host.isConnected).toBe(false);
    expect(mountButton(document, 'posting', open, dismiss).root.textContent).toContain('Save to Wera');
  });

  it('shows itself on a job page unless turned off or dismissed', async () => {
    const storage: Record<string, unknown> = {};
    const sendMessage = vi.fn(async () => {});
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get: vi.fn(async () => storage), set: vi.fn(async (o: object) => Object.assign(storage, o)) } },
    });
    document.body.innerHTML = fixture('greenhouse.html');
    start(document, 5);
    await vi.waitFor(() => expect(document.querySelector('wera-launcher')).not.toBeNull());
    document.querySelector('wera-launcher')!.remove();

    storage['wera.settings'] = { launcher: false };
    document.body.innerHTML = posting;
    start(document, 5);
    await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector('wera-launcher')).toBeNull();
  });

  it('runs only on granted sites, never the Wera server', () => {
    expect(launcherMatches(['https://*.greenhouse.io/*', 'http://192.168.4.68:3000/*', 'https://jobs.example/*', 'chrome://x/*', 'https://jobs.example/*'], 'http://192.168.4.68:3000'))
      .toEqual(['https://*.greenhouse.io/*', 'https://jobs.example/*']);
  });

  it('stays off the Wera dashboard (its own forms are not applications)', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    document.documentElement.dataset.weraExtension = '0.3.0';
    expect(pageKind(document)).toBeNull();
    delete document.documentElement.dataset.weraExtension;
  });

  it('registers itself for the granted sites, and goes when signed out', async () => {
    let registered: { id: string; matches: string[] }[] = [];
    const scripting = {
      registerContentScripts: vi.fn(async (list: { id: string; matches: string[] }[]) => void (registered = list)),
      unregisterContentScripts: vi.fn(async () => void (registered = [])),
      getRegisteredContentScripts: vi.fn(async () => registered),
    };
    vi.stubGlobal('chrome', { scripting, permissions: { getAll: async () => ({ origins: ['https://*.lever.co/*', 'https://w.example/*'] }) } });
    await syncLauncher('https://w.example');
    expect(registered).toEqual([expect.objectContaining({ id: 'wera-launcher', matches: ['https://*.lever.co/*'], js: ['launcher.js'] })]);
    await syncLauncher('https://w.example');
    expect(scripting.registerContentScripts).toHaveBeenCalledOnce(); // unchanged: left alone
    await syncLauncher(null);
    expect(registered).toEqual([]);
  });
});
