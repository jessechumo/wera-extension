import { useEffect, useState } from 'react';
import { ExternalLink, LogOut } from 'lucide-react';
import type { WeraApi } from '../shared/api';
import type { Settings } from '../shared/settings';
import type { Session } from '../shared/storage';
import { Button, Card } from './ui';

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-xs font-medium text-text">{label}</span>
        <span className="block text-[11px] text-faint">{hint}</span>
      </span>
    </label>
  );
}

export function SettingsPanel({ api, session, settings, onChange, onSignOut }: {
  api: WeraApi; session: Session; settings: Settings; onChange: (p: Partial<Settings>) => void; onSignOut: () => void;
}) {
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    void api.answers().then((a) => setSaved(a.length)).catch(() => setSaved(null));
  }, [api]);
  const forget = async () => {
    await api.forgetAnswers().catch(() => {});
    setSaved(0);
  };

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="text-sm font-semibold">On job pages</h2>
        <Toggle label="Show the Wera panel on job pages" hint="It slides in when a page is a job posting or an application: your fit, Autofill, cover letter and resume, one click away."
          checked={settings.launcher} onChange={(launcher) => onChange({ launcher })} />
        <Toggle label="Mark jobs applied when I submit" hint="When a site thanks you for applying, Wera moves the job to Applied in your tracker (with an undo)."
          checked={settings.autoApplied} onChange={(autoApplied) => onChange({ autoApplied })} />
        <p className="mt-1 text-[11px] text-faint">Wera reads a page only to tell whether it is a job and to fill it when you ask. It never submits anything.</p>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Filling</h2>
        <Toggle label="Suggest the rest with AI" hint="For fields your details and earlier answers do not cover. One small request per page; sure answers are ticked, guesses are not."
          checked={settings.aiSuggest} onChange={(aiSuggest) => onChange({ aiSuggest })} />
        <Toggle label="Fill each next page on its own" hint="After Approve & continue, Wera fills the next page as soon as it appears. You still approve every page."
          checked={settings.autoContinue} onChange={(autoContinue) => onChange({ autoContinue })} />
        <Toggle label="Learn from my answers" hint="Answers you give on forms are saved in Wera (for every browser you connect), and details Wera lacked go to your application details."
          checked={settings.learn} onChange={(learn) => onChange({ learn })} />
        {saved != null && (
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <a href={api.dashboardUrl('/profile#answers')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              {saved} saved answer{saved === 1 ? '' : 's'} <ExternalLink className="size-3" />
            </a>
            {saved > 0 && <button type="button" className="text-faint hover:text-text" onClick={() => void forget()}>Forget all</button>}
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="mt-1 text-xs text-muted">Signed in as <b className="text-text">{session.user.email}</b> on {new URL(session.server).host}.</p>
        <div className="mt-2 flex gap-2">
          <a href={api.dashboardUrl('/profile#application')} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-text hover:border-accent/40">
            Application details <ExternalLink className="size-3" />
          </a>
          <Button variant="ghost" onClick={onSignOut}><LogOut className="size-3.5" /> Disconnect</Button>
        </div>
      </Card>
      <p className="text-center text-[11px] text-faint">Shortcuts: Alt+Shift+W opens Wera, Alt+Shift+F fills the form.</p>
    </div>
  );
}
