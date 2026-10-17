import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useMe } from '../App';

const TOKEN_URL = '/api/me/tokens/azure-devops';

/** Profile page: register the personal access token used for Azure DevOps Server. */
export function Profile() {
  const me = useMe();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ['pat'],
    queryFn: () => api<{ registered: boolean; updatedAt: string | null }>(TOKEN_URL),
  });
  const [token, setToken] = useState('');

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pat'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['spaces'] }),
    ]);
  const save = useMutation({
    mutationFn: () => api(TOKEN_URL, { method: 'PUT', json: { token } }),
    onSuccess: async () => {
      setToken('');
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => api(TOKEN_URL, { method: 'DELETE' }), onSuccess: refresh });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (token.trim()) save.mutate();
  }

  return (
    <main className="space-list">
      <h1>Profile</h1>
      <p>
        Signed in as <strong>{me.data?.displayName}</strong>
        {me.data?.email ? ` (${me.data.email})` : ''}.
      </p>

      {me.data?.azureDevOpsPat?.required && (
        <section aria-labelledby="pat-title">
          <h2 id="pat-title">Azure DevOps personal access token</h2>
          <p>
            This wiki works with Azure DevOps Server on your behalf using your own personal access token. Create one in
            Azure DevOps with the scope <strong>Code: Read &amp; Write</strong> and paste it below. It is stored encrypted and
            is never shown again.
          </p>
          {state.data?.registered ? (
            <p role="status">
              A token is registered{state.data.updatedAt ? ` (updated ${new Date(state.data.updatedAt).toLocaleString()})` : ''}.{' '}
              <button type="button" className="link-button danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Remove it
              </button>
            </p>
          ) : (
            <p role="status">No token is registered yet.</p>
          )}
          <form className="form" onSubmit={submit}>
            <label>
              {state.data?.registered ? 'Replace token' : 'Token'}
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            </label>
            {save.isError && (
              <p role="alert" className="error">
                {save.error instanceof ApiError ? save.error.message : 'The token could not be saved.'}
              </p>
            )}
            <button type="submit" className="primary" disabled={!token.trim() || save.isPending}>
              Save token
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
