import { createContext, useContext, useMemo, useState, type ReactNode, type RefObject } from 'react';

interface ShellState {
  /** True while a screen with a navigation region (a space) is shown. */
  hasNav: boolean;
  setHasNav: (value: boolean) => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  /** The header button that opens the navigation sheet (focus returns there). */
  navTrigger: RefObject<HTMLButtonElement | null>;
}

const ShellContext = createContext<ShellState | undefined>(undefined);

export function ShellProvider({ navTrigger, children }: { navTrigger: RefObject<HTMLButtonElement | null>; children: ReactNode }) {
  const [hasNav, setHasNav] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const value = useMemo(
    () => ({ hasNav, setHasNav, navOpen, setNavOpen, helpOpen, setHelpOpen, navTrigger }),
    [hasNav, navOpen, helpOpen, navTrigger],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('useShell outside ShellProvider');
  return shell;
}
