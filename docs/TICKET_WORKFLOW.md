# TICKET WORKFLOW

Status: **design for approval** · Last updated: 2026-10-31

The transition matrix below is the single source of truth. It is implemented three times and all
three must agree:

1. `src/modules/tickets/domain/transitions.ts` — pure function used by services and unit tests.
2. `app.transition_ticket` RPC — re-validates before writing.
3. `trg_tickets_status_transition` trigger — rejects anything the matrix forbids, regardless of caller.

A state the matrix does not allow is a bug, not an exception.

---

## 1. Statuses

| Status | Meaning | Customer-visible label (en / ar intent) |
|---|---|---|
| `new` | Submitted; not yet acknowledged by support | New |
| `open` | Acknowledged/assigned; work not started | Open |
| `in_progress` | Support is actively working | In Progress |
| `pending_customer` | Waiting on the customer | Awaiting Your Response |
| `pending_internal` | Waiting on another internal party | Pending Internal |
| `resolved` | Solution provided; awaiting confirmation | Resolved |
| `closed` | Completed and accepted (or auto-closed) | Closed |
| `reopened` | Reopened after resolution/closure | Reopened |

Resolution and closure are **separate stages**: `resolved` is the support side finishing work;
`closed` is the customer accepting it (or `auto_close_days` expiring). A ticket that is `resolved` is
still inside its reopen window and still visible as unresolved work in reports that exclude terminal
states.

---

## 2. Allowed transitions

Rows = current status, columns = target status. ● allowed · – forbidden.

| From \ To | new | open | in_progress | pending_customer | pending_internal | resolved | closed | reopened |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **new** | – | ● | ● | – | – | ● | – | – |
| **open** | – | – | ● | ● | ● | ● | – | – |
| **in_progress** | – | – | – | ● | ● | ● | – | – |
| **pending_customer** | – | – | ● | – | – | ● | – | – |
| **pending_internal** | – | – | ● | ● | – | ● | – | – |
| **resolved** | – | – | – | – | – | – | ● | ● |
| **closed** | – | – | – | – | – | – | – | ● |
| **reopened** | – | ● | ● | ● | ● | ● | – | – |

Notes on the shape:

- `new → resolved` is allowed for a ticket solved on first contact without an intermediate step.
- `in_progress → pending_customer` is the normal "we need more information" path.
- `pending_customer → resolved` is allowed (customer supplied what was needed and the agent closed
  it out in the same action).
- `resolved → closed` is the customer confirmation or the auto-close job.
- `resolved → reopened` and `closed → reopened` are the rejection and reopen paths.
- Self-transitions are never allowed; a no-op is a validation error, not a silent success.
- No direct `closed → anything` except `reopened`; a closed ticket is otherwise terminal.

---

## 3. Who may perform each transition

Transition legality (§2) and authorization are separate questions. Both must pass.

| Transition | Customer | Agent | Team Leader | Admin | System (cron) |
|---|:--:|:--:|:--:|:--:|:--:|
| `new → open` | – | ● assigned/unassigned in team | ● | ● | ● (on assignment) |
| `new → in_progress` | – | ● assigned | ● | ● | – |
| `new → resolved` | – | ● assigned | ● | ● | – |
| `open → in_progress` | – | ● assigned | ● | ● | – |
| `open → pending_customer` | – | ● assigned | ● | ● | – |
| `open → pending_internal` | – | ● assigned | ● | ● | – |
| `open → resolved` | – | ● assigned | ● | ● | – |
| `in_progress → pending_*` | – | ● assigned | ● | ● | – |
| `in_progress → resolved` | – | ● assigned | ● | ● | – |
| `pending_customer → in_progress` | – | ● | ● | ● | ● (on customer reply) |
| `pending_customer → resolved` | – | ● | ● | ● | – |
| `pending_internal → *` | – | ● | ● | ● | – |
| `resolved → closed` | ● own (confirm) | – | ● | ● | ● (auto-close) |
| `resolved → reopened` | ● own (reject) | – | ● | ● | – |
| `closed → reopened` | ● own, within window/limit | – | – | ● | – |
| Any transition with a reason | – | – | – | ● (override) | – |

"Assigned" means `tickets.assignee_id = actor`; an unassigned ticket in the agent's team may be
taken (`ticket.assign.self`) and transitioned in the same action. A team leader may act on any
ticket in their team. Customers can only move tickets they own, and only along the customer rows
above.

Every transition writes `ticket_status_history` (from, to, actor or null for system, reason,
timestamp) and an `audit_logs` row for staff/admin actions.

---

## 4. Side effects per transition

| Transition | Side effects |
|---|---|
| → `open` | set `team_id`/`assignee_id` if the transition came from assignment; notify assignee; SLA continues |
| → `in_progress` | resume SLA if paused; notify customer that work has started (configurable) |
| → `pending_customer` | pause SLA clock if the policy says so; email the customer; start a reminder timer (optional, Phase 5) |
| → `pending_internal` | **no automatic pause** unless the policy explicitly enables it; notify the internal party |
| → `resolved` | require `resolution_summary`; set `resolved_at`; stop SLA clock as `completed` or `breached`; enqueue resolution email; set the auto-close due date |
| → `closed` | set `closed_at`; enqueue CSAT request; freeze the ticket (no further edits from staff, customer read-only) |
| → `reopened` | increment `reopened_count`; clear `resolved_at`/`closed_at`; resume SLA from the paused/remaining balance; notify team and leader; record the reason |

---

## 5. Automatic transitions

| Trigger | Effect | Mechanism |
|---|---|---|
| Staff assignment of a `new` ticket | `new → open` | Same transaction as assignment |
| First staff public reply on a `new`/`open` ticket | → `in_progress` | `app.add_message` |
| Customer reply on `pending_customer` | → `in_progress` | `app.add_message` |
| Resolution confirmation | `resolved → closed` | Service |
| Auto-close after `auto_close_days` | `resolved → closed` | Cron `auto-close`, idempotent (only rows still `resolved` and past due) |
| SLA breach | **no status change** | SLA state changes independently (§6) |

No automatic transition changes priority. Escalation level is not a status.

---

## 6. SLA is independent of status

The ticket may be `in_progress` with an `on_track` SLA, or `pending_customer` with a `paused` SLA,
or `open` and already `breached`. State changes per [SLA_CONFIGURATION.md](SLA_CONFIGURATION.md):

```
created ──▶ on_track ──▶ due_soon ──▶ breached
                │            │
                └──▶ paused ─┘          (resume returns to the state implied by remaining time)
                             │
                    ──▶ completed        (both targets met, clock stopped)
```

A ticket never re-enters `on_track` from `breached` for the same metric; the breach is permanent
history. Reopening a resolved ticket creates a **new** SLA evaluation for the reopened cycle and
keeps the original outcome for reporting.

---

## 7. Customer portal view of the lifecycle

The customer sees a simplified, five-step progress indicator derived from status, never the internal
`pending_internal` state:

`Submitted → Acknowledged → In Progress → Resolved → Closed`

Mapping: `new`→Submitted · `open`→Acknowledged · `in_progress`/`pending_internal`→In Progress ·
`pending_customer`→"Awaiting your response" callout · `resolved`→Resolved · `closed`→Closed ·
`reopened`→In Progress.

Customers see the status label and timestamps, never internal reasons, escalation level, or agent
workload context.

---

## 8. Validation rules attached to transitions

| Rule | Enforced in |
|---|---|
| Illegal transition | domain function, RPC, DB trigger |
| `resolved` requires a non-empty resolution summary | service + DB `CHECK` |
| Customer confirm/reject requires `status = 'resolved'` | service + RPC |
| Reopen requires `status ∈ {resolved, closed}`, `reopened_count < max_reopens`, and within `reopen_window_days` for customers | service + RPC |
| Closing by staff without customer action requires `ticket.close.any` | service + RLS |
| Reason (≥10 chars) required for reopen, rejection and admin override | service + schema |
| Transitioning beyond scope | service `assertPermission` + RLS |
