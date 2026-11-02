import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/layout';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { ResetPasswordForm } from '../password-forms';

/**
 * Reached through the recovery email link, which exchanges the code for a
 * session in /auth/callback before redirecting here. Without a session this
 * page is useless, so it says so rather than showing a form that cannot work.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  const user = isSupabaseConfigured() ? await getSessionUser() : null;

  if (!user) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-content">{t('resetTitle')}</h1>
        <p className="mt-2 text-sm text-content-muted">{t('forgotSubtitle')}</p>
        <a href="forgot-password" className="mt-4 inline-block text-sm text-brand hover:underline">
          {t('sendResetLink')}
        </a>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold text-content">{t('resetTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-content-muted">{t('resetSubtitle')}</p>
      <ResetPasswordForm locale={locale} />
    </Card>
  );
}