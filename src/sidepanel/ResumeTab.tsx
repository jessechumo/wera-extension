import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, RefreshCw, Wand2 } from 'lucide-react';
import type { Coverage, JobKeywords, ResumeDoc, WeraApi } from '../shared/api';
import { NeedJob } from './NeedJob';
import { Button, Card, Notice, Skeleton, errorText } from './ui';
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

/** The first rendered page, shown as an image (an SVG in an <img> never runs). */
function PagePreview({ svg }: { svg: string }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), [svg]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="Resume preview" className="block w-full rounded-sm bg-white shadow ring-1 ring-black/5" />;
}

export function ResumeTab({ api, page, onNeedJob }: { api: WeraApi; page: Page; onNeedJob: () => void }) {
  const job = page.job;
  const [kw, setKw] = useState<JobKeywords | null>(null);
  const [doc, setDoc] = useState<ResumeDoc | null | undefined>(undefined);
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState<'' | 'tailor' | 'pdf'>('');
  const [error, setError] = useState('');

  // Load (and reload when the panel regains focus, e.g. after editing in Wera).
  const load = useCallback(() => {
    if (!job) return;
    Promise.all([api.jobKeywords(job.id), api.jobResume(job.id)])
      .then(([k, d]) => {
        setKw(k);
        setDoc(d);
      })
      .catch((e) => {
        setError(errorText(e));
        setDoc(null);
      });
  }, [api, job]);
  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);
  useEffect(() => {
    if (!doc) return;
    let live = true;
    api.previewResume(doc).then((r) => live && setSvg(r.pages[0] ?? '')).catch(() => {});
    return () => { live = false; };
  }, [api, doc]);

  if (!job) return <NeedJob what="tailored resume" onNeedJob={onNeedJob} />;
  if (doc === undefined || !kw) return error ? <Notice tone="bad">{error}</Notice> : <Skeleton className="h-64" />;

  if (kw.resume_id == null) {
    return (
      <Card className="text-center">
        <FileText className="mx-auto size-5 text-accent" />
        <h2 className="mt-2 text-sm font-semibold">Set up your resume in Wera</h2>
        <p className="mt-1 text-xs text-muted">Import your LaTeX or uploaded resume once. Then every job gets a tailored, one-page copy here, and Apply attaches it.</p>
        <a href={api.dashboardUrl('/profile/resume')} target="_blank" rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:bg-accent/85">
          Open Resume in Wera <ExternalLink className="size-3" />
        </a>
      </Card>
    );
  }

  const tailor = async () => {
    setBusy('tailor');
    setError('');
    try {
      const r = await api.tailorResume(job.id);
      setDoc(r.resume);
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
      const f = await api.resumeDocPdf(doc.id);
      if (f) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        await chrome.tabs.create({ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-3">
      {kw.coverage && kw.keywords.length > 0 && (
        <Card><CoverageChips coverage={kw.coverage} label={doc ? 'Tailored resume covers' : 'Your resume covers'} /></Card>
      )}
      {!doc ? (
        <Card>
          <h2 className="text-sm font-semibold">Tailor your resume to {job.company}</h2>
          <p className="mt-1 text-xs text-muted">
            Reorders your skills and rewords bullets toward this posting using only what your resume says, then fits it to one page. Your main resume stays as it is.
          </p>
          <Button variant="primary" className="mt-3 w-full" onClick={() => void tailor()} busy={busy === 'tailor'}><Wand2 className="size-3.5" /> Tailor my resume</Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <a href={api.dashboardUrl(`/profile/resume/${doc.id}`)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:bg-accent/85">
              Edit in Wera <ExternalLink className="size-3" />
            </a>
            <Button onClick={() => void download()} busy={busy === 'pdf'}><Download className="size-3.5" /> PDF</Button>
            <Button variant="ghost" onClick={() => void tailor()} busy={busy === 'tailor'}><RefreshCw className="size-3.5" /> Tailor again</Button>
          </div>
          <p className="text-[11px] text-faint">
            {doc.fit?.one_page === false ? 'Longer than a page: fit it in Wera. ' : 'One page. '}
            Fill on the Apply tab attaches this copy.
          </p>
          {doc.notes.length > 0 && (
            <details className="text-xs text-muted" open>
              <summary className="cursor-pointer">What changed</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{doc.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </details>
          )}
          {svg ? <PagePreview svg={svg} /> : <Skeleton className="aspect-[8.5/11]" />}
        </>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
