# Billing

> **Purpose:** Document the verified cost artifact surfaces exposed after indexing activity completes.
> **Prerequisites:** [indexing-lab.md](./indexing-lab.md), [../03-architecture/data-model.md](../03-architecture/data-model.md)
> **Last validated:** 2026-04-13

## Entry Points

| Surface | Path | Role |
|--------|------|------|
| Billing page | `tools/gui-react/src/pages/billing/BillingPage.tsx` | dashboard orchestrator (KPI, charts, filters, call log) |
| Billing feature | `tools/gui-react/src/features/billing/` | registry, transforms, queries, components |
| Global billing API | `src/features/indexing/api/queueBillingLearningRoutes.js` | 6 global endpoints + legacy per-category |
| Billing ledger | `src/billing/costLedger.js` | dual-write: SQL (appDb) + JSONL |
| Billing store | `src/db/appDb.js` | `billing_entries` table in global `app.sqlite` |

## Dependencies

- `src/db/appDb.js` (global `app.sqlite` — billing_entries table)
- `src/billing/costLedger.js` (dual-write entry point)
- `.workspace/global/billing/ledger/{month}.jsonl` (durable memory / rebuild source)
- `.workspace/global/billing/monthly/{month}.txt` (digest artifacts)

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/billing/global/summary?month=` | KPI totals + model/category counts |
| GET | `/api/v1/billing/global/daily?months=1` | Daily time-series for charts |
| GET | `/api/v1/billing/global/by-model?month=` | Cost grouped by provider:model |
| GET | `/api/v1/billing/global/by-reason?month=` | Cost grouped by call type (reason) |
| GET | `/api/v1/billing/global/by-category?month=` | Cost grouped by product category |
| GET | `/api/v1/billing/global/entries?limit=&offset=&category=&model=&reason=` | Paginated raw entries |
| GET | `/api/v1/billing/{category}/monthly` | Per-category rollup (legacy) |

## Flow

1. LLM calls complete and invoke `onUsage` callback.
2. `costLedger.appendCostLedgerEntry({ config, appDb, entry })` dual-writes:
   - SQL: `appDb.insertBillingEntry()` into global `app.sqlite`
   - JSONL: append to `.workspace/global/billing/ledger/{month}.jsonl`
3. Frontend queries `/api/v1/billing/global/*` endpoints.
4. Route handlers call `appDb.getBillingRollup()`, `appDb.getGlobalDaily()`, or `appDb.getGlobalEntries()`.
5. GUI renders KPIs, charts, and data table.

## Rebuild Contract

If `app.sqlite` is deleted, `seedBillingFromJsonl()` in `appDbSeed.js` restores `billing_entries` from JSONL on next bootstrap.

## Side Effects

- Runtime LLM calls write to both `app.sqlite` and JSONL (dual-state mandate).
- The GUI/API read path is read-only.

## Error Paths

- Missing appDb: route returns `503 { error: 'billing not available' }`.
- Empty data: route returns `{ totals: {} }` or empty arrays.

## State Transitions

| Surface | Transition |
|---------|------------|
| Billing totals | zero/absent -> populated month summary |

## Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '20px', 'actorWidth': 250, 'actorMargin': 200, 'boxMargin': 20 }}}%%
sequenceDiagram
  autonumber
  box Client
    participant BillingPage as BillingPage<br/>(tools/gui-react/src/pages/billing/BillingPage.tsx)
  end
  box Server
    participant Routes as queueBillingLearningRoutes<br/>(src/features/indexing/api/queueBillingLearningRoutes.js)
  end
  box Storage
    participant AppDb as AppDb<br/>(src/db/appDb.js — app.sqlite)
    participant JSONL as JSONL Ledger<br/>(.workspace/global/billing/ledger/)
  end
  BillingPage->>Routes: GET /api/v1/billing/global/summary
  Routes->>AppDb: getBillingRollup(month)
  AppDb-->>Routes: { totals, by_day, by_model, by_reason, by_category }
  Routes-->>BillingPage: { month, totals, models_used, categories_used }
```

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/features/indexing/api/queueBillingLearningRoutes.js` | 6 global + 1 legacy billing endpoints |
| source | `src/billing/costLedger.js` | dual-write (SQL + JSONL) |
| source | `src/db/appDb.js` | billing methods on global AppDb |
| source | `src/db/appDbSchema.js` | `billing_entries` table DDL |
| source | `tools/gui-react/src/pages/billing/BillingPage.tsx` | GUI usage of billing endpoint |

## Related Documents

- [Indexing Lab](./indexing-lab.md) - Billing data is produced by indexing runs.
- [Data Model](../03-architecture/data-model.md) - Lists the underlying billing tables.
