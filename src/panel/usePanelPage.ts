import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeraJob } from '../shared/api';
import { sendSafe } from '../shared/alive';
import { describeError } from '../shared/errors';
import { log } from '../shared/log';
import type { SubmitReply } from '../shared/jobs';
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

const SCORE_TRIES = 12;
const SCORE_WAIT = 3000;

/**
 * The page the panel sits on and its job in Wera: read when the panel
 * comes up and again when the page moves on (a single-page job board,
 * the next step of an application).
 */
export function usePanelPage(handle: PageHandle, signedIn: boolean, formFrames = 0) {
  const [state, setState] = useState<PanelPage>({ handle, info: null, job: null, loading: true, error: '', newStep: 0, submitted: handle.submitted });
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++run.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const info = await frames('read');
      const job = signedIn ? await sendSafe<WeraJob | null>({ type: 'wera:job-resolve', url: location.href, title: handle.title || info.draft?.title || '', referrer: document.referrer }) : null;
      if (mine === run.current) setState((s) => ({ ...s, info, job, loading: false, newStep: 0 }));
    } catch (e) {
      log.warn('page', 'reading the page failed', e);
      if (mine === run.current) setState((s) => ({ ...s, loading: false, error: describeError(e, "Couldn't read this page") }));
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

  // A frame found the form after the page was read (an application embedded from another site).
  const framesSeen = useRef(formFrames);
  useEffect(() => {
    if (framesSeen.current === formFrames) return;
    framesSeen.current = formFrames;
    window.clearTimeout(later.current);
    later.current = window.setTimeout(() => void refresh(), 200);
  }, [formFrames, refresh]);

  useEffect(() => {
    const onMessage = (msg: PanelEvent) => {
      if (msg?.type === 'wera:job-changed') {
        setState((s) => ({ ...s, job: msg.job }));
      } else if (msg?.type === 'wera:frame-event') {
        const e = msg.event;
        if (e.type === 'wera:form-changed' && e.step) setState((s) => ({ ...s, newStep: e.fields }));
        else if (e.type === 'wera:navigated') {
          window.clearTimeout(later.current);
          later.current = window.setTimeout(() => void refresh(), 600);
        }
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [refresh]);

  // A job saved just now gets its score moments later: it shows when it is ready.
  const scoring = useRef(0);
  useEffect(() => () => void (scoring.current = 0), []);
  const setJob = useCallback((job: WeraJob | null) => {
    setState((s) => ({ ...s, job }));
    // The tab's next pages (the application after its posting) are for this job too.
    if (job) void sendSafe({ type: 'wera:job-remember', jobId: job.id });
    if (!job || job.fit_score != null) return;
    const mine = ++scoring.current;
    void (async () => {
      for (let i = 0; i < SCORE_TRIES && mine === scoring.current; i++) {
        await new Promise((r) => setTimeout(r, SCORE_WAIT));
        const now = await sendSafe<WeraJob | null>({ type: 'wera:job-resolve', url: location.href, title: job.title });
        if (mine !== scoring.current || now?.id !== job.id) return;
        setState((s) => (s.job?.id === job.id ? { ...s, job: { ...s.job, ...now } } : s));
        if (now.fit_score != null) return;
      }
    })();
  }, []);
  const clearNewStep = useCallback(() => setState((s) => ({ ...s, newStep: 0 })), []);
  const clearSubmitted = useCallback(() => setState((s) => ({ ...s, submitted: null })), []);
  return { ...state, refresh, setJob, clearNewStep, clearSubmitted };
}

export type PanelPageState = ReturnType<typeof usePanelPage>;
