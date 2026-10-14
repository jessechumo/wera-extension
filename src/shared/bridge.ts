// The link between the Wera dashboard and the extension: a small script
// on the dashboard's pages (registered for the user's own server), and
// what the dashboard hands over when the user opens a job's site.

export const BRIDGE_FROM_DASHBOARD = 'wera-dashboard';
export const BRIDGE_FROM_EXTENSION = 'wera-extension';
const SCRIPT_ID = 'wera-bridge';

/** What the dashboard posts (window.postMessage) for the bridge to pass on. */
export type BridgeMessage =
  | { type: 'open-job'; jobId: number; url: string }
  | { type: 'changed'; what?: string };

/** Puts the bridge on the user's Wera dashboard (and its open tabs), or removes it after sign-out. */
export async function syncBridge(server: string | null): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) return;
  const have = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
  const matches = server ? [`${server}/*`] : [];
  if (have.length && JSON.stringify(have[0]!.matches) === JSON.stringify(matches)) return;
  if (have.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {});
  if (!server) return;
  try {
    await chrome.scripting.registerContentScripts([
      { id: SCRIPT_ID, matches, js: ['bridge.js'], runAt: 'document_start', persistAcrossSessions: true },
    ]);
  } catch {
    return; // no permission for the server (yet)
  }
  // Dashboards already open get it now rather than on their next load.
  for (const tab of await chrome.tabs.query({ url: matches }).catch(() => [])) {
    if (tab.id != null) void chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'] }).catch(() => {});
  }
}

/** Tells open dashboard tabs that the extension changed something (they refetch). */
export async function notifyDashboard(server: string, what: string): Promise<void> {
  if (!chrome.tabs?.query) return;
  for (const tab of await chrome.tabs.query({ url: `${server}/*` }).catch(() => [])) {
    if (tab.id != null) void chrome.tabs.sendMessage(tab.id, { type: 'wera:extension-changed', what }).catch(() => {});
  }
}

const HANDOFFS = 'wera.handoffs';
const PENDING = 'wera.pendingHandoff';
const HANDOFF_TTL = 6 * 3600_000;

export interface Handoff {
  jobId: number;
  url: string;
  at: number;
}

/** The dashboard is about to open a job's site from tab `from`. */
export async function expectHandoff(from: number, jobId: number, url: string): Promise<void> {
  await chrome.storage.session.set({ [PENDING]: { from, jobId, url, at: Date.now() } });
}

const sameUrl = (a: string | undefined, b: string) => !!a && a.replace(/[#?].*$/, '').replace(/\/$/, '') === b.replace(/[#?].*$/, '').replace(/\/$/, '');

/**
 * A tab opened from the dashboard just after it said which job (or opened
 * at that job's address): that tab is for that job. The dashboard's note
 * travels through the bridge, so it may land a moment after the tab opens.
 */
export async function takeHandoff(tab: { id?: number; openerTabId?: number; pendingUrl?: string; url?: string }, tries = 6, delay = 120): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const got = await chrome.storage.session.get(PENDING);
    const p = got[PENDING] as { from: number; jobId: number; url: string; at: number } | undefined;
    if (p && Date.now() - p.at < 10_000 && (p.from === tab.openerTabId || sameUrl(tab.pendingUrl ?? tab.url, p.url))) {
      await chrome.storage.session.remove(PENDING);
      await bindTab(tab.id!, { jobId: p.jobId, url: p.url, at: Date.now() });
      return true;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

async function handoffs(): Promise<Record<string, Handoff>> {
  const got = await chrome.storage.session.get(HANDOFFS);
  return (got[HANDOFFS] as Record<string, Handoff> | undefined) ?? {};
}

export async function bindTab(tabId: number, h: Handoff | null): Promise<void> {
  const map = await handoffs();
  if (h) map[tabId] = h;
  else delete map[tabId];
  // Old bindings go.
  for (const [k, v] of Object.entries(map)) if (Date.now() - v.at > HANDOFF_TTL) delete map[k];
  await chrome.storage.session.set({ [HANDOFFS]: map });
}

/** The job the dashboard opened this tab for, if any. */
export async function tabHandoff(tabId: number): Promise<Handoff | null> {
  const h = (await handoffs())[tabId];
  return h && Date.now() - h.at < HANDOFF_TTL ? h : null;
}

const words = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['and', 'the', 'of', 'ii', 'iii', 'i'].includes(w)));

/** Whether two job titles name the same role (most words shared), to drop a handoff on a different posting. */
export function sameRole(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return true;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size) >= 0.5;
}
