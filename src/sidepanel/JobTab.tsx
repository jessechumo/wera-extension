import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, PencilLine, SearchX, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { ApplicationStatus, WeraApi, WeraJob } from '../shared/api';
import { H1BCard } from './H1BCard';
import type { JobDraft } from '../shared/types';
import { Button, Card, Field, INPUT, Notice, ScoreRing, Skeleton, errorText } from './ui';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

const EMPTY: JobDraft = {
  url: '', company: '', title: '', location: '', work_mode: '', employment_type: '', department: '',
  salary: '', industry: '', description: '', source: 'manual',
};

const SOURCE: Record<JobDraft['source'], string> = {
  'page-data': "Filled from the page's job data. Check it, then save.",
  ai: 'Read by AI from the page. Check every field, then save.',
  manual: "Wera couldn't read a job here. Fill it in, or let the AI try.",
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  strong: { label: 'Strong fit', cls: 'text-accent' },
  good: { label: 'Good fit', cls: 'text-accent-2' },
  stretch: { label: 'Stretch', cls: 'text-muted' },
  poor: { label: 'Poor fit', cls: 'text-faint' },
};

function Chips({ items, tone }: { items: string[]; tone: 'good' | 'muted' }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span key={s} className={clsx('rounded-full border px-1.5 py-px text-[10.5px]',
          tone === 'good' ? 'border-good/30 bg-good/[0.08] text-good' : 'border-border bg-surface-2 text-muted')}>{s}</span>
      ))}
    </span>
  );
}

const STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'saved', label: 'Saved' }, { value: 'applied', label: 'Applied' }, { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' }, { value: 'rejected', label: 'Rejected' }, { value: 'not_interested', label: 'Not interested' },
];

export function JobCard({ job, api, onJob, fromDashboard, onUnlink }: {
  job: WeraJob;
  api: WeraApi;
  onJob?: (j: WeraJob) => void;
  /** Opened from the dashboard for this job (the page's address is not the one Wera has). */
  fromDashboard?: boolean;
  onUnlink?: () => void;
}) {
  const score = job.fit_score ?? job.estimated_score;
  const verdict = job.verdict ? VERDICT[job.verdict] : undefined;
  const setStatus = (status: ApplicationStatus) => void api.setStatus(job.id, status).then((j) => onJob?.(j)).catch(() => {});
  return (
    <Card>
      <div className="flex gap-3">
        <ScoreRing score={score} estimate={job.fit_score == null && score != null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 font-medium text-good"><CheckCircle2 className="size-3" /> In your Wera lists</span>
            {fromDashboard && (
              <>
                <span className="text-faint">· opened from your dashboard</span>
                {onUnlink && <button type="button" onClick={onUnlink} className="text-faint underline hover:text-text">Not this job?</button>}
              </>
            )}
          </div>
          <h2 className="mt-0.5 text-sm font-semibold leading-snug text-text">{job.title}</h2>
          <p className="text-xs text-muted">{job.company}{job.location_summary || job.location_raw ? ` · ${job.location_summary ?? job.location_raw}` : ''}</p>
        </div>
      </div>
      {verdict && <p className={clsx('mt-2.5 text-xs font-semibold', verdict.cls)}>{verdict.label}</p>}
      {job.reason ? (
        <p className="mt-1 text-xs leading-relaxed text-muted">{job.reason}</p>
      ) : (
        <p className="mt-2.5 text-xs text-faint">{job.stage === 'excluded' ? 'Your filters exclude this job.' : 'The AI score arrives in a few seconds.'}</p>
      )}
      {(!!job.skills_matched?.length || !!job.skills_missing?.length) && (
        <div className="mt-2.5 space-y-1.5 text-[11px]">
          {!!job.skills_matched?.length && (
            <div className="flex gap-2"><span className="w-12 shrink-0 text-faint">You have</span><Chips items={job.skills_matched.slice(0, 6)} tone="good" /></div>
          )}
          {!!job.skills_missing?.length && (
            <div className="flex gap-2"><span className="w-12 shrink-0 text-faint">You lack</span><Chips items={job.skills_missing.slice(0, 6)} tone="muted" /></div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={api.dashboardUrl(`/jobs?job=${job.id}`)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:border-accent/40">
          Open in Wera <ExternalLink className="size-3" />
        </a>
        <select value={job.application_status ?? ''} onChange={(e) => setStatus(e.target.value as ApplicationStatus)} aria-label="Tracker status"
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-text">
          <option value="" disabled>Track…</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {job.sponsorship && job.sponsorship !== 'unknown' && (
          <span className={clsx('text-[11px]', job.sponsorship === 'yes' ? 'text-good' : 'text-bad')}>
            Sponsorship {job.sponsorship === 'yes' ? 'offered' : 'not offered'}
          </span>
        )}
      </div>
      <H1BCard api={api} jobId={job.id} company={job.company} />
    </Card>
  );
}

/** Shown on pages with no job data until the user asks to save one anyway. */
function NoJobHere({ onRead, onManual, reading, error }: { onRead: () => void; onManual: () => void; reading: boolean; error: string }) {
  return (
    <Card className="space-y-3 text-center">
      <SearchX className="mx-auto size-6 text-faint" />
      <div>
        <h2 className="text-sm font-semibold">No job found on this page</h2>
        <p className="mt-0.5 text-xs text-muted">Open a job posting and Wera reads it on its own. If this page is a posting, the AI can read it, or you can fill it in.</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-center gap-2">
        <Button onClick={onRead} busy={reading} title="Uses a little of your monthly AI budget"><Sparkles className="size-3.5" /> Read with AI</Button>
        <Button variant="ghost" onClick={onManual}><PencilLine className="size-3.5" /> Fill in</Button>
      </div>
    </Card>
  );
}

export function JobTab({ api, page }: { api: WeraApi; page: Page }) {
  const [draft, setDraft] = useState<JobDraft>(EMPTY);
  const [manual, setManual] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDesc, setShowDesc] = useState(false);

  // New page: start from its job data (or an empty form for its URL).
  const [draftFor, setDraftFor] = useState(page.page);
  if (page.page && page.page !== draftFor) {
    setDraftFor(page.page);
    setDraft(page.page.draft ?? { ...EMPTY, url: page.page.url });
    setManual(false);
    setError('');
  }

  // Poll an unscored job until its AI score arrives (it is scored right after saving).
  const job = page.job;
  useEffect(() => {
    if (!job || job.fit_score != null || job.stage !== 'pending_score') return;
    const t = setInterval(() => {
      void api.job(job.id).then((j) => j.fit_score != null && page.setJob(j)).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [job, api, page]);

  const info = page.page;
  const readWithAI = useCallback(async () => {
    if (!info) return;
    setReading(true);
    setError('');
    try {
      const d = await api.extract(info.url, info.title, info.text);
      if (!d.is_job_posting) setError("The AI didn't find a single job posting on this page. Fill in the details yourself.");
      setDraft({ ...EMPTY, ...d, url: info.url, source: 'ai' });
      setManual(true);
    } catch (e) {
      setError(`${errorText(e)}. Fill in the details yourself.`);
      setManual(true);
    } finally {
      setReading(false);
    }
  }, [api, info]);

  // A page that looks like a job but has no job data (LinkedIn, Indeed, a
  // company's own careers site): the AI reads it at once, once per page.
  const autoRead = useRef('');
  const pageUrl = info?.url ?? '';
  useEffect(() => {
    if (!info || page.loading || job || info.draft || !info.jobLike || autoRead.current === pageUrl) return;
    autoRead.current = pageUrl;
    void readWithAI();
  }, [info, page.loading, job, pageUrl, readWithAI]);

  if (page.loading) return <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>;
  if (job) return <JobCard job={job} api={api} onJob={page.setJob} fromDashboard={page.fromDashboard} onUnlink={() => void page.unlink()} />;
  if (!page.page) return null;
  if (reading && draft.source === 'manual') {
    return (
      <Card className="space-y-3 text-center">
        <Sparkles className="mx-auto size-6 animate-pulse text-accent" />
        <div>
          <h2 className="text-sm font-semibold">Reading this job with AI…</h2>
          <p className="mt-0.5 text-xs text-muted">This page has no job data, so Wera reads the posting. You check it before it saves.</p>
        </div>
        <Skeleton className="h-24" />
      </Card>
    );
  }

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      page.setJob(await api.addJob(draft));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (draft.source === 'manual' && !manual) {
    return <NoJobHere onRead={() => void readWithAI()} onManual={() => setManual(true)} reading={reading} error={error} />;
  }

  const set = (k: keyof JobDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  const canSave = draft.company.trim() !== '' && draft.title.trim() !== '' && /^https?:\/\//.test(draft.url);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Save this job to Wera</h2>
          <p className="mt-0.5 text-[11px] text-muted">{SOURCE[draft.source]}</p>
        </div>
        {draft.source !== 'page-data' && (
          <Button onClick={() => void readWithAI()} busy={reading} title="Uses a little of your monthly AI budget">
            <Sparkles className="size-3.5" /> Read with AI
          </Button>
        )}
      </div>
      <Field label="Company"><input className={INPUT} value={draft.company} onChange={set('company')} /></Field>
      <Field label="Title"><input className={INPUT} value={draft.title} onChange={set('title')} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Location"><input className={INPUT} value={draft.location} onChange={set('location')} /></Field>
        <Field label="Work mode">
          <select className={INPUT} value={draft.work_mode} onChange={set('work_mode')}>
            <option value="">Not stated</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </Field>
      </div>
      {draft.salary && <Field label="Salary"><input className={INPUT} value={draft.salary} onChange={set('salary')} /></Field>}
      <div>
        <button className="text-[11px] font-medium text-muted hover:text-text" onClick={() => setShowDesc((v) => !v)}>
          {showDesc ? 'Hide' : 'Show'} description ({draft.description.length.toLocaleString()} characters)
        </button>
        {showDesc && <textarea className={`${INPUT} mt-1.5 h-48 resize-y font-mono text-[11px]`} value={draft.description} onChange={set('description')} aria-label="Description" />}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button variant="primary" className="w-full" onClick={() => void save()} busy={saving} disabled={!canSave}>
        Save to Wera
      </Button>
      <p className="text-[11px] text-faint">It joins your Jobs and Tracker (as saved) and gets a fit score. Wera also adds it to its jobs, scores it for other people it suits, and watches the employer's job board.</p>
    </Card>
  );
}
