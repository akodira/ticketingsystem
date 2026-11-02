# ROADMAP

Status: **design for approval** · Last updated: 2026-10-31

Nine phases. Each phase ends with a written report containing: files created/changed, database
changes, functionality implemented, tests executed, test results, known issues, deployment status,
remaining work. A phase is not started until the previous one's report exists.

---

## Phase 1 — Project foundation

**Build**
- Next.js 16 app (TypeScript, Tailwind 4, App Router, ESLint), pinned dependencies, `.env.example`.
- Route groups and layouts: `(auth)`, `(customer)`, `(console)`; `next-intl` with `en`/`ar` and RTL.
- Supabase clients (browser, server, admin), `proxy.ts` with session refresh and route guards.
- Full schema migrations, enums, triggers, RPCs, seed data (roles, permissions, calendar, default
  SLA policy, categories), storage bucket + policies.
- RLS on every table + pgTAP suite.
- Structured logger, `AppError`, Zod base schemas, `AppProvider` for email.
- GitHub repository, branches, Actions CI, Vercel projects and environments.

**Exit criteria** — `npm run build`, `lint`, `typecheck`, unit tests and the pgTAP RLS suite pass
locally and in CI; preview and production deployments pass the 14-point checklist; live URLs recorded.

---

## Phase 2 — Authentication and user management

**Build** — registration, email verification, sign-in/out, password reset and change, profile
management, role assignment UI for admins, staff invitation flow, account status management, customer
and organization records.

**Delivered**
- Registration, verification, sign-in/out, password reset and change, profile management (Phase 1b,
  re-verified in Phase 2).
- Migration `0009_user_administration.sql`: `set_user_role`, `set_account_status`,
  `set_team_membership`, `list_users`, `list_teams`, with staff/customer exclusivity,
  last-active-administrator protection, an account-status transition matrix, and audit rows.
- Console user directory (`/console/users`) with search, role and status filters, pagination, role
  grants/revocations and status changes — every action re-checked in the database.
- Staff invitation through the Supabase Admin API, gated on `user.manage`.
- Team directory (`/console/teams`) and role-aware console navigation.

**Exit criteria** — a new customer can complete the full auth journey; a suspended account is
refused; role changes take effect on the next request; audit rows exist. Verified at the database
level; the email round trip still requires a deployed environment.

---

## Phase 3 — Customer portal

**Build** — customer dashboard with live counts, ticket creation (category-dependent custom fields,
attachments, KB suggestions), ticket list with search/filter/sort/pagination, ticket detail with
public conversation, replies, attachments, status timeline, resolution confirm/reject, reopen,
notifications centre.

**Exit criteria** — a customer completes create → reply → resolve → confirm end to end against the
deployed database; no figure on the dashboard is hardcoded; E2E suite green.

---

## Phase 4 — Support console

**Build** — console dashboard (all figures from SQL aggregates), queue with filters and saved views,
ticket detail (10 sections), assignment/reassignment with team validation, escalation, priority and
status changes, public reply and internal notes, bulk actions, team and membership management,
workload view, activity/audit panel.

**Exit criteria** — agent and team-leader journeys pass with two teams and three agents; an
out-of-team agent is refused by the API and not merely by the UI; internal notes never appear for
customers.

---

## Phase 5 — SLA and escalation

**Build** — SLA admin UI (policies, targets, calendars, hours, holidays), business-minute engine,
pause/resume, warning and breach sweeps, escalation rules, SLA widgets on ticket detail and
dashboard, cron endpoints with advisory lock and idempotent notifications.

**Exit criteria** — a ticket with a 15-minute target breaches in a controlled test with the clock
advanced, exactly one breach notification is produced, and re-running the sweep produces none.

---

## Phase 6 — Knowledgebase and administration

**Build** — KB categories and bilingual articles, search (en+ar), publishing workflow, related
articles, helpful/not-helpful feedback, KB management screens, suggestion panel on ticket creation,
category and custom-field administration, customer management, system settings screen.

**Exit criteria** — Arabic search returns Arabic articles; a published article appears as a
suggestion; an unpublished one is invisible to customers; custom-field validation is enforced
server-side against a 9-type matrix.

---

## Phase 7 — Reports and KPIs

**Build** — operational dashboard, SLA report, agent and team performance, CSAT, trend charts,
filters (date/team/agent/priority/category/status), CSV export, documented KPI definitions.

**Exit criteria** — every figure on every report is proven against a hand-computed fixture dataset;
the KPI definitions document matches the SQL; exports respect scope and RLS.

---

## Phase 8 — Testing and production readiness

**Build** — full functional suite, security suite (SEC-01…SEC-18), regression suite, Arabic/RTL
validation, responsive checks, performance pass, error-handling review, UAT script, production
deployment, `TEST_PLAN.md`, `TEST_RESULTS.md`, `KNOWN_ISSUES.md`, `SECURITY_REVIEW.md`.

**Exit criteria** — every executed case has a recorded result; no open Sev-1/Sev-2 defect; the
production URL is live and tested end to end with real email delivery.

---

## Phase 9 — Migration preparation (no code)

**Build** — `MIGRATION_READINESS.md` containing architecture documentation, the full data
dictionary export, business-rule catalogue, API inventory (every action/route with contract and
permission), test-case baseline, and the PostgreSQL → SQL Server mapping per table and type.

**Exit criteria** — an independent team could rebuild the approved functionality from the documents
alone; no .NET, Angular or SQL Server code exists in this repository.

---

## Sequencing notes

- Phase 5 depends on Phase 4 (ticket state must exist before SLA reacts to it). SLA *storage* is
  created in Phase 1 with the schema; only the UI and sweep arrive in Phase 5.
- Phase 7's SQL aggregates are written in Phase 7 but the dashboard contract is fixed in Phase 4 so
  the console is not rebuilt.
- Testing is continuous: each phase's own tests are executed before its report. Phase 8 is the
  full-suite consolidation, not the first time tests run.

## Definition of done (every phase)

1. Feature merged to `develop` through a reviewed PR.
2. Build, lint, typecheck, unit and e2e tests executed — output recorded, not assumed.
3. Documentation updated in the same PR.
4. Deployed to preview and verified; production promoted only after the phase's exit criteria.
5. Report written with known issues listed honestly.
