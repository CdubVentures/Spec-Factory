## Purpose

Generic infrastructure for LLM-driven finder modules. Any module that discovers field values via LLM calls, validates them through the field rules engine, and persists run history can reuse this infrastructure instead of building from scratch.

## Public API (The Contract)

### `finderModuleRegistry.js` — SSOT for all finder modules
- `FINDER_MODULES` — frozen array of module manifest objects
- `FINDER_MODULE_MAP` — O(1) lookup by module ID
- `FINDER_MODULE_BY_PREFIX` — O(1) lookup by route prefix
- `deriveFinderPaths(id)` — pure helper returning `{ featurePath, routeFile, registrarExport, panelFeaturePath, panelExport, schemaModule, adapterModule }` derived from the module id (Phase 6). Replaces 5 previously-authored registry string fields. Consumed by `finderRouteWiring.js` + 3 codegen scripts (`generateLlmPhaseRegistry.js`, `generateFinderTypes.js`, `generateFinderHooks.js`); new finders declare only `id` and inherit the full wiring contract.

### `editorialSchemas.js` — shared Zod schemas for finder GET responses
- `publisherCandidateRefSchema` — shape of `field_candidates` rows merged into GET responses (candidate_id, source_id, source_type, model, value, confidence, status, submitted_at, metadata?)
- `rejectionMetadataSchema` — `{reason_code, detail?}` for candidates blocked by the publisher gate or validation layer
- `evidenceRefSchema` / `evidenceRefsSchema` — re-exported from `evidencePromptFragment.js` for codegen import consolidation
- **Registry hook**: finders declare `getResponseSchemaExport: '<schemaName>'` in their `FINDER_MODULES` entry to opt into `generateFinderTypes.js` + `generateFinderHooks.js` codegen. Absence of this field = codegen skips (CEF/PIF keep hand-written types + queries due to their bespoke mutation surfaces).

### `createScalarFinderSchema.js` — LLM response Zod factory for scalar finders
- `createScalarFinderSchema({ valueKey, valueType, valueRegex? })` — returns a Zod object carrying `[valueKey]`, `confidence` (0-100 int), `unknown_reason`, `evidence_refs`, `discovery_log`. `valueType` ∈ `'date' | 'string' | 'int'`; optional `valueRegex` refines the value (still accepting `'unk'`). Consumed by RDF via `releaseDateSchema.js`; future scalar finders (sku, pricing, msrp, discontinued, upc) call this directly.

### `createScalarFinderEditorialSchemas.js` — editorial GET schemas factory
- `createScalarFinderEditorialSchemas({ llmResponseSchema })` — returns `{ candidateSchema, runSchema, getResponseSchema }`. `candidateSchema` carries variant identity + `value` + `sources` + publisher enrichment + optional rejection metadata. `runSchema` wraps with model/timing + extended response envelope (adds `variant_id`/`variant_key`/`variant_label`/optional `loop_id`). `getResponseSchema` is the full GET payload (`candidates` + `runs` + `published_value`/`published_confidence`). Drives `types.generated.ts` codegen.

### `createScalarFinderStore.js` — JSON store factory for scalar finders
- `createScalarFinderStore({ filePrefix, strategy? })` — thin wrapper over `createFinderJsonStore`. `strategy` defaults to `'latestWinsPerVariant'`: for each `variant_id` (falling back to `variant_key`), the newest non-rejected run's candidate replaces any older one. Other variants preserved. Returns the full store API (`read/write/merge/deleteRun/deleteRuns/deleteAll/recalculateFromRuns`).

### `registerScalarFinder.js` — top-level scalar finder wiring factory
- `registerScalarFinder({ finderName, fieldKey, valueKey, sourceType, phase, logPrefix, createCallLlm, buildPrompt, store, extractCandidate?, satisfactionPredicate?, buildPublisherMetadata?, buildUserMessage?, defaultStaggerMs? })` — consumes declarative registry fields + bespoke prompt/caller pair, wires `createVariantScalarFieldProducer` with sensible defaults. Returns `{ runOnce, runLoop }`. **No default `logPrefix`** — avoids collision risk (`pricing` → `'pri'`, etc.); every registry entry declares it explicitly. Default `extractCandidate` trims value, clamps confidence to finite number, treats empty string or case-insensitive `'unk'` as unknown. Default `satisfactionPredicate` stops on definitive unknown (unknown_reason present AND empty value) OR publisher `status === 'published'`.
- Also exports `_defaultExtractCandidate(valueKey)` + `_defaultSatisfactionPredicate` as unit-test seams locking the default behavior.

### `scalarFinderSqlHistory.js` - SQL-first scalar finder history
- `readScalarFinderRunsSqlFirst({ finderStore, readRuns, productId, productRoot })` - returns SQL run rows when SQL history exists; falls back to JSON only for unseeded/rebuild compatibility.
- `persistScalarFinderRunSqlFirst({ finderStore, productId, productRoot, category, run, ranAt, readRuns, writeRuns, recalculateFromRuns, mergeDiscovery })` - inserts the SQL run and summary first, then mirrors JSON. Falls back to legacy JSON-first merge only when the SQL store lacks run-history methods.

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
  - **Runtime source**: when SQL summary/runs exist, cleanup derives from SQL, updates SQL rows/summary first, then mirrors `release_date.json` / `sku.json`. JSON is fallback only when SQL history is absent.
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
- Scalar-finder extension (opt-in, used by RDF + future sku / pricing / msrp / discontinued):
  - `parseVariantKey: true` — POST reads `{variant_key}` from body, forwards as `variantKey` into `runFinder` opts and op register; `product.base_model` added.
  - `loop: { orchestrator, stages? }` — absorbs `POST /:prefix/:cat/:pid/loop`. Registers op with `subType: 'loop'`, wires `onLoopProgress` → `updateLoopProgress`, emits `${routePrefix}-loop` data-change. Default stages `['Discovery','Validate','Publish']` (or Research/Writer/Validate/Publish when jsonStrict=false).

### `runPerVariant.js` — shared per-variant orchestrator
- `runPerVariant({ specDb, product, variantKey?, staggerMs?, produceForVariant, onStageAdvance?, onVariantProgress?, logger? })` — loads variants via `specDb.variants.listActive(productId)`, filters to a single variant if requested, fires staggered concurrent loop calling `produceForVariant(variant, i, ctx)` per variant. Rejects fast with `no_cef_data` / `unknown_variant`.

### `variantFieldLoop.js` — generic per-variant retry loop (the "budget loop")
- `runVariantFieldLoop({ specDb, product, variantKey?, resolveBudget, produceForVariant, satisfactionPredicate, staggerMs?, onLoopProgress?, ... })` — wraps `runPerVariant` with a per-variant retry: each variant gets up to `resolveBudget(variant)` attempts, stops early when `satisfactionPredicate(result)` is truthy. `resolveBudget` returning 0 skips the variant entirely (no `produceForVariant` call; one `onLoopProgress` event with `skipped: true`). Generates one `loop_id` per top-level call (shared across all variants + attempts). Emits `onLoopProgress({ variantKey, variantLabel, attempt, budget, satisfied, skipped, loopId })` after each attempt or once for a skipped variant. Used by RDF and every `registerScalarFinder` consumer; ready for MSRP / weight / dimensions / any simple field finder.
- Budget hygiene is the caller's responsibility — non-finite or negative values are treated as 0 (skip). `registerScalarFinder` composes `resolveBudget` from two settings: `perVariantAttemptBudget` for unresolved variants and `reRunBudget` for variants the publisher has already resolved (0 = skip on re-Loop).
- The surfaced per-variant result is the last attempt's output, augmented with `_loop: { attempts, satisfied, skipped, loopId }`.

### `loopIdGenerator.js` — stable per-loop identifier
- `generateLoopId()` — returns `loop-${Date.now()}-${6-char-rand}`. One call per `/loop` request; every run emitted by that call carries the same id in `response.loop_id` so the UI can group them.

### `finderRouteWiring.js` — dynamic route auto-wiring (for future async server boot)
- `wireFinderRoutes(deps)` — dynamically imports and wires all registered modules

### `finderOrchestrationHelpers.js` — shared orchestrator boilerplate
- `COOLDOWN_DAYS` — canonical 30-day cooldown default
- `computeCooldownUntil({ days?, now? })` — returns `{ cooldownUntil, ranAt, now }` (days=0 → no cooldown)
- `resolveModelTracking({ config, phaseKey, onModelResolved })` — returns tracking object with `actualModel`, `actualFallbackUsed`, `wrappedOnModelResolved`
- `resolveAmbiguityContext({ config, category, brand, baseModel, specDb, resolveFn, logger? })` — returns `{ familyModelCount, ambiguityLevel, siblingModels }` (non-fatal fallback; logs `identity_ambiguity_context_failed` via `logger.warn` when the resolver throws)
- `buildOrchestratorProduct({ productId, category, productRow })` — canonical `product` object for every finder orchestrator; always includes `base_model` so the ambiguity resolver can group sibling models
- `buildFinderLlmCaller({ _callLlmOverride, wrappedOnModelResolved, createCallLlm, llmDeps })` — returns callLlm function

### `productResolvedStateReader.js` — SQL-only prompt context readers
- `resolveProductComponentInventory(...)` / `resolveKeyComponentRelation(...)` — Key Finder component inventory + per-key relation pointer.
- `resolveKeyFinderRuntimeContext(...)` — returns `{ productScopedFacts, variantInventory, fieldIdentityUsage }`; product facts read only NULL-variant resolved rows and variant inventory joins active CEF variants to SKU/RDF/PIF by `variant_id`.

## Dependencies

- **Allowed**: `src/core/config/` (runtimeArtifactRoots), `src/core/events/` (dataChangeContract), `src/core/operations/` (operationsRegistry), `src/core/llm/` (streamBatcher, `prompts/` for universal fragments — `buildEvidencePromptBlock` / `buildEvidenceVerificationPromptBlock` / `buildValueConfidencePromptBlock` / `buildPreviousDiscoveryBlock` all resolve their template text from `src/core/llm/prompts/globalPromptRegistry.js`)
- **Forbidden**: Any feature folder. Features import from `core/finder/`, not the reverse.

## Domain Invariants

- **Registry is SSOT**: All finder module wiring derives from `FINDER_MODULES`. Adding a module = one entry.
- **Latest-wins semantics**: `selected` always reflects the latest non-rejected run. Rejected runs are counted but don't overwrite selected/cooldown.
- **Dual-State Architecture**: SQL is the runtime/frontend projection and should be mutated before JSON when SQL tables exist. JSON remains durable memory and the deleted-DB rebuild mirror.
- **Field Studio gate**: Modules declare `requiredFields`. If any required field is disabled in the category's `eg_toggles`, POST returns 403.
- **Per-module tables**: Each finder gets its own summary + runs tables with custom columns. Not a shared generic table — SQL queryability matters for the publisher.
- **Loop standardization for `variantFieldProducer`**: Simple field finders (one value per variant) get the budget loop for free by (1) declaring `perVariantAttemptBudget` in their `settingsSchema`, (2) exporting a `runXxxFinderLoop` that wraps `runVariantFieldLoop` with a satisfaction predicate, and (3) passing `{ parseVariantKey: true, loop: { orchestrator: runXxxFinderLoop } }` to `createFinderRouteHandler`. `runPerVariant` is domain-blind; `runVariantFieldLoop` is the only place that owns attempt counting, `loop_id` propagation, and loop-progress emission. PIF's carousel loop is intentionally separate (multi-view + satisfaction-per-view is carousel-specific) — do not retrofit PIF onto this primitive.
- **Scalar-finder template (Phase 4)**: `variantFieldProducer` modules that emit one scalar value per variant collapse to ~20 LOC using `registerScalarFinder` + `createScalarFinderStore` + `createScalarFinderSchema` + `createScalarFinderEditorialSchemas`. The feature file ships only a prompt + LLM caller; everything else is declarative registry config (`valueKey`, `valueType`, `candidateSourceType`, `logPrefix`). RDF is the reference consumer. CEF (variant generator) + PIF (multi-asset artifact producer) do not qualify — their shapes differ.
- **Scalar-finder panel (Phase 5)**: The frontend panel for any scalar finder collapses to ~25 LOC by wrapping `tools/gui-react/src/shared/ui/finder/GenericScalarFinderPanel.tsx` and passing the 3 generated React Query hooks + HIW content + optional `formatValue`. Registry declares 3 additional fields (`panelTitle`, `panelTip`, `valueLabelPlural`) which the codegen at `tools/gui-react/scripts/generateLlmPhaseRegistry.js` now emits into `finderPanelRegistry.generated.ts` (alongside `moduleType`, `phase`, `valueKey`). The generic panel reads its config via `FINDER_PANELS.find(p => p.id === finderId)`. CEF + PIF panels stay bespoke (different display surfaces).
