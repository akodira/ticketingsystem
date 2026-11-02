import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('landing');
  const tc = await getTranslations('common');

  const user = isSupabaseConfigured() ? await getSessionUser() : null;
  const homeHref = user ? (user.isStaff ? '/console' : '/portal') : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-md bg-brand text-sm font-semibold text-brand-content"
          >
            CTS
          </span>
          <span className="text-sm font-medium">{tc('appName')}</span>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher currentLocale={locale} />
          {homeHref ? (
            <Button asChild size="sm">
              <Link href={homeHref}>{tc('continue')}</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link href="/sign-in">{tc('signIn')}</Link>
            </Button>
          )}
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pt-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">{t('eyebrow')}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-content-muted">{t('subtitle')}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={homeHref ?? '/sign-in'}>
                {homeHref ? tc('continue') : t('ctaPrimary')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/sign-up">{t('ctaSecondary')}</Link>
            </Button>
          </div>

          <dl className="mt-16 grid gap-6 sm:grid-cols-3">
            {(['track', 'respond', 'sla'] as const).map((key) => (
              <div key={key} className="rounded-lg border border-border bg-surface p-6">
                <dt className="text-sm font-semibold text-content">{t(`features.${key}Title`)}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-content-muted">
                  {t(`features.${key}Body`)}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 text-sm text-content-muted">{t('staffNote')}</p>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-content-muted">
        {tc('appName')}
      </footer>
    </div>
  );
}