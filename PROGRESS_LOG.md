# PROGRESS LOG

A dated, honest log of what was produced and verified. Nothing is marked done before it has been
executed, and failures are recorded as failures.

---

## 2026-10-31 — Phase 1a: foundation design

**Approved decisions** (owner, this date): foundation approved; proposed SLA resolution targets
accepted; EU Frankfurt region; English default with in-app language choice.

**Produced** — 12 design documents (`README.md`, `docs/*.md`). No code at that point.

**Tests executed** — none. **Deployment** — none.

---

## 2026-10-31 — Phase 1b: foundation implementation (local)

### Files created/changed

**Toolchain**
`package.json` · `tsconfig.json` · `next.config.ts` · `postcss.config.mjs` · `eslint.config.mjs` ·
`vitest.config.mts` · `playwright.config.ts` · `.gitignore` · `.env.example` · `.github/workflows/ci.yml`

**Database** — `supabase/config.toml`, `supabase/seed.sql`, and 9 migrations:
`0001_extensions_and_enums` · `0002_identity` · `0003_teams_and_catalogue` · `0004_sla_config` ·
`0005_tickets` · `0006_kb_and_notifications` · `0007_rls` · `0008_rpcs`

**Application**
- `src/lib`: `env.ts`, `logger.ts`, `errors.ts`, `validation.ts`, `utils.ts`,
  `supabase/{client,server,admin,database.types}.ts`, `auth/session.ts`, `email/{provider,templates}.ts`
- `src/i18n`: `routing.ts`, `request.ts`, `navigation.ts`; `src/messages/{en,ar}.json`
- `src/app`: locale layout, marketing landing, auth pages (sign-in, sign-up, check-email,
  forgot/reset password), customer portal + profile, staff console shell, `/auth/callback`,
  `/api/health`
- `src/modules`: `tickets/domain/transitions.ts`, `identity/domain/{permissions,scope}.ts`,
  `identity/services/{auth.actions,profile.actions,auth-types}.ts`
- `src/components`: UI primitives (button, text field, layout) and the locale switcher
- `src/proxy.ts` — locale resolution plus a coarse session gate

**Tests and scripts**
`tests/unit/{transitions,permissions,scope,validation,i18n,email-templates}.test.ts`,
`tests/e2e/public.spec.ts`, `tests/setup.ts`, `scripts/db-smoke.mjs`

### Database changes

Executed against a real PostgreSQL 18.6 cluster (embedded, UTF-8) — see `docs/TEST_RESULTS.md` §3:
36 tables/enums, 9 migrations, seed with 5 roles, 50 permissions, 102 grants, 11 categories,
4 SLA targets, 5 working days, 13 settings. RLS enabled on every public table.

**Not applied to any hosted Supabase project** — none exists yet.

### Implemented functionality

- Bilingual routing (`/en`, `/ar`) with RTL, logical CSS properties, persisted per-user locale.
- Customer registration, email-verification flow wiring, sign-in, sign-out, password reset and
  password change, profile management — all with server-side validation and translated errors.
- Session and role loading (`getSessionUser`) with team memberships; staff/customer route guards.
- Database: full schema, triggers for transitions, timestamp stamping, assignee scope, subcategory
  parentage, audit immutability, derived `is_staff`; RPCs `create_ticket`, `add_message`,
  `transition_ticket`, `assign_ticket`, `refresh_sla_state`; concurrency-safe reference allocation;
  business-hours SLA clock.
- Security: RLS on every table with per-operation policies, column-write guards, private-note
  protection at three layers, `server-only` guard on the service-role client, security headers,
  structured logging, typed errors, honest health endpoint.

### Tests executed

| Command | Result |
|---|---|
| `npm run lint` | pass, 0 problems |
| `npx tsc --noEmit` | pass, 0 errors |
| `npm run test` | 6 files, **53 passed** |
| `npm run db:smoke` | **37 passed, 0 failed** |
| `npm run build` | pass, 22 routes |
| `npx playwright test` (3 profiles, against the built app on :3100) | **28 passed, 1 skipped by design** |

### Deployment status

**Not deployed.** No GitHub repository, Supabase project or Vercel project was created — the
accounts were not provided. `docs/DEPLOYMENT_GUIDE.md` is ready to execute the moment they exist.

### Known issues

See `docs/KNOWN_ISSUES.md` — 13 open (none S1), 9 resolved during this phase.

### Remaining work

1. Create the GitHub repository, both Supabase projects and the Vercel projects; run the deployment
   checklist (K-01).
2. Phase 2 UI: staff invitation and role administration, account status management.
3. Phase 3+: tickets, console, SLA sweeps, knowledgebase, reports, full test suite.

---

## Phase report template (kept for later phases)

```
## <date> — Phase <n>: <name>

Files created/changed:
Database changes:
Implemented functionality:
Tests executed (command + result):
Test results:
Known issues:
Deployment status (URL, or "not deployed"):
Remaining work:
```
