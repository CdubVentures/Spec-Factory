# Execution Dispatch Contract

## Purpose

Documents that `executeSearchQueries()` receives an identical interface regardless of whether queries come from Schema 4 handoff (new path) or the old 7-layer profile chain (fallback).

## Interface

```
executeSearchQueries({
  queries: string[],              // query strings to execute
  selectedQueryRowMap: Map,       // lowercase(query) -> row metadata
  profileQueryRowMap: Map,        // profile-level query metadata
  executionQueryLimit: number,    // max queries to execute
  queryLimit: number,             // planner-level query cap
  ...config, storage, logger, etc.
})
```

## Path Selection

| Condition | Path | Query Source |
|-----------|------|-------------|
| `searchPlanHandoff?.queries?.length > 0` AND guard passes | Schema 4 | `convertHandoffToExecutionPlan()` |
| Handoff null/empty | Old path | `buildSearchProfile()` + 7-layer chain |
| Guard rejects ALL Schema 4 queries | Old path (fallback) | `buildSearchProfile()` + 7-layer chain |

## Guard Safety Net

Schema 4 queries pass through `enforceIdentityQueryGuard()` before execution. This prevents off-brand or off-model queries from consuming search quota. If the guard rejects ALL queries, the system falls back to the old path with a warning log (`schema4_guard_rejected_all`).

## Key Invariant

The downstream URL triage, domain classification, and candidate admission pipeline is completely unaware of which path generated the queries. Both paths produce identical `rawResults` from SearXNG.
