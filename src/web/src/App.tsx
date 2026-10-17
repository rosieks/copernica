import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { api, isUnauthenticated, type Schemas } from './api/client';
import { SignIn } from './pages/SignIn';
import { SpaceList } from './pages/SpaceList';
import { SpaceLayout } from './pages/SpaceLayout';
import { Profile } from './pages/Profile';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Schemas['User']>('/api/me') });
}

export function App() {
  const location = useLocation();
  const me = useMe();

  if (location.pathname === '/signin') {
    return <SignIn />;
  }

  if (me.isPending) {
    return <p className="status">Loading…</p>;
  }

  if (me.isError) {
    if (isUnauthenticated(me.error)) {
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/signin?returnUrl=${returnUrl}`} replace />;
    }
    return <p className="status error">The wiki is not available: {me.error.message}</p>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          Copernica
        </Link>
        <UserMenu user={me.data} />
      </header>
      {me.data.azureDevOpsPat?.required && !me.data.azureDevOpsPat.registered && location.pathname !== '/profile' && (
        <div role="status" className="banner warning">
          To see and edit Azure DevOps spaces, <Link to="/profile">register your personal access token</Link>.
        </div>
      )}
      <Routes>
        <Route path="/" element={<SpaceList />} />
        <Route path="/s/:spaceId/*" element={<SpaceLayout />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<p className="status">Page not found.</p>} />
      </Routes>
    </div>
  );
}

function UserMenu({ user }: { user: Schemas['User'] }) {
  const queryClient = useQueryClient();

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    queryClient.clear();
    window.location.assign('/signin');
  }

  return (
    <div className="user-menu">
      <Link to="/profile">{user.displayName}</Link>
      <button type="button" className="link-button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
