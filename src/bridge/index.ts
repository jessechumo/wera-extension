// Runs on the user's Wera dashboard only (registered for the server they
// signed in to). It lets the dashboard and the extension talk: the
// dashboard says which job it is opening and when it changed something;
// the extension says when it did. Only job ids and URLs pass through.
import { BRIDGE_FROM_DASHBOARD, BRIDGE_FROM_EXTENSION, type BridgeMessage } from '../shared/bridge';
import { asPref, DASHBOARD_THEME_KEY, THEME_KEY } from '../shared/theme';

/** Keeps the extension on the theme picked in the dashboard (system, light or dark). */
export function syncTheme(doc: Document): () => void {
  let last = '';
  const save = () => {
    let pref = 'system';
    try {
      pref = asPref(localStorage.getItem(DASHBOARD_THEME_KEY));
    } catch {
      // Storage blocked: keep following the system.
    }
    if (pref === last) return;
    last = pref;
    void chrome.storage?.local?.set({ [THEME_KEY]: pref })?.catch(() => {});
  };
  save();
  // Changing it in Settings re-themes the page: data-theme changes.
  const obs = new MutationObserver(save);
  obs.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}

declare global {
  interface Window {
    __weraBridge?: boolean;
  }
}

if (!window.__weraBridge) {
  window.__weraBridge = true;
  // The dashboard checks this to know the extension is here.
  document.documentElement.dataset.weraExtension = chrome.runtime.getManifest().version;
  window.dispatchEvent(new Event('wera-extension:ready'));
  syncTheme(document);

  window.addEventListener('message', (e: MessageEvent<BridgeMessage & { source?: string }>) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== BRIDGE_FROM_DASHBOARD) return;
    const { type } = e.data;
    if (type === 'open-job' || type === 'changed') {
      void chrome.runtime.sendMessage({ ...e.data, type: `wera:dashboard-${type}` }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((msg: { type?: string; what?: string }) => {
    if (msg?.type === 'wera:extension-changed') {
      window.postMessage({ source: BRIDGE_FROM_EXTENSION, type: 'changed', what: msg.what ?? '' }, location.origin);
    }
    return false;
  });
}
