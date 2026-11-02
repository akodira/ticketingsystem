import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge, Card, EmptyState, PageHeading } from '@/components/ui/layout';
import { Link } from '@/i18n/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  INVITABLE_ROLES,
  allowedStatusTransitions,
  canManageUsers,
  isReadOnlyRoles,
  type AccountStatus,
} from '@/modules/identity/domain/user-rules';
import { PERMISSIONS, ROLES } from '@/modules/identity/domain/permissions';
import type { Role } from '@/modules/identity/domain/permissions';
import { InviteStaffForm } from './invite-form';
import { UserRowActions } from './user-row-actions';

type DirectoryRow = {
  user_id: string;
  email: string;
  full_name: string;
  account_status: AccountStatus;
  is_staff: boolean;
  roles: Role[];
  team_count: number;
  created_at: string;
  last_login_at: string | null;
  total_count: number;
};

const PAGE_SIZE = 25;

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q, role, status, page } = await searchParams;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) return null;

  const t = await getTranslations('users');
  const tRoles = await getTranslations('roles');

  const allowed = canManageUsers(user.roles);
  const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const offset = (pageNumber - 1) * PAGE_SIZE;

  let rows: DirectoryRow[] = [];
  let total = 0;
  let loadError: string | null = null;

  if (allowed) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('list_users', {
      p_search: q && q.trim() !== '' ? q.trim() : undefined,
      p_role: role && role !== '' ? (role as Role) : undefined,
      p_status: status && status !== '' ? (status as AccountStatus) : undefined,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      loadError = error.message;
    } else {
      rows = (data ?? []) as DirectoryRow[];
      total = rows[0]?.total_count ? Number(rows[0].total_count) : rows.length;
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Keeps the current filters while moving between pages. */
  const pageHref = (target: number) => {
    const query: Record<string, string | number> = { page: target };
    if (q) query.q = q;
    if (role) query.role = role;
    if (status) query.status = status;
    return { pathname: '/console/users' as const, query };
  };

  const statusTone = (value: AccountStatus) =>
    value === 'active' ? 'success' : value === 'pending' ? 'warning' : 'danger';

  return (
    <>
      <PageHeading
        title={t('title')}
        description={t('subtitle')}
        actions={
          allowed ? (
            <Link
              href="/console/teams"
              className="text-sm text-brand hover:underline"
            >
              {t('teamsLink')}
            </Link>
          ) : undefined
        }
      />

      {!allowed && (
        <Card>
          <p className="text-sm text-content-muted">
            {isReadOnlyRoles(user.roles) ? t('viewerNoAccess') : t('noAccess')}
          </p>
        </Card>
      )}

      {allowed && (
        <>
          <Card className="mb-6">
            <h2 className="text-sm font-semibold">{t('invite.title')}</h2>
            <p className="mt-1 mb-4 text-sm text-content-muted">{t('invite.subtitle')}</p>
            <InviteStaffForm locale={locale} roles={INVITABLE_ROLES} />
          </Card>

          <Card>
            <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="q" className="text-sm font-medium">
                  {t('search')}
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={q ?? ''}
                  placeholder={t('searchPlaceholder')}
                  className="h-10 w-56 rounded-md border border-border bg-surface px-3 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="role" className="text-sm font-medium">
                  {t('filterRole')}
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue={role ?? ''}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('all')}</option>
                  {ROLES.map((code) => (
                    <option key={code} value={code}>
                      {tRoles(code)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="status" className="text-sm font-medium">
                  {t('filterStatus')}
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={status ?? ''}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('all')}</option>
                  {(['pending', 'active', 'suspended', 'deactivated'] as AccountStatus[]).map(
                    (value) => (
                      <option key={value} value={value}>
                        {t(`status.${value}`)}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <button
                type="submit"
                className="h-10 rounded-md bg-brand px-4 text-sm font-medium text-brand-content"
              >
                {t('apply')}
              </button>
            </form>

            {loadError && (
              <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {t('loadError')}
              </p>
            )}

            {rows.length === 0 ? (
              <EmptyState title={t('empty')} description={t('emptyHint')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{t('title')}</caption>
                  <thead>
                    <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-content-muted">
                      <th scope="col" className="py-2 pe-4 text-start">
                        {t('columns.name')}
                      </th>
                      <th scope="col" className="py-2 pe-4 text-start">
                        {t('columns.status')}
                      </th>
                      <th scope="col" className="py-2 pe-4 text-start">
                        {t('columns.roles')}
                      </th>
                      <th scope="col" className="py-2 pe-4 text-start">
                        {t('columns.teams')}
                      </th>
                      <th scope="col" className="py-2 text-start">
                        {t('columns.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.user_id} className="border-b border-border/60 align-top">
                        <td className="py-3 pe-4">
                          <div className="font-medium">
                            {row.full_name}
                            {row.user_id === user.id && (
                              <span className="ms-2 text-xs font-normal text-content-muted">
                                ({t('you')})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-content-muted">{row.email}</div>
                        </td>
                        <td className="py-3 pe-4">
                          <Badge tone={statusTone(row.account_status)}>
                            {t(`status.${row.account_status}`)}
                          </Badge>
                        </td>
                        <td className="py-3 pe-4">
                          <div className="flex flex-wrap gap-1">
                            {row.roles.length === 0 ? (
                              <span className="text-xs text-content-muted">{t('noRoles')}</span>
                            ) : (
                              row.roles.map((code) => (
                                <Badge key={code} tone={code === 'admin' ? 'brand' : 'neutral'}>
                                  {tRoles(code)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-3 pe-4 text-content-muted">{row.team_count}</td>
                        <td className="py-3">
                          <UserRowActions
                            userId={row.user_id}
                            roles={row.roles}
                            accountStatus={row.account_status}
                            availableRoles={INVITABLE_ROLES.filter(
                              (candidate) => !row.roles.includes(candidate),
                            )}
                            availableStatuses={allowedStatusTransitions(row.account_status)}
                            locale={locale}
                          />                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pageCount > 1 && (
              <nav className="mt-5 flex items-center justify-between text-sm" aria-label={t('pagination')}>
                <span className="text-content-muted">
                  {t('pageOf', {
                    page: pageNumber,
                    pages: pageCount,
                    total,
                  })}
                </span>
                <div className="flex gap-2">
                  {pageNumber > 1 && (
                    <Link
                      href={pageHref(pageNumber - 1)}
                      className="rounded-md border border-border px-3 py-1.5"
                    >
                      {t('previous')}
                    </Link>
                  )}
                  {pageNumber < pageCount && (
                    <Link
                      href={pageHref(pageNumber + 1)}
                      className="rounded-md border border-border px-3 py-1.5"
                    >
                      {t('next')}
                    </Link>
                  )}
                </div>
              </nav>
            )}
          </Card>

          <p className="mt-4 text-xs text-content-muted">
            {t('permissionCount', { count: PERMISSIONS.length })}
          </p>
        </>
      )}
    </>
  );
}