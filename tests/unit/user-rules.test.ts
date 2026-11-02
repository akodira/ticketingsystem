import { describe, expect, it } from 'vitest';

import {
  INVITABLE_ROLES,
  allowedStatusTransitions,
  canAppointLeader,
  canChangeAccountStatus,
  canChangeStatus,
  canGrantRole,
  canInvite,
  canJoinTeam,
  canManageUsers,
  canRevokeRole,
  isInternalRole,
  type AccountStatus,
} from '@/modules/identity/domain/user-rules';

const staffRoles = ['agent', 'team_leader', 'admin', 'management_viewer'] as const;

describe('account status transitions', () => {
  it('matches the database matrix', () => {
    const allowed = new Set<string>();
    for (const from of ['pending', 'active', 'suspended', 'deactivated'] as AccountStatus[]) {
      for (const to of allowedStatusTransitions(from)) {
        allowed.add(`${from}->${to}`);
      }
    }

    expect([...allowed].sort()).toEqual(
      [
        'pending->active',
        'pending->deactivated',
        'active->suspended',
        'active->deactivated',
        'suspended->active',
        'suspended->deactivated',
        'deactivated->active',
      ].sort(),
    );
  });

  it('never allows a status to change to itself', () => {
    for (const status of ['pending', 'active', 'suspended', 'deactivated'] as AccountStatus[]) {
      expect(canChangeStatus(status, status)).toBe(false);
    }
  });

  it('does not allow a suspended account to become pending', () => {
    expect(canChangeStatus('suspended', 'pending')).toBe(false);
  });
});

describe('role assignment rules', () => {
  it('recognises staff roles', () => {
    for (const role of staffRoles) expect(isInternalRole(role)).toBe(true);
    expect(isInternalRole('customer')).toBe(false);
  });

  it('refuses to combine a staff role with the customer role', () => {
    const result = canGrantRole('agent', {
      targetRoles: ['customer'],
      otherActiveAdmins: 1,
      targetIsActive: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('refuses to give a staff member the customer role', () => {
    const result = canGrantRole('customer', {
      targetRoles: ['agent'],
      otherActiveAdmins: 1,
      targetIsActive: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('allows granting a second staff role', () => {
    const result = canGrantRole('team_leader', {
      targetRoles: ['agent'],
      otherActiveAdmins: 1,
      targetIsActive: true,
    });
    expect(result.allowed).toBe(true);
  });

  it('refuses a duplicate grant', () => {
    const result = canGrantRole('agent', {
      targetRoles: ['agent'],
      otherActiveAdmins: 1,
      targetIsActive: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('protects the last active administrator from demotion', () => {
    const result = canRevokeRole('admin', {
      targetRoles: ['admin'],
      otherActiveAdmins: 0,
      targetIsActive: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.code).toBe('errors.lastAdmin');
  });

  it('allows demoting an administrator when another active one exists', () => {
    const result = canRevokeRole('admin', {
      targetRoles: ['admin'],
      otherActiveAdmins: 1,
      targetIsActive: true,
    });
    expect(result.allowed).toBe(true);
  });

  it('allows demoting the last administrator when their account is not active', () => {
    // Deactivated administrators cannot sign in, so they do not defend the role.
    const result = canRevokeRole('admin', {
      targetRoles: ['admin'],
      otherActiveAdmins: 0,
      targetIsActive: false,
    });
    expect(result.allowed).toBe(true);
  });

  it('protects the last active administrator from deactivation', () => {
    const result = canChangeAccountStatus('active', 'suspended', {
      targetRoles: ['admin'],
      otherActiveAdmins: 0,
    });
    expect(result.allowed).toBe(false);
  });

  it('allows deactivating a non-admin', () => {
    const result = canChangeAccountStatus('active', 'suspended', {
      targetRoles: ['agent'],
      otherActiveAdmins: 0,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('team and invitation rules', () => {
  it('only staff may join a team', () => {
    expect(canJoinTeam(['agent']).allowed).toBe(true);
    expect(canJoinTeam(['customer']).allowed).toBe(false);
  });

  it('only an administrator may appoint a leader', () => {
    expect(canAppointLeader(['admin']).allowed).toBe(true);
    expect(canAppointLeader(['team_leader']).allowed).toBe(false);
  });

  it('only administrators manage users', () => {
    expect(canManageUsers(['admin'])).toBe(true);
    expect(canManageUsers(['team_leader'])).toBe(false);
    expect(canManageUsers(['management_viewer'])).toBe(false);
    expect(canManageUsers(['customer'])).toBe(false);
  });

  it('never offers the customer role as an invitation', () => {
    expect(INVITABLE_ROLES).not.toContain('customer');
  });

  it('refuses an invitation from a non-administrator', () => {
    expect(canInvite(['agent'], 'agent')).toBe(false);
    expect(canInvite(['admin'], 'agent')).toBe(true);
  });
});