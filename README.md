# Customer Ticketing System (CTS)

Bilingual (English / Arabic, full RTL) customer support ticketing platform.

- **Customer Portal** — external customers raise and track service requests.
- **Support Console** — internal staff receive, assign, work, escalate and resolve tickets.

Version 1 is built on Next.js + Supabase and hosted on Vercel. A later, separately approved
rebuild targets .NET 10 / Angular / SQL Server; nothing in this repository implements that
migration, but the code and documentation are structured so it can be reproduced faithfully.

---

## Project status

| Item | State |
|---|---|
| Phase | **1 — Foundation (implemented locally)** |
| Application code | Built: project, schema, RLS, auth, portal/console shells |
| Database | Migrations + seed written and **executed against PostgreSQL 18** (37 checks pass) |
| Tests | 53 unit tests, 28 E2E checks across en/ar/desktop/mobile — all executed |
| GitHub / Vercel / Supabase cloud | **Not created** — no cloud account was provided |
| Blocking decisions | See [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) |
| Progress log | [PROGRESS_LOG.md](PROGRESS_LOG.md) |

Nothing is marked complete until it has been built and executed. Live deployment URLs will be added
here only after the environment exists and the checklist in
[docs/DEPLOYMENT_ARCHITECTURE.md](docs/DEPLOYMENT_ARCHITECTURE.md) §8 has been walked.

---

## Technology stack (v1)

Versions were resolved from the npm registry on 2026-10-31 and must stay mutually compatible.

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, React Server Components) | 16.4.3 |
| UI runtime | React / React DOM | 19.3.1 |
| Language | TypeScript | 6.0.3 |
| Styling | Tailwind CSS (+ `@tailwindcss/postcss`) | 4.3.3 |
| Component library | shadcn/ui (Radix primitives, copied into repo) | current CLI |
| Database | Supabase PostgreSQL | managed (PG 15+) |
| Auth | Supabase Auth (email + password, email verification) | GoTrue |
| Data access | `@supabase/supabase-js` + `@supabase/ssr` | 2.118.0 / 0.12.7 |
| Validation | Zod | 4.6.7 |
| i18n | next-intl | 4.14.9 |
| Email | Resend SDK (provider-abstracted) | 6.37.0 |
| Charts | Recharts | 3.10.1 |
| Icons | lucide-react | 1.66.0 |
| Dates | date-fns (+ `date-fns-tz`) | 4.4.0 |
| Unit tests | Vitest (+ `@vitest/coverage-v8`, jsdom, Testing Library) | 5.0.5 |
| E2E tests | Playwright | 1.64.1 |
| Lint | ESLint + `eslint-config-next` | 10.14.0 / 16.4.3 |
| Runtime | Node.js | 24.x LTS |
| Package manager | npm | 11.x |

**TypeScript is pinned to 6.0.3, not the latest 7.0.2.** `eslint-config-next@16.4.3` depends on
`typescript-eslint@8`, which declares `typescript >=4.8.4 <6.1.0`. Using TypeScript 7 would
break lint and typed lint rules. Revisit when the lint toolchain supports TS 7.

No dependency is added unless the design documents justify it.

---

## Repository layout

```
.
├─ src/
│  ├─ app/                     # routing only: layouts, pages, route handlers
│  ├─ modules/                 # domain modules (business logic lives here)
│  ├─ components/              # shared UI (design system + composites)
│  ├─ lib/                     # infrastructure: supabase, authz, env, logging, email…
│  └─ i18n/                    # message catalogs (en, ar)
├─ supabase/                   # migrations, seeds, RLS (pgTAP) tests
├─ tests/                      # unit (Vitest) and e2e (Playwright)
├─ docs/                       # architecture, schema, security, deployment, roadmap
└─ public/
```

Full explanation: [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md).

---

## Documentation index

| Document | Purpose |
|---|---|
| [SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) | Architecture, layers, module map, runtime flows |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | ERD, conventions, table catalog, core DDL |
| [DATABASE_RELATIONSHIPS.md](docs/DATABASE_RELATIONSHIPS.md) | Cardinality, cascade rules, cross-entity flows |
| [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Enumerations and column definitions |
| [ROLES_AND_PERMISSIONS.md](docs/ROLES_AND_PERMISSIONS.md) | Roles, permission codes, role×permission matrix |
| [TICKET_WORKFLOW.md](docs/TICKET_WORKFLOW.md) | Statuses, transition matrix, actors, side effects |
| [SLA_CONFIGURATION.md](docs/SLA_CONFIGURATION.md) | Policies, calendars, clock rules, escalation |
| [SECURITY_AND_RLS.md](docs/SECURITY_AND_RLS.md) | Threat model, RLS design, storage, rate limits, audit |
| [DEPLOYMENT_ARCHITECTURE.md](docs/DEPLOYMENT_ARCHITECTURE.md) | GitHub / Vercel / Supabase topology, environments, recovery |
| [ROADMAP.md](docs/ROADMAP.md) | Phases 1–9 with deliverables and exit criteria |
| [GOING_LIVE.md](docs/GOING_LIVE.md) | **Hands-on guide: GitHub, Supabase, Vercel, first run, troubleshooting** |
| [OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) | Business decisions requiring owner approval |
| [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Server actions, route handlers, RPC contracts |
| [ENVIRONMENT_CONFIGURATION.md](docs/ENVIRONMENT_CONFIGURATION.md) | Every variable, per environment |
| [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Exact deployment steps and verification checklist |
| [TEST_PLAN.md](docs/TEST_PLAN.md) | Test register with expected results |
| [TEST_RESULTS.md](docs/TEST_RESULTS.md) | Executed results, including what was not run |
| [SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) | Implemented controls, open gaps |
| [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Open defects, accepted trade-offs, resolved history |
| [MIGRATION_READINESS.md](docs/MIGRATION_READINESS.md) | What is prepared for the future .NET rebuild |
| [PROGRESS_LOG.md](PROGRESS_LOG.md) | Dated log of what was actually built and verified |

---

## Local development

```bash
npm install
cp .env.example .env.local     # add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

npx supabase start             # PostgreSQL + Auth + Storage (needs Docker)
npm run db:reset               # apply migrations + seed
npm run dev                    # http://localhost:3000/en
```

Verification commands (each executes real work and reports failures with a non-zero exit code):

```bash
npm run lint                   # ESLint, including layer-boundary rules
npm run typecheck              # tsc --noEmit
npm run test                   # Vitest: 53 unit tests
npm run db:smoke               # applies all migrations + seed to a throwaway PostgreSQL
npm run build                  # production build
npm run test:e2e               # Playwright (needs a running server or E2E_BASE_URL)
```

`npm run db:smoke` starts an embedded PostgreSQL 18 instance on a temporary data directory, applies
every migration and the seed, then asserts schema, RLS and business-rule invariants (37 checks).
It requires no Docker and no Supabase account; it is the fastest way to prove the database layer.

Environment variables are documented in [.env.example](.env.example). No secret is ever committed;
only `.env.example` with placeholder values is tracked.

Docker is required for the full local Supabase stack. If Docker is unavailable, `npm run db:smoke`
still validates the schema, and a hosted Supabase project can be used with `supabase db push`.

---

## Non-negotiables enforced in this project

1. Every business rule is validated on the server; UI state is never authoritative.
2. Row Level Security is enabled on every table and tested with real customer/agent accounts.
3. Private internal notes are never returned by a customer-facing query.
4. Dashboard and report figures are computed from database records — never hardcoded.
5. A feature is "complete" only after its tests have been executed and their output recorded.
6. Migrations are forward-only and non-destructive.
