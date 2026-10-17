import type { ReactNode } from 'react';
import { CheckIcon, Cross2Icon, CrossCircledIcon, ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { IconButton } from './IconButton';
import './Callout.css';

export type CalloutTone = 'info' | 'warning' | 'danger' | 'success';

interface CalloutProps {
  tone: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  /** Defaults to `alert` for danger and `status` otherwise. */
  role?: 'status' | 'alert' | 'note';
  className?: string;
}

const ICONS: Record<CalloutTone, ReactNode> = {
  info: <InfoCircledIcon />,
  warning: <ExclamationTriangleIcon />,
  danger: <CrossCircledIcon />,
  success: <CheckIcon />,
};

/** State indicators and inline errors: always an icon and text, never colour alone (FR-005). */
export function Callout({ tone, title, children, actions, onDismiss, role, className }: CalloutProps) {
  return (
    <div role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={['ui-callout', `ui-callout--${tone}`, className].filter(Boolean).join(' ')}>
      <span className="ui-callout__icon" aria-hidden="true">
        {ICONS[tone]}
      </span>
      <div className="ui-callout__body">
        {title && <p className="ui-callout__title">{title}</p>}
        {children && <div className="ui-callout__text">{children}</div>}
        {actions && <div className="ui-callout__actions">{actions}</div>}
      </div>
      {onDismiss && <IconButton label="Dismiss" icon={<Cross2Icon />} size="sm" tooltip={false} onClick={onDismiss} />}
    </div>
  );
}
