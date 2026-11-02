# SYSTEM ARCHITECTURE

Status: **design for approval** · Owner: Solution Architecture · Last updated: 2026-10-31

---

## 1. Context

CTS is one deployable web application serving two audiences with separate layouts, navigation and
authorization scopes:

| Environment | Audience | URL prefix | Trust level |
|---|---|---|---|
| Customer Portal | External customers | `/{locale}/...` | Untrusted, self-registered |
| Support Console | Support staff | `/{locale}/console/...` | Employees, provisioned by admins |
| Auth screens | Both | `/{locale}/(auth)/...` | Unauthenticated |

It is a **modular monolith**: one Next.js deployment, one PostgreSQL database, one file bucket
namespace. Modules are separated by code boundaries, not by network boundaries. A microservice
split would add operational cost with no benefit at this scale.

---

## 2. Architectural principles

1. **The database is the last line of defence.** Every table has RLS. Application checks are a
   second layer, never the only one.
2. **Business rules are UI-independent.** Status transitions, SLA math, permission checks and
   validation live in `src/modules/*/domain` and `src/modules/*/services` as ordinary TypeScript
   with no React and no Next.js imports. The future Angular/.NET rewrite maps 1:1 onto them.
3. **Pages orchestrate, services decide.** A page or server action authenticates, validates input,
   calls one service method, and renders. It never contains a rule.
4. **One write path per operation.** All ticket mutation goes through the service layer, so
   audit logging, notifications and SLA recalculation cannot be skipped.
5. **Data access is behind repositories.** Only `src/modules/*/repositories` and
   `src/lib/supabase` know the query builder API. Services depend on interfaces (`TicketRepository`),
   which is the seam for the .NET migration.
6. **Deny by default.** RLS policies are permissive only for explicitly granted operations; new
   tables start with RLS enabled and no policy.
7. **Server-only code is marked.** Anything using the service-role key imports `server-only`,
   so a client bundle that touches it fails the build instead of leaking.

---

## 3. Runtime topology

```
                    ┌──────────────────────────────────────────────┐
   Browser  ───────▶│  Vercel (Next.js 16, Node runtime)           │
   (en / ar,        │                                              │
    RTL)            │  RSC pages · Server Actions · Route handlers │
                    │  proxy.ts: locale + session refresh + guard  │
                    └───────┬───────────────────────┬──────────────┘
                            │ supabase-js           │ Resend HTTPS
                            │ (user JWT ⇒ RLS)      ▼
                    ┌───────▼───────────────┐   Email delivery
                    │ Supabase              │
                    │  PostgreSQL + RLS     │
                    │  Auth (GoTrue)        │
                    │  Storage (private)    │
                    │  pg_cron/pg_net ──────┼──▶ /api/cron/* (secret-guarded)
                    └───────────────────────┘
                            ▲
                            │ supabase db push (CI, on merge to main)
                    GitHub Actions / Supabase CLI
```

Two database access modes:

| Client | Key | RLS | Used by |
|---|---|---|---|
| `createServerClient` | anon key + user cookies | **enforced** | All user-facing reads/writes |
| `createAdminClient` | service-role key | **bypassed** | Cron sweeps, email dispatch, audit writes, admin provisioning |

`createAdminClient` lives in `src/lib/supabase/admin.ts`, imports `server-only`, and is referenced
only by `src/modules/*/services/*.system.ts` and `src/app/api/cron/*`.

**Why a service-role client at all:** background jobs must act without a logged-in user and must
update rows the actor cannot reach (breach flags, delivery attempts). Every system path is written
as a narrow, named function with its own authorization rule, not as a general escape hatch.

---

## 4. Layer model

```
src/app/**                    Routing & composition        (Next.js, RSC, server actions)
        ↓ calls
src/modules/<m>/services      Use cases: authorize → validate → mutate → notify → audit
        ↓ calls
src/modules/<m>/domain        Pure rules: transitions, permissions, SLA math, formatting
src/modules/<m>/schemas       Zod schemas (request, form, DB row shapes)
        ↓ calls
src/modules/<m>/repositories  SQL/query access; returns domain types, not raw builders
        ↓
src/lib/supabase              Client factories, generated DB types
```

Rules of the dependency direction:

- `domain` imports nothing from `services`, `repositories`, `app` or React. It is pure and unit-testable.
- `services` may import `domain`, `schemas`, `repositories`, and infrastructure (`lib/*`).
- `repositories` may import `lib/supabase` and DB types only.
- `app` may import a module's public `index.ts` (services + read models) and shared UI. It may not
  import a repository directly — enforced by an ESLint `no-restricted-imports` rule per layer.
- The reverse direction (module importing `app`) is banned by the same rule.

### Module map

| Module | Responsibility | Key services |
|---|---|---|
| `identity` | profiles, customers, organizations, roles, user provisioning | `registerCustomer`, `updateProfile`, `assignRole`, `setAccountStatus` |
| `teams` | departments, teams, membership, workload | `createTeam`, `addMember`, `getWorkload` |
| `tickets` | ticket CRUD, conversation, assignment, transitions, attachments | `createTicket`, `addMessage`, `assignTicket`, `transitionStatus`, `confirmResolution` |
| `sla` | policies, calendars, clock computation, breach detection | `resolvePolicy`, `computeDueDates`, `sweepSla` |
| `notifications` | in-app notifications, email outbox, templates | `notify`, `dispatchQueue` |
| `knowledgebase` | articles, translations, search, suggestions, feedback | `searchArticles`, `suggestForTicket`, `publishArticle` |
| `admin` | categories, custom fields, settings, reference data | `upsertCategory`, `upsertCustomField`, `updateSetting` |
| `reports` | KPI queries, dashboards, exports | `getDashboard`, `getKpiReport`, `exportCsv` |

Cross-module calls go through a module's `index.ts` only. `tickets` → `sla` and
`tickets` → `notifications` are the only allowed service-to-service dependencies; they are one-way
and are documented because the .NET rewrite must preserve them.

---

## 5. Representative request flows

### 5.1 Create ticket (customer)

1. `POST` server action `createTicketAction(formData)`.
2. Authenticate: `supabase.auth.getUser()`; reject anonymous.
3. Authorize: caller must hold `ticket.create.self` and have an active customer record.
4. Validate: Zod schema from the form + **dynamic** custom-field schema built from
   `custom_fields` rows for the chosen category (server-side; unknown fields are rejected).
5. Upload attachments first to the private bucket under `tickets/<uuid>/...`; validate size, MIME
   and extension against settings, and record them only after the ticket exists.
6. Insert ticket inside a single transaction via RPC `app.create_ticket(...)`:
   - allocate reference from `ticket_sequences` (row lock — concurrency-safe);
   - select SLA policy (category → team → priority default) and compute due dates from the calendar;
   - write `ticket_status_history` (null → `new`);
   - write custom-field values.
7. Enqueue: customer confirmation email, team notification, in-app notification.
8. Return the reference; redirect to the ticket page.

Failure at any step rolls back the ticket. Attachments uploaded before a rollback are removed by a
sweeper (orphan cleanup in the SLA cron job).

### 5.2 Add public reply / internal note

Single service `addMessage({ ticketId, body, visibility })`:

- authorizes with `ticket.reply.own` (customer, public only) or `ticket.note.internal` (staff);
- forces `visibility = 'public'` for customers — the field is never trusted from the client;
- inserts into `ticket_messages`;
- recomputes `tickets.first_response_at`, `last_public_reply_at` / `last_customer_reply_at`;
- resumes or pauses the SLA clock per policy (`pending_customer` → `in_progress`);
- notifies the counterpart only (customers never learn about internal notes).

### 5.3 Status transition

`transitionStatus({ ticketId, to, reason })` → `assertTransition(current, to, actor)` in
`domain/transitions.ts` (same matrix as the DB trigger), then update + append history + run
entered-state effects (set `resolved_at`, pause/resume SLA, enqueue notification, audit).

The database trigger re-checks the matrix, so a bug in the service cannot produce an illegal state.

### 5.4 SLA sweep (background)

`pg_cron` → `pg_net` → `GET /api/cron/sla-sweep` with `Authorization: Bearer $CRON_SECRET`:

1. `pg_try_advisory_lock('cts.sla_sweep')` — concurrent runs exit immediately.
2. Mark `due_soon` where remaining ≤ warning threshold and warning not yet sent.
3. Mark `breached`, set escalation level, notify assignee → team leader → admin (idempotent keys).
4. Apply/close pauses for `pending_customer` tickets.
5. Record the run in `job_runs`.

Same shape for `email-dispatch` (queue drain) and `auto-close` (resolved → closed after N days).

---

## 6. Authentication and authorization

- **Supabase Auth**, email + password, email verification required before creating tickets
  (profile `account_status = 'pending'` until the address is confirmed).
- Sessions in HTTP-only cookies via `@supabase/ssr`; refreshed in `proxy.ts` on every request and
  re-validated in each protected layout (`getUser()`, not `getSession()`).
- **RBAC + scope**: a user has roles (customer, agent, team_leader, admin, management_viewer),
  each role maps to permission codes, and staff permissions are additionally scoped to teams and
  assignment. Full matrix: [ROLES_AND_PERMISSIONS.md](ROLES_AND_PERMISSIONS.md).
- Enforcement points, in order: route guard (coarse) → service (`assertPermission`) → RLS policy
  (authoritative) → storage policy. Hiding a button is never an authorization decision.

---

## 7. Internationalization and RTL

- `next-intl@4` with locale segment `[locale]` — `en` (LTR) and `ar` (RTL).
- Root layout sets `<html lang dir>`; all spacing uses Tailwind **logical properties**
  (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`), so one stylesheet serves both directions.
- Locale resolution: profile `preferred_locale` → cookie → `Accept-Language` → `en`.
- All catalog identifiers live in `src/i18n/messages/{en,ar}.json`; a Vitest test asserts key parity.
- Domain data carries both languages where it is reference data (`name_en`, `name_ar`);
  user-generated content is stored as written, with `locale` recorded.
- Numbers, dates and times use `Intl` with the request locale and the organization's time zone.
- Email and in-app notification text render from locale-tagged templates, so the recipient's
  language, not the actor's, decides the message language.

---

## 8. Infrastructure concerns

| Concern | Approach |
|---|---|
| Validation | Zod at every trust boundary; DB `CHECK` constraints mirror the critical ones |
| Errors | Typed `AppError` (code, httpStatus, i18nKey); expected errors are returned to the UI, unexpected ones are logged with a `requestId` and shown generically |
| Logging | Structured JSON logger (`lib/logger`) with `requestId`, `userId`, `route`, `durationMs`; no PII, no bodies, no tokens |
| Audit | `audit_logs` written by triggers for assignment/status/role changes and by services for reads of sensitive admin operations |
| Rate limiting | Postgres sliding window (`rate_limits` + `app.consume_rate_limit`) — no extra vendor; applied to login-adjacent endpoints, ticket creation, replies and attachment uploads |
| File upload | Private bucket, size/type/extension allow-list, server-side re-validation, download only through `/api/attachments/[id]` which authorizes then issues a 60-second signed URL |
| Email | `EmailProvider` interface: `resend` in staging/production, `console` locally; outbox table + retry with backoff |
| Scheduled work | `pg_cron` + `pg_net` (independent of Vercel plan limits); optional Vercel Cron as a redundant trigger |
| Observability | Vercel runtime logs, `job_runs`, `notification_deliveries` failures, health endpoint `/api/health` |

---

## 9. Data and reporting

Dashboards and reports run **SQL aggregate functions** (`app.report_*`) called with the user's own
JWT, so RLS filters the numbers: an agent sees their team's figures, management sees all. No
statistic is computed in the browser from a cached list, and no figure is hardcoded.

KPI definitions (first response time, resolution time, SLA compliance, reopen rate, CSAT) are
specified once in `docs/REPORTING.md` and implemented in SQL — see [ROADMAP.md](ROADMAP.md) Phase 7.

---

## 10. Migration-readiness (future .NET / Angular / SQL Server)

The rewrite is out of scope, but four things are preserved deliberately:

1. **Pure domain layer** — transition matrix, permission map, SLA rules and reference formatting
   exist as typed functions that translate directly to C# classes.
2. **Repository interfaces** — every service depends on an interface, so an EF Core implementation
   can replace the Supabase one without touching services.
3. **Database shape** — normalized, UUID keys, explicit FKs and enums; `citext`→`nvarchar(320)`,
   `jsonb`→`nvarchar(max)`, `timestamptz`→`datetimeoffset`, enum types→lookup tables. Mapping is
   documented in `MIGRATION_READINESS.md` (Phase 9, not started).
4. **API inventory** — every server action and route handler is recorded with its input contract,
   permission and side effects, so the ASP.NET Core endpoints can be enumerated from the document.

Nothing in v1 uses Supabase-specific behaviour that has no portable equivalent, except Auth and
Storage, which map to ASP.NET Identity and Azure Blob/S3 in the target stack.

---

## 11. Explicit non-goals for v1

- No email-to-ticket, WhatsApp, telephony or social ingestion — web portal is the only channel.
- No microservices, no message broker, no separate backend service.
- No mobile app, no public API for third parties, no SSO/SAML.
- No custom-field types beyond the eight listed in the brief.
- No .NET/Angular/SQL Server code.

---

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vercel Hobby cron limits (daily only) conflict with 15-minute SLAs | SLA missed | Use Supabase `pg_cron` + `pg_net`; verify in staging |
| Service-role key leaks | Full data compromise | `server-only` guard, no client import, key rotation procedure in SECURITY_AND_RLS |
| RLS policy gaps | Cross-customer exposure | Policy-per-table checklist + pgTAP suite run in CI with distinct accounts |
| Business-hours math edge cases (DST, overnight shifts, holidays) | Wrong due dates | Single SQL implementation, table-driven calendars, unit tests over DST boundaries |
| Arabic full-text search quality | Poor KB suggestions | `simple` config + trigram fallback; evaluate Arabic stemmer before Phase 6 |
| TanStack-free server rendering of large ticket lists | Slow console | Server-side pagination (30/page) and indexed filters from day one |
