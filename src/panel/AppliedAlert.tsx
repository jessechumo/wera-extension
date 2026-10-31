// The alert after the user sends an application and the site confirms
// it: what Wera did (marked Applied, added it, or could not find it), a
// short countdown, then the tab closes. "Stay on this page" keeps it open.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleCheck } from 'lucide-react';
import type { WeraApi, WeraJob } from '../shared/api';
import { describeError } from '../shared/errors';
import type { SubmitReply } from '../shared/jobs';
import { log } from '../shared/log';
import { rpc } from '../shared/rpc';
import { Button } from './ui';

/** Seconds the alert shows before the tab closes. */
export const CLOSE_AFTER = 5;
/** Seconds when it offers a next match: there is more to read and decide. */
export const CLOSE_WITH_NEXT = 12;

/** What the alert says Wera did with the application. */
export function appliedMessage(s: Exclude<SubmitReply, { state: 'off' }>): { title: string; detail: string } {
  const role = (j: { title: string; company: string }) => (j.company ? `${j.title} at ${j.company}` : j.title);
  switch (s.state) {
    case 'marked':
      return { title: 'Application submitted', detail: s.added ? `${role(s.job)} was added to your Wera tracker as Applied.` : `${role(s.job)} is now Applied in your Wera tracker.` };
    case 'already':
      return { title: 'Application submitted', detail: `${role(s.job)} is already in your Wera tracker.` };
    case 'unknown':
      return { title: 'Application submitted', detail: s.draft ? `${role(s.draft)} is not in Wera, so it was not tracked.` : 'This job is not in Wera, so it was not tracked.' };
  }
}

/** The job the user just applied to, when Wera knows it. */
const jobOf = (r: Exclude<SubmitReply, { state: 'off' }>) => (r.state === 'unknown' ? null : r.job.id);

/** The user's next best match, while they have momentum. Nothing shows when there is none or Wera can't say. */
export function useNextMatch(api: WeraApi | null, after: number | null): WeraJob | null {
  const [next, setNext] = useState<WeraJob | null>(null);
  useEffect(() => {
    if (!api) return;
    let gone = false;
    api.nextMatch(after).then((j) => {
      if (!gone) setNext(j);
    }, (e: unknown) => log.warn('panel', 'finding the next match failed', e));
    return () => {
      gone = true;
    };
  }, [api, after]);
  return next;
}

/** Offers the next match, with the fit that makes it worth opening. */
export function NextMatch({ job, onOpen }: { job: WeraJob; onOpen: () => void }) {
  const score = job.fit_score ?? job.estimated_score;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-faint">Your next best match{score != null && ` · ${score}% fit`}</p>
        <p className="truncate text-xs font-medium text-text" title={`${job.title} at ${job.company}`}>{job.title} at {job.company}</p>
      </div>
      <Button className="shrink-0 px-2 py-1" onClick={onOpen}>Open it <ArrowRight className="size-3.5" /></Button>
    </div>
  );
}

export function AppliedAlert({ api, reply, onStay }: { api: WeraApi | null; reply: Exclude<SubmitReply, { state: 'off' }>; onStay: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const closing = useRef(false);
  const { title, detail } = appliedMessage(reply);
  const next = useNextMatch(api, jobOf(reply));
  const total = next ? CLOSE_WITH_NEXT : CLOSE_AFTER;
  const left = Math.max(0, total - elapsed);

  const openNext = useCallback(() => {
    if (!next) return;
    closing.current = true; // the tab has somewhere to go now
    rpc({ type: 'wera:open-next', jobId: next.id, url: next.url }).catch((e: unknown) => {
      closing.current = false;
      setError(describeError(e, "Couldn't open that job"));
    });
  }, [next]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    rpc({ type: 'wera:tab-close' }).catch((e: unknown) => {
      closing.current = false;
      setError(describeError(e, "Couldn't close this tab"));
    });
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0 && !error) close();
  }, [left, error, close]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onStay]);

  return (
    <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="wera-applied-title" aria-describedby="wera-applied-detail"
        className="anim-rise panel-shadow w-[380px] max-w-full overflow-hidden rounded-card border border-border bg-bg">
        <div className="flex gap-3 p-4">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-good" />
          <div className="min-w-0 flex-1">
            <h2 id="wera-applied-title" className="text-[15px] font-semibold">{title}</h2>
            <p id="wera-applied-detail" className="mt-1 text-xs text-muted">{detail}</p>
            <p className="mt-2 text-xs text-faint" aria-live="polite">
              {error || (left > 0 ? `Closing this tab in ${left} s…` : 'Closing…')}
            </p>
          </div>
        </div>
        {next && <div className="px-4 pb-3"><NextMatch job={next} onOpen={openNext} /></div>}
        <div className="h-1 bg-surface-2">
          <div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${(left / total) * 100}%` }} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <Button autoFocus onClick={onStay}>Stay on this page</Button>
          <Button variant="primary" onClick={close}>Close now</Button>
        </div>
      </div>
    </div>
  );
}
