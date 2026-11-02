import { describe, expect, it } from 'vitest';

import {
  canReadTicket,
  canSeeInternalNotes,
  canWriteTicket,
  resolveScope,
  type TicketActor,
  type TicketSubject,
} from '@/modules/identity/domain/scope';

const CUSTOMER_A = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_B = '22222222-2222-2222-2222-222222222222';
const AGENT = '33333333-3333-3333-3333-333333333333';
const ADMIN = '44444444-4444-4444-4444-444444444444';
const VIEWER = '55555555-5555-5555-5555-555555555555';
const LEADER = '66666666-6666-6666-6666-666666666666';
const CUSTOMER_C = '77777777-7777-7777-7777-777777777777';

const TEAM_X = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_Y = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ORG_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const customerA: TicketActor = { userId: CUSTOMER_A, roles: ['customer'], teamIds: [] };
const agentX: TicketActor = { userId: AGENT, roles: ['agent'], teamIds: [TEAM_X] };
const leaderX: TicketActor = { userId: LEADER, roles: ['team_leader'], teamIds: [TEAM_X] };
const admin: TicketActor = { userId: ADMIN, roles: ['admin'], teamIds: [] };
const viewer: TicketActor = { userId: VIEWER, roles: ['management_viewer'], teamIds: [] };
const orgCustomer: TicketActor = {
  userId: CUSTOMER_A,
  roles: ['customer'],
  teamIds: [],
  sharedOrganizationId: ORG_1,
};

const ticketOfAInX: TicketSubject = {
  ticketId: 't1',
  customerId: CUSTOMER_A,
  organizationId: null,
  teamId: TEAM_X,
};

const ticketOfBInX: TicketSubject = {
  ticketId: 't2',
  customerId: CUSTOMER_B,
  organizationId: null,
  teamId: TEAM_X,
};

const ticketOfBInY: TicketSubject = {
  ticketId: 't3',
  customerId: CUSTOMER_B,
  organizationId: null,
  teamId: TEAM_Y,
};

describe('ticket scope', () => {
  describe('customer isolation', () => {
    it('reads only their own ticket', () => {
      expect(canReadTicket(customerA, ticketOfAInX)).toBe(true);
      expect(canReadTicket(customerA, ticketOfBInX)).toBe(false);
    });

    it('cannot write another customer’s ticket', () => {
      expect(canWriteTicket(customerA, ticketOfBInX)).toBe(false);
    });

    it('resolves to the narrow "own" scope', () => {
      expect(resolveScope(customerA)).toEqual({ kind: 'own' });
    });

    it('never sees internal notes', () => {
      expect(canSeeInternalNotes(customerA)).toBe(false);
    });
  });

  describe('team isolation', () => {
    it('an agent reads their own team’s queue', () => {
      expect(canReadTicket(agentX, ticketOfAInX)).toBe(true);
      expect(canReadTicket(agentX, ticketOfBInX)).toBe(true);
    });

    it('an agent cannot read another team’s ticket', () => {
      expect(canReadTicket(agentX, ticketOfBInY)).toBe(false);
      expect(canWriteTicket(agentX, ticketOfBInY)).toBe(false);
    });

    it('a leader is scoped to their team only', () => {
      expect(canReadTicket(leaderX, ticketOfAInX)).toBe(true);
      expect(canReadTicket(leaderX, ticketOfBInY)).toBe(false);
    });

    it('an unassigned ticket with no team is invisible to a scoped agent', () => {
      const unassigned: TicketSubject = {
        ticketId: 't4',
        customerId: CUSTOMER_A,
        organizationId: null,
        teamId: null,
      };
      expect(canReadTicket(agentX, unassigned)).toBe(false);
      expect(canReadTicket(admin, unassigned)).toBe(true);
    });
  });

  describe('admin and viewer', () => {
    it('admin reads and writes everything', () => {
      for (const ticket of [ticketOfAInX, ticketOfBInX, ticketOfBInY]) {
        expect(canReadTicket(admin, ticket)).toBe(true);
        expect(canWriteTicket(admin, ticket)).toBe(true);
      }
    });

    it('viewer reads everything but writes nothing', () => {
      for (const ticket of [ticketOfAInX, ticketOfBInX, ticketOfBInY]) {
        expect(canReadTicket(viewer, ticket)).toBe(true);
        expect(canWriteTicket(viewer, ticket)).toBe(false);
      }
    });

    it('viewer does not see internal notes', () => {
      expect(canSeeInternalNotes(viewer)).toBe(false);
    });

    it('agents and leaders do see internal notes', () => {
      expect(canSeeInternalNotes(agentX)).toBe(true);
      expect(canSeeInternalNotes(leaderX)).toBe(true);
    });
  });

  describe('organization sharing (off by default)', () => {
    it('is not applied when the organization does not share', () => {
      const shared = { ...ticketOfBInX, organizationId: ORG_1 };
      // No sharedOrganizationId on the actor unless the database says sharing is on.
      expect(canReadTicket(customerA, shared)).toBe(false);
    });

    it('applies to the same organization when enabled', () => {
      const shared = { ...ticketOfBInX, organizationId: ORG_1 };
      const otherOrg = { ...ticketOfBInX, organizationId: ORG_2 };
      expect(canReadTicket(orgCustomer, shared)).toBe(true);
      expect(canReadTicket(orgCustomer, otherOrg)).toBe(false);
    });

    it('does not widen write access', () => {
      const shared = { ...ticketOfBInX, organizationId: ORG_1 };
      expect(canWriteTicket(orgCustomer, shared)).toBe(false);
    });

    it('does not apply to a customer outside the organization', () => {
      const shared = { ...ticketOfBInX, organizationId: ORG_1 };
      const outsider: TicketActor = { userId: CUSTOMER_C, roles: ['customer'], teamIds: [] };
      expect(canReadTicket(outsider, shared)).toBe(false);
    });
  });

  it('a staff member holding customer as well stays team-scoped', () => {
    const dualRole: TicketActor = {
      userId: AGENT,
      roles: ['agent', 'customer'],
      teamIds: [TEAM_X],
    };
    expect(resolveScope(dualRole)).toEqual({ kind: 'team', teamIds: [TEAM_X] });
  });
});