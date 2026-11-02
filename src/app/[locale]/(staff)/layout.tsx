import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConsoleNav } from '@/components/console-nav';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { signOutAction } from '@/modules/identity/services/auth.actions';

/**
 * Session-dependent: never prerender. Every route in this tree is gated by the
 * guard below, which reads cookies on each request.
 */
export const dynamic = 'force-dynamic';

/**
 * Support console layout.
 *
 * Staff-only. A signed-in customer who navigates here is redirected to the
 * portal rather than shown a 403, which avoids confirming that the route exists;
 * the actual data protection is RLS, not this redirect.
 */
export default async function ConsoleLayout({
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
    redirect(`/${locale}/sign-in?next=/console`);
  }

  if (!user.isStaff) {
    redirect(`/${locale}/portal`);
  }

  if (user.profile.account_status !== 'active') {
    redirect(`/${locale}/sign-in?reason=suspended`);
  }

  const t = await getTranslations('nav');
  const tc = await getTranslations('common');

  const navItems = [
    { href: '/console', labelKey: 'overview' },
    { href: '/console/teams', labelKey: 'teams' },
    ...(user.roles.includes('admin')
      ? [{ href: '/console/users', labelKey: 'users' }]
      : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-md bg-content text-xs font-semibold text-surface"
            >
              CTS
            </span>
            <Link href="/console" className="text-sm font-medium">
              {t('console')}
            </Link>
          </div>

          <ConsoleNav items={navItems} />

          <div className="flex items-center gap-1">
            <LocaleSwitcher currentLocale={locale} />
            <form action={signOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="ghost" size="sm">
                {tc('signOut')}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</div>

      <footer className="border-t border-border px-4 py-5 text-center text-xs text-content-muted">
        {user.email} · {user.roles.join(', ')}
      </footer>
    </div>
  );
}