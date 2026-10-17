import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Toast as Primitive } from 'radix-ui';
import { CheckIcon, Cross2Icon, CrossCircledIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import './Toast.css';

export type ToastTone = 'success' | 'info' | 'danger';

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onSelect: () => void };
  /** Milliseconds; never less than 5000 (FR-006). */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  open: boolean;
}

export const MIN_TOAST_DURATION = 5000;
const DEFAULT_DURATION: Record<ToastTone, number> = { success: 6000, info: 8000, danger: 8000 };

export function toastDuration(input: Pick<ToastInput, 'tone' | 'duration'>): number {
  return Math.max(MIN_TOAST_DURATION, input.duration ?? DEFAULT_DURATION[input.tone]);
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckIcon />,
  info: <InfoCircledIcon />,
  danger: <CrossCircledIcon />,
};

let nextId = 1;

/**
 * Transient outcome messages (research R8). The provider sits at the app root, so toasts
 * survive navigation; the viewport is a polite live region focusable with F8.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((toast: ToastInput) => {
    setToasts((current) => [...current, { ...toast, id: nextId++, open: true }]);
  }, []);

  const close = useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, open: false } : t)));
    // Leave time for the exit state before removing the item.
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 300);
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      <Primitive.Provider label="Notification" swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <Primitive.Root
            key={t.id}
            className={`ui-toast ui-toast--${t.tone}`}
            open={t.open}
            duration={toastDuration(t)}
            onOpenChange={(open) => {
              if (!open) close(t.id);
            }}
          >
            <span className="ui-toast__icon" aria-hidden="true">
              {ICONS[t.tone]}
            </span>
            <div className="ui-toast__text">
              <Primitive.Title className="ui-toast__title">{t.title}</Primitive.Title>
              {t.description && <Primitive.Description className="ui-toast__description">{t.description}</Primitive.Description>}
            </div>
            {t.action && (
              <Primitive.Action className="ui-toast__action ui-button ui-button--sm ui-button--secondary" altText={t.action.label} onClick={t.action.onSelect}>
                {t.action.label}
              </Primitive.Action>
            )}
            <Primitive.Close className="ui-toast__close ui-button ui-button--sm ui-button--ghost ui-button--icon-only" aria-label="Dismiss">
              <Cross2Icon aria-hidden="true" />
            </Primitive.Close>
          </Primitive.Root>
        ))}
        <Primitive.Viewport className="ui-toast-viewport" />
      </Primitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return { notify: useContext(ToastContext) };
}
