import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Page-level container that keeps every screen on the same rhythm. */
export function PageShell({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'narrow';
}) {
  return (
    <main
      id="main"
      className={cn(
        'mx-auto w-full px-4 py-8 sm:px-6 lg:px-8',
        width === 'narrow' && 'max-w-md',
        width === 'default' && 'max-w-4xl',
        width === 'wide' && 'max-w-6xl',
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Card surface used for forms, panels and summaries. */
export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Component
      className={cn(
        'rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-content-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

const TONES = {
  neutral: 'bg-surface-raised text-content-muted border-border',
  brand: 'bg-brand-soft text-brand border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  warning: 'bg-warning-surface text-warning-content border-transparent',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-raised px-6 py-12 text-center">
      <p className="text-sm font-medium text-content">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-content-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}