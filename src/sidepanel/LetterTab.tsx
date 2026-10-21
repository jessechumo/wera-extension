import { useEffect, useState } from 'react';
import { Copy, Download, FilePlus2, PenLine, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { CoverLetter, LetterSteer, WeraApi } from '../shared/api';
import { NeedJob } from './NeedJob';
import { attachToForm, insertCoverLetter } from './page';
import { Button, Card, INPUT, Notice, Skeleton, errorText } from './ui';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

const TONES: { value: NonNullable<LetterSteer['tone']>; label: string }[] = [
  { value: '', label: 'Natural' }, { value: 'warm', label: 'Warm' }, { value: 'formal', label: 'Formal' },
  { value: 'confident', label: 'Confident' }, { value: 'enthusiastic', label: 'Enthusiastic' }, { value: 'concise', label: 'Concise' },
];
const LENGTHS: { value: NonNullable<LetterSteer['length']>; label: string }[] = [
  { value: 'short', label: 'Short' }, { value: '', label: 'Standard' }, { value: 'long', label: 'Long' },
];

/** How the next letter should read: tone, length, and what to stress. */
function SteerControls({ steer, onChange }: { steer: LetterSteer; onChange: (s: LetterSteer) => void }) {
  return (
    <div className="space-y-2 text-left">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Tone</span>
          <select className={INPUT} value={steer.tone ?? ''} onChange={(e) => onChange({ ...steer, tone: e.target.value as LetterSteer['tone'] })}>
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Length</span>
          <select className={INPUT} value={steer.length ?? ''} onChange={(e) => onChange({ ...steer, length: e.target.value as LetterSteer['length'] })}>
            {LENGTHS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted">Anything to stress or leave out?</span>
        <textarea className={`${INPUT} h-16 resize-y`} maxLength={500} value={steer.request ?? ''} placeholder="Mention my on-call work at Acme; skip the internship"
          onChange={(e) => onChange({ ...steer, request: e.target.value })} />
      </label>
    </div>
  );
}

export function LetterTab({ api, page, onNeedJob }: { api: WeraApi; page: Page; onNeedJob: () => void }) {
  const job = page.job;
  const [letter, setLetter] = useState<CoverLetter | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'' | 'write' | 'save' | 'add'>('');
  const [steer, setSteer] = useState<LetterSteer>({});
  const [steering, setSteering] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    if (!job) return; // the tab is keyed by job, so state starts fresh per job
    void api.coverLetter(job.id).then((l) => {
      setLetter(l);
      setText(l?.body ?? '');
    }).catch((e) => setMsg({ tone: 'bad', text: errorText(e) }));
  }, [job, api]);

  if (!job) return <NeedJob what="cover letter" onNeedJob={onNeedJob} />;
  if (letter === undefined) return <Skeleton className="h-64" />;

  const write = async (body?: string) => {
    setBusy(body == null ? 'write' : 'save');
    setMsg(null);
    try {
      const l = await api.writeCoverLetter(job.id, body, body == null ? steer : undefined);
      setLetter(l);
      setText(l.body);
      setEditing(false);
    } catch (e) {
      setMsg({ tone: 'bad', text: errorText(e) });
    } finally {
      setBusy('');
    }
  };
  const openLetterPdf = async () => {
    const f = await api.coverLetterPdf(job.id).catch((e: unknown) => {
      setMsg({ tone: 'bad', text: errorText(e) });
      return null;
    });
    if (!f) return;
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    await chrome.tabs.create({ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) });
  };

  /** Puts the letter into the form: its cover letter box, else its cover letter upload (as a PDF). */
  const addToApplication = async () => {
    if (!page.tab) return;
    setBusy('add');
    setMsg(null);
    try {
      const typed = await insertCoverLetter(page.tab, text).catch(() => ({ ok: false }));
      if (typed.ok) {
        setMsg({ tone: 'good', text: 'Added to the cover letter box on the form.' });
        return;
      }
      const file = await api.coverLetterPdf(job.id).catch(() => null);
      const attached = file ? await attachToForm(page.tab, 'cover_letter', file).catch(() => ({ ok: false })) : { ok: false };
      setMsg(attached.ok ? { tone: 'good', text: `Attached to the form as ${file!.name}.` }
        : { tone: 'warn', text: 'This page has no cover letter box or upload. Open the application form, or copy the letter.' });
    } finally {
      setBusy('');
    }
  };

  if (!letter) {
    return (
      <Card className="text-center">
        <PenLine className="mx-auto size-5 text-accent" />
        <h2 className="mt-2 text-sm font-semibold">A cover letter for {job.company}</h2>
        <p className="mt-1 text-xs text-muted">Written from your profile and resume for this role, without repeating your resume.</p>
        <div className="mt-3"><SteerControls steer={steer} onChange={setSteer} /></div>
        <Button variant="primary" className="mt-3 w-full" onClick={() => void write()} busy={busy === 'write'}><Sparkles className="size-3.5" /> Write my letter</Button>
        {msg && <div className="mt-3 text-left"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {editing ? (
          <>
            <Button variant="primary" onClick={() => void write(text)} busy={busy === 'save'}>Save</Button>
            <Button variant="ghost" onClick={() => { setText(letter.body); setEditing(false); }}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={() => void addToApplication()} busy={busy === 'add'}><FilePlus2 className="size-3.5" /> Add to application</Button>
            <Button onClick={() => void openLetterPdf()} title="Open the letter as a PDF"><Download className="size-3.5" /> PDF</Button>
            <Button onClick={() => void navigator.clipboard.writeText(text).then(() => setMsg({ tone: 'good', text: 'Copied.' }))}><Copy className="size-3.5" /> Copy</Button>
            <Button onClick={() => setEditing(true)}><PenLine className="size-3.5" /> Edit</Button>
            <Button variant="ghost" onClick={() => setSteering((v) => !v)} aria-pressed={steering} title="Tone, length, what to stress">
              <SlidersHorizontal className="size-3.5" /> Rewrite…
            </Button>
          </>
        )}
      </div>
      {steering && !editing && (
        <Card className="space-y-2">
          <SteerControls steer={steer} onChange={setSteer} />
          <Button variant="primary" className="w-full" onClick={() => void write().then(() => setSteering(false))} busy={busy === 'write'}>
            <RefreshCw className="size-3.5" /> Rewrite the letter
          </Button>
        </Card>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {editing ? (
        <textarea className={`${INPUT} h-96 resize-y font-serif text-[13px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Cover letter" />
      ) : (
        <Card className="space-y-3 font-serif text-[13px] leading-relaxed">
          {text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </Card>
      )}
    </div>
  );
}
