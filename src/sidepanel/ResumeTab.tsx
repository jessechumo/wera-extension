import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ExternalLink, FilePlus2, FileText, PencilLine, RefreshCw, Sparkles, Upload, Wand2 } from 'lucide-react';
import type { Coverage, JobKeywords, ResumeDoc, WeraApi } from '../shared/api';
import { NeedJob } from './NeedJob';
import { openPdf, PagePreview, ResumeEditor, useLivePreview } from './ResumeEditor';
import { Button, Card, INPUT, Notice, Skeleton, errorText } from './ui';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

export function CoverageChips({ coverage, label }: { coverage: Coverage; label: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="font-medium text-text">{label}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-good" style={{ width: `${coverage.percent}%` }} />
        </span>
        <span className="font-mono text-muted">{coverage.percent}%</span>
      </div>
      <div className="flex flex-wrap gap-1 text-[11px]">
        {coverage.matched.map((k) => <span key={k} className="rounded-full bg-good/10 px-2 py-0.5 text-good">{k}</span>)}
        {coverage.missing.map((k) => (
          <span key={k} className="rounded-full bg-warn/10 px-2 py-0.5 text-warn" title="Not on your resume. Add it only if it is true.">{k}</span>
        ))}
      </div>
    </div>
  );
}

/** No main resume yet: build one (a CV) from the uploaded file, or start from the account. */
function CreateResume({ api, onCreated }: { api: WeraApi; onCreated: (d: ResumeDoc) => void }) {
  const [busy, setBusy] = useState<'' | 'profile' | 'blank'>('');
  const [error, setError] = useState('');
  const create = async (source: 'profile' | 'blank') => {
    setBusy(source);
    setError('');
    try {
      onCreated(await api.createResume(source));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Card className="space-y-3 text-center">
      <FilePlus2 className="mx-auto size-5 text-accent" />
      <div>
        <h2 className="text-sm font-semibold">Create your resume</h2>
        <p className="mt-1 text-xs text-muted">Build it once here. Every job then gets a tailored one-page copy, and Apply attaches it.</p>
      </div>
      <Button variant="primary" className="w-full" onClick={() => void create('profile')} busy={busy === 'profile'} title="Uses a little of your monthly AI budget">
        <Upload className="size-3.5" /> Build it from my uploaded resume
      </Button>
      <Button className="w-full" onClick={() => void create('blank')} busy={busy === 'blank'}>
        <PencilLine className="size-3.5" /> Start from my details and write it here
      </Button>
      {error && <Notice tone="bad">{error}</Notice>}
      <a href={api.dashboardUrl('/profile/resume')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
        Import a LaTeX resume in Wera <ExternalLink className="size-3" />
      </a>
    </Card>
  );
}

/** The main resume: create it, or edit it right here. */
function MainResume({ api, jobId }: { api: WeraApi; jobId: number | null }) {
  const [doc, setDoc] = useState<ResumeDoc | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    void api.baseResume().then(setDoc).catch((e) => {
      setError(errorText(e));
      setDoc(null);
    });
  }, [api]);
  if (doc === undefined) return <Skeleton className="h-64" />;
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!doc) return <CreateResume api={api} onCreated={setDoc} />;
  return <ResumeEditor key={doc.id} api={api} doc={doc} jobId={jobId} onSaved={setDoc} />;
}

/** The copy tailored to the job on the page: tailor it (with a steer), see what changed, edit it. */
function TailoredResume({ api, page, onMain }: { api: WeraApi; page: Page; onMain: () => void }) {
  const job = page.job!;
  const [kw, setKw] = useState<JobKeywords | null>(null);
  const [doc, setDoc] = useState<ResumeDoc | null | undefined>(undefined);
  const [busy, setBusy] = useState<'' | 'tailor' | 'pdf'>('');
  const [request, setRequest] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const preview = useLivePreview(api, editing ? null : doc ?? null);

  // Load (and reload when the panel regains focus, e.g. after editing in Wera).
  const load = useCallback(() => {
    Promise.all([api.jobKeywords(job.id), api.jobResume(job.id)])
      .then(([k, d]) => {
        setKw(k);
        setDoc(d);
      })
      .catch((e) => {
        setError(errorText(e));
        setDoc(null);
      });
  }, [api, job.id]);
  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  if (doc === undefined || !kw) return error ? <Notice tone="bad">{error}</Notice> : <Skeleton className="h-64" />;
  if (kw.resume_id == null) {
    return (
      <Card className="text-center">
        <FileText className="mx-auto size-5 text-accent" />
        <h2 className="mt-2 text-sm font-semibold">Create your main resume first</h2>
        <p className="mt-1 text-xs text-muted">Tailoring rewrites a copy of it for {job.company}.</p>
        <Button variant="primary" className="mt-3" onClick={onMain}>Create my resume</Button>
      </Card>
    );
  }

  const tailor = async () => {
    setBusy('tailor');
    setError('');
    try {
      const r = await api.tailorResume(job.id, request);
      setDoc(r.resume);
      setEditing(false);
      setKw(await api.jobKeywords(job.id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };
  const download = async () => {
    if (!doc) return;
    setBusy('pdf');
    try {
      await openPdf(api, doc.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };
  const steer = (
    <textarea className={`${INPUT} h-14 resize-y text-xs`} maxLength={500} value={request} onChange={(e) => setRequest(e.target.value)}
      placeholder="Optional: what to lead with, e.g. my Kubernetes on-call work" aria-label="What to lead with" />
  );

  return (
    <div className="space-y-3">
      {kw.coverage && kw.keywords.length > 0 && (
        <Card><CoverageChips coverage={kw.coverage} label={doc ? 'Tailored resume covers' : 'Your resume covers'} /></Card>
      )}
      {!doc ? (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold">Tailor your resume to {job.company}</h2>
          <p className="text-xs text-muted">
            Reorders your skills and rewords bullets toward this posting using only what your resume says, then fits it to one page. Your main resume stays as it is.
          </p>
          {steer}
          <Button variant="primary" className="w-full" onClick={() => void tailor()} busy={busy === 'tailor'}><Wand2 className="size-3.5" /> Tailor my resume</Button>
        </Card>
      ) : editing ? (
        <ResumeEditor key={doc.id} api={api} doc={doc} jobId={job.id} onSaved={setDoc} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="primary" onClick={() => setEditing(true)}><PencilLine className="size-3.5" /> Edit here</Button>
            <Button onClick={() => void download()} busy={busy === 'pdf'}>PDF</Button>
            <a href={api.dashboardUrl(`/profile/resume/${doc.id}`)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-text hover:border-accent/40">
              Edit in Wera <ExternalLink className="size-3" />
            </a>
          </div>
          <p className="text-[11px] text-faint">
            {doc.fit?.one_page === false ? 'Longer than a page: press Fit when editing. ' : 'One page. '}
            Fill on the Apply tab attaches this copy.
          </p>
          {doc.notes.length > 0 && (
            <details className="text-xs text-muted" open>
              <summary className="cursor-pointer">What changed</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{doc.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </details>
          )}
          <details className="rounded-lg border border-border bg-surface p-2.5 text-xs">
            <summary className="cursor-pointer font-medium text-text"><Sparkles className="mr-1 inline size-3.5 text-accent" />Tailor again</summary>
            <div className="mt-2 space-y-2">
              {steer}
              <Button className="w-full" onClick={() => void tailor()} busy={busy === 'tailor'}><RefreshCw className="size-3.5" /> Tailor again</Button>
            </div>
          </details>
          {preview.svg ? <PagePreview svg={preview.svg} /> : <Skeleton className="aspect-[8.5/11]" />}
        </>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

export function ResumeTab({ api, page, onNeedJob }: { api: WeraApi; page: Page; onNeedJob: () => void }) {
  const job = page.job;
  const [view, setView] = useState<'job' | 'main'>(job ? 'job' : 'main');
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Which resume" className="grid grid-cols-2 rounded-lg border border-border bg-surface-2/50 p-0.5 text-xs">
        {(['job', 'main'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={clsx('truncate rounded-md px-2 py-1.5 font-medium', view === v ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}>
            {v === 'job' ? (job ? `For ${job.company}` : 'For this job') : 'Main resume (CV)'}
          </button>
        ))}
      </div>
      {view === 'main' ? <MainResume api={api} jobId={job?.id ?? null} />
        : job ? <TailoredResume api={api} page={page} onMain={() => setView('main')} />
        : <NeedJob what="tailored resume" onNeedJob={onNeedJob} />}
    </div>
  );
}
