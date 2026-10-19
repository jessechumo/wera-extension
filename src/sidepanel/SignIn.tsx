import { useState, type FormEvent } from 'react';
import { WeraApi } from '../shared/api';
import { normalizeServer, saveSession, type Session } from '../shared/storage';
import { Button, Field, INPUT, Notice, errorText } from './ui';
import { Logo } from './Logo';

export const DEFAULT_SERVER = 'http://192.168.4.68:3000';

export function SignIn({ onSignedIn, makeApi = (s: string) => new WeraApi(s) }: {
  onSignedIn: (s: Session) => void;
  makeApi?: (server: string) => WeraApi;
}) {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const origin = normalizeServer(server);
    if (!origin) {
      setError('Enter your Wera address, for example https://wera.example.com');
      return;
    }
    setBusy(true);
    try {
      // The extension may only call servers the user allowed.
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) throw new Error('Wera needs permission to talk to your server.');
      const api = makeApi(origin);
      const { token, user } = await api.connect(email, password, `Chrome on ${navigator.platform || 'this computer'}`);
      const session = { server: origin, token, user };
      await saveSession(session);
      onSignedIn(session);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-5 py-8">
      <div className="mb-5 text-center">
        <Logo />
        <p className="mt-2 text-xs text-muted">Save jobs, write cover letters, tailor your resume and fill applications. You review and submit.</p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Field label="Wera address">
          <input className={INPUT} value={server} onChange={(e) => setServer(e.target.value)} required />
        </Field>
        <Field label="Email">
          <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password">
          <input className={INPUT} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" busy={busy} className="w-full">Connect</Button>
      </form>
      <p className="mt-3 text-center text-[11px] text-faint">This browser gets its own key; disconnect it any time in Wera's Settings.</p>
    </div>
  );
}
