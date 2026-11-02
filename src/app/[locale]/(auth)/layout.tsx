import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';

/**
 * Authentication layout: a single narrow column with the product mark and a
 * language switch. Deliberately different from both the portal and the console
 * so a user always knows they are in the sign-in flow.
 *
 * Rendered per request: the sign-in and sign-up pages check for an existing
 * session and redirect, which must not be frozen at build time.
 */
export const dynamic = 'force-dynamic';

export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-md bg-brand text-sm font-semibold text-brand-content"
          >
            CTS
          </span>
          <span className="text-sm font-medium text-content">Customer Ticketing System</span>
        </Link>
        <LocaleSwitcher currentLocale={locale} />
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}