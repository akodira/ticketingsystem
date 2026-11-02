# DATABASE RELATIONSHIPS

Status: **design for approval** · Last updated: 2026-10-31

Companion to [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). This document records cardinality, delete
behaviour, and what each ticket workflow touches.

---

## 1. Cardinality summary

| Parent | Child | Relationship | FK / rule | On delete |
|---|---|---|---|---|
| `auth.users` | `profiles` | 1 : 1 | `profiles.id` | RESTRICT (account deletion is a status change, not a row delete) |
| `profiles` | `customers` | 1 : 0..1 | `customers.profile_id` | CASCADE |
| `organizations` | `customers` | 1 : 0..* | `customers.organization_id` | SET NULL |
| `organizations` | `tickets` | 1 : 0..* | `tickets.organization_id` (denormalized at creation) | SET NULL |
| `roles` | `user_roles` | 1 : 0..* | composite PK | CASCADE |
| `profiles` | `user_roles` | 1 : 0..* | composite PK | CASCADE |
| `roles` ↔ `permissions` | `role_permissions` | M : N | composite PK | CASCADE |
| `departments` | `teams` | 1 : 0..* | `teams.department_id` | RESTRICT |
| `teams` ↔ `profiles` | `team_members` | M : N | composite PK | CASCADE |
| `ticket_categories` | `ticket_categories` | 1 : 0..* (max depth 2) | `parent_id` | RESTRICT |
| `ticket_categories` ↔ `custom_fields` | `category_custom_fields` | M : N | composite PK | CASCADE (link only) |
| `custom_fields` | `ticket_custom_values` | 1 : 0..* | `field_id` | RESTRICT |
| `customers` | `tickets` | 1 : 0..* | `tickets.customer_id` | RESTRICT |
| `teams` | `tickets` | 1 : 0..* | `tickets.team_id` | SET NULL (ticket falls to unassigned queue) |
| `profiles` | `tickets` | 1 : 0..* | `tickets.assignee_id` | SET NULL |
| `tickets` | `ticket_messages` | 1 : 0..* | `ticket_id` | CASCADE |
| `tickets` | `ticket_attachments` | 1 : 0..* | `ticket_id` | CASCADE |
| `ticket_messages` | `ticket_attachments` | 1 : 0..* | `message_id` (nullable) | CASCADE |
| `tickets` | `ticket_assignments` | 1 : 0..* | `ticket_id` | CASCADE |
| `tickets` | `ticket_status_history` | 1 : 0..* | `ticket_id` | CASCADE |
| `tickets` | `ticket_custom_values` | 1 : 0..* | composite PK (ticket, field) | CASCADE |
| `tickets` | `ticket_sla` | 1 : 1 | `ticket_sla.ticket_id` PK | CASCADE |
| `tickets` | `customer_feedback` | 1 : 0..2 (one per confirm/reject, many csat) | `ticket_id` | CASCADE |
| `sla_policies` | `sla_policy_targets` | 1 : 1..4 | composite PK (policy, priority) | CASCADE |
| `business_calendars` | `business_hours` | 1 : 0..7 | `calendar_id` | CASCADE |
| `business_calendars` | `holidays` | 1 : 0..* | `calendar_id` | CASCADE |
| `business_calendars` | `sla_policies` | 1 : 0..* | `calendar_id` | RESTRICT |
| `sla_policies` | `tickets` (via `ticket_sla`) | 1 : 0..* | `ticket_sla.policy_id` | RESTRICT |
| `ticket_categories` | `sla_policies` | 1 : 0..* | `category_id` (nullable) | SET NULL |
| `kb_categories` | `kb_articles` | 1 : 0..* | `category_id` | RESTRICT |
| `kb_articles` ↔ `ticket_categories` | `kb_category_links` | M : N | composite PK | CASCADE |
| `profiles` ↔ `kb_articles` | `kb_article_feedback` | M : N | composite PK | CASCADE |
| `profiles` | `notifications` | 1 : 0..* | `user_id` | CASCADE |
| `notifications` | `notification_deliveries` | 1 : 0..* | `notification_id` | SET NULL (outbox outlives the record) |
| `profiles` | `audit_logs` | 1 : 0..* | `actor_id` | SET NULL (audit survives user removal) |

### Rationale for the non-obvious choices

- **`tickets.customer_id` is RESTRICT, not CASCADE.** A customer account may be deactivated, never
  deleted while tickets exist — history and SLA reporting must remain intact. Deletion is a
  `profiles.account_status` transition.
- **`teams` → `tickets` is SET NULL.** Deactivating a team must not orphan tickets destructively; the
  ticket drops into the unassigned queue and the leader reassigns. The team is soft-deleted
  (`deleted_at`), so historical reports still resolve the name.
- **`audit_logs.actor_id` is SET NULL.** The trail must outlive the actor.
- **`notification_deliveries` is an outbox.** It is queued in the same transaction as the business
  change, so a notification is never lost between "ticket resolved" and "email sent"; delivery
  happens later and retries independently.
- **`ticket_attachments.message_id` is nullable.** Attachments are uploaded with the initial ticket
  before any message row exists (the description itself becomes the first public message).

---

## 2. Data touched by each core flow

### 2.1 Customer creates a ticket

| Table | Operation |
|---|---|
| `ticket_sequences` | UPDATE (allocate) |
| `tickets` | INSERT |
| `ticket_messages` | INSERT (initial description, `public`) |
| `ticket_attachments` | UPDATE `ticket_id`, `message_id` (rows created pre-ticket) |
| `ticket_custom_values` | INSERT (one per provided field) |
| `ticket_status_history` | INSERT (null → `new`) |
| `ticket_sla` | INSERT (policy + due dates) |
| `notifications` | INSERT (customer ack, team queue) |
| `notification_deliveries` | INSERT (email confirmation + team mail) |
| `audit_logs` | INSERT (`ticket.created`) |

### 2.2 Assign / reassign / escalate

`ticket_assignments` INSERT · `tickets` UPDATE (team/assignee/escalation_level) · `ticket_status_history`
INSERT when the transition `new → open` accompanies assignment · `notifications` + outbox ·
`audit_logs`.

### 2.3 Public reply

`ticket_messages` INSERT · `tickets` UPDATE (`first_response_at`, `last_public_reply_at` /
`last_customer_reply_at`, auto `pending_customer → in_progress`) · `ticket_status_history` INSERT
for the automatic transition · `ticket_sla` UPDATE (resume/pause) · notifications both directions ·
`audit_logs` for the auto transition only.

### 2.4 Internal note

`ticket_messages` INSERT (`visibility='internal'`) · notifications to assigned agent/team
(staff only) · no customer-visible row anywhere. No status change by default.

### 2.5 Resolve → confirm/reject → close → reopen

| Step | Tables |
|---|---|
| Agent resolves | `tickets` (`resolved_at`, `resolution_summary`), `ticket_status_history`, `ticket_sla` (completed), notifications, audit |
| Customer confirms | `customer_feedback` (resolution_confirm), `tickets` → `closed`, history, audit |
| Customer rejects | `customer_feedback` (resolution_reject, reason), `tickets` → `reopened`, `reopened_count++`, history, SLA resume, notifications |
| Auto-close after N days | `tickets` → `closed`, history, audit, job_runs |
| Customer reopens a closed ticket (if eligible) | permission + window check, `tickets` → `reopened`, history, audit |

### 2.6 SLA sweep

`ticket_sla` UPDATE (state, warning/breach stamps) · `tickets` UPDATE (`escalation_level`) ·
`notifications` + outbox for warnings/breaches · `ticket_status_history` only if a state transition
is applied · `job_runs` INSERT/UPDATE.

---

## 3. Referential integrity rules worth stating

1. A ticket's `category_id` must be a root category (`parent_id is null`) and `subcategory_id`, when
   present, must be a child of that category. Enforced by trigger and by the creation RPC.
2. `tickets.assignee_id`, when set, must belong to `tickets.team_id` (or the actor is an admin
   performing an explicit override, which is audited).
3. `ticket_custom_values.field_id` must be linked to the ticket's category through
   `category_custom_fields`, and required fields must be present — validated in the RPC before insert.
4. `ticket_sla.policy_id` is frozen at creation. Changing a policy later does **not** retroactively
   alter open tickets (it affects new ones only), which preserves SLA fairness and auditability.
   A policy migration for open tickets must be an explicit, audited admin action.
5. `customer_feedback` allows at most one `resolution_confirm` and one `resolution_reject` per ticket
   (partial unique index), but any number of CSAT entries over time.
6. `kb_article_feedback` is one vote per user per article (composite PK).

---

## 4. Reporting joins

Every report starts from `tickets` and joins only dimensions, so RLS on `tickets` filters the whole
result set:

```
tickets
  ├─ join ticket_sla        (1:1)          → SLA compliance, breach, pause time
  ├─ join ticket_status_history (last row) → cycle-time and reopen counts
  ├─ join ticket_assignments (current)     → agent/team attribution at time of report
  ├─ join customer_feedback (csat)         → satisfaction
  ├─ join ticket_categories (root + child) → category roll-up
  └─ join teams / departments / profiles   → organizational dimensions
```

Attribution rule: a ticket counts toward the agent who **currently** owns it for workload views,
and toward the agent who owned it **at resolution time** for performance views. Both are stored
explicitly (`tickets.assignee_id` and the resolved assignment row) so neither depends on guessing.

---

## 5. Migration mapping preview (SQL Server)

Provided for orientation only — the migration is out of scope.

| PostgreSQL | SQL Server |
|---|---|
| `uuid` | `uniqueidentifier` |
| `citext` | `nvarchar(320)` + unique index with case-insensitive collation |
| native enum | lookup table + `FK` (documented per enum in DATA_DICTIONARY) |
| `timestamptz` | `datetimeoffset(3)` |
| `jsonb` | `nvarchar(max)` + `CHECK (ISJSON(...))` |
| `tsvector` + GIN | full-text index (Arabic supported via `Arabic` language component) |
| `generated always as identity` | `IDENTITY` |
| RLS | row-level security predicates + application authorization |
| `security definer` functions | stored procedures / EF Core transactional services |
