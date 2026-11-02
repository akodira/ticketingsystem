# ENVIRONMENT CONFIGURATION

Last updated: 2026-10-31 · Applies to: local, Vercel preview, Vercel production

---

## 1. Variables

| Variable | Scope | Secret | Local | Preview | Production |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | no | `http://127.0.0.1:54321` | `cts-dev` URL | `cts-prod` URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | no | local CLI key | `cts-dev` anon key | `cts-prod` anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | **yes** | local CLI key | `cts-dev` service key | `cts-prod` service key |
| `CRON_SECRET` | Server only | **yes** | any 32+ random chars | set | set |
| `RESEND_API_KEY` | Server only | **yes** | unset (console provider) | sandbox key | live key |
| `EMAIL_FROM_ADDRESS` | Server only | no | `no-reply@example.com` | sandbox sender | verified sender |
| `EMAIL_FROM_NAME` | Server only | no | `Customer Support` | same | same |
| `APP_BASE_URL` | Server only | no | `http://localhost:3000` | preview URL | production URL |
| `LOG_LEVEL` | Server only | no | `debug` | `info` | `info` |

`SUPABASE_DB_URL` is **not** a Vercel variable. It exists only in GitHub Secrets for the migration
job (`supabase db push --db-url`).

---

## 2. Why each value is where it is

- Anything prefixed `NEXT_PUBLIC_` is inlined into the browser bundle. The anon key is designed for
  that: it grants nothing beyond what RLS allows. The service-role key bypasses RLS and therefore
  must never carry that prefix — `src/lib/supabase/admin.ts` imports `server-only` so a client
  import fails the build instead of leaking.
- `APP_BASE_URL` is used to build the confirmation and reset links sent by Supabase Auth. If it is
  wrong, the emails point at the wrong host — the most common cause of "the confirmation link does
  not work". It is set per environment and verified in the deployment checklist.
- `CRON_SECRET` is compared with `timingSafeEqual` by every `/api/cron/*` handler. Without it the
  scheduled jobs cannot run; with a weak value they can be triggered by anyone.

---

## 3. Local setup

```bash
npx supabase start        # prints the API URL, anon key and service-role key
```

Copy the printed values into `.env.local` (never committed). If Docker is not available, run
`npm run db:smoke` to exercise the schema on an embedded PostgreSQL, and connect the app later to a
hosted Supabase project.

### Supabase Auth redirect allow-list (local)

`supabase/config.toml` already lists:

```
http://localhost:3000/en/auth/callback
http://localhost:3000/ar/auth/callback
http://localhost:3000/en/auth/reset-password
http://localhost:3000/ar/auth/reset-password
```

---

## 4. Hosted Supabase setup

For each project (`cts-dev`, `cts-prod`):

1. Project Settings → API → copy `Project URL`, `anon public`, `service_role`.
2. Authentication → URL Configuration:
   - **Site URL**: the deployment origin (`https://cts.example.com`).
   - **Redirect URLs**: `https://<origin>/auth/callback` (add `/**` only for the preview project,
     scoped to the Vercel preview domain, never `*`).
3. Authentication → Providers → Email: enable, require confirmation.
4. Authentication → Policies: minimum password length 10.
5. Storage → create a **private** bucket named `ticket-attachments`, 10 MB limit
   (the bucket creation SQL is part of Phase 3's storage migration; it is not created in Phase 1
   because no attachment code exists yet).
6. Database → Extensions: enable `pg_cron` and `pg_net` (Phase 5 uses them; enabling early is free).
7. Apply migrations: `supabase db push` with `SUPABASE_DB_URL` set.

---

## 5. Vercel setup

Set every variable for **Production** and **Preview** separately; Preview must point at `cts-dev`.
Then:

- Add the deployment domain to the Supabase redirect allow-list before the first sign-in test.
- Trigger a redeploy after any environment change: variables are inlined at build time for
  `NEXT_PUBLIC_*`, so a running deployment will not pick them up.

---

## 6. Rotation procedure

When a key is exposed or on a schedule:

1. Create the new key in Supabase (API → Generate new key).
2. Update the Vercel variable for the affected environment(s).
3. Redeploy and verify `/api/health` returns `ok`.
4. Sign in with a test customer and open a ticket page (proves both the anon and service paths).
5. Revoke the old key in Supabase.
6. Review `audit_logs` for the exposure window and record the incident in `KNOWN_ISSUES.md`.

Never rotate both keys in the same step, and never rotate production during an active incident
without a second person confirming the health check.

---

## 7. Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid public environment configuration` at startup | `NEXT_PUBLIC_*` missing or malformed | Set both variables; redeploy |
| Sign-in loops back to `/sign-in` | `APP_BASE_URL` or redirect allow-list mismatch | Align both with the actual origin |
| Confirmation email link 404s | Link points at `localhost` from a deployed build | Set `APP_BASE_URL` in that environment |
| `new row violates row-level security policy` on ticket creation | Account not `active` (email unverified) | Confirm the email, or check `profiles.account_status` |
| `no SLA policy configured` | Seed not applied, or every policy deactivated | Run the seed; check `sla_policies.is_active` |
| Health endpoint 503 `unconfigured` | Variables absent in this deployment | Expected on a fresh clone; set them |
| Health endpoint 503 `degraded` | Database unreachable or project paused | Check the Supabase project status |
