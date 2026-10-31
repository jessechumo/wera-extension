// Wera's autofill, as the panel runs it on an application page: read the
// form in every frame, fill what Wera knows at once (details, resume,
// earlier answers), then ask the AI about what is left in parallel and
// fill its sure answers as each batch lands, and draft the open questions.
// Wera never submits; what it could not settle is listed for the user.
// Anything that fails along the way is said in the panel (warnings), and
// written to the log (Settings > Debug log, Copy diagnostics).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResumeFile, SuggestField, Suggestion, WeraApi } from '../shared/api';
import { bestAnswer, type SavedAnswer } from '../shared/answers';
import { describeError } from '../shared/errors';
import { loadFlow, saveFlow, type Flow } from '../shared/flow';
import { log } from '../shared/log';
import { frames } from '../shared/rpc';
import type { Settings } from '../shared/settings';
import type { Applicant, FillResult, JobDraft, PagePlan, Profile, ScanRequest } from '../shared/types';
import { answersToLearn } from '../shared/learn';
import { chunk, fitsPurpose, LETTER, needsDraft, needsLetter, needsSuggestion, pool, readsLikeAnswer, rowsFor, type Row } from './rows';
import type { PanelEvent, PanelPageState } from './usePanelPage';

export { needsYou, type Row } from './rows';
export { LETTER, RESUME } from './rows';

export type Phase = 'idle' | 'reading' | 'filling' | 'thinking' | 'filled' | 'continuing' | 'final';

// AI answers given in this page's life, by field, so reading the page again does not ask again.
const suggested = new Map<string, Suggestion | null>();
const suggestKey = (r: Row) => `${location.host}|${r.label}|${r.kind}|${r.options.join('/')}`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useAutofill(api: WeraApi, page: PanelPageState, settings: Settings, tabId: number | null, revealDelay = 700) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<PagePlan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  // Problems that did not stop the fill ("your resume could not be loaded"), each said once.
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [resume, setResume] = useState<ResumeFile | null>(null);
  const [letter, setLetter] = useState('');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [thinking, setThinking] = useState(0);
  // The employer asks for no AI, and the user chose to have Wera draft anyway.
  const [draftAnyway, setDraftAnyway] = useState(false);
  const noAiHere = useMemo(() => [...(page.info?.traps ?? []), ...(plan?.traps ?? [])].some((t) => t.kind === 'ai_policy'), [page.info?.traps, plan?.traps]);
  const applicant = useRef<Applicant | null>(null);
  const bank = useRef<SavedAnswer[]>([]);
  const scanReq = useRef<ScanRequest | null>(null);
  const sources = useRef<Record<string, string>>({});
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
    location: page.job?.location_summary ?? page.job?.location_raw ?? page.info?.draft?.location ?? page.handle.draft?.location ?? '',
  }), [page.job, page.info, page.handle]);

  const warn = useCallback((msg: string, cause?: unknown) => {
    log.warn('autofill', msg, cause);
    setWarnings((w) => (w.includes(msg) ? w : [...w, msg]));
  }, []);

  const merge = useCallback((got: Row[]) => {
    const by = new Map(got.map((r) => [r.id, r]));
    setRows((rs) => rs.map((r) => by.get(r.id) ?? r));
  }, []);

  /** Reads the form in every frame (and adds job and school blocks the resume needs, once). */
  const read = useCallback(async (): Promise<{ plan: PagePlan; rows: Row[] } | null> => {
    setPhase('reading');
    setError('');
    setWarnings([]);
    try {
      const [view, saved, file, cover] = await Promise.all([
        api.applicant(),
        api.answers().catch((e: unknown) => {
          warn(describeError(e, "Couldn't load your earlier answers, so Wera fills without them"), e);
          return [] as SavedAnswer[];
        }),
        api.resumeFile(jobId).catch((e: unknown) => {
          warn(describeError(e, "Couldn't load your resume, so Wera won't attach it"), e);
          return null;
        }),
        jobId != null ? api.coverLetter(jobId).catch((e: unknown) => {
          warn(describeError(e, "Couldn't load this job's cover letter"), e);
          return null;
        }) : Promise.resolve(null),
      ]);
      applicant.current = view.applicant;
      bank.current = saved;
      sources.current = view.sources;
      files.current = { resume: file, letter: cover?.body ?? '' };
      setResume(file);
      setLetter(cover?.body ?? '');
      const profile: Profile = { ...view.applicant, experience: view.experience, education: view.education, skills: view.skills };
      const req: ScanRequest = {
        profile, answers: saved.map((s) => ({ question: s.question, answer: s.answer, company: s.company })),
        resumeName: file?.name, coverLetter: !!cover?.body, company: posting.company || undefined, jobLocation: posting.location || undefined,
      };
      scanReq.current = req;
      let p = await frames('scan', req);
      if (p.adders?.length && !addedBlocks.current) {
        addedBlocks.current = true;
        let added = 0;
        for (const ad of p.adders) added += await frames('add-entries', ad.frameId ?? 0, ad.section, ad.missing);
        if (added) {
          log.info('autofill', `added ${added} job/school block(s) for the resume`);
          await wait(400);
          p = await frames('scan', req);
        }
      }
      const next = rowsFor(p, view.sources);
      log.info('autofill', `read ${next.length} fields; Wera knows ${next.filter((r) => r.checked).length}`);
      setPlan(p);
      setRows(next);
      return { plan: p, rows: next };
    } catch (e) {
      log.error('autofill', 'reading the form failed', e);
      setError(describeError(e, "Couldn't read this application"));
      setPhase('idle');
      return null;
    }
  }, [api, jobId, posting.company, posting.location, warn]);

  /**
   * The page's posting as Wera can save it: its job data, else what the
   * AI reads off the page, else its title and text (a Greenhouse form has
   * no job data, and a job must be saved to write its letter).
   */
  const draftOfPage = useCallback(async (): Promise<JobDraft | null> => {
    const data = page.info?.draft ?? page.handle.draft;
    if (data?.title && data.company) return data;
    const text = page.info?.text ?? '';
    const read = text.length >= 200 ? await api.extract(location.href, document.title, text).catch((e: unknown) => {
      log.warn('autofill', 'reading the posting failed', e);
      return null;
    }) : null;
    if (read?.is_job_posting && read.title && read.company) return read;
    if (!posting.title || !posting.company || posting.description.length < 200) return null;
    return { url: location.href, company: posting.company, title: posting.title, location: posting.location, work_mode: '', employment_type: '', department: '', salary: '', industry: '', description: posting.description, source: 'page-data' };
  }, [api, page.handle.draft, page.info?.draft, page.info?.text, posting]);

  /** The job this application is for in Wera: the page's, else its posting saved now so the application shows up. */
  const ensureJob = useCallback(async (): Promise<number | null> => {
    if (jobId != null) return jobId;
    const draft = await draftOfPage();
    if (!draft) return null;
    try {
      const j = await api.addJob(draft);
      page.setJob(j);
      setNotice(`Saved ${j.title} at ${j.company} to your Wera lists, so this application shows up there.`);
      return j.id;
    } catch (e) {
      warn(describeError(e, "Couldn't save this job to your Wera lists"), e);
      return null;
    }
  }, [api, draftOfPage, jobId, page, warn]);

  /** Fills rows in the page; each ticks off as its frame reports it. Returns the results. */
  const fill = useCallback(async (list: Row[]): Promise<FillResult[]> => {
    const items = list.filter((r) => r.checked && r.value !== '').map((r) => ({ id: r.id, value: r.value, label: r.label, kind: r.kind }));
    if (!items.length) return [];
    const queued = new Set(items.map((i) => i.id));
    setRows((rs) => rs.map((r) => (queued.has(r.id) ? { ...r, status: 'filling', result: undefined } : r)));
    const wantsLetterFile = list.some((r) => r.checked && r.value === LETTER && r.kind === 'file');
    const forJob = wantsLetterFile ? await ensureJob() : jobId;
    const letterFile = wantsLetterFile && forJob != null ? await api.coverLetterPdf(forJob).catch((e: unknown) => {
      warn(describeError(e, "Couldn't make the cover letter PDF"), e);
      return null;
    }) : null;
    const { resume: file, letter: body } = files.current;
    const results = await frames('apply', { items, resume: file ?? undefined, coverLetter: body || undefined, letterFile: letterFile ?? undefined, pace: 30 });
    const by = new Map(results.map((x) => [x.id, x]));
    setRows((rs) => rs.map((r) => {
      const x = by.get(r.id);
      return x ? { ...r, status: x.status, result: x.note ?? x.value } : r;
    }));
    const missed = results.filter((x) => x.status === 'review');
    if (missed.length) log.info('autofill', `${missed.length} field(s) to check`, missed.map((x) => `${x.label}: ${x.note ?? ''}`));
    return results;
  }, [api, ensureJob, jobId, warn]);

  /** Asks the AI about what Wera's details left empty, in parallel batches; fills sure answers as each lands. */
  const suggestAndFill = useCallback(async (list: Row[]) => {
    let ask = list.filter(needsSuggestion);
    if (!settings.aiSuggest || !ask.length) return;
    // Dropdowns that list their choices only once opened: read them first, so the AI picks from the real list.
    const blind = ask.filter((r) => (r.kind === 'listbox' || r.kind === 'combobox') && !r.options.length && !suggested.has(suggestKey(r)));
    if (blind.length) {
      const opts: Record<string, string[]> = await frames('options', blind.map((r) => r.id)).catch((e: unknown) => {
        log.warn('autofill', 'reading dropdown choices failed', e);
        return {};
      });
      ask = ask.map((r) => (opts[r.id]?.length ? { ...r, options: opts[r.id]! } : r));
    }
    const fresh = ask.filter((r) => !suggested.has(suggestKey(r)));
    const answered = async (batch: Row[]) => {
      const out: Row[] = [];
      for (const r of batch) {
        const s = suggested.get(suggestKey(r));
        if (s && fitsPurpose(r.purpose, s.value) && readsLikeAnswer(r, s.value)) out.push({ ...r, value: s.value, source: 'ai', confidence: s.confidence, note: s.why || (s.confidence === 'low' ? 'a guess: check it' : ''), checked: s.confidence === 'high' });
      }
      if (!out.length) return;
      merge(out);
      await fill(out.filter((r) => r.checked));
    };
    // Answers from earlier in this page's life first, then new ones, eight fields to a request.
    await answered(ask.filter((r) => suggested.has(suggestKey(r))));
    let failed = 0;
    let cause: unknown = null;
    await Promise.all(chunk(fresh, 8).map(async (batch) => {
      const fields: SuggestField[] = batch.map((r) => ({ id: r.id, label: r.label, kind: r.kind, options: r.options.length ? r.options : undefined, required: r.required || undefined, max_length: r.maxLength }));
      const got = await api.suggest(fields, jobId, posting).then((x) => x.answers).catch((e: unknown) => {
        failed += batch.length;
        cause = e;
        return null;
      });
      if (!got) return;
      const byId = new Map(got.map((s) => [s.id, s]));
      for (const r of batch) suggested.set(suggestKey(r), byId.get(r.id) ?? null);
      await answered(batch);
    }));
    if (failed) warn(describeError(cause, `Wera's AI couldn't answer ${failed} field${failed === 1 ? '' : 's'}; they are listed below`), cause);
  }, [api, fill, jobId, merge, posting, settings.aiSuggest, warn]);

  /** Answers open questions: the user's earlier answer when the question matches, else a draft (three at a time). */
  const draftAndFill = useCallback(async (list: Row[], anyway = draftAnyway) => {
    const open = list.filter(needsDraft);
    if (!open.length) return;
    const fromBank: Row[] = [];
    const toDraft: Row[] = [];
    for (const r of open) {
      const hit = bestAnswer(bank.current, r.label, 0.75, posting.company);
      if (hit && hit.answer.length >= 20) fromBank.push({ ...r, value: hit.answer, source: 'saved', note: 'your earlier answer', checked: true });
      else toDraft.push(r);
    }
    if (fromBank.length) {
      merge(fromBank);
      await fill(fromBank);
    }
    if (!settings.aiQuestions) return;
    if (noAiHere && !anyway) {
      merge(toDraft.map((r) => ({ ...r, note: 'the employer asks for your own words here: write it yourself' })));
      return;
    }
    let failed = 0;
    let cause: unknown = null;
    await pool(toDraft, 3, async (r) => {
      const words = r.maxLength ? Math.max(25, Math.min(300, Math.floor(r.maxLength / 7))) : 150;
      const a = await api.answer(r.label, jobId, words, posting).catch((e: unknown) => {
        failed++;
        cause = e;
        return null;
      });
      if (!a?.answer || !readsLikeAnswer(r, a.answer)) {
        if (a?.needs_input) merge([{ ...r, note: `add yourself: ${a.needs_input}` }]);
        return;
      }
      const row: Row = { ...r, value: a.answer, source: 'ai', note: 'drafted by Wera: read it', checked: true, drafted: true };
      merge([row]);
      await fill([row]);
    });
    if (failed) warn(describeError(cause, `Wera couldn't draft ${failed} answer${failed === 1 ? '' : 's'}; write ${failed === 1 ? 'it' : 'them'} on the form, or use the Wera button in the box`), cause);
  }, [api, draftAnyway, fill, jobId, merge, noAiHere, posting, settings.aiQuestions, warn]);

  /** The user read that the employer asks for no AI, and wants Wera's drafts all the same. */
  const draftDespitePolicy = useCallback(async () => {
    setDraftAnyway(true);
    setPhase('thinking');
    await draftAndFill(latest.current, true).catch((e: unknown) => setError(describeError(e, "Couldn't draft these answers")));
    setPhase('filled');
  }, [draftAndFill]);

  /**
   * A form that asks for a cover letter when this job has none yet: Wera
   * writes one for the job (from the resume and the posting) and attaches
   * it, as a PDF or in the box, for the user to read. Only when drafting
   * is on.
   */
  const letterAndFill = useCallback(async (list: Row[]) => {
    const want = list.filter(needsLetter);
    if (!want.length || files.current.letter || !settings.aiQuestions || (noAiHere && !draftAnyway)) return;
    const forJob = await ensureJob();
    if (forJob == null) {
      merge(want.map((r) => ({ ...r, note: 'save the job from its posting, then write its letter in the panel' })));
      return;
    }
    try {
      const l = await api.writeCoverLetter(forJob);
      files.current = { ...files.current, letter: l.body };
      setLetter(l.body);
      log.info('autofill', 'wrote a cover letter for this job');
    } catch (e) {
      warn(describeError(e, "Couldn't write a cover letter for this job; attach your own"), e);
      return;
    }
    const rows = want.map((r): Row => ({ ...r, value: LETTER, source: 'ai', note: 'Wera wrote this letter for this job: read it', checked: true, drafted: true }));
    merge(rows);
    await fill(rows);
  }, [api, draftAnyway, ensureJob, fill, merge, noAiHere, settings.aiQuestions, warn]);

  /** Remembers the page's answers for the next form (details are learned by the page itself, on Next or Submit). */
  const learn = useCallback(async (list: Row[]) => {
    if (!settings.learn || !list.length) return;
    try {
      const snap = await frames('snapshot');
      const answers = answersToLearn(list, snap, bank.current, posting.company);
      if (answers.length) {
        await api.saveAnswers(answers);
        log.info('autofill', `remembered ${answers.length} answer(s) for next time`);
      }
    } catch (e) {
      warn(describeError(e, "Couldn't save this page's answers for next time"), e);
    }
  }, [api, posting.company, settings.learn, warn]);

  /** Counts the page (once) in Wera's record of this application. */
  const count = useCallback(async (filled: number, fromAI: number, forJob: number | null) => {
    if (tabId == null || !filled || counted.current) return;
    counted.current = true;
    try {
      const f = (await loadFlow(tabId, host)) ?? { runId: 0, host, jobId: forJob, pages: 1, continuing: false, at: Date.now() };
      const runId = f.runId ? (await api.addRunPage(f.runId, filled, fromAI), f.runId) : (await api.startRun(host, forJob, filled, fromAI)).id;
      const next = { ...f, runId, jobId: forJob ?? f.jobId, continuing: false };
      setFlow(next);
      await saveFlow(tabId, next);
    } catch (e) {
      // Only the dashboard's record of autofills misses this page.
      log.warn('autofill', 'could not record the autofill run', e);
    }
  }, [api, host, tabId]);

  /** The page as it is now, once what went in has settled. */
  const rescan = useCallback(async (): Promise<PagePlan | null> => {
    const req = scanReq.current;
    if (!req) return null;
    await wait(revealDelay);
    return frames('scan', req).catch((e: unknown) => {
      log.warn('autofill', 'reading the page again failed', e);
      return null;
    });
  }, [revealDelay]);

  /** Fills the fields that appeared since ("Race" once "Hispanic or Latino" is No). Returns them. */
  const revealed = useCallback(async (now: PagePlan | null, known: Row[]): Promise<Row[]> => {
    if (!now) return [];
    // New fields only: one the page merely re-rendered (a new mark, same label and kind) is not new.
    const seen = new Set(known.flatMap((x) => [x.id, `${x.label}|${x.kind}`]));
    const fresh = rowsFor(now, sources.current).filter((x) => !seen.has(x.id) && !seen.has(`${x.label}|${x.kind}`));
    if (!fresh.length) return [];
    log.info('autofill', `${fresh.length} field(s) appeared after filling`);
    setPlan(now);
    setRows((rs) => [...rs, ...fresh]);
    await fill(fresh);
    return fresh;
  }, [fill]);

  /**
   * Checks what filled still shows: some pages empty a field when they
   * re-render or read a resume. A field left empty is filled once more,
   * and listed if it will not stay. Files are left out: many pages take
   * the file and drop the input it came through.
   */
  const repair = useCallback(async (now: PagePlan | null) => {
    if (!now) return;
    const emptied = (plan: PagePlan, list: Row[]) => {
      const shows = new Map(plan.fields.flatMap((f) => [[f.id, f.current], [`${f.label}|${f.kind}`, f.current]]));
      return list.filter((r) => r.status === 'filled' && r.group !== 'documents' && (shows.get(r.id) ?? shows.get(`${r.label}|${r.kind}`)) === '');
    };
    const lost = emptied(now, latest.current);
    if (!lost.length) return;
    log.info('autofill', `${lost.length} field(s) came back empty`, lost.map((r) => r.label));
    await fill(lost.map((r) => ({ ...r, checked: true })));
    const after = await rescan();
    if (!after) return;
    const gone = new Set(emptied(after, lost).map((r) => r.id));
    if (gone.size) setRows((rs) => rs.map((r) => (gone.has(r.id) ? { ...r, status: 'review', result: 'the page keeps clearing this: fill it yourself' } : r)));
  }, [fill, rescan]);

  /** Autofill: read, attach the files, fill what Wera knows, then the AI's answers and drafts as they come. */
  const autofill = useCallback(async () => {
    const got = await read();
    if (!got) return;
    setPhase('filling');
    try {
      // The files first: many systems read an uploaded resume and fill the form themselves, over what is there.
      const files = got.rows.filter((r) => r.group === 'documents');
      await fill(files);
      await fill(got.rows.filter((r) => r.group !== 'documents'));
      // Answers can reveal more fields, and so can the AI's below.
      let now = await rescan();
      const all = [...got.rows, ...(await revealed(now, got.rows))];
      setPhase('thinking');
      setThinking(all.filter(needsSuggestion).length + all.filter(needsDraft).length + (all.some(needsLetter) && settings.aiQuestions ? 1 : 0));
      await Promise.all([suggestAndFill(all), draftAndFill(all), letterAndFill(all)]);
      for (let round = 0; round < 2; round++) {
        now = await rescan();
        const more = await revealed(now, latest.current);
        if (!more.length) break;
        await Promise.all([suggestAndFill(more), draftAndFill(more)]);
      }
      setThinking(0);
      await repair(now);
      const forJob = await ensureJob();
      const filled = latest.current.filter((x) => x.status === 'filled');
      await count(filled.length, filled.filter((x) => x.source === 'ai').length, forJob);
      page.clearNewStep();
      setPhase(!got.plan.next || got.plan.next.final ? 'final' : 'filled');
    } catch (e) {
      log.error('autofill', 'filling failed', e);
      setError(describeError(e, 'Wera stopped filling'));
      setRows((rs) => rs.map((r) => (r.status === 'filling' ? { ...r, status: undefined } : r)));
      setPhase('idle');
    }
  }, [read, fill, rescan, revealed, repair, suggestAndFill, draftAndFill, letterAndFill, settings.aiQuestions, ensureJob, count, page]);

  /** Fills one value the user approved (an AI guess, or a choice they made in the panel). */
  const fillOne = useCallback(async (r: Row, value: string) => {
    const row = { ...r, value, checked: true, source: r.source ?? 'you' } as Row;
    merge([row]);
    await fill([row]).catch((e: unknown) => setError(describeError(e, `Couldn't fill "${r.label}"`)));
  }, [fill, merge]);

  /** Approve & continue: learn, press Next, then fill the next page when it shows. */
  const continueOn = useCallback(async () => {
    if (!plan?.next) return;
    setPhase('continuing');
    setError('');
    page.clearNewStep();
    await learn(rows);
    const r = await frames('next', plan.next.id).catch((e: unknown) => {
      log.warn('autofill', 'pressing Next failed', e);
      return { ok: false, final: false };
    });
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
      await saveFlow(tabId, next).catch((e: unknown) => log.warn('autofill', 'could not keep the application in progress', e));
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
      setError("Wera couldn't tell which job this is, so it can't write the letter. Save the job from its posting first.");
      return false;
    }
    try {
      const l = await api.writeCoverLetter(forJob);
      files.current = { ...files.current, letter: l.body };
      setLetter(l.body);
      return true;
    } catch (e) {
      setError(describeError(e, "Couldn't write the cover letter"));
      return false;
    }
  }, [api, ensureJob]);

  const busy = phase === 'reading' || phase === 'filling' || phase === 'thinking' || phase === 'continuing';
  return { phase, plan, rows, error, warnings, notice, resume, letter, flow, thinking, busy, noAiHere: noAiHere && !draftAnyway, autofill, fillOne, continueOn, writeLetter, learn, setNotice, draftDespitePolicy };
}
