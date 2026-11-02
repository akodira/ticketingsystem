# SECURITY REVIEW

Last updated: 2026-10-31 · Scope: Phase 1 (foundation)

This is a review of what is **implemented and verified**, not a plan. Gaps are listed as gaps.
The full security test matrix (SEC-01…SEC-18) belongs to Phase 8; the database-level subset that
could be executed now has been executed (see `TEST_RESULTS.md` §3).

---

## 1. Controls implemented

| Control | Where | Verified |
|---|---|---|
| Supabase Auth, email + password, confirmation required | `auth.actions.ts`, seed triggers | signup trigger creates pending accounts; confirmation flips to active (DB-11, DB-12) |
| Server-side input validation with Zod on every action | `lib/validation.ts` | unit tests; malformed input returns translation keys |
| Session validation with `getUser()` (not `getSession()`) | `lib/auth/session.ts` | every protected page and action |
| Route guards (coarse) + layout guards (role) + service checks + RLS | `proxy.ts`, layouts, services, `0007_rls.sql` | anonymous redirects verified end to end |
| RLS enabled on **every** public table | `0007_rls.sql` | DB-03, DB-04 |
| Customer data isolation | `tickets_select`, `can_read_ticket` | DB-05…DB-09 |
| Private notes hidden from customers | policy + CHECK + forced visibility in RPC | DB-07, DB-19 |
| Column-write protection (`is_staff`, `account_status`, `email`) | `trg_profiles_guard` | DB-13, DB-14 |
| Staff-only tables (audit, SLA config, job runs) | policies | DB-10 |
| `management_viewer` cannot write | role seed + scope rules | DB-27, unit tests |
| Staff cannot create tickets (D-09) | seed + RPC guard | DB-28 |
| Service-role key cannot reach the browser | `server-only` import, key name convention | CI secret gate |
| Security headers (CSP, HSTS, nosniff, frame deny, referrer, permissions) | `next.config.ts` | observed on responses |
| Open-redirect protection on `?next=` | sign-in action and callback | rejects `//host` and absolute URLs |
| Uniform responses for password reset | `requestPasswordResetAction` | no account enumeration |
| Audit log append-only | `trg_audit_logs_immutable` | DB-24 |
| Structured logging without PII or bodies | `lib/logger.ts` | review |
| Honest health endpoint (no false "ok") | `/api/health` | APP-12 |

## 2. Privileged paths

`createSupabaseAdminClient()` is the only RLS-bypassing client. In Phase 1 nothing calls it yet.
When Phases 5–7 introduce cron sweeps and the email dispatcher, every use must be a named function
in `src/modules/*/services/*.system.ts` that performs its own authorization or is restricted to a
service-owned table. The ESLint rule already blocks imports of this module from `src/app` and
`src/components`.

## 3. Gaps (open)

| ID | Gap | Risk | Mitigation / plan |
|---|---|---|---|
| SG-01 | CSP allows `'unsafe-inline'` for scripts | XSS payloads could execute if any injection existed | Nonce-based CSP in Phase 8, verified on the deployed build (K-02) |
| SG-02 | No rate limiting wired into the app yet | Credential stuffing at application level | `app.consume_rate_limit` exists and is tested at SQL level; wire it in Phase 2 alongside the auth screens' hardening. Supabase Auth has its own limits |
| SG-03 | No antivirus scanning for attachments | Malware stored and re-served | Vendor decision required before production (K-03) |
| SG-04 | No MFA for staff accounts | Account takeover via password | Out of scope for v1; recommend enabling Supabase MFA before production |
| SG-05 | Attachment authorization is designed but not implemented | None yet (no upload code) | Phase 3 must implement the signed-URL route exactly as specified in SECURITY_AND_RLS §5, including the magic-byte check |
| SG-06 | No automated dependency scanning in CI yet | Vulnerable transitive dependency | Add Dependabot alerts and `npm audit` gate in Phase 2 |
| SG-07 | `audit_logs` has no retention job | Table grows without bound | Retention policy documented (24 months); implement in Phase 8 |

## 4. Things deliberately not done

- No custom cryptography, no JWT parsing in application code, no password storage in this codebase —
  Supabase Auth owns all of it.
- No `dangerouslySetInnerHTML` anywhere in the codebase.
- No `service_role` string in `src/app` or `src/components`.
- No CORS configuration: the app is same-origin; `supabase-js` talks to Supabase over HTTPS with the
  anon key and RLS.
- No client-side authorization logic that is load-bearing: the UI hides controls, the server and
  database decide.

## 5. Review of the migration surface

| Check | Result |
|---|---|
| Every table has RLS enabled | yes (enforced by DB-03) |
| No `USING (true)` on a write policy | yes — read-only reference tables only |
| Policies target roles explicitly (`to authenticated` / `to anon`) | yes |
| `security definer` functions set `search_path` | yes, all of them |
| `security definer` functions re-check the actor | yes, via `auth.uid()` + permission helpers |
| No dynamic SQL built from user input | yes — no `EXECUTE format(...)` over user input |
| Storage bucket created | **not yet** — Phase 3, when attachments exist |
| Migrations contain destructive statements | none |

## 6. Sign-off

Phase 1 controls are implemented and the executed subset passes. This document does **not** assert
that the system is secure for production: SG-01…SG-07 remain open, and the deployment-dependent tests
(real Supabase Auth, storage, headers on Vercel) have not run. The Phase 8 security review will
re-issue this document after SEC-01…SEC-18 execute against a deployed environment.