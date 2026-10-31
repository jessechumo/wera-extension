// The background's side of the Wera panel (it runs inside the job page):
// it calls the user's Wera server and the page's frames on the panel's
// behalf, signs in and out, and puts the panel on the page.
import { ApiError, WeraApi } from '../shared/api';
import { notifyDashboard } from '../shared/bridge';
import { remoteCallable, settle, type PanelRequest, type RpcReply } from '../shared/rpc';
import { loadSession, normalizeServer, rememberTabJob, saveSession } from '../shared/storage';
import { signedInApi } from './jobs';
import * as frames from './frames';

/** Puts the panel on the tab's page (once) and tells it to show: open, and fill, when asked; formFrame: a frame holds the form. */
export async function ensurePanel(tabId: number, opts: { open?: boolean; fill?: boolean; formFrame?: boolean } = {}): Promise<boolean> {
  const ok = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['panel.js'] }).then(() => true, () => false);
  if (ok) await chrome.tabs.sendMessage(tabId, { type: 'wera:panel-show', tabId, ...opts }, { frameId: 0 }).catch(() => {});
  return ok;
}

export async function handlePanel(msg: PanelRequest, tabId: number, frameId: number): Promise<RpcReply> {
  switch (msg.type) {
    case 'wera:api':
      return settle(async () => {
        const api = await signedInApi();
        if (!api) throw new ApiError(401, 'Sign in to Wera first.');
        const fn = (api as unknown as Record<string, unknown>)[msg.method];
        if (!remoteCallable(msg.method) || typeof fn !== 'function') throw new ApiError(400, `unknown request ${msg.method}`);
        return (fn as (...a: unknown[]) => Promise<unknown>).apply(api, msg.args);
      });
    case 'wera:frames':
      // Only the panel (the top frame) works the form; the answer button in a frame never does.
      if (frameId !== 0) return { ok: false, status: 403, error: 'only the Wera panel works the form' };
      return settle(() => runFrames(tabId, msg.op, msg.args));
    case 'wera:sign-in':
      return settle(async () => {
        const origin = normalizeServer(msg.server);
        if (!origin) throw new Error('Enter your Wera address, for example https://wera.example.com');
        const api = new WeraApi(origin);
        const { token, user } = await api.connect(msg.email, msg.password, `Chrome on ${navigator.platform || 'this computer'}`);
        await saveSession({ server: origin, token, user });
        return { server: origin, user };
      });
    case 'wera:sign-out':
      return settle(async () => {
        const s = await loadSession();
        if (s) await new WeraApi(s.server, s.token, undefined, (p) => void notifyDashboard(s.server, p)).disconnect().catch(() => {});
        await saveSession(null);
        return null;
      });
    case 'wera:panel-ensure':
      return settle(() => ensurePanel(tabId, { open: msg.open, fill: msg.fill, formFrame: frameId !== 0 }));
    case 'wera:tab-close':
      if (frameId !== 0) return { ok: false, status: 403, error: 'only the Wera panel closes the tab' };
      return settle(() => closeTab(tabId));
    case 'wera:open-next':
      if (frameId !== 0) return { ok: false, status: 403, error: 'only the Wera panel moves the tab on' };
      return settle(() => openNext(tabId, msg.jobId, msg.url));
  }
}

/** Takes the tab to the user's next match, and remembers which job that is: its address may differ from Wera's. */
export async function openNext(tabId: number, jobId: number, url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) throw new Error('not a web address');
  await rememberTabJob(tabId, new URL(url).origin, jobId);
  await chrome.tabs.update(tabId, { url });
}

/** Closes the tab; the last tab of its window goes to the Wera tracker instead, so the window stays. */
export async function closeTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const siblings = await chrome.tabs.query({ windowId: tab.windowId });
  if (siblings.length > 1) return chrome.tabs.remove(tabId);
  const s = await loadSession();
  await chrome.tabs.update(tabId, { url: s ? `${s.server}/tracker` : 'chrome://newtab/' });
}

function runFrames(tabId: number, op: string, args: unknown[]): Promise<unknown> {
  if (!Object.hasOwn(frames.run, op)) return Promise.reject(new Error(`unknown frame request ${op}`));
  // The arguments come from Wera's own panel (only the top frame may ask, see above).
  const fn = frames.run[op as keyof typeof frames.run] as (tabId: number, ...a: unknown[]) => Promise<unknown>;
  return fn(tabId, ...args);
}
