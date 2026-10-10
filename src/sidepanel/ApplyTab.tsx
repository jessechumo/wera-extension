import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, MessageSquareText, Sparkles, Wand2 } from 'lucide-react';
import { ApiError, type WeraApi } from '../shared/api';
import type { FillResult } from '../shared/types';
import { fill, insert } from './page';
import { Button, Card, INPUT, Notice, errorText } from './ui';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

const NICE: Record<string, string> = {
  full_name: 'name', first_name: 'first name', last_name: 'last name', authorized_no_sponsorship: 'work authorization',
  needs_sponsorship: 'sponsorship', authorized_to_work: 'work authorization', how_heard: 'how you heard',
};

function Question({ r, api, page }: { r: FillResult; api: WeraApi; page: Page }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [inserted, setInserted] = useState(false);
  const draft = async () => {
    setBusy(true);
    setNote('');
    try {
      const a = await api.answer(r.label, page.job?.id ?? null);
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
            <Button variant="primary" onClick={() => page.tab && void insert(page.tab, r.id, text).then((x) => setInserted(x.ok))}>
              {inserted ? 'Inserted' : 'Insert into form'}
            </Button>
            <Button variant="ghost" onClick={() => void draft()} busy={busy}>Redraft</Button>
          </div>
        </>
      ) : (
        <Button className="mt-2" onClick={() => void draft()} busy={busy}><Sparkles className="size-3.5" /> Draft an answer</Button>
      )}
      {note && <p className="mt-1.5 text-[11px] text-warn">{note}</p>}
    </li>
  );
}

export function ApplyTab({ api, page }: { api: WeraApi; page: Page }) {
  const [results, setResults] = useState<FillResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);

  const run = async () => {
    if (!page.tab) return;
    setBusy(true);
    setError('');
    try {
      const [{ applicant }, resume] = await Promise.all([api.applicant(), api.resumePdf().catch(() => null)]);
      setResults(await fill(page.tab, applicant, resume ?? undefined));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Your Wera connection ended; sign in again.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const by = (s: FillResult['status']) => results?.filter((r) => r.status === s) ?? [];
  const filled = by('filled');
  const review = by('review');
  const questions = by('question');
  const other = [...by('skipped'), ...by('already')];

  return (
    <div className="space-y-3">
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
          {review.length > 0 && (
            <Section icon={<AlertTriangle className="size-3.5 text-warn" />} title="Check these">
              {review.map((r) => <Row key={r.id} r={r} />)}
            </Section>
          )}
          {questions.length > 0 && (
            <Section icon={<MessageSquareText className="size-3.5 text-accent-2" />} title="Questions">
              {questions.map((r) => <Question key={r.id} r={r} api={api} page={page} />)}
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
          <a href={api.dashboardUrl('/profile#application')} target="_blank" rel="noreferrer" className="block text-[11px] text-accent hover:underline">
            Edit your application details in Wera
          </a>
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
