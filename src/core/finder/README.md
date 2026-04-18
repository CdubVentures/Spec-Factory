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
  - `updateRunJson(productId, runNumber, { selected, response })` — targeted blob update on an existing run row (preserves metadata columns). Used by the variant cascade.
  - `updateSummaryField(productId, field, value)` — single-column summary update.
  - `updateBookkeeping(productId, { latest_ran_at, run_count })` — bookkeeping-only update preserving custom columns.

### `variantCleanup.js` — variant-delete cascade for `variantFieldProducer` modules
- `stripVariantFromFieldProducerHistory({ specDb, productId, variantId, variantKey, module, productRoot? })` — strips one module's per-variant history. Called by `color-edition/variantLifecycle.deleteVariant` for every `moduleClass === 'variantFieldProducer'` entry in `FINDER_MODULES`. Returns `{ changed, runsTouched, runsDeleted }`.
  - **Convention**: JSON `selected.candidates[]` aggregate + `runs[].selected.candidates[]` + `runs[].response.candidates[]`, each candidate keyed by `variant_id` / `variant_key`. SQL summary mirrors via `candidates` + `candidate_count` columns.
  - **Run identity match**: runs targeting the deleted variant via `run.variant_id` / `run.response.variant_id` / `run.selected.variant_id` (or `*_key`) are removed entirely — even when `candidates[]` is empty (failed/no-result LLM call).
  - **Candidate match**: runs with surviving variants are filtered (SQL blob rewritten via `updateRunJson`); runs whose only candidates were the deleted variant are removed entirely.
  - **Aggregate**: recomputed as latest-wins-per-variant across surviving runs.
  - **Bookkeeping**: `run_count`, `latest_ran_at`, `next_run_number` updated; `next_run_number` never reuses deleted numbers.

### `finderSqlDdl.js` — DDL generator
- `generateFinderDdl(modules)` — returns CREATE TABLE + INDEX statements from manifests

### `finderRoutes.js` — generic route handler with operations lifecycle
- `createFinderRouteHandler(config)` — returns curried `(ctx) => handler` for 5 endpoints:
  - GET list, GET single, POST trigger, DELETE run, DELETE all
  - POST includes: operations register → stream batcher → stage/model callbacks → complete/fail → data-change emit
  - POST includes: `requiredFields` field studio gate check
- `createVariantFieldLoopHandler(config)` — returns curried `(ctx) => handler` for `POST /:prefix/:cat/:pid/loop`. Registers op with `subType: 'loop'`, wires `onLoopProgress` → `updateLoopProgress`, runs the module's loop orchestrator, emits `${routePrefix}-loop` data-change on completion. Opt-in: each `variantFieldProducer` route file calls this once.

### `runPerVariant.js` — shared per-variant orchestrator
- `runPerVariant({ specDb, product, variantKey?, staggerMs?, produceForVariant, onStageAdvance?, onVariantProgress?, logger? })` — loads variants via `specDb.variants.listActive(productId)`, filters to a single variant if requested, fires staggered concurrent loop calling `produceForVariant(variant, i, ctx)` per variant. Rejects fast with `no_cef_data` / `unknown_variant`.

### `variantFieldLoop.js` — generic per-variant retry loop (the "budget loop")
- `runVariantFieldLoop({ specDb, product, variantKey?, budget, produceForVariant, satisfactionPredicate, staggerMs?, onLoopProgress?, ... })` — wraps `runPerVariant` with a per-variant retry: each variant gets up to `budget` attempts, stops early when `satisfactionPredicate(result)` is truthy. Generates one `loop_id` per top-level call (shared across all variants + attempts). Emits `onLoopProgress({ variantKey, variantLabel, attempt, budget, satisfied, loopId })` after each attempt. Used by RDF; ready for MSRP / weight / dimensions / any simple field finder.
- `budget` is clamped to a minimum of 1 (defensive — category JSON values arrive as strings).
- The surfaced per-variant result is the last attempt's output, augmented with `_loop: { attempts, satisfied, loopId }`.

### `loopIdGenerator.js` — stable per-loop identifier
- `generateLoopId()` — returns `loop-${Date.now()}-${6-char-rand}`. One call per `/loop` request; every run emitted by that call carries the same id in `response.loop_id` so the UI can group them.

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
- **Loop standardization for `variantFieldProducer`**: Simple field finders (one value per variant) get the budget loop for free by (1) declaring `perVariantAttemptBudget` in their `settingsSchema`, (2) exporting a `runXxxFinderLoop` that wraps `runVariantFieldLoop` with a satisfaction predicate, and (3) registering one `createVariantFieldLoopHandler` call in their routes file. `runPerVariant` is domain-blind; `runVariantFieldLoop` is the only place that owns attempt counting, `loop_id` propagation, and loop-progress emission. PIF's carousel loop is intentionally separate (multi-view + satisfaction-per-view is carousel-specific) — do not retrofit PIF onto this primitive.
