'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/auth/session';
import { logger, describeError } from '@/lib/logger';
import { emailSchema, fieldErrors, fullNameSchema } from '@/lib/validation';
import {
  canChangeAccountStatus,
  canGrantRole,
  canInvite,
  canRevokeRole,
  type AccountStatus,
} from '@/modules/identity/domain/user-rules';
import { ROLES, type Role } from '@/modules/identity/domain/permissions';
import type { UserAdminActionState } from './user-admin-types';

/**
 * User administration.
 *
 * Two layers of authorization, deliberately:
 *   1. here, so the UI gets a typed, translated refusal;
 *   2. in the database RPCs (0009), because a server action can be invoked
 *      directly and must not be the only guard.
 *
 * The invitation itself uses the service-role client because creating an
 * auth.users row is a privileged operation that RLS cannot express. That is the
 * single reason this module may import the admin client.
 */

function localeFromForm(formData: FormData): 'en' | 'ar' {
  return String(formData.get('locale') ?? 'en') === 'ar' ? 'ar' : 'en';
}

const inviteSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  role: z.enum(ROLES),
});

/** Maps a Postgres error raised by an RPC to a translation key. */
function rpcErrorKey(message: string | undefined): string {
  const text = (message ?? '').toLowerCase();
  if (text.includes('last active administrator')) return 'errors.lastAdmin';
  if (text.includes('mutually exclusive')) return 'errors.roleConflict';
  if (text.includes('permission denied')) return 'errors.unauthorized';
  if (text.includes('illegal account status')) return 'errors.statusTransition';
  if (text.includes('only staff accounts')) return 'errors.staffOnlyTeams';
  if (text.includes('only an administrator can appoint')) return 'errors.leaderAdminOnly';
  return 'errors.generic';
}

export async function inviteStaffAction(
  _previous: UserAdminActionState,
  formData: FormData,
): Promise<UserAdminActionState> {
  const locale = localeFromForm(formData);

  const actor = await getSessionUser();
  if (!actor) return { ok: false, message: 'errors.unauthorized' };
  if (!actor.isStaff || actor.profile.account_status !== 'active') {
    return { ok: false, message: 'errors.unauthorized' };
  }

  const parsed = inviteSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    role: formData.get('role'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const role = parsed.data.role as Role;

  if (!canInvite(actor.roles, role)) {
    return { ok: false, message: 'errors.unauthorized' };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    logger.error('user.invite_not_configured');
    return { ok: false, message: 'errors.inviteNotConfigured' };
  }

  const appUrl = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');

  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName, locale, invited_role: role },
    redirectTo: appUrl ? `${appUrl}/auth/callback?locale=${locale}&next=/console` : undefined,
  });

  if (error) {
    const text = (error.message ?? '').toLowerCase();
    logger.warn('user.invite_failed', { code: error.status ?? 'unknown' });

    if (text.includes('already been registered') || text.includes('already registered')) {
      return { ok: false, message: 'errors.emailInUse' };
    }
    if (text.includes('rate limit') || text.includes('too many')) {
      return { ok: false, message: 'errors.rateLimited' };
    }
    return { ok: false, message: 'errors.generic' };
  }

  const invitedId = data?.user?.id;

  if (!invitedId) {
    logger.error('user.invite_no_user_returned');
    return { ok: false, message: 'errors.generic' };
  }

  // The invite creates the auth user; the role is granted through the RPC so the
  // same guards (staff/customer exclusivity, audit) apply as for an existing user.
  const supabase = await createSupabaseServerClient();
  const { error: roleError } = await supabase.rpc('set_user_role', {
    p_user_id: invitedId,
    p_role: role,
    p_grant: true,
  });

  if (roleError) {
    logger.error('user.invite_role_failed', { error: describeError(roleError) });
    return { ok: false, message: rpcErrorKey(roleError.message) };
  }

  // An invited staff member must be usable as soon as they accept, so the
  // account is activated; the invite email proves control of the address.
  await supabase.rpc('set_account_status', { p_user_id: invitedId, p_status: 'active' });

  logger.info('user.invited', { role });

  revalidatePath(`/${locale}/console/users`);

  return { ok: true, message: 'users.invite.sent' };
}

export async function grantRoleAction(
  _previous: UserAdminActionState,
  formData: FormData,
): Promise<UserAdminActionState> {
  const locale = localeFromForm(formData);
  const targetId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as Role;

  const actor = await getSessionUser();
  if (!actor || !actor.roles.includes('admin') || actor.profile.account_status !== 'active') {
    return { ok: false, message: 'errors.unauthorized' };
  }

  const parsed = z
    .object({ userId: z.uuid(), role: z.enum(ROLES), grant: z.enum(['true', 'false']) })
    .safeParse({ userId: targetId, role, grant: String(formData.get('grant') ?? '') });

  if (!parsed.success) {
    return { ok: false, message: 'errors.generic' };
  }

  const grant = parsed.data.grant === 'true';
  const supabase = await createSupabaseServerClient();

  // Pre-flight the same rules the RPC enforces, so the message is specific.
  const context = await roleChangeContext(supabase, parsed.data.userId);
  if (!context) return { ok: false, message: 'errors.generic' };

  const rule = grant
    ? canGrantRole(parsed.data.role as Role, context)
    : canRevokeRole(parsed.data.role as Role, context);

  // The specific reason is returned so the administrator knows what to change.
  // The database re-checks the same rules; this is the friendly message, not the
  // security boundary.
  if (!rule.allowed) {
    return { ok: false, message: rule.code };
  }
  const { error } = await supabase.rpc('set_user_role', {
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role as Role,
    p_grant: grant,
  });

  if (error) {
    logger.error('user.role_change_failed', { error: describeError(error) });
    return { ok: false, message: rpcErrorKey(error.message) };
  }

  logger.info('user.role_changed', { grant, role: parsed.data.role });
  revalidatePath(`/${locale}/console/users`);

  return { ok: true, message: grant ? 'users.roleGranted' : 'users.roleRevoked' };
}

export async function setAccountStatusAction(
  _previous: UserAdminActionState,
  formData: FormData,
): Promise<UserAdminActionState> {
  const locale = localeFromForm(formData);
  const targetId = String(formData.get('userId') ?? '');
  const status = String(formData.get('status') ?? '') as AccountStatus;

  const actor = await getSessionUser();
  if (!actor || !actor.roles.includes('admin') || actor.profile.account_status !== 'active') {
    return { ok: false, message: 'errors.unauthorized' };
  }

  const parsed = z
    .object({
      userId: z.uuid(),
      status: z.enum(['pending', 'active', 'suspended', 'deactivated']),
    })
    .safeParse({ userId: targetId, status });

  if (!parsed.success) return { ok: false, message: 'errors.generic' };

  if (parsed.data.userId === actor.id && parsed.data.status !== 'active') {
    return { ok: false, message: 'errors.selfStatus' };
  }

  const supabase = await createSupabaseServerClient();

  const { data: target, error: readError } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', parsed.data.userId)
    .single<{ account_status: AccountStatus }>();

  if (readError || !target) return { ok: false, message: 'errors.notFound' };

  const context = await roleChangeContext(supabase, parsed.data.userId);
  if (!context) return { ok: false, message: 'errors.generic' };

  const rule = canChangeAccountStatus(target.account_status, parsed.data.status, context);
  if (!rule.allowed) {
    return { ok: false, message: rule.code };
  }

  const { error } = await supabase.rpc('set_account_status', {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
  });

  if (error) {
    logger.error('user.status_change_failed', { error: describeError(error) });
    return { ok: false, message: rpcErrorKey(error.message) };
  }

  logger.info('user.status_changed', { status: parsed.data.status });
  revalidatePath(`/${locale}/console/users`);

  return { ok: true, message: 'users.statusUpdated' };
}

/** Reads the data the role rules need for one target user. */
async function roleChangeContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  const { data: rows } = await supabase
    .from('user_roles')
    .select('roles!inner(code)')
    .eq('user_id', userId);

  const targetRoles = (rows ?? [])
    .map((row) => (row as unknown as { roles: { code: Role } }).roles?.code)
    .filter((code): code is Role => Boolean(code));

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', userId)
    .single<{ account_status: AccountStatus }>();

  // Counting across user_roles is done in the database, where it is one query
  // with one authorization rule, rather than with a nested PostgREST embed.
  const { data: otherAdmins, error } = await supabase.rpc('count_other_active_admins', {
    p_user_id: userId,
  });

  if (error) {
    logger.error('user.admin_count_failed', { error: describeError(error) });
  }

  return {
    targetRoles,
    otherActiveAdmins: typeof otherAdmins === 'number' ? otherAdmins : 0,
    targetIsActive: profile?.account_status === 'active',
  };
}