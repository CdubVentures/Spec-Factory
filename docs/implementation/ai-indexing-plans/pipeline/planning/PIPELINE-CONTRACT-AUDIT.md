# Pipeline Contract Audit — Results & Remediation Status

Audited: 2026-03-22. Against: CLAUDE.md rules (SSOT, O(1) Scaling, Contract-First, Subtractive Engineering).
P0 completed: 2026-03-22. P1 completed: 2026-03-22. P2 re-audited: 2026-03-22. P3 completed: 2026-03-22.
P4 post-audit fixes (2026-03-22): NEW-1 focusGroups immutability, N5 bucket mapping SSOT, B3+B4 confidence/docs.
P5 schema enforcement (2026-03-23): Cumulative pipeline context schema, per-stage schemas deleted, LLM adapter schemas unified to Zod, enforcement mode with registry knob, orchestrator mutation + hardcoded config fixed. Live-tested in enforce mode.
P6 re-audit (2026-03-23): Full pipeline re-audited against live code. Documentation inaccuracies fixed (event order, discoveryResult field names, Search Planner input contract, crawl config registry status). See P6 section below.
P7 host plan removal + dead settings cleanup (2026-03-23): Entire host plan concept deleted. 6 dead registry settings removed. Domain classification ordering fixed. See P7 section below.

---

## Audit Scope

18 source files across the 8-stage discovery pipeline, ~6,500 LOC. Verified every claim against live code with line numbers.

---

## P0 — SSOT Structural Fixes (COMPLETE)

All changes verified: 7,564 tests pass, 0 regressions.

### P0-1 + P0-2: Shared Constants Extraction

**Problem:** Rank constants duplicated between `needsetEngine.js` and `searchPlanningContext.js` with different names but identical values. Exhaustion thresholds duplicated the same way.

**Fix:** Created `src/shared/discoveryRankConstants.js` — single source of truth for:
- `AVAILABILITY_RANKS`, `DIFFICULTY_RANKS`, `REQUIRED_LEVEL_RANKS`, `PRIORITY_BUCKET_ORDER`
- `EXHAUSTION_MIN_ATTEMPTS`, `EXHAUSTION_MIN_EVIDENCE_CLASSES`
- `availabilityRank()`, `difficultyRank()`, `requiredLevelRank()` accessor functions

Both consumer files now import from shared. Old names (`V4_AVAILABILITY_RANKS`, `BUCKET_ORDER`, `PRIORITY_ORDER`, `EXHAUSTION_NO_VALUE_THRESHOLD`, etc.) are deleted. Re-exports preserve existing import paths.

### P0-3: Unified approvedDomain / approved_domain Naming

**Problem:** `serpSelector.js` emitted BOTH `approvedDomain` (camelCase) AND `approved_domain` (snake_case) on the same objects. `discoveryResultProcessor.js` had OR-fallback reads.

**Fix:**
- `approvedDomain` (camelCase) is the canonical in-memory form (74 occurrences, 30 files)
- `approved_domain` (snake_case) is correct only at serialization boundaries (DB, traces)
- Removed dual-assignment from `serpSelector.js` (3 locations)
- Removed OR-fallback reads from `discoveryResultProcessor.js` (4 locations)
- Same cleanup applied to `tierName` / `tier_name_guess`

### P0-4: Fixed Hidden Array Metadata Pattern

**Problem:** `buildQueryRows()` in `queryBuilder.js` stashed metadata (`_archetypeSlots`, `_coveredFieldSet`, `_hardFieldRows`) as hidden properties on the returned array.

**Fix:** `buildQueryRows()` now returns `{ rows, archetypeSlots, coveredFieldSet, hardFieldRows }`. `buildSearchProfile()` destructures the structured return. External API unchanged.

### P0-5: Extracted stableHash to Shared Utility

**Problem:** Identical DJB2 hash algorithm inlined in 3 files: `searchPlanBuilder.js`, `frontierDb.js`, `frontierSqlite.js`.

**Fix:** Created `src/shared/stableHash.js` with `stableHashString()`. All 3 files now import from shared. Existing `cryptoHelpers.js` (different return type) left untouched.

---

## P1 — Persistent Field History & Contract Boundaries (COMPLETE)

### Phase A: DB Foundation (COMPLETE)

New `field_history` table added to specDb for crash-proof field history persistence.

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS field_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  round INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  history_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, product_id, field_key)
);
```

**Store:** `src/db/stores/fieldHistoryStore.js` — `upsertFieldHistory()`, `getFieldHistories()`, `deleteFieldHistories()`

**Design decisions:**
- JSON blob column (`history_json`) for O(1) scaling — adding history fields changes the builder, not the schema
- Portable SQL (CURRENT_TIMESTAMP, TEXT, ON CONFLICT) for future PostgreSQL migration
- UPSERT semantics — one row per field per product, latest round always wins (histories are accumulative)

**Files changed:**
- `src/db/specDbSchema.js` — table DDL
- `src/db/specDbStatements.js` — prepared statements
- `src/db/stores/fieldHistoryStore.js` — NEW
- `src/db/specDb.js` — wired store + delegates

### Phase B: Write Path (COMPLETE)

Field histories persisted inside the `exportToSpecDb()` transaction at end of each round. Threaded `needSet` through:
- `createProductCompletionRuntime.js` → learning export phase context
- `learningExportPhase.js` → `exportRunArtifactsFn` call
- `exporter.js` → `exportRunArtifacts()` and `exportToSpecDb()`

Writes are atomic with product_run, item_field_state, and candidate writes.

### Phase C: Read Path (COMPLETE)

`runUntilComplete.js` now accepts optional `specDb` parameter. On startup, loads `previousFieldHistories` from `field_history` table via `specDb.getFieldHistories(productId)`. In-memory handoff stays as fast path between rounds within same process. DB read is the crash-recovery path. Existing callers pass `null` (backward compatible).

### Phase D: Fetch Completion Gate (COMPLETE)

- `fetchDrainTimeoutMs` added to settings registry (default 120s, range 10s-600s)
- `runFetchSchedulerDrain.js` wraps `scheduler.drainQueue()` with `Promise.race` timeout
- On timeout, emits `fetch_drain_timeout` event with `urls_enqueued`, `urls_processed`, `urls_skipped`, `urls_remaining`

### Phase E: Stage Zod Schemas (SUPERSEDED by P5)

Per-stage Zod schemas were added in P1 but have been **deleted in P5** (2026-03-23). They were never imported or enforced anywhere — pure dead code. Replaced by the cumulative pipeline context schema which validates the full accumulated state at each boundary.

---

## Schema Coverage (After P5)

**Architecture: Cumulative pipeline context schema** (`src/features/indexing/discovery/pipelineContextSchema.js`)

One schema grows as data flows through the pipeline. 8 progressive Zod checkpoints validated at each stage boundary in the orchestrator:

| Checkpoint | After Stage | Key Fields Validated |
|------------|-------------|---------------------|
| `seed` | Before stages | config, job, category, categoryConfig, runId |
| `afterBootstrap` | 01+02 parallel | focusGroups (typed elements), seedStatus, seedSearchPlan, brandResolution, variables, identityLock |
| `afterProfile` | 03 | searchProfileBase (typed: query_rows, identity, queries) |
| `afterPlanner` | 04 | enhancedRows |
| `afterJourney` | 05 | queries, selectedQueryRowMap, executionQueryLimit, queryLimit |
| `afterExecution` | 06 | rawResults (typed elements), searchAttempts (typed), searchJournal (typed), internalSatisfied, externalSearchReason |
| `afterResults` | 07 | discoveryResult (typed: candidates, serp_explorer, all 19 fields) |
| `final` | 08 | Same as afterResults (enqueue_summary attached via passthrough) |

**Enforcement:** Controlled by `pipelineSchemaEnforcementMode` registry setting (`off`/`warn`/`enforce`). Default: `warn`. Live-tested in `enforce` mode — zero validation failures.

**Per-stage schemas:** Deleted from all 6 `stages/*.js` files (11 schemas, 0 imports anywhere). Cumulative schema is the SSOT.

**LLM adapter schemas:** All 11 LLM response schemas converted from hand-written JSON Schema to Zod SSOT with `toJSONSchema()` conversion at call boundary. See P5 details below.

---

## Storage Architecture

| Tier | Technology | Scope |
|------|-----------|-------|
| Object Storage | S3 / Local / DualMirror | Run artifacts, exports, screenshots |
| SpecDb | SQLite (always local) | Operational state — candidates, field state, queue, reviews, **field_history** |
| FrontierDb | SQLite (always local) | Query/URL/yield tracking per product |

**PostgreSQL migration path:** All new SQL uses portable syntax (CURRENT_TIMESTAMP, TEXT, ON CONFLICT). Store abstraction hides the driver — swap from `better-sqlite3` to `pg` requires changes only in store internals, zero changes above the store layer.

---

## P2 — Orchestrator Cleanup (RE-AUDITED — NO ACTION NEEDED)

Re-audited 2026-03-22 against current `searchDiscovery.js`. All 5 original findings are resolved or false positives:

| Finding | Status | Detail |
|---------|--------|--------|
| Brand promotion logic in orchestrator | Already resolved | No promotion code found in searchDiscovery.js |
| `search_queued` event emission | Already resolved | Not found in searchDiscovery.js |
| `normalizeFieldListFn` called twice | False positive | Two calls use different inputs (critical+required+focus vs required-only) — both intentional |
| `discoveryEnabled` forced true | False positive | Properly gated at entry point (line 75) — returns early with `enabled: false` if disabled |
| `queryConcurrency` hardcoded to 1 | Resolved (P7) | `discoveryQueryConcurrency` registry setting deleted. Now hardcoded to 1 everywhere. |

---

## P3 — processDiscoveryResults Decomposition (COMPLETE)

Completed: 2026-03-22. 7,614 tests pass, 0 regressions from P3 changes.

### Decomposition

**Problem:** `processDiscoveryResults()` was 674 lines with 36 parameters (1 dead: `focusGroups`).

**Fix:** Extracted into 3 focused modules:

| Module | Functions | LOC | Responsibility |
|--------|-----------|-----|---------------|
| `discoveryResultTraceBuilder.js` | `createCandidateTraceMap()`, `enrichCandidateTraces()` | 143 | Trace lifecycle: creation, merge, reason code enrichment |
| `discoveryResultClassifier.js` | `classifyAndDeduplicateCandidates()`, `classifyDomains()` | 193 | URL canonicalization, classification, domain heuristics |
| `discoveryResultPayloadBuilder.js` | `buildSerpExplorer()`, `writeDiscoveryPayloads()` | 217 | SERP explorer assembly, discovery + candidates payload writes |

**Orchestrator after:** 344 lines (49% reduction). Reads as sequential named steps.

**Dead code removed:** `focusGroups` parameter removed from `processDiscoveryResults` signature and `searchDiscovery.js` call site.

### Thresholds Assessment

The original audit listed 22+ hardcoded thresholds for registry migration. After analysis:
- Most are internal algorithm constants (scoring weights, display limits) that operators won't tune
- `NEED_SCORE_WEIGHTS` is redundant with `REQUIRED_LEVEL_RANKS` — vestigial scoring that contributes ~1% to group productivity and is discarded in final group ordering
- Existing config passthrough patterns (`config.seedCooldownMs ??`, `isGroupSearchWorthy({ thresholds })`) already handle the thresholds that matter
- **Decision: No new registry entries.** Named file-level constants for readability if needed in future.

---

## P4 — Post-Audit Fixes (COMPLETE, 2026-03-22)

All changes verified: 7,570+ tests pass, 0 regressions.

### P4-1: focusGroups Immutability (NEW-1)
**Problem:** `buildSearchPlanningContext()` mutated `.phase` directly on locally-created focusGroup objects via filtered array references.
**Fix:** Replaced in-place mutation with `phaseOverrides` Map + immutable `.map()` spread. Original objects are never modified. New variable `phasedGroups` used for all downstream references.

### P4-2: Bucket Mapping SSOT (N5)
**Problem:** `mapPriorityBucket` (needsetEngine) mapped `required` → `core`. `requiredLevelToBucket` (searchPlanBuilder) mapped `required` → `secondary` and `expected` → `'expected'` (invalid bucket not in PRIORITY_BUCKET_ORDER).
**Fix:** Extracted `mapRequiredLevelToBucket()` to `discoveryRankConstants.js`. Deleted all 3 private copies (needsetEngine, searchPlanBuilder, scripts/injectFieldHistoryProof). Fixed test assertion in searchPlanBuilder.test.js.

### P4-3: Confidence Fallback + Doc Cleanup (B3+B4)
**Problem:** Brand resolution confidence used `?? 0` in 3 telemetry sites but `?? null` in the stage itself. 4 phantom registry settings documented that don't exist in code.
**Fix:** Unified to `?? null` in queryJourney.js and searchDiscovery.js. Removed phantom registry settings from brand resolver docs. Added WHY comments on hardcoded crawlConfig and queryConcurrency in orchestrator.

---

## P5 — Schema Enforcement & Unified Schema Tech (COMPLETE, 2026-03-23)

All changes verified: 7,696 tests pass, live pipeline tested in enforce mode with 0 validation failures.

### P5-1: Cumulative Pipeline Context Schema

**Problem:** No runtime schema validation at pipeline stage boundaries. 12 per-stage Zod schemas exported but never imported, never enforced — pure dead code.

**Fix:** Created `src/features/indexing/discovery/pipelineContextSchema.js` — one cumulative schema with 8 progressive Zod checkpoints using `.extend()`. Wired `validatePipelineCheckpoint()` into orchestrator at all 6 inter-stage boundaries. Schema deepened with typed sub-schemas for focusGroups, seedStatus, seedSearchPlan, searchProfileBase, candidateRow, serpExplorer, discoveryResult (19 fields).

### P5-2: Dead Per-Stage Schema Cleanup

**Problem:** 11 per-stage Zod schemas across 6 `stages/*.js` files. Zero imports anywhere in codebase. SSOT drift risk with cumulative schema.

**Fix:** Deleted all 11 schemas + `import { z } from 'zod'` from: needSet.js, brandResolver.js, searchProfile.js, searchPlanner.js, queryJourney.js, domainClassifier.js. Cumulative schema is the single source of truth.

### P5-3: Orchestrator Mutation Removal

**Problem:** `discoveryResult.enqueue_summary = classifierResult` and `discoveryResult.seed_search_plan_output = needset.seedSearchPlan` — post-hoc mutations of Stage 07 output.

**Fix:** Replaced with fresh `finalResult = { ...discoveryResult, seed_search_plan_output, enqueue_summary }` merge. Stage 08 still receives original discoveryResult (reads only). No behavior change.

### P5-4: Hardcoded Crawl Config → Registry (SUPERSEDED by P7)

**Problem:** Brand promotion crawlConfig in orchestrator had `rate_limit_ms: 2000, timeout_ms: 12000` hardcoded.

**Original fix (P5):** Added `manufacturerCrawlRateLimitMs` and `manufacturerCrawlTimeoutMs` to settings registry.

**P7 update (2026-03-23):** Both registry settings deleted. CrawlConfig simplified to `{ method: 'http', robots_txt_compliant: true }` -- no rate_limit_ms or timeout_ms.

### P5-5: LLM Adapter Schema Unification

**Problem:** 11 LLM adapter functions used hand-written JSON Schema objects for structured output contracts. Rest of codebase uses Zod. Mixed schema tech.

**Fix:** All 11 converted to Zod SSOT using Zod v4's built-in `toJSONSchema()` at the LLM call boundary. No new dependencies. Schemas exported for validation/testing. Files: serpSelector.js, discoveryLlmAdapters.js, searchPlanBuilder.js, queryPlanner.js, validateEnumConsistency.js, validateComponentMatches.js, validateCandidatesLLM.js, invokeExtractionModel.js, writeSummaryLLM.js, healthCheck.js, testDataProvider.js.

### P5-6: Enforcement Mode Registry Setting

**Problem:** Schema validation was warn-only with no way to gate production runs.

**Fix:** Added `pipelineSchemaEnforcementMode` registry setting with 3 modes:
- `off` — skip validation (zero overhead)
- `warn` — log warnings (default, current behavior)
- `enforce` — throw on validation failure (gates the pipeline)

Live-tested: `PIPELINE_SCHEMA_ENFORCEMENT_MODE=enforce npm run smoke` completes with zero validation failures.

### P5-7: Naming Documentation

**Problem:** `profileQueryRowsByQuery` → `profileQueryRowMap` rename at orchestrator boundary was undocumented.

**Fix:** WHY comment added at the rename site in `runDiscoverySeedPlan.js`. Assessed as intentional boundary rename — both names are semantically accurate.

---

## P6 — Full Pipeline Re-Audit (2026-03-23)

Re-audited all 8 stages against live code. The cumulative Zod checkpoint system (P5) IS the contract — individual stages don't need their own entry-point Zod. Key findings:

### P6-1: Documentation Inaccuracies Fixed

| File | Issue | Fix |
|------|-------|-----|
| `PREFETCH-PIPELINE-OVERVIEW.md` | Event order wrong: `search_plan_generated` listed before `search_profile_generated` | Corrected: Stage 03 emits `search_profile_generated` before Stage 04 emits `search_plan_generated` |
| `PREFETCH-PIPELINE-OVERVIEW.md` | `search_profile_generated` attributed to Query Journey | Fixed: emitted by `searchProfile.js` (Stage 03) |
| `PREFETCH-PIPELINE-OVERVIEW.md` | `prioritizeQueryRows()` listed in Query Journey merge | Removed: function doesn't exist. Journey does dedupe → cap → guard → append. |
| `05-query-journey-output.json` | `processDiscoveryResults` return listed `approvedUrls` and `candidateUrls` | Fixed to `selectedUrls` and `allCandidateUrls` (actual field names on discoveryResult) |
| `03-pipeline-context.json` | Same field name error in Stage 07 section | Fixed to match live `discoveryResultProcessor.js:321-341` |
| `SEARCH-PLANNER-LOGIC-IN-OUT.md` | Listed `variables`, `job` as inputs to `runSearchPlanner()` | Removed: not in the actual function signature. Added `queryExecutionHistory`. |
| `SEARCH-PLANNER-LOGIC-IN-OUT.md` | `queryHistory` described as only `base_templates` | Fixed: union of `base_templates` + `queryExecutionHistory.queries[].query_text` |
| `02-brand-resolver-input.json` | Crawl config described as "hardcoded inline" | Fixed (P5-4), then simplified to static shape in P7 |
| `BRAND-RESOLVER-LOGIC-IN-OUT.md` | Same crawl config inaccuracy | Fixed (P5-4), then simplified to static shape in P7 |

### P6-2: Top 5 Live Code Findings (Ranked)

| Rank | ID | Phase | Finding | Severity |
|------|-----|-------|---------|----------|
| 1 | QJ1 | Query Journey | ~~`hostPlanQueryRows` missing default `= []`~~ — RESOLVED (P7): host plan concept deleted entirely | CLOSED |
| 2 | SP5+SP6 | Search Planner | 8+ hardcoded slice caps (50, 60, 8, 5, 5, 10, 5, 2) controlling LLM payload shaping — not registry-driven | MEDIUM |
| 3 | SS-DRY | SERP Selector | `adaptSerpSelectorOutput()` repeats same 15-line enrichment block 3x (selected, notSelected, overflow) | MEDIUM |
| 4 | SP8 | Search Planner | `passesIdentityLock` uses loose substring match — false positives possible for short model names | LOW |
| 5 | DC9 | Domain Classifier | No dedicated unit tests — only integration coverage via orchestration test | LOW |

### P6-3: Cumulative Zod Schema Assessment

The cumulative checkpoint architecture (P5) is correct and maintainable. Intentional `z.unknown()` holes:

| Field | Checkpoint | Reason for `z.unknown()` |
|-------|-----------|-------------------------|
| `enhancedRows` | AfterPlanner | Array of tier-tagged rows with variable tier-specific extensions |
| `selectedQueryRowMap` | AfterJourney | `Map` instance — Zod can't deeply validate Maps |
| `profileQueryRowsByQuery` | AfterJourney | Same — `Map` instance |
| `queryRejectLogCombined` | AfterJourney | Forward-investment reject log with varying shapes per source |

These are conscious tradeoffs. The schema validates field existence (presence) at each boundary. Shape validation for Map instances would require custom Zod refinements with marginal benefit.

---

## Open Findings (Deferred)

### Frontier DB / SpecDb Consolidation (Future)
Frontier tables (queries, urls, yields) are separate from SpecDb. Long-term: merge into unified per-category DB.

---

## Resolved Decompositions

- ~~**indexingSchemaPackets.js Decomposition**~~ — COMPLETE (P4 structural, 2026-03-23). 1,324 → 580 LOC. 4 extracted modules: `schemaPacketPhaseResolvers.js` (107), `schemaPacketValueHelpers.js` (85), `schemaPacketFieldHelpers.js` (87), `schemaPacketSourceBuilder.js` (491). Zero external consumer changes. 21 characterization tests + live smoke test.

### URL Naming Confusion (S4)
`approvedUrls` is a duplicate of `selectedUrls` in discoveryResultProcessor.js. `candidateUrls` includes all candidates (selected + rejected). Naming is misleading.

---

## Resolved Findings (Closed in P5)

- ~~**Tier Row Central Schema (SP2)**~~ — `queryRowSchema` in cumulative pipeline context schema validates `query`, `hint_source`, `tier`, `target_fields` with `.passthrough()` for tier-specific extensions.
- ~~**SERP Selector Schema Inconsistency (S2)**~~ — All 11 LLM adapter schemas converted to Zod SSOT (P5-5).
- ~~**Orchestrator hardcoded crawlConfig**~~ — Extracted to registry settings (P5-4), then simplified to static shape and registry settings deleted (P7).
- ~~**Orchestrator discoveryResult mutation**~~ — Replaced with fresh merge (P5-3).

---

## P7 — Host Plan Removal & Dead Settings Cleanup (2026-03-23)

### P7-1: Host Plan Concept Deleted

**Problem:** The entire host plan subsystem (`effectiveHostPlan`, `hostPlanQueryRows`, `buildEffectiveHostPlan`, `buildScoredQueryRowsFromHostPlan`, `collectHostPlanHintTokens`, `queryHostPlanScorer`, `domainHintResolver`, `queryCompiler`, `hintTokenResolver`, `hostPolicy`, `providerCapabilities`) added complexity without proportional value.

**Fix:** All host plan code, files, and references deleted:
- `domainHintResolver.js` — deleted
- `queryHostPlanScorer.js` — deleted
- Stage 03 (Search Profile) now returns `{ searchProfileBase }` only
- Stage 05 (Query Journey) no longer accepts or appends host plan rows
- `afterProfile` Zod checkpoint no longer validates `effectiveHostPlan` or `hostPlanQueryRows`
- `searchProfilePlanned.effective_host_plan` removed from planned artifact
- QJ1 finding (missing `= []` default) resolved by deletion

### P7-2: Dead Registry Settings Removed

6 registry settings deleted (never needed as config-driven knobs):
- `searchPlannerQueryCap` — unused
- `discoveryQueryConcurrency` — hardcoded to 1 everywhere
- `discoveryResultsPerQuery` — hardcoded to 10 everywhere
- `searchProfileCapMapJson` — unused
- `manufacturerCrawlRateLimitMs` — brand promotion crawlConfig simplified to `{ method: 'http', robots_txt_compliant: true }`
- `manufacturerCrawlTimeoutMs` — same

`resolveSearchProfileCaps()` no longer takes a `config` param — returns hardcoded defaults.

### P7-3: New Registry Settings

- `llmEnhancerMaxRetries` (int, default 2, min 1, max 5) — controls Search Planner LLM retry count. Wired to GUI.
- `pipelineSchemaEnforcementMode` and `fetchDrainTimeoutMs` — already existed in registry, now wired to GUI.

### P7-4: Domain Classification Ordering Fix

**Problem:** `classifyDomains()` ran BEFORE the SERP selector inside `processDiscoveryResults()`, violating the pipeline contract (SERP Selector should run first, then Domain Classifier).

**Fix:** `classifyDomains()` now runs AFTER the SERP selector. `domains_classified` event fires after `serp_selector_completed`. This enforces the documented pipeline contract: SERP Selector then Domain Classifier.
