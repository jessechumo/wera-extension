// The panel's settings: what Wera does on its own, the Debug log, and
// signing out.
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { rpc } from '../shared/rpc';
import type { PanelProps } from './Panel';
import { Button } from './ui';

function Toggle({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--color-accent)]" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-faint">{hint}</span>
      </span>
    </label>
  );
}

export function SettingsView({ api, settings, setSettings, onSignedOut, onClose }: PanelProps & { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await rpc({ type: 'wera:sign-out' }).catch(() => null);
    setBusy(false);
    onSignedOut();
    onClose();
  };
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Settings</h2>
      <div className="divide-y divide-border">
        <Toggle label="Answer with AI" hint="Fields your details do not cover, from your profile and resume. Unsure answers wait for you." on={settings.aiSuggest} set={(v) => setSettings({ aiSuggest: v })} />
        <Toggle label="Draft open questions while filling" hint={'"Why us?", "Tell me about a time...": drafted for you to read.'} on={settings.aiQuestions} set={(v) => setSettings({ aiQuestions: v })} />
        <Toggle label="Wera button in open questions" hint="Draft, rework and insert an answer right in the box." on={settings.assist} set={(v) => setSettings({ assist: v })} />
        <Toggle label="Fill the next page on Continue" hint="Multi-page applications (Workday) keep filling." on={settings.autoContinue} set={(v) => setSettings({ autoContinue: v })} />
        <Toggle label="Remember my answers" hint="What you type into forms, for the next application." on={settings.learn} set={(v) => setSettings({ learn: v })} />
        <Toggle label="Mark applied when the site confirms" hint={'"Thank you for applying" moves the job to Applied.'} on={settings.autoApplied} set={(v) => setSettings({ autoApplied: v })} />
        <Toggle label="Close the tab after applying" hint="Once you submit and the site confirms it, Wera says so, then closes the tab." on={settings.closeAfterApply} set={(v) => setSettings({ closeAfterApply: v })} />
        <Toggle label="Show Wera on job pages" hint="Off: open it from the toolbar icon (Alt+Shift+W)." on={settings.launcher} set={(v) => setSettings({ launcher: v })} />
        <Toggle label="Debug log" hint="Writes what Wera reads and fills to the page's console ([wera:…] lines), to find out why a field was missed." on={settings.debug} set={(v) => setSettings({ debug: v })} />
      </div>
      {api && (
        <div className="flex items-center gap-3 pt-2">
          <a href={api.dashboardUrl('/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Dashboard <ExternalLink className="size-3" /></a>
          <Button variant="ghost" className="ml-auto" onClick={() => void signOut()} busy={busy}>Sign out</Button>
        </div>
      )}
      <Button className="w-full" onClick={onClose}>Done</Button>
    </div>
  );
}
