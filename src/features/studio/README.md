## Purpose
Own API route registration for field studio payloads, map management, known-values/component-db lookups, and studio enum-consistency flows.
This boundary coordinates studio-facing control-plane actions while delegating settings persistence and indexing review logic to explicit seams.

## Public API (The Contract)
- `src/features/studio/api/studioRoutes.js`: `registerStudioRoutes(ctx)`.
- `src/features/studio/api/studioRouteHelpers.js`: internal helper exports for enum token normalization, studio payload derivation, map preference, and suggestion application.
- No root `src/features/studio/index.js` exists yet; route registration is the primary boundary contract.

## Dependencies
- Allowed: `src/features/settings-authority/index.js`, `src/features/indexing/index.js`, `src/api/events/dataChangeContract.js`, and `src/field-rules/consumerGate.js`.
- Forbidden: deep imports into other feature internals beyond those explicit contracts.

## Domain Invariants
- Studio enum consistency requires a concrete category and returns structured no-op responses when review is disabled or there is no pending work.
- Saved studio maps must validate before persistence, and empty overwrites are rejected unless explicitly forced.
- Preferred studio-map resolution favors valid and populated payloads over weaker alternatives.
- Mutations that change studio-derived artifacts invalidate caches and emit data-change events for downstream consumers.
