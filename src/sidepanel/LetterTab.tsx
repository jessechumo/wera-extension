import { useEffect, useState } from 'react';
import { Copy, PenLine, RefreshCw, Sparkles } from 'lucide-react';
import type { CoverLetter, WeraApi } from '../shared/api';
import { NeedJob } from './NeedJob';
import { insertCoverLetter } from './page';
import { Button, Card, INPUT, Notice, Skeleton, errorText } from './ui';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

export function LetterTab({ api, page, onNeedJob }: { api: WeraApi; page: Page; onNeedJob: () => void }) {
  const job = page.job;
  const [letter, setLetter] = useState<CoverLetter | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'' | 'write' | 'save'>('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    if (!job) return;
    setLetter(undefined);
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
      const l = await api.writeCoverLetter(job.id, body);
      setLetter(l);
      setText(l.body);
      setEditing(false);
    } catch (e) {
      setMsg({ tone: 'bad', text: errorText(e) });
    } finally {
      setBusy('');
    }
  };
  const insertIntoPage = async () => {
    if (!page.tab) return;
    const r = await insertCoverLetter(page.tab, text).catch(() => ({ ok: false }));
    setMsg(r.ok ? { tone: 'good', text: 'Inserted into the cover letter box.' }
      : { tone: 'warn', text: 'No cover letter box on this page. Copy it, or attach it as a file.' });
  };

  if (!letter) {
    return (
      <Card className="text-center">
        <PenLine className="mx-auto size-5 text-accent" />
        <h2 className="mt-2 text-sm font-semibold">A cover letter for {job.company}</h2>
        <p className="mt-1 text-xs text-muted">Written from your profile and resume for this role, without repeating your resume.</p>
        <Button variant="primary" className="mt-3" onClick={() => void write()} busy={busy === 'write'}><Sparkles className="size-3.5" /> Write my letter</Button>
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
            <Button variant="primary" onClick={() => void insertIntoPage()}>Insert into page</Button>
            <Button onClick={() => void navigator.clipboard.writeText(text).then(() => setMsg({ tone: 'good', text: 'Copied.' }))}><Copy className="size-3.5" /> Copy</Button>
            <Button onClick={() => setEditing(true)}><PenLine className="size-3.5" /> Edit</Button>
            <Button variant="ghost" onClick={() => void write()} busy={busy === 'write'}><RefreshCw className="size-3.5" /> Rewrite</Button>
          </>
        )}
      </div>
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
