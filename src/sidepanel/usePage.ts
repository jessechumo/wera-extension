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

  // A page that changes its address without loading (a single-page job
  // board) renders the new content a moment later: read it once it settles.
  const later = useRef(0);
  const refreshSoon = useCallback(() => {
    window.clearTimeout(later.current);
    later.current = window.setTimeout(() => void refresh(), 600);
  }, [refresh]);

  useEffect(() => {
    // Syncing with the browser's tabs (an external system): refresh sets
    // state only after awaiting the tabs API, never synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onActivated = () => void refresh();
    const onUpdated = (_id: number, info: { status?: string; url?: string }, tab: chrome.tabs.Tab) => {
      if (!tab.active) return;
      if (info.status === 'complete') {
        window.clearTimeout(later.current);
        void refresh();
      } else if (info.url) {
        refreshSoon();
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      window.clearTimeout(later.current);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh, refreshSoon]);

  // Signals from the page script of the tab we follow (others are ignored).
  const tabId = state.tab?.id;
  useEffect(() => {
    if (!chrome.runtime?.onMessage) return;
    const onMessage = (msg: ContentEvent, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id == null || sender.tab.id !== tabId) return;
      if (msg.type === 'wera:form-changed') setState((s) => ({ ...s, newStep: msg.fields }));
      else if (msg.type === 'wera:submitted') setState((s) => ({ ...s, submitted: true }));
      else if (msg.type === 'wera:navigated') refreshSoon();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [tabId, refreshSoon]);

  // Back in the panel after working in the dashboard: show the job as Wera has it now.
  const jobId = state.job?.id;
  const reloadJob = useCallback(async () => {
    if (jobId == null) return;
    const fresh = await api.job(jobId).catch(() => null);
    if (fresh) setState((s) => (s.job?.id === fresh.id ? { ...s, job: fresh } : s));
  }, [api, jobId]);
  useEffect(() => {
    const onFocus = () => void reloadJob();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadJob]);

  const clearNewStep = useCallback(() => setState((s) => ({ ...s, newStep: 0 })), []);

  const setJob = (job: WeraJob | null) => {
    setState((s) => {
      if (job && s.tab?.id != null && s.page) void rememberTabJob(s.tab.id, new URL(s.page.url).origin, job.id);
      setBadge(s.tab?.id, job);
      return { ...s, job };
    });
  };
  /** One loaded page: a reload or another page in the tab gives a new key. */
  const pageKey = state.page ? `${state.page.docId ?? ''}|${state.page.url}` : '';
  return { ...state, pageKey, refresh, reloadJob, setJob, clearNewStep };
}
