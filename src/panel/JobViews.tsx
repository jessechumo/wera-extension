// The job the panel is on: its card (fit, title, company, tracker
// status), Save for a posting, and what Wera did when the site confirmed
// an application.
import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Bookmark, ChevronDown, ExternalLink, PartyPopper, Send, X } from 'lucide-react';
import type { ApplicationStatus, JobH1B, JobKeywords, WeraApi, WeraJob } from '../shared/api';
import { describeError } from '../shared/errors';
import { markApplying } from '../shared/flow';
import { log } from '../shared/log';
import { frames } from '../shared/rpc';
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

/** A job's words as chips: what the user has, then what they lack. */
function Chips({ have, lack }: { have: string[]; lack: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {have.slice(0, 8).map((k) => <Badge key={k} className="border-good/25 bg-good/10 text-good">{k}</Badge>)}
      {lack.slice(0, 8).map((k) => <Badge key={k} className="border-border bg-surface-2 text-muted">{k}</Badge>)}
    </div>
  );
}

const SPONSORS: Record<string, string> = { yes: 'This job offers visa sponsorship.', no: 'This job does not offer visa sponsorship.' };

/** Why the job scored what it did, and how the resume meets it. */
export function Fit({ api, page }: { api: WeraApi; page: PanelPageState }) {
  const job = page.job;
  const id = job?.id;
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState<JobKeywords | null>(null);
  const [h1b, setH1b] = useState<JobH1B | null>(null);
  useEffect(() => {
    if (id == null) return;
    let live = true;
    api.jobKeywords(id).then((k) => live && setKeywords(k), (e: unknown) => log.warn('fit', 'loading the job\'s keywords failed', e));
    return () => {
      live = false;
    };
  }, [api, id]);
  useEffect(() => {
    if (id == null || !open || h1b) return;
    api.h1b(id).then(setH1b, (e: unknown) => log.warn('fit', 'loading H-1B filings failed', e));
  }, [api, id, open, h1b]);
  if (!job) return null;
  const coverage = keywords?.coverage;
  const have = coverage?.matched ?? job.skills_matched ?? [];
  const lack = coverage?.missing ?? job.skills_missing ?? [];
  const sponsor = job.sponsorship ? SPONSORS[job.sponsorship] : '';
  if (!job.reason && !have.length && !lack.length && !sponsor) return null;
  return (
    <div className="rounded-card border border-border bg-surface text-xs">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1 font-medium">{coverage ? `Your resume has ${coverage.percent}% of this job's keywords` : 'Why this fit'}</span>
        <ChevronDown className={clsx('size-3 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {job.reason && <p className="text-muted">{job.reason}</p>}
          {(have.length > 0 || lack.length > 0) && <Chips have={have} lack={lack} />}
          {sponsor && <p className="text-muted">{sponsor}</p>}
          {h1b?.matched && h1b.filings > 0 && <p className="text-muted">{job.company} filed {h1b.filings} H-1B petition{h1b.filings === 1 ? '' : 's'}.</p>}
        </div>
      )}
    </div>
  );
}

/** A posting: apply from here, save it (with its fit), or say how to apply. */
export function Posting({ api, page, tabId }: { api: WeraApi; page: PanelPageState; tabId: number | null }) {
  const [busy, setBusy] = useState<'' | 'save' | 'apply'>('');
  const [going, setGoing] = useState(false);
  const [error, setError] = useState('');
  if (page.loading) return <Skeleton className="h-11" />;
  const save = async () => {
    // The page's job data when it has some, else the AI reads the posting.
    let draft = page.info?.draft ?? page.handle.draft;
    if (!draft) {
      const got = await api.extract(location.href, document.title, page.info?.text ?? '');
      if (!got.is_job_posting) throw new Error("Wera doesn't see a job posting on this page");
      draft = got;
    }
    page.setJob(await api.addJob(draft));
  };
  const onSave = async () => {
    setBusy('save');
    setError('');
    try {
      await save();
    } catch (e) {
      log.warn('posting', 'saving the job failed', e);
      setError(describeError(e, "Couldn't save this job"));
    } finally {
      setBusy('');
    }
  };
  // Saves the job, presses the page's Apply button, and the application fills itself, here or in the tab it opens.
  const onApply = async () => {
    setBusy('apply');
    setError('');
    try {
      if (!page.job) await save().catch((e: unknown) => log.warn('posting', 'saving the job before applying failed', e));
      if (tabId != null) await markApplying(tabId);
      const { ok } = await frames('press-apply');
      if (ok) setGoing(true);
      else setError("Wera couldn't press this page's Apply button. Press it yourself: Wera fills the application there.");
    } catch (e) {
      setError(describeError(e, "Couldn't open the application"));
    } finally {
      setBusy('');
    }
  };
  const apply = page.info?.apply;
  return (
    <div className="space-y-2">
      {going ? <Notice tone="good">Opening the application: Wera fills it as soon as it shows.</Notice>
        : apply && (
          <BigButton className="w-full" onClick={() => void onApply()} busy={busy === 'apply'}>
            {busy !== 'apply' && <Send className="size-4" />} Apply with Wera
          </BigButton>
        )}
      {!page.job && (apply ? (
        <Button className="w-full py-2" onClick={() => void onSave()} busy={busy === 'save'}>{busy !== 'save' && <Bookmark className="size-3.5" />} Save to Wera</Button>
      ) : (
        <BigButton className="w-full" onClick={() => void onSave()} busy={busy === 'save'}>
          {busy !== 'save' && <Bookmark className="size-4" />} Save to Wera
        </BigButton>
      ))}
      <p className="text-[11px] text-faint">
        {page.job ? (apply ? 'Presses the Apply button, then fills the application.' : <>Press the site's <b className="text-text">Apply</b> button: Wera autofills the application there.</>)
          : 'Saves it to your Jobs and Tracker with a fit score.'}
      </p>
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
