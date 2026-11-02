/**
 * Ticket status transition matrix.
 *
 * This is the TypeScript half of a three-part contract:
 *   1. this file,
 *   2. app.transition_allowed() in supabase/migrations/0001_extensions_and_enums.sql,
 *   3. trg_tickets_transition_guard in supabase/migrations/0005_tickets.sql.
 *
 * A unit test asserts (1) and (2) agree by reading the SQL file, so the two can
 * never drift apart silently.
 *
 * Pure module: no React, no Next.js, no database. It is the specification the
 * future .NET implementation will translate directly.
 */

export const TICKET_STATUSES = [
  'new',
  'open',
  'in_progress',
  'pending_customer',
  'pending_internal',
  'resolved',
  'closed',
  'reopened',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Terminal statuses that cannot be left except by reopening. */
export const TERMINAL_STATUSES: readonly TicketStatus[] = ['closed'];

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ['open', 'in_progress', 'resolved'],
  open: ['in_progress', 'pending_customer', 'pending_internal', 'resolved'],
  in_progress: ['pending_customer', 'pending_internal', 'resolved'],
  pending_customer: ['in_progress', 'resolved'],
  pending_internal: ['in_progress', 'pending_customer', 'resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['open', 'in_progress', 'pending_customer', 'pending_internal', 'resolved'],
};

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/** Transitions only a customer may trigger, on their own ticket. */
export const CUSTOMER_TRANSITIONS: readonly TicketStatus[] = ['closed', 'reopened'];

/** Transitions a staff member may perform without the `ticket.close.any` permission. */
export const STAFF_TRANSITION_REQUIRES_CLOSE_PERMISSION: readonly TicketStatus[] = ['closed'];

/** Statuses shown to customers, mapped from the internal status. */
export const CUSTOMER_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'Submitted',
  open: 'Acknowledged',
  in_progress: 'In Progress',
  pending_customer: 'Awaiting Your Response',
  pending_internal: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'In Progress',
};

/** Whether a ticket in this status counts as unresolved for dashboards. */
export function isOpenStatus(status: TicketStatus): boolean {
  return status !== 'closed';
}

/** Whether the ticket is waiting on the customer. */
export function isAwaitingCustomer(status: TicketStatus): boolean {
  return status === 'pending_customer';
}
