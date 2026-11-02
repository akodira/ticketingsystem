import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  TICKET_STATUSES,
  allowedTransitions,
  canTransition,
  isAwaitingCustomer,
  type TicketStatus,
} from '@/modules/tickets/domain/transitions';

const ROOT = join(__dirname, '..', '..');

/**
 * Reads the transition list out of the migration that the database trigger uses.
 * If the two ever disagree, this test fails — which is the point: the domain
 * code and the DB must enforce the same matrix.
 */
function transitionsFromSql(): Array<[string, string]> {
  const sql = readFileSync(
    join(ROOT, 'supabase', 'migrations', '0001_extensions_and_enums.sql'),
    'utf8',
  );

  const body = sql.slice(sql.indexOf('from (values'), sql.indexOf(') as m(from_status, to_status)'));
  const matches = [...body.matchAll(/\(\s*'([a-z_]+)'(?:::public\.ticket_status)?\s*,\s*'([a-z_]+)'(?:::public\.ticket_status)?\s*\)/g)];

  return matches.map((m) => [m[1]!, m[2]!] as [string, string]);
}

describe('ticket transition matrix', () => {
  it('matches the database function exactly', () => {
    const sqlPairs = new Set(transitionsFromSql().map(([from, to]) => `${from}->${to}`));

    const tsPairs = new Set(
      TICKET_STATUSES.flatMap((from) =>
        allowedTransitions(from).map((to) => `${from}->${to}`),
      ),
    );

    const onlyInSql = [...sqlPairs].filter((pair) => !tsPairs.has(pair)).sort();
    const onlyInTs = [...tsPairs].filter((pair) => !sqlPairs.has(pair)).sort();

    expect(onlyInSql, 'transitions allowed by SQL but missing in TypeScript').toEqual([]);
    expect(onlyInTs, 'transitions allowed in TypeScript but rejected by SQL').toEqual([]);
    expect(sqlPairs.size).toBeGreaterThan(15);
  });

  it('never allows a self-transition', () => {
    for (const status of TICKET_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('treats closed as terminal except for reopening', () => {
    expect(allowedTransitions('closed')).toEqual(['reopened']);
  });

  it('separates resolution from closure', () => {
    expect(canTransition('resolved', 'closed')).toBe(true);
    expect(canTransition('in_progress', 'closed')).toBe(false);
  });

  it('permits a first-contact resolution from new', () => {
    expect(canTransition('new', 'resolved')).toBe(true);
  });

  it('does not allow reopening a ticket that was never resolved', () => {
    expect(canTransition('open', 'reopened')).toBe(false);
    expect(canTransition('in_progress', 'reopened')).toBe(false);
    expect(canTransition('pending_customer', 'reopened')).toBe(false);
  });

  it('allows re-entering work from pending_customer', () => {
    expect(canTransition('pending_customer', 'in_progress')).toBe(true);
    expect(canTransition('pending_customer', 'pending_internal')).toBe(false);
  });

  it('marks only pending_customer as awaiting the customer', () => {
    const awaiting = TICKET_STATUSES.filter(isAwaitingCustomer);
    expect(awaiting).toEqual(['pending_customer']);
  });

  it('covers every status in the matrix', () => {
    for (const status of TICKET_STATUSES) {
      expect(Array.isArray(allowedTransitions(status as TicketStatus))).toBe(true);
    }
  });
});