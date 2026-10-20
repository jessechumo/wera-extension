import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Download, Eye, EyeOff, LayoutTemplate, Plus, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { ResumeData, ResumeDoc, ResumeEntry, ResumeSection, ResumeTemplate, WeraApi } from '../shared/api';
import { Button, Card, INPUT, Notice, Skeleton, errorText } from './ui';

const newId = () => Math.random().toString(16).slice(2, 12);

/** The first rendered page, shown as an image (an SVG in an <img> never runs). */
export function PagePreview({ svg }: { svg: string }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), [svg]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="Resume preview" className="block w-full rounded-sm bg-white shadow ring-1 ring-black/5" />;
}

/** Opens a resume's PDF in a new tab. */
export async function openPdf(api: WeraApi, id: number) {
  const f = await api.resumeDocPdf(id);
  if (!f) return;
  const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  await chrome.tabs.create({ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) });
}

/** A live preview of unsaved edits, rendered by Wera a moment after the last change. */
export function useLivePreview(api: WeraApi, doc: ResumeDoc | null): { svg: string; pages: number } {
  const [out, setOut] = useState({ svg: '', pages: 0 });
  useEffect(() => {
    if (!doc?.data?.sections) return;
    let live = true;
    const t = window.setTimeout(() => {
      api.previewResume(doc).then((r) => live && setOut({ svg: r.pages[0] ?? '', pages: r.measure?.pages ?? r.pages.length })).catch(() => {});
    }, 700);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [api, doc]);
  return out;
}

function Bullet({ text, hidden, role, api, jobId, onChange, onRemove, onToggle }: {
  text: string; hidden?: boolean; role: string; api: WeraApi; jobId: number | null;
  onChange: (t: string) => void; onRemove: () => void; onToggle: () => void;
}) {
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const improve = async () => {
    setBusy(true);
    setError('');
    try {
      setIdeas((await api.suggestBullet(text, role, jobId)).suggestions);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={clsx('group rounded-md', hidden && 'opacity-50')}>
      <div className="flex items-start gap-1">
        <textarea className={`${INPUT} min-h-[3.2rem] flex-1 resize-y py-1 text-xs leading-snug`} value={text} onChange={(e) => onChange(e.target.value)} aria-label="Bullet" />
        <div className="flex flex-col gap-0.5">
          <button type="button" className="rounded p-1 text-faint hover:text-accent" title="Suggest stronger wordings" aria-label="Improve this bullet" onClick={() => void improve()} disabled={busy || !text.trim()}>
            <Sparkles className={clsx('size-3.5', busy && 'animate-pulse')} />
          </button>
          <button type="button" className="rounded p-1 text-faint hover:text-text" title={hidden ? 'Show on the resume' : 'Hide from the resume'} aria-label={hidden ? 'Show this bullet' : 'Hide this bullet'} onClick={onToggle}>
            {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button type="button" className="rounded p-1 text-faint hover:text-bad" title="Delete" aria-label="Delete this bullet" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
      {ideas && (
        <div className="mt-1 space-y-1 rounded-md border border-accent/30 bg-accent/[0.05] p-1.5">
          {ideas.map((idea, i) => (
            <button key={i} type="button" className="block w-full rounded px-1.5 py-1 text-left text-[11px] text-text hover:bg-accent/10" onClick={() => { onChange(idea); setIdeas(null); }}>
              {idea}
            </button>
          ))}
          <button type="button" className="px-1.5 text-[10px] text-faint hover:text-text" onClick={() => setIdeas(null)}>Keep mine</button>
          <p className="px-1.5 text-[10px] text-faint">[Brackets] mark numbers to fill in yourself. Use only what is true.</p>
        </div>
      )}
    </li>
  );
}

function EntryEditor({ e, api, jobId, onChange }: { e: ResumeEntry; api: WeraApi; jobId: number | null; onChange: (e: ResumeEntry) => void }) {
  const [open, setOpen] = useState(false);
  const bullets = e.bullets ?? [];
  const setBullet = (i: number, patch: Partial<NonNullable<ResumeEntry['bullets']>[number]>) =>
    onChange({ ...e, bullets: bullets.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <div className={clsx('rounded-lg border border-border bg-surface-2/30', e.hidden && 'opacity-60')}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronDown className={clsx('size-3 shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="truncate font-medium text-text">{e.heading || 'Untitled'}</span>
          {e.subheading && <span className="truncate text-faint">· {e.subheading}</span>}
        </button>
        <button type="button" className="rounded p-1 text-faint hover:text-text" aria-label={e.hidden ? `Show ${e.heading}` : `Hide ${e.heading}`} title={e.hidden ? 'Show on the resume' : 'Hide from the resume'}
          onClick={() => onChange({ ...e, hidden: !e.hidden })}>
          {e.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {open && (
        <div className="space-y-1.5 border-t border-border px-2 py-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input className={`${INPUT} py-1 text-xs`} value={e.heading} onChange={(x) => onChange({ ...e, heading: x.target.value })} aria-label="Heading" placeholder="Company, school or project" />
            <input className={`${INPUT} py-1 text-xs`} value={e.subheading ?? ''} onChange={(x) => onChange({ ...e, subheading: x.target.value })} aria-label="Subheading" placeholder="Title or degree" />
            <input className={`${INPUT} py-1 text-xs`} value={e.dates ?? ''} onChange={(x) => onChange({ ...e, dates: x.target.value })} aria-label="Dates" placeholder="Jan 2024 – Present" />
            <input className={`${INPUT} py-1 text-xs`} value={e.location ?? ''} onChange={(x) => onChange({ ...e, location: x.target.value })} aria-label="Location" placeholder="City, ST" />
          </div>
          {e.text != null && <textarea className={`${INPUT} h-14 resize-y py-1 text-xs`} value={e.text} onChange={(x) => onChange({ ...e, text: x.target.value })} aria-label="Description" />}
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <Bullet key={b.id} text={b.text} hidden={b.hidden} role={[e.subheading, e.heading].filter(Boolean).join(' at ')} api={api} jobId={jobId}
                onChange={(text) => setBullet(i, { text })} onToggle={() => setBullet(i, { hidden: !b.hidden })}
                onRemove={() => onChange({ ...e, bullets: bullets.filter((_, j) => j !== i) })} />
            ))}
          </ul>
          <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-text" onClick={() => onChange({ ...e, bullets: [...bullets, { id: newId(), text: '' }] })}>
            <Plus className="size-3" /> Add a bullet
          </button>
        </div>
      )}
    </div>
  );
}

function SectionEditor({ s, api, jobId, onChange }: { s: ResumeSection; api: WeraApi; jobId: number | null; onChange: (s: ResumeSection) => void }) {
  const entries = s.entries ?? [];
  return (
    <section className={clsx('space-y-1.5', s.hidden && 'opacity-60')}>
      <div className="flex items-center gap-1">
        <input className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold tracking-wide text-muted uppercase focus:outline-none" value={s.title}
          onChange={(e) => onChange({ ...s, title: e.target.value })} aria-label="Section title" />
        <button type="button" className="rounded p-1 text-faint hover:text-text" aria-label={s.hidden ? `Show ${s.title}` : `Hide ${s.title}`} onClick={() => onChange({ ...s, hidden: !s.hidden })}>
          {s.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {s.kind === 'summary' && (
        <textarea className={`${INPUT} h-20 resize-y text-xs`} value={s.text ?? ''} onChange={(e) => onChange({ ...s, text: e.target.value })} aria-label={`${s.title} text`} />
      )}
      {s.kind === 'skills' && (s.skills ?? []).map((g, i) => (
        <div key={g.id} className="flex gap-1.5">
          <input className={`${INPUT} w-1/3 py-1 text-xs`} value={g.name} aria-label="Skill group"
            onChange={(e) => onChange({ ...s, skills: s.skills!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
          <input className={`${INPUT} flex-1 py-1 text-xs`} value={g.items} aria-label={`${g.name} skills`}
            onChange={(e) => onChange({ ...s, skills: s.skills!.map((x, j) => (j === i ? { ...x, items: e.target.value } : x)) })} />
        </div>
      ))}
      {entries.map((e, i) => (
        <EntryEditor key={e.id} e={e} api={api} jobId={jobId} onChange={(next) => onChange({ ...s, entries: entries.map((x, j) => (j === i ? next : x)) })} />
      ))}
      {(s.kind === 'entries' || s.kind === 'projects' || s.kind === 'compact') && (
        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-text"
          onClick={() => onChange({ ...s, entries: [...entries, { id: newId(), heading: '', bullets: [] }] })}>
          <Plus className="size-3" /> Add to {s.title.toLowerCase() || 'this section'}
        </button>
      )}
    </section>
  );
}

/**
 * Edits a resume in the panel: header, summary, skills, every entry and
 * bullet (with stronger wordings on request), what shows, and the
 * template; previews the edits live, saves, fits to one page, and opens
 * the PDF.
 */
export function ResumeEditor({ api, doc, jobId, onSaved }: { api: WeraApi; doc: ResumeDoc; jobId: number | null; onSaved: (d: ResumeDoc) => void }) {
  const [draft, setDraft] = useState<ResumeDoc>(doc);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'fit' | 'pdf'>('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const preview = useLivePreview(api, draft);
  useEffect(() => {
    void api.resumeTemplates().then((t) => setTemplates(t.templates)).catch(() => {});
  }, [api]);

  const data: ResumeData = draft.data;
  const sections = data.sections ?? [];
  const setData = (patch: Partial<ResumeData>) => {
    setDraft({ ...draft, data: { ...data, ...patch } });
    setDirty(true);
    setMsg(null);
  };
  const run = async (what: 'save' | 'fit' | 'pdf') => {
    setBusy(what);
    setMsg(null);
    try {
      let saved = draft;
      if (dirty || what === 'save') {
        saved = await api.saveResume(draft);
        setDirty(false);
      }
      if (what === 'fit') saved = await api.fitResume(saved.id);
      if (what === 'pdf') await openPdf(api, saved.id);
      setDraft(saved);
      onSaved(saved);
      if (what === 'save') setMsg({ tone: 'good', text: 'Saved. The Apply tab attaches this version.' });
      if (what === 'fit') setMsg({ tone: 'good', text: saved.fit?.summary || (saved.fit?.one_page ? 'Fits on one page.' : 'Laid out.') });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorText(e) });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-[85px] z-[5] -mx-3 flex flex-wrap items-center gap-1.5 border-b border-border bg-bg/95 px-3 py-2 backdrop-blur">
        <Button variant="primary" onClick={() => void run('save')} busy={busy === 'save'} disabled={!dirty}><Save className="size-3.5" /> {dirty ? 'Save' : 'Saved'}</Button>
        <Button onClick={() => void run('fit')} busy={busy === 'fit'} title="Fit to one page (hides the least relevant bullets if it must)"><Wand2 className="size-3.5" /> Fit</Button>
        <Button onClick={() => void run('pdf')} busy={busy === 'pdf'}><Download className="size-3.5" /> PDF</Button>
        {templates.length > 0 && (
          <label className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted">
            <LayoutTemplate className="size-3.5" />
            <select className="rounded-md border border-border bg-surface-2 px-1.5 py-1 text-[11px] text-text" aria-label="Template"
              value={draft.layout?.template || 'ivy'} onChange={(e) => { setDraft({ ...draft, layout: { ...draft.layout, template: e.target.value } }); setDirty(true); }}>
              {templates.map((t) => <option key={t.id} value={t.id} title={t.tagline}>{t.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {preview.pages > 1 && <Notice tone="warn">This runs to {preview.pages} pages. Hide a few bullets or press Fit.</Notice>}

      <Card className="space-y-1.5">
        <input className={`${INPUT} text-sm font-semibold`} value={data.name ?? ''} onChange={(e) => setData({ name: e.target.value })} aria-label="Name" />
        <input className={`${INPUT} text-xs`} value={data.headline ?? ''} placeholder="Headline, e.g. Site Reliability Engineer" onChange={(e) => setData({ headline: e.target.value })} aria-label="Headline" />
        <div className="grid grid-cols-2 gap-1.5">
          <input className={`${INPUT} py-1 text-xs`} value={data.email ?? ''} placeholder="Email" onChange={(e) => setData({ email: e.target.value })} aria-label="Resume email" />
          <input className={`${INPUT} py-1 text-xs`} value={data.phone ?? ''} placeholder="Phone" onChange={(e) => setData({ phone: e.target.value })} aria-label="Resume phone" />
        </div>
      </Card>
      {sections.map((s, i) => (
        <SectionEditor key={s.id} s={s} api={api} jobId={jobId} onChange={(next) => setData({ sections: sections.map((x, j) => (j === i ? next : x)) })} />
      ))}
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Preview</h3>
        {preview.svg ? <PagePreview svg={preview.svg} /> : <Skeleton className="aspect-[8.5/11]" />}
      </div>
    </div>
  );
}
