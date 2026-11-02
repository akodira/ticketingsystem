import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  isReadOnlyRoles,
  isStaffRoles,
  permissionsForRoles,
  type Role,
} from '@/modules/identity/domain/permissions';

const ROOT = join(__dirname, '..', '..');

/** Extracts `(role, permission)` pairs from the grants block in seed.sql. */
function grantsFromSeed(): Array<[string, string]> {
  const sql = readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8');
  const start = sql.indexOf('with grants(role_code, permission_code) as (');
  const end = sql.indexOf(')\ninsert into public.role_permissions');
  const block = sql.slice(start, end);

  const matches = [...block.matchAll(/\('([a-z_]+)',\s*'([a-z0-9_.]+)'\)/g)];
  return matches.map((m) => [m[1]!, m[2]!] as [string, string]);
}

/** Extracts the permission codes declared in the seed's insert statement. */
function seedPermissionCodes(): string[] {
  const sql = readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8');
  const start = sql.indexOf('insert into public.permissions (code, description) values');
  const end = sql.indexOf('on conflict (code) do nothing;', start);
  const block = sql.slice(start, end);

  return [...block.matchAll(/\('([a-z0-9_.]+)',/g)].map((m) => m[1]!);
}

describe('permission catalog', () => {
  it('matches the codes seeded into the database', () => {
    const fromSeed = [...new Set(seedPermissionCodes())].sort();
    const fromCode = [...PERMISSIONS].sort();
    expect(fromSeed).toEqual(fromCode);
  });

  it('grants in the seed exactly what the code matrix grants', () => {
    const seedGrants = new Set(grantsFromSeed().map(([role, perm]) => `${role}:${perm}`));

    const codeGrants = new Set(
      ROLES.flatMap((role) =>
        ROLE_PERMISSIONS[role].map((permission) => `${role}:${permission}`),
      ),
    );

    const onlyInSeed = [...seedGrants].filter((g) => !codeGrants.has(g)).sort();
    const onlyInCode = [...codeGrants].filter((g) => !seedGrants.has(g)).sort();

    expect(onlyInSeed, 'granted in seed.sql but missing from the code matrix').toEqual([]);
    expect(onlyInCode, 'granted in the code matrix but missing from seed.sql').toEqual([]);
  });

  it('never grants a permission code that does not exist', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(known.has(permission), `${role} → ${permission}`).toBe(true);
      }
    }
  });

  it('union of roles is order independent', () => {
    const a = permissionsForRoles(['agent', 'team_leader']);
    const b = permissionsForRoles(['team_leader', 'agent']);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('gives a customer no internal capability', () => {
    expect(hasPermission(['customer'], 'ticket.read.team')).toBe(false);
    expect(hasPermission(['customer'], 'ticket.note.internal')).toBe(false);
    expect(hasPermission(['customer'], 'ticket.assign.any')).toBe(false);
    expect(hasPermission(['customer'], 'ticket.create.self')).toBe(true);
  });

  it('never lets a management viewer write', () => {
    const writePermissions = PERMISSIONS.filter(
      (permission) =>
        /^(ticket\.(reply|note|assign|escalate|priority|status|resolve|close|reopen|bulk)|customer\.manage|customer\.read\.team|user\.manage|team\.manage|category\.manage|customfield\.manage|sla\.manage|kb\.manage|settings\.manage|audit\.read)/.test(
          permission,
        ) && !permission.endsWith('.read.all'),
    );

    for (const permission of writePermissions) {
      expect(
        ROLE_PERMISSIONS.management_viewer.includes(permission),
        `viewer must not hold ${permission}`,
      ).toBe(false);
    }
  });

  it('classifies staff and viewers correctly', () => {
    expect(isStaffRoles(['customer'])).toBe(false);
    expect(isStaffRoles(['agent'])).toBe(true);
    expect(isStaffRoles(['agent', 'customer'])).toBe(true);

    expect(isReadOnlyRoles(['management_viewer'])).toBe(true);
    expect(isReadOnlyRoles(['management_viewer', 'agent'])).toBe(false);
    expect(isReadOnlyRoles(['customer'])).toBe(false);
  });

  it('gives the admin every internal permission but not customer-only ones', () => {
    const admin = new Set(ROLE_PERMISSIONS.admin);
    expect(admin.has('ticket.assign.any')).toBe(true);
    expect(admin.has('sla.manage')).toBe(true);
    // D-09: staff cannot raise tickets
    expect(admin.has('ticket.create.self')).toBe(false);
    expect(admin.has('feedback.submit.own')).toBe(false);
  });

  it('defines every role', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role as Role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});