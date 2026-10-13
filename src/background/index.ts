// Opens the side panel from the toolbar icon, adds "Open Wera on this
// page" to the right-click menu, and handles the keyboard shortcuts
// (Alt+Shift+W opens Wera; Alt+Shift+F opens it and fills the form).

export const PENDING_FILL = 'wera.pendingFill';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: 'wera-open', title: 'Open Wera on this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'wera-fill', title: 'Fill this application with Wera', contexts: ['page', 'editable'] });
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
