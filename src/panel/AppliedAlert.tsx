// The alert after the user sends an application and the site confirms
// it: what Wera did (marked Applied, added it, or could not find it), a
// short countdown, then the tab closes. "Stay on this page" keeps it open.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { describeError } from '../shared/errors';
import type { SubmitReply } from '../shared/jobs';
import { rpc } from '../shared/rpc';
import { Button } from './ui';

/** Seconds the alert shows before the tab closes. */
export const CLOSE_AFTER = 5;

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

export function AppliedAlert({ reply, onStay }: { reply: Exclude<SubmitReply, { state: 'off' }>; onStay: () => void }) {
  const [left, setLeft] = useState(CLOSE_AFTER);
  const [error, setError] = useState('');
  const closing = useRef(false);
  const { title, detail } = appliedMessage(reply);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    rpc({ type: 'wera:tab-close' }).catch((e: unknown) => {
      closing.current = false;
      setError(describeError(e, "Couldn't close this tab"));
    });
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
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
        <div className="h-1 bg-surface-2">
          <div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${(left / CLOSE_AFTER) * 100}%` }} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
          <Button autoFocus onClick={onStay}>Stay on this page</Button>
          <Button variant="primary" onClick={close}>Close now</Button>
        </div>
      </div>
    </div>
  );
}
