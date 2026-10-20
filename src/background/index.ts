// Opens the side panel from the toolbar icon, adds "Open Wera on this
// page" to the right-click menu, handles the keyboard shortcuts
// (Alt+Shift+W opens Wera; Alt+Shift+F opens it and fills the form),
// keeps the Wera button on the job sites the user allowed, and keeps the
// dashboard bridge: which job the dashboard opened in a tab.
import { expectHandoff, syncBridge, takeHandoff } from '../shared/bridge';
import { syncLauncher } from '../shared/launcher';
import { loadSession } from '../shared/storage';

export const PENDING_FILL = 'wera.pendingFill';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: 'wera-open', title: 'Open Wera on this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'wera-fill', title: 'Fill this application with Wera', contexts: ['page', 'editable'] });
  void syncAll();
});

chrome.runtime.onStartup.addListener(() => void syncAll());

/** The dashboard bridge on the user's server, the Wera button on the sites they allowed. */
async function syncAll() {
  const s = await loadSession();
  await syncBridge(s?.server ?? null);
  await syncLauncher(s?.server ?? null);
}

// Signing in or out (in the side panel) moves the bridge to the new server.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['wera.session']) void syncAll();
});

// Allowing or removing a site adds or drops the Wera button there.
chrome.permissions.onAdded.addListener(() => void syncAll());
chrome.permissions.onRemoved.addListener(() => void syncAll());

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

// The Wera button on a job page: open the panel (inside the click) and fill a form.
chrome.runtime.onMessage.addListener((msg: { type?: string; fill?: unknown }, sender) => {
  if (msg?.type !== 'wera:launcher-open' || sender.tab?.id == null || sender.id !== chrome.runtime.id) return false;
  openPanel(sender.tab, msg.fill === true);
  return false;
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
