# Field Rules Consumer Audit — Full Badge Map

> **Date:** 2026-04-06
> **Updated:** 2026-04-06 (post Phase 1-5 implementation)
> **Scope:** Every source in ~80k LOC that reads field rule properties at runtime.
> **Method:** Manual grep + full call-path tracing through production wiring.

---

## Live Consumer Badges — Current Status

| Consumer | Paths actually read | Source | CQRS? |
|---|---|---|---|
| **idx.pipeline** | 10 keys: `required_level`, `difficulty`, `availability`, `display_name`, `group`, `aliases`, `search_hints.{3}`, `ui.{2}` | DB `field_studio_map.compiled_rules` | YES |
| **runtimeOps.prefetch** | Full field_rules projected for indexlab | DB `field_studio_map.compiled_rules` via `specDb.getCompiledRules()` | YES |
| **engine.*** | `contract.range`, `contract.list_rules`, `parse.*`, `enum.match.*`, `component.match.*` | DB `field_studio_map.compiled_rules` via `specDb.getCompiledRules()` (when `options.specDb` provided) | YES (production) |
| **rev.layout, rev.flag** | 8 paths: `contract.type/shape/unit`, `required_level`, `component.type`, `enum.source`, `evidence.*` | DB `field_studio_map.compiled_rules` via sessionCache | YES |
| **rev.component_field_meta** | `variance_policy`, `constraints`, `enum.policy`, `enum.source` | DB `component_values` | YES |
| **rev.gridData** | `fieldRules`, `fieldOrder` | JSON via `loadCategoryConfig()` in `reviewGridData.js:72` | NO — Phase 6 |
| **rev.componentHandlers** | `fieldRules` for 3 component review routes | JSON via `loadCategoryConfig()` in `componentReviewHandlers.js:93,113,133` | NO — Phase 6 |
| **rev.componentSpecDb** | `component_db/*.json` reference baseline | Direct JSON reads in `componentReviewSpecDb.js:62` | NO — Phase 6 |
| **studio.payload** | `uiFieldCatalog` from `loadCategoryConfig()` | JSON via `studioRoutes.js:74` | NO — Phase 6 |
| **studio.enumConsistency** | `known_values.json` | Direct JSON read in `studioRoutes.js:243` | NO — Phase 6 |
| **rev.seed** | 4 paths: `contract.shape`, `enum.policy`, `enum.source`, `component.type` | JSON via `loadFieldRules()` at boot (boot-order constraint) | NO — boot-time only |
| **llm.color_guidance** | `ai_assist.reasoning_note` (EG only) | Hard-coded `egPresets.js` | N/A |
| **testMode.run** | Full `field_rules`, `known_values`, all `component_db/*.json` | Direct JSON reads (`_generated/`) — also `runTestProduct` is a stub | NO |
| **testMode.contract** | Full compiled rules via `analyzeContract()` | Direct JSON reads (`_generated/`) | NO |

---

## Completed Phases

### Phase 1 — Consolidate to `field_studio_map` (DONE)

- Added `compiled_rules` and `boot_config` columns to `field_studio_map`
- Added ALTER TABLE migration in `specDbMigrations.js` for existing DBs
- `loadPipelineBootConfig.js` reads from `field_studio_map.compiled_rules` + `boot_config`
- Killed `pipeline_category_cache` table, `pipelineCategoryCacheStore.js`, `pipelineCategoryCacheReseed.js`
- Killed `buildIndexlabRuntimeCategoryConfig` (dead after reseed removal)
- Reseed populates `compiled_rules` with full engine artifacts (fields, known_values, parse_templates, cross_validation_rules, ui_field_catalog, component_dbs, key_migrations, compiled_at)

### Phase 2 — runtimeOps.prefetch reads from DB (DONE)

- `loadRuntimeFieldRulesPayload()` reads from `specDb.getCompiledRules()` instead of JSON
- Both call sites in `runtimeOpsRoutes.js` pass `specDb` via `getSpecDbReady`

### Phase 3 — Engine reads from DB (DONE)

- `FieldRulesEngine.create()` accepts `options.specDb` — reads from DB when provided, falls back to JSON for tests/CLI
- Exported normalization functions from `loader.js` for reuse
- `overrideWorkflow.js` and `qaJudge.js` pass `specDb` to engine creation

### Phase 4 — sessionCache reads from DB (DONE)

- `sessionCache.loadAndMerge()` reads compiled fields, field_order, key_migrations, compiled_at from `specDb.getCompiledRules()`
- Removed `loadCategoryConfig` dependency from sessionCache factory
- Removed JSON reads for manifest and key_migrations

### Phase 5 — Dead code cleanup (DONE)

- Deleted dead `block_publish_when_unk` branch in `needsetEngine.js`
- Deleted dead `getPublishGate()` method from `fieldRulesEngine.js`
- Deleted 16 dead accessor functions from `ruleAccessors.js` (file: 220 → 62 lines)
- Updated `engine/README.md` public API list

---

## Remaining Work

### testMode.run — `runTestProduct` is a stub

**File:** `src/tests/testRunner.js`

`runTestProduct()` is a stub that returns hardcoded zeros (confidence: 0, coverage: 0, completeness: 0). The consensus pipeline that processed test results was removed in a prior refactor. All 21 test scenarios complete but produce empty results.

**What needs to happen:**
- Wire the validation/normalization pipeline into `runTestProduct`
- The function receives `sourceResults`, `fieldRules`, `knownValues`, `componentDBs` from `testModeRoutes.js` (lines 356-376)
- It needs to run these through `FieldRulesEngine` + `applyRuntimeFieldRules` and produce real normalized output with confidence/coverage/traffic-light scoring
- Test mode also still reads field rules from JSON (`testModeRoutes.js:324-335`) — should migrate to DB after `runTestProduct` is functional

### testMode.contract + testMode.run — JSON reads

**Files:**
- `src/app/api/routes/testModeRoutes.js` (lines 324-335) — reads `field_rules.json`, `known_values.json`, `component_db/*.json` from `_generated/`
- `src/tests/testDataProvider.js` (`analyzeContract()`) — reads 5+ JSON files from `_generated/`

Both have `getSpecDbReady` available. Can migrate to DB after `runTestProduct` is functional.

### rev.seed — boot-order constraint

`seedSpecDb()` receives `fieldRules` from `specDbSyncService.js` which loads via `loadFieldRules()` (JSON). The seed runs during boot initialization before `compiled_rules` is populated. Cannot migrate without restructuring boot order.

### Phase 6 — Remaining `loadCategoryConfig()` bypasses (5 surfaces)

Post-implementation audit found 5 live production surfaces still reading from JSON via `loadCategoryConfig()` or direct `_generated/` file reads instead of `field_studio_map.compiled_rules`. All have `specDb` access available.

| # | Severity | File | Line(s) | What it reads | Fix |
|---|----------|------|---------|---------------|-----|
| 1 | High | `src/features/review/domain/reviewGridData.js` | 72 | `loadCategoryConfig()` → `fieldRules`, `fieldOrder`. Feeds review layout/product/candidates routes. | Read from `specDb.getCompiledRules()` or sessionCache |
| 2 | High | `src/features/review/api/componentReviewHandlers.js` | 93, 113, 133 | `loadCategoryConfig()` → `fieldRules` for 3 component review routes (layout, components, enums) | Read from `specDb.getCompiledRules()` |
| 3 | High | `src/features/review/domain/componentReviewSpecDb.js` | 62 | Direct read of `_generated/component_db/*.json` for reference baseline | Read from `compiled_rules.component_dbs` |
| 4 | Medium | `src/features/studio/api/studioRoutes.js` | 74 | `loadCategoryConfig()` → `uiFieldCatalog` for studio payload | Read from `compiled_rules.ui_field_catalog` |
| 5 | Medium | `src/features/studio/api/studioRoutes.js` | 243 | Direct read of `_generated/known_values.json` for enum-consistency | Read from `compiled_rules.known_values` or DB enum tables |

**Shared root cause:** `src/categories/loader.js` (`loadCategoryConfig()`) is still a file-backed loader for `_generated/` artifacts. These 5 routes call it directly rather than going through sessionCache or `specDb.getCompiledRules()`.

**Route context wiring:** All 5 surfaces have `getSpecDb` or `getSpecDbReady` available in their route context:
- `reviewRouteContext.js:25` passes `loadCategoryConfig` and `sessionCache` to review handlers
- `studioRouteContext.js:14` passes `loadCategoryConfig` and `getSpecDb` to studio routes
- `componentReviewHandlers.js:70` receives `loadCategoryConfig` from route context

---

## SSOT References

- **The one table:** `field_studio_map` — `map_json` (edits) + `compiled_rules` (full compiled output) + `boot_config` (pipeline boot data)
- **Consumer gate SSOT:** `src/field-rules/consumerGate.js` — `FIELD_SYSTEM_MAP` + `_SEED_REVIEW_MAP`
- **IDX badge SSOT:** `src/field-rules/idxBadgeRegistry.js` — `IDX_FIELD_PATHS`
- **Engine loader:** `src/field-rules/loader.js:381` — `loadFieldRules()` (JSON fallback for tests/CLI/boot)
- **Rule accessors:** `src/engine/ruleAccessors.js` — 8 live: `ruleRequiredLevel`, `ruleAvailability`, `ruleDifficulty`, `ruleEffort`, `ruleType`, `ruleShape`, `ruleUnit`, `ruleEvidenceRequired`
