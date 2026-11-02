/**
 * Role and account administration rules.
 *
 * Mirrors supabase/migrations/0009_user_administration.sql. The database is the
 * authority; this module exists so the UI can explain *why* an action is
 * refused before the request is made, and so the rules are unit-testable.
 *
 * Pure: no React, no Next.js, no database.
 */

import type { Role } from './permissions';
import { INTERNAL_ROLES } from './permissions';

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'deactivated';

/** Roles an administrator may invite someone into from the console. */
export const INVITABLE_ROLES: readonly Role[] = [
  'agent',
  'team_leader',
  'admin',
  'management_viewer',
];

export const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  'pending',
  'active',
  'suspended',
  'deactivated',
];

const STATUS_TRANSITIONS: Record<AccountStatus, readonly AccountStatus[]> = {
  pending: ['active', 'deactivated'],
  active: ['suspended', 'deactivated'],
  suspended: ['active', 'deactivated'],
  deactivated: ['active'],
};

export function canChangeStatus(from: AccountStatus, to: AccountStatus): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from].includes(to);
}

export function allowedStatusTransitions(from: AccountStatus): readonly AccountStatus[] {
  return STATUS_TRANSITIONS[from];
}

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.includes(role);
}

export type RoleChangeContext = {
  /** Roles the target user currently holds. */
  targetRoles: readonly Role[];
  /** Number of other users holding `admin` whose account is active. */
  otherActiveAdmins: number;
  /** Whether the target user's own account is active. */
  targetIsActive: boolean;
};

export type RuleRefusal =
  | 'errors.lastAdmin'
  | 'errors.roleConflict'
  | 'errors.statusTransition'
  | 'errors.staffOnlyTeams'
  | 'errors.leaderAdminOnly'
  | 'errors.generic';

export type RuleResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: RuleRefusal };

const ALLOWED: RuleResult = { allowed: true };

function refuse(reason: string, code: RuleRefusal = 'errors.generic'): RuleResult {
  return { allowed: false, reason, code };
}

/**
 * Granting a role. Staff and customer roles are mutually exclusive in both
 * directions, matching the database, because the ticket-creation permission is
 * customer-only (decision D-09).
 */
export function canGrantRole(role: Role, context: RoleChangeContext): RuleResult {
  if (context.targetRoles.includes(role)) {
    return refuse('This user already has that role.', 'errors.roleConflict');
  }

  const targetIsStaff = context.targetRoles.some(isInternalRole);

  if (isInternalRole(role) && context.targetRoles.includes('customer')) {
    return refuse('Remove the customer role before granting an internal role.', 'errors.roleConflict');
  }

  if (role === 'customer' && targetIsStaff) {
    return refuse('Remove the internal roles before granting the customer role.', 'errors.roleConflict');
  }

  return ALLOWED;
}

/**
 * Revoking a role. The last active administrator is protected: demoting them
 * would leave the system with nobody able to administer it.
 */
export function canRevokeRole(role: Role, context: RoleChangeContext): RuleResult {
  if (!context.targetRoles.includes(role)) {
    return refuse('This user does not have that role.', 'errors.roleConflict');
  }

  if (role === 'admin' && context.targetIsActive && context.otherActiveAdmins === 0) {
    return refuse('This is the last active administrator and cannot be demoted.', 'errors.lastAdmin');
  }

  return ALLOWED;
}

/** Account status changes, including the same last-administrator protection. */
export function canChangeAccountStatus(
  from: AccountStatus,
  to: AccountStatus,
  context: Pick<RoleChangeContext, 'targetRoles' | 'otherActiveAdmins'>,
) : RuleResult {
  if (from === to) {
    return refuse('The account already has that status.', 'errors.statusTransition');
  }

  if (!canChangeStatus(from, to)) {
    return refuse(`An account cannot go from ${from} to ${to}.`, 'errors.statusTransition');
  }

  if (to !== 'active' && context.targetRoles.includes('admin') && context.otherActiveAdmins === 0) {
    return refuse('This is the last active administrator and cannot be deactivated.', 'errors.lastAdmin');
  }

  return ALLOWED;
}

/** Team membership: only staff can belong to a support team. */
export function canJoinTeam(targetRoles: readonly Role[]): RuleResult {
  if (!targetRoles.some(isInternalRole)) {
    return refuse('Only staff accounts can join a support team.', 'errors.staffOnlyTeams');
  }
  return ALLOWED;
}

/** Only an administrator may appoint a team leader. */
export function canAppointLeader(actorRoles: readonly Role[]): RuleResult {
  return actorRoles.includes('admin')
    ? ALLOWED
    : refuse('Only an administrator can appoint a team leader.', 'errors.leaderAdminOnly');
}

/** Who may open the user directory at all. */
export function canManageUsers(actorRoles: readonly Role[]): boolean {
  return actorRoles.includes('admin');
}

/**
 * A viewer may read the directory but not change anything. Kept here rather
 * than in the permissions module so the console import surface stays small.
 */
export function isReadOnlyRoles(actorRoles: readonly Role[]): boolean {
  const staffRoles = actorRoles.filter(isInternalRole);
  if (staffRoles.length === 0) return false;
  return staffRoles.every((role) => role === 'management_viewer');
}

export function canInvite(actorRoles: readonly Role[], role: Role): boolean {
  return canManageUsers(actorRoles) && INVITABLE_ROLES.includes(role);
}