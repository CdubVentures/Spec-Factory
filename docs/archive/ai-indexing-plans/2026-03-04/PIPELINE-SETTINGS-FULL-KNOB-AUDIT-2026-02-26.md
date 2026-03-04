# Pipeline Settings Full Knob Audit - 2026-02-26

## Scope
- Audit target: `implementation/ai-indexing-plans/tuning.csv` against current Pipeline Settings UI.
- Goal: identify every missing tunable knob, missing sidebar structure, and remediation path so no operational option is inaccessible.

## Status update after implementation (2026-02-26)
- Finding 1 (Convergence lane concurrency UI gap): resolved.
- Finding 3 (Source Strategy CRUD gap): resolved.
- Wave 2A observability runtime knobs are now wired end-to-end:
  - `runtimeTraceEnabled`
  - `runtimeTraceFetchRing`
  - `runtimeTraceLlmRing`
  - `runtimeTraceLlmPayloads`
  - `eventsJsonWrite`
  - `authoritySnapshotEnabled`
- Remaining gaps are primarily the broader Wave 2/3/4 inventory from the 409-row matrix.

## Inputs Reviewed
- `implementation/ai-indexing-plans/tuning.csv`
- `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`
- `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx`
- `tools/gui-react/src/stores/settingsManifest.ts`
- `src/shared/settingsDefaults.js`
- `src/api/services/settingsContract.js`
- `src/api/routes/sourceStrategyRoutes.js`
- `src/db/specDb.js`

## Current Pipeline Settings Information Architecture

### Main Sidebar (Current)
1. Runtime Flow
2. Convergence
3. Source Strategy

### Nested Sidebar (Current)
- Runtime Flow nested groups (6):
  - Run Setup
  - Fetch and Render
  - OCR
  - Planner and Triage
  - Role Routing
  - Fallback Routing
- Convergence nested groups (7):
  - Convergence Loop
  - NeedSet Identity Caps
  - NeedSet Freshness Decay
  - Consensus - LLM Weights
  - Consensus - Tier Weights
  - SERP Triage
  - Retrieval
- Source Strategy: no nested sub-sidebar, table-only surface.

## Quantitative Coverage Summary

### Tuning inventory totals (from `tuning.csv`)
- Total knobs/options audited: **409**
- Status classification:
  - Backend only (no GUI): **226**
  - Hardcoded (no control): **96**
  - Not implemented: **12**
  - GUI surfaced: **74**
  - Backend + GUI (read-only): **1**

### Where the current GUI surfaced knobs live
- Tagged directly as Pipeline Settings: **25**
- Tagged as Indexing Runtime (legacy label, now runtime-flow ownership): **35**
- Tagged as LLM Settings tab: **15**
- Total GUI surfaced knobs in `tuning.csv`: **75**

### Net tunability gap
- Non-tunable today (backend-only + hardcoded + not implemented): **334**
- Read-only only (not actively tunable): **1**

## Critical Findings

### 1) Contract/UI mismatch in Convergence (real missing knobs)
- Convergence defaults/contracts define 30 keys.
- Pipeline Convergence UI exposes 26 keys.
- Missing from Convergence UI:
  - `laneConcurrencySearch`
  - `laneConcurrencyFetch`
  - `laneConcurrencyParse`
  - `laneConcurrencyLlm`
- Evidence:
  - Present in defaults: `src/shared/settingsDefaults.js`
  - Present in contract keys: `src/api/services/settingsContract.js`
  - Not present in `CONVERGENCE_KNOB_GROUPS`: `tools/gui-react/src/stores/settingsManifest.ts`

### 2) Worker concurrency documentation drift
- `tuning.csv` marks `WORKERS_SEARCH/FETCH/PARSE/LLM` as not implemented.
- Repo contains lane-concurrency env/config keys (`LANE_CONCURRENCY_*`) but no runtime lane-consumption usage was found outside config/contracts/tests.
- Implication: either implementation is incomplete, or documentation is stale, or both.

### 3) Source Strategy is only partially tunable in Pipeline Settings
- Backend supports GET/POST/PUT/DELETE for source strategy rows.
- Current Pipeline Settings UI supports only `enabled` toggle and delete.
- Missing UI operations in Pipeline Settings:
  - Create row
  - Edit row fields (`host`, `display_name`, `source_type`, `default_tier`, `discovery_method`, `search_pattern`, `priority`, `category_scope`, `notes`)

### 4) Legacy label drift in `tuning.csv`
- 35 rows still point to "Indexing Runtime" controls, while ownership has moved to Pipeline Runtime Flow.
- Audit docs and control-location labels need harmonization.

## Proposed Main Sidebar Expansion (to make all knobs tunable)

Recommended new main sidebar taxonomy and current inventory volume:

1. Observability and Tracing (17)
2. NeedSet Engine (18)
3. Discovery Planner (32)
4. Search Providers and SERP (29)
5. Fetch and URL Health (41)
6. Parsing and OCR (43)
7. Retrieval and Evidence Index (9)
8. Source Strategy (1 currently documented, but full CRUD schema exists)
9. Identity Gate (35)
10. Consensus and Scoring (67)
11. LLM Routing and Budgets (36)
12. Output and Drift (18)
13. Aggressive and Cortex (45)
14. Workers and Resilience (10)
15. Run Control (8)

## Proposed Nested Sidebar Pattern (per main section)
- Use subgroups aligned to control intent, for example:
  - Observability and Tracing: Runtime Trace, Ring Buffers, Event Dual-Write
  - NeedSet Engine: Requirement Weights, Identity Caps, Freshness Decay
  - Discovery Planner: Alias Generation, Planner LLM, Query Caps
  - Search Providers and SERP: Provider Selection, API Endpoints, Reranker Weights
  - Fetch and URL Health: Concurrency, Backoff, Per-host Policy, Dynamic Fetch Map
  - Parsing and OCR: Parser Selection, OCR Thresholds, Promotion Rules, Vision Fallback
  - Retrieval and Evidence Index: TTL/Refresh, Rediscovery Caps, Prime Source Limits
  - Identity Gate: Thresholds, Conflict handling, Resolver limits
  - Consensus and Scoring: Tier Weights, LLM Weights, Stop Conditions
  - LLM Routing and Budgets: Role Models, Role Token Caps, Fallback Routes, Budget Gates
  - Workers and Resilience: Lane Worker Counts, Restart/Health, Block-rate Guards

## Full Remediation Plan (TDD-first)

### Phase 1 - Canonical tuning registry
1. Introduce a canonical settings registry that maps every knob to:
   - Domain
   - Type/range
   - Default
   - Persistence authority
   - UI surface location (main sidebar + nested group)
   - Runtime consumer(s)
2. Make `tuning.csv` generated from this registry to prevent drift.

### Phase 2 - Close immediate contract/UI gaps
1. Add Convergence UI group: **Lane Concurrency** with 4 missing knobs.
2. Add Source Strategy CRUD UI in Pipeline Settings (create + edit modal/table inline edit).
3. Add dedicated tests for new UI->authority->route wiring.

### Phase 3 - Convert backend-only/hardcoded knobs to tunable settings
1. For each backend-only/hardcoded row, extract to settings contract with validated ranges.
2. Wire through authority + persistence + propagation.
3. Add UI controls under the new sidebar taxonomy.
4. Keep secrets (`*_API_KEY`, etc.) tunable via secret references/profiles, not raw plaintext rendering.

### Phase 4 - Implement currently not-implemented knobs
1. Worker lane knobs and resilience controls
2. Batch safety controls
3. Parsing chart vision fallback
4. Retrieval TTL/rediscovery controls

### Phase 5 - Validation and lock-down
1. Add matrix coverage tests: every contract key must map to a UI control descriptor.
2. Add snapshot tests for sidebar taxonomy and nested-group ownership.
3. Add a CI audit check that fails when any contract key is unassigned to UI metadata.
4. Regenerate `tuning.csv` from canonical registry.

## Suggested Acceptance Criteria
- 100% of canonical contract keys are tunable via GUI (or explicitly marked secret-reference only with a GUI management surface).
- 0 hardcoded production knobs without a documented exception.
- 0 backend-only knobs for non-secret operational behavior.
- `tuning.csv` and UI metadata generated from a single source of truth.
- Pipeline Settings main + nested sidebars cover all tuning domains with no orphan keys.

## Audit Artifacts Generated
- Full row-level matrix (409 rows):
  - `implementation/ai-indexing-plans/pipeline-settings-knob-audit-matrix-2026-02-26.csv`
