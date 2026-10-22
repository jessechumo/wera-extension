import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeraJob } from '../shared/api';
import { sendSafe } from '../shared/alive';
import type { SubmitReply } from '../shared/dock';
import { frames } from '../shared/rpc';
import type { ContentEvent, PageInfo } from '../shared/types';
import type { PageHandle } from '../page';

export interface PanelPage {
  /** What the page script in this frame made of the page. */
  handle: PageHandle;
  /** The page read in every frame (an embedded form counts). */
  info: PageInfo | null;
  job: WeraJob | null;
  loading: boolean;
  error: string;
  /** Fields of a new form step that appeared since the last fill (0: none). */
  newStep: number;
  /** The site confirmed an application, and what Wera did about it. */
  submitted: SubmitReply | null;
}

/** A frame's page script noticed something (forwarded by the background), or Wera changed the tab's job. */
export type PanelEvent =
  | { type: 'wera:frame-event'; frameId: number; event: ContentEvent }
  | { type: 'wera:job-changed'; job: WeraJob; applied: boolean };

/**
 * The page the panel sits on and its job in Wera: read when the panel
 * comes up and again when the page moves on (a single-page job board,
 * the next step of an application).
 */
export function usePanelPage(handle: PageHandle, signedIn: boolean) {
  const [state, setState] = useState<PanelPage>({ handle, info: null, job: null, loading: true, error: '', newStep: 0, submitted: handle.submitted });
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++run.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const info = await frames<PageInfo>('read');
      const job = signedIn ? await sendSafe<WeraJob | null>({ type: 'wera:dock-resolve', url: location.href, title: handle.title || info.draft?.title || '', referrer: document.referrer }) : null;
      if (mine === run.current) setState((s) => ({ ...s, info, job, loading: false, newStep: 0 }));
    } catch (e) {
      if (mine === run.current) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [handle, signedIn]);

  // The page script says the page changed kind (moved to the form, a new posting).
  const later = useRef(0);
  useEffect(() => {
    // Reading the page is syncing with an external system (the page and Wera).
    void refresh();
    const off = handle.subscribe((h) => {
      setState((s) => ({ ...s, handle: { ...h }, submitted: h.submitted ?? s.submitted }));
      window.clearTimeout(later.current);
      later.current = window.setTimeout(() => void refresh(), 400);
    });
    return () => {
      off();
      window.clearTimeout(later.current);
    };
  }, [handle, refresh]);

  useEffect(() => {
    const onMessage = (msg: PanelEvent) => {
      if (msg?.type === 'wera:job-changed') {
        setState((s) => ({ ...s, job: msg.job }));
      } else if (msg?.type === 'wera:frame-event') {
        const e = msg.event;
        if (e.type === 'wera:form-changed') setState((s) => ({ ...s, newStep: e.fields }));
        else if (e.type === 'wera:navigated') {
          window.clearTimeout(later.current);
          later.current = window.setTimeout(() => void refresh(), 600);
        }
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [refresh]);

  const setJob = useCallback((job: WeraJob | null) => {
    setState((s) => ({ ...s, job }));
    // The tab's next pages (the application after its posting) are for this job too.
    if (job) void sendSafe({ type: 'wera:dock-remember', jobId: job.id });
  }, []);
  const clearNewStep = useCallback(() => setState((s) => ({ ...s, newStep: 0 })), []);
  const clearSubmitted = useCallback(() => setState((s) => ({ ...s, submitted: null })), []);
  return { ...state, refresh, setJob, clearNewStep, clearSubmitted };
}

export type PanelPageState = ReturnType<typeof usePanelPage>;
