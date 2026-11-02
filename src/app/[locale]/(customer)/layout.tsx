import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { signOutAction } from '@/modules/identity/services/auth.actions';

/**
 * Session-dependent: never prerender. The guard below reads cookies, and a
 * statically generated copy would either leak a redirect or fail at request
 * time when the runtime finally reads them.
 */
export const dynamic = 'force-dynamic';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * Customer portal layout.
 *
 * Authorization: an unauthenticated visitor is redirected to sign-in, and a
 * staff member is sent to the console — a support employee is not a customer in
 * this system (docs/OPEN_DECISIONS.md D-09). RLS still applies to every query
 * made by the pages inside, so this guard is the first of two layers.
 */
export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isSupabaseConfigured()) {
    redirect(`/${locale}/sign-in`);
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/sign-in?next=/portal`);
  }

  if (user.isStaff) {
    redirect(`/${locale}/console`);
  }

  if (user.profile.account_status === 'suspended' || user.profile.account_status === 'deactivated') {
    redirect(`/${locale}/sign-in?reason=suspended`);
  }

  const t = await getTranslations('nav');

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-md bg-brand text-xs font-semibold text-brand-content"
            >
              CTS
            </span>
            <Link href="/portal" className="text-sm font-medium">
              {t('portal')}
            </Link>
          </div>

          <nav className="flex items-center gap-1" aria-label={t('portal')}>
            <Link
              href="/profile"
              className="rounded-md px-3 py-2 text-sm text-content-muted hover:bg-surface-raised hover:text-content"
            >
              {t('profile')}
            </Link>
            <LocaleSwitcher currentLocale={locale} />
            <form action={signOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="ghost" size="sm">
                {await getTranslations('common').then((c) => c('signOut'))}
              </Button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</div>

      <footer className="border-t border-border px-4 py-5 text-center text-xs text-content-muted">
        {user.email}
      </footer>
    </div>
  );
}