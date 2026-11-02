# MIGRATION READINESS

Last updated: 2026-10-31 · **Phase 9 — not started**

The .NET / Angular / SQL Server rebuild is out of scope for this project. This document records what
has been prepared so far and what will be produced in Phase 9. It does not describe any .NET code,
because none exists.

---

## 1. Target stack (approved, not implemented)

- Frontend: Angular, TypeScript, Angular Material
- Backend: ASP.NET Core Web API on .NET 10 LTS, C#, Entity Framework Core
- Database: Microsoft SQL Server
- Architecture: modular monolith, mirroring the module boundaries below

## 2. What is already portable

| Asset | Location | Why it helps |
|---|---|---|
| Pure domain rules | `src/modules/tickets/domain/transitions.ts`, `src/modules/identity/domain/{permissions,scope}.ts` | No framework imports (enforced by ESLint); translates to C# classes directly |
| Permission catalogue | `src/modules/identity/domain/permissions.ts` + seed | Same codes, same role mapping |
| Business SQL | `supabase/migrations/0008_rpcs.sql`, `app.add_business_minutes` | Specifies each operation's rules and ordering precisely |
| Schema | `supabase/migrations/0001`…`0006` | Normalised, UUID keys, explicit FKs, enums |
| Data dictionary | `docs/DATA_DICTIONARY.md` | Enumerations and column rules in prose |
| API contracts | `docs/API_DOCUMENTATION.md` | Inputs, validation, effects and error mapping per operation |
| Test baseline | `tests/unit`, `scripts/db-smoke.mjs`, `tests/e2e` | Behavioural fixtures the new implementation must also satisfy |

## 3. Type mapping (orientation)

| PostgreSQL | SQL Server |
|---|---|
| `uuid` | `uniqueidentifier` |
| `citext` | `nvarchar(320)` + case-insensitive collation + unique index |
| native enum | lookup table + FK (`DATA_DICTIONARY.md` lists every value) |
| `timestamptz` | `datetimeoffset(3)` |
| `jsonb` | `nvarchar(max)` + `CHECK (ISJSON(...))` |
| `tsvector` + GIN | SQL Server full-text index (Arabic supported) |
| `bigint generated always as identity` | `bigint IDENTITY` |
| RLS | application authorization + row-level security predicates where licensed |
| `security definer` RPC | EF Core transactional service or stored procedure |
| `pg_cron` + `pg_net` | Windows Service / Hangfire / Azure Function on a timer |

## 4. Phase 9 deliverables (not yet written)

1. `MIGRATION_READINESS.md` expanded into a full mapping: table by table, column by column.
2. Business-rule catalogue: every rule, where it is enforced, and its test.
3. API inventory exported from code, with request/response schemas.
4. Test-case baseline: the executed suites in a form the new team can re-run.
5. Data migration plan: ticket references, attachments (blob storage), users (ASP.NET Identity).
6. Cutover plan and reconciliation queries.

## 5. Constraints carried forward

- Reference format `CTS-YYYY-NNNNNN` and its non-reuse rule.
- Resolution and closure are distinct stages; the status matrix is fixed until changed deliberately.
- SLA due dates are frozen per ticket; policy edits affect new tickets only.
- Internal notes are a message `visibility`, not a separate table — the new schema should preserve
  the same enforcement guarantees (policy/RLS equivalent).
- The five roles and 50 permission codes are the contract; renaming them breaks reports and training.