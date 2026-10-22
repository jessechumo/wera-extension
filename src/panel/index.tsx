// The Wera panel, put into a job page's top frame by the background when
// the page script finds a posting or an application (or the user clicks
// the toolbar icon). React, styled with the dashboard's design inside a
// closed shadow root that is put back if the page rebuilds itself.
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PageHandle } from '../page';
import { loadFonts } from '../page/ui';
import { extensionAlive } from '../shared/alive';
import { remoteApi } from '../shared/rpc';
import { followTheme } from '../shared/theme';
import css from './styles.css?inline';
import { Panel } from './Panel';
import { usePanelPage } from './usePanelPage';
import { useSettings } from './useSettings';

declare global {
  interface Window {
    __weraPanel?: boolean;
  }
}

const COLLAPSED = 'wera.dockCollapsed';

/** Messages the background sends the panel. */
type PanelMessage =
  | { type: 'wera:panel-show'; tabId: number; open?: boolean; fill?: boolean }
  | { type: 'wera:panel-toggle' };

/**
 * Tailwind registers some of its variables with @property, which a shadow
 * root ignores: give them their starting values on every element instead,
 * or shadows and rings would not draw.
 */
export function propertyFallback(source: string): string {
  const decls = [...source.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)]
    .map(([, name, body]) => {
      const init = /initial-value:\s*([^;]+);?/.exec(body ?? '')?.[1]?.trim();
      return init != null ? `${name}:${init}` : `${name}:initial`;
    });
  return decls.length ? `\n.wera-root,.wera-root *,.wera-root ::before,.wera-root ::after{${decls.join(';')}}` : '';
}

function useSession() {
  const [server, setServer] = useState<string | null | undefined>(undefined);
  const load = useCallback(() => {
    void chrome.storage.local.get('wera.session').then((g) => setServer((g['wera.session'] as { server?: string } | undefined)?.server ?? null), () => setServer(null));
  }, []);
  useEffect(() => {
    load();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes['wera.session']) load();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [load]);
  return [server, load] as const;
}

/** What the background asked for so far: each count goes up with a new request. */
export interface Show {
  tabId: number;
  /** Open at first (an application, or asked to). */
  initial: boolean;
  opens: number;
  toggles: number;
  fills: number;
}

export function App({ handle, show }: { handle: PageHandle; show: Show }) {
  const [server, reload] = useSession();
  const api = useMemo(() => (server ? remoteApi(server) : null), [server]);
  const page = usePanelPage(handle, !!server);
  const [settings, setSettings] = useSettings();
  const [open, setOpen] = useState(show.initial);
  // A new request from the background: open (asked to fill, or to show), or show/hide (toolbar icon).
  const [seen, setSeen] = useState(show);
  if (seen !== show) {
    setSeen(show);
    if (show.opens > seen.opens || show.fills > seen.fills) setOpen(true);
    else if (show.toggles > seen.toggles) setOpen((o) => !o);
  }
  const onOpen = useCallback((v: boolean) => {
    setOpen(v);
    void chrome.storage.local.get(COLLAPSED).then((g) => {
      const map = { ...(g[COLLAPSED] as Record<string, number> | undefined) };
      if (v) delete map[location.host];
      else map[location.host] = 1;
      return chrome.storage.local.set({ [COLLAPSED]: map });
    }).catch(() => {});
  }, []);
  if (server === undefined) return null;
  // A single-page site moved to something that is not a job page: step aside, unless the user opened Wera here.
  const jobPage = !!page.handle.kind || !!page.info?.hasForm || !!page.submitted;
  if (!jobPage && !page.loading && show.opens === 0 && show.toggles === 0 && show.fills === 0) return null;
  return (
    <Panel api={api} page={page} settings={settings} setSettings={setSettings} tabId={show.tabId} open={open} onOpen={onOpen}
      fillRequest={show.fills} onSignedIn={reload} onSignedOut={reload} />
  );
}

function mount(handle: PageHandle, first: { tabId: number; open?: boolean; fill?: boolean }) {
  loadFonts(document);
  const host = document.createElement('wera-panel');
  const shadow = host.attachShadow({ mode: __WERA_E2E__ ? 'open' : 'closed' });
  const style = document.createElement('style');
  style.textContent = css + propertyFallback(css);
  const box = document.createElement('div');
  box.className = 'wera-root';
  shadow.append(style, box);
  document.documentElement.append(host);
  // Some sites (Greenhouse job boards) rebuild the whole document once loaded: put the panel back.
  const keep = new MutationObserver(() => {
    if (!extensionAlive()) {
      keep.disconnect();
      host.remove();
      return;
    }
    if (!host.isConnected && document.documentElement) document.documentElement.append(host);
  });
  keep.observe(document, { childList: true, subtree: true });
  followTheme((t) => {
    box.dataset.theme = t;
  });

  const root = createRoot(box);
  let show: Show = { tabId: first.tabId, initial: false, opens: 0, toggles: 0, fills: 0 };
  const render = () => root.render(<StrictMode><App handle={handle} show={show} /></StrictMode>);

  // Open at first on an application (unless collapsed on this site before), or when asked.
  void chrome.storage.local.get(COLLAPSED).then((g) => {
    const collapsed = !!(g[COLLAPSED] as Record<string, number> | undefined)?.[location.host];
    show = { ...show, initial: !!first.open || !!first.fill || (handle.kind === 'form' && !collapsed) || !!handle.submitted, fills: first.fill ? 1 : 0 };
    render();
  }, () => render());

  chrome.runtime.onMessage.addListener((msg: PanelMessage, _sender, reply) => {
    if (msg?.type === 'wera:panel-show') {
      show = { ...show, tabId: msg.tabId, opens: show.opens + (msg.open ? 1 : 0), fills: show.fills + (msg.fill ? 1 : 0) };
      render();
    } else if (msg?.type === 'wera:panel-toggle') {
      show = { ...show, toggles: show.toggles + 1 };
      render();
      reply(true);
    }
    return false;
  });
}

if (!window.__weraPanel && window.__weraPage) {
  window.__weraPanel = true;
  const handle = window.__weraPage;
  // The background follows the injection with the first "show" (it carries the tab's id).
  const onFirst = (msg: PanelMessage) => {
    if (msg?.type !== 'wera:panel-show') return false;
    chrome.runtime.onMessage.removeListener(onFirst);
    mount(handle, msg);
    return false;
  };
  chrome.runtime.onMessage.addListener(onFirst);
}
