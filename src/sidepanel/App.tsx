import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Briefcase, ExternalLink, FileText, PenLine, Settings2, Wand2 } from 'lucide-react';
import { WeraApi } from '../shared/api';
import { notifyDashboard } from '../shared/bridge';
import { loadSession, saveSession, type Session } from '../shared/storage';
import { ApplyTab } from './ApplyTab';
import { JobTab } from './JobTab';
import { LetterTab } from './LetterTab';
import { ResumeTab } from './ResumeTab';
import { SettingsPanel } from './SettingsPanel';
import { SignIn } from './SignIn';
import { Button, Notice, Skeleton } from './ui';
import { usePage } from './usePage';
import { useSettings } from './useSettings';
import { requestOrigins, requestSite } from './page';
import { PENDING_VIEW, type PendingView } from '../shared/dock';

type Tab = 'job' | 'apply' | 'letter' | 'resume' | 'settings';
const TABS: { id: Tab; label: string; Icon: typeof Briefcase }[] = [
  { id: 'job', label: 'Job', Icon: Briefcase },
  { id: 'apply', label: 'Apply', Icon: Wand2 },
  { id: 'letter', label: 'Letter', Icon: PenLine },
  { id: 'resume', label: 'Resume', Icon: FileText },
];

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void loadSession().then(setSession);
  }, []);
  if (session === undefined) return <div className="p-4"><Skeleton className="h-24" /></div>;
  if (!session) return <SignIn onSignedIn={setSession} />;
  return <Main session={session} onSignOut={() => setSession(null)} />;
}

/** A fill request; claim() is true once per request, even if the Apply tab remounts meanwhile. */
export interface FillRequest {
  count: number;
  claim: () => boolean;
}

/**
 * A view or a fill asked for by the dock on the page, the keyboard
 * shortcut or the right-click menu (the background leaves it in session
 * storage): switches to that view and counts a fill for the Apply tab to
 * carry out once.
 */
function usePendingFill(tabId: number | undefined, onView: (view: Tab) => void): FillRequest {
  const [count, setCount] = useState(0);
  const handled = useRef(0);
  useEffect(() => {
    if (tabId == null || !chrome.storage?.session) return;
    const take = (v: unknown) => {
      const p = v as Partial<PendingView> | undefined;
      if (!p || p.tabId !== tabId || Date.now() - (p.at ?? 0) > 15_000) return;
      void chrome.storage.session.remove(PENDING_VIEW);
      onView(p.view ?? 'apply');
      if (p.fill !== false) setCount((c) => c + 1);
    };
    void chrome.storage.session.get(PENDING_VIEW).then((r) => take(r[PENDING_VIEW]));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes[PENDING_VIEW]) take(changes[PENDING_VIEW].newValue);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps -- onView only switches the tab
  const claim = useCallback(() => {
    if (count <= handled.current) return false;
    handled.current = count;
    return true;
  }, [count]);
  return { count, claim };
}

function Main({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const api = useMemo(
    () => new WeraApi(session.server, session.token, undefined, (path) => void notifyDashboard(session.server, path)),
    [session],
  );
  const signOutLocal = useCallback(() => {
    void saveSession(null).then(onSignOut);
  }, [onSignOut]);
  const page = usePage(api, signOutLocal);
  const [tab, setTab] = useState<Tab>('job');
  const [settings, setSettings] = useSettings();
  const autoFill = usePendingFill(page.tab?.id, setTab);

  // An application page opens on Apply; a posting on Job.
  const pageKey = page.page ? `${page.page.url}|${page.page.hasForm}` : '';
  const [seenPage, setSeenPage] = useState(pageKey);
  if (pageKey !== seenPage) {
    setSeenPage(pageKey);
    if (page.page?.hasForm) setTab('apply');
  }

  // What each tab has for this page: the job is saved; there is a form to fill.
  const marks: Partial<Record<Tab, string>> = {
    job: page.job ? 'bg-good' : undefined,
    apply: page.page?.hasForm ? 'bg-accent' : undefined,
  };
  const markTitle: Partial<Record<Tab, string>> = { job: 'In your Wera lists', apply: 'This page has a form to fill' };

  const signOut = async () => {
    await api.disconnect().catch(() => {});
    signOutLocal();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Chrome's side panel bar already shows Wera's icon and name above this. */}
          <span className="min-w-0 truncate text-[11px] text-muted" title="Signed in">{session.user.email}</span>
          <a href={api.dashboardUrl('/')} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted hover:text-text">
            Dashboard <ExternalLink className="size-3" />
          </a>
          <button onClick={() => setTab(tab === 'settings' ? 'job' : 'settings')} title={`Settings (signed in as ${session.user.email})`} aria-label="Settings"
            aria-pressed={tab === 'settings'} className={clsx('rounded-md p-1 hover:text-text', tab === 'settings' ? 'text-accent' : 'text-muted')}>
            <Settings2 className="size-3.5" />
          </button>
        </div>
        <nav role="tablist" className="flex px-2">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={clsx('relative -mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors',
                tab === id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text')}>
              <Icon className="size-3.5" /> {label}
              {marks[id] && <span className={clsx('size-1.5 rounded-full', marks[id])} title={markTitle[id]} />}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 space-y-3 p-3">
        {page.needsPermission ? (
          <Notice tone="warn">
            <p className="mb-2">Allow Wera to read <b>{page.needsPermission}</b> so it can save this job and fill its forms. It reads the page only when you use it.</p>
            <Button variant="primary" onClick={() => page.tab?.url && void requestSite(page.tab.url).then((ok) => { if (ok) void page.refresh(); })}>Allow on this site</Button>
          </Notice>
        ) : page.error ? (
          <Notice tone="bad">{page.error}</Notice>
        ) : page.page?.frameOrigins?.length ? (
          <Notice tone="warn">
            <p className="mb-2">
              The application form here is embedded from <b>{page.page.frameOrigins.map((o) => new URL(o).host).join(', ')}</b>. Allow Wera there to fill it.
            </p>
            <Button variant="primary" onClick={() => void requestOrigins(page.page!.frameOrigins!).then((ok) => { if (ok) void page.refresh(); })}>Allow the form's site</Button>
          </Notice>
        ) : null}
        {tab === 'job' && <JobTab api={api} page={page} />}
        {tab === 'apply' && <ApplyTab key={page.pageKey} api={api} page={page} autoFill={autoFill} settings={settings} onNeedJob={() => setTab('job')} />}
        {tab === 'letter' && <LetterTab key={page.job?.id ?? 0} api={api} page={page} onNeedJob={() => setTab('job')} />}
        {tab === 'resume' && <ResumeTab key={page.job?.id ?? 0} api={api} page={page} onNeedJob={() => setTab('job')} />}
        {tab === 'settings' && <SettingsPanel api={api} session={session} settings={settings} onChange={setSettings} onSignOut={() => void signOut()} />}
      </main>
    </div>
  );
}
