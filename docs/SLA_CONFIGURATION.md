# SLA CONFIGURATION

Status: **design for approval** · Last updated: 2026-10-31

SLA math is computed **server-side only**, in SQL, and stored on `ticket_sla`. No browser timer,
no client clock, no Vercel cold-start dependency.

---

## 1. What is measured

| Metric | Starts | Stops | Field |
|---|---|---|---|
| First response | ticket creation | first **staff public** message (`visibility='public'`, `author_kind='agent'`) | `first_response_due_at` / `first_response_met_at` |
| Resolution | ticket creation | transition to `resolved` | `resolution_due_at` / `resolution_met_at` |

Internal notes never satisfy first response. A customer message never pauses or satisfies resolution
by itself; it only affects pause state.

Both metrics are calculated in **business minutes** against the policy's calendar (§3). A target of
"15 minutes" on a calendar that is closed means 15 working minutes from the next opening time.

---

## 2. Default targets (proposed, NOT approved)

| Priority | First response | Resolution |
|---|---:|---:|
| Critical | 15 min | 4 h |
| High | 1 h | 8 h |
| Normal | 4 h | 24 h |
| Low | 8 h | 48 h |

The brief specifies first-response targets as "suggested for initial testing only" and requires
resolution targets to be configured separately. **Both columns require business approval (D-01)**
before they are seeded. Until approved, the seed uses these values and every document labels them
*provisional*.

---

## 3. Calendars

`business_calendars` → `business_hours` (weekly windows) + `holidays` (closed dates) + `timezone`.

Seed: one calendar `default_ksa` — Sun–Thu 08:00–17:00 `Asia/Riyadh`, Friday/Saturday closed,
holidays maintained by the admin. Sunday is `day_of_week = 0` (Postgres `extract(dow)`).

Rules:

- Multiple windows per day are allowed (e.g. 08:00–12:00 and 13:00–17:00).
- A day with no rows is closed.
- Holiday dates override working hours for that date.
- `is_recurring` holidays (fixed-date ones) repeat yearly; moveable holidays are entered per year.
- DST: all arithmetic is performed in the calendar's IANA zone with `timestamptz`; the unit tests
  cover a spring-forward and a fall-back day in a DST zone even though KSA has none, so the function
  is safe if a zone is changed.

---

## 4. Policy selection at ticket creation

Resolved deterministically, first match wins:

1. A policy whose `category_id` matches the ticket's category **and** whose `team_id` matches the
   routed team.
2. A policy whose `category_id` matches the category.
3. A policy whose `team_id` matches the routed team.
4. The policy with `is_default = true`.
5. Hard fallback: the seeded default policy.

If no policy resolves, ticket creation fails with a configuration error rather than creating a
ticket with no SLA. The chosen policy is frozen on `ticket_sla.policy_id` — later policy edits do not
retroactively change open tickets (§7).

---

## 5. Pause and resume

| Event | Effect (when policy allows) |
|---|---|
| `→ pending_customer` | Pause both clocks; record `paused_at` |
| Customer replies (`pending_customer → in_progress`) | Resume; add elapsed to `total_paused_seconds`; extend both due dates by the paused duration |
| `→ pending_internal` | **No pause by default.** `pause_on_pending_internal` must be explicitly enabled by an admin, and enabling it is audited and shown in the UI as a policy warning |
| `→ resolved` | Stop clocks; set `state = completed` if neither target was breached, otherwise retain `breached` with `resolution_met_at` recorded if met |
| `→ reopened` | Resume with the remaining balance from before resolution; no pause accumulation while closed |

Pause extension is applied to the **due timestamps** (not to elapsed time at read time), so a due
date read from the database is always current. Every pause/resume writes to
`ticket_status_history` (if status-driven) and to an `sla_events` row in the audit log.

---

## 6. Warning and breach detection

Run by `pg_cron` every `sla_cron_interval_minutes` (default 5) → `pg_net` → `/api/cron/sla-sweep`.

1. Acquire `pg_try_advisory_lock('cts.sla_sweep')`; exit if another run holds it.
2. Selection is `WHERE state IN ('on_track','due_soon','paused')` — breached rows are not
   re-evaluated for the same metric.
3. `due_soon`: remaining ≤ `warning_threshold_pct` of the interval and `warning_sent_at IS NULL` →
   set the stamp, enqueue one notification per metric.
4. `breached`: `now() > due_at` and `breach_notified_at IS NULL` → set the stamp, set
   `escalation_level = 1`, notify assignee and team leader; if already level 1 and the second
   threshold passes, escalate to level 2 (admin).
5. Process in batches of 500, ordered by due date, with a hard time budget; the next run continues.
6. Write one `job_runs` row per run with counts.

Idempotency: the notification's `dedupe_key` is `sla_warning:<ticket>:<metric>:<due_at>` /
`sla_breach:<ticket>:<metric>:<due_at>` and is `UNIQUE` on `notification_deliveries`. Re-running the
sweep after a crash cannot produce a second email or a second escalation.

Safe to retry: the sweep is idempotent by construction (stamps are only written if null). It is safe
to run concurrently because of the advisory lock.

---

## 7. Configuration changes and fairness

- Editing a policy affects **new tickets only**. Open tickets keep their frozen policy.
- To re-baseline open tickets, an admin must run the explicit, audited action
  `sla.rebaseline(policy_id, ticket_ids)` which records before/after due dates on every affected
  ticket. It is never automatic.
- Deleting a policy is a soft delete (`deleted_at`) so historical tickets still resolve its name.
- Changing calendar hours or holidays does **not** recompute existing due dates.

---

## 8. Time zones

- Stored: `timestamptz` (UTC).
- Computed: in the calendar's `timezone`.
- Displayed: in the viewing user's `profiles.timezone`, with the zone name shown on ticket details
  so there is no ambiguity.
- Reports group by the **viewer's** zone; exports include an explicit UTC column alongside the local
  one.

---

## 9. SLA in reports

| Figure | Definition |
|---|---|
| SLA compliance | tickets with `state = completed` and neither metric breached ÷ tickets resolved in the period |
| First-response compliance | `first_response_met_at <= first_response_due_at` over resolved tickets in the period |
| Breach count | distinct tickets with `breach_notified_at` in the period |
| Average pause | `total_paused_seconds` over resolved tickets |
| Overdue open | open tickets (`new`…`pending_internal`) with `now() > due_at` |

Percentages use the viewer's RLS scope, so an agent's compliance figure is their team's, not the
company's. Rounding is half-up to one decimal; the denominator is shown in the UI so a 100% on
n=1 is not mistaken for a trend.

---

## 10. Open questions

- **D-01** — approval of the target table and of resolution targets.
- **D-02** — whether `pending_customer` pauses by default (assumed **yes**) and the maximum pause
  duration before auto-escalation.
- **D-03** — business calendar, working days and holiday list for the first deployment.
- **D-07** — confirmation that targets are business minutes, not wall-clock minutes.
- Whether SLA clocks should run between ticket creation and first assignment (assumed **yes**:
  the clock starts at creation, because the customer is already waiting).
