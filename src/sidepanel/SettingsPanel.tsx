import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Globe, LogOut } from 'lucide-react';
import type { WeraApi } from '../shared/api';
import type { Settings } from '../shared/settings';
import type { Session } from '../shared/storage';
import { Button, Card, Notice, errorText } from './ui';

/** The job sites and applicant tracking systems most applications live on. */
export const JOB_SITES = [
  'https://*.greenhouse.io/*', 'https://*.lever.co/*', 'https://*.ashbyhq.com/*', 'https://*.myworkdayjobs.com/*',
  'https://*.myworkdaysite.com/*', 'https://*.icims.com/*', 'https://*.smartrecruiters.com/*', 'https://*.jobvite.com/*',
  'https://*.bamboohr.com/*', 'https://*.workable.com/*', 'https://*.recruitee.com/*', 'https://*.breezy.hr/*',
  'https://*.applytojob.com/*', 'https://*.teamtailor.com/*', 'https://*.rippling.com/*', 'https://*.dover.com/*',
  'https://*.taleo.net/*', 'https://*.successfactors.com/*', 'https://*.oraclecloud.com/*', 'https://*.eightfold.ai/*',
  'https://*.jazzhr.com/*', 'https://*.paylocity.com/*', 'https://*.ultipro.com/*', 'https://*.linkedin.com/*',
  'https://*.indeed.com/*', 'https://*.wellfound.com/*', 'https://*.ycombinator.com/*', 'https://*.builtin.com/*',
];

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
  const [sites, setSites] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void chrome.permissions?.contains?.({ origins: JOB_SITES }).then(setSites).catch(() => setSites(false));
    void api.answers().then((a) => setSaved(a.length)).catch(() => setSaved(null));
  }, [api]);

  const allowSites = async () => {
    try {
      const ok = await chrome.permissions.request({ origins: JOB_SITES });
      setSites(ok);
      if (ok) setMsg('Wera now shows its button on job sites. It still reads a page only to offer help or when you ask.');
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const forget = async () => {
    await api.forgetAnswers().catch(() => {});
    setSaved(0);
  };

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="text-sm font-semibold">On job pages</h2>
        <Toggle label="Show the Wera button" hint="A small button on job postings and application forms: one click opens Wera and fills."
          checked={settings.launcher} onChange={(launcher) => onChange({ launcher })} />
        <div className="mt-1.5 rounded-lg border border-border bg-surface-2/40 p-2.5 text-xs">
          {sites ? (
            <p className="flex items-center gap-1.5 text-good"><CheckCircle2 className="size-3.5" /> On for common job sites (Greenhouse, Lever, Workday, Ashby and more).</p>
          ) : (
            <>
              <p className="text-muted">Wera works on a site once you allow it. Allow the common job sites at once so the button shows up there on its own.</p>
              <Button className="mt-2" onClick={() => void allowSites()}><Globe className="size-3.5" /> Allow job sites</Button>
            </>
          )}
        </div>
        {msg && <div className="mt-2"><Notice tone="good">{msg}</Notice></div>}
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
