import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

import { Card } from '@/components/ui/layout';
import { ForgotPasswordForm } from '../password-forms';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <Card>
      <h1 className="text-xl font-semibold text-content">{t('forgotTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-content-muted">{t('forgotSubtitle')}</p>
      <ForgotPasswordForm locale={locale} />
      <p className="mt-6 text-center text-sm">
        <Link href="/sign-in" className="text-brand hover:underline">
          {t('backToSignIn')}
        </Link>
      </p>
    </Card>
  );
}