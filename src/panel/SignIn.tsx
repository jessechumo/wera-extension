import { useState, type FormEvent } from 'react';
import { rpc } from '../shared/rpc';
import { Button, Field, INPUT, Notice, errorText } from './ui';

export const DEFAULT_SERVER = 'http://192.168.4.68:3000';

/** Connects this browser to the user's Wera (the background signs in and keeps the key). */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await rpc({ type: 'wera:sign-in', server, email, password });
      onSignedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted">Connect your Wera account to see your fit, autofill applications and keep your tracker current. You review and submit.</p>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
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
      <p className="text-[11px] text-faint">This browser gets its own key; disconnect it any time in Wera's Settings.</p>
    </div>
  );
}
