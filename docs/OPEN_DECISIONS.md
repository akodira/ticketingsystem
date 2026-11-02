# OPEN DECISIONS — business approval required

Last updated: 2026-10-31 · Status: **awaiting owner approval**

Each decision below changes observable business behaviour. Where the brief was silent or ambiguous I
have stated an **assumed default** so design could proceed, but the assumption is provisional and
will be implemented as configured data wherever possible. Nothing here is invented requirement; it
is a proposal with a recommendation.

Legend — **Default** = what will be built if you approve without comment. **Reversible** = whether
changing it later is cheap once data exists.

---

## D-01 · SLA targets — first response and resolution

**Question.** The brief gives first-response targets "for initial testing only" (Critical 15 min,
High 1 h, Normal 4 h, Low 8 h) and says resolution targets must be configured separately. It does not
state them.

**Default.** First response as given. Resolution: Critical 4 h, High 8 h, Normal 24 h, Low 48 h
(business minutes). Seeded as the *Default Policy*, editable in the admin UI.

**Recommendation.** Approve explicitly, or supply your own numbers. These become contractual promises
once customers see them, and they determine whether the 90% compliance objective is achievable.

**Reversible.** Yes — future tickets only; open tickets keep their frozen policy.

---

## D-02 · Does `pending_customer` pause the SLA clock?

**Question.** The brief says "Pending Customer may pause the applicable SLA clock when configured",
and that `pending_internal` must not pause unless an approved policy allows it.

**Default.** `pause_on_pending_customer = true` on the default policy; `pause_on_pending_internal =
false`. Both are per-policy flags, so an admin can change them without a code change.

**Recommendation.** Pause on `pending_customer`. Otherwise the SLA punishes support for the
customer's own silence.

**Related sub-decision.** Should there be a **maximum** pause (e.g. 5 business days) after which the
clock resumes and the ticket escalates or auto-closes? Default: no maximum in v1; add in Phase 5 if
you want it.

**Reversible.** Yes (configuration).

---

## D-03 · Business calendar

**Question.** Working days, hours, time zone and holidays for the first deployment.

**Default.** Sunday–Thursday, 08:00–17:00, `Asia/Riyadh`, Friday/Saturday closed, no public holidays
seeded (the admin adds them). Holidays are entered per year in the admin UI.

**Recommendation.** Confirm the working week, hours and the time zone. If support operates
around-the-clock or across multiple countries, say so now — it changes the calendar model
(24/7 becomes a special case rather than a separate feature).

**Reversible.** Yes for future tickets. Holiday/calendar changes never rewrite existing due dates.

---

## D-04 · Organization-level ticket visibility

**Question.** The brief says customers see only their own tickets and that organization-level shared
access, if implemented, must be explicitly configured and not exposed automatically.

**Default.** Implemented but **off**: an `organizations` table exists, `share_tickets = false` for
every organization, and no UI exposes company-wide visibility in v1. Column and RLS predicate are in
place so it can be switched on per organization later without a migration.

**Recommendation.** Build the schema support, keep the feature off for launch. Confirm that no
customer is expected to see colleagues' tickets in the first release.

**Reversible.** Yes, per organization.

---

## D-05 · Hosting regions

**Question.** Where Supabase and Vercel should run.

**Default.** Supabase `eu-central-1` (Frankfurt) and Vercel `fra1`, unless most users are in KSA, in
which case Supabase's nearest available region plus Vercel `bah1`.

**Recommendation.** Tell me where the majority of your customers are. The database region matters
more than the function region — pick it first.

**Reversible.** Region changes require a project migration (backup + restore), so worth getting right.

---

## D-06 · Default locale and time zone for users

**Question.** Which language and zone a new visitor gets.

**Default.** `en` for anonymous visitors unless `Accept-Language` prefers Arabic; `Asia/Riyadh` as
the default display zone; per-user override in the profile.

**Recommendation.** If your customer base is primarily Arabic, make `ar` the default for anonymous
visitors on the customer portal. One line of configuration.

**Reversible.** Yes.

---

## D-07 · "Business minutes" vs "clock minutes"

**Question.** A 15-minute Critical target: 15 working minutes or 15 real minutes?

**Default.** **Business minutes** — evaluated against the policy's calendar. A Critical ticket raised
at 16:55 on a Wednesday with a 17:00 close is due at 08:15 the next working day plus 10 minutes
remaining.

**Recommendation.** Business minutes for High/Normal/Low, and for Critical either business minutes
with an on-call arrangement, or 24/7 calendar. If Critical tickets require an immediate response
outside working hours, Critical needs its own calendar (a 24/7 one) — say so and it will be seeded.

**Reversible.** Yes per policy.

---

## D-08 · Can `management_viewer` read ticket contents and internal notes?

**Question.** The brief grants viewers "dashboards and reports". It does not say whether they may open
an individual ticket or read internal notes.

**Default.** Viewers may read ticket lists and ticket *header* details within their scope
(`ticket.read.all`) and all reports, but **not** internal notes (`ticket.note.internal` is not
granted) and not customer contact details beyond name/email on the ticket.

**Recommendation.** Confirm. If viewers should see note text, it is a one-row change to the permission
matrix — but it should be a deliberate decision, since notes often contain candid internal commentary.

**Reversible.** Yes (role/permission data, audited).

---

## D-09 · Can support staff raise tickets?

**Question.** The brief states the platform is exclusively for external customers and that employees
are support staff, not requesters.

**Default.** Staff **cannot** create tickets. The `ticket.create.self` permission is granted only to
customers, and the ticket creation route is guarded to the customer portal.

**Recommendation.** Agree, and handle internal IT requests in a separate system. If an agent ever
needs to raise a ticket *on behalf of* a customer (e.g. after a phone call), that is a different
feature ("create on behalf") and would need its own approval — it is not in scope.

**Reversible.** Yes, but adding create-on-behalf later touches creation, notifications and audit.

---

## D-10 · Customer priority selection

**Question.** The brief makes customer priority selection configurable.

**Default.** Enabled (`allow_customer_priority = true`), with the customer's choice treated as a
*request*: the console shows "customer priority" and the agent may change it, with the change
audited and the customer notified.

**Recommendation.** Enabled for the validation phase, then decide based on whether customers
over-select Critical. If they do, switch it off from settings — no code change.

**Reversible.** Yes (setting).

---

## D-11 · Resolution confirmation and reopening rules

**Question.** The brief requires confirm/reject and reopen, but not the limits.

**Default.** Auto-close `resolved` tickets after 7 days; customers may reopen a closed ticket within
30 days and at most 3 times per ticket; a rejection requires a reason of at least 10 characters; a
reopened ticket resumes its SLA with the remaining balance.

**Recommendation.** Confirm the numbers. Also confirm whether a customer rejection should go straight
to `reopened` (default) or back to `in_progress` for the same agent.

**Reversible.** Yes (settings).

---

## D-12 · Attachments

**Question.** Which file types and sizes are acceptable.

**Default.** 10 MB per file, maximum 5 files per message; allowed: pdf, png, jpg, jpeg, gif, webp,
docx, xlsx, pptx, txt, csv, zip. Blocked: executables, scripts, html, svg, macro-enabled Office files.

**Recommendation.** Confirm the list. If customers routinely send `.rar`, `.7z`, `.heic` or CAD files,
say so — the MIME/extension check must include them before launch.

**Gap to acknowledge.** No antivirus scanning in v1 (no approved vendor). This is recorded as a known
issue for production hardening, not silently ignored.

**Reversible.** Yes (settings), though the storage policy must be updated with the setting.

---

## D-13 · Email deliverability

**Question.** Which sender domain sends notifications, and is Resend acceptable?

**Default.** Resend, sending from a subdomain you control (e.g. `notifications@tickets.yourdomain`),
requiring SPF, DKIM and DMARC records on that domain.

**Recommendation.** Provide the domain now; DNS verification and warm-up take time and are on the
critical path for Phase 2's email verification emails. If you prefer another provider, it only
requires a new `EmailProvider` implementation.

**Reversible.** Yes (one adapter).

---

## D-14 · The "reduce average resolution time" objective

**Question.** The brief itself notes the target percentage and measurement baseline must be confirmed.

**Default.** **Not** treated as an approved KPI. The system will *measure* average first-response and
resolution time and expose them in reports, but no target line, no pass/fail indicator and no
dashboard claim about improvement will be shown.

**Recommendation.** After 4–6 weeks of real data, set the baseline from the median (not the mean,
which outliers distort) and then approve a target.

**Reversible.** N/A — measurement is additive.

---

## D-15 · Data retention and audit

**Question.** How long ticket data and audit logs are kept.

**Default.** Tickets retained indefinitely; audit logs 24 months; deleted organization/category
records are soft-deleted and retained.

**Recommendation.** Confirm, and tell me if a regulator, customer contract or privacy policy imposes
a different period — it affects the schema (partitioning, purge jobs) sooner than later.

**Reversible.** Yes with a purge job.

---

## Decision summary

| ID | Topic | Default if approved silently |
|---|---|---|
| D-01 | SLA targets | 15 m / 1 h / 4 h / 8 h first response; 4 h / 8 h / 24 h / 48 h resolution |
| D-02 | Pause rules | Pause on `pending_customer`, never on `pending_internal` |
| D-03 | Calendar | Sun–Thu 08:00–17:00, `Asia/Riyadh`, holidays added by admin |
| D-04 | Org sharing | Schema present, feature **off** |
| D-05 | Regions | Supabase EU-central, Vercel `fra1` |
| D-06 | Defaults | `en` / `Asia/Riyadh`, overridable per user |
| D-07 | SLA minutes | Business minutes |
| D-08 | Viewer access | Read-only, ticket contents yes, internal notes no |
| D-09 | Staff as requesters | Not allowed |
| D-10 | Customer priority | Enabled, agent may override, audited |
| D-11 | Reopen rules | Auto-close 7 d, reopen 30 d / 3 times, reason ≥ 10 chars |
| D-12 | Attachments | 10 MB, 5 per message, list above, no AV in v1 |
| D-13 | Email | Resend from a subdomain you own |
| D-14 | Resolution KPI | Measured, no target until baseline agreed |
| D-15 | Retention | Tickets indefinite, audit 24 months |

### What blocks Phase 1 from starting

Only two answers are genuinely blocking, because they are baked into the first migration's seed:

- **D-01** — the SLA target values (they seed `sla_policy_targets`).
- **D-05** — the Supabase region (creating a project in the wrong region means a project migration).

Everything else can be implemented with its default and changed later through configuration.

### Also needed from you (not decisions, inputs)

1. GitHub account/org and whether you want a new repository or an existing one.
2. Supabase account (two projects) and Vercel account access, or confirmation that I should prepare
   the project and you will connect the accounts.
3. The sender email domain for D-13.
4. Confirmation of the product/branding name and any logo, or approval to use a neutral wordmark.
