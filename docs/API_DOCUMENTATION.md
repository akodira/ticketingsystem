# API DOCUMENTATION

Last updated: 2026-10-31 · Phase 1 inventory

Everything the application exposes. There is no public third-party API in v1: all endpoints are used
by this application's own UI. The inventory exists so the future ASP.NET Core implementation can
reproduce each contract exactly.

Three kinds of entry point:

1. **Server Actions** — invoked by forms in the app. They run on the server, are validated with Zod
   and call services. They are not reachable as a REST API.
2. **Route handlers** — real HTTP endpoints (`src/app/**/route.ts`).
3. **Database RPCs** — `security definer` functions that are the only supported write path for
   multi-row operations. Services call these with the user's JWT.

---

## 1. Server Actions

All actions return a discriminated state `{ ok, message?, fieldErrors? }` where `message` and
`fieldErrors` values are **translation keys**, never raw messages. Errors never include database text.

### `signInAction(prev, formData)`

| Field | Type | Required | Rule |
|---|---|---|---|
| `email` | string | yes | valid email, ≤320 |
| `password` | string | yes | non-empty (length rules apply at sign-up only) |
| `next` | string | no | must start with `/` and not `//`; otherwise ignored |
| `locale` | `en` \| `ar` | no | defaults to `en` |

Side effects: creates a session cookie; redirects to `next`, else `/console` for staff or `/portal`.
Refuses suspended/deactivated accounts and signs the session out.

### `signUpAction(prev, formData)`

| Field | Rule |
|---|---|
| `fullName` | 1–120 chars, trimmed |
| `email` | valid, unique |
| `password` | 10–128 chars |
| `confirmPassword` | must equal `password` |

Side effects: creates an `auth.users` row → triggers create `profiles`, `customers` and the
`customer` role; sends a confirmation email; redirects to `/sign-up/check-email`. Staff accounts
cannot be created here.

### `requestPasswordResetAction(prev, formData)`

`email` → sends a reset link. Always returns the same success response, whether or not the account
exists.

### `updatePasswordAction(prev, formData)`

`password`, `confirmPassword` → updates the signed-in user's password, redirects to `/portal`.
Requires a session (arrived via the recovery link).

### `resendVerificationAction(prev, formData)`

`email` → resends the confirmation email. Same response regardless of account state.

### `signOutAction(formData)`

`locale` → clears the session, redirects to `/{locale}/sign-in`.

### `updateProfileAction(prev, formData)`

| Field | Rule |
|---|---|
| `fullName` | 1–120 |
| `phone` | optional, `^\+?[0-9 ()-]{7,20}$` |
| `locale` | `en` \| `ar` |

Writes only those three columns. `is_staff`, `account_status` and `email` are rejected by a database
trigger as well, so a crafted request cannot promote an account.

---

## 2. Route handlers

### `GET /auth/callback`

Supabase redirect target after email confirmation and password recovery.

| Query | Rules |
|---|---|
| `code` | PKCE code, exchanged for a session |
| `token_hash` + `type` | alternative verification path |
| `next` | must be a local path (`/…`, not `//…`); default `/portal` |
| `locale` | `en` \| `ar`; default `en` |

Responses: 302 to `/{locale}{next}` on success; 302 to `/{locale}/sign-in?reason=expired` on
failure; 302 to `/sign-in?reason=config` when the deployment has no Supabase configuration.
The endpoint cannot be used as an open redirect.

### `GET /api/health`

| Condition | Status | Body |
|---|---|---|
| Not configured | 503 | `{"status":"unconfigured","database":"unavailable"}` |
| Configured, database answers | 200 | `{"status":"ok","database":"reachable"}` |
| Configured, database fails | 503 | `{"status":"degraded","database":"unreachable"}` |

Never returns configuration values.

---

## 3. Database RPCs

Callable by `authenticated`. Each derives the actor from `auth.uid()`, re-checks authorization
itself, and raises on any violation so the operation rolls back.

### `app.create_ticket(...)`

```
p_category_id    uuid      required, active root category
p_subcategory_id uuid      optional, must be a child of p_category_id
p_subject        text      3–200 chars
p_description    text      10–20000 chars
p_priority       enum      critical|high|normal|low (honoured only if allow_customer_priority)
p_custom_values  jsonb     reserved (Phase 3 validation)
p_source_ip      inet      optional
returns (ticket_id uuid, ticket_reference citext)
```

Rules: caller must hold `ticket.create.self`, be `active`, and not be staff. Allocates the reference,
routes to the category/default team, resolves and freezes the SLA policy, computes both due dates
with the business calendar, writes the initial message and status history, and writes an audit row.
Raises `no SLA policy configured` rather than creating an untracked ticket.

### `app.add_message(p_ticket_id, p_body, p_visibility default 'public')`

Returns `(message_id, new_status)`. Customers are forced to `public` regardless of what they send;
staff need `ticket.note.internal` for `internal`. Staff public replies set `first_response_at` and
satisfy the first-response metric; a customer reply to `pending_customer` resumes the SLA clock.
Closed tickets reject new messages.

### `app.transition_ticket(p_ticket_id, p_to, p_reason default null, p_resolution_summary default null)`

Returns the new status. Re-validates the matrix, applies actor rules (customers may only confirm,
reject or reopen; staff need `ticket.status.transition.team`; closing without the customer needs
`ticket.close.any`), requires a resolution summary ≥10 chars for `resolved` and a reason ≥10 chars
for `reopened`, then updates timestamps, history and SLA state.

### `app.assign_ticket(p_ticket_id, p_team_id, p_assignee_id, p_type default 'reassign', p_reason default null)`

Admin: anywhere. Team leader: within their teams. Agent: only to themselves within their own team.
Rejects an assignee who is not an active member of the target team. Writes `ticket_assignments`, and
moves a `new` ticket to `open` when an assignee is set.

### `app.refresh_sla_state(p_ticket_id)`

Recomputes one ticket's SLA state from its timestamps (used by the Phase 5 sweep). Not called by any
UI in Phase 1.

### Helper functions (not application endpoints)

`app.can_read_ticket`, `app.can_write_ticket`, `app.has_permission`, `app.is_staff`, `app.is_admin`,
`app.my_team_ids`, `app.my_leader_team_ids`, `app.resolve_sla_policy`, `app.add_business_minutes`,
`app.next_ticket_reference`, `app.consume_rate_limit`, `app.transition_allowed`.
They exist for RLS policies and RPCs; `supabase-js` could technically call them, and each is written
to be safe if it is.

---

## 4. Error model

| Layer | Representation |
|---|---|
| Zod validation | `{ fieldErrors: { field: 'translation.key' } }` |
| Service | `AppError` with `code`, `httpStatus`, `i18nKey` |
| Database RPC | SQL exception; services map known `errcode`s to `AppError` |
| Unexpected | logged with `requestId`; the UI shows `errors.generic` |

SQLSTATE mapping used by services: `42501` → 403 `FORBIDDEN`; `23514` → 409 `CONFLICT`;
`22023` → 400 `VALIDATION`; `P0002` → 404 `NOT_FOUND`; `P0001` → 500 `CONFIGURATION`.

---

## 5. Planned in later phases

Ticket read models and list queries (Phase 3), attachment upload/download with signed URLs (Phase 3),
console queues and bulk actions (Phase 4), SLA admin and sweep endpoints (Phase 5), knowledgebase
search and suggestions (Phase 6), report and export endpoints (Phase 7). Each will be added here with
its contract before it ships.