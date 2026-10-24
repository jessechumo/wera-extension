// An application in the Wera panel: one Autofill button, then only what
// still needs the user (with why), Continue on multi-page forms, the
// resume and cover letter Wera uses, and what it filled.
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ClipboardCopy, FileText, PenLine, Sparkles, Zap } from 'lucide-react';
import type { WeraApi } from '../shared/api';
import { frames } from '../shared/rpc';
import { diagnostics } from './diagnostics';
import type { PanelProps } from './Panel';
import { rowLabel } from './rows';
import { BigButton, Button, Notice } from './ui';
import { LETTER, RESUME, needsYou, useAutofill, type Row } from './useAutofill';
import type { PanelPageState } from './usePanelPage';

/** An application: Autofill, then what still needs the user, then Continue on multi-page forms. */
export function Apply({ api, page, settings, tabId, fillRequest }: PanelProps & { api: WeraApi }) {
  const a = useAutofill(api, page, settings, tabId);
  const [showFilled, setShowFilled] = useState(false);

  // The toolbar shortcut or right-click menu asked to fill.
  const [handled, setHandled] = useState(0);
  useEffect(() => {
    if (fillRequest > handled && !page.loading && !a.busy) {
      // A request from outside React (a message from the background).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHandled(fillRequest);
      void a.autofill();
    }
  }, [fillRequest, handled, page.loading, a]);

  const needs = useMemo(() => needsYou(a.rows), [a.rows]);
  const filled = a.rows.filter((r) => r.status === 'filled' || r.status === 'already');
  const total = a.rows.length;
  const done = a.phase === 'filled' || a.phase === 'final';
  const label = a.phase === 'reading' ? 'Reading the form…' : a.phase === 'filling' ? `Filling… ${filled.length}/${total}`
    : a.phase === 'thinking' ? `Answering ${a.thinking} question${a.thinking === 1 ? '' : 's'}…` : a.phase === 'continuing' ? 'Moving to the next page…'
    : done ? 'Fill again' : 'Autofill';

  return (
    <div className="space-y-3">
      {page.newStep > 0 && a.phase !== 'continuing' && a.plan && (
        <Notice tone="warn">
          <div className="flex items-center gap-2">
            <span className="flex-1">A new step appeared with {page.newStep} field{page.newStep === 1 ? '' : 's'}.</span>
            <Button variant="primary" onClick={() => void a.autofill()} busy={a.busy}>Fill it</Button>
          </div>
        </Notice>
      )}
      {(a.plan?.gate ?? page.info?.gate) && <Notice tone="warn">{a.plan?.gate ?? page.info?.gate}</Notice>}
      <BigButton className="w-full" onClick={() => void a.autofill()} busy={a.busy} title="Alt+Shift+F">
        {!a.busy && <Zap className="size-4" />} {label}
      </BigButton>
      {total > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-good transition-all duration-300" style={{ width: `${(100 * filled.length) / total}%` }} />
          </span>
          <span className="font-mono">{filled.length}/{total}</span>
        </div>
      )}
      {(() => {
        const site = a.plan?.site ?? page.info?.site;
        const step = a.plan?.step ?? page.info?.step;
        return site || step ? (
          <p className="text-[11px] text-faint">{[site, step && `Step ${step.index} of ${step.total}`, step?.name].filter(Boolean).join(' · ')}</p>
        ) : null;
      })()}
      {a.phase === 'idle' && !a.plan && (
        <p className="text-[11px] text-faint">Fills what Wera knows from your details, resume and earlier answers, drafts the open questions, and lists the rest. It never submits.</p>
      )}
      {a.error && <Notice tone="bad">{a.error}</Notice>}
      {a.warnings.length > 0 && (
        <Notice tone="warn">
          <ul className="space-y-1">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Notice>
      )}
      {a.notice && <Notice tone="good">{a.notice}</Notice>}

      {done && needs.length > 0 && (
        <div className="anim-rise space-y-1.5">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase"><AlertTriangle className="size-3.5 text-warn" /> Needs you ({needs.length})</h3>
          <ul className="space-y-1.5">{needs.map((r) => <NeedRow key={r.id} r={r} onUse={(v) => void a.fillOne(r, v)} />)}</ul>
        </div>
      )}
      {done && needs.length === 0 && total > 0 && (
        <Notice tone="good"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> Everything Wera can see is filled. Check the page, then {a.phase === 'final' ? 'submit it yourself' : 'continue'}.</span></Notice>
      )}
      {a.phase === 'filled' && a.plan?.next && !a.plan.next.final && (
        <Button variant="primary" className="w-full py-2.5" onClick={() => void a.continueOn()} busy={a.busy}>
          Continue to the next page <ArrowRight className="size-3.5" />
        </Button>
      )}
      {a.phase === 'final' && a.plan?.next?.final && (
        <p className="text-[11px] text-muted">Last page: check everything, then press <b className="text-text">{a.plan.next.label}</b> on the site yourself.</p>
      )}

      <Docs api={api} page={page} a={a} />

      {filled.length > 0 && (
        <div>
          <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-text" onClick={() => setShowFilled((v) => !v)}>
            <ChevronDown className={clsx('size-3 transition-transform', showFilled && 'rotate-180')} /> What Wera filled ({filled.length})
          </button>
          {showFilled && (
            <ul className="mt-1.5 space-y-1">
              {filled.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => void frames('highlight', r.id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] hover:bg-surface-2">
                    <CheckCircle2 className={clsx('size-3 shrink-0', r.status === 'filled' ? 'text-good' : 'text-faint')} />
                    <span className="min-w-0 flex-1 truncate text-muted">{rowLabel(r)}</span>
                    <span className="max-w-[45%] truncate text-text">{r.value === RESUME ? 'resume' : r.value === LETTER ? 'cover letter' : r.result || r.value}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <a href={api.dashboardUrl('/profile#application')} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">
          Edit your details and saved answers
        </a>
        {a.plan && <CopyDiagnostics a={a} />}
      </div>
    </div>
  );
}

/** Copies what Wera made of the page and what happened (see diagnostics.ts), for a bug report. */
function CopyDiagnostics({ a }: { a: ReturnType<typeof useAutofill> }) {
  const [state, setState] = useState<'' | 'copied' | 'failed'>('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(await diagnostics(a));
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState(''), 2500);
  };
  return (
    <button type="button" onClick={() => void copy()} className="ml-auto inline-flex items-center gap-1 text-[11px] text-faint hover:text-text"
      title="Copies what Wera read on this page and what happened, for a bug report (self-identification answers are left out)">
      <ClipboardCopy className="size-3" /> {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : 'Copy diagnostics'}
    </button>
  );
}

/** One field that needs the user: why, a click to it on the page, and Wera's guess to use when it has one. */
function NeedRow({ r, onUse }: { r: Row; onUse: (value: string) => void }) {
  const guess = r.source === 'ai' && r.value && !r.checked && r.status !== 'filled';
  const why = r.drafted ? 'Wera drafted this answer: read it and make it yours'
    : r.status === 'review' ? r.result || r.note || 'check it'
    : guess ? `Wera's guess: ${r.value}`
    : r.group === 'consent' ? 'agree yourself after reading it'
    : r.note || 'required: fill it on the page';
  return (
    <li className={clsx('rounded-lg border bg-surface px-2.5 py-2 text-xs', r.drafted ? 'border-accent-2/30' : 'border-warn/30')}>
      <div className="flex items-center gap-2">
        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium text-text hover:underline" onClick={() => void frames('highlight', r.id)} title="Show it on the page">
          {rowLabel(r)}{r.required && <span className="text-bad"> *</span>}
        </button>
        {guess && <Button className="px-2 py-1" onClick={() => onUse(r.value)}>Use</Button>}
      </div>
      <p className={clsx('mt-0.5 line-clamp-2 text-[11px]', r.drafted ? 'text-accent-2' : 'text-muted')}>{why}</p>
    </li>
  );
}

/** Resume and cover letter for this application. */
function Docs({ api, page, a }: { api: WeraApi; page: PanelPageState; a: ReturnType<typeof useAutofill> }) {
  const [writing, setWriting] = useState(false);
  const job = page.job;
  const resumeText = !a.resume ? 'none yet' : a.resume.kind === 'tailored' ? `tailored for ${job?.company ?? 'this job'}` : a.resume.kind === 'base' ? 'your main resume' : 'your uploaded file';
  return (
    <div className="divide-y divide-border rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <FileText className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Resume</p>
          <p className="truncate text-[11px] text-muted">{a.plan ? resumeText : 'attached when Wera fills the form'}</p>
        </div>
        <a href={api.dashboardUrl(job ? `/jobs/${job.id}` : '/profile/resume')} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-accent hover:underline">
          {job && a.resume?.kind !== 'tailored' ? 'Tailor' : 'Edit'}
        </a>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <PenLine className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Cover letter</p>
          <p className="truncate text-[11px] text-muted">{a.letter ? 'written: Wera puts it in the form' : 'none for this job yet'}</p>
        </div>
        {a.letter ? (
          job && <a href={api.dashboardUrl(`/jobs/${job.id}`)} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-accent hover:underline">Edit</a>
        ) : (
          <Button className="px-2 py-1" busy={writing} onClick={() => {
            setWriting(true);
            void a.writeLetter().finally(() => setWriting(false));
          }}>
            {!writing && <Sparkles className="size-3.5" />} Write
          </Button>
        )}
      </div>
    </div>
  );
}
