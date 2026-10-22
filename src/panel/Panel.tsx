// The Wera panel on a job page: one card at the right edge (a small tab
// once collapsed). On an application it has one big Autofill button and,
// after filling, only what still needs the user; on a posting, the job's
// fit and Save. Resume and cover letter sit under it. Deeper work (editing
// the resume, details, the letter) opens in the dashboard.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowRight, Bookmark, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FileText, PartyPopper, PenLine, Settings2,
  Sparkles, X, Zap,
} from 'lucide-react';
import type { ApplicationStatus, WeraApi, WeraJob } from '../shared/api';
import { frames, rpc } from '../shared/rpc';
import type { Settings } from '../shared/settings';
import { LogoMark } from './Logo';
import { SignIn } from './SignIn';
import { BigButton, Button, Notice, ScoreRing, Skeleton, errorText } from './ui';
import { LETTER, RESUME, needsYou, useAutofill, type Row } from './useAutofill';
import type { PanelPageState } from './usePanelPage';

const STATUS: Record<string, [string, string]> = {
  saved: ['Saved', 'border-accent/30 bg-accent/10 text-accent'], applied: ['Applied', 'border-accent-2/25 bg-accent-2/10 text-accent-2'],
  interviewing: ['Interviewing', 'border-warn/25 bg-warn/10 text-warn'], offer: ['Offer', 'border-good/25 bg-good/10 text-good'],
  rejected: ['Rejected', 'border-bad/25 bg-bad/10 text-bad'], not_interested: ['Not interested', 'border-border bg-surface-2 text-muted'],
};

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap', className)}>{children}</span>;
}

/** A field's name: a job's or school's field says which ("Job 2 · Month"). */
export function rowLabel(r: Row): string {
  const label = (r.label || 'Field').replace(/\s*\*\s*$/, '');
  if (r.entry == null || !r.purpose) return label;
  return `${r.purpose.startsWith('exp_') ? 'Job' : 'School'} ${r.entry + 1} · ${label}`;
}

export interface PanelProps {
  api: WeraApi | null;
  page: PanelPageState;
  settings: Settings;
  setSettings: (p: Partial<Settings>) => void;
  tabId: number | null;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Asked to fill (toolbar shortcut, right-click menu) before the panel was ready. */
  fillRequest: number;
  onSignedIn: () => void;
  onSignedOut: () => void;
}

export function Panel(props: PanelProps) {
  const { api, page, open, onOpen } = props;
  const [menu, setMenu] = useState(false);
  const kind = page.info?.hasForm ? 'form' : page.handle.kind;
  const score = page.job ? (page.job.fit_score ?? page.job.estimated_score) : null;

  if (!open) {
    return (
      <button type="button" onClick={() => onOpen(true)} aria-label="Show the Wera panel" title="Wera (Alt+Shift+W)"
        className="anim-peek panel-shadow fixed top-[40%] right-0 z-[2147483646] flex flex-col items-center gap-1 rounded-l-[14px] border border-r-0 border-border bg-surface py-2.5 pr-2 pl-2.5 hover:pr-3">
        <LogoMark size={22} />
        {score != null && <b className="font-mono text-[11px] font-semibold">{score}</b>}
      </button>
    );
  }
  return (
    <section role="dialog" aria-label="Wera"
      className="anim-slide panel-shadow fixed top-3 right-3 bottom-3 z-[2147483646] flex w-[372px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-card border border-border bg-bg">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3.5 py-2.5">
        <LogoMark size={20} />
        <span className="font-mono text-[15px] font-semibold tracking-tight">wera</span>
        {kind && <Badge className="border-border bg-surface-2 text-muted">{kind === 'form' ? 'Application' : 'Job posting'}</Badge>}
        <button type="button" className={clsx('ml-auto grid size-7 place-items-center rounded-lg hover:bg-surface-2', menu ? 'text-accent' : 'text-faint hover:text-text')}
          onClick={() => setMenu((m) => !m)} aria-label="Settings" aria-pressed={menu}>
          <Settings2 className="size-4" />
        </button>
        <button type="button" className="grid size-7 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-text" onClick={() => onOpen(false)} aria-label="Collapse the Wera panel" title="Collapse">
          <ChevronRight className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        {menu ? <SettingsView {...props} onClose={() => setMenu(false)} />
          : !api ? <SignIn onSignedIn={props.onSignedIn} />
          : <Main {...props} api={api} kind={kind} />}
      </div>
    </section>
  );
}

function Main(props: PanelProps & { api: WeraApi; kind: 'form' | 'posting' | null }) {
  const { api, page, kind } = props;
  return (
    <>
      {page.submitted && <Submitted api={api} page={page} />}
      <JobCard api={api} page={page} />
      {page.error && <Notice tone="bad">{page.error}</Notice>}
      {kind === 'form' ? <Apply {...props} /> : <Posting api={api} page={page} />}
    </>
  );
}

/** The job: fit ring, title, company, where it is on the tracker. */
function JobCard({ api, page }: { api: WeraApi; page: PanelPageState }) {
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
function Posting({ api, page }: { api: WeraApi; page: PanelPageState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (page.loading) return <Skeleton className="h-11" />;
  if (page.job) {
    return <p className="text-xs text-muted">Press the site's <b className="text-text">Apply</b> button: Wera autofills the application there.</p>;
  }
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // The page's job data when it has some, else the AI reads the posting.
      let draft = page.info?.draft ?? page.handle.draft;
      if (!draft) {
        const got = await api.extract(location.href, document.title, page.info?.text ?? '');
        if (!got.is_job_posting) throw new Error("Wera doesn't see a job posting on this page.");
        draft = got;
      }
      page.setJob(await api.addJob(draft));
    } catch (e) {
      setError(errorText(e));
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
    </div>
  );
}

/** An application: Autofill, then what still needs the user, then Continue on multi-page forms. */
function Apply({ api, page, settings, tabId, fillRequest }: PanelProps & { api: WeraApi }) {
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
      <a href={api.dashboardUrl('/profile#application')} target="_blank" rel="noreferrer" className="block text-[11px] text-accent hover:underline">
        Edit your application details and saved answers in Wera
      </a>
    </div>
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

/** The site confirmed the application: what Wera did, with an undo. */
function Submitted({ api, page }: { api: WeraApi; page: PanelPageState }) {
  const s = page.submitted!;
  const [busy, setBusy] = useState(false);
  const undo = async (job: WeraJob, to: ApplicationStatus) => {
    setBusy(true);
    page.setJob(await api.setStatus(job.id, to).catch(() => job));
    setBusy(false);
    page.clearSubmitted();
  };
  const addApplied = async () => {
    const draft = page.info?.draft ?? page.handle.draft;
    if (!draft) return;
    setBusy(true);
    const added = await api.addJob(draft).catch(() => null);
    if (added) page.setJob(await api.setStatus(added.id, 'applied').catch(() => added));
    setBusy(false);
    page.clearSubmitted();
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
        </div>
        <button type="button" className="text-faint hover:text-text" onClick={page.clearSubmitted} aria-label="Close"><X className="size-3.5" /></button>
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--color-accent)]" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-faint">{hint}</span>
      </span>
    </label>
  );
}

function SettingsView({ api, settings, setSettings, onSignedOut, onClose }: PanelProps & { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await rpc({ type: 'wera:sign-out' }).catch(() => null);
    setBusy(false);
    onSignedOut();
    onClose();
  };
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Settings</h2>
      <div className="divide-y divide-border">
        <Toggle label="Answer with AI" hint="Fields your details do not cover, from your profile and resume. Unsure answers wait for you." on={settings.aiSuggest} set={(v) => setSettings({ aiSuggest: v })} />
        <Toggle label="Draft open questions while filling" hint={'"Why us?", "Tell me about a time...": drafted for you to read.'} on={settings.aiQuestions} set={(v) => setSettings({ aiQuestions: v })} />
        <Toggle label="Fill the next page on Continue" hint="Multi-page applications (Workday) keep filling." on={settings.autoContinue} set={(v) => setSettings({ autoContinue: v })} />
        <Toggle label="Remember my answers" hint="What you type into forms, for the next application." on={settings.learn} set={(v) => setSettings({ learn: v })} />
        <Toggle label="Mark applied when the site confirms" hint={'"Thank you for applying" moves the job to Applied.'} on={settings.autoApplied} set={(v) => setSettings({ autoApplied: v })} />
        <Toggle label="Show Wera on job pages" hint="Off: open it from the toolbar icon (Alt+Shift+W)." on={settings.launcher} set={(v) => setSettings({ launcher: v })} />
      </div>
      {api && (
        <div className="flex items-center gap-3 pt-2">
          <a href={api.dashboardUrl('/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Dashboard <ExternalLink className="size-3" /></a>
          <Button variant="ghost" className="ml-auto" onClick={() => void signOut()} busy={busy}>Sign out</Button>
        </div>
      )}
      <Button className="w-full" onClick={onClose}>Done</Button>
    </div>
  );
}

