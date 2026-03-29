## Purpose
Own API route registration for field studio payloads, map management, known-values/component-db lookups, and studio enum-consistency flows.
This boundary coordinates studio-facing control-plane actions while delegating settings persistence and indexing review logic to explicit seams.

## Public API (The Contract)
- `src/features/studio/index.js`: `registerStudioRoutes`, `createStudioRouteContext`, 14 domain helpers from `studioRouteHelpers.js`, and schema contracts (13 Zod schemas + 6 derived key arrays) from `studioSchemas.js`.
- Consumers must import from `index.js`, not from internal `api/` paths.

## Dependencies
- Allowed: `src/features/settings-authority/index.js`, `src/features/indexing/index.js`, `src/core/events/dataChangeContract.js`, and `src/field-rules/consumerGate.js`.
- Forbidden: deep imports into other feature internals beyond those explicit contracts.

## Domain Invariants
- Studio enum consistency requires a concrete category and returns structured no-op responses when review is disabled or there is no pending work.
- Saved studio maps must validate before persistence, and empty overwrites are rejected unless explicitly forced.
- Preferred studio-map resolution favors valid and populated payloads over weaker alternatives.
- Mutations that change studio-derived artifacts invalidate caches and emit data-change events for downstream consumers.
