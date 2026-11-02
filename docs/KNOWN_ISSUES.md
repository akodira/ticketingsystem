# KNOWN ISSUES

Last updated: 2026-10-31 · Phase 1

Severity: `S1` critical (data loss / security breach) · `S2` major (feature unusable) ·
`S3` minor (workaround exists) · `S4` cosmetic.

Open issues are real. Resolved issues stay listed with the fix, so the history is honest.

---

## Open

| ID | Sev | Area | Issue | Impact | Plan |
|---|---|---|---|---|---|
| K-01 | S2 | Deployment | No GitHub, Supabase or Vercel environment exists yet | The app cannot be used online until the accounts are provided | Owner supplies accounts; Phase 1 deployment checklist then runs |
| K-02 | S3 | Security | CSP allows `'unsafe-inline'` for scripts | Weakens XSS defence; no nonce yet | Phase 8: nonce-based CSP, verified against the deployed build |
| K-03 | S3 | Files | No antivirus scanning of attachments | Malware could be stored and re-served | Needs an approved vendor; document in `SECURITY_REVIEW.md`, enable before production |
| K-04 | S3 | SLA | `refresh_sla_state` uses a simple proportional warning threshold, not the remaining business minutes | A ticket between two calendar days may warn slightly early or late | Phase 5: compute remaining business minutes with a dedicated function and test around weekends |
| K-05 | S3 | SLA | Moving a ticket between priorities does not reschedule its SLA | A downgrade keeps the original due dates | Phase 5: explicit, audited reschedule on priority change |
| K-06 | S3 | SLA | No escalation-routing table | Escalation raises `escalation_level` and notifies the leader, but there is no per-team escalation matrix | Phase 5 |
| K-07 | S3 | Ops | `pg_cron` scheduling is designed but not yet wired (no cron endpoints) | SLA warnings/breaches are not generated automatically | Phase 5 |
| K-08 | S3 | Data | `ticket_custom_values` has no server-side validator yet | Values are stored but not validated against `custom_fields.validation` | Phase 3, when the creation form exists |
| K-09 | S3 | Search | Arabic full-text search uses the `simple` configuration | No stemming; recall is lower than a language-aware index | Phase 6: evaluate an Arabic stemmer; trigram fallback is already indexed |
| K-10 | S4 | Docs | The ERD is Mermaid source inside `DATABASE_SCHEMA.md` | Not viewable without a renderer | Acceptable; GitHub renders Mermaid natively |
| K-11 | S4 | i18n | Email templates are code, not database rows | Admins cannot edit wording | Phase 6, if required |
| K-12 | S3 | Testing | Browser coverage is Chromium only | Firefox/Safari-specific defects would be missed | Phase 8: add WebKit and Firefox projects to the Playwright matrix |
| K-13 | S4 | UI | No dark-mode toggle; follows the OS preference | Users cannot force a theme | Phase 4, low priority |
| K-14 | S3 | Users | Staff invitation requires `SUPABASE_SERVICE_ROLE_KEY` | Without it the invite button returns a configuration error; the rest of the app is unaffected | Documented in GOING_LIVE §5.3; the key is required in every deployed environment |
| K-15 | S3 | Users | An invited staff member's `is_staff` flag is set by the role RPC, but `profiles.is_staff` is only recalculated when the role is truly granted | If the invite succeeds and the role grant fails, the account exists with no role and no access | The action returns an error and logs `user.invite_role_failed`; an administrator can grant the role from the directory |
| K-16 | S3 | Users | No UI yet for promoting an existing customer to staff except granting a role directly | The database refuses to combine roles, so the customer role must be removed first, which loses their ticket history access | Phase 3 will add an explicit "convert to staff" flow, or the decision to keep accounts separate is confirmed |

## Accepted by design (not defects)

| ID | Topic | Why it is acceptable |
|---|---|---|
| A-01 | Staff cannot create tickets | Required by the brief (§1) and decision D-09 |
| A-02 | Organization-wide ticket sharing is off | Decision D-04; the schema supports enabling it per organization later |
| A-03 | No email/WhatsApp/telephony ingestion | Explicitly out of scope for the first release (§10) |
| A-04 | Reference numbers are never reused | Deliberate: a gap is preferable to a duplicate |
| A-05 | SLA policy changes do not rewrite open tickets | Fairness and auditability (§7 of SLA_CONFIGURATION) |

## Resolved during Phase 1

| ID | Issue | Resolution |
|---|---|---|
| R-01 | Category codes with a dot (`technical.bug`) violated the CHECK pattern | Pattern widened to allow one `.` segment |
| R-02 | `create_ticket` failed with "column reference id is ambiguous" | OUT parameters renamed `ticket_id` / `ticket_reference` |
| R-03 | Customer could not read their own ticket through the RPC path | `create_ticket` and `add_message` corrected; covered by DB-16 and DB-08 |
| R-04 | `add_message` was missing its `language plpgsql` clause | Added |
| R-05 | Static prerender failed without Supabase env vars | Session-dependent trees marked `force-dynamic`; `getSessionUser` returns null when unconfigured |
| R-06 | Duplicate sign-out action file and an unreachable `auth-actions.ts` import | Consolidated into `auth.actions.ts`; state type moved to `auth-types.ts` |
| R-07 | Callback route was shadowed by the locale middleware | `proxy.ts` skips `/api` and `/auth`; callback URLs carry `locale` |
| R-08 | ESLint config could not load `eslint-config-next` (flat-config incompatibility) | Switched to the package's native flat exports |
| R-09 | Windows locale produced a WIN1252 cluster that rejected Arabic seed data | Test cluster initialised with `--encoding=UTF8 --locale=C` |
