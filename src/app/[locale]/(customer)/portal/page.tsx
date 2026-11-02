import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge, Card, PageHeading } from '@/components/ui/layout';
import { getSessionUser } from '@/lib/auth/session';

export default async function PortalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) return null;

  const t = await getTranslations('portal');
  const status = user.profile.account_status;
  const statusTone = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'danger';

  return (
    <>
      <PageHeading title={t('welcome', { name: user.profile.full_name })} description={t('title')} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-content">{t('status')}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-content-muted">{t('status')}</dt>
              <dd>
                <Badge tone={statusTone}>{t(`statusLabels.${status}`)}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-content-muted">{t('emailVerified')}</dt>
              <dd className="text-content">
                {user.profile.email_verified_at ? t('verified') : t('notVerified')}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-content-muted">{t('accountType')}</dt>
              <dd className="text-content">{user.roles.join(', ')}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-content">{t('profileTitle')}</h2>
          <p className="mt-2 text-sm text-content-muted">{t('profileSubtitle')}</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-content-muted">{t('profileTitle')}</dt>
              <dd className="text-content">{user.profile.full_name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-content-muted">Email</dt>
              <dd className="text-content">{user.email}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mt-6">
        <p className="text-sm text-content-muted">{t('phaseNote')}</p>
      </Card>
    </>
  );
}