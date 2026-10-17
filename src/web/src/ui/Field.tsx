import { forwardRef, useId, type InputHTMLAttributes, type Ref, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Label } from 'radix-ui';
import { CrossCircledIcon } from '@radix-ui/react-icons';
import './Field.css';

interface Common {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Visually hide the label (it still names the control). */
  hideLabel?: boolean;
  className?: string;
}

type InputFieldProps = Common & { as?: 'input' } & InputHTMLAttributes<HTMLInputElement>;
type TextareaFieldProps = Common & { as: 'textarea' } & TextareaHTMLAttributes<HTMLTextAreaElement>;
type SelectFieldProps = Common & { as: 'select'; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>;
export type FieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** A labelled native control with hint and error wired to aria-describedby / aria-invalid. */
export const Field = forwardRef<FieldElement, FieldProps>(function Field(props, ref) {
  const { label, hint, error, hideLabel, className, id: givenId, as = 'input', ...control } = props as Common & {
    as?: 'input' | 'textarea' | 'select';
    id?: string;
  } & Record<string, unknown>;
  const generated = useId();
  const id = givenId ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const shared = {
    id,
    className: 'ui-field__control',
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  };

  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <Label.Root htmlFor={id} className={hideLabel ? 'visually-hidden' : 'ui-field__label'}>
        {label}
      </Label.Root>
      {as === 'textarea' ? (
        <textarea ref={ref as Ref<HTMLTextAreaElement>} {...shared} {...(control as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : as === 'select' ? (
        <select ref={ref as Ref<HTMLSelectElement>} {...shared} {...(control as SelectHTMLAttributes<HTMLSelectElement>)} />
      ) : (
        <input ref={ref as Ref<HTMLInputElement>} {...shared} {...(control as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {hint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field__error">
          <CrossCircledIcon aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
});
