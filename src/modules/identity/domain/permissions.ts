/**
 * Permission catalog and role matrix.
 *
 * The authoritative data lives in the `permissions` / `role_permissions` tables
 * (seeded from supabase/seed.sql). This module is the typed mirror used by
 * services and UI, and the source the seed is checked against: a unit test reads
 * seed.sql and asserts both lists are identical, so a permission added to one
 * without the other fails CI.
 */

export const PERMISSIONS = [
  'ticket.create.self',
  'ticket.read.own',
  'ticket.read.org',
  'ticket.read.team',
  'ticket.read.all',
  'ticket.reply.own',
  'ticket.reply.team',
  'ticket.note.internal',
  'ticket.attachment.upload',
  'ticket.attachment.internal',
  'ticket.assign.self',
  'ticket.assign.team',
  'ticket.assign.any',
  'ticket.escalate',
  'ticket.priority.change.team',
  'ticket.priority.change.any',
  'ticket.status.transition.team',
  'ticket.status.transition.any',
  'ticket.resolve',
  'ticket.close.any',
  'ticket.reopen.any',
  'ticket.reopen.own',
  'ticket.bulk.team',
  'ticket.export.team',
  'feedback.submit.own',
  'team.read.team',
  'team.read.all',
  'team.manage.team',
  'team.manage.all',
  'user.read.team',
  'user.read.all',
  'user.manage',
  'customer.read.team',
  'customer.read.all',
  'customer.manage',
  'category.manage',
  'customfield.manage',
  'sla.read',
  'sla.manage',
  'kb.read.internal',
  'kb.manage',
  'feedback.read.team',
  'feedback.read.all',
  'report.view.team',
  'report.view.all',
  'report.export',
  'settings.manage',
  'audit.read',
  'notification.read.own',
  'notification.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['customer', 'agent', 'team_leader', 'admin', 'management_viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Mirrors docs/ROLES_AND_PERMISSIONS.md §3 and supabase/seed.sql. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [
    'ticket.create.self',
    'ticket.read.own',
    'ticket.read.org',
    'ticket.reply.own',
    'ticket.attachment.upload',
    'ticket.reopen.own',
    'feedback.submit.own',
    'notification.read.own',
  ],
  agent: [
    'ticket.read.team',
    'ticket.reply.team',
    'ticket.note.internal',
    'ticket.attachment.upload',
    'ticket.attachment.internal',
    'ticket.assign.self',
    'ticket.priority.change.team',
    'ticket.status.transition.team',
    'ticket.resolve',
    'team.read.team',
    'user.read.team',
    'customer.read.team',
    'sla.read',
    'kb.read.internal',
    'report.view.team',
    'notification.read.own',
  ],
  team_leader: [
    'ticket.read.team',
    'ticket.reply.team',
    'ticket.note.internal',
    'ticket.attachment.upload',
    'ticket.attachment.internal',
    'ticket.assign.self',
    'ticket.assign.team',
    'ticket.escalate',
    'ticket.priority.change.team',
    'ticket.status.transition.team',
    'ticket.resolve',
    'ticket.bulk.team',
    'ticket.export.team',
    'team.read.team',
    'team.manage.team',
    'user.read.team',
    'customer.read.team',
    'sla.read',
    'kb.read.internal',
    'feedback.read.team',
    'report.view.team',
    'report.export',
    'notification.read.own',
  ],
  admin: [
    'ticket.read.team',
    'ticket.read.all',
    'ticket.reply.team',
    'ticket.note.internal',
    'ticket.attachment.upload',
    'ticket.attachment.internal',
    'ticket.assign.self',
    'ticket.assign.team',
    'ticket.assign.any',
    'ticket.escalate',
    'ticket.priority.change.team',
    'ticket.priority.change.any',
    'ticket.status.transition.team',
    'ticket.status.transition.any',
    'ticket.resolve',
    'ticket.close.any',
    'ticket.reopen.any',
    'ticket.bulk.team',
    'ticket.export.team',
    'team.read.team',
    'team.read.all',
    'team.manage.team',
    'team.manage.all',
    'user.read.team',
    'user.read.all',
    'user.manage',
    'customer.read.team',
    'customer.read.all',
    'customer.manage',
    'category.manage',
    'customfield.manage',
    'sla.read',
    'sla.manage',
    'kb.read.internal',
    'kb.manage',
    'feedback.read.team',
    'feedback.read.all',
    'report.view.team',
    'report.view.all',
    'report.export',
    'settings.manage',
    'audit.read',
    'notification.read.own',
    'notification.manage',
  ],
  management_viewer: [
    'ticket.read.all',
    'team.read.team',
    'team.read.all',
    'user.read.all',
    'customer.read.all',
    'sla.read',
    'feedback.read.all',
    'report.view.team',
    'report.view.all',
    'report.export',
    'notification.read.own',
  ],
};

/** Effective permission set for a user holding several roles (union). */
export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      granted.add(permission);
    }
  }
  return granted;
}

export function hasPermission(
  roles: readonly Role[],
  permission: Permission,
): boolean {
  return permissionsForRoles(roles).has(permission);
}

/** Internal roles. A user with any of these is staff and cannot create tickets. */
export const INTERNAL_ROLES: readonly Role[] = [
  'agent',
  'team_leader',
  'admin',
  'management_viewer',
];

export function isStaffRoles(roles: readonly Role[]): boolean {
  return roles.some((role) => INTERNAL_ROLES.includes(role));
}

/**
 * Roles whose only access is read-only. Kept explicit so a new write permission
 * cannot silently reach a viewer through a role it was added to by mistake.
 */
export function isReadOnlyRoles(roles: readonly Role[]): boolean {
  const staffRoles = roles.filter((role) => INTERNAL_ROLES.includes(role));
  if (staffRoles.length === 0) return false;
  return staffRoles.every((role) => role === 'management_viewer');
}
