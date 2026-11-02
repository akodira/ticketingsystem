# DEPLOYMENT ARCHITECTURE

Status: **design for approval** · Last updated: 2026-10-31

Nothing in this document has been deployed. It describes the target topology and the exact steps
Phase 1 will perform. A deployment is reported as successful only after the URL has been opened and
the checklist in §8 has been walked.

---

## 1. Topology

| Component | Service | Environment |
|---|---|---|
| Source control | GitHub repository (private) | `main`, `develop`, `feature/*` |
| CI | GitHub Actions | lint, typecheck, unit, RLS (pgTAP), build |
| Frontend + server | Vercel (Next.js 16, Node 24 runtime) | development / preview / production |
| Database, Auth, Storage | Supabase project | one project for dev+preview, one for production |
| Email | Resend | API key per environment |
| Scheduling | Supabase `pg_cron` + `pg_net` → Vercel cron endpoints | production and staging |

Two Supabase projects are the minimum: **`cts-dev`** (used by local development *and* Vercel preview
deployments) and **`cts-prod`**. Sharing one project between preview and production would let a
feature branch migrate away production data — not acceptable.

---

## 2. Environments

| | Local | Preview | Production |
|---|---|---|---|
| Branch | — | any PR branch | `main` |
| URL | `http://localhost:3000` | `<branch>-<repo>.vercel.app` | custom domain |
| Supabase | local CLI stack (Docker) | `cts-dev` | `cts-prod` |
| Email | `console` provider | Resend sandbox / test address | Resend live |
| Cron | manual `npm run cron:run` | disabled | enabled |
| Seed data | full demo seed | minimal reference seed | reference seed only, no demo tickets |
| Real customer data | no | **never** | yes |

Preview deployments are protected by Vercel Deployment Protection so a feature branch is not
publicly indexable.

---

## 3. Branching and PR workflow

```
main        ← always deployable; production deploys from here
develop     ← integration branch for the current phase
feature/*   ← one per task, branched from develop, merged by PR
fix/*       ← defects found in testing
```

- Commit messages: `<type>(<scope>): <imperative summary>` — e.g. `feat(tickets): allocate reference in creation RPC`.
- Every PR: description with what changed, how it was verified, and screenshots for UI work.
- Required checks before merge: lint, typecheck, unit tests, build, and RLS tests when the PR touches
  `supabase/`.
- `main` is protected: no direct pushes, no force pushes, one approving review.
- Migrations are applied to `cts-prod` **after** merge to `main`, by a CI job that runs
  `supabase db push --linked` with `SUPABASE_DB_URL` from GitHub Secrets. They are never applied from
  a laptop to production.

---

## 4. Vercel configuration

- Framework preset: Next.js. Build `npm run build`. Node 24.x.
- Environment variables set per environment (Production / Preview / Development separately). Preview
  and Development point at `cts-dev`; Production at `cts-prod`.
- No secret is stored in `vercel.json`; that file holds only build settings and security headers.
- Function regions: `fra1` or `bah1` chosen to sit near the Supabase region (see D-05). The database
  region dominates latency; it is chosen first and the Vercel region matched to it.
- Cron: Vercel Cron is used only as a **redundant** trigger for `sla-sweep`; the authoritative
  scheduler is `pg_cron` inside Supabase, because it is reliable on the free plan and independent of
  the deployment platform.

---

## 5. Supabase configuration

| Setting | Dev | Prod |
|---|---|---|
| Region | same as prod (so migration surprises surface early) | chosen per D-05 |
| Auth email confirmation | enabled | enabled |
| Auth sign-ups | enabled (customers only) | enabled (customers only) |
| Password policy | min 10 chars, checked against a denylist | same |
| JWT expiry | 3600 s | 3600 s |
| Storage bucket `ticket-attachments` | private | private |
| Storage size limit | 10 MB | 10 MB |
| Redirect URLs | `http://localhost:3000/**`, preview wildcard | production domain only |
| pg_cron / pg_net | enabled | enabled |
| Backups | daily (free tier) | daily, PITR if the plan allows |
| Network restrictions | none | consider allow-list for the DB |

Redirect URLs are an explicit allow-list. Supabase's wildcard matching for preview deployments is
scoped to the Vercel preview domain pattern, never `*`.

---

## 6. Environment variables

`docs/ENVIRONMENT_CONFIGURATION.md` is generated in Phase 1 and lists every variable with its
scope, whether it is secret, and an example placeholder. The set:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          (server only)
SUPABASE_DB_URL                    (migrations/CI only, not in the Vercel runtime)
CRON_SECRET                        (server only)
RESEND_API_KEY                     (server only)
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME
APP_BASE_URL                       (used in email links and redirects)
DEFAULT_TIMEZONE
LOG_LEVEL
```

`.env.example` is committed with empty values. CI fails if a `NEXT_PUBLIC_` variable is added that
matches a known-secret pattern.

---

## 7. Deployment sequence (Phase 1)

1. `create-next-app` into this folder with TypeScript, Tailwind, App Router, ESLint.
2. Add dependencies at the pinned versions in README; commit `package-lock.json`.
3. `supabase init`; write migrations for schema, RLS and RPCs; `supabase db reset` locally.
4. `npm run build` and `npm run test` green locally.
5. `git init`, first commit, create the GitHub repository, push `main` and `develop`.
6. Create `cts-dev` and `cts-prod` Supabase projects; capture keys into a password manager.
7. Apply migrations to `cts-dev` via `supabase db push`; verify with pgTAP.
8. Import the repository into Vercel; set env vars for all three environments.
9. Deploy `develop` → preview; deploy `main` → production.
10. Run the §8 checklist and record the result in `PROGRESS_LOG.md` with the live URL.

If a step fails, deployment status in the report is **failed** with the error, never "mostly done".

---

## 8. Post-deployment verification checklist

| # | Check | Pass criterion |
|---|---|---|
| 1 | Production URL loads | `/en` and `/ar` render the sign-in page |
| 2 | Locale switch | `/ar` renders RTL, `dir="rtl"` on `<html>` |
| 3 | Database connectivity | A read query returns reference data (roles, categories) |
| 4 | Authentication | Register → verification email received → sign-in works |
| 5 | Auth redirect | `APP_BASE_URL` in the email link points at the production domain, not localhost |
| 6 | Storage | Upload a PNG as a signed-in customer; download via the authorized route |
| 7 | Storage denial | Anonymous request to the attachment route returns 401 |
| 8 | Server action | Create a ticket; reference matches `CTS-YYYY-NNNNNN` |
| 9 | RLS | Second customer account cannot read the first customer's ticket |
| 10 | Cron | `/api/cron/sla-sweep` with the secret returns 200; without it returns 401 |
| 11 | Runtime logs | No error entries during the walkthrough |
| 12 | Routing | Deep link to a ticket while signed out redirects to sign-in and back |
| 13 | Headers | CSP, HSTS and `X-Frame-Options` present on HTML responses |
| 14 | Bundle hygiene | No service-role key in the client bundle (grep) |

---

## 9. Rollback and recovery

| Failure | Action |
|---|---|
| Bad production deploy | Vercel → Deployments → promote the previous successful deployment (instant, no rebuild) |
| Bad migration | Forward-fix migration preferred; restore from backup otherwise. Every destructive statement is forbidden in v1 precisely so a forward fix is possible |
| Data loss | Restore the Supabase daily backup to a new project, point env vars at it, redeploy |
| Leaked service-role key | Rotate in Supabase, update Vercel env, redeploy, revoke old key, review `audit_logs` for the exposure window |
| Email provider outage | Outbox retains queued rows; delivery resumes when the provider returns; no ticket is lost |
| Cron not running | `job_runs` shows no recent rows; the health endpoint flags it; `/api/health` is monitored |

Recovery steps are duplicated in `DEPLOYMENT_GUIDE.md` (Phase 1) with exact commands.

---

## 10. Cost and limits (free/hobby baseline)

| Item | Limit | Consequence |
|---|---|---|
| Vercel Hobby | non-commercial use, daily cron only | Acceptable for validation; commercial launch requires a paid plan |
| Supabase Free | 500 MB DB, 1 GB storage, 2 project limit, pauses after 1 week idle | Two projects = the free limit; storage quota needs monitoring |
| Resend Free | 100 emails/day | Enough for testing; production needs a paid tier |
| pg_cron | runs inside the DB | Free, but the project must not be paused |

These are stated up front because they directly constrain "used online for business validation".
