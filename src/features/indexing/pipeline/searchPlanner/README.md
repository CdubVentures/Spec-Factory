# Pipeline — Search Planner

## Purpose

LLM-based enhancement of query rows with tier-aware latitude. Enriches the deterministic query set from Search Profile with contextual refinements.

## Public API (The Contract)

Exports from `index.js`:

- `runSearchPlanner(ctx)` — enhances query rows via LLM with tier-aware latitude

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/features/indexing/pipeline/searchPlanner/queryPlanner.js`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- Must preserve tier metadata passthrough — tier information from upstream phases is never stripped or modified.
- Deterministic fallback on LLM failure — original query rows pass through unmodified.
- Planner context is compressed per search profile design principles.
