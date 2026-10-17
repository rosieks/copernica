import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { Button, Callout, Field } from '../ui';
import './SignIn.css';

function safeReturnUrl(value: string | null): string {
  // Only same-origin paths; never an absolute URL (open redirect).
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/** S1: sign-in card. */
export function SignIn() {
  const [params] = useSearchParams();
  const returnUrl = safeReturnUrl(params.get('returnUrl'));
  const config = useQuery({ queryKey: ['auth-config'], queryFn: () => api<{ mode: string | null }>('/auth/config') });
  useDocumentTitle('Sign in');

  return (
    <main id="main" className="signin">
      <div className="signin__card">
        <h1>Sign in to Copernica</h1>
        <p className="muted">The team wiki for the documentation in your repositories.</p>
        {config.isPending ? (
          <p role="status">Loading…</p>
        ) : config.data?.mode === 'Local' ? (
          <LocalSignIn returnUrl={returnUrl} />
        ) : (
          <Button asChild variant="primary">
            <a href={`/auth/challenge?returnUrl=${encodeURIComponent(returnUrl)}`}>Sign in with your organization account</a>
          </Button>
        )}
      </div>
    </main>
  );
}

function LocalSignIn({ returnUrl }: { returnUrl: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      // Fetch once so the antiforgery cookie exists before the first POST.
      await fetch('/auth/config', { credentials: 'same-origin' });
      await api('/auth/login', { method: 'POST', json: { username, password } });
      window.location.assign(returnUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="User name" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <Callout tone="danger" title={error} />}
      <Button type="submit" variant="primary" disabled={busy}>
        Sign in
      </Button>
    </form>
  );
}
