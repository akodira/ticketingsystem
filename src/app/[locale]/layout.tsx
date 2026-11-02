import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { routing } from '@/i18n/routing';
import { isSupabaseConfigured } from '@/lib/env';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-content antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {!isSupabaseConfigured() && (
          <div
            role="status"
            className="fixed inset-x-0 bottom-0 z-50 bg-warning-surface px-4 py-2 text-center text-sm text-warning-content"
          >
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and
            add your project URL and anon key.
          </div>
        )}
      </body>
    </html>
  );
}