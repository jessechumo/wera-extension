// The job the panel is on: its card (fit, title, company, tracker
// status), Save for a posting, and what Wera did when the site confirmed
// an application.
import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Bookmark, ExternalLink, PartyPopper, X } from 'lucide-react';
import type { ApplicationStatus, WeraApi, WeraJob } from '../shared/api';
import { describeError } from '../shared/errors';
import { log } from '../shared/log';
import { Traps } from './Traps';
import { BigButton, Button, Notice, ScoreRing, Skeleton } from './ui';
import type { PanelPageState } from './usePanelPage';

const STATUS: Record<string, [string, string]> = {
  saved: ['Saved', 'border-accent/30 bg-accent/10 text-accent'], applied: ['Applied', 'border-accent-2/25 bg-accent-2/10 text-accent-2'],
  interviewing: ['Interviewing', 'border-warn/25 bg-warn/10 text-warn'], offer: ['Offer', 'border-good/25 bg-good/10 text-good'],
  rejected: ['Rejected', 'border-bad/25 bg-bad/10 text-bad'], not_interested: ['Not interested', 'border-border bg-surface-2 text-muted'],
};

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap', className)}>{children}</span>;
}

/** The job: fit ring, title, company, where it is on the tracker. */
export function JobCard({ api, page }: { api: WeraApi; page: PanelPageState }) {
  const job = page.job;
  const title = job?.title || page.info?.draft?.title || page.handle.title || 'This job';
  const company = job?.company || page.info?.draft?.company || page.handle.company;
  const [label, cls] = job?.application_status ? STATUS[job.application_status] ?? [job.application_status, STATUS.not_interested![1]] : ['', ''];
  return (
    <div className="anim-rise flex items-start gap-3 rounded-card border border-border bg-surface p-3">
      {page.loading && !job ? <Skeleton className="size-12 rounded-full" /> : <ScoreRing score={job ? (job.fit_score ?? job.estimated_score) : null} estimate={!!job && job.fit_score == null && job.estimated_score != null} />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug font-semibold">{title}</p>
        {company && <p className="truncate text-xs text-muted">{company}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {label && <Badge className={cls}>{label}</Badge>}
          {job && !label && <Badge className="border-good/25 bg-good/10 text-good">In your Wera lists</Badge>}
          {job && (
            <a href={api.dashboardUrl(`/jobs/${job.id}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:underline">
              Open in Wera <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** A posting: save it (with its fit), or say how to apply. */
export function Posting({ api, page }: { api: WeraApi; page: PanelPageState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (page.loading) return <Skeleton className="h-11" />;
  if (page.job) {
    return (
      <>
        <p className="text-xs text-muted">Press the site's <b className="text-text">Apply</b> button: Wera autofills the application there.</p>
        <Traps traps={page.info?.traps ?? []} />
      </>
    );
  }
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // The page's job data when it has some, else the AI reads the posting.
      let draft = page.info?.draft ?? page.handle.draft;
      if (!draft) {
        const got = await api.extract(location.href, document.title, page.info?.text ?? '');
        if (!got.is_job_posting) throw new Error("Wera doesn't see a job posting on this page");
        draft = got;
      }
      page.setJob(await api.addJob(draft));
    } catch (e) {
      log.warn('posting', 'saving the job failed', e);
      setError(describeError(e, "Couldn't save this job"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <BigButton className="w-full" onClick={() => void save()} busy={busy}>
        {!busy && <Bookmark className="size-4" />} Save to Wera
      </BigButton>
      <p className="text-[11px] text-faint">Saves it to your Jobs and Tracker with a fit score.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <Traps traps={page.info?.traps ?? []} />
    </div>
  );
}

/** The site confirmed the application: what Wera did, with an undo. */
export function Submitted({ api, page }: { api: WeraApi; page: PanelPageState }) {
  const s = page.submitted!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const undo = async (job: WeraJob, to: ApplicationStatus) => {
    setBusy(true);
    try {
      page.setJob(await api.setStatus(job.id, to));
      page.clearSubmitted();
    } catch (e) {
      setError(describeError(e, "Couldn't undo"));
    } finally {
      setBusy(false);
    }
  };
  const addApplied = async () => {
    const draft = page.info?.draft ?? page.handle.draft;
    if (!draft) return;
    setBusy(true);
    try {
      const added = await api.addJob(draft);
      page.setJob(await api.setStatus(added.id, 'applied'));
      page.clearSubmitted();
    } catch (e) {
      setError(describeError(e, "Couldn't add this job as applied"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="anim-rise rounded-card border border-good/30 bg-good/[0.07] p-3 text-xs">
      <div className="flex items-start gap-2">
        <PartyPopper className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          {s.state === 'marked' ? (
            <>
              <p className="text-sm font-semibold">Application sent. Marked as applied.</p>
              <p className="mt-0.5 text-muted">{s.job.title} at {s.job.company} is in Applied in your Wera tracker. Good luck!</p>
              <div className="mt-2 flex gap-3">
                <a href={api.dashboardUrl('/tracker')} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Open the tracker</a>
                <button type="button" className="text-faint hover:text-text" disabled={busy} onClick={() => page.job && void undo(page.job, (s.previous ?? 'saved') as ApplicationStatus)}>Undo</button>
              </div>
            </>
          ) : s.state === 'already' ? (
            <p className="font-semibold">Application sent. It is already in your tracker.</p>
          ) : s.state === 'unknown' ? (
            <>
              <p className="text-sm font-semibold">Applied? Track it in Wera</p>
              <p className="mt-0.5 text-muted">{s.draft ? `${s.draft.title}${s.draft.company ? ` at ${s.draft.company}` : ''} is not in your Wera lists yet.` : 'This job is not in your Wera lists yet.'}</p>
              {(page.info?.draft ?? page.handle.draft) && <Button className="mt-2" busy={busy} onClick={() => void addApplied()}>Add as applied</Button>}
            </>
          ) : null}
          {error && <div className="mt-2"><Notice tone="bad">{error}</Notice></div>}
        </div>
        <button type="button" className="text-faint hover:text-text" onClick={page.clearSubmitted} aria-label="Close"><X className="size-3.5" /></button>
      </div>
    </div>
  );
}
