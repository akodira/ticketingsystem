import { forwardRef, type InputHTMLAttributes, useId } from 'react';

import { cn } from '@/lib/utils';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  /** Translation key or already-translated text. */
  required?: boolean;
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps;

/**
 * Text input with an accessible label, hint and error message.
 * The error is linked through aria-describedby so screen readers announce it,
 * and aria-invalid marks the control for assistive technology.
 */
export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, hint, error, required, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-content">
        {label}
        {required && (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        className={cn(
          'h-11 w-full rounded-md border bg-surface px-3 text-sm text-content',
          'placeholder:text-content-muted/70 focus-visible:outline-2 focus-visible:outline-offset-1',
          error
            ? 'border-danger focus-visible:outline-danger'
            : 'border-border focus-visible:outline-brand',
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-content-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});