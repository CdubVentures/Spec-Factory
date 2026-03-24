# Pipeline — Query Journey

## Purpose

Final query selection — deduplicate, rank, guard, cap, and persist the approved query set for search execution.

## Public API (The Contract)

Exports from `index.js`:

- `runQueryJourney(ctx)` — deduplicates, ranks, caps, and finalizes the query set

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/shared/settingsAccessor.js`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- Fully deterministic — zero LLM calls.
- Emits `query_journey_completed` event upon finalization.
- Query cap respects registry settings — no hardcoded magic numbers.
- Output is the approved query set consumed by Search Execution.
