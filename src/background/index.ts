// Opens the side panel from the toolbar icon, adds "Open Wera on this
// page" to the right-click menu, handles the keyboard shortcuts
// (Alt+Shift+W opens Wera; Alt+Shift+F opens it and fills the form), and
// keeps the dashboard bridge: which job the dashboard opened in a tab.
import { expectHandoff, syncBridge, takeHandoff } from '../shared/bridge';
import { loadSession } from '../shared/storage';

export const PENDING_FILL = 'wera.pendingFill';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: 'wera-open', title: 'Open Wera on this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'wera-fill', title: 'Fill this application with Wera', contexts: ['page', 'editable'] });
  void loadSession().then((s) => syncBridge(s?.server ?? null));
});

chrome.runtime.onStartup.addListener(() => {
  void loadSession().then((s) => syncBridge(s?.server ?? null));
});

// Signing in or out (in the side panel) moves the bridge to the new server.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['wera.session']) {
    const s = changes['wera.session'].newValue as { server?: string } | undefined;
    void syncBridge(s?.server ?? null);
  }
});

/** Opens the panel (this must happen inside the user's gesture) and, for a fill, leaves the request for it. */
function openPanel(tab: chrome.tabs.Tab | undefined, fill: boolean) {
  if (tab?.id == null) return;
  void chrome.sidePanel.open({ tabId: tab.id });
  if (fill) void chrome.storage.session.set({ [PENDING_FILL]: { tabId: tab.id, at: Date.now() } });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wera-open' || info.menuItemId === 'wera-fill') openPanel(tab, info.menuItemId === 'wera-fill');
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'fill-form') openPanel(tab, true);
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
