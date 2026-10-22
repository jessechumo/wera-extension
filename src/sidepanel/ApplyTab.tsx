import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronDown, Circle, FileText, Flag, History, LoaderCircle, MessageSquareText,
  PartyPopper, RotateCcw, ScanSearch, Sparkles, UserRound, Wand2, Zap,
} from 'lucide-react';
import { ApiError, type ApplicationStatus, type ResumeFile, type SuggestField, type Suggestion, type WeraApi } from '../shared/api';
import { tabPages, type TabPage } from '../shared/storage';
import { clearLegacyAnswers, loadLegacyAnswers, matchAnswers, type SavedAnswer } from '../shared/answers';
import { loadFlow, saveFlow, type Flow } from '../shared/flow';
import type { Settings } from '../shared/settings';
import type { Applicant, FieldPlan, FillResult, FillStatus, PagePlan, Profile, ValueSource } from '../shared/types';
import { answersToLearn, detailsToLearn } from './learn';
import { addEntries, apply, frameField, highlightField, insert, pressNext, scan, snapshotForm } from './page';
import { BigButton, Button, Card, INPUT, Notice, errorText } from './ui';
import type { FillRequest } from './App';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

// The markers the content script fills a file or the letter for (see content/plan.ts).
const RESUME = '__resume__';
const LETTER = '__letter__';

/** One field as the panel shows it: the plan, the user's choice, and how filling it went. */
interface Row extends FieldPlan {
  /** The list it shows in, set when the page is read (typing a value must not move it). */
  home: 'fill' | 'questions' | 'needs' | 'left';
  checked: boolean;
  status?: FillStatus | 'filling';
  result?: string;
}

type Phase = 'idle' | 'scanning' | 'suggesting' | 'ready' | 'filling' | 'filled' | 'continuing' | 'final';

const SOURCE: Record<ValueSource, { label: string; cls: string; Icon: typeof Bot }> = {
  details: { label: 'Your details', cls: 'text-good', Icon: UserRound },
  profile: { label: 'Your profile', cls: 'text-good', Icon: UserRound },
  saved: { label: 'Earlier answer', cls: 'text-accent-2', Icon: History },
  ai: { label: 'AI', cls: 'text-accent', Icon: Bot },
  resume: { label: 'Resume', cls: 'text-good', Icon: FileText },
  letter: { label: 'Letter', cls: 'text-good', Icon: FileText },
  you: { label: 'You', cls: 'text-text', Icon: UserRound },
};

function homeOf(f: FieldPlan): Row['home'] {
  if (f.group === 'questions' && f.kind === 'textarea') return 'questions';
  if (f.value !== '' && f.group !== 'questions' && f.group !== 'consent') return 'fill';
  // Self-identification not in the profile: the user answers it once, never hidden among optional fields.
  if (f.group === 'self_id') return 'needs';
  if (f.required || f.group === 'consent' || f.group === 'other' || f.note === 'not in your application details') return 'needs';
  return 'left';
}

/**
 * The rows for a plan: fields with a value Wera trusts are ticked; ones
 * the page already shows are left. A detail Wera filled in from the
 * resume or profile (not one the user saved) says so.
 */
export function rowsFor(plan: PagePlan, sources: Record<string, string> = {}): Row[] {
  return plan.fields.map((f) => ({
    ...f,
    source: f.source === 'details' && f.purpose && sources[f.purpose] ? (sources[f.purpose] === 'resume' ? 'resume' : 'profile') : f.source,
    home: homeOf(f),
    checked: f.value !== '' && f.group !== 'consent' && f.current === '',
    status: f.current !== '' && f.current === f.value ? 'already' : undefined,
  }));
}

// AI answers already given in this panel, by site and field, so reading a
// page again (or coming back to it) does not ask again. null: no answer.
const suggested = new Map<string, Suggestion | null>();
const suggestKey = (site: string, r: FieldPlan) => `${site}|${r.label}|${r.kind}|${r.options.join('/')}`;

/** Fields worth asking the AI about: empty, not answered by anything Wera knows, and not the user's to answer. */
export function needsSuggestion(r: Row): boolean {
  return r.value === '' && r.current === '' && r.entry == null && (r.group === 'details' || r.group === 'other' || (r.group === 'questions' && r.kind !== 'textarea'))
    && r.kind !== 'file' && r.kind !== 'checkbox';
}

const ago = (at: number) => {
  const days = Math.round((Date.now() - at) / 86_400_000);
  return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

function host(url: string | undefined): string {
  try {
    return url ? new URL(url).host : '';
  } catch {
    return '';
  }
}

export function ApplyTab({ api, page, autoFill, settings, onNeedJob, revealDelay = 700 }: {
  api: WeraApi; page: Page; autoFill?: FillRequest; settings: Settings; onNeedJob?: () => void;
  /** How long to let the page show fields an answer reveals before reading it again (ms). */
  revealDelay?: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<PagePlan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bank, setBank] = useState<SavedAnswer[]>([]);
  const [resume, setResume] = useState<ResumeFile | null>(null);
  const [letter, setLetter] = useState('');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const applicant = useRef<Applicant | null>(null);
  // What the page was last read with, to read it again after filling.
  const scanInput = useRef<{ profile: Profile; known: { question: string; answer: string }[]; resumeName?: string; hasLetter: boolean; sources: Record<string, string> } | null>(null);
  // Whether Wera already pressed this page's Add buttons for the resume's other jobs and schools.
  const addedBlocks = useRef(false);
  // Whether this page is counted in Wera's record of the application yet.
  const counted = useRef(false);
  const tab = page.tab;
  const siteHost = host(page.page?.url);
  const jobId = page.job?.id ?? null;

  const posting = useMemo(() => {
    const info = page.page;
    return info ? { company: page.job?.company ?? info.draft?.company ?? '', title: page.job?.title ?? (info.draft?.title || info.title), description: info.draft?.description || info.text } : undefined;
  }, [page.page, page.job]);

  /** Reads the page into rows, then asks the AI about what is left (if allowed). */
  const scanPage = useCallback(async (): Promise<{ plan: PagePlan; rows: Row[] } | null> => {
    if (!tab) return null;
    setPhase('scanning');
    setError('');
    try {
      const [view, saved, file, cover] = await Promise.all([
        api.applicant(),
        api.answers().catch(() => [] as SavedAnswer[]),
        api.resumeFile(jobId).catch(() => null),
        jobId != null ? api.coverLetter(jobId).catch(() => null) : Promise.resolve(null),
      ]);
      // Answers an older version kept in this browser move to Wera once.
      const legacy = await loadLegacyAnswers().catch(() => []);
      if (legacy.length) {
        await api.saveAnswers(legacy.map((l) => ({ question: l.question, answer: l.answer, kind: 'long', company: l.company })))
          .then(() => clearLegacyAnswers()).catch(() => {});
        saved.push(...legacy);
      }
      const a = view.applicant;
      applicant.current = a;
      setBank(saved);
      setResume(file);
      setLetter(cover?.body ?? '');
      const profile: Profile = { ...a, experience: view.experience, education: view.education, skills: view.skills };
      const known = saved.map((s) => ({ question: s.question, answer: s.answer }));
      scanInput.current = { profile, known, resumeName: file?.name, hasLetter: !!cover?.body, sources: view.sources };
      let p = await scan(tab, profile, known, file?.name, !!cover?.body);
      // A section with fewer blocks than the resume has jobs (or schools), and an Add button: add them once, then read again.
      if (p.adders?.length && !addedBlocks.current) {
        addedBlocks.current = true;
        let added = 0;
        for (const ad of p.adders) added += await addEntries(tab, ad.frameId ?? 0, ad.section, ad.missing);
        if (added) {
          await new Promise((r) => setTimeout(r, 400));
          p = await scan(tab, profile, known, file?.name, !!cover?.body);
        }
      }
      let next = rowsFor(p, view.sources);
      setPlan(p);
      setRows(next);
      const ask = next.filter(needsSuggestion);
      if (settings.aiSuggest && ask.length) {
        setPhase('suggesting');
        const fresh = ask.filter((r) => !suggested.has(suggestKey(siteHost, r)));
        if (fresh.length) {
          const fields: SuggestField[] = fresh.map((r) => ({ id: r.id, label: r.label, kind: r.kind, options: r.options.length ? r.options : undefined, required: r.required || undefined, max_length: r.maxLength }));
          const got = await api.suggest(fields, jobId, posting).then((x) => x.answers).catch(() => null);
          if (got) {
            const byId = new Map(got.map((s) => [s.id, s]));
            for (const r of fresh) suggested.set(suggestKey(siteHost, r), byId.get(r.id) ?? null);
          }
        }
        next = next.map((r) => {
          const s = suggested.get(suggestKey(siteHost, r));
          if (!s) return r;
          const filled = { ...r, value: s.value, source: 'ai' as const, confidence: s.confidence, note: s.why || (s.confidence === 'low' ? 'a guess: check it' : ''), checked: s.confidence === 'high' };
          return { ...filled, home: homeOf(filled) };
        });
        setRows(next);
      }
      setPhase('ready');
      return { plan: p, rows: next };
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Your Wera connection ended; sign in again.' : errorText(e));
      setPhase('idle');
      return null;
    }
  }, [api, tab, jobId, posting, settings.aiSuggest, siteHost]);

  /** Learns from the page as the user left it: answers for next time, and details Wera lacked. */
  const learn = useCallback(async (list: Row[]) => {
    if (!tab || !settings.learn || !list.length) return;
    const snap = await snapshotForm(tab).catch(() => []);
    const answers = answersToLearn(list, snap, bank, posting?.company ?? '');
    const details = applicant.current ? detailsToLearn(list, snap, applicant.current) : {};
    const said: string[] = [];
    if (answers.length) {
      await api.saveAnswers(answers).then(() => {
        said.push(`${answers.length} answer${answers.length === 1 ? '' : 's'}`);
        setBank((b) => [...answers.map((a) => ({ ...a, at: Date.now() })), ...b]);
      }).catch(() => {});
    }
    const keys = Object.keys(details);
    if (keys.length && applicant.current) {
      const merged = { ...applicant.current, ...details };
      await api.saveApplicant(merged).then(() => {
        applicant.current = merged;
        said.push(keys.map((k) => k.replace(/_/g, ' ')).join(', '));
      }).catch(() => {});
    }
    if (said.length) setNotice(`Saved for next time: ${said.join('; ')}.`);
  }, [api, tab, settings.learn, bank, posting]);

  /**
   * The job this application is for, in Wera: the page's job, else the
   * posting it came from (this page's job data, or the posting the tab
   * showed before), saved now so the application shows up in Wera.
   */
  const tabId = tab?.id;
  const pageDraft = page.page?.draft;
  const { setJob } = page;
  const ensureJob = useCallback(async (): Promise<number | null> => {
    if (jobId != null) return jobId;
    const seen: Record<string, TabPage> = tabId != null ? await tabPages().catch(() => ({})) : {};
    const draft = pageDraft ?? (tabId != null ? seen[tabId]?.draft : undefined);
    if (!draft?.title || !draft.company) return null;
    try {
      const j = await api.addJob(draft);
      setJob(j);
      setNotice(`Saved ${j.title} at ${j.company} to your Wera lists, so this application shows up there.`);
      return j.id;
    } catch {
      return null;
    }
  }, [api, jobId, pageDraft, setJob, tabId]);

  /** Fills the ticked rows one by one; each ticks off as the page reports it. */
  const fillRows = useCallback(async (list: Row[], forPlan: PagePlan | null) => {
    if (!tab) return;
    const last = !forPlan?.next || forPlan.next.final;
    const items = list.filter((r) => r.checked && r.value !== '').map((r) => ({ id: r.id, value: r.value }));
    if (!items.length) {
      setPhase(last ? 'final' : 'filled');
      return;
    }
    setPhase('filling');
    setError('');
    const queued = new Set(items.map((i) => i.id));
    setRows((rs) => rs.map((r) => (queued.has(r.id) ? { ...r, status: 'filling', result: undefined } : r)));
    try {
      const forJob = await ensureJob();
      // A cover letter upload gets the letter as a PDF.
      const wantsLetterFile = list.some((r) => r.checked && r.value === LETTER && r.kind === 'file');
      const letterFile = wantsLetterFile && forJob != null ? await api.coverLetterPdf(forJob).catch(() => null) : null;
      const results = await apply(tab, items, resume ?? undefined, letter || undefined, undefined, letterFile ?? undefined);
      // Answers can reveal more fields ("Race" once "Hispanic or Latino" is No, "If yes..."):
      // read the page again and fill the new ones Wera is sure of.
      const reading = scanInput.current;
      if (reading && results.some((x) => x.status === 'filled')) {
        await new Promise((r) => setTimeout(r, revealDelay));
        const again = await scan(tab, reading.profile, reading.known, reading.resumeName, reading.hasLetter).catch(() => null);
        const seen = new Set(list.map((r) => r.id));
        const fresh = again ? rowsFor(again, reading.sources).filter((r) => !seen.has(r.id)) : [];
        if (fresh.length) {
          const sure = fresh.filter((r) => r.checked && r.value !== '');
          const more = sure.length ? await apply(tab, sure.map((r) => ({ id: r.id, value: r.value })), resume ?? undefined, letter || undefined) : [];
          const byMore = new Map(more.map((x) => [x.id, x]));
          setPlan(again);
          setRows((rs) => [...rs, ...fresh.map((r) => {
            const x = byMore.get(r.id);
            return x ? { ...r, status: x.status, result: x.note ?? x.value } : r;
          })]);
          results.push(...more);
        }
      }
      const by = new Map(results.map((x) => [x.id, x]));
      setRows((rs) => rs.map((r) => {
        const x = by.get(r.id);
        return x ? { ...r, status: x.status, result: x.note ?? x.value } : r;
      }));
      const filled = results.filter((x) => x.status === 'filled');
      const fromAI = filled.filter((x) => list.find((r) => r.id === x.id)?.source === 'ai').length;
      page.clearNewStep();
      // Count the page (once) in Wera's record of this application.
      if (tab.id != null && siteHost && filled.length && !counted.current) {
        counted.current = true;
        const f = (await loadFlow(tab.id, siteHost)) ?? { runId: 0, host: siteHost, jobId: forJob, pages: 1, continuing: false, at: Date.now() };
        const runId = f.runId
          ? (await api.addRunPage(f.runId, filled.length, fromAI).catch(() => null), f.runId)
          : (await api.startRun(siteHost, forJob, filled.length, fromAI).catch(() => ({ id: 0 }))).id;
        const nextFlow = { ...f, runId, jobId: forJob ?? f.jobId, continuing: false };
        setFlow(nextFlow);
        await saveFlow(tab.id, nextFlow);
      }
      setPhase(last ? 'final' : 'filled');
      await learn(list);
    } catch (e) {
      setError(errorText(e));
      setRows((rs) => rs.map((r) => (r.status === 'filling' ? { ...r, status: undefined } : r)));
      setPhase('ready');
    }
  }, [api, tab, resume, letter, page, siteHost, learn, ensureJob, revealDelay]);

  // Each field the page fills is reported as it lands.
  useEffect(() => {
    if (!chrome.runtime?.onMessage) return;
    const onMessage = (msg: { type?: string; result?: FillResult }, sender: chrome.runtime.MessageSender) => {
      if (msg?.type !== 'wera:fill-progress' || !msg.result || sender.tab?.id !== tab?.id) return;
      const id = frameField(sender.frameId ?? 0, msg.result.id);
      const res = msg.result;
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: res.status, result: res.note ?? res.value } : r)));
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [tab?.id]);

  /** Approve & continue: learn, press Next, then fill the next page when it shows. */
  const continueOn = useCallback(async () => {
    if (!tab || !plan?.next) return;
    setPhase('continuing');
    setError('');
    page.clearNewStep();
    await learn(rows);
    const r = await pressNext(tab, plan.next.id);
    if (!r.ok) {
      if (r.final) setPhase('final');
      else {
        setError("Wera couldn't press the page's Next button. Press it yourself, and Wera fills the next page.");
        setPhase('filled');
      }
      return;
    }
    counted.current = false;
    if (tab.id != null) {
      const f = (await loadFlow(tab.id, siteHost)) ?? flow ?? { runId: 0, host: siteHost, jobId, pages: 1, continuing: false, at: Date.now() };
      const next = { ...f, continuing: true, pages: f.pages + 1 };
      setFlow(next);
      await saveFlow(tab.id, next);
    }
  }, [tab, plan, rows, learn, flow, siteHost, jobId, page]);

  const scanAndMaybeFill = useCallback(async (fill: boolean) => {
    const got = await scanPage();
    if (got && fill) await fillRows(got.rows, got.plan);
  }, [scanPage, fillRows]);

  // On a form page: read it at once. After Continue (the page reloaded or
  // moved on), fill it too when the user asked for that.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !tab || page.loading || !page.page?.hasForm) return;
    started.current = true;
    void (async () => {
      const f = tab.id != null && siteHost ? await loadFlow(tab.id, siteHost) : null;
      setFlow(f);
      const fillNow = !!f?.continuing && settings.autoContinue;
      if (f?.continuing && tab.id != null) await saveFlow(tab.id, { ...f, continuing: false });
      await scanAndMaybeFill(fillNow);
    })();
  }, [tab, page.loading, page.page?.hasForm, siteHost, settings.autoContinue, scanAndMaybeFill]);

  // A single-page app showed its next step without a page load.
  useEffect(() => {
    if (phase === 'continuing' && page.newStep > 0) {
      // A step the page rendered on its own (an external change): read it now.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void scanAndMaybeFill(settings.autoContinue);
    }
  }, [phase, page.newStep, settings.autoContinue, scanAndMaybeFill]);

  // Still on the same step a while after Next: the site probably flagged something.
  useEffect(() => {
    if (phase !== 'continuing') return;
    const t = window.setTimeout(() => {
      void scanPage().then((got) => {
        if (got) setError('The page did not move on. It may want a field fixed (look for red marks), then press Continue again.');
      });
    }, 8000);
    return () => window.clearTimeout(t);
  }, [phase, scanPage]);

  // The keyboard shortcut, the right-click menu or the page's Wera button asked to fill.
  useEffect(() => {
    if (autoFill && tab && !page.loading && autoFill.claim()) {
      // A request from outside React (via session storage).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void (plan ? fillRows(rows, plan) : scanAndMaybeFill(true));
    }
  }); // no deps: runs when a new request arrives

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  /** Writes the cover letter for a form that asks for one, and ticks its field. */
  const [writingLetter, setWritingLetter] = useState(false);
  const writeLetter = async (row: Row) => {
    setWritingLetter(true);
    setError('');
    try {
      const forJob = await ensureJob();
      if (forJob == null) {
        setError('Save this job in Wera first (Job tab), then Wera can write its letter.');
        return;
      }
      const l = await api.writeCoverLetter(forJob);
      setLetter(l.body);
      update(row.id, { value: LETTER, checked: true, source: 'letter', note: row.kind === 'file' ? 'your cover letter for this job, as a PDF' : 'your cover letter for this job', home: 'fill' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWritingLetter(false);
    }
  };
  const rowProps = (r: Row) => ({
    r, disabled: busy, onChange: (p: Partial<Row>) => update(r.id, p), onFind: () => tab && void highlightField(tab, r.id),
    onWriteLetter: r.purpose === 'cover_letter' && r.value === '' ? () => void writeLetter(r) : undefined, writingLetter,
  });
  const busy = phase === 'scanning' || phase === 'suggesting' || phase === 'filling' || phase === 'continuing';

  const toFill = rows.filter((r) => r.home === 'fill');
  const questions = rows.filter((r) => r.home === 'questions');
  const needYou = rows.filter((r) => r.home === 'needs');
  const left = rows.filter((r) => r.home === 'left');
  const ticked = rows.filter((r) => r.checked && r.value !== '').length;
  const done = rows.filter((r) => r.status === 'filled' || r.status === 'already').length;
  const filled = rows.filter((r) => r.status === 'filled').length;
  const filledCount = `${filled} field${filled === 1 ? '' : 's'}`;

  return (
    <div className="space-y-3 pb-16">
      {page.autoApplied && page.job && <AutoApplied api={api} page={page} />}
      {plan && !page.job && phase !== 'scanning' && (
        <Notice tone="warn">
          <div className="flex items-center gap-2">
            <span className="flex-1">This job is not in your Wera lists yet. Save it so this application shows up in Wera.</span>
            {onNeedJob && <Button onClick={onNeedJob}>Save it</Button>}
          </div>
        </Notice>
      )}
      {page.submitted && page.job && !page.autoApplied && (
        <MarkApplied api={api} page={page} lead={<span className="inline-flex items-center gap-1.5 font-medium text-text"><PartyPopper className="size-3.5 text-accent" /> Looks like you submitted it.</span>} />
      )}
      {page.newStep > 0 && phase !== 'continuing' && plan && (
        <Notice tone="warn">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-3.5 shrink-0" />
            <span className="flex-1">A new step appeared with {page.newStep} field{page.newStep === 1 ? '' : 's'}.</span>
            <Button variant="primary" onClick={() => void scanAndMaybeFill(false)} busy={busy}>Read this step</Button>
          </div>
        </Notice>
      )}

      <Card>
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-accent" />
          <h2 className="text-sm font-semibold">{plan ? `Application${flow && flow.pages > 1 ? `, page ${flow.pages}` : ''}` : 'Fill this application'}</h2>
          {siteHost && <span className="ml-auto truncate text-[11px] text-faint">{siteHost}</span>}
        </div>
        {!plan ? (
          <>
            <p className="mt-1 text-xs text-muted">
              {page.page?.hasForm
                ? 'Wera fills what it knows from your details, earlier answers and resume, and lists the rest for you. It never submits.'
                : "No application form found yet. Press the site's Apply button, then autofill."}
            </p>
            <BigButton className="mt-3 w-full" onClick={() => void scanAndMaybeFill(true)} busy={busy} disabled={!tab}>
              {!busy && <Zap className="size-4" />}
              {phase === 'scanning' ? 'Reading the form…' : phase === 'suggesting' ? 'Asking the AI…' : phase === 'filling' ? 'Filling…' : 'Autofill application'}
            </BigButton>
            <Button variant="ghost" className="mt-1.5 w-full" onClick={() => void scanPage()} disabled={busy || !tab}>
              <ScanSearch className="size-3.5" /> Review the fields first
            </Button>
          </>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-good transition-all duration-300" style={{ width: `${rows.length ? (100 * done) / rows.length : 0}%` }} />
              </span>
              <span className="font-mono">{done}/{rows.length}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              {phase === 'scanning' ? 'Reading the form…'
                : phase === 'suggesting' ? 'Asking the AI about the fields your details do not cover…'
                : phase === 'filling' ? 'Filling, one field at a time…'
                : phase === 'continuing' ? 'Moving to the next page…'
                : phase === 'filled' ? `Filled ${filledCount}. Check the page, then approve it to move on.`
                : phase === 'final' ? `Filled ${filledCount}. Check the page; you submit it.`
                : `${ticked} ticked to fill. Untick anything, or change a value first. Wera never submits.`}
            </p>
          </>
        )}
      </Card>
      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="good">{notice}</Notice>}
      {resume && plan && rows.some((r) => r.value === RESUME) && (
        <p className="text-[11px] text-muted">
          Resume to attach: {resume.kind === 'tailored' ? `your copy tailored for ${page.job?.company ?? 'this job'}` : resume.kind === 'base' ? 'your main resume (tailor one in the Resume tab)' : 'your uploaded file'}.
        </p>
      )}

      {plan && (
        <>
          {toFill.length > 0 && (
            <Section icon={<CheckCircle2 className="size-3.5 text-good" />} title="Wera fills">
              {toFill.map((r) => <FieldRow key={r.id} {...rowProps(r)} />)}
            </Section>
          )}
          {questions.length > 0 && (
            <Section icon={<MessageSquareText className="size-3.5 text-accent-2" />} title="Questions">
              {questions.map((r) => (
                <Question key={r.id} r={r} api={api} page={page} memory={bank} posting={posting}
                  onAnswer={(value) => update(r.id, { value, checked: true, source: 'you' })} />
              ))}
            </Section>
          )}
          {needYou.length > 0 && (
            <Section icon={<Flag className="size-3.5 text-warn" />} title="Needs you">
              {needYou.map((r) => <FieldRow key={r.id} {...rowProps(r)} />)}
            </Section>
          )}
          {left.length > 0 && (
            <button className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-text" onClick={() => setShowLeft((v) => !v)}>
              <ChevronDown className={clsx('size-3 transition-transform', showLeft && 'rotate-180')} /> {left.length} optional field{left.length === 1 ? '' : 's'} left alone
            </button>
          )}
          {showLeft && <ul className="space-y-1.5">{left.map((r) => <FieldRow key={r.id} {...rowProps(r)} />)}</ul>}

          {phase === 'final' && (
            <Notice tone="info">
              {plan.next?.final ? <>This is the last page. Check everything, then press <b>{plan.next.label}</b> on the site yourself.</> : 'Check everything on the page, then submit it yourself.'}
            </Notice>
          )}
          {(phase === 'final' || phase === 'filled') && !page.submitted && <MarkApplied api={api} page={page} lead="Submitted it? Keep your tracker current." />}
          <a href={api.dashboardUrl('/profile#application')} target="_blank" rel="noreferrer" className="block text-[11px] text-accent hover:underline">
            Edit your application details and saved answers in Wera
          </a>

          <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t border-border bg-bg/95 p-2.5 backdrop-blur">
            {phase === 'filled' && plan.next && !plan.next.final ? (
              <>
                <Button variant="ghost" onClick={() => void scanPage()} disabled={busy} title="Read the page again"><RotateCcw className="size-3.5" /></Button>
                <Button variant="primary" className="flex-1" onClick={() => void continueOn()} busy={busy}>
                  Approve & continue <ArrowRight className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => void scanPage()} disabled={busy} title="Read the page again"><RotateCcw className="size-3.5" /></Button>
                {phase === 'final' || phase === 'filled' ? (
                  <Button variant="primary" className="flex-1" onClick={() => void fillRows(rows, plan)} busy={busy} disabled={!ticked}>Fill again</Button>
                ) : (
                  <BigButton className="flex-1" onClick={() => void fillRows(rows, plan)} busy={busy} disabled={!ticked}>
                    {!busy && <Zap className="size-4" />} Autofill {ticked} field{ticked === 1 ? '' : 's'}
                  </BigButton>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A field's name in the list: a job's or school's field says which ("Job 2 · Month (end)"). */
export function rowLabel(r: FieldPlan): string {
  const label = r.label || 'Field';
  if (r.entry == null || !r.purpose) return label;
  const what = r.purpose.startsWith('exp_') ? 'Job' : 'School';
  const when = /_(start)$/.test(r.purpose) ? ' (start)' : /_(end)$/.test(r.purpose) ? ' (end)' : '';
  return `${what} ${r.entry + 1} · ${label}${when && !/start|end|from|to\b/i.test(label) ? when : ''}`;
}

function StatusIcon({ r }: { r: Row }) {
  if (r.status === 'filling') return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent" aria-label="Filling" />;
  if (r.status === 'filled') return <CheckCircle2 className="size-3.5 shrink-0 text-good" aria-label="Filled" />;
  if (r.status === 'already') return <CheckCircle2 className="size-3.5 shrink-0 text-faint" aria-label="Already filled" />;
  if (r.status === 'review') return <AlertTriangle className="size-3.5 shrink-0 text-warn" aria-label="Check it" />;
  return <Circle className="size-3.5 shrink-0 text-border" aria-hidden />;
}

/** One field: tick it, change what Wera enters, see where the value came from and how filling went. */
function FieldRow({ r, onChange, onFind, disabled, onWriteLetter, writingLetter }: {
  r: Row; onChange: (p: Partial<Row>) => void; onFind: () => void; disabled: boolean; onWriteLetter?: () => void; writingLetter?: boolean;
}) {
  const src = r.source ? SOURCE[r.source] : null;
  const name = rowLabel(r);
  const file = r.value === RESUME || r.value === LETTER;
  const consent = r.group === 'consent';
  const set = (value: string) => onChange({ value, checked: value !== '', source: r.source === 'details' && value === r.value ? r.source : 'you' });
  // How filling went (when it says more than the value), else what the page shows, else why the value.
  const result = r.status && r.status !== 'filling' && r.result && r.result !== r.value ? r.result : '';
  const line = result || (r.current && r.current !== r.value && !r.status ? `The page shows "${r.current}"` : '') || r.note || '';
  return (
    <li className={clsx('rounded-lg border bg-surface px-2.5 py-2 text-xs transition-colors', r.status === 'filled' ? 'border-good/30' : r.status === 'review' ? 'border-warn/40' : 'border-border')}>
      <div className="flex items-center gap-2">
        <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={r.checked} disabled={disabled || consent || r.value === ''}
          onChange={(e) => onChange({ checked: e.target.checked })} aria-label={`Fill ${name}`} />
        <button type="button" className="min-w-0 flex-1 truncate text-left text-text hover:underline" title={`${name}: show it on the page`} aria-label={`Show ${r.label ? name : 'this field'} on the page`} onClick={onFind}>
          {name}{r.required && <span className="text-bad"> *</span>}
        </button>
        {r.group === 'self_id' && <span className="rounded bg-surface-2 px-1 text-[10px] text-faint" title="Voluntary self-identification, from your choices in Wera">Self-ID</span>}
        {src && (
          <span className={clsx('inline-flex shrink-0 items-center gap-0.5 text-[10px]', src.cls)} title={r.note || src.label}>
            <src.Icon className="size-3" /> {src.label}{r.confidence === 'low' ? '?' : ''}
          </span>
        )}
        <StatusIcon r={r} />
      </div>
      {onWriteLetter && (
        <div className="mt-1.5 pl-5.5">
          <Button onClick={onWriteLetter} busy={writingLetter} disabled={disabled} title="Uses a little of your monthly AI budget">
            <Sparkles className="size-3.5" /> Write my cover letter
          </Button>
        </div>
      )}
      {!consent && !file && !onWriteLetter && (
        <div className="mt-1.5 pl-5.5">
          {r.options.length > 0 ? (
            <select className={`${INPUT} py-1 text-xs`} value={r.value} disabled={disabled} onChange={(e) => set(e.target.value)} aria-label={`Value for ${name}`}>
              <option value="">Leave empty</option>
              {r.value && !r.options.includes(r.value) && <option value={r.value}>{r.value}</option>}
              {r.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className={`${INPUT} py-1 text-xs`} value={r.value} disabled={disabled} placeholder={r.kind === 'checkbox' ? 'yes to tick it' : 'Type a value to fill'}
              onChange={(e) => set(e.target.value)} aria-label={`Value for ${name}`} />
          )}
        </div>
      )}
      {line && <p className={clsx('mt-1 truncate pl-5.5 text-[11px]', r.status === 'review' ? 'text-warn' : 'text-faint')}>{line}</p>}
    </li>
  );
}

function Question({ r, api, page, memory, posting, onAnswer }: {
  r: Row; api: WeraApi; page: Page; memory: SavedAnswer[]; posting?: { company: string; title: string; description: string }; onAnswer: (v: string) => void;
}) {
  const [text, setText] = useState(r.value);
  const [writing, setWriting] = useState(r.value !== '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [inserted, setInserted] = useState(false);
  const earlier = matchAnswers(memory, r.label).filter((a) => a.answer !== text);
  const insertNow = async () => {
    if (!page.tab) return;
    const x = await insert(page.tab, r.id, text);
    setInserted(x.ok);
    if (x.ok) {
      onAnswer(text);
      // Remembered in Wera for the next form with this question.
      if (text.trim().length >= 20) await api.saveAnswers([{ question: r.label, answer: text, kind: 'long', company: page.job?.company ?? posting?.company ?? '' }]).catch(() => {});
    }
  };
  const draft = async () => {
    setBusy(true);
    setNote('');
    try {
      // A box with a character limit gets an answer that fits (about 7 characters a word).
      const words = r.maxLength ? Math.max(25, Math.min(300, Math.floor(r.maxLength / 7))) : 150;
      const a = await api.answer(r.label, page.job?.id ?? null, words, posting);
      if (a.needs_input) setNote(`Add yourself: ${a.needs_input}`);
      else {
        setText(a.answer ?? '');
        setWriting(true);
      }
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-lg border border-border bg-surface-2/40 p-2.5">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs font-medium text-text">{r.label}{r.required && <span className="text-bad"> *</span>}</p>
        <StatusIcon r={inserted ? { ...r, status: 'filled' } : r} />
      </div>
      {writing ? (
        <>
          <textarea className={`${INPUT} mt-2 h-28 resize-y`} value={text} onChange={(e) => { setText(e.target.value); setInserted(false); }} aria-label={`Answer to ${r.label}`} />
          {r.maxLength ? <p className="text-right text-[10px] text-faint">{text.length}/{r.maxLength}</p> : null}
          <div className="mt-1.5 flex gap-2">
            <Button variant="primary" onClick={() => void insertNow()} disabled={!text.trim()}>{inserted ? 'Inserted' : 'Insert into form'}</Button>
            <Button variant="ghost" onClick={() => void draft()} busy={busy}>Redraft</Button>
          </div>
        </>
      ) : (
        <>
          {earlier.length > 0 && (
            <div className="mt-2 space-y-1">
              {earlier.map((a, i) => (
                <button key={i} type="button" onClick={() => { setText(a.answer); setWriting(true); }}
                  className="block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-left hover:border-accent/40">
                  <span className="flex items-center gap-1 text-[10px] font-medium text-accent"><History className="size-3" /> Your answer{a.company ? ` for ${a.company}` : ''}, {ago(a.at)}</span>
                  <span className="line-clamp-2 text-[11px] text-muted">{a.answer}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button onClick={() => void draft()} busy={busy}><Sparkles className="size-3.5" /> {earlier.length ? 'Draft a new one' : 'Draft an answer'}</Button>
            <Button variant="ghost" onClick={() => setWriting(true)}>Write my own</Button>
          </div>
        </>
      )}
      {note && <p className="mt-1.5 text-[11px] text-warn">{note}</p>}
    </li>
  );
}

/** Wera marked the job applied when the site confirmed it: say so, with an undo. */
function AutoApplied({ api, page }: { api: WeraApi; page: Page }) {
  const job = page.job!;
  const [busy, setBusy] = useState(false);
  const previous = (page.autoApplied?.previous ?? 'saved') as ApplicationStatus;
  if (job.application_status !== 'applied') return null;
  const undo = async () => {
    setBusy(true);
    try {
      page.setJob(await api.setStatus(job.id, previous === 'applied' ? 'saved' : previous));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-good/30 bg-good/[0.07] p-3 text-xs">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-text"><PartyPopper className="size-4 text-accent" /> Application sent. Marked as applied.</p>
      <p className="mt-1 text-muted">{job.title} at {job.company} is in Applied in your Wera tracker. Good luck!</p>
      <div className="mt-2 flex gap-3">
        <a href={api.dashboardUrl('/tracker')} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Open the tracker</a>
        <button type="button" className="text-faint hover:text-text" onClick={() => void undo()} disabled={busy}>Undo</button>
      </div>
    </div>
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

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{icon} {title}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}
