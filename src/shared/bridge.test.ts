import { describe, expect, it, vi } from 'vitest';
import { bindTab, expectHandoff, sameRole, syncBridge, tabHandoff, takeHandoff } from './bridge';

function stubStorage() {
  const session: Record<string, unknown> = {};
  const scripts: chrome.scripting.RegisteredContentScript[] = [];
  const chromeFake = {
    storage: {
      session: {
        get: vi.fn(async (k: string) => (k in session ? { [k]: session[k] } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => void Object.assign(session, o)),
        remove: vi.fn(async (k: string) => void delete session[k]),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => [...scripts]),
      registerContentScripts: vi.fn(async (s: chrome.scripting.RegisteredContentScript[]) => void scripts.push(...s)),
      unregisterContentScripts: vi.fn(async () => void scripts.splice(0)),
      executeScript: vi.fn(async () => []),
    },
    tabs: { query: vi.fn(async () => [{ id: 3 }]), sendMessage: vi.fn(async () => undefined) },
  };
  vi.stubGlobal('chrome', chromeFake);
  return { chrome: chromeFake, session, scripts };
}

describe('dashboard handoff', () => {
  it('ties the tab the dashboard opens to the job it named, even if the note arrives late', async () => {
    stubStorage();
    const taking = takeHandoff({ id: 12, openerTabId: 3 }, 5, 20);
    await new Promise((r) => setTimeout(r, 30));
    await expectHandoff(3, 9, 'https://boards.greenhouse.io/acme/jobs/123');
    expect(await taking).toBe(true);
    expect(await tabHandoff(12)).toMatchObject({ jobId: 9 });
    // Taken once: another tab from the dashboard is not tied to it.
    expect(await takeHandoff({ id: 13, openerTabId: 3 }, 1)).toBe(false);
  });

  it('also matches a tab opened at the job address, and ignores unrelated tabs', async () => {
    stubStorage();
    await expectHandoff(3, 9, 'https://jobs.lever.co/acme/abc');
    expect(await takeHandoff({ id: 20, openerTabId: 5, pendingUrl: 'https://news.example/' }, 1)).toBe(false);
    expect(await takeHandoff({ id: 21, pendingUrl: 'https://jobs.lever.co/acme/abc/?utm_source=wera' }, 1)).toBe(true);
    await bindTab(21, null);
    expect(await tabHandoff(21)).toBeNull();
  });

  it('tells the same role from a different posting', () => {
    expect(sameRole('Site Reliability Engineer II', 'Site Reliability Engineer')).toBe(true);
    expect(sameRole('SRE, Infrastructure', 'Infrastructure SRE (New Grad)')).toBe(true);
    expect(sameRole('Account Executive', 'Site Reliability Engineer')).toBe(false);
  });
});

describe('syncBridge', () => {
  it('registers the bridge for the signed-in server, moves it, and removes it on sign-out', async () => {
    const { chrome, scripts } = stubStorage();
    await syncBridge('http://192.168.4.68:3000');
    expect(scripts[0]).toMatchObject({ id: 'wera-bridge', matches: ['http://192.168.4.68:3000/*'], js: ['bridge.js'] });
    // Open dashboards get it right away.
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 3 }, files: ['bridge.js'] });
    await syncBridge('http://192.168.4.68:3000');
    expect(chrome.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    await syncBridge('https://wera.example.com');
    expect(scripts.map((s) => s.matches)).toEqual([['https://wera.example.com/*']]);
    await syncBridge(null);
    expect(scripts).toEqual([]);
  });
});
