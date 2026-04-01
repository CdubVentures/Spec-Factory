## Purpose
Own API route registration for field studio payloads, map management, known-values/component-db lookups, and studio enum-consistency flows.
This boundary coordinates studio-facing control-plane actions while delegating settings persistence and indexing review logic to explicit seams.

## Public API (The Contract)
- `src/features/studio/index.js`: `registerStudioRoutes`, `createStudioRouteContext`, 14 domain helpers from `studioRouteHelpers.js`, schema contracts (13 Zod schemas + 6 derived key arrays) from `studioSchemas.js`, and EG preset exports (`EG_PRESET_REGISTRY`, `EG_LOCKED_KEYS`, `EG_EDITABLE_PATHS`, `EG_DEFAULT_TOGGLES`, `EG_CANONICAL_COLORS`, `buildEgColorFieldRule`, `buildEgEditionFieldRule`, `buildAllEgDefaults`, `getEgPresetForKey`, `preserveEgEditablePaths`, `sanitizeEgLockedOverrides`, `isEgLockedField`, `isEgEditablePath`, `resolveEgLockedKeys`) from `egPresets.js`.
- Consumers must import from `index.js`, not from internal `api/` paths.

## Dependencies
- Allowed: `src/features/settings-authority/index.js`, `src/features/indexing/index.js`, `src/core/events/dataChangeContract.js`, and `src/field-rules/consumerGate.js`.
- Forbidden: deep imports into other feature internals beyond those explicit contracts.

## Domain Invariants
- Studio enum consistency requires a concrete category and returns structured no-op responses when review is disabled or there is no pending work.
- Saved studio maps must validate before persistence, and empty overwrites are rejected unless explicitly forced.
- Preferred studio-map resolution favors valid and populated payloads over weaker alternatives.
- Mutations that change studio-derived artifacts invalidate caches and emit data-change events for downstream consumers.
- EG-locked fields (registry-driven via `EG_PRESET_REGISTRY`) are always present, non-deletable, with locked contract/parse/enum settings. Only `EG_EDITABLE_PATHS` are user-editable. O(1): add a builder + registry entry in `egPresets.js` to add a new locked default. Propagation: seeded at category creation, injected at compile time, backfilled at studio payload load, sanitized on save.
