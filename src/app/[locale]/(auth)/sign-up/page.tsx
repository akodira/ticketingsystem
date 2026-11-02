import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/layout';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { SignUpForm } from './sign-up-form';

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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
      <h1 className="text-xl font-semibold text-content">{t('signUpTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-content-muted">{t('signUpSubtitle')}</p>
      <SignUpForm locale={locale} />
    </Card>
  );
}