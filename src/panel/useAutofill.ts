// Wera's autofill, as the panel runs it on an application page: read the
// form in every frame, fill what Wera knows at once (details, resume,
// earlier answers), then ask the AI about what is left in parallel and
// fill its sure answers as each batch lands, and draft the open questions.
// Wera never submits; what it could not settle is listed for the user.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type ResumeFile, type SuggestField, type Suggestion, type WeraApi } from '../shared/api';
import { bestAnswer, type SavedAnswer } from '../shared/answers';
import { loadFlow, saveFlow, type Flow } from '../shared/flow';
import { frames } from '../shared/rpc';
import type { Settings } from '../shared/settings';
import type { Applicant, FieldPlan, FillResult, FillStatus, PagePlan, Profile } from '../shared/types';
import { answersToLearn, detailsToLearn } from './learn';
import type { PanelEvent, PanelPageState } from './usePanelPage';
import { errorText } from './ui';

// The markers the page script fills a file or the letter for (see content/plan.ts).
export const RESUME = '__resume__';
export const LETTER = '__letter__';

/** One field as the panel tracks it: the plan, what Wera will enter, and how filling went. */
export interface Row extends FieldPlan {
  /** Filled when Wera fills the page (a value Wera trusts). */
  checked: boolean;
  status?: FillStatus | 'filling';
  result?: string;
  /** Wera drafted this answer (an open question): the user should read it. */
  drafted?: boolean;
}

export type Phase = 'idle' | 'reading' | 'filling' | 'thinking' | 'filled' | 'continuing' | 'final';

/** The rows for a plan: values Wera trusts are filled; what the page already shows is left. */
export function rowsFor(plan: PagePlan, sources: Record<string, string> = {}): Row[] {
  return plan.fields.map((f) => ({
    ...f,
    source: f.source === 'details' && f.purpose && sources[f.purpose] ? (sources[f.purpose] === 'resume' ? 'resume' : 'profile') : f.source,
    checked: f.value !== '' && f.group !== 'consent' && f.current === '',
    status: f.current !== '' && f.current === f.value ? 'already' : undefined,
  }));
}

/** Fields worth asking the AI about: empty, not answered by anything Wera knows, and not the user's to answer. */
export function needsSuggestion(r: Row): boolean {
  return r.value === '' && r.current === '' && r.entry == null && (r.group === 'details' || r.group === 'other' || (r.group === 'questions' && r.kind !== 'textarea'))
    && r.kind !== 'file' && r.kind !== 'checkbox';
}

/** Open questions Wera drafts an answer for: an empty text area asking something (not the cover letter). */
export function needsDraft(r: Row): boolean {
  return r.group === 'questions' && r.kind === 'textarea' && r.purpose === 'question' && r.value === '' && r.current === '' && r.label.trim().length >= 8;
}

/**
 * What still needs the user once Wera is done: required fields left
 * empty or that did not take, self-identification not in their profile,
 * consents, AI guesses to confirm, and answers Wera drafted.
 */
export function needsYou(rows: Row[]): Row[] {
  return rows.filter((r) => {
    if (r.status === 'filled' && r.drafted) return true;
    if (r.status === 'filled' || r.status === 'already') return false;
    if (r.status === 'review') return true;
    if (r.source === 'ai' && r.value && !r.checked) return true;
    return r.group === 'consent' || r.group === 'self_id' || (r.required && r.current === '');
  });
}

// AI answers given in this page's life, by field, so reading the page again does not ask again.
const suggested = new Map<string, Suggestion | null>();
const suggestKey = (r: FieldPlan) => `${location.host}|${r.label}|${r.kind}|${r.options.join('/')}`;

/** Whether an AI answer can be what the field asks for: a LinkedIn box takes a LinkedIn address, not any link from the resume. */
export function fitsPurpose(purpose: FieldPlan['purpose'], value: string): boolean {
  switch (purpose) {
    case 'linkedin':
      return /linkedin\.com\//i.test(value);
    case 'github':
      return /github\.com\//i.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    case 'phone':
      return (value.match(/\d/g) ?? []).length >= 7;
    default:
      return true;
  }
}

/** Runs fn over items, at most n at a time. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
  }));
}

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export function useAutofill(api: WeraApi, page: PanelPageState, settings: Settings, tabId: number | null, revealDelay = 700) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<PagePlan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resume, setResume] = useState<ResumeFile | null>(null);
  const [letter, setLetter] = useState('');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [thinking, setThinking] = useState(0);
  const applicant = useRef<Applicant | null>(null);
  const bank = useRef<SavedAnswer[]>([]);
  const reading = useRef<{ profile: Profile; known: { question: string; answer: string }[]; resumeName?: string; hasLetter: boolean; sources: Record<string, string> } | null>(null);
  const addedBlocks = useRef(false);
  // The resume and letter as last read: a fill started in the same run as the read must see them.
  const files = useRef<{ resume: ResumeFile | null; letter: string }>({ resume: null, letter: '' });
  // The rows as last rendered, for work that finishes after several updates.
  const latest = useRef<Row[]>([]);
  useEffect(() => {
    latest.current = rows;
  });
  const counted = useRef(false);
  const host = location.host;
  const jobId = page.job?.id ?? null;
  const posting = useMemo(() => ({
    company: page.job?.company ?? page.info?.draft?.company ?? page.handle.company,
    title: page.job?.title ?? (page.info?.draft?.title || page.handle.title || document.title),
    description: page.info?.draft?.description || page.info?.text || '',
  }), [page.job, page.info, page.handle]);

  const merge = useCallback((got: Row[]) => {
    const by = new Map(got.map((r) => [r.id, r]));
    setRows((rs) => rs.map((r) => by.get(r.id) ?? r));
  }, []);

  /** Reads the form in every frame (and adds job and school blocks the resume needs, once). */
  const read = useCallback(async (): Promise<{ plan: PagePlan; rows: Row[] } | null> => {
    setPhase('reading');
    setError('');
    try {
      const [view, saved, file, cover] = await Promise.all([
        api.applicant(),
        api.answers().catch(() => [] as SavedAnswer[]),
        api.resumeFile(jobId).catch(() => null),
        jobId != null ? api.coverLetter(jobId).catch(() => null) : Promise.resolve(null),
      ]);
      applicant.current = view.applicant;
      bank.current = saved;
      files.current = { resume: file, letter: cover?.body ?? '' };
      setResume(file);
      setLetter(cover?.body ?? '');
      const profile: Profile = { ...view.applicant, experience: view.experience, education: view.education, skills: view.skills };
      const known = saved.map((s) => ({ question: s.question, answer: s.answer }));
      reading.current = { profile, known, resumeName: file?.name, hasLetter: !!cover?.body, sources: view.sources };
      let p = await frames<PagePlan>('scan', profile, known, file?.name, !!cover?.body);
      if (p.adders?.length && !addedBlocks.current) {
        addedBlocks.current = true;
        let added = 0;
        for (const ad of p.adders) added += await frames<number>('add-entries', ad.frameId ?? 0, ad.section, ad.missing);
        if (added) {
          await new Promise((r) => setTimeout(r, 400));
          p = await frames<PagePlan>('scan', profile, known, file?.name, !!cover?.body);
        }
      }
      const next = rowsFor(p, view.sources);
      setPlan(p);
      setRows(next);
      return { plan: p, rows: next };
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Your Wera connection ended: sign in again.' : errorText(e));
      setPhase('idle');
      return null;
    }
  }, [api, jobId]);

  /** The job this application is for in Wera: the page's, else its posting saved now so the application shows up. */
  const ensureJob = useCallback(async (): Promise<number | null> => {
    if (jobId != null) return jobId;
    const draft = page.info?.draft ?? page.handle.draft;
    if (!draft?.title || !draft.company) return null;
    try {
      const j = await api.addJob(draft);
      page.setJob(j);
      setNotice(`Saved ${j.title} at ${j.company} to your Wera lists, so this application shows up there.`);
      return j.id;
    } catch {
      return null;
    }
  }, [api, jobId, page]);

  /** Fills rows in the page; each ticks off as its frame reports it. Returns the results. */
  const fill = useCallback(async (list: Row[]): Promise<FillResult[]> => {
    const items = list.filter((r) => r.checked && r.value !== '').map((r) => ({ id: r.id, value: r.value, label: r.label, kind: r.kind }));
    if (!items.length) return [];
    const queued = new Set(items.map((i) => i.id));
    setRows((rs) => rs.map((r) => (queued.has(r.id) ? { ...r, status: 'filling', result: undefined } : r)));
    const forJob = await ensureJob();
    const wantsLetterFile = list.some((r) => r.checked && r.value === LETTER && r.kind === 'file');
    const letterFile = wantsLetterFile && forJob != null ? await api.coverLetterPdf(forJob).catch(() => null) : null;
    const { resume: file, letter: body } = files.current;
    const results = await frames<FillResult[]>('apply', items, file ?? undefined, body || undefined, 30, letterFile ?? undefined);
    const by = new Map(results.map((x) => [x.id, x]));
    setRows((rs) => rs.map((r) => {
      const x = by.get(r.id);
      return x ? { ...r, status: x.status, result: x.note ?? x.value } : r;
    }));
    return results;
  }, [api, ensureJob]);

  /** Asks the AI about what Wera's details left empty, in parallel batches; fills sure answers as each lands. */
  const suggestAndFill = useCallback(async (list: Row[]) => {
    const ask = list.filter(needsSuggestion);
    if (!settings.aiSuggest || !ask.length) return;
    const fresh = ask.filter((r) => !suggested.has(suggestKey(r)));
    const answered = async (batch: Row[]) => {
      const out: Row[] = [];
      for (const r of batch) {
        const s = suggested.get(suggestKey(r));
        if (s && fitsPurpose(r.purpose, s.value)) out.push({ ...r, value: s.value, source: 'ai', confidence: s.confidence, note: s.why || (s.confidence === 'low' ? 'a guess: check it' : ''), checked: s.confidence === 'high' });
      }
      if (!out.length) return;
      merge(out);
      await fill(out.filter((r) => r.checked));
    };
    // Answers from earlier in this page's life first, then new ones, eight fields to a request.
    await answered(ask.filter((r) => suggested.has(suggestKey(r))));
    await Promise.all(chunk(fresh, 8).map(async (batch) => {
      const fields: SuggestField[] = batch.map((r) => ({ id: r.id, label: r.label, kind: r.kind, options: r.options.length ? r.options : undefined, required: r.required || undefined, max_length: r.maxLength }));
      const got = await api.suggest(fields, jobId, posting).then((x) => x.answers).catch(() => null);
      if (!got) return;
      const byId = new Map(got.map((s) => [s.id, s]));
      for (const r of batch) suggested.set(suggestKey(r), byId.get(r.id) ?? null);
      await answered(batch);
    }));
  }, [api, fill, jobId, merge, posting, settings.aiSuggest]);

  /** Answers open questions: the user's earlier answer when the question matches, else a draft (three at a time). */
  const draftAndFill = useCallback(async (list: Row[]) => {
    const open = list.filter(needsDraft);
    if (!open.length) return;
    const fromBank: Row[] = [];
    const toDraft: Row[] = [];
    for (const r of open) {
      const hit = bestAnswer(bank.current, r.label);
      if (hit && hit.answer.length >= 20) fromBank.push({ ...r, value: hit.answer, source: 'saved', note: 'your earlier answer', checked: true });
      else toDraft.push(r);
    }
    if (fromBank.length) {
      merge(fromBank);
      await fill(fromBank);
    }
    if (!settings.aiQuestions) return;
    await pool(toDraft, 3, async (r) => {
      const words = r.maxLength ? Math.max(25, Math.min(300, Math.floor(r.maxLength / 7))) : 150;
      const a = await api.answer(r.label, jobId, words, posting).catch(() => null);
      if (!a?.answer) {
        if (a?.needs_input) merge([{ ...r, note: `add yourself: ${a.needs_input}` }]);
        return;
      }
      const row: Row = { ...r, value: a.answer, source: 'ai', note: 'drafted by Wera: read it', checked: true, drafted: true };
      merge([row]);
      await fill([row]);
    });
  }, [api, fill, jobId, merge, posting, settings.aiQuestions]);

  /** Learns from the page as the user left it: answers for next time, and details Wera lacked. */
  const learn = useCallback(async (list: Row[]) => {
    if (!settings.learn || !list.length) return;
    const snap = await frames<Parameters<typeof answersToLearn>[1]>('snapshot').catch(() => []);
    const answers = answersToLearn(list, snap, bank.current, posting.company);
    const details = applicant.current ? detailsToLearn(list, snap, applicant.current) : {};
    if (answers.length) await api.saveAnswers(answers).catch(() => {});
    if (Object.keys(details).length && applicant.current) {
      const merged = { ...applicant.current, ...details };
      await api.saveApplicant(merged).then(() => {
        applicant.current = merged;
      }).catch(() => {});
    }
  }, [api, posting.company, settings.learn]);

  /** Counts the page (once) in Wera's record of this application. */
  const count = useCallback(async (filled: number, fromAI: number, forJob: number | null) => {
    if (tabId == null || !filled || counted.current) return;
    counted.current = true;
    const f = (await loadFlow(tabId, host).catch(() => null)) ?? { runId: 0, host, jobId: forJob, pages: 1, continuing: false, at: Date.now() };
    const runId = f.runId
      ? (await api.addRunPage(f.runId, filled, fromAI).catch(() => null), f.runId)
      : (await api.startRun(host, forJob, filled, fromAI).catch(() => ({ id: 0 }))).id;
    const next = { ...f, runId, jobId: forJob ?? f.jobId, continuing: false };
    setFlow(next);
    await saveFlow(tabId, next).catch(() => {});
  }, [api, host, tabId]);

  /** Autofill: read, fill what Wera knows, then the AI's answers and drafts as they come. */
  const autofill = useCallback(async () => {
    const got = await read();
    if (!got) return;
    setPhase('filling');
    try {
      const first = await fill(got.rows);
      // Answers can reveal more fields ("Race" once "Hispanic or Latino" is No): read again and fill the new ones.
      let all = got.rows;
      if (first.some((x) => x.status === 'filled') && reading.current) {
        await new Promise((r) => setTimeout(r, revealDelay));
        const r = reading.current;
        const again = await frames<PagePlan>('scan', r.profile, r.known, r.resumeName, r.hasLetter).catch(() => null);
        // New fields only: one the page merely re-rendered (a new mark, same label and kind) is not new.
        const seen = new Set(got.rows.flatMap((x) => [x.id, `${x.label}|${x.kind}`]));
        const fresh = again ? rowsFor(again, r.sources).filter((x) => !seen.has(x.id) && !seen.has(`${x.label}|${x.kind}`)) : [];
        if (fresh.length && again) {
          all = [...got.rows, ...fresh];
          setPlan(again);
          setRows((rs) => [...rs, ...fresh]);
          await fill(fresh);
        }
      }
      setPhase('thinking');
      setThinking(all.filter(needsSuggestion).length + all.filter(needsDraft).length);
      await Promise.all([suggestAndFill(all), draftAndFill(all)]);
      setThinking(0);
      const forJob = await ensureJob();
      const filled = latest.current.filter((x) => x.status === 'filled');
      await count(filled.length, filled.filter((x) => x.source === 'ai').length, forJob);
      page.clearNewStep();
      setPhase(!got.plan.next || got.plan.next.final ? 'final' : 'filled');
    } catch (e) {
      setError(errorText(e));
      setRows((rs) => rs.map((r) => (r.status === 'filling' ? { ...r, status: undefined } : r)));
      setPhase('idle');
    }
  }, [read, fill, revealDelay, suggestAndFill, draftAndFill, ensureJob, count, page]);

  /** Fills one value the user approved (an AI guess, or a choice they made in the panel). */
  const fillOne = useCallback(async (r: Row, value: string) => {
    const row = { ...r, value, checked: true, source: r.source ?? 'you' } as Row;
    merge([row]);
    await fill([row]).catch((e: unknown) => setError(errorText(e)));
  }, [fill, merge]);

  /** Approve & continue: learn, press Next, then fill the next page when it shows. */
  const continueOn = useCallback(async () => {
    if (!plan?.next) return;
    setPhase('continuing');
    setError('');
    page.clearNewStep();
    await learn(rows);
    const r = await frames<{ ok: boolean; final?: boolean }>('next', plan.next.id).catch(() => ({ ok: false, final: false }));
    if (!r.ok) {
      if (r.final) setPhase('final');
      else {
        setError("Wera couldn't press the page's Next button. Press it yourself, and Wera fills the next page.");
        setPhase('filled');
      }
      return;
    }
    counted.current = false;
    addedBlocks.current = false;
    if (tabId != null) {
      const f = (await loadFlow(tabId, host).catch(() => null)) ?? flow ?? { runId: 0, host, jobId, pages: 1, continuing: false, at: Date.now() };
      const next = { ...f, continuing: true, pages: f.pages + 1 };
      setFlow(next);
      await saveFlow(tabId, next).catch(() => {});
    }
  }, [plan, page, learn, rows, tabId, host, flow, jobId]);

  // Each field a frame fills is reported as it lands.
  useEffect(() => {
    const onMessage = (msg: PanelEvent) => {
      if (msg?.type !== 'wera:frame-event' || msg.event.type !== 'wera:fill-progress') return;
      const res = msg.event.result;
      setRows((rs) => rs.map((r) => (r.id === res.id ? { ...r, status: res.status, result: res.note ?? res.value } : r)));
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // After Continue: a page that loaded anew fills itself (when the user asked for that); a step shown in place too.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || tabId == null || page.loading || !page.info?.hasForm) return;
    started.current = true;
    void (async () => {
      const f = await loadFlow(tabId, host).catch(() => null);
      setFlow(f);
      if (f?.continuing) {
        await saveFlow(tabId, { ...f, continuing: false }).catch(() => {});
        if (settings.autoContinue) await autofill();
      }
    })();
  }, [tabId, page.loading, page.info?.hasForm, host, settings.autoContinue, autofill]);
  useEffect(() => {
    if (phase === 'continuing' && page.newStep > 0 && settings.autoContinue) {
      // A step the page rendered on its own (an external change): fill it now.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void autofill();
    }
  }, [phase, page.newStep, settings.autoContinue, autofill]);
  // Still on the same step a while after Next: the site probably flagged something.
  useEffect(() => {
    if (phase !== 'continuing') return;
    const t = window.setTimeout(() => {
      setError('The page did not move on. It may want a field fixed (look for red marks), then press Continue again.');
      setPhase('filled');
    }, 8000);
    return () => window.clearTimeout(t);
  }, [phase]);

  /** Writes the cover letter (for a form that asks for one) and fills it. */
  const writeLetter = useCallback(async (): Promise<boolean> => {
    setError('');
    const forJob = await ensureJob();
    if (forJob == null) {
      setError('Save this job in Wera first, then Wera can write its letter.');
      return false;
    }
    try {
      const l = await api.writeCoverLetter(forJob);
      files.current = { ...files.current, letter: l.body };
      setLetter(l.body);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }, [api, ensureJob]);

  const busy = phase === 'reading' || phase === 'filling' || phase === 'thinking' || phase === 'continuing';
  return { phase, plan, rows, error, notice, resume, letter, flow, thinking, busy, autofill, fillOne, continueOn, writeLetter, learn, setNotice };
}
