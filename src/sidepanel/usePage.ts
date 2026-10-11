import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type WeraApi, type WeraJob } from '../shared/api';
import type { ContentEvent, PageInfo } from '../shared/types';
import { rememberTabJob, tabJob } from '../shared/storage';
import { activeTab, NeedsPermission, readPage } from './page';

export interface PageState {
  tab: chrome.tabs.Tab | null;
  page: PageInfo | null;
  job: WeraJob | null;
  loading: boolean;
  needsPermission: string | null;
  error: string;
  /** Fields of a new form step that appeared since the last fill (0: none). */
  newStep: number;
  /** The page says the application went through. */
  submitted: boolean;
}

/** The fit score on the toolbar icon for this tab (cleared when there is no job). */
export function setBadge(tabId: number | undefined, job: WeraJob | null) {
  if (tabId == null || !chrome.action?.setBadgeText) return;
  const score = job ? (job.fit_score ?? job.estimated_score) : null;
  void chrome.action.setBadgeText({ tabId, text: score != null ? String(score) : job ? '✓' : '' });
  if (score != null) {
    const color = score >= 80 ? '#1e7a3c' : score >= 65 ? '#3157c4' : '#6b7180';
    void chrome.action.setBadgeBackgroundColor({ tabId, color });
  }
}

/**
 * Follows the active tab: reads the page (job data, text, whether there is
 * an application form) and looks the job up in Wera. Re-runs when the user
 * switches tabs or a page finishes loading.
 */
export function usePage(api: WeraApi, onUnauthorized: () => void) {
  const [state, setState] = useState<PageState>({ tab: null, page: null, job: null, loading: true, needsPermission: null, error: '', newStep: 0, submitted: false });
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++run.current;
    const tab = await activeTab();
    if (mine !== run.current) return;
    setState((s) => ({ ...s, tab, loading: true, error: '', needsPermission: null }));
    let page: PageInfo | null = null;
    let job: WeraJob | null = null;
    try {
      if (!tab) throw new Error('No active tab.');
      page = await readPage(tab);
      job = (await api.lookup(page.url)).job;
      const origin = new URL(page.url).origin;
      if (job && tab.id != null) {
        await rememberTabJob(tab.id, origin, job.id);
      } else if (!job && tab.id != null) {
        // Same site, same tab as a job the user just looked at: probably its form.
        const remembered = await tabJob(tab.id, origin);
        if (remembered) job = await api.job(remembered).catch(() => null);
      }
      setBadge(tab.id, job);
      if (mine === run.current) setState({ tab, page, job, loading: false, needsPermission: null, error: '', newStep: 0, submitted: !!page.submitted });
    } catch (e) {
      if (mine !== run.current) return;
      if (e instanceof ApiError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setState({
        tab, page, job, loading: false, newStep: 0, submitted: false,
        needsPermission: e instanceof NeedsPermission ? e.origin : null,
        error: e instanceof NeedsPermission ? '' : e instanceof Error ? e.message : String(e),
      });
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    // Syncing with the browser's tabs (an external system): refresh sets
    // state only after awaiting the tabs API, never synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onActivated = () => void refresh();
    const onUpdated = (_id: number, info: { status?: string }, tab: chrome.tabs.Tab) => {
      if (info.status === 'complete' && tab.active) void refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh]);

  // Signals from the page script of the tab we follow (others are ignored).
  const tabId = state.tab?.id;
  useEffect(() => {
    if (!chrome.runtime?.onMessage) return;
    const onMessage = (msg: ContentEvent, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id == null || sender.tab.id !== tabId) return;
      if (msg.type === 'wera:form-changed') setState((s) => ({ ...s, newStep: msg.fields }));
      else if (msg.type === 'wera:submitted') setState((s) => ({ ...s, submitted: true }));
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [tabId]);

  const clearNewStep = useCallback(() => setState((s) => ({ ...s, newStep: 0 })), []);

  const setJob = (job: WeraJob | null) => {
    setState((s) => {
      if (job && s.tab?.id != null && s.page) void rememberTabJob(s.tab.id, new URL(s.page.url).origin, job.id);
      setBadge(s.tab?.id, job);
      return { ...s, job };
    });
  };
  return { ...state, refresh, setJob, clearNewStep };
}
