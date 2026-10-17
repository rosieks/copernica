import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useMe } from '../App';
import { absoluteTime } from '../format';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { SingleKeyToggle } from '../shortcuts';
import { AlertDialog, Badge, Button, Callout, Field, Separator, useToast } from '../ui';

const TOKEN_URL = '/api/me/tokens/azure-devops';

/** S7: account, Azure DevOps token and interface preferences. */
export function Profile() {
  const me = useMe();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  useDocumentTitle('Profile');
  const state = useQuery({
    queryKey: ['pat'],
    queryFn: () => api<{ registered: boolean; updatedAt: string | null }>(TOKEN_URL),
    enabled: !!me.data?.azureDevOpsPat?.required,
  });
  const [token, setToken] = useState('');
  const [removing, setRemoving] = useState(false);

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
      notify({ tone: 'success', title: 'Token saved' });
    },
  });
  const remove = useMutation({ mutationFn: () => api(TOKEN_URL, { method: 'DELETE' }), onSuccess: refresh });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (token.trim()) save.mutate();
  }

  return (
    <main id="main" className="main page-section">
      <h1>Profile</h1>

      <section aria-labelledby="account-title" className="stack">
        <h2 id="account-title">Account</h2>
        <dl className="profile__facts">
          <dt>Name</dt>
          <dd>{me.data?.displayName}</dd>
          <dt>Email</dt>
          <dd>{me.data?.email ?? <span className="muted">Not provided</span>}</dd>
        </dl>
      </section>

      {me.data?.azureDevOpsPat?.required && (
        <>
          <Separator />
          <section aria-labelledby="pat-title" className="stack">
            <h2 id="pat-title">Azure DevOps personal access token</h2>
            <p>
              This wiki works with Azure DevOps Server on your behalf using your own personal access token. Create one in Azure
              DevOps with the scope <strong>Code: Read &amp; Write</strong> and paste it below. It is stored encrypted and is never
              shown again.
            </p>
            <div className="row">
              {state.data?.registered ? (
                <>
                  <Badge tone="success">Registered</Badge>
                  {state.data.updatedAt && <span className="muted">Updated {absoluteTime(state.data.updatedAt)}</span>}
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>
                    Remove token…
                  </Button>
                </>
              ) : (
                <Badge tone="warning">Not registered</Badge>
              )}
            </div>
            <form className="stack" onSubmit={submit}>
              <Field
                label={state.data?.registered ? 'Replace token' : 'Token'}
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              {save.isError && (
                <Callout tone="danger" title="The token could not be saved." onDismiss={() => save.reset()}>
                  {save.error instanceof ApiError ? save.error.message : undefined}
                </Callout>
              )}
              <div>
                <Button type="submit" variant="primary" disabled={!token.trim() || save.isPending}>
                  Save token
                </Button>
              </div>
            </form>
            <AlertDialog
              open={removing}
              onOpenChange={setRemoving}
              title="Remove your token?"
              description="Azure DevOps spaces will not be available until you register a new token."
              confirmLabel="Remove token"
              busy={remove.isPending}
              onConfirm={() => remove.mutateAsync().then(() => undefined)}
            />
          </section>
        </>
      )}

      <Separator />
      <section aria-labelledby="shortcuts-title" className="stack">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <SingleKeyToggle />
        <p className="muted">This setting is stored in this browser only.</p>
      </section>
    </main>
  );
}
