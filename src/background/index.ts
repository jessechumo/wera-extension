// Opens the side panel from the toolbar icon, adds "Open Wera on this
// page" to the right-click menu, handles the keyboard shortcuts
// (Alt+Shift+W opens Wera; Alt+Shift+F opens it and fills the form),
// answers the Wera dock on job pages, and keeps the dashboard bridge:
// which job the dashboard opened in a tab.
import { expectHandoff, syncBridge, takeHandoff } from '../shared/bridge';
import { isDockRequest, PENDING_VIEW, type PanelView, type PendingView } from '../shared/dock';
import { loadSession } from '../shared/storage';
import { handleDock } from './dock';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: 'wera-open', title: 'Open Wera on this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'wera-fill', title: 'Fill this application with Wera', contexts: ['page', 'editable'] });
  void syncAll();
});

chrome.runtime.onStartup.addListener(() => void syncAll());

let syncing: Promise<void> = Promise.resolve();

/**
 * The dashboard bridge on the user's server. Runs one at a time: signing
 * in fires several events at once (permission granted, session saved),
 * and overlapping runs could unregister what another just registered.
 */
function syncAll(): Promise<void> {
  syncing = syncing.then(async () => {
    const s = await loadSession();
    await syncBridge(s?.server ?? null);
  }).catch(() => {});
  return syncing;
}

// Signing in or out (in the side panel) moves the bridge to the new server.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['wera.session']) void syncAll();
});

// Older installs registered the Wera button per site (the dock now runs everywhere from the
// manifest), and could hide the dock on a site for a week (closing it only minimizes now).
chrome.runtime.onInstalled.addListener(() => {
  void chrome.scripting.unregisterContentScripts({ ids: ['wera-launcher'] }).catch(() => {});
  void chrome.storage.local.remove('wera.launcherDismissed').catch(() => {});
});

/**
 * Opens the panel (this must happen inside the user's gesture) and leaves
 * it the view to show and whether to fill.
 */
function openPanel(tab: chrome.tabs.Tab | undefined, fill: boolean, view?: PanelView) {
  if (tab?.id == null) return;
  void chrome.sidePanel.open({ tabId: tab.id });
  if (fill || view) {
    const p: PendingView = { tabId: tab.id, at: Date.now(), view: view ?? 'apply', fill };
    void chrome.storage.session.set({ [PENDING_VIEW]: p });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wera-open' || info.menuItemId === 'wera-fill') openPanel(tab, info.menuItemId === 'wera-fill');
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'fill-form') openPanel(tab, true);
});

// The Wera dock on a job page: open the panel at once (inside the click), or ask Wera something.
chrome.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
  if (!isDockRequest(msg) || sender.tab?.id == null || sender.id !== chrome.runtime.id) return false;
  if (msg.type === 'wera:dock-open') {
    openPanel(sender.tab, msg.fill === true, msg.view);
    return false;
  }
  handleDock(msg, sender.tab.id, sender.tab.url ?? '').then(reply, () => reply(null));
  return true; // async reply
});

// "Apply on Acme's site" in the dashboard: remember the job, then tie it
// to the tab that click opens.
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
