## Purpose

Generic infrastructure for LLM-driven finder modules. Any module that discovers field values via LLM calls, validates them through the field rules engine, and persists run history can reuse this infrastructure instead of building from scratch.

## Public API (The Contract)

### `finderModuleRegistry.js` — SSOT for all finder modules
- `FINDER_MODULES` — frozen array of module manifest objects
- `FINDER_MODULE_MAP` — O(1) lookup by module ID
- `FINDER_MODULE_BY_PREFIX` — O(1) lookup by route prefix

### `finderSettingsSchema.js` — typed per-category settings contract
- `finderSettingsEntrySchema` — zod discriminated union over setting types (`bool`, `int`, `float`, `string`, `enum`)
- `finderSettingsSchema` — zod array schema for a module's full settings list
- `validateFinderSettingsSchema(schema)` — parse + validate; throws on shape errors
- `deriveFinderSettingsDefaults(schema)` — produce a `{ key: stringDefault }` map for DDL/SQL consumers (bools → `'true'/'false'`, numbers → `String(n)`, strings/enums verbatim)

### `finderRouteContext.js` — generic shared-infra factory
- `createFinderRouteContext(options)` — returns the shared HTTP/DB/broadcast plumbing required by every finder route (`jsonRes`, `readJsonBody`, `config`, `appDb`, `getSpecDb`, `broadcastWs`, `logger`). Throws on missing required options. Per-finder orchestrator functions are imported locally by the thin route wrapper that uses them — not bundled into the context.

### `finderJsonStore.js` — per-product JSON persistence
- `createFinderJsonStore({ filePrefix, emptySelected })` — factory returning:
  - `read({ productId, productRoot })` — read JSON, returns parsed object or null
  - `write({ productId, productRoot, data })` — write JSON atomically
  - `recalculateFromRuns(runs, productId, category)` — pure: derive state from runs
  - `merge({ productId, productRoot, newDiscovery, run })` — append run, latest-wins
  - `deleteRun({ productId, productRoot, runNumber })` — delete + recalculate
  - `deleteAll({ productId, productRoot })` — remove file

### `finderSqlStore.js` — generic SQL store (summary + runs tables)
- `createFinderSqlStore({ db, category, module })` — factory returning:
  - `upsert(row)`, `get(productId)`, `listByCategory(category)`, `remove(productId)`
  - `insertRun(row)`, `listRuns(productId)`, `getLatestRun(productId)`
  - `removeRun(productId, runNumber)`, `removeAllRuns(productId)`

### `finderSqlDdl.js` — DDL generator
- `generateFinderDdl(modules)` — returns CREATE TABLE + INDEX statements from manifests

### `finderRoutes.js` — generic route handler with operations lifecycle
- `createFinderRouteHandler(config)` — returns curried `(ctx) => handler` for 5 endpoints:
  - GET list, GET single, POST trigger, DELETE run, DELETE all
  - POST includes: operations register → stream batcher → stage/model callbacks → complete/fail → data-change emit
  - POST includes: `requiredFields` field studio gate check

### `finderRouteWiring.js` — dynamic route auto-wiring (for future async server boot)
- `wireFinderRoutes(deps)` — dynamically imports and wires all registered modules

### `finderOrchestrationHelpers.js` — shared orchestrator boilerplate
- `COOLDOWN_DAYS` — canonical 30-day cooldown default
- `computeCooldownUntil({ days?, now? })` — returns `{ cooldownUntil, ranAt, now }` (days=0 → no cooldown)
- `resolveModelTracking({ config, phaseKey, onModelResolved })` — returns tracking object with `actualModel`, `actualFallbackUsed`, `wrappedOnModelResolved`
- `resolveAmbiguityContext({ config, category, brand, baseModel, specDb, resolveFn })` — returns `{ familyModelCount, ambiguityLevel }` (non-fatal fallback)
- `buildFinderLlmCaller({ _callLlmOverride, wrappedOnModelResolved, createCallLlm, llmDeps })` — returns callLlm function

## Dependencies

- **Allowed**: `src/core/config/` (runtimeArtifactRoots), `src/core/events/` (dataChangeContract), `src/core/operations/` (operationsRegistry), `src/core/llm/` (streamBatcher)
- **Forbidden**: Any feature folder. Features import from `core/finder/`, not the reverse.

## Domain Invariants

- **Registry is SSOT**: All finder module wiring derives from `FINDER_MODULES`. Adding a module = one entry.
- **Latest-wins semantics**: `selected` always reflects the latest non-rejected run. Rejected runs are counted but don't overwrite selected/cooldown.
- **Dual-State Architecture**: JSON is durable memory (write-first). SQL is frontend projection (rebuildable from JSON). Both summary and runs tables follow this contract.
- **Field Studio gate**: Modules declare `requiredFields`. If any required field is disabled in the category's `eg_toggles`, POST returns 403.
- **Per-module tables**: Each finder gets its own summary + runs tables with custom columns. Not a shared generic table — SQL queryability matters for the publisher.
