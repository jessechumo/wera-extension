import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Briefcase, ExternalLink, FileText, LogOut, PenLine, Wand2 } from 'lucide-react';
import { WeraApi } from '../shared/api';
import { loadSession, saveSession, type Session } from '../shared/storage';
import { ApplyTab } from './ApplyTab';
import { JobTab } from './JobTab';
import { LetterTab } from './LetterTab';
import { Logo } from './Logo';
import { ResumeTab } from './ResumeTab';
import { SignIn } from './SignIn';
import { Button, Notice, Skeleton } from './ui';
import { usePage } from './usePage';
import { requestSite } from './page';

type Tab = 'job' | 'apply' | 'letter' | 'resume';
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

function Main({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const api = useMemo(() => new WeraApi(session.server, session.token), [session]);
  const signOutLocal = useCallback(() => {
    void saveSession(null).then(onSignOut);
  }, [onSignOut]);
  const page = usePage(api, signOutLocal);
  const [tab, setTab] = useState<Tab>('job');

  // An application page opens on Apply; a posting on Job.
  useEffect(() => {
    if (page.page?.hasForm) setTab('apply');
  }, [page.page?.url, page.page?.hasForm]);

  const signOut = async () => {
    await api.disconnect().catch(() => {});
    signOutLocal();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Logo small />
          <a href={api.dashboardUrl('/')} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-text">
            Dashboard <ExternalLink className="size-3" />
          </a>
          <button onClick={() => void signOut()} title={`Signed in as ${session.user.email}. Disconnect`} aria-label="Disconnect" className="rounded-md p-1 text-muted hover:text-text">
            <LogOut className="size-3.5" />
          </button>
        </div>
        <nav role="tablist" className="flex px-2">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={clsx('-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors',
                tab === id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text')}>
              <Icon className="size-3.5" /> {label}
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
        ) : null}
        {tab === 'job' && <JobTab api={api} page={page} />}
        {tab === 'apply' && <ApplyTab api={api} page={page} />}
        {tab === 'letter' && <LetterTab api={api} page={page} onNeedJob={() => setTab('job')} />}
        {tab === 'resume' && <ResumeTab api={api} page={page} userName={session.user.name} onNeedJob={() => setTab('job')} />}
      </main>
    </div>
  );
}
