# DATA DICTIONARY

Status: **design for approval** · Last updated: 2026-10-31

Enumerations first (they define the value domains), then column-level rules for the tables that
carry business meaning. Reference tables without business semantics (`role_permissions`,
`kb_category_links`, `rate_limits`) are omitted.

---

## 1. Enumerations

### `role_code`
| Value | Meaning |
|---|---|
| `customer` | External requester |
| `agent` | Support agent |
| `team_leader` | Support agent with team-level management rights |
| `admin` | System administrator |
| `management_viewer` | Read-only performance viewer |

### `account_status`
| Value | Meaning | Can authenticate | Can create tickets |
|---|---|---|---|
| `pending` | Registered, email not verified | yes (limited) | no |
| `active` | Normal | yes | yes |
| `suspended` | Blocked by admin | no | no |
| `deactivated` | Closed by owner/admin | no | no |

### `ticket_status`
| Value | Meaning | Terminal |
|---|---|---|
| `new` | Submitted, not yet acknowledged by support | no |
| `open` | Acknowledged / assigned, work not started | no |
| `in_progress` | Actively being worked | no |
| `pending_customer` | Waiting on the customer | no |
| `pending_internal` | Waiting on another internal party | no |
| `resolved` | Solution delivered, awaiting customer confirmation (or auto-close) | no |
| `closed` | Finished and accepted (or auto-closed) | yes |
| `reopened` | Re-opened after resolution/closure, work resumed | no |

### `priority_level`
`critical` · `high` · `normal` · `low`

### `sla_state`
| Value | Meaning |
|---|---|
| `on_track` | Remaining time above the warning threshold |
| `due_soon` | Remaining time ≤ warning threshold, not yet breached |
| `breached` | Deadline passed |
| `paused` | Clock paused by policy (e.g. `pending_customer`) |
| `completed` | Both targets met; clock stopped |

### `message_visibility`
`public` (customer + staff) · `internal` (staff only)

### `message_author_kind`
`customer` · `agent` · `system`

### `assignment_type`
`initial` · `reassign` · `escalate` · `unassign` · `auto`

### `team_role`
`member` · `leader`

### `custom_field_type`
`text` · `textarea` · `number` · `date` · `dropdown` · `multiselect` · `checkbox` · `radio` · `file`

### `feedback_type`
`resolution_confirm` · `resolution_reject` · `csat`

### `notification_event`
`ticket_created` · `ticket_assigned` · `ticket_reassigned` · `ticket_replied` · `ticket_status_changed`
· `ticket_priority_changed` · `sla_warning` · `sla_breached` · `ticket_resolved` · `ticket_closed`
· `ticket_reopened` · `ticket_escalated` · `feedback_received`

### `delivery_status`
`queued` · `sending` · `sent` · `failed` · `suppressed`

### `kb_status` / `kb_visibility`
`draft|published|archived` / `public|internal`

### `ticket_channel`
`web_portal` (only value in v1; the column exists so future channels do not require a migration)

---

## 2. Column rules — `profiles`

| Column | Type | Req | Rule |
|---|---|---|---|
| `id` | uuid | yes | = `auth.users.id` |
| `email` | citext | yes | valid email, unique, mirrored from auth on signup |
| `full_name` | text | yes | 1–120 chars |
| `phone` | text | no | `^\+?[0-9 \-()]{7,20}$` |
| `locale` | text | yes | `en` \| `ar`, default `en` |
| `timezone` | text | yes | IANA name, default `Asia/Riyadh` (configurable — see D-06) |
| `account_status` | enum | yes | default `pending`; set to `active` when email confirmed |
| `is_staff` | boolean | yes | derived from `user_roles`; never set by client |
| `email_verified_at` | timestamptz | no | set from auth confirmation |
| `last_login_at` | timestamptz | no | updated on successful sign-in |

## 3. Column rules — `tickets`

| Column | Type | Req | Rule |
|---|---|---|---|
| `reference` | citext | yes | `^CTS-\d{4}-\d{6}$`, immutable, unique |
| `customer_id` | uuid | yes | must reference an `active` customer |
| `category_id` | uuid | yes | root category, active |
| `subcategory_id` | uuid | no | child of `category_id` |
| `subject` | text | yes | 3–200 chars, trimmed, no control characters |
| `description` | text | yes | 10–20 000 chars |
| `status` | enum | yes | default `new`; changes only via RPC |
| `priority` | enum | yes | default `normal`; customer choice allowed only when setting `allow_customer_priority` is on |
| `team_id` | uuid | no | set on routing; must be active |
| `assignee_id` | uuid | no | must be an active member of `team_id` |
| `locale` | text | yes | language the ticket was written in (drives notification language) |
| `first_response_at` | timestamptz | no | first staff **public** message |
| `resolved_at` / `closed_at` | timestamptz | no | stamped by trigger |
| `resolution_summary` | text | conditional | required when `status = 'resolved'` |
| `reopened_count` | smallint | yes | incremented on each reopen |
| `escalation_level` | smallint | yes | 0 none, 1 team leader, 2 admin |

## 4. Column rules — `ticket_messages`

| Column | Rule |
|---|---|
| `visibility` | client cannot choose `internal` unless staff with `ticket.note.internal` |
| `author_kind` | `customer` for customer-authored, `agent` for staff, `system` for automated notes |
| `body` | 1–20 000 chars; stored as plain text (escaped on render, never HTML) |
| `is_initial_description` | true for exactly one message per ticket |
| `edited_at` | set only by the author within an edit window if editing is enabled (default: disabled) |

## 5. Column rules — `ticket_sla`

| Column | Rule |
|---|---|
| `first_response_due_at`, `resolution_due_at` | computed at creation by the calendar function; not client-supplied |
| `state` | maintained by `app.refresh_sla_state` and the sweep; never set directly by UI |
| `total_paused_seconds` | accumulated when leaving `paused` |
| `warning_sent_at`, `breach_notified_at` | idempotency stamps — a timestamp is never overwritten |

## 6. Column rules — `sla_policy_targets`

`first_response_minutes` and `resolution_minutes` are **business minutes**, evaluated against the
policy's calendar (working days, hours, holidays, time zone). A `critical` target of 15 minutes
means 15 working minutes, not 15 wall-clock minutes outside business hours. This is stated here
because it changes SLA compliance figures and needs explicit business agreement (see D-07).

## 7. Column rules — `custom_fields`

| Column | Rule |
|---|---|
| `field_type` | one of the nine types; immutable after values exist |
| `options` | required for `dropdown`, `multiselect`, `radio`; `[{value, label_en, label_ar}]`; values unique |
| `validation` | `{min,max,minLength,maxLength,pattern,extensions,maxBytes}` — enforced server-side by a generated Zod schema |
| `is_active` | soft-deactivate; existing values remain readable |

## 8. Column rules — `customer_feedback`

| Column | Rule |
|---|---|
| `feedback_type = 'csat'` | `rating` 1–5 required, `comment` optional; allowed once per ticket per customer, only after `resolved`/`closed` |
| `feedback_type = 'resolution_confirm'` | rating/comment must be null; only by the ticket's customer; ticket must be `resolved` |
| `feedback_type = 'resolution_reject'` | `rejection_reason` required (10–2000 chars); ticket must be `resolved`; moves ticket to `reopened` |

## 9. Settings keys (`app_settings`)

| Key | Type | Default | Purpose |
|---|---|---|---|
| `allow_customer_priority` | boolean | `true` | Whether customers may pick priority |
| `auto_close_days` | integer | `7` | Days after `resolved` before auto-close |
| `reopen_window_days` | integer | `30` | Window in which a closed ticket may be reopened |
| `max_reopens` | integer | `3` | Reopen limit per ticket |
| `attachment_max_bytes` | integer | `10485760` | 10 MB |
| `attachment_allowed_extensions` | string[] | see SECURITY_AND_RLS §5 | Allow-list |
| `sla_warning_threshold_pct` | integer | `80` | Default when a policy does not override |
| `default_timezone` | string | `Asia/Riyadh` | Display + SLA default |
| `sla_cron_interval_minutes` | integer | `5` | Documented sweep cadence |
| `email_from_name` / `email_from_address` | string | — | Outbound sender identity |
| `kb_suggestions_enabled` | boolean | `true` | Show KB suggestions during creation |
| `kb_suggestion_min_rank` | numeric | `0.1` | Relevance cut-off |

All settings are read through `modules/admin/services/settings.ts` and cached per request; no page
reads `app_settings` directly.
