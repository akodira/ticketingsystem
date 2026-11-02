# TEST PLAN

Last updated: 2026-10-31 · Phase 1 scope

This plan grows with each phase. Rows are added when a module exists; nothing is pre-marked as
passed. Results are recorded in [TEST_RESULTS.md](TEST_RESULTS.md).

---

## 1. Layers

| Layer | Tool | Location | What it proves |
|---|---|---|---|
| Unit | Vitest | `tests/unit` | Pure rules: transitions, permissions, scope, validation, i18n, templates |
| Schema / RLS | Embedded PostgreSQL + node-postgres | `scripts/db-smoke.mjs` | Migrations apply; constraints, triggers and policies behave |
| End-to-end | Playwright | `tests/e2e` | Real pages render, forms validate, gates redirect |
| Manual / UAT | script | Phase 8 | Business acceptance with real accounts and Arabic content |

## 2. Commands

```bash
npm run lint          # ESLint incl. layer boundaries
npm run typecheck     # tsc --noEmit
npm run test          # unit
npm run db:smoke      # migrations, seed, constraints, RLS  (no Docker needed)
npm run build         # production build
npm run test:e2e      # Playwright; needs a server or E2E_BASE_URL
```

In CI the database suite runs through the Supabase CLI (`supabase db reset`) instead of the embedded
server, because Supabase also provisions GoTrue and Storage.

## 3. Test register

Status values: `Not Started` · `Passed` · `Failed` · `Blocked` · `Retest Required`.
Severity if failed: `S1` critical · `S2` major · `S3` minor · `S4` cosmetic.

### 3.1 Foundation and database

| ID | Module | Scenario | Preconditions | Steps | Expected | Status |
|---|---|---|---|---|---|---|
| DB-01 | Schema | All migrations apply to an empty database | PostgreSQL 15+ | run `db:smoke` | 9 migrations + seed applied, no error | Passed |
| DB-02 | Seed | Reference data present | DB-01 | query counts | 5 roles, 50 permissions, ≥100 grants, 11 categories, 4 SLA targets, 5 working days | Passed |
| DB-03 | RLS | RLS enabled on every public table | DB-01 | query `pg_class` | zero tables without RLS | Passed |
| DB-04 | RLS | Every table has a policy except the two service-only tables | DB-01 | query `pg_policy` | only `rate_limits`, `ticket_sequences` | Passed |
| DB-05 | RLS | Anonymous sees no tickets | DB-01 | `set role anon; select from tickets` | 0 rows | Passed |
| DB-06 | RLS | Customer B cannot see Customer A's ticket | two customers, one ticket | query as B | 0 rows | Passed |
| DB-07 | RLS | Customer B cannot see internal notes | internal note exists | query as B | 0 rows | Passed |
| DB-08 | RLS | Owning customer sees exactly their ticket | one ticket | query as A | 1 row | Passed |
| DB-09 | RLS | Customer cannot update another customer's ticket | two customers | `update tickets` as B | 0 rows affected / rejected | Passed |
| DB-10 | RLS | Customer cannot read staff-only tables | — | query audit_logs, sla_policies, job_runs as B | 0 rows each | Passed |
| DB-11 | Identity | Signup mirrors auth.users into profiles | — | insert auth.users | profile + customer + customer role created, active when verified | Passed |
| DB-12 | Identity | Unverified signup is pending | — | insert without confirmation | `account_status = pending` | Passed |
| DB-13 | Identity | Customer cannot set `is_staff` | customer | update as self | rejected by trigger, value unchanged | Passed |
| DB-14 | Identity | Customer cannot set `account_status` | pending user | update as self | rejected by trigger | Passed |
| DB-15 | Identity | Customer can update their own name and locale | customer | update as self | values changed | Passed |
| DB-16 | Tickets | RPC allocates reference, SLA and history | active customer | call `create_ticket` | `CTS-YYYY-NNNNNN`, SLA row, 1 history row, initial message, default team | Passed |
| DB-17 | Tickets | References increment per year | DB-16 | call twice | `…000001`, `…000002` | Passed |
| DB-18 | Tickets | Pending account cannot create a ticket | unverified user | call `create_ticket` | rejected (`account is not active`) | Passed |
| DB-19 | Tickets | Customer cannot author an internal note | ticket exists | insert message with `visibility=internal` | rejected by CHECK constraint | Passed |
| DB-20 | Workflow | Illegal transition `new → closed` rejected | ticket in `new` | update status | rejected by trigger | Passed |
| DB-21 | Workflow | Resolution without summary rejected | ticket | set `resolved` with null summary | rejected by CHECK | Passed |
| DB-22 | Workflow | Legal resolution stamps `resolved_at` | ticket | set `resolved` + summary | row updated, timestamp set | Passed |
| DB-23 | Tickets | Reference is immutable | ticket | update reference | rejected | Passed |
| DB-24 | Audit | `audit_logs` rejects delete | audit rows exist | `delete from audit_logs` | rejected | Passed |
| DB-25 | SLA | Business minutes skip the weekend | default calendar | Thu 16:00 + 120 min | Sunday 09:00 | Passed |
| DB-26 | SLA | Business minutes skip holidays | holiday on the due date | same | next working day 09:00 | Passed |
| DB-27 | Permissions | Viewer holds no write permission | seed | query role_permissions | 0 matching rows | Passed |
| DB-28 | Permissions | No internal role can create tickets (D-09) | seed | query | 0 rows | Passed |

### 3.2 Application

| ID | Module | Scenario | Expected | Status |
|---|---|---|---|---|
| APP-01 | Build | Production build succeeds | all routes generated, exit 0 | Passed |
| APP-02 | Lint | ESLint clean including layer-boundary rules | exit 0 | Passed |
| APP-03 | Types | `tsc --noEmit` clean | exit 0 | Passed |
| APP-04 | i18n | `en`/`ar` catalogs have identical keys and placeholders | test passes | Passed |
| APP-05 | i18n | Arabic landing renders RTL | `<html dir="rtl" lang="ar">`, Arabic heading | Passed |
| APP-06 | i18n | Language switch preserves the path | `/en/sign-in` → `/ar/sign-in` | Passed |
| APP-07 | Auth | Sign-in page has labelled, reachable fields | labels + button visible | Passed |
| APP-08 | Auth | Mismatched passwords are rejected client-side | message shown, no request | Passed |
| APP-09 | Auth | Short password is rejected | message shown | Passed |
| APP-10 | AuthZ | `/en/portal` redirects anonymous → sign-in with `next` | 307 to `/en/sign-in?next=%2Fportal` | Passed |
| APP-11 | AuthZ | `/ar/console` redirects anonymous → sign-in | 307 to `/ar/sign-in?next=%2Fconsole` | Passed |
| APP-12 | Ops | `/api/health` reports real state | 200 `ok` or 503 `unconfigured`/`degraded`; never a fake OK | Passed |
| APP-13 | Security | CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` present | all six headers on HTML | Passed |
| APP-14 | Responsive | Arabic sign-in fits a mobile viewport | no horizontal overflow | Passed |
| APP-15 | Unit | Transition matrix equals the SQL function | parity test passes | Passed |
| APP-16 | Unit | Permission matrix equals seed.sql | parity test passes | Passed |
| APP-17 | Unit | Scope rules (own/org/team/all) | fixture matrix passes | Passed |
| APP-18 | Unit | Email templates escape HTML and URLs | escaping test passes | Passed |

### 3.4 User administration (Phase 2)

| ID | Module | Scenario | Expected | Status |
|---|---|---|---|---|
| ADM-01 | Roles | Grant an internal role to a customer | rejected: roles are mutually exclusive | Pending execution |
| ADM-02 | Roles | Grant the customer role to a staff member | rejected | Pending execution |
| ADM-03 | Roles | Grant a second staff role | accepted, audited | Pending execution |
| ADM-04 | Roles | Non-administrator attempts a role change | `permission denied` | Pending execution |
| ADM-05 | Roles | The last active administrator demotes themselves | rejected | Pending execution |
| ADM-06 | Status | The last active administrator suspends themselves | rejected | Pending execution |
| ADM-07 | Status | `active → pending` | rejected by the matrix | Pending execution |
| ADM-08 | Status | Suspend then reactivate an agent | both accepted, two audit rows | Pending execution |
| ADM-09 | Teams | A customer is added to a support team | rejected | Pending execution |
| ADM-10 | Teams | A leader adds a member to their own team | accepted | Pending execution |
| ADM-11 | Teams | A leader appoints another leader | rejected | Pending execution |
| ADM-12 | Directory | `list_users` filters by role and applies the limit | filtered, paged | Pending execution |
| ADM-13 | Directory | A non-admin calls `list_users` | `permission denied` | Pending execution |
| ADM-14 | Teams | `list_teams` for staff vs customer | staff see teams, customer refused | Pending execution |
| ADM-15 | UI | Customer opens `/en/console/users` | redirected to the portal | Pending execution |
| ADM-16 | UI | Viewer opens `/en/console/users` | page renders with a read-only notice, no actions | Pending execution |
| ADM-17 | Rules | Unit tests for every rule above | pass | Pending execution |

### 3.5 Deferred to later phases

Auth against a live Supabase (verification email round trip), attachment upload/download,
ticket creation through the UI, SLA sweep with a controlled clock, bulk actions, exports, and the
full security matrix SEC-01…SEC-18 from [SECURITY_AND_RLS.md](SECURITY_AND_RLS.md) §10.
These are `Not Started` and must not be reported as passing.

## 4. Manual / UAT (Phase 8)

Scripted journeys with a real customer account and a real agent account, in both languages, on
desktop and mobile, against the deployed environment. Each journey is recorded with screenshots.
