import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type WeraApi, type WeraJob } from '../shared/api';
import type { PageInfo } from '../shared/types';
import { activeTab, NeedsPermission, readPage } from './page';

export interface PageState {
  tab: chrome.tabs.Tab | null;
  page: PageInfo | null;
  job: WeraJob | null;
  loading: boolean;
  needsPermission: string | null;
  error: string;
}

/**
 * Follows the active tab: reads the page (job data, text, whether there is
 * an application form) and looks the job up in Wera. Re-runs when the user
 * switches tabs or a page finishes loading.
 */
export function usePage(api: WeraApi, onUnauthorized: () => void) {
  const [state, setState] = useState<PageState>({ tab: null, page: null, job: null, loading: true, needsPermission: null, error: '' });
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++run.current;
    setState((s) => ({ ...s, loading: true, error: '', needsPermission: null }));
    const tab = await activeTab();
    let page: PageInfo | null = null;
    let job: WeraJob | null = null;
    try {
      if (!tab) throw new Error('No active tab.');
      page = await readPage(tab);
      job = (await api.lookup(page.url)).job;
      if (mine === run.current) setState({ tab, page, job, loading: false, needsPermission: null, error: '' });
    } catch (e) {
      if (mine !== run.current) return;
      if (e instanceof ApiError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setState({
        tab, page, job, loading: false,
        needsPermission: e instanceof NeedsPermission ? e.origin : null,
        error: e instanceof NeedsPermission ? '' : e instanceof Error ? e.message : String(e),
      });
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
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

  const setJob = (job: WeraJob | null) => setState((s) => ({ ...s, job }));
  return { ...state, refresh, setJob };
}
