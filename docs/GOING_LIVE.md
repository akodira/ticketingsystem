# GOING LIVE — step-by-step for GitHub, Supabase and Vercel

Written for a person doing this by hand. Every step states what to click or type and what you
should see afterwards. Nothing here has been executed yet on your accounts.

Total time: about 45 minutes, plus waiting for DNS and the first deployment.

**Read this first:** the application is built and tested locally, but it has never run against a
real Supabase project. The last section (§8) is the checklist that turns "deployed" into "verified".
Do not skip it — several steps below can appear to succeed while being wrong (a redirect URL with a
typo, for example, only fails when someone clicks the link in their email).

---

## 0. What you need

| Item | Detail |
|---|---|
| A computer with Node.js 22+ | `node --version` should print a version |
| Docker Desktop | only if you want the local Supabase stack; not needed for deployment |
| GitHub account | free |
| Supabase account | free tier is enough to start |
| Vercel account | free (Hobby) is enough to start |
| Email sender | Resend account with a domain you control |
| Optional: Git for Windows | `https://git-scm.com/download/win` — install with "Git from the command line" |

Free-tier limits you should know before the business starts using this:

- Vercel Hobby is for **non-commercial** use. A commercial launch needs the Pro plan.
- Supabase Free pauses a project after about a week with no activity, and gives 500 MB database
  and 1 GB storage across two projects.
- Resend Free sends 100 emails per day and only to your own address until a domain is verified.
- Supabase's built-in email sender is heavily rate-limited; for real users configure custom SMTP
  (Supabase → Project Settings → Auth → SMTP) or verification emails will be delayed or refused.

---

## 1. Create the GitHub repository

**1.1** Sign in to GitHub → **+** (top right) → **New repository**.

- Owner: your account or organization.
- Repository name: `cts` (or anything).
- Visibility: **Private**.
- Do **not** tick "Add a README", ".gitignore" or a licence — the repository already has them.

**1.2** On the empty repository page, copy the HTTPS URL, e.g.
`https://github.com/your-org/cts.git`.

**1.3** In the project folder (`E:\CTS`), run:

```bash
git init
git add .
git status
```

Check the `git status` output: it must **not** list `node_modules/`, `.next/`, `.env.local` or
`.env`. If it does, stop — `.gitignore` is not being picked up.

```bash
git commit -m "feat(foundation): Next.js app, database schema, RLS, auth and bilingual shell"
git branch -M main
git remote add origin https://github.com/your-org/cts.git
git push -u origin main
```

GitHub asks for a username and password: the password must be a **personal access token**
(GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate,
scope `repo`), not your account password.

**1.4** Create the development branch the workflow expects:

```bash
git checkout -b develop
git push -u origin develop
```

**1.5** Repository settings:

- **Settings → Branches → Add branch protection rule** for `main`:
  require a pull request before merging, require 1 approval, require status checks to pass
  (`quality`, `database`, `secret-scan`), disallow force pushes.
- **Settings → Code security**: enable Dependabot alerts and secret scanning.

**Expected result:** the repository shows `main` and `develop`, and the **Actions** tab runs the CI
workflow once. The `database` job downloads Supabase and applies every migration — that is the
first time the migrations run on a Linux machine and it is a genuine test.

---

## 2. Create the Supabase projects

You need **two**: one for preview/testing, one for production. They never share data.

**2.1** Go to `https://supabase.com/dashboard` → **New project**.

| Field | Value |
|---|---|
| Name | `cts-prod` |
| Database password | strong, stored in your password manager — you need it for migrations |
| Region | **Europe (Frankfurt) `eu-central-1`** — decision D-05 |
| Plan | Free |

Create it, then repeat with the name `cts-dev`, **same region**.

**2.2** For **each** project, copy three values from **Project Settings → API**:

| Value | Where it goes |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` — server only, never in the browser |

Treat the `service_role` key like a database password. It bypasses every access rule.

**2.3** Authentication settings, in **each** project (**Authentication → Sign In / Providers →
Email**):

- Enable Email provider. **Enable "Confirm email".**
- Set minimum password length to **10**.
- Leave "Allow new users to sign up" **on** — customers self-register. Staff accounts are created
  with an invitation from inside the app, and the database refuses to make a staff account by
  self-registration.

**2.4** URL configuration (**Authentication → URL Configuration**):

For `cts-prod`:

- Site URL: `https://your-domain.com`
- Redirect URLs, add exactly:
  - `https://your-domain.com/auth/callback`

For `cts-dev` (used by preview builds):

- Site URL: `https://cts-dev.vercel.app` (or your preview domain)
- Redirect URLs: `https://cts-dev.vercel.app/auth/callback`

Do not use wildcards. A wrong or missing entry here is the #1 cause of "the confirmation link does
nothing".

---

## 3. Apply the database schema

Two ways. Use **3A** if you are comfortable with a terminal (recommended); use **3B** if you only
want the dashboard.

### 3A. With the Supabase CLI (recommended)

From the project folder:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --include-seed
```

`<project-ref>` is the short id in the project URL (`https://supabase.com/dashboard/project/<ref>`).
You will be asked for the database password you set in step 2.1.

`--include-seed` is essential: without it the schema is created but the reference data (roles,
permissions, categories, SLA policy, settings) is missing, and creating a ticket will fail with
"no SLA policy configured".

Repeat for `cts-dev` with its own ref.

### 3B. With the SQL editor (no CLI)

In the dashboard open **SQL Editor** and run, in this exact order, the full contents of:

1. `supabase/migrations/0001_extensions_and_enums.sql`
2. `supabase/migrations/0002_identity.sql`
3. `supabase/migrations/0003_teams_and_catalogue.sql`
4. `supabase/migrations/0004_sla_config.sql`
5. `supabase/migrations/0005_tickets.sql`
6. `supabase/migrations/0006_kb_and_notifications.sql`
7. `supabase/migrations/0007_rls.sql`
8. `supabase/migrations/0008_rpcs.sql`
9. `supabase/migrations/0009_user_administration.sql`
10. `supabase/seed.sql`

Each file must finish with "Success. No rows returned" before you start the next one. If one fails,
stop and fix it — do not continue, later files depend on earlier ones.

### 3C. Verify the schema

In **SQL Editor**, run:

```sql
select
  (select count(*) from roles)                as roles,               -- expect 5
  (select count(*) from permissions)          as permissions,         -- expect 50
  (select count(*) from ticket_categories)    as categories,          -- expect 11
  (select count(*) from sla_policy_targets)   as sla_targets,         -- expect 4
  (select count(*) from business_hours)       as working_days,        -- expect 5
  (select count(*) from app_settings)         as settings;            -- expect 14
```

```sql
-- must return zero rows: every table must have Row Level Security enabled
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

If either check is wrong, the schema is not applied correctly — fix it before moving on.

---

## 4. Create the first administrator

Staff accounts are deliberately not self-service. Do this once per project, after you have
registered the person normally through the app **or** after they accept an invite.

The simplest route on a brand-new project: register your own account through the app first (step 8
walks through the UI), then promote it.

In **SQL Editor**:

```sql
-- replace with the real address
with target as (
  select id from auth.users where email = 'you@your-domain.com'
)
insert into public.user_roles (user_id, role_id)
select target.id, r.id
from target, public.roles r
where r.code = 'admin'
on conflict do nothing;

-- confirm: is_staff must now be true
select p.email, p.account_status, p.is_staff,
       array(select ro.code from user_roles ur join roles ro on ro.id = ur.role_id
             where ur.user_id = p.id) as roles
from profiles p
where p.email = 'you@your-domain.com';
```

Things that must be true afterwards: `is_staff = true`, `account_status = 'active'` (the email was
confirmed), and `roles` contains `admin`.

If `account_status` is `pending`, confirm the email address first — the app will not let a pending
account sign in to the console.

---

## 5. Deploy to Vercel

**5.1** `https://vercel.com/new` → **Import Git Repository** → choose the repository.
If Vercel cannot see it, grant access to the repository in the GitHub app settings it offers.

**5.2** Configure:

| Setting | Value |
|---|---|
| Framework Preset | Next.js (auto-detected) |
| Root Directory | `./` |
| Build Command | `npm run build` (default) |
| Node.js Version | 24.x (Project Settings → General) |

**5.3** Environment Variables. Add these to **Production** and **Preview** separately — Vercel keeps
them per environment.

| Name | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `cts-prod` URL | `cts-dev` URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `cts-prod` anon key | `cts-dev` anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `cts-prod` service key | `cts-dev` service key |
| `CRON_SECRET` | random 32+ chars | random 32+ chars |
| `RESEND_API_KEY` | live key | test key |
| `EMAIL_FROM_ADDRESS` | verified sender | verified sender |
| `EMAIL_FROM_NAME` | `Customer Support` | `Customer Support` |
| `APP_BASE_URL` | `https://your-domain.com` | the preview URL |
| `LOG_LEVEL` | `info` | `info` |

Notes:

- `CRON_SECRET`: generate with `openssl rand -hex 32`, or any long random string. Powershell:
  `-join ((48..57)+(97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })`.
- `APP_BASE_URL` decides where confirmation and reset links point. Getting it wrong is the most
  common deployment mistake.
- `SUPABASE_SERVICE_ROLE_KEY` is required by the staff-invitation feature; without it, inviting
  staff returns a configuration error and everything else still works.

**5.4** Deploy. The first build takes a few minutes.

**5.5** After the deployment, go back to Supabase → **Authentication → URL Configuration** and make
sure the real domain is listed (both the Site URL and `/auth/callback`). Changing it earlier with a
guessed domain is normal; correct it now.

**5.6** Add a custom domain if you have one (Vercel → Settings → Domains). Then update
`APP_BASE_URL` and the Supabase redirect URLs to match, and **redeploy** — `APP_BASE_URL` is read at
runtime, but the Supabase side needs no rebuild.

---

## 6. Configure email (Resend)

**6.1** `https://resend.com` → sign up → **Domains → Add Domain** → enter the domain you want to
send from, e.g. `mail.your-domain.com`.

**6.2** Add the DNS records Resend shows you (SPF, DKIM; a DMARC record is strongly recommended) at
your DNS provider. Wait until Resend shows **Verified** — usually minutes, sometimes hours.

**6.3** **API Keys → Create**. Copy the key into Vercel as `RESEND_API_KEY`, and redeploy.

**6.4** In Supabase → **Project Settings → Auth → SMTP Settings**, configure custom SMTP so that
*Supabase's own* emails (confirmation, recovery, invite) are delivered reliably. Use Resend's SMTP
credentials (`smtp.resend.com`, port `465`, user `resend`, password = your API key) and a verified
sender address. Without this, Supabase's built-in sender is rate-limited and your confirmation
emails will be delayed or dropped.

---

## 7. First run, by hand

Open the production URL.

| Step | Where | Expected |
|---|---|---|
| 1 | `/en` | English landing page, LTR |
| 2 | language button | page switches to Arabic, `dir="rtl"` |
| 3 | `/en/sign-up` | create your own customer account |
| 4 | email inbox | "Confirm your Customer Ticketing System account" |
| 5 | click the link | lands on `/auth/callback` then `/en/portal` |
| 6 | `/en/portal` | "Welcome, …", status Active, email verified |
| 7 | `/en/profile` | change the name, save, confirm it persists |
| 8 | sign out, `/en/sign-in`, "Forgot your password?" | reset email arrives; the new password works |
| 9 | §4 | promote that account to admin |
| 10 | sign in again | you land on `/en/console` |
| 11 | `/en/users` | the user directory with your account listed |
| 12 | `/en/users` → "Invite staff" | invite a colleague as `agent` |

Steps 9–12 are Phase 2 functionality; if you deploy before Phase 2 is pushed, those pages do not
exist yet and steps 9–12 are for later.

---

## 8. Verification checklist — the deployment is only "done" when this passes

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Health | `GET https://your-domain/api/health` | `{"status":"ok","database":"reachable"}` |
| 2 | Headers | `curl -I https://your-domain/en` | `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY` |
| 3 | RTL | open `/ar` | `dir="rtl"`, Arabic text, no horizontal scroll |
| 4 | Confirmation link host | click it in a real email | points at your domain, not `localhost` |
| 5 | Second account | register a second customer | cannot see the first customer's pages |
| 6 | Console gate | open `/en/console` while signed in as a **customer** | redirected to `/en/portal` |
| 7 | Anonymous gate | open `/en/portal` signed out | redirected to `/en/sign-in?next=%2Fportal` |
| 8 | No secrets in the bundle | DevTools → Sources → search `service_role` | no match |
| 9 | Database reachable from the app | `/en/portal` shows your name (it reads `profiles`) | name shown |
| 10 | Logs | Vercel → Logs during the walkthrough | no errors |

Record the result of each row. Anything you could not check is **not verified** — write it down
rather than assuming.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `Invalid public environment configuration` | `NEXT_PUBLIC_*` missing in that environment | Add both, redeploy |
| Sign-in succeeds then bounces back to `/sign-in` | Session cookie not set — usually a cookie domain/protocol problem | confirm you are on HTTPS and the Supabase URL is the project URL, not the dashboard URL |
| "The confirmation link does nothing" / redirects to `localhost` | `APP_BASE_URL` wrong, or redirect URL missing in Supabase | fix both, redeploy |
| `new row violates row-level security policy` on sign-up | Rare: the signup trigger did not run because the migrations were applied partially | re-check §3C |
| Sign-in says "Email not confirmed" | Confirmation not clicked, or Supabase SMTP not configured so the mail never arrived | configure SMTP (§6.4), resend from `/en/sign-up/check-email` |
| Ticket creation fails with "no SLA policy configured" | Seed not applied | run `supabase/seed.sql` |
| Invite staff returns a configuration error | `SUPABASE_SERVICE_ROLE_KEY` not set in Vercel | add it, redeploy |
| `/api/health` returns 503 `degraded` | Project paused (free tier) or wrong keys | resume the project; re-copy the keys |
| CI `database` job fails | migrations are broken on a clean database | run `npx supabase db reset` locally first |

---

## 10. Updating the deployment after code changes

```bash
git checkout develop
# ... make changes ...
git add .
git commit -m "feat(scope): what changed"
git push
```

Vercel builds a preview for the branch. Open the preview, check it, then merge into `main` — the
merge deploys production.

If the change includes a new migration, apply it to production **after** the merge:

```bash
npx supabase link --project-ref <prod-ref>
npx supabase db push --linked
```

Migrations are forward-only. Never edit a migration that has already been applied to production;
add a new one.

---

## 11. Backups and recovery

- Supabase Free keeps daily backups for 7 days. **Project Settings → Database → Backups**.
- Before any risky change, take a manual backup (paid plans) or export the schema:
  `npx supabase db dump --linked -f backup-schema.sql`.
- Rollback a bad deploy: Vercel → Deployments → the previous successful one → **Promote**.
  This is instant and needs no rebuild.
- Rollback a bad migration: write a new forward-fixing migration. Do not restore the whole database
  unless data is actually wrong — a restore discards everything written since the backup.
