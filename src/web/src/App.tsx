import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { api, isUnauthenticated, type Schemas } from './api/client';
import { SignIn } from './pages/SignIn';
import { SpaceList } from './pages/SpaceList';
import { SpaceLayout } from './pages/SpaceLayout';
import { Profile } from './pages/Profile';
import { Header } from './layout/Header';
import { RouteAnnouncer, useDocumentTitle } from './layout/RouteAnnouncer';
import { ShellProvider, useShell } from './layout/ShellContext';
import { SkipLink } from './layout/SkipLink';
import { ShortcutHelp, useShortcut } from './shortcuts';
import { Callout, EmptyState } from './ui';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Schemas['User']>('/api/me') });
}

export function App() {
  const location = useLocation();
  const me = useMe();
  const navTrigger = useRef<HTMLButtonElement>(null);

  if (location.pathname === '/signin') {
    return (
      <>
        <SkipLink />
        <SignIn />
      </>
    );
  }

  if (me.isPending) {
    return (
      <p className="status" role="status">
        Loading…
      </p>
    );
  }

  if (me.isError) {
    if (isUnauthenticated(me.error)) {
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/signin?returnUrl=${returnUrl}`} replace />;
    }
    return (
      <main id="main" className="main">
        <Callout tone="danger" title="The wiki is not available.">
          {me.error.message}
        </Callout>
      </main>
    );
  }

  return (
    <ShellProvider navTrigger={navTrigger}>
      <div className="app">
        <SkipLink />
        <Header user={me.data} />
        {me.data.azureDevOpsPat?.required && !me.data.azureDevOpsPat.registered && location.pathname !== '/profile' && (
          <div className="main">
            <Callout tone="warning" title="Personal access token needed">
              To see and edit Azure DevOps spaces, <Link to="/profile">register your personal access token</Link>.
            </Callout>
          </div>
        )}
        <Routes>
          <Route path="/" element={<SpaceList />} />
          <Route path="/s/:spaceId/*" element={<SpaceLayout />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <GlobalShortcuts />
        <RouteAnnouncer />
      </div>
    </ShellProvider>
  );
}

function GlobalShortcuts() {
  const { helpOpen, setHelpOpen } = useShell();
  useShortcut({ key: '?', single: true, label: '?', description: 'Show keyboard shortcuts', group: 'Global', handler: () => setHelpOpen(true) });
  return <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />;
}

function NotFound() {
  useDocumentTitle('Not found');
  return (
    <main id="main" className="main">
      <h1 className="visually-hidden">Not found</h1>
      <EmptyState title="Page not found." action={<Link to="/">Go to the space list</Link>} />
    </main>
  );
}
