import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Sparkles } from 'lucide-react';
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

const STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'saved', label: 'Saved' }, { value: 'applied', label: 'Applied' }, { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' }, { value: 'rejected', label: 'Rejected' }, { value: 'not_interested', label: 'Not interested' },
];

export function JobCard({ job, api, onJob }: { job: WeraJob; api: WeraApi; onJob?: (j: WeraJob) => void }) {
  const score = job.fit_score ?? job.estimated_score;
  const setStatus = (status: ApplicationStatus) => void api.setStatus(job.id, status).then((j) => onJob?.(j)).catch(() => {});
  return (
    <Card>
      <div className="flex gap-3">
        <ScoreRing score={score} estimate={job.fit_score == null && score != null} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-good inline-flex items-center gap-1"><CheckCircle2 className="size-3" /> In your Wera lists</div>
          <h2 className="mt-0.5 text-sm font-semibold leading-snug text-text">{job.title}</h2>
          <p className="text-xs text-muted">{job.company}{job.location_summary || job.location_raw ? ` · ${job.location_summary ?? job.location_raw}` : ''}</p>
        </div>
      </div>
      {job.reason ? (
        <p className="mt-2.5 text-xs leading-relaxed text-muted">{job.reason}</p>
      ) : (
        <p className="mt-2.5 text-xs text-faint">{job.stage === 'excluded' ? 'Your filters exclude this job.' : 'The AI score arrives in a few seconds.'}</p>
      )}
      {!!job.skills_missing?.length && (
        <p className="mt-2 text-[11px] text-faint">You may lack: {job.skills_missing.slice(0, 5).join(', ')}</p>
      )}
      <div className="mt-3 flex gap-2">
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
          <span className="self-center text-[11px] text-muted">Sponsorship: {job.sponsorship === 'yes' ? 'offered' : 'not offered'}</span>
        )}
      </div>
      <H1BCard api={api} jobId={job.id} company={job.company} />
    </Card>
  );
}

export function JobTab({ api, page }: { api: WeraApi; page: Page }) {
  const [draft, setDraft] = useState<JobDraft>(EMPTY);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDesc, setShowDesc] = useState(false);

  // New page: start from its job data (or an empty form for its URL).
  const [draftFor, setDraftFor] = useState(page.page);
  if (page.page && page.page !== draftFor) {
    setDraftFor(page.page);
    setDraft(page.page.draft ?? { ...EMPTY, url: page.page.url });
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

  if (page.loading) return <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>;
  if (job) return <JobCard job={job} api={api} onJob={page.setJob} />;
  if (!page.page) return null;

  const readWithAI = async () => {
    setReading(true);
    setError('');
    try {
      const d = await api.extract(page.page!.url, page.page!.title, page.page!.text);
      if (!d.is_job_posting) setError("The AI didn't find a single job posting on this page. You can still fill the form.");
      setDraft({ ...EMPTY, ...d, url: page.page!.url, source: 'ai' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  };

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
      <p className="text-[11px] text-faint">It joins your Jobs and Tracker (as saved) and gets a fit score.</p>
    </Card>
  );
}
