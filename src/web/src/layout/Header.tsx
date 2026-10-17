import { Link, Route, Routes } from 'react-router';
import { HamburgerMenuIcon } from '@radix-ui/react-icons';
import type { Schemas } from '../api/client';
import { IconButton } from '../ui';
import { useShell } from './ShellContext';
import { SpaceSwitcher } from './SpaceSwitcher';
import { UserMenu } from './UserMenu';
import { MEDIUM, useMediaQuery } from './useMediaQuery';

export function Header({ user }: { user: Schemas['User'] }) {
  const { hasNav, setNavOpen, navTrigger } = useShell();
  const medium = useMediaQuery(MEDIUM);

  return (
    <header className="header">
      {hasNav && !medium && (
        <IconButton ref={navTrigger} label="Open navigation" icon={<HamburgerMenuIcon />} onClick={() => setNavOpen(true)} />
      )}
      <Link to="/" className="header__brand">
        Copernica
      </Link>
      <Routes>
        <Route path="/s/:spaceId/*" element={<SpaceSwitcher />} />
        <Route path="*" element={null} />
      </Routes>
      <span className="header__spacer" />
      <UserMenu user={user} />
    </header>
  );
}
