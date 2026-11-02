import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge, Card, EmptyState, PageHeading } from '@/components/ui/layout';
import { Link } from '@/i18n/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canManageUsers } from '@/modules/identity/domain/user-rules';

type TeamRow = {
  team_id: string;
  code: string;
  name_en: string;
  name_ar: string;
  department_en: string;
  is_default: boolean;
  member_count: number;
};

export default async function TeamsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) return null;

  const t = await getTranslations('teams');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_teams');

  const teams = (data ?? []) as TeamRow[];

  return (
    <>
      <PageHeading
        title={t('title')}
        description={t('subtitle')}
        actions={
          canManageUsers(user.roles) ? (
            <Link href="/console/users" className="text-sm text-brand hover:underline">
              {t('usersLink')}
            </Link>
          ) : undefined
        }
      />

      <Card>
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {t('loadError')}
          </p>
        ) : teams.length === 0 ? (
          <EmptyState title={t('empty')} description={t('emptyHint')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-content-muted">
                  <th scope="col" className="py-2 pe-4 text-start">
                    {t('columns.team')}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start">
                    {t('columns.code')}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start">
                    {t('columns.department')}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start">
                    {t('columns.members')}
                  </th>
                  <th scope="col" className="py-2 text-start">
                    {t('columns.role')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.team_id} className="border-b border-border/60">
                    <td className="py-3 pe-4 font-medium">
                      {locale === 'ar' ? team.name_ar : team.name_en}
                    </td>
                    <td className="py-3 pe-4">
                      <code className="text-xs text-content-muted">{team.code}</code>
                    </td>
                    <td className="py-3 pe-4 text-content-muted">{team.department_en}</td>
                    <td className="py-3 pe-4 text-content-muted">{team.member_count}</td>
                    <td className="py-3">
                      {team.is_default ? (
                        <Badge tone="brand">{t('defaultTeam')}</Badge>
                      ) : (
                        <span className="text-xs text-content-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-content-muted">{t('phaseNote')}</p>
    </>
  );
}