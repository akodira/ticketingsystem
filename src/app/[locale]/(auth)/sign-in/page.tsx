import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/layout';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { SignInForm } from './sign-in-form';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);

  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (user) {
      redirect(`/${locale}${user.isStaff ? '/console' : '/portal'}`);
    }
  }

  const t = await getTranslations('auth');

  return (
    <Card>
      <h1 className="text-xl font-semibold text-content">{t('signInTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-content-muted">{t('signInSubtitle')}</p>
      <SignInForm locale={locale} nextPath={next} />
    </Card>
  );
}