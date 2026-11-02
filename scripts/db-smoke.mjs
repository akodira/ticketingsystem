/**
 * Applies every migration and the seed to a throwaway PostgreSQL instance and
 * asserts the invariants the design depends on.
 *
 * This is the closest thing to running the schema that is possible without
 * Docker: a real PostgreSQL server on a temporary data directory, deleted
 * afterwards.
 *
 * It is NOT the Supabase test suite (no GoTrue, no Storage, no pgTAP). Those run
 * against `supabase db reset` in CI; see docs/TEST_PLAN.md.
 *
 *   node scripts/db-smoke.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/**
 * Supabase provides the auth schema, auth.uid() and the role grants below. This
 * block reproduces just enough of that platform for the migrations, policies and
 * RPCs to be created and exercised here. It mirrors Supabase's own default
 * privileges: anon and authenticated may attempt any table; RLS decides what
 * they actually see.
 */
const SUPABASE_STUBS = `
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

const pg = new EmbeddedPostgres({
  databaseDir: join(ROOT, '.tmp-pgdata'),
  user: 'postgres',
  password: 'postgres',
  port: 55433,
  persistent: false,
  // UTF8, not the Windows code page: the Arabic seed data and Arabic full-text
  // search depend on it, and this matches the Supabase cluster's encoding.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

console.log('Starting embedded PostgreSQL…');
await pg.initialise();
await pg.start();

let client;
let failed = 0;

try {
  await pg.createDatabase('cts');
  client = pg.getPgClient('cts');
  await client.connect();

  const exec = (sql) => client.query(sql);
  const one = async (sql) => (await client.query(sql)).rows[0];

  /** Runs `sql` as a given database role, always restoring the session role. */
  const asRole = async (role, sql, claims = null) => {
    await exec('begin');
    try {
      if (claims) {
        await exec(`select set_config('request.jwt.claim.sub', '${claims}', true)`);
      }
      await exec(`set local role ${role}`);
      const result = await client.query(sql);
      return result.rows;
    } finally {
      await exec('commit');
    }
  };

  const applyStep = async (label, sql) => {
    try {
      await exec(sql);
      results.push({ name: label, ok: true, detail: '' });
    } catch (error) {
      failed++;
      results.push({ name: label, ok: false, detail: error.message });
      throw error;
    }
  };

  await applyStep('supabase stubs (auth schema, auth.uid, role grants)', SUPABASE_STUBS);

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    await applyStep(`migration ${file}`, readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  await applyStep('seed.sql', readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));

  // ---------------------------------------------------------------- assertions

  await check('seed: 5 roles, 50 permissions, grants present', async () => {
    const row = await one(`
      select
        (select count(*) from roles)::int             as roles,
        (select count(*) from permissions)::int       as permissions,
        (select count(*) from role_permissions)::int  as grants
    `);
    if (row.roles !== 5) throw new Error(`roles: expected 5, got ${row.roles}`);
    if (row.permissions !== 50) throw new Error(`permissions: expected 50, got ${row.permissions}`);
    if (row.grants < 100) throw new Error(`grants: expected >=100, got ${row.grants}`);
    return `${row.roles} roles / ${row.permissions} permissions / ${row.grants} grants`;
  });

  await check('seed: categories, SLA targets, working days', async () => {
    const row = await one(`
      select
        (select count(*) from ticket_categories)::int  as categories,
        (select count(*) from sla_policy_targets)::int as targets,
        (select count(*) from business_hours)::int     as hours
    `);
    if (row.categories !== 11) throw new Error(`categories: expected 11, got ${row.categories}`);
    if (row.targets !== 4) throw new Error(`targets: expected 4, got ${row.targets}`);
    if (row.hours !== 5) throw new Error(`working days: expected 5, got ${row.hours}`);
    return `${row.categories} categories / ${row.targets} targets / ${row.hours} working days`;
  });

  await check('RLS enabled on every public table', async () => {
    const row = await one(`
      select count(*)::int as missing
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    if (row.missing !== 0) throw new Error(`${row.missing} tables without RLS`);
    return 'all tables protected';
  });

  await check('only the two service-only tables lack policies', async () => {
    const row = await one(`
      select string_agg(c.relname, ', ' order by c.relname) as unprotected
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    `);
    const expected = 'rate_limits, ticket_sequences';
    if (row.unprotected !== expected) {
      throw new Error(`expected "${expected}", got "${row.unprotected}"`);
    }
    return row.unprotected;
  });

  // Fixtures: two customers, created the way Supabase Auth creates them.
  const customerA = '11111111-1111-1111-1111-111111111111';
  const customerB = '33333333-3333-3333-3333-333333333333';

  await check('signup trigger mirrors auth.users into a customer profile', async () => {
    await exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values ('${customerA}', 'customer-a@example.com', now(), '{"full_name":"Customer A","locale":"en"}'::jsonb);
    `);
    const row = await one(`select full_name, account_status, is_staff from profiles where id = '${customerA}'`);
    if (row.full_name !== 'Customer A') throw new Error('name not copied');
    if (row.account_status !== 'active') throw new Error('verified signup not activated');
    if (row.is_staff !== false) throw new Error('customer marked as staff');

    const role = await one(`
      select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = '${customerA}'
    `);
    if (role.code !== 'customer') throw new Error('customer role not granted');

    const customer = await one(`select count(*)::int as n from customers where profile_id = '${customerA}'`);
    if (customer.n !== 1) throw new Error('customer record not created');
    return 'profile + role + customer row created';
  });

  await check('unverified signup starts as pending', async () => {
    await exec(`
      insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'pending@example.com');
    `);
    const row = await one(`select account_status from profiles where id = '22222222-2222-2222-2222-222222222222'`);
    if (row.account_status !== 'pending') throw new Error(`got ${row.account_status}`);
    return 'pending until email confirmed';
  });

  await check('DB guard: is_staff cannot be set by the account holder', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `update profiles set is_staff = true where id = '${customerA}'`,
        customerA,
      );
    } catch (error) {
      rejected = /is_staff is not writable/.test(error.message);
    }
    if (!rejected) throw new Error('a customer promoted themselves to staff');
    const row = await one(`select is_staff from profiles where id = '${customerA}'`);
    if (row.is_staff !== false) throw new Error('is_staff was changed');
    return 'trigger rejected the update';
  });

  await check('DB guard: account_status cannot be set by the account holder', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `update profiles set account_status = 'active' where id = '22222222-2222-2222-2222-222222222222'`,
        '22222222-2222-2222-2222-222222222222',
      );
    } catch (error) {
      rejected = /account_status is not writable/.test(error.message);
    }
    if (!rejected) throw new Error('a pending user activated their own account');
    return 'trigger rejected the update';
  });

  await check('profile self-update of name and locale is allowed', async () => {
    await asRole(
      'authenticated',
      `update profiles set full_name = 'Customer A Updated', locale = 'ar' where id = '${customerA}'`,
      customerA,
    );
    const row = await one(`select full_name, locale from profiles where id = '${customerA}'`);
    if (row.full_name !== 'Customer A Updated' || row.locale !== 'ar') {
      throw new Error('own profile fields were not updated');
    }
    return 'name and locale updated';
  });

  const categoryId = (await one(`select id from ticket_categories where code = 'technical'`)).id;

  await check('create_ticket RPC allocates reference, SLA and history', async () => {
    await asRole(
      'authenticated',
      `select app.create_ticket(
         '${categoryId}'::uuid, null, 'Cannot sign in',
         'I cannot sign in to the customer portal at all.',
         'high', '{}'::jsonb, null
       )`,
      customerA,
    );

    const ticket = await one(`select id, reference, status, team_id from tickets`);
    if (!/^CTS-\d{4}-\d{6}$/.test(ticket.reference)) throw new Error(`bad reference ${ticket.reference}`);
    if (ticket.status !== 'new') throw new Error(`expected new, got ${ticket.status}`);

    const sla = await one(`
      select first_response_due_at, resolution_due_at from ticket_sla where ticket_id = '${ticket.id}'
    `);
    if (!sla) throw new Error('no SLA row');
    if (new Date(sla.first_response_due_at) <= new Date()) throw new Error('first response due in the past');
    if (new Date(sla.resolution_due_at) <= new Date(sla.first_response_due_at)) {
      throw new Error('resolution target is earlier than first response');
    }

    const history = await one(`select count(*)::int as n from ticket_status_history where ticket_id = '${ticket.id}'`);
    if (history.n !== 1) throw new Error(`expected 1 history row, got ${history.n}`);

    const message = await one(`
      select count(*)::int as n from ticket_messages
      where ticket_id = '${ticket.id}' and is_initial_description
    `);
    if (message.n !== 1) throw new Error('initial description message missing');

    const team = await one(`select code from teams where id = '${ticket.team_id}'`);
    if (team.code !== 'general') throw new Error('ticket not routed to the default team');

    return `${ticket.reference}, SLA due, history and message written`;
  });

  await check('reference is sequential for the same year', async () => {
    const row = await one(`select app.next_ticket_reference(2026::smallint) as ref`);
    if (row.ref !== 'CTS-2026-000002') throw new Error(`got ${row.ref}`);
    return row.ref;
  });

  await check('create_ticket RPC refuses a suspension-pending account', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.create_ticket(
           '${categoryId}'::uuid, null, 'Pending account try',
           'This account has not confirmed its email address yet.',
           'normal', '{}'::jsonb, null
         )`,
        '22222222-2222-2222-2222-222222222222',
      );
    } catch (error) {
      rejected = /account is not active/.test(error.message);
    }
    if (!rejected) throw new Error('an unverified customer created a ticket');
    return 'pending account rejected';
  });

  await check('internal note cannot be authored by a customer', async () => {
    const ticket = await one(`select id from tickets limit 1`);
    let rejected = false;
    try {
      await exec(`
        insert into ticket_messages (ticket_id, author_id, author_kind, visibility, body)
        values ('${ticket.id}', '${customerA}', 'customer', 'internal', 'sneaky note');
      `);
    } catch (error) {
      rejected = /ticket_messages_internal_is_staff/.test(error.message);
    }
    if (!rejected) throw new Error('customer-authored internal note was accepted');
    return 'CHECK constraint enforced';
  });

  await check('illegal transition new -> closed is rejected', async () => {
    let rejected = false;
    try {
      await exec(`update tickets set status = 'closed'`);
    } catch (error) {
      rejected = /illegal ticket transition/.test(error.message);
    }
    if (!rejected) throw new Error('new -> closed was allowed');
    return 'matrix enforced by trigger';
  });

  await check('resolving without a summary is rejected', async () => {
    let rejected = false;
    try {
      await exec(`update tickets set status = 'resolved'`);
    } catch (error) {
      rejected = /tickets_resolution_summary_required/.test(error.message);
    }
    if (!rejected) throw new Error('resolution without summary accepted');
    return 'summary required by CHECK';
  });

  await check('legal resolution succeeds and stamps resolved_at', async () => {
    await exec(`
      update tickets
         set status = 'resolved', resolution_summary = 'Password reset instructions were sent.'
    `);
    const row = await one(`select status, resolved_at from tickets`);
    if (row.status !== 'resolved' || !row.resolved_at) throw new Error('resolved_at not stamped');
    return 'resolved_at stamped';
  });

  await check('ticket reference is immutable', async () => {
    let rejected = false;
    try {
      await exec(`update tickets set reference = 'CTS-2026-999999'`);
    } catch (error) {
      rejected = /immutable/.test(error.message);
    }
    if (!rejected) throw new Error('reference change allowed');
    return 'reference protected';
  });

  await check('audit_logs rejects delete', async () => {
    const before = await one(`select count(*)::int as n from audit_logs`);
    let deleteRejected = false;
    try {
      await exec(`delete from audit_logs`);
    } catch (error) {
      deleteRejected = /append-only/.test(error.message);
    }
    if (!deleteRejected) throw new Error('delete allowed');
    if (before.n === 0) throw new Error('no audit rows were written to test against');
    return `${before.n} audit rows, delete rejected`;
  });

  await check('SLA clock handles the weekend and working hours', async () => {
    // Thursday 2026-01-01 16:00 Asia/Riyadh + 120 business minutes.
    // Friday and Saturday are closed, so the answer must be Sunday 09:00.
    const calendar = await one(`select id from business_calendars where code = 'ksa_default'`);
    const row = await one(`
      select app.add_business_minutes(
        '${calendar.id}'::uuid, timestamptz '2026-01-01 16:00:00+03', 120
      ) as due
    `);
    const iso = new Date(row.due).toISOString();
    if (iso !== '2026-01-04T06:00:00.000Z') {
      throw new Error(`got ${iso}, expected 2026-01-04T06:00:00.000Z (Sun 09:00 Asia/Riyadh)`);
    }
    return 'Thu 16:00 + 2h ⇒ Sun 09:00';
  });

  await check('SLA clock skips configured holidays', async () => {
    const calendar = await one(`select id from business_calendars where code = 'ksa_default'`);
    await exec(`
      insert into holidays (calendar_id, holiday_date, name_en, name_ar)
      values ('${calendar.id}', '2026-01-04', 'Test holiday', 'عطلة اختبار')
    `);
    const row = await one(`
      select app.add_business_minutes(
        '${calendar.id}'::uuid, timestamptz '2026-01-01 16:00:00+03', 120
      ) as due
    `);
    const iso = new Date(row.due).toISOString();
    if (iso !== '2026-01-05T06:00:00.000Z') {
      throw new Error(`got ${iso}, expected 2026-01-05T06:00:00.000Z (Mon 09:00 Asia/Riyadh)`);
    }
    return 'holiday respected';
  });

  await check('management_viewer holds no write permission', async () => {
    const row = await one(`
      select count(*)::int as n
      from role_permissions rp
      join roles r on r.id = rp.role_id
      join permissions p on p.id = rp.permission_id
      where r.code = 'management_viewer'
        and p.code in ('ticket.reply.team','ticket.note.internal','ticket.assign.team',
                       'ticket.status.transition.any','sla.manage','settings.manage','user.manage')
    `);
    if (row.n !== 0) throw new Error(`viewer holds ${row.n} write permissions`);
    return 'read-only confirmed in data';
  });

  await check('no internal role can create tickets (D-09)', async () => {
    const row = await one(`
      select count(*)::int as n
      from role_permissions rp
      join roles r on r.id = rp.role_id
      join permissions p on p.id = rp.permission_id
      where p.code = 'ticket.create.self' and r.is_internal
    `);
    if (row.n !== 0) throw new Error('an internal role can create tickets');
    return 'enforced in data';
  });

  // ------------------------------------------------------------ RLS behaviour

  await exec(`
    insert into auth.users (id, email, email_confirmed_at)
    values ('${customerB}', 'customer-b@example.com', now());
  `);

  await check('RLS: anonymous sees no tickets', async () => {
    const rows = await asRole('anon', `select count(*)::int as n from tickets`);
    if (rows[0].n !== 0) throw new Error(`anon saw ${rows[0].n} tickets`);
    return '0 rows for anon';
  });

  await check('RLS: other customer sees no tickets and no internal notes', async () => {
    const tickets = await asRole('authenticated', `select count(*)::int as n from tickets`, customerB);
    const notes = await asRole(
      'authenticated',
      `select count(*)::int as n from ticket_messages where visibility = 'internal'`,
      customerB,
    );
    if (tickets[0].n !== 0) throw new Error(`customer B saw ${tickets[0].n} tickets`);
    if (notes[0].n !== 0) throw new Error('customer B saw internal notes');
    return '0 tickets, 0 internal notes';
  });

  await check('RLS: owning customer sees exactly their own ticket', async () => {
    const rows = await asRole('authenticated', `select count(*)::int as n from tickets`, customerA);
    if (rows[0].n !== 1) throw new Error(`owner saw ${rows[0].n} tickets, expected 1`);
    return 'exactly 1';
  });

  await check('RLS: customer cannot update another customer’s ticket', async () => {
    let affected = null;
    try {
      const rows = await asRole(
        'authenticated',
        `with updated as (
           update tickets set priority = 'critical' returning 1
         ) select count(*)::int as n from updated`,
        customerB,
      );
      affected = rows[0].n;
    } catch (error) {
      // A row-security violation is also an acceptable outcome.
      if (!/row-level security|permission denied/.test(error.message)) throw error;
      affected = 0;
    }
    if (affected !== 0) throw new Error(`customer B modified ${affected} ticket(s)`);
    return 'no rows updated';
  });

  await check('RLS: customer cannot read staff-only tables', async () => {
    const rows = await asRole(
      'authenticated',
      `select
         (select count(*) from audit_logs)::int  as audit,
         (select count(*) from sla_policies)::int as policies,
         (select count(*) from job_runs)::int     as jobs
       `,
      customerA,
    );
    const row = rows[0];
    if (row.audit !== 0) throw new Error('customer read audit logs');
    if (row.policies !== 0) throw new Error('customer read SLA policies');
    if (row.jobs !== 0) throw new Error('customer read job runs');
    return 'audit, SLA config and job runs all hidden';
  });

  // ------------------------------------------------- user administration (0009)

  const admin1 = '44444444-4444-4444-4444-444444444444';
  const admin2 = '55555555-5555-5555-5555-555555555555';
  const agent1 = '66666666-6666-6666-6666-666666666666';
  const viewer1 = '77777777-7777-7777-7777-777777777777';

  const grantRole = async (role, userId) => {
    const admin = await one(`select id from roles where code = 'admin'`);
    await exec(`
      insert into auth.users (id, email, email_confirmed_at)
      values ('${userId}', '${userId.slice(0, 8)}@example.com', now())
      on conflict (id) do nothing;
      insert into user_roles (user_id, role_id) values ('${userId}', '${admin.id}')
      on conflict do nothing;
    `);
    return role;
  };

  await check('administration: two active administrators exist as fixtures', async () => {
    await exec(`
      insert into auth.users (id, email, email_confirmed_at)
      values ('${admin1}', 'admin1@example.com', now())
      on conflict (id) do nothing;
      insert into auth.users (id, email, email_confirmed_at)
      values ('${admin2}', 'admin2@example.com', now())
      on conflict (id) do nothing;
      insert into auth.users (id, email, email_confirmed_at)
      values ('${agent1}', 'agent1@example.com', now())
      on conflict (id) do nothing;
      insert into auth.users (id, email, email_confirmed_at)
      values ('${viewer1}', 'viewer1@example.com', now())
      on conflict (id) do nothing;
    `);

    const rows = await asRole(
      'authenticated',
      `
        select app.set_user_role('${admin1}', 'admin', true);
        select app.set_user_role('${admin2}', 'admin', true);
        select app.set_user_role('${agent1}', 'agent', true);
        select app.set_user_role('${viewer1}', 'management_viewer', true);
        select count(*)::int as admins from user_roles ur
          join roles r on r.id = ur.role_id where r.code = 'admin';
      `,
      admin1,
    );
    const admins = rows[rows.length - 1].admins;
    if (admins !== 2) throw new Error(`expected 2 admins, got ${admins}`);
    return 'admin1, admin2, agent1, viewer1 provisioned through the RPC';
  });

  await check('administration: staff roles replace the customer role only by refusal', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.set_user_role('${agent1}', 'customer', true)`,
        admin1,
      );
    } catch (error) {
      rejected = /mutually exclusive/.test(error.message);
    }
    if (!rejected) throw new Error('agent was also given the customer role');
    return 'customer + staff combination refused';
  });

  await check('administration: a non-administrator cannot manage users', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.set_user_role('${viewer1}', 'admin', true)`,
        viewer1,
      );
    } catch (error) {
      rejected = /permission denied/.test(error.message);
    }
    if (!rejected) throw new Error('viewer granted an admin role');
    return 'user.manage enforced';
  });

  await check('administration: the last active administrator cannot be demoted', async () => {
    // Remove the second admin first, then attempt to remove the first.
    await asRole(
      'authenticated',
      `select app.set_user_role('${admin2}', 'admin', false)`,
      admin1,
    );

    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.set_user_role('${admin1}', 'admin', false)`,
        admin1,
      );
    } catch (error) {
      rejected = /last active administrator/.test(error.message);
    }
    if (!rejected) throw new Error('the only administrator demoted themselves');
    return 'last-admin protection enforced';
  });

  await check('administration: the last active administrator cannot be suspended', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.set_account_status('${admin1}', 'suspended')`,
        admin1,
      );
    } catch (error) {
      rejected = /last active administrator/.test(error.message);
    }
    if (!rejected) throw new Error('the only administrator suspended themselves');
    return 'status protection enforced';
  });

  await check('administration: account status respects its transition matrix', async () => {
    let rejected = false;
    try {
      // agent1 is active; active -> pending is not an allowed transition.
      await asRole(
        'authenticated',
        `select app.set_account_status('${agent1}', 'pending')`,
        admin1,
      );
    } catch (error) {
      rejected = /illegal account status change/.test(error.message);
    }
    if (!rejected) throw new Error('active -> pending was allowed');
    return 'matrix enforced';
  });

  await check('administration: a suspended agent is reactivated and audited', async () => {
    await asRole('authenticated', `select app.set_account_status('${agent1}', 'suspended')`, admin1);
    const suspended = await one(`select account_status from profiles where id = '${agent1}'`);
    if (suspended.account_status !== 'suspended') throw new Error('not suspended');

    await asRole('authenticated', `select app.set_account_status('${agent1}', 'active')`, admin1);
    const active = await one(`select account_status from profiles where id = '${agent1}'`);
    if (active.account_status !== 'active') throw new Error('not reactivated');

    const audit = await one(`
      select count(*)::int as n from audit_logs
      where entity_id = '${agent1}' and action = 'user.status_changed'
    `);
    if (audit.n < 2) throw new Error(`expected 2 audit rows, got ${audit.n}`);
    return 'suspend + reactivate, both audited';
  });

  await check('administration: only staff can join a team', async () => {
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.set_team_membership(
           (select id from teams where code = 'general'), '${customerA}', 'member', true
         )`,
        admin1,
      );
    } catch (error) {
      rejected = /only staff/.test(error.message);
    }
    if (!rejected) throw new Error('a customer joined a support team');
    return 'staff-only membership enforced';
  });

  await check('administration: leader may manage own team but not appoint leaders', async () => {
    const team = await one(`select id from teams where code = 'general'`);

    await asRole(
      'authenticated',
      `select app.set_team_membership('${team.id}', '${agent1}', 'leader', true)`,
      admin1,
    );

    // As the leader: adding a member is allowed.
    await asRole(
      'authenticated',
      `select app.set_team_membership('${team.id}', '${admin2}', 'member', true)`,
      agent1,
    );

    // As the leader: appointing another leader is not.
    let rejected = false;
    try {
      await asRole(
        'authenticated',
        `select app.set_team_membership('${team.id}', '${admin2}', 'leader', true)`,
        agent1,
      );
    } catch (error) {
      rejected = /only an administrator can appoint/.test(error.message);
    }
    if (!rejected) throw new Error('a leader appointed another leader');
    return 'leader scope enforced';
  });

  await check('administration: list_users is paged, filterable and admin-only', async () => {
    const rows = await asRole(
      'authenticated',
      `select * from app.list_users(null, 'agent'::public.role_code, null, 10, 0)`,
      admin1,
    );
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('directory returned nothing');
    if (!rows.every((row) => row.roles.includes('agent'))) {
      throw new Error('role filter not applied');
    }
    const paged = await asRole(
      'authenticated',
      `select * from app.list_users(null, null, null, 2, 0)`,
      admin1,
    );
    if (paged.length > 2) throw new Error(`limit ignored: got ${paged.length} rows`);

    let rejected = false;
    try {
      await asRole('authenticated', `select * from app.list_users(null, null, null, 5, 0)`, agent1);
    } catch (error) {
      rejected = /permission denied/.test(error.message);
    }
    if (!rejected) throw new Error('a non-admin read the user directory');
    return 'filter and page applied, non-admin refused';
  });

  await check('administration: list_teams is staff-only', async () => {
    const staffRows = await asRole('authenticated', `select * from app.list_teams()`, agent1);
    if (!Array.isArray(staffRows) || staffRows.length === 0) throw new Error('no teams for staff');

    let rejected = false;
    try {
      await asRole('authenticated', `select * from app.list_teams()`, customerA);
    } catch (error) {
      rejected = /permission denied/.test(error.message);
    }
    if (!rejected) throw new Error('a customer listed teams');
    return 'staff see teams, customers refused';
  });
} catch (error) {
  failed++;
  console.error('\nAborted:', error.message);
} finally {
  await client?.end().catch(() => {});

  console.log('\nResults');
  console.log('-------');
  for (const result of results) {
    console.log(
      `${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `  (${result.detail})` : ''}`,
    );
  }
  const passed = results.filter((result) => result.ok).length;
  const failedCount = results.filter((result) => !result.ok).length;
  console.log(`\n${passed} passed, ${failedCount} failed`);

  await pg.stop().catch(() => {});
  process.exit(failedCount > 0 || failed > 0 ? 1 : 0);
}
