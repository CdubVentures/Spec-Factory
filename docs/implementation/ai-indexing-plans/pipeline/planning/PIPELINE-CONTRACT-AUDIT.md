# Pipeline Contract Audit — Results & Remediation Status

Audited: 2026-03-22. Against: CLAUDE.md rules (SSOT, O(1) Scaling, Contract-First, Subtractive Engineering).

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

## P1 — Persistent Field History & Contract Boundaries (IN PROGRESS)

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

### Phase B: Write Path (NEXT)

Persist enriched field histories to DB inside the `exportToSpecDb()` transaction at end of each round, after `enrichNeedSetFieldHistories()` completes and all fetches have drained.

### Phase C: Read Path (NEXT)

Load field histories from DB at round startup in `runUntilComplete.js`. In-memory handoff stays as fast path between rounds within same process. DB read is the crash-recovery path.

### Phase D: Fetch Completion Gate (PLANNED)

Add `fetchDrainTimeoutMs` registry setting. Wrap fetch scheduler drain with `Promise.race` timeout. Emit accounting events for unfetched URLs.

### Phase E: Stage Zod Schemas (PLANNED)

Add input/output Zod schemas to Stages 02-08. Exported but not enforced at runtime (matching Stage 01 NeedSet precedent).

---

## Schema Coverage Scorecard (Current)

| Stage | Input Schema | Output Schema |
|-------|-------------|---------------|
| 01 NeedSet (wrapper) | Zod | **NONE** |
| 01 computeNeedSet | **NONE** | **NONE** |
| 02 Brand Resolver | **NONE** | **NONE** |
| 03 Search Profile | **NONE** | **NONE** |
| 04 Search Planner | **NONE** | AJV (LLM only) |
| 05 Query Journey | **NONE** | **NONE** |
| 06 Search Execution | **NONE** | **NONE** |
| 07 SERP Triage | **NONE** | **NONE** |
| 08 Domain Classifier | **NONE** | **NONE** |
| Orchestrator | **NONE** | **NONE** |

**Target after P1 Phase E: Zod input + output on every stage.**

---

## Storage Architecture

| Tier | Technology | Scope |
|------|-----------|-------|
| Object Storage | S3 / Local / DualMirror | Run artifacts, exports, screenshots |
| SpecDb | SQLite (always local) | Operational state — candidates, field state, queue, reviews, **field_history** |
| FrontierDb | SQLite (always local) | Query/URL/yield tracking per product |

**PostgreSQL migration path:** All new SQL uses portable syntax (CURRENT_TIMESTAMP, TEXT, ON CONFLICT). Store abstraction hides the driver — swap from `better-sqlite3` to `pg` requires changes only in store internals, zero changes above the store layer.

---

## Open Findings (Deferred to Later Phases)

### Orchestrator Business Logic Leaks (P2)
- Brand promotion logic in orchestrator (should be Brand Resolver's responsibility)
- `search_queued` event emission in orchestrator (should be Query Journey's)
- `normalizeFieldListFn` called twice with different inputs
- `discoveryEnabled` forced true unconditionally
- `queryConcurrency` hardcoded to 1

### Hardcoded Thresholds Not in Registry (P3)
22 thresholds across NeedSet files — confidence gates (0.95, 0.70, 0.8), max focus fields (10), NEED_SCORE_WEIGHTS, group coverage threshold (0.80), seed cooldown (30 days). Plus query builder thresholds (max aliases 12, per-field cap 3, archetype budget 60%, LLM retry cap 2, slice caps 50/60/8).

### processDiscoveryResults Decomposition (P3)
674 lines, 36 parameters. Should be broken into smaller contract-validated functions.

### Frontier DB / SpecDb Consolidation (Future)
Frontier tables (queries, urls, yields) are separate from SpecDb. Long-term: merge into unified per-category DB.
