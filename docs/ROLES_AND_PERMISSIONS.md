# ROLES AND PERMISSIONS

Status: **design for approval** · Last updated: 2026-10-31

Authorization is **RBAC + scope**. A user holds roles; roles grant permission codes; permission
checks are further qualified by data scope (own record, team, or all). The same matrix is
implemented in three places that must agree:

1. `src/modules/identity/domain/permissions.ts` — the code map used by services.
2. `user_roles` / `role_permissions` tables — the data the UI and RLS read.
3. RLS policies — the authoritative enforcement.

A permission granted to a role in the table but missing from the code map is a bug that the
permission-parity unit test catches.

---

## 1. Roles

| Role | Audience | Baseline |
|---|---|---|
| `customer` | External | Sees only their own tickets (unless organization sharing is enabled — see D-04) |
| `agent` | Support staff | Sees own team's tickets; edits assigned ones |
| `team_leader` | Support staff | Everything an agent can do, scoped to their team(s), plus assignment/escalation |
| `admin` | Staff | Everything, system-wide, including configuration |
| `management_viewer` | Staff | Read-only dashboards and reports, system-wide |

A user may hold several roles; effective permissions are the union, and the most permissive scope
wins. Internal users are `is_staff = true`; customers are never staff. A profile cannot hold
`customer` together with any staff role (enforced by a trigger).

---

## 2. Permission codes

Naming: `<resource>.<action>[.<scope>]`.

| Code | Description |
|---|---|
| `ticket.create.self` | Create a ticket for oneself |
| `ticket.read.own` | Read own tickets |
| `ticket.read.org` | Read tickets of one's organization (only when `organizations.share_tickets`) |
| `ticket.read.team` | Read tickets owned by one's team(s) |
| `ticket.read.all` | Read every ticket |
| `ticket.reply.own` | Add a public reply to one's own ticket |
| `ticket.reply.team` | Add a public reply to team tickets |
| `ticket.note.internal` | Add private internal notes |
| `ticket.attachment.upload` | Upload attachments to a ticket one can reply to |
| `ticket.attachment.internal` | Attach files visible to staff only |
| `ticket.assign.self` | Take an unassigned ticket from one's team |
| `ticket.assign.team` | Assign/reassign within one's team |
| `ticket.assign.any` | Assign across teams |
| `ticket.escalate` | Escalate a ticket |
| `ticket.priority.change.team` | Change priority on team tickets |
| `ticket.priority.change.any` | Change priority system-wide |
| `ticket.status.transition.team` | Move status along allowed transitions on team tickets |
| `ticket.status.transition.any` | Move status system-wide, including admin-only transitions |
| `ticket.resolve` | Resolve |
| `ticket.close.any` | Close without customer confirmation |
| `ticket.reopen.any` | Reopen any ticket |
| `ticket.reopen.own` | Reopen one's own ticket within the eligible window |
| `ticket.bulk.team` | Bulk actions on team tickets |
| `ticket.export.team` | Export team ticket data |
| `feedback.submit.own` | Confirm/reject resolution and submit CSAT on own tickets |
| `team.read.team` | View team details and workload |
| `team.read.all` | View all teams |
| `team.manage.team` | Maintain membership of one's team |
| `team.manage.all` | Create/delete teams and departments |
| `user.read.team` | View staff profiles in one's team |
| `user.read.all` | View all users |
| `user.manage` | Create/deactivate users, grant roles |
| `customer.read.team` | View customer details for tickets the team handles |
| `customer.read.all` | View all customer records |
| `customer.manage` | Edit customer records, link organizations |
| `category.manage` | Manage categories and subcategories |
| `customfield.manage` | Manage custom field definitions |
| `sla.read` | Read SLA configuration and compliance |
| `sla.manage` | Configure policies, calendars, holidays |
| `kb.read.internal` | Read internal knowledgebase articles |
| `kb.manage` | Create/publish/archive articles and categories |
| `feedback.read.team` | Read CSAT for team tickets |
| `feedback.read.all` | Read all CSAT |
| `report.view.team` | Team dashboards and reports |
| `report.view.all` | Company-wide dashboards and reports |
| `report.export` | Export reports |
| `settings.manage` | System settings |
| `audit.read` | Read audit logs |
| `notification.read.own` | Read own notifications |
| `notification.manage` | View delivery queue, retry failures |

---

## 3. Role × permission matrix

● = granted · ◐ = granted with data scope · – = not granted

| Permission | Customer | Agent | Team Leader | Admin | Mgmt Viewer |
|---|:--:|:--:|:--:|:--:|:--:|
| `ticket.create.self` | ● | – | – | – | – |
| `ticket.read.own` | ● | – | – | – | – |
| `ticket.read.org` | ◐ | – | – | – | – |
| `ticket.read.team` | – | ◐ | ◐ | ● | – |
| `ticket.read.all` | – | – | – | ● | ● |
| `ticket.reply.own` | ● | – | – | – | – |
| `ticket.reply.team` | – | ◐ | ◐ | ● | – |
| `ticket.note.internal` | – | ◐ | ◐ | ● | – |
| `ticket.attachment.upload` | ● | ● | ● | ● | – |
| `ticket.attachment.internal` | – | ● | ● | ● | – |
| `ticket.assign.self` | – | ◐ | ◐ | ● | – |
| `ticket.assign.team` | – | – | ◐ | ● | – |
| `ticket.assign.any` | – | – | – | ● | – |
| `ticket.escalate` | – | – | ◐ | ● | – |
| `ticket.priority.change.team` | – | ◐ | ◐ | ● | – |
| `ticket.priority.change.any` | – | – | – | ● | – |
| `ticket.status.transition.team` | – | ◐ | ◐ | ● | – |
| `ticket.status.transition.any` | – | – | – | ● | – |
| `ticket.resolve` | – | ◐ | ◐ | ● | – |
| `ticket.close.any` | – | – | – | ● | – |
| `ticket.reopen.any` | – | – | – | ● | – |
| `ticket.reopen.own` | ● | – | – | – | – |
| `ticket.bulk.team` | – | – | ◐ | ● | – |
| `ticket.export.team` | – | – | ◐ | ● | – |
| `feedback.submit.own` | ● | – | – | – | – |
| `team.read.team` | – | ◐ | ◐ | ● | ● |
| `team.read.all` | – | – | – | ● | ● |
| `team.manage.team` | – | – | ◐ | ● | – |
| `team.manage.all` | – | – | – | ● | – |
| `user.read.team` | – | ◐ | ◐ | ● | – |
| `user.read.all` | – | – | – | ● | ● |
| `user.manage` | – | – | – | ● | – |
| `customer.read.team` | – | ◐ | ◐ | ● | – |
| `customer.read.all` | – | – | – | ● | ● |
| `customer.manage` | – | – | – | ● | – |
| `category.manage` | – | – | – | ● | – |
| `customfield.manage` | – | – | – | ● | – |
| `sla.read` | – | ● | ● | ● | ● |
| `sla.manage` | – | – | – | ● | – |
| `kb.read.internal` | – | ● | ● | ● | – |
| `kb.manage` | – | – | – | ● | – |
| `feedback.read.team` | – | – | ◐ | ● | – |
| `feedback.read.all` | – | – | – | ● | ● |
| `report.view.team` | – | ◐ | ◐ | ● | ● |
| `report.view.all` | – | – | – | ● | ● |
| `report.export` | – | – | ◐ | ● | ◐ |
| `settings.manage` | – | – | – | ● | – |
| `audit.read` | – | – | – | ● | – |
| `notification.read.own` | ● | ● | ● | ● | ● |
| `notification.manage` | – | – | – | ● | – |

### Notes on ◐ (scoped) grants

- **Agent scope** = tickets where `team_id ∈ my teams`. Assignment-based scope is narrower: an agent
  may *act* only on tickets assigned to them or unassigned within their team, but may *read* the
  whole team queue (needed to pick work up). See §4.
- **Team leader scope** = tickets where `team_id ∈ my teams` (my teams = teams where
  `team_members.team_role = 'leader'`).
- **`ticket.create.self`** is deliberately not granted to staff: employees are not requesters in this
  system (brief §1). If staff need IT support, that is a separate system or a future decision (see D-09).

---

## 4. Scope resolution — the single rule set

`resolveTicketScope(user)` returns one of `own | org | team(ids) | all`, computed once per request
and used by services and by the RLS predicate:

```
all        ← user has ticket.read.all
org        ← organizations.share_tickets = true AND user is a customer of that org
team(ids)  ← user is staff AND is an active member of team(s) ids
own        ← otherwise (customer)
```

Action-level checks layer on top:

| Action | Minimum condition |
|---|---|
| Read ticket | ticket in resolved scope |
| Public reply | own ticket (customer) · ticket in team scope (staff) |
| Internal note | staff + ticket in team scope |
| Transition status | staff + ticket in team scope + transition allowed for role (see TICKET_WORKFLOW §3) |
| Assign to a specific agent | agent is active member of the target team, or actor is admin |
| Change priority | team scope (agent, leader) · any (admin) |
| Read internal notes | staff + team scope; never customers, never management_viewer |
| Export | `report.export` or `ticket.export.team`; export always respects the same scope |

`management_viewer` has **no** write permission of any kind. It can read aggregates, ticket lists
and (per the matrix above) ticket contents via `ticket.read.all`, but `ticket.note.internal` is not
granted — see D-08 for confirmation of whether viewers may read note text.

---

## 5. Where each check happens

| Layer | Check | Failure behaviour |
|---|---|---|
| `proxy.ts` | Session exists; staff routes require `is_staff`; customer routes require customer role | Redirect to sign-in / 403 page |
| Layout (RSC) | Re-validate `getUser()` and role for the section | Redirect |
| Service | `assertPermission(actor, code, scope, ticket)` | Throws `ForbiddenError` → 403 with i18n message |
| RPC / trigger | Re-derives actor from `auth.uid()`; rejects illegal transitions | Raises SQL exception → mapped to 409/403 |
| RLS | `USING` / `WITH CHECK` on every table | Returns zero rows or raises |

The UI hides controls the user cannot use, but hiding is cosmetic: every mutation is re-checked
server-side. A disabled button is never the security boundary.

---

## 6. Provisioning and role changes

- **Customers** self-register; `customer` role is granted by a trigger on `profiles` insert when no
  staff invitation exists.
- **Staff** accounts are created by an admin (invite email → password set → role grant) or promoted
  from an existing profile by `user.manage`. Staff sign-up through the public form is rejected.
- Role changes are audited (`user.role_granted` / `user.role_revoked`) with grantor, target and role
  code; removing the last admin is blocked.
- Deactivation sets `account_status` and revokes sessions (`auth.admin.signOut` on next request via
  `getUser()` failing the status check in the layout guard).
