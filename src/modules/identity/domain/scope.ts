/**
 * Data scope resolution.
 *
 * Mirrors the SQL helpers app.can_read_ticket / app.can_write_ticket. The unit
 * test in tests/unit/scope.test.ts asserts both implementations produce the same
 * answer for a fixture matrix, so drift between the two is a test failure rather
 * than a production data leak.
 */

import type { Role } from './permissions';
import { isStaffRoles } from './permissions';

export type TicketScope =
  | { kind: 'own' }
  | { kind: 'org'; organizationId: string }
  | { kind: 'team'; teamIds: string[] }
  | { kind: 'all' };

export type TicketActor = {
  userId: string;
  roles: readonly Role[];
  teamIds: readonly string[];
  /** Set only for customers with an organization whose sharing is enabled. */
  sharedOrganizationId?: string | null;
};

export type TicketSubject = {
  ticketId: string;
  customerId: string;
  organizationId: string | null;
  teamId: string | null;
};

/**
 * Resolution order is significant: an admin sees everything, then an
 * organization-shared customer, then a team member, then the customer's own
 * tickets. A staff member is never reduced to `own` because staff cannot be a
 * ticket customer in this system (docs/OPEN_DECISIONS.md D-09).
 */
export function resolveScope(actor: TicketActor): TicketScope {
  if (actor.roles.includes('admin')) {
    return { kind: 'all' };
  }

  if (actor.roles.includes('management_viewer')) {
    return { kind: 'all' };
  }

  if (isStaffRoles(actor.roles)) {
    return { kind: 'team', teamIds: [...actor.teamIds] };
  }

  if (actor.sharedOrganizationId) {
    return { kind: 'org', organizationId: actor.sharedOrganizationId };
  }

  return { kind: 'own' };
}

export function canReadTicket(actor: TicketActor, ticket: TicketSubject): boolean {
  const scope = resolveScope(actor);

  switch (scope.kind) {
    case 'all':
      return true;
    case 'team':
      return ticket.teamId !== null && scope.teamIds.includes(ticket.teamId);
    case 'org':
      return ticket.organizationId !== null && ticket.organizationId === scope.organizationId;
    case 'own':
      return ticket.customerId === actor.userId;
  }
}

/**
 * Write scope is narrower than read scope for viewers: they may read but never
 * reply, transition or assign. Customers may write only their own tickets.
 */
export function canWriteTicket(actor: TicketActor, ticket: TicketSubject): boolean {
  if (actor.roles.includes('management_viewer') && !actor.roles.includes('admin')) {
    return false;
  }

  if (actor.roles.includes('admin')) {
    return true;
  }

  if (isStaffRoles(actor.roles)) {
    return ticket.teamId !== null && actor.teamIds.includes(ticket.teamId);
  }

  return ticket.customerId === actor.userId;
}

/**
 * Internal notes are visible to staff in scope, never to customers and never to
 * read-only viewers.
 */
export function canSeeInternalNotes(actor: TicketActor): boolean {
  if (!isStaffRoles(actor.roles)) return false;
  if (actor.roles.includes('admin') || actor.roles.includes('agent')) return true;
  if (actor.roles.includes('team_leader')) return true;
  return false;
}
