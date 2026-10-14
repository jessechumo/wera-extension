import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, History, Layers, MessageSquareText, PartyPopper, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { ApiError, type ResumeFile, type WeraApi } from '../shared/api';
import { forgetAnswers, loadAnswers, matchAnswers, saveAnswer, type SavedAnswer } from '../shared/answers';
import type { ApplicantKey, FieldPurpose, FillResult } from '../shared/types';
import { fill, insert } from './page';
import { Button, Card, INPUT, Notice, errorText } from './ui';
import type { FillRequest } from './App';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

const NICE: Record<string, string> = {
  full_name: 'name', first_name: 'first name', last_name: 'last name', authorized_no_sponsorship: 'work authorization',
  needs_sponsorship: 'sponsorship', authorized_to_work: 'work authorization', how_heard: 'how you heard',
};

function ago(at: number) {
  const days = Math.round((Date.now() - at) / 86_400_000);
  return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function Question({ r, api, page, memory }: { r: FillResult; api: WeraApi; page: Page; memory: SavedAnswer[] }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [inserted, setInserted] = useState(false);
  const earlier = matchAnswers(memory, r.label);
  const insertNow = async () => {
    if (!page.tab) return;
    const x = await insert(page.tab, r.id, text);
    setInserted(x.ok);
    // Remembered in this browser for the next form with this question.
    if (x.ok) await saveAnswer({ question: r.label, answer: text, company: page.job?.company ?? '' });
  };
  const draft = async () => {
    setBusy(true);
    setNote('');
    try {
      // A box with a character limit gets an answer that fits (about 7 characters a word).
      const words = r.maxLength ? Math.max(25, Math.min(300, Math.floor(r.maxLength / 7))) : 150;
      // Not saved to Wera: the posting on the page is the context.
      const info = page.page;
      const posting = info && {
        company: info.draft?.company ?? '',
        title: info.draft?.title || info.title,
        description: info.draft?.description || info.text,
      };
      const a = await api.answer(r.label, page.job?.id ?? null, words, posting ?? undefined);
      if (a.needs_input) setNote(`Add yourself: ${a.needs_input}`);
      else setText(a.answer ?? '');
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-lg border border-border bg-surface-2/40 p-2.5">
      <p className="text-xs font-medium text-text">{r.label}{r.required && <span className="text-bad"> *</span>}</p>
      {text ? (
        <>
          <textarea className={`${INPUT} mt-2 h-28 resize-y`} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Answer to ${r.label}`} />
          <div className="mt-1.5 flex gap-2">
            <Button variant="primary" onClick={() => void insertNow()}>
              {inserted ? 'Inserted' : 'Insert into form'}
            </Button>
            <Button variant="ghost" onClick={() => void draft()} busy={busy}>Redraft</Button>
          </div>
        </>
      ) : (
        <>
          {earlier.length > 0 && (
            <div className="mt-2 space-y-1">
              {earlier.map((a, i) => (
                <button key={i} type="button" onClick={() => setText(a.answer)}
                  className="block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-left hover:border-accent/40">
                  <span className="flex items-center gap-1 text-[10px] font-medium text-accent"><History className="size-3" /> Your answer{a.company ? ` for ${a.company}` : ''}, {ago(a.at)}</span>
                  <span className="line-clamp-2 text-[11px] text-muted">{a.answer}</span>
                </button>
              ))}
            </div>
          )}
          <Button className="mt-2" onClick={() => void draft()} busy={busy}><Sparkles className="size-3.5" /> {earlier.length ? 'Draft a new one' : 'Draft an answer'}</Button>
        </>
      )}
      {note && <p className="mt-1.5 text-[11px] text-warn">{note}</p>}
    </li>
  );
}

// Purposes that are one application detail each (the others are derived or not details).
const DERIVED = new Set<FieldPurpose>(['full_name', 'authorized_no_sponsorship', 'location', 'resume', 'cover_letter', 'question', 'consent']);
const YES_NO = new Set<string>(['authorized_to_work', 'needs_sponsorship', 'willing_to_relocate']);
const MISSING = 'not in your application details';

/** A detail the form asks for that Wera does not have: add it here, saved to Wera, and fill again. */
function MissingDetail({ r, api, onSaved }: { r: FillResult; api: WeraApi; onSaved: () => void }) {
  const key = r.purpose as ApplicantKey;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = NICE[key] ?? key.replace(/_/g, ' ');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { applicant } = await api.applicant();
      await api.saveApplicant({ ...applicant, [key]: value.trim() });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-md bg-surface px-2.5 py-1.5 text-xs">
      <div className="truncate text-text" title={r.label}>{r.label || name}</div>
      <form className="mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {YES_NO.has(key) ? (
          <select className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Your ${name}`}>
            <option value="" disabled>Choose…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ) : (
          <input className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Your ${name}`} aria-label={`Your ${name}`} />
        )}
        <Button type="submit" variant="secondary" busy={busy} disabled={!value.trim()} title="Saved to your application details in Wera, then the form is filled again">Save</Button>
      </form>
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
    </li>
  );
}

/** Moves the job to Applied in the Wera tracker. */
export function MarkApplied({ api, page, lead }: { api: WeraApi; page: Page; lead: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const job = page.job;
  if (!job) return null;
  if (job.application_status === 'applied') {
    return <Notice tone="good"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" /> Marked as applied in your Wera tracker.</span></Notice>;
  }
  const mark = async () => {
    setBusy(true);
    setError('');
    try {
      page.setJob(await api.setStatus(job.id, 'applied'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-muted">{lead}</span>
        <Button variant="primary" onClick={() => void mark()} busy={busy}>Mark as applied</Button>
      </div>
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
    </div>
  );
}

const LAST_FILL = 'wera.lastFill';
interface LastFill { tabId: number; url: string; docId: string; at: number }

/** Whether this page was filled before it reloaded (the reload emptied the form). */
function useReloaded(page: Page): boolean {
  const [reloaded, setReloaded] = useState(false);
  const { tab, page: info } = page;
  useEffect(() => {
    if (!info?.hasForm || tab?.id == null || !chrome.storage?.session) return;
    void chrome.storage.session.get(LAST_FILL).then((r) => {
      const last = r[LAST_FILL] as LastFill | undefined;
      setReloaded(!!last && last.tabId === tab.id && last.url === info.url && last.docId !== (info.docId ?? '') && Date.now() - last.at < 30 * 60_000);
    }).catch(() => {});
  }, [tab?.id, info]);
  return reloaded;
}

export function ApplyTab({ api, page, autoFill }: { api: WeraApi; page: Page; autoFill?: FillRequest }) {
  const [results, setResults] = useState<FillResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);
  const [memory, setMemory] = useState<SavedAnswer[]>([]);
  useEffect(() => {
    void loadAnswers().then(setMemory).catch(() => {});
  }, [results]);
  const [attached, setAttached] = useState<ResumeFile['kind'] | null>(null);

  const run = async () => {
    if (!page.tab) return;
    setBusy(true);
    setError('');
    try {
      const [{ applicant }, resume] = await Promise.all([api.applicant(), api.resumeFile(page.job?.id ?? null).catch(() => null)]);
      setResults(await fill(page.tab, applicant, resume ?? undefined));
      page.clearNewStep();
      setAttached(resume?.kind ?? null);
      if (page.tab.id != null && page.page && chrome.storage?.session) {
        const last: LastFill = { tabId: page.tab.id, url: page.page.url, docId: page.page.docId ?? '', at: Date.now() };
        void chrome.storage.session.set({ [LAST_FILL]: last });
      }
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Your Wera connection ended; sign in again.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // The keyboard shortcut (Alt+Shift+F) asks for a fill.
  useEffect(() => {
    if (autoFill && page.tab && !page.loading && autoFill.claim()) {
      // A request from outside React (the shortcut, via session storage).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void run();
    }
  }); // no deps: runs when a new request arrives
  const reloaded = useReloaded(page);

  const by = (s: FillResult['status']) => results?.filter((r) => r.status === s) ?? [];
  const filled = by('filled');
  const review = by('review');
  const questions = by('question');
  const other = [...by('skipped'), ...by('already')];

  return (
    <div className="space-y-3">
      {page.submitted && page.job && (
        <MarkApplied api={api} page={page} lead={<span className="inline-flex items-center gap-1.5 font-medium text-text"><PartyPopper className="size-3.5 text-accent" /> Looks like you submitted it.</span>} />
      )}
      {reloaded && !results && (
        <Notice tone="warn">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-3.5 shrink-0" />
            <span className="flex-1">This page reloaded, so the form may be empty again.</span>
            <Button variant="primary" onClick={() => void run()} busy={busy}>Fill again</Button>
          </div>
        </Notice>
      )}
      {page.newStep > 0 && results && (
        <Notice tone="warn">
          <div className="flex items-center gap-2">
            <Layers className="size-3.5 shrink-0" />
            <span className="flex-1">A new step appeared with {page.newStep} field{page.newStep === 1 ? '' : 's'}.</span>
            <Button variant="primary" onClick={() => void run()} busy={busy}>Fill this step</Button>
          </div>
        </Notice>
      )}
      <Card>
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-accent" />
          <h2 className="text-sm font-semibold">Fill this application</h2>
        </div>
        <p className="mt-1 text-xs text-muted">
          {page.page?.hasForm
            ? 'Wera fills what it knows from your application details and attaches your resume.'
            : "No application form found yet. Open the job's Apply page, then fill."}
        </p>
        <Button variant="primary" className="mt-3 w-full" onClick={() => void run()} busy={busy} disabled={!page.tab}>
          {results ? 'Fill again' : 'Fill the form'}
        </Button>
        <p className="mt-2 text-[11px] text-faint">Wera never submits. Check every field, then submit it yourself.</p>
      </Card>
      {error && <Notice tone="bad">{error}</Notice>}

      {results && (
        <>
          <Notice tone={review.length ? 'warn' : 'good'}>
            Filled {filled.length} field{filled.length === 1 ? '' : 's'}
            {review.length ? `; ${review.length} to check (outlined in amber)` : ''}
            {questions.length ? `; ${questions.length} question${questions.length === 1 ? '' : 's'} for you` : ''}.
          </Notice>
          {attached && (
            <p className="text-[11px] text-muted">
              Resume offered for upload: {attached === 'tailored' ? `your copy tailored for ${page.job?.company ?? 'this job'}` : attached === 'base' ? 'your main resume (tailor one in the Resume tab)' : 'your uploaded file'}.
            </p>
          )}
          {review.length > 0 && (
            <Section icon={<AlertTriangle className="size-3.5 text-warn" />} title="Check these">
              {review.map((r) =>
                r.note === MISSING && r.purpose && !DERIVED.has(r.purpose)
                  ? <MissingDetail key={r.id} r={r} api={api} onSaved={() => void run()} />
                  : <Row key={r.id} r={r} />,
              )}
            </Section>
          )}
          {questions.length > 0 && (
            <Section icon={<MessageSquareText className="size-3.5 text-accent-2" />} title="Questions">
              {questions.map((r) => <Question key={r.id} r={r} api={api} page={page} memory={memory} />)}
            </Section>
          )}
          {filled.length > 0 && (
            <Section icon={<CheckCircle2 className="size-3.5 text-good" />} title="Filled">
              {filled.map((r) => <Row key={r.id} r={r} />)}
            </Section>
          )}
          {other.length > 0 && (
            <button className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-text" onClick={() => setShowSkipped((v) => !v)}>
              <ChevronDown className={clsx('size-3 transition-transform', showSkipped && 'rotate-180')} /> {other.length} left as they were
            </button>
          )}
          {showSkipped && <ul className="space-y-1">{other.map((r) => <Row key={r.id} r={r} />)}</ul>}
          {!page.submitted && <MarkApplied api={api} page={page} lead="Submitted it? Keep your tracker current." />}
          <div className="flex items-center justify-between">
            <a href={api.dashboardUrl('/profile#application')} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">
              Edit your application details in Wera
            </a>
            {memory.length > 0 && (
              <button type="button" className="text-[11px] text-faint hover:text-text" title="Answers you inserted, kept in this browser only"
                onClick={() => void forgetAnswers().then(() => setMemory([]))}>
                Forget {memory.length} saved answer{memory.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{icon} {title}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Row({ r }: { r: FillResult }) {
  return (
    <li className="rounded-md bg-surface px-2.5 py-1.5 text-xs">
      <div className="truncate text-text" title={r.label}>{r.label || NICE[r.purpose ?? ''] || 'Field'}</div>
      {(r.value || r.note) && <div className="truncate text-[11px] text-faint">{r.note ?? r.value}</div>}
    </li>
  );
}
