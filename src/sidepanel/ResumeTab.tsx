import { useState } from 'react';
import { Copy, FileText, Printer, Sparkles } from 'lucide-react';
import type { TailoredResume, WeraApi } from '../shared/api';
import { NeedJob } from './NeedJob';
import { Button, Card, Notice, errorText } from './ui';
import type { usePage } from './usePage';

type Page = ReturnType<typeof usePage>;

/** Plain-text resume, for pasting into a form or a document. */
export function resumeText(t: TailoredResume, name: string): string {
  const out: string[] = [name, t.headline, '', t.summary, ''];
  if (t.skills.length) {
    out.push('SKILLS');
    for (const g of t.skills) out.push(`${g.group}: ${g.items.join(', ')}`);
    out.push('');
  }
  if (t.experience.length) {
    out.push('EXPERIENCE');
    for (const e of t.experience) {
      out.push(`${e.title}, ${e.company}${e.dates ? ` (${e.dates})` : ''}`);
      e.bullets.forEach((b) => out.push(`- ${b}`));
      out.push('');
    }
  }
  if (t.projects.length) {
    out.push('PROJECTS');
    for (const p of t.projects) {
      out.push(p.name);
      p.bullets.forEach((b) => out.push(`- ${b}`));
      out.push('');
    }
  }
  if (t.education.length) out.push('EDUCATION', ...t.education);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Opens a print-ready page (Save as PDF) built only from escaped text. */
function printResume(t: TailoredResume, name: string) {
  const section = (title: string, body: string) => (body ? `<h2>${esc(title)}</h2>${body}` : '');
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(name)} - Resume</title>
<style>@page{margin:.6in}body{font:10.5pt/1.45 Georgia,serif;color:#1d1f24;max-width:7.2in;margin:auto}
h1{font-size:18pt;margin:0}h2{font:600 9pt -apple-system,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5f6470;border-bottom:1px solid #ddd;margin:14px 0 6px}
.h{color:#5f6470;margin:2px 0 8px}ul{margin:2px 0 8px 16px;padding:0}li{margin:2px 0}.r{font-weight:600}</style>
<h1>${esc(name)}</h1><div class="h">${esc(t.headline)}</div><p>${esc(t.summary)}</p>
${section('Skills', t.skills.map((g) => `<div><span class="r">${esc(g.group)}:</span> ${esc(g.items.join(', '))}</div>`).join(''))}
${section('Experience', t.experience.map((e) => `<div class="r">${esc(e.title)}, ${esc(e.company)} <span style="font-weight:400;color:#5f6470">${esc(e.dates)}</span></div><ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join(''))}
${section('Projects', t.projects.map((p) => `<div class="r">${esc(p.name)}</div><ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join(''))}
${section('Education', t.education.map((e) => `<div>${esc(e)}</div>`).join(''))}`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  void chrome.tabs.create({ url });
}

export function ResumeTab({ api, page, userName, onNeedJob }: { api: WeraApi; page: Page; userName: string; onNeedJob: () => void }) {
  const job = page.job;
  const [t, setT] = useState<TailoredResume | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  if (!job) return <NeedJob what="tailored resume" onNeedJob={onNeedJob} />;
  const name = userName;

  const tailor = async () => {
    setBusy(true);
    setError('');
    try {
      setT(await api.tailorResume(job.id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!t) {
    return (
      <Card className="text-center">
        <FileText className="mx-auto size-5 text-accent" />
        <h2 className="mt-2 text-sm font-semibold">Tailor your resume to this job</h2>
        <p className="mt-1 text-xs text-muted">Reorders and rewords your real experience toward {job.company}'s posting. Nothing is invented: claims with numbers not in your resume are removed.</p>
        <Button variant="primary" className="mt-3" onClick={() => void tailor()} busy={busy}><Sparkles className="size-3.5" /> Tailor my resume</Button>
        {error && <div className="mt-3 text-left"><Notice tone="bad">{error}</Notice></div>}
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button variant="primary" onClick={() => printResume(t, name || 'Resume')}><Printer className="size-3.5" /> Print / PDF</Button>
        <Button onClick={() => void navigator.clipboard.writeText(resumeText(t, name)).then(() => setCopied(true))}><Copy className="size-3.5" /> {copied ? 'Copied' : 'Copy text'}</Button>
        <Button variant="ghost" onClick={() => void tailor()} busy={busy}>Redo</Button>
      </div>
      {t.missing_keywords.length > 0 && (
        <Notice tone="warn">The posting asks for things your resume doesn't show: {t.missing_keywords.join(', ')}. Add them only if they're true.</Notice>
      )}
      <Card className="space-y-2.5">
        <div>
          <div className="text-sm font-semibold">{t.headline}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t.summary}</p>
        </div>
        {t.experience.map((e, i) => (
          <div key={i}>
            <div className="text-xs font-semibold">{e.title}, {e.company} <span className="font-normal text-faint">{e.dates}</span></div>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-text/90">{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
          </div>
        ))}
        {t.skills.length > 0 && (
          <div className="text-xs">{t.skills.map((g) => <div key={g.group}><span className="font-semibold">{g.group}:</span> <span className="text-muted">{g.items.join(', ')}</span></div>)}</div>
        )}
      </Card>
      {t.changes.length > 0 && (
        <details className="text-xs text-muted"><summary className="cursor-pointer">What changed</summary><ul className="mt-1 list-disc pl-4">{t.changes.map((c, i) => <li key={i}>{c}</li>)}</ul></details>
      )}
      {t.dropped.length > 0 && <p className="text-[11px] text-faint">Removed {t.dropped.length} line{t.dropped.length === 1 ? '' : 's'} that cited numbers not in your resume.</p>}
    </div>
  );
}
