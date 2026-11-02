# DEPLOYMENT GUIDE

Last updated: 2026-10-31 · Status: **not yet executed against a hosted environment**

Commands are exact and in order. A step whose outcome was not observed is not marked done.

---

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 24.x | `node --version` |
| npm | 11.x | `npm --version` |
| Git | any | `git --version` |
| Supabase CLI | 2.122.x (dev dependency) | `npx supabase --version` |
| Docker Desktop | any | only for `supabase start` |

Accounts: GitHub, Supabase (two projects), Vercel, and an email provider domain for Resend.

---

## 1. Repository

```bash
git init
git add .
git commit -m "feat(foundation): Next.js app, schema, RLS, auth and bilingual shell"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
git checkout -b develop
git push -u origin develop
```

Repository settings:

- Default branch `main`; protect it: require a pull request, one approval, passing CI, no force push.
- Enable secret scanning and Dependabot alerts.
- The CI workflow (`.github/workflows/ci.yml`) runs on every PR: lint, typecheck, unit tests, build,
  the schema/RLS suite (`supabase db reset` + `scripts/db-smoke.mjs`), and a secret grep.

---

## 2. Supabase

### 2.1 Create the projects

Two projects, same region (`eu-central-1` per decision D-05):

| Project | Purpose |
|---|---|
| `cts-dev` | local-equivalent; used by preview deployments |
| `cts-prod` | production data only |

Never point a preview deployment at `cts-prod`.

### 2.2 Configure Auth

In each project → Authentication → URL Configuration:

- Site URL: `https://<production-domain>` (for `cts-prod`), `https://<dev-origin>` (for `cts-dev`).
- Redirect URLs: `https://<origin>/auth/callback` — one exact entry per origin.

Authentication → Providers → Email: enabled, **confirm email on**.
Authentication → Policies: minimum password length 10.

### 2.3 Apply migrations

```bash
# from a machine with the repository checked out
npx supabase link --project-ref <project-ref>
npx supabase db push --linked
```

Verify:

```sql
select count(*) from roles;                  -- 5
select count(*) from permissions;            -- 50
select count(*) from ticket_categories;      -- 11
select count(*) from sla_policy_targets;     -- 4
select relname from pg_class where relnamespace = 'public'::regnamespace
  and relkind = 'r' and not relrowsecurity;  -- must be empty
```

If any count differs, the seed did not run — `supabase db push` does not apply `seed.sql` to a
hosted project. Apply it explicitly:

```bash
npx supabase db push --linked --include-seed
```

### 2.4 Create the first administrator

Staff accounts are not self-service. After a person registers normally, promote them once with SQL
in the Supabase SQL editor (this is the only operation that is intentionally manual):

```sql
-- replace the email
with target as (select id from auth.users where email = 'admin@example.com')
insert into user_roles (user_id, role_id)
select target.id, r.id from target, roles r where r.code = 'admin'
on conflict do nothing;

-- is_staff is recalculated by trigger; confirm it
select id, email, is_staff from profiles where email = 'admin@example.com';
```

Every subsequent role grant is done through the admin UI (Phase 2), which writes an audit row.

---

## 3. Vercel

1. Import the GitHub repository. Framework preset: Next.js. Node 24.
2. Environment variables (Production and Preview set **separately**):
   see [ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md).
3. Deploy `develop` → preview. Deploy `main` → production.
4. Add the assigned domains to the Supabase redirect allow-list, then redeploy so
   `APP_BASE_URL` matches.

Build settings: `npm run build`, output `.next` (default). No custom `vercel.json` is needed — the
security headers are in `next.config.ts`.

---

## 4. Verification checklist

Run against the deployed URL and record the result. Any unchecked box means the deployment is not
verified.

| # | Check | How | Expected |
|---|---|---|---|
| 1 | English landing | open `/en` | renders, `<html dir="ltr">` |
| 2 | Arabic landing | open `/ar` | renders Arabic, `<html dir="rtl">` |
| 3 | Health | `GET /api/health` | `{"status":"ok","database":"reachable"}` |
| 4 | Database content | SQL: `select count(*) from ticket_categories` | 11 |
| 5 | Registration | submit the sign-up form | "check your inbox" page |
| 6 | Confirmation email | open the email, click the link | lands on `/en/auth/callback` → `/en/portal` |
| 7 | Profile | `/en/profile`, change the name | saved, visible on `/en/portal` |
| 8 | Password reset | request a reset, follow the link | new password accepted at sign-in |
| 9 | Portal isolation | second account opens the first account's URL | 404/redirect, no content |
| 10 | Console gate | customer opens `/en/console` | redirected to `/en/portal` |
| 11 | Anonymous gate | signed out, open `/en/portal` | redirected to `/en/sign-in?next=/portal` |
| 12 | Headers | `curl -I` the landing page | CSP, HSTS, `X-Frame-Options: DENY` present |
| 13 | Bundle hygiene | search the built assets for `service_role` | absent |
| 14 | Logs | Vercel → Logs during the walkthrough | no error entries |

---

## 5. Rollback

| Situation | Action | Time |
|---|---|---|
| Bad deployment | Vercel → Deployments → previous → **Promote** | seconds |
| Bad migration | Write a forward-fix migration; restore from the daily backup only if data is wrong | minutes–hours |
| Key exposure | [ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md) §6 | ~15 min |
| Supabase project paused (free tier) | Restore from the dashboard; takes a few minutes | minutes |

Migrations are forward-only by policy: no `DROP COLUMN` on a populated table in v1, so a rollback is
always a new migration rather than a reverse script.

---

## 6. Recovery drill (perform once after go-live)

1. Note the current production deployment URL and commit SHA.
2. Promote the previous deployment; confirm the app loads.
3. Promote the current one back; confirm `/api/health` is `ok`.
4. Restore the latest Supabase backup into a scratch project; confirm row counts match.
5. Delete the scratch project.
6. Record the timings in `PROGRESS_LOG.md`.
