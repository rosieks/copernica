import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ApiError } from '../api/client';

function safeReturnUrl(value: string | null): string {
  // Only same-origin paths; never an absolute URL (open redirect).
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function SignIn() {
  const [params] = useSearchParams();
  const returnUrl = safeReturnUrl(params.get('returnUrl'));
  const config = useQuery({ queryKey: ['auth-config'], queryFn: () => api<{ mode: string | null }>('/auth/config') });

  if (config.isPending) return <p className="status">Loading…</p>;

  return (
    <main className="signin">
      <h1>Sign in to Copernica</h1>
      {config.data?.mode === 'Local' ? (
        <LocalSignIn returnUrl={returnUrl} />
      ) : (
        <a className="button primary" href={`/auth/challenge?returnUrl=${encodeURIComponent(returnUrl)}`}>
          Sign in with your organization account
        </a>
      )}
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
    <form className="form" onSubmit={submit}>
      <label>
        User name
        <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit" className="button primary" disabled={busy}>
        Sign in
      </button>
    </form>
  );
}
