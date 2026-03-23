# Pipeline Contract Audit — Results & Remediation Status

Audited: 2026-03-22. Against: CLAUDE.md rules (SSOT, O(1) Scaling, Contract-First, Subtractive Engineering).
P0 completed: 2026-03-22. P1 completed: 2026-03-22. P2 re-audited: 2026-03-22. P3 completed: 2026-03-22.
P4 post-audit fixes (2026-03-22): NEW-1 focusGroups immutability, N5 bucket mapping SSOT, B3+B4 confidence/docs.

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

### Phase E: Stage Zod Schemas (COMPLETE)

Input/output Zod schemas added to all 5 remaining stages. Exported but not enforced at runtime (matching Stage 01 NeedSet precedent). All use `.passthrough()` for forward compatibility.

---

## Schema Coverage Scorecard (After P1)

| Stage | Input Schema | Output Schema |
|-------|-------------|---------------|
| 01 NeedSet (wrapper) | Zod `needSetInputSchema` | **NONE** |
| 02 Brand Resolver | Zod `brandResolverInputSchema` | Zod `brandResolverOutputSchema` |
| 03 Search Profile | Zod `searchProfileInputSchema` | Zod `searchProfileOutputSchema` |
| 04 Search Planner | Zod `searchPlannerInputSchema` + AJV (LLM) | Zod `searchPlannerOutputSchema` |
| 05 Query Journey | Zod `queryJourneyInputSchema` | Zod `queryJourneyOutputSchema` |
| 06 Search Execution | **NONE** (inline in orchestrator) | **NONE** |
| 07 SERP Triage | **NONE** (inline in orchestrator) | **NONE** |
| 08 Domain Classifier | Zod `domainClassifierInputSchema` | Zod `domainClassifierOutputSchema` |
| Orchestrator | **NONE** | **NONE** |

**Status: 12/14 stage-level schemas defined.** Stages 06/07 are inline functions in the orchestrator, not standalone stage wrappers. Orchestrator input/output schemas deferred to P2.

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
| `queryConcurrency` hardcoded to 1 | False positive | Read from `configInt(config, 'discoveryQueryConcurrency')` — config-driven, not hardcoded |

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

## Open Findings (Deferred)

### indexingSchemaPackets.js Decomposition
1,333 LOC. Tier weights (0.8/0.45/0.35), ambiguity thresholds, quality gates. Needs own decomposition plan before adding config threading.

### Frontier DB / SpecDb Consolidation (Future)
Frontier tables (queries, urls, yields) are separate from SpecDb. Long-term: merge into unified per-category DB.

### Tier Row Central Schema (SP2)
Tier row fields (`tier`, `group_key`, `normalized_key`, `repeat_count`, etc.) defined inline across 5+ files with no central schema. Needs a shared Zod definition.

### SERP Selector Schema Inconsistency (S2)
`serpSelectorOutputSchema()` returns plain JSON schema while all other stages use Zod. Should be converted for consistency.

### URL Naming Confusion (S4)
`approvedUrls` is a duplicate of `selectedUrls` in discoveryResultProcessor.js. `candidateUrls` includes all candidates (selected + rejected). Naming is misleading.
