import 'server-only';

import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import type { Profile } from '@/lib/supabase/database.types';
import type { Role } from '@/modules/identity/domain/permissions';

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
  roles: Role[];
  teamIds: string[];
  leaderTeamIds: string[];
  isStaff: boolean;
};

/**
 * The single source of truth for "who is calling".
 *
 * Uses getUser() (which validates the JWT with the Auth server) rather than
 * getSession() (which trusts the cookie), and is wrapped in React `cache` so a
 * page, its layout and its server actions in one request share one lookup.
 *
 * Roles and team memberships are read through RLS-scoped queries: a user can
 * always read their own roles and memberships, and the policies enforce that.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // An unconfigured deployment (fresh clone, first deploy before env vars) has
  // no session to read. Returning null here lets pages render a setup state
  // instead of failing the build during static prerendering.
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  if (profileError || !profile) return null;

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('roles!inner(code)')
    .eq('user_id', user.id);

  const roles: Role[] = (roleRows ?? [])
    .map((row) => (row as unknown as { roles: { code: Role } }).roles?.code)
    .filter((code): code is Role => Boolean(code));

  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id, team_role')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const membershipRows = (memberships ?? []) as { team_id: string; team_role: 'member' | 'leader' }[];
  const teamIds = membershipRows.map((m) => m.team_id);
  const leaderTeamIds = membershipRows
    .filter((m) => m.team_role === 'leader')
    .map((m) => m.team_id);

  return {
    id: user.id,
    email: profile.email,
    profile,
    roles,
    teamIds,
    leaderTeamIds,
    isStaff: Boolean(profile.is_staff),
  };
});

/** True when the account is allowed to use the application at all. */
export function isActiveAccount(user: SessionUser | null): boolean {
  return user !== null && user.profile.account_status === 'active';
}

/** True when the account may enter the support console. */
export function canAccessConsole(user: SessionUser | null): boolean {
  return user !== null && user.isStaff && isActiveAccount(user);
}