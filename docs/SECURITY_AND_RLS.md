# SECURITY AND RLS

Status: **design for approval** · Last updated: 2026-10-31

Security is designed in, not added later. This document is the contract for Phase 1's RLS work and
the basis of `SECURITY_REVIEW.md` (produced when the security tests actually run).

---

## 1. Threat model

| # | Threat | Impact | Control |
|---|---|---|---|
| T1 | Customer reads another customer's ticket | Data breach, reputational | RLS `USING` on `tickets` by `customer_id`; tested with two real accounts |
| T2 | Customer reads internal notes | Leak of internal discussion | RLS on `ticket_messages` by `visibility`; customer UI uses `v_ticket_conversation`; tested by direct API call, not just UI |
| T3 | Customer or anonymous user reaches `/ar/console/*` | Unauthorized staff capabilities | Proxy guard + layout check + RLS; tested |
| T4 | Agent accesses a ticket outside their team | Unauthorized access | Team-membership predicate in RLS; tested with an agent from another team |
| T5 | Agent changes status/assignment beyond role | Integrity | Transition trigger + RPC permission check + audit; tested |
| T6 | Attachment URL guessed or shared | Unauthorized file access | Private bucket, no public URLs, 60-second signed URLs issued only after authorization |
| T7 | Service-role key ships to the browser | Full compromise | `server-only` import guard; key name is not `NEXT_PUBLIC_*`; CI grep check |
| T8 | Mass submission / brute force | Abuse, cost | Postgres rate limiting on create/reply/upload; Supabase Auth rate limits on sign-in |
| T9 | Stored XSS via ticket body or article | Session theft | Plain-text storage, React escaping, no `dangerouslySetInnerHTML`; CSP; markdown not enabled in v1 |
| T10 | CSRF on state-changing requests | Unauthorized action | Server Actions + `SameSite=Lax` cookies + origin check; no GET mutations |
| T11 | Email enumeration on registration/reset | Privacy | Uniform responses; Supabase's built-in flow; generic messaging |
| T12 | Privilege escalation via profile update | Role theft | `profiles.is_staff` and roles are not writable by the user; column-level grants (see §4) |
| T13 | Duplicate escalations/emails from cron retries | Noise, wrong SLA metrics | Idempotency stamps + unique `dedupe_key` + advisory lock |
| T14 | Open redirect via `?next=` | Phishing | `next` must be a relative path beginning with `/` and matching an allow-list of route prefixes |
| T15 | Audit tampering | Loss of accountability | `audit_logs` has no UPDATE/DELETE policy for any application role |

---

## 2. Secrets and key handling

| Secret | Where | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Public by design; RLS is the protection |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never `NEXT_PUBLIC_*`; only `lib/supabase/admin.ts` |
| `CRON_SECRET` | Server only | Compared with `timingSafeEqual` in `/api/cron/*` |
| `RESEND_API_KEY` | Server only | Only in the email provider |
| `SUPABASE_DB_URL` | CI / migration only | Never in Vercel runtime env |

Rules:

- `.env*` is git-ignored except `.env.example` (placeholders only).
- Vercel environment variables are set per environment (development / preview / production);
  preview uses **development** Supabase credentials, never production.
- The service-role client module starts with `import 'server-only'`, so any accidental client import
  fails the build.
- CI runs a grep gate for `service_role`, `SUPABASE_SERVICE`, and long JWT patterns in `src/app/**`
  and `src/components/**`.
- Key rotation procedure is documented in DEPLOYMENT_GUIDE (Phase 1), including the order:
  create new key → update Vercel env → redeploy → verify → revoke old.

---

## 3. RLS strategy

### 3.1 Global rules

1. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on **every** table in `public`.
2. `FORCE ROW LEVEL SECURITY` on tables holding customer data, so table owners are also filtered.
3. No table has a policy of `USING (true)` for writes. Reads that are genuinely public
   (published KB articles, active categories) are limited with `USING (status = 'published')` etc.
4. Policies are per-operation (`select`, `insert`, `update`, `delete`), never `FOR ALL`.
5. Every policy names its role target (`to authenticated`, `to anon`), never `public`.
6. Helper functions are `stable`, `security definer`, `set search_path = public, pg_temp`, and
   return booleans only — they cannot be used to read data.

### 3.2 Helper functions

```sql
app.current_staff_role()      → role_code[]      -- roles of auth.uid()
app.is_staff()                → boolean          -- has any internal role
app.is_admin()                → boolean
app.is_management()           → boolean
app.my_team_ids()             → uuid[]           -- active memberships
app.my_leader_team_ids()      → uuid[]           -- teams where I am leader
app.can_read_ticket(uuid)     → boolean          -- own | org | team | all
app.can_write_ticket(uuid)    → boolean          -- reply/transition scope
app.org_shares_tickets(uuid)  → boolean
```

These are the only place scope logic is duplicated between SQL and TypeScript; the parity test
asserts the same truth table for a fixture set of users and tickets.

### 3.3 Policy summary per table

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | self · staff-in-scope · admin | self (via trigger) | self (limited columns) · admin | none |
| `customers` | self · staff with ticket access · admin | self | self (limited) · admin | none |
| `organizations` | own · admin | none (service) | admin | none |
| `roles` / `permissions` | authenticated | none | none | none |
| `role_permissions` | authenticated | admin | admin | admin |
| `user_roles` | self (own roles) · admin | admin | admin | admin |
| `departments` / `teams` | staff | admin | admin · leader (own team, name/desc) | admin (soft) |
| `team_members` | staff in team · admin | admin · leader (own team) | same | same |
| `ticket_categories` | authenticated where `is_active` | admin | admin | admin (soft) |
| `custom_fields` | authenticated where `is_active` | admin | admin | admin (soft) |
| `category_custom_fields` | authenticated | admin | admin | admin |
| `tickets` | `can_read_ticket(id)` | customer self, `account_status='active'` | `can_write_ticket(id)` | none |
| `ticket_messages` | customer: `visibility='public'` AND own ticket · staff: `can_read_ticket` | author = `auth.uid()` AND (customer ⇒ `visibility='public'` AND own ticket) OR staff `can_write_ticket` | author, within window (disabled in v1) | none |
| `ticket_attachments` | same visibility rule as its message/ticket | uploader = `auth.uid()` AND scope | none | none |
| `ticket_assignments` | staff `can_read_ticket` · admin | service only | none | none |
| `ticket_status_history` | ticket `can_read_ticket` | service only | none | none |
| `ticket_custom_values` | `can_read_ticket(ticket_id)` | service only | service only | none |
| `ticket_sla` | customer: **summary only** via view · staff `can_read_ticket` | service | service | none |
| `sla_policies` / targets / calendars / hours / holidays | staff | admin | admin | admin (soft) |
| `customer_feedback` | customer own · staff with `feedback.read.*` | customer own ticket, `status ∈ resolved/closed` | none | none |
| `kb_articles` | `public`: status `published`; `internal`: `kb.read.internal` + staff | `kb.manage` | `kb.manage` | `kb.manage` (soft) |
| `kb_categories` | authenticated where active/published content | `kb.manage` | `kb.manage` | `kb.manage` |
| `kb_article_feedback` | own · staff aggregate via view | own | none | none |
| `notifications` | `user_id = auth.uid()` | service only | own `read_at` | service only |
| `notification_deliveries` | `notification.manage` | service | service | none |
| `audit_logs` | `audit.read` | service only | **none** | **none** |
| `app_settings` | admin | admin | admin | none |
| `ticket_sequences`, `rate_limits` | none | none | none | none (service/RPC only) |
| `job_runs` | admin | service | service | none |

Customer access to `ticket_sla` is through `v_customer_tickets`, which exposes only
`first_response_due_at`/`resolution_due_at`/`state`, never pause internals or policy identifiers.

### 3.4 Example policies

```sql
-- customers see their own tickets; staff see what their scope allows
create policy tickets_select on public.tickets
for select to authenticated
using (app.can_read_ticket(id));

create policy tickets_insert on public.tickets
for insert to authenticated
with check (
  customer_id = auth.uid()
  and exists (select 1 from public.customers c
              where c.profile_id = auth.uid()
                and (select account_status from public.profiles where id = auth.uid()) = 'active')
);

-- customers may never see internal notes, even for their own ticket
create policy messages_select on public.ticket_messages
for select to authenticated
using (
  app.can_read_ticket(ticket_id)
  and (
    app.is_staff()
    or visibility = 'public'
  )
);

create policy messages_insert on public.ticket_messages
for insert to authenticated
with check (
  author_id = auth.uid()
  and (
    (app.is_staff() and app.can_write_ticket(ticket_id))
    or (
      not app.is_staff()
      and visibility = 'public'
      and exists (select 1 from public.tickets t
                  where t.id = ticket_id and t.customer_id = auth.uid())
    )
  )
);
```

Note the belt-and-braces: even if a customer's insert tried `visibility='internal'`, both the policy
and the `internal_note_is_staff_only` `CHECK` reject it.

---

## 4. Column-level protection

Some fields must not be writable by the user who owns the row:

- `profiles`: `is_staff`, `account_status` (self-service only `pending→active` on verification),
  `email_verified_at`.
- `tickets`: `reference`, `status`, `team_id`, `assignee_id`, `escalation_level`, `reopened_count`,
  timestamps.
- `ticket_sla`: everything.
- `notification_deliveries`: everything.

Implementation: a `BEFORE UPDATE` trigger compares `OLD`/`NEW` using the session's
`request.jwt.claims` role and raises `insufficient_privilege` on forbidden column changes, plus RPCs
are the only path for the multi-row operations. The UI simply does not render the controls.

---

## 5. File attachments

| Control | Value |
|---|---|
| Bucket | `ticket-attachments`, **private** (no public URL) |
| Path | `tickets/{ticket_id}/{uuid}.{ext}` — unpredictable, and authorization is by ticket anyway |
| Max size | `attachment_max_bytes` (10 MB default), enforced in the server action **and** the bucket policy |
| Allowed MIME + extension | pdf, png, jpg/jpeg, gif, webp, docx, xlsx, pptx, txt, csv, zip — matched on both MIME and extension |
| Blocked | executables, scripts, `.html`, `.svg`, `.js`, `.exe`, `.bat`, `.ps1`, `.msi`, macro-enabled Office files |
| Storage RLS | `select` allowed only if `app.can_read_ticket((storage.foldername(name))[1]::uuid)` and, for internal attachments, `app.is_staff()` |
| Download | `GET /api/attachments/{id}` → authorize → `createSignedUrl` 60 s → 302 to the signed URL |
| Upload flow | authorize → validate size/type server-side → store → insert row; orphan sweep removes files with no row after 24 h |
| Antivirus | Not in v1 (no vendor approved). Documented in KNOWN_ISSUES as a gap for production hardening |

The bucket policy is a second gate; the route handler is the first. Neither trusts the client's
declared MIME type alone — the file's magic bytes are checked against the claimed type.

---

## 6. Private notes — the specific guarantee

The requirement "never expose private notes through customer-facing queries, APIs, or components"
is satisfied by four independent controls:

1. RLS on `ticket_messages` filters `visibility='internal'` for non-staff.
2. `app.add_message` forces `visibility='public'` for customer actors, ignoring any supplied value.
3. The customer conversation page reads `v_ticket_conversation`, which selects only public rows —
   so even a policy bug in the view path does not surface notes.
4. A test asserts that a customer's direct `supabase.from('ticket_messages').select()` returns zero
   internal rows, and that `/api/attachments/{internal_file_id}` returns 404 (not 403) for that
   customer — 404 so existence is not disclosed.

---

## 7. Rate limiting

| Bucket | Limit | Window |
|---|---|---|
| `auth.signin:<ip>` | Supabase built-in + app-level 10 | 15 min |
| `auth.signup:<ip>` | 5 | 1 h |
| `auth.recover:<email>` | 3 | 1 h |
| `ticket.create:<user>` | 10 | 1 h |
| `ticket.reply:<user>` | 30 | 1 h |
| `attachment.upload:<user>` | 30 | 1 h |
| `kb.search:<user>` | 120 | 1 h |

Implemented by `app.consume_rate_limit(bucket, limit, window)` — a single `INSERT … ON CONFLICT DO
UPDATE` on `rate_limits`, returning false when exceeded. Exceeding returns HTTP 429 with a
localized message. No third-party dependency.

---

## 8. Audit logging

Written for: sign-in (success/failure, via auth hooks), role grants/revocations, account status
changes, ticket creation, assignment/reassignment, status and priority changes, resolution and
reopen, admin configuration changes, SLA rebaseline, and attachment deletion.

`audit_logs` records actor, role, action, entity, before/after (JSON, with sensitive fields such as
email and phone masked), request id, IP and user agent. Insert-only for every application role; no
`update`/`delete` policy exists, and the table is additionally protected by a `BEFORE UPDATE OR
DELETE` trigger that raises.

Retention: 24 months (configurable). Deletion is a privileged maintenance operation outside the app.

---

## 9. Application-level hardening

- **Headers** (via `next.config.ts` + `proxy.ts`): `Content-Security-Policy` (no `unsafe-inline`
  scripts except the Next.js nonce), `Strict-Transport-Security`, `X-Content-Type-Options`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `Permissions-Policy` denying camera/microphone/geolocation.
- **Cookies**: `HttpOnly`, `Secure`, `SameSite=Lax`, host-only; set by `@supabase/ssr`.
- **Server Actions**: input validated by Zod; authorization inside the service; returned errors are
  typed and localized, stack traces never reach the client.
- **Logging**: no ticket bodies, no email addresses in logs except as hashed identifiers; errors are
  logged with `requestId` and correlated across the action and the DB call.
- **Dependencies**: `npm audit` in CI; no dependency without a documented purpose.

---

## 10. Security test plan (executed in Phase 8, but written now)

| ID | Test | Expected |
|---|---|---|
| SEC-01 | Customer A `select` ticket of Customer B by id | 0 rows |
| SEC-02 | Customer A opens `/en/tickets/{B_ticket}` | 404, no partial content |
| SEC-03 | Customer A queries `ticket_messages` for own ticket | public rows only |
| SEC-04 | Customer A POSTs a message with `visibility=internal` | rejected (400/403) |
| SEC-05 | Customer A opens `/{locale}/console` | redirect to sign-in or 403 |
| SEC-06 | Customer calls a console server action directly | 403 |
| SEC-07 | Agent from team X opens a ticket of team Y | 404 |
| SEC-08 | Agent assigns to an agent outside the team | rejected |
| SEC-09 | Agent performs an illegal transition via API | rejected by trigger |
| SEC-10 | Anonymous fetches `/api/attachments/{id}` | 401 |
| SEC-11 | Customer fetches an internal attachment | 404 |
| SEC-12 | Signed URL expires after 60 s | subsequent use fails |
| SEC-13 | `management_viewer` attempts any mutation | 403 on all endpoints |
| SEC-14 | Profile update attempts `is_staff=true` | rejected, value unchanged |
| SEC-15 | Cron endpoint without `CRON_SECRET` | 401 |
| SEC-16 | Cron endpoint run twice | no duplicate notifications (dedupe) |
| SEC-17 | Production bundle grep for service-role key | absent |
| SEC-18 | Uploaded `.exe` renamed to `.pdf` | rejected by magic-byte check |

Each row becomes a Playwright/pgTAP test with a recorded result in `TEST_RESULTS.md`. Nothing in
this table is claimed as passed until it has been executed.
