import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/layout';
import { ResendVerificationForm } from '../../resend-verification-form';

export default async function CheckEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  const { email } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <Card>
      <h1 className="text-xl font-semibold text-content">{t('verifyTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-content-muted">
        {t('verifySubtitle', { email: email ?? '' })}
      </p>
      {email && <ResendVerificationForm email={email} locale={locale} />}
    </Card>
  );
}