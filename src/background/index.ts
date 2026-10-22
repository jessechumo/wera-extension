// The service worker. It puts the Wera panel on job pages and does what
// the panel cannot from inside a page: calls the user's Wera server and
// reaches the page's other frames. The toolbar icon and Alt+Shift+W show
// or hide the panel; Alt+Shift+F (or the right-click menu) fills the form.
// It also keeps the dashboard bridge: which job the dashboard opened in a tab.
import { expectHandoff, syncBridge, takeHandoff } from '../shared/bridge';
import { isDockRequest } from '../shared/dock';
import { isPanelRequest } from '../shared/rpc';
import { loadSession } from '../shared/storage';
import type { ContentEvent } from '../shared/types';
import { handleDock } from './dock';
import { frameField } from './frames';
import { ensurePanel, handlePanel } from './panel';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'wera-fill', title: 'Fill this application with Wera', contexts: ['page', 'editable'] });
  // Older installs registered the Wera button per site, and could hide the dock on a site for a week.
  void chrome.scripting.unregisterContentScripts({ ids: ['wera-launcher'] }).catch(() => {});
  void chrome.storage.local.remove('wera.launcherDismissed').catch(() => {});
  void syncAll();
});

chrome.runtime.onStartup.addListener(() => void syncAll());

// The panel (a page script) keeps where a multi-page application is in session storage.
void chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});

let syncing: Promise<void> = Promise.resolve();

/**
 * The dashboard bridge on the user's server. Runs one at a time: signing
 * in fires several events at once, and overlapping runs could unregister
 * what another just registered.
 */
function syncAll(): Promise<void> {
  syncing = syncing.then(async () => {
    const s = await loadSession();
    await syncBridge(s?.server ?? null);
  }).catch(() => {});
  return syncing;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['wera.session']) void syncAll();
});

/** Shows or hides the panel on the tab's page; on a page Wera cannot run on, opens the dashboard. */
async function toggle(tab: chrome.tabs.Tab | undefined, fill = false) {
  if (tab?.id == null) return;
  if (!/^https?:/.test(tab.url ?? '')) {
    const s = await loadSession();
    if (s) void chrome.tabs.create({ url: `${s.server}/` });
    return;
  }
  const shown = fill ? null : await chrome.tabs.sendMessage<{ type: string }, boolean>(tab.id, { type: 'wera:panel-toggle' }, { frameId: 0 }).catch(() => null);
  if (!shown) await ensurePanel(tab.id, { open: true, fill });
}

chrome.action.onClicked.addListener((tab) => void toggle(tab));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wera-fill') void toggle(tab, true);
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel') void toggle(tab);
  if (command === 'fill-form') void toggle(tab, true);
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab?.id == null) return false;
  const tabId = sender.tab.id;
  if (isPanelRequest(msg)) {
    handlePanel(msg, tabId, sender.frameId ?? 0).then(reply, (e: unknown) => reply({ ok: false, status: 0, error: String(e) }));
    return true; // async reply
  }
  if (isDockRequest(msg)) {
    handleDock(msg, tabId, sender.tab.url ?? '').then(reply, () => reply(null));
    return true;
  }
  // What a frame's page script noticed (a new form step, a field filled, a confirmation): the panel hears it.
  const e = msg as ContentEvent | null;
  if (e?.type === 'wera:form-changed' || e?.type === 'wera:fill-progress' || e?.type === 'wera:submitted' || e?.type === 'wera:navigated') {
    const frameId = sender.frameId ?? 0;
    const event = e.type === 'wera:fill-progress' ? { ...e, result: { ...e.result, id: frameField(frameId, e.result.id) } } : e;
    void chrome.tabs.sendMessage(tabId, { type: 'wera:frame-event', frameId, event }, { frameId: 0 }).catch(() => {});
  }
  return false;
});

// "Apply on Acme's site" in the dashboard: remember the job, then tie it to the tab that click opens.
chrome.runtime.onMessage.addListener((msg: { type?: string; jobId?: unknown; url?: unknown }, sender) => {
  if (msg?.type !== 'wera:dashboard-open-job' || sender.tab?.id == null) return false;
  void loadSession().then((s) => {
    const from = sender.origin ?? (sender.url ? new URL(sender.url).origin : '');
    if (!s || from !== s.server) return; // only the user's own Wera
    if (typeof msg.jobId !== 'number' || typeof msg.url !== 'string' || !/^https?:\/\//.test(msg.url)) return;
    void expectHandoff(sender.tab!.id!, msg.jobId, msg.url);
  });
  return false;
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id != null) void takeHandoff(tab);
});
