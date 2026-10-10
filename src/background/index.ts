// Opens the side panel from the toolbar icon, and adds "Save job to Wera"
// to the page's right-click menu.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: 'wera-open', title: 'Open Wera on this page', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wera-open' && tab?.windowId != null) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
