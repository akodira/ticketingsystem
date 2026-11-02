import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { Card, PageHeading } from '@/components/ui/layout';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { ProfileForm } from './profile-form';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (!isSupabaseConfigured()) redirect(`/${locale}/sign-in`);

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/sign-in?next=/profile`);
  if (user.isStaff) redirect(`/${locale}/console`);

  const t = await getTranslations('portal');
  const tc = await getTranslations('common');

  return (
    <>
      <PageHeading
        title={t('profileTitle')}
        description={t('profileSubtitle')}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal">{tc('back')}</Link>
          </Button>
        }
      />

      <Card>
        <ProfileForm
          locale={locale}
          initial={{
            fullName: user.profile.full_name,
            phone: user.profile.phone ?? '',
            locale: user.profile.locale === 'ar' ? 'ar' : 'en',
          }}
        />
      </Card>
    </>
  );
}