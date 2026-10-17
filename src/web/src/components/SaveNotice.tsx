import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const NoticeContext = createContext<(message: string) => void>(() => {});

/** Non-blocking status messages (e.g. "merged with changes by …"), announced to screen readers. */
export function SaveNoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(undefined), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const show = useCallback((text: string) => setMessage(text), []);

  return (
    <NoticeContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className={message ? 'toast' : 'visually-hidden'}>
        {message}
      </div>
    </NoticeContext.Provider>
  );
}

export function useSaveNotice() {
  return useContext(NoticeContext);
}
