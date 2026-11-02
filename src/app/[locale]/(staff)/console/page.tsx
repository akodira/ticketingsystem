import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge, Card, PageHeading } from '@/components/ui/layout';
import { Link } from '@/i18n/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canManageUsers, isReadOnlyRoles } from '@/modules/identity/domain/user-rules';

export default async function ConsolePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) return null;

  const t = await getTranslations('console');
  const tRoles = await getTranslations('roles');
  const readOnly = isReadOnlyRoles(user.roles);

  return (
    <>
      <PageHeading
        title={t('title')}
        description={t('welcome', { name: user.profile.full_name })}
        actions={readOnly ? <Badge tone="warning">{t('viewerNote')}</Badge> : undefined}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">{t('roles')}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <li key={role}>
                <Badge tone={role === 'admin' ? 'brand' : 'neutral'}>{tRoles(role)}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold">{t('teams')}</h2>
          {user.teamIds.length === 0 ? (
            <p className="mt-3 text-sm text-content-muted">{t('noTeams')}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {user.teamIds.map((teamId) => (
                <li key={teamId} className="flex items-center justify-between gap-3">
                  <code className="text-xs text-content-muted">{teamId}</code>
                  {user.leaderTeamIds.includes(teamId) && <Badge tone="brand">{t('leader')}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canManageUsers(user.roles) && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold">{t('manageUsersTitle')}</h2>
            <p className="mt-2 text-sm text-content-muted">{t('manageUsersBody')}</p>
            <Link href="/console/users" className="mt-4 inline-block text-sm text-brand hover:underline">
              {t('manageUsersLink')}
            </Link>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold">{t('manageTeamsTitle')}</h2>
            <p className="mt-2 text-sm text-content-muted">{t('manageTeamsBody')}</p>
            <Link href="/console/teams" className="mt-4 inline-block text-sm text-brand hover:underline">
              {t('manageTeamsLink')}
            </Link>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <p className="text-sm text-content-muted">{t('phaseNote')}</p>
      </Card>
    </>
  );
}