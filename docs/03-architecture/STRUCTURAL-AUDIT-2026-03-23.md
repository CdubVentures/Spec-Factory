# Structural Audit — 2026-03-23

Principal Architect Review: Decomposition Quality, Dependency Health, and Architectural Maintainability.

**Scope:** Full codebase audit — 833 source files, 663 test files, 468 frontend files.
**Method:** File-backed evidence from actual code reads across all major boundaries.

---

## G. Executive Risk Tables

### G.1 — App-Wide High-Level Risk Table

| Rank | Severity | Area | Primary Hotspot | LOC | Full Slice / Surface | Why It Matters | Recommended Action | Doc Impact |
|------|----------|------|-----------------|-----|---------------------|----------------|-------------------|------------|
| 1 | **Critical** | Review Route Boundary | `src/api/review*Routes.js` + `src/features/review/api/reviewRoutes.js` | ~1,100 | Review mutation HTTP surface | Bidirectional cross-boundary imports between `src/api/` and `src/features/review/`; dual public contracts for mutation services; feature imports from transport layer | Consolidate all review mutation routes into `src/features/review/api/`; delete `src/api/review*Routes.js` | `src/api/README.md`, `src/features/review/README.md`, `docs/03-architecture/routing-and-gui.md` |
| 2 | **High** | Queue State | `src/queue/queueState.js` | 903 | Queue lifecycle + persistence | Every public function duplicates if/else branches for SpecDb vs JSON fallback; 13 exports mixing persistence, state machine, and validation | Extract dual-path abstraction; separate queue DB adapter from state logic | Missing README needed; `docs/03-architecture/backend-architecture.md` |
| 3 | **High** | Source Planner | `src/planner/sourcePlanner.js` | 1,078 | URL queue orchestration | 45 methods, 9 internal queues, 25+ counters; monolithic state machine with deep nesting and implicit ordering | Phase A: extract queue manager; Phase B: extract validation rules; Phase C: extract scoring | `src/planner/README.md` |
| 4 | **High** | Legacy Shim Wall | `src/review/*.js` (19 shims) | 103 | Review backward compat | 22 test files still import legacy location; shims work but create navigation confusion for LLM agents | Migrate test imports to `src/features/review/`; remove shims | Test file paths, `src/review/index.js` removal |
| 5 | **Medium** | Junk Drawers | `src/utils/` (7 files) | 927 | Generic utilities | Explicitly forbidden by CLAUDE.md; domain-specific files masquerading as generic utils | Relocate: `common.js` to `src/shared/`, domain files to owning features | Import paths across ~10 consumers |
| 6 | **Medium** | API Helper Misplacement | `src/api/helpers/` (7 files) | 629 | HTTP + domain utilities | 3 re-export shims; `domainBucketHelpers.js` and `llmHelpers.js` are domain logic in transport layer | Move shims to direct imports; relocate domain logic to `src/core/` | `src/api/README.md` |
| 7 | **Medium** | Event Infrastructure | `src/api/events/dataChangeContract.js` | 263 | Mutation broadcast system | Event contract lives in `src/api/` but features import it — should be `src/core/events/` | Relocate to `src/core/events/` | `src/core/README.md`, feature READMEs |
| 8 | **Medium** | Review-Curation Facade | `src/features/review-curation/index.js` | ~40 | Re-export pass-through | Pure pass-through re-exporting from `src/features/review/domain/index.js`; 4 consumers; no domain logic | Migrate 4 consumers to import from `src/features/review/`; retire facade | `src/features/review-curation/README.md` (delete) |
| 9 | **Medium** | Missing READMEs | 7 boundaries | — | Domain contracts | `src/app/`, `src/exporter/`, `src/queue/`, `src/scoring/`, `src/billing/`, `src/evidence/`, `src/inference/` lack contract READMEs | Author domain READMEs (Purpose, Public API, Dependencies, Invariants) | Each boundary's new `README.md` |
| 10 | **Medium** | Frontend Large Components | 8 files > 1,000 LOC | ~9,000 | GUI workflow containers | `EditableComponentSource` (1,375), `ComponentReviewDrawer` (1,372), `BrandManager` (1,352), `ReviewPage` (1,060) | Characterize then extract sub-editors; decompose after shape stabilizes | `tools/gui-react/` needs root README |
| 11 | **Low** | Runtime Bridge Verbosity | `src/indexlab/runtimeBridgeEventHandlers.js` | 883 | WebSocket event dispatch | 34 handlers with repeated coercion boilerplate; 70+ field emissions without validation | Extract coercion helpers; consider schema-driven dispatch | `src/indexlab/README.md` |
| 12 | **Low** | Component Library | `src/components/library.js` | 381 | Component catalog loader | Misleading directory name; domain logic in generic-sounding path | Relocate to `src/features/catalog/` | Import paths |

---

### G.2 — Critical Finding Drill-Down: Review Route Boundary Violation

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/features/review/api/reviewRoutes.js` | ~120 | Route dispatcher — imports from `src/api/` (backward) | Bidirectional dependency; features must not import from transport |
| Supporting hotspot | `src/api/reviewItemRoutes.js` | 344 | Item mutation handler — re-exports services from features | Dual public contract for `itemMutationService` |
| Supporting hotspot | `src/api/reviewComponentMutationRoutes.js` | ~200 | Component mutation handler — re-exports services | Dual public contract for `componentMutationService` |
| Supporting hotspot | `src/api/reviewEnumMutationRoutes.js` | ~150 | Enum mutation handler — re-exports services | Dual public contract for `enumMutationService` |
| High-risk route layer | `src/features/review/api/componentReviewHandlers.js` | 492 | Component/enum/batch handlers — imports `emitDataChange` from `src/api/events/` | Cross-layer import (feature → api infra) |
| High-risk route layer | `src/features/review/api/fieldReviewHandlers.js` | ~500 | Field review handlers — same pattern | Cross-layer import |
| Trust boundary | `src/features/review/api/reviewRouteContext.js` | 67 | Context factory — imports mutation resolvers from `src/api/` | 40+ dependencies injected; cross-boundary |
| Supporting infrastructure | `src/api/reviewRouteSharedHelpers.js` | 274 | Shared mutation response helpers | Used by both api/ and features/ |
| Supporting infrastructure | `src/api/reviewMutationResolvers.js` | ~100 | Mutation context resolution | Imported by feature route context |
| Supporting infrastructure | `src/api/events/dataChangeContract.js` | 263 | Event broadcast contract | Infrastructure in wrong location |
| Full feature slice | `src/features/review/` | ~7,500 | Entire review feature | Cannot be self-contained until api/ routes move in |

**Why this is Critical:** The review feature cannot operate as a self-contained vertical slice. Its route layer (`src/features/review/api/reviewRoutes.js`) delegates to handlers that live in `src/api/` — the transport layer. Those handlers in turn re-export services from `src/features/review/services/`. This creates a circular dependency chain:

```
features/review/api/reviewRoutes.js
  → imports from src/api/reviewItemRoutes.js (BACKWARD into transport)
    → which imports from src/features/review/services/ (BACK into feature)
      → which imports from src/api/reviewRouteSharedHelpers.js (BACKWARD again)
```

**Blast radius:** Any change to review mutation handling requires touching files in both `src/api/` and `src/features/review/`. An LLM agent reading the feature README would not know about the `src/api/` dependencies. A refactor of the API layer could break the review feature silently.

---

### G.2b — High Finding Drill-Down: Queue State Mixed Concerns

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/queue/queueState.js` | 903 | Queue lifecycle + persistence + validation | 13 exports, every function duplicates dual-path (SpecDb/JSON) logic |
| Full runtime slice | `src/queue/` | ~1,200 | Queue management surface | No README contract; unclear allowed imports |
| Persistence boundary | SpecDb integration | — | Queue-to-DB interface | Implicit contract; not documented |
| State container | In-memory queue state | — | Product selection + scoring | Selection algorithm buried inside persistence functions |

**Why this is High:** Every public function in `queueState.js` contains an `if (specDb) { /* SQLite path */ } else { /* JSON path */ }` branch. The `recordQueueRunResult` function (95 LOC) and `recordQueueFailure` (73 LOC) nearly duplicate their SpecDb/JSON branches. This makes the file a maintenance trap: any change to queue behavior must be made twice, once for each storage backend. The fix is straightforward — extract a queue storage adapter that encapsulates the dual-path pattern behind a single interface.

---

### G.2c — High Finding Drill-Down: Source Planner Monolith

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/planner/sourcePlanner.js` | 1,078 | URL queue orchestration | 45 methods, 9 queues, heavy internal state mutation |
| Supporting hotspot | `src/planner/sourcePlannerValidation.js` | ~200 | URL validation rules | Already extracted but tightly coupled |
| Supporting hotspot | `src/planner/sourcePlannerScoring.js` | ~200 | Queue scoring/ranking | Already extracted but methods reference planner state |
| Supporting hotspot | `src/planner/sourcePlannerDiscovery.js` | ~200 | Discovery seed routing | Already extracted |
| Full feature slice | `src/planner/*.js` (9 files) | ~2,500 | Source planning surface | Main class still 1,078 LOC after helpers extracted |

**Why this is High:** The `SourcePlanner` class manages 9 internal collections (`manufacturerQueue`, `priorityQueue`, `queue`, `candidateQueue`, `visitedUrls`, `blockedHosts`, `filledFields`, `hostCounts` + variants), 25+ counters, and 45 methods. The `_resolveQueueRoute()` method (85+ lines) implements 7+ routing decisions with nested conditionals. Despite prior extraction of helpers into `sourcePlannerValidation.js`, `sourcePlannerScoring.js`, etc., the core class remains a monolithic state machine. The next decomposition target is the queue management layer — extract a `PlannerQueueManager` that owns the 4 queues + routing logic, reducing `SourcePlanner` to orchestration-only.

---

### G.2d — High Finding Drill-Down: Legacy Shim Wall

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/review/index.js` | ~20 | Legacy barrel re-export | Backward compat shim for 22 test files |
| Full shim layer | `src/review/*.js` (19 files) | 103 | Pure re-export shims | Each file re-exports from `src/features/review/domain/` |
| Test consumers | 22 test files | ~5,000 | Tests using legacy paths | All pass via shims; migration safe |
| Production consumers | `src/pipeline/seams/`, `src/cli/spec.js` | ~3 | Pipeline/CLI imports | Must migrate before shim removal |

**Why this is High:** The shim layer works correctly but creates navigation confusion. An LLM agent encountering `src/review/componentImpact.js` would assume it contains domain logic, not a 5-line re-export. The git status shows all 19 shim files were recently modified (the extraction just happened), making now the ideal time to migrate consumers before the shims become load-bearing. The 22 test files and 3 production consumers are safe to migrate because the shims are 1:1 re-exports.

---

## A. Prioritized Findings List

### Finding 1: Review Route Boundary Violation

- **Severity:** Critical
- **Affected files:**
  - `src/features/review/api/reviewRoutes.js` (imports `src/api/review*Routes.js`)
  - `src/api/reviewItemRoutes.js` (re-exports `src/features/review/services/`)
  - `src/api/reviewComponentMutationRoutes.js` (re-exports services)
  - `src/api/reviewEnumMutationRoutes.js` (re-exports services)
  - `src/api/reviewRouteSharedHelpers.js` (shared mutation helpers)
  - `src/api/reviewMutationResolvers.js` (mutation context)
  - `src/api/events/dataChangeContract.js` (event infrastructure)
  - `src/features/review/api/componentReviewHandlers.js` (imports from `src/api/events/`)
  - `src/features/review/api/fieldReviewHandlers.js` (imports from `src/api/events/`)
  - `src/features/review/api/reviewRouteContext.js` (imports from `src/api/`)
- **Why it matters:** Features must not import from the transport layer. The review feature's HTTP handlers are split across two boundaries, creating bidirectional dependencies and dual public contracts. This violates the feature-first architecture principle and makes the feature non-self-contained.
- **Likely failure mode:** Changing review mutation handling requires synchronized edits in `src/api/` and `src/features/review/`. An LLM agent working in the feature would not know about the `src/api/` dependencies.
- **Recommended direction:**
  1. Move `reviewItemRoutes.js`, `reviewComponentMutationRoutes.js`, `reviewEnumMutationRoutes.js` handler logic into `src/features/review/api/`
  2. Move `reviewRouteSharedHelpers.js` and `reviewMutationResolvers.js` into `src/features/review/api/` or `src/features/review/services/`
  3. Move `dataChangeContract.js` to `src/core/events/`
  4. Update `guiServer.js` to import all review routes from `src/features/review/`
- **Documentation impact:** `src/api/README.md`, `src/features/review/README.md`, `docs/03-architecture/routing-and-gui.md`, `docs/03-architecture/backend-architecture.md`

---

### Finding 2: Queue State Dual-Path Duplication

- **Severity:** High
- **Affected files:**
  - `src/queue/queueState.js` (903 LOC, 13 exports)
- **Why it matters:** Every public function contains duplicated `if (specDb) / else (JSON)` branches. Changes must be made twice. The `recordQueueRunResult` (95 LOC) and `recordQueueFailure` (73 LOC) functions are nearly identical in structure.
- **Likely failure mode:** A bug fix applied to one storage path but not the other; divergent behavior between SpecDb and JSON modes.
- **Recommended direction:** Extract a `QueueStorageAdapter` interface with two implementations (`SpecDbQueueStorage`, `JsonQueueStorage`). Each public function calls the adapter instead of branching.
- **Documentation impact:** Missing `src/queue/README.md` must be created

---

### Finding 3: Source Planner Monolith

- **Severity:** High
- **Affected files:**
  - `src/planner/sourcePlanner.js` (1,078 LOC, 45 methods, 9 queues)
- **Why it matters:** The class is the single most complex state machine in the codebase. 9 internal queues, 25+ counters, deep nesting in routing logic. Despite prior extraction of helpers, the core class still owns too many responsibilities.
- **Likely failure mode:** Queue routing bugs from implicit ordering dependencies between methods; difficulty testing specific routing decisions in isolation.
- **Recommended direction:**
  - Phase A: Extract `PlannerQueueManager` (owns 4 queues + routing + eviction)
  - Phase B: Extract `PlannerHostTracker` (owns blockedHosts, hostCounts, budget)
  - Phase C: `SourcePlanner` reduces to orchestration (seeds + lifecycle + public API)
- **Documentation impact:** `src/planner/README.md` update

---

### Finding 4: Legacy Review Shim Wall

- **Severity:** High
- **Affected files:**
  - `src/review/*.js` (19 shim files, 103 LOC total)
  - 22 test files importing from `src/review/`
  - `src/pipeline/seams/buildRunProductFinalizationContext.js`
  - `src/cli/spec.js`
- **Why it matters:** The shims work but create navigation confusion. An LLM agent would waste context reading what appears to be 19 domain files but are actually 5-line re-exports. Now is the ideal time to complete migration while the extraction is fresh.
- **Likely failure mode:** Future LLM agent edits the shim file instead of the domain file; new code added to legacy location.
- **Recommended direction:** Update all 22 test imports and 3 production imports to use `src/features/review/domain/` or `src/features/review/index.js`. Delete `src/review/` directory.
- **Documentation impact:** Test file paths, remove `src/review/` from any architecture docs

---

### Finding 5: `src/utils/` Junk Drawer

- **Severity:** Medium
- **Affected files:**
  - `src/utils/common.js` (149 LOC — generic)
  - `src/utils/fieldKeys.js` (142 LOC — domain)
  - `src/utils/candidateIdentifier.js` (139 LOC — domain)
  - `src/utils/identityNormalize.js` (233 LOC — domain)
  - `src/utils/slotValueShape.js` (202 LOC — domain)
  - `src/utils/tierHelpers.js` (48 LOC — domain)
  - `src/utils/componentIdentifier.js` (14 LOC — domain)
- **Why it matters:** CLAUDE.md explicitly forbids `src/utils` as a dumping ground. 6 of 7 files are domain-specific and belong in their owning features.
- **Likely failure mode:** New domain-specific code gets dumped here because the directory exists.
- **Recommended direction:**
  - `common.js` generic parts → `src/shared/`
  - `candidateIdentifier.js`, `slotValueShape.js` → `src/features/indexing/`
  - `fieldKeys.js`, `tierHelpers.js` → `src/engine/` or `src/field-rules/`
  - `identityNormalize.js` → `src/features/indexing/` (identity domain)
  - `componentIdentifier.js` → `src/features/catalog/` or `src/engine/`
- **Documentation impact:** Import paths in ~10 consumers; add to owning feature READMEs

---

### Finding 6: Event Infrastructure Misplacement

- **Severity:** Medium
- **Affected files:**
  - `src/api/events/dataChangeContract.js` (263 LOC)
- **Why it matters:** This is core event infrastructure imported by 3+ features, but it lives in `src/api/`. Features importing from `src/api/` violates the dependency direction rule (features may import `core/` and `shared/`, not `api/`).
- **Recommended direction:** Move to `src/core/events/dataChangeContract.js`. Update all imports.
- **Documentation impact:** `src/core/README.md`, `src/api/README.md`, feature READMEs

---

### Finding 7: Review-Curation Phantom Feature

- **Severity:** Medium
- **Affected files:**
  - `src/features/review-curation/index.js` (~40 LOC — pure re-export)
  - 4 consumers importing from it
- **Why it matters:** This "feature" has zero domain logic — it purely re-exports from `src/features/review/domain/index.js`. It exists as a historical facade. The 4 consumers could import directly from `src/features/review/`.
- **Recommended direction:** Migrate 4 consumers to `src/features/review/index.js`. Delete `src/features/review-curation/`.
- **Documentation impact:** Delete `src/features/review-curation/README.md`

---

### Finding 8: Missing Domain READMEs

- **Severity:** Medium
- **Affected boundaries:**
  - `src/app/` — Application routing/entrypoints
  - `src/exporter/` — Data export/serialization
  - `src/queue/` — Queue state management
  - `src/scoring/` — Consensus + quality scoring
  - `src/billing/` — Billing/usage tracking
  - `src/evidence/` — Evidence tier logic
  - `src/inference/` — LLM inference orchestration
- **Why it matters:** An LLM agent entering these directories has no local contract to guide it. It must scan the entire directory and guess at boundaries.
- **Recommended direction:** Author README.md for each (Purpose, Public API, Dependencies, Domain Invariants). Max 150 lines each.
- **Documentation impact:** 7 new README.md files

---

### Finding 9: `src/api/helpers/` Misplaced Domain Logic

- **Severity:** Medium
- **Affected files:**
  - `src/api/helpers/domainBucketHelpers.js` (290 LOC — domain classification constants)
  - `src/api/helpers/llmHelpers.js` (269 LOC — LLM model classification)
  - `src/api/helpers/valueNormalizers.js` (23 LOC — shim)
  - `src/api/helpers/fileHelpers.js` (13 LOC — shim)
  - `src/api/helpers/requestHelpers.js` (6 LOC — aggregator)
- **Why it matters:** Domain classification logic in `domainBucketHelpers.js` and LLM model resolution in `llmHelpers.js` are not API-layer concerns. They should be in `src/core/` or `src/shared/`.
- **Recommended direction:** Move `domainBucketHelpers.js` to `src/core/` or `src/shared/`; move `llmHelpers.js` to `src/core/llm/`; delete re-export shims.
- **Documentation impact:** `src/api/README.md`, `src/core/README.md`

---

### Finding 10: Frontend Missing Architecture README

- **Severity:** Medium
- **Affected path:** `tools/gui-react/src/`
- **Why it matters:** The frontend has 468 files and strong internal architecture (feature-first, Zustand stores, centralized API client, strict TypeScript), but no README contract. An LLM agent entering the frontend has no map.
- **Recommended direction:** Author `tools/gui-react/src/README.md` with Purpose, Component Architecture, State Management, API Client, Design System rules.
- **Documentation impact:** New `tools/gui-react/src/README.md`

---

### Finding 11: `src/components/library.js` Misplaced

- **Severity:** Low
- **Affected file:** `src/components/library.js` (381 LOC)
- **Why it matters:** Domain-specific component catalog loader in a misleading generic directory. Imports from `src/utils/common.js`.
- **Recommended direction:** Relocate to `src/features/catalog/componentLibrary.js` or similar.
- **Documentation impact:** Import paths, `src/features/catalog/README.md`

---

### Finding 12: Runtime Bridge Boilerplate

- **Severity:** Low
- **Affected file:** `src/indexlab/runtimeBridgeEventHandlers.js` (883 LOC)
- **Why it matters:** 34 handlers with repeated 5-10 line coercion preambles (`asInt()`, `asFloat()`, `asNullableText()`). The handler registration is a manual hardcoded Map of 34 entries.
- **Recommended direction:** Extract a coercion/projection utility that applies a field schema to incoming event data. Consider schema-driven dispatch.
- **Documentation impact:** `src/indexlab/README.md`

---

## B. Recommended Module Split Plan

### Split 1: Review Route Consolidation (Finding 1)

**Current responsibility overload:** Review mutation routes are split across `src/api/` (transport layer) and `src/features/review/api/` (feature layer), creating bidirectional imports.

**Proposed module boundaries:**
- `src/features/review/api/` owns ALL review HTTP handling
- `src/core/events/` owns the data-change broadcast contract
- `src/api/` becomes a pure composition root (no domain handlers)

**Target files after split:**
- `src/features/review/api/reviewRoutes.js` — unified route dispatcher (no `src/api/` imports)
- `src/features/review/api/itemMutationHandlers.js` — absorbs `src/api/reviewItemRoutes.js` handler logic
- `src/features/review/api/componentMutationHandlers.js` — absorbs `src/api/reviewComponentMutationRoutes.js`
- `src/features/review/api/enumMutationHandlers.js` — absorbs `src/api/reviewEnumMutationRoutes.js`
- `src/features/review/api/reviewRouteSharedHelpers.js` — absorbs `src/api/reviewRouteSharedHelpers.js`
- `src/core/events/dataChangeContract.js` — moved from `src/api/events/`

**What moves first:**
1. `dataChangeContract.js` → `src/core/events/` (unblocks features from importing `src/api/`)
2. `reviewRouteSharedHelpers.js` → `src/features/review/api/`
3. `reviewMutationResolvers.js` → `src/features/review/api/`
4. Item/component/enum handler logic → merge into feature handlers

**What stays temporarily:**
- `guiServer.js` route registration (update import paths)
- `src/api/helpers/httpPrimitives.js` (stays — API-internal)

**Expected benefit:** Review feature becomes self-contained. No more bidirectional dependencies. LLM agent can work in `src/features/review/` without knowing about `src/api/` internals.

**Post-split domain contract:**
- Exports: `registerReviewRoutes`, `createReviewRouteContext` (via `index.js`)
- Allowed imports: `src/core/`, `src/shared/`, `src/db/` (via injected `specDb`)
- Mutation surface: SpecDb writes (via injected instance), WebSocket broadcasts, event emission
- Invariants: All mutations go through services; no direct DB access in handlers

**Documentation updates required:**
- `src/api/README.md` (remove review route references)
- `src/features/review/README.md` (add route-layer documentation)
- `src/core/README.md` (add events module)
- `docs/03-architecture/routing-and-gui.md`
- `docs/03-architecture/backend-architecture.md`

---

### Split 2: Queue State Adapter Extraction (Finding 2)

**Current responsibility overload:** `queueState.js` (903 LOC) mixes persistence logic (SpecDb + JSON), state machine logic (status transitions, scoring), and validation logic (identity gates, normalization). Every function duplicates the storage path branch.

**Proposed module boundaries:**
- `src/queue/queueStorageAdapter.js` — abstract storage interface with SpecDb and JSON implementations
- `src/queue/queueState.js` — reduced to state machine logic only (score computation, selection, lifecycle)

**Target files after split:**
- `src/queue/queueStorageAdapter.js` (~200 LOC) — `createQueueStorage({ specDb, storage, category })` → `{ load, save, upsertProduct, recordResult, recordFailure, listProducts, clearByStatus }`
- `src/queue/queueState.js` (~500 LOC) — uses adapter; owns scoring, selection, sync-from-inputs

**What moves first:** The dual-path `if (specDb) / else` branches → adapter implementations.

**Expected benefit:** Bug fixes applied once. Each storage implementation testable independently. Core state logic readable without persistence noise.

**Post-split domain contract:**
- Exports: `loadQueueState`, `saveQueueState`, `selectNextQueueProduct`, `syncQueueFromInputs`, `recordQueueRunResult`, `recordQueueFailure`, `listQueueProducts`, `clearQueueByStatus`
- Allowed imports: `src/shared/`, `src/features/catalog/` (identity gate)
- Mutation surface: SpecDb queue tables or JSON state file
- Invariants: Score computation is deterministic; product selection respects priority ordering; state transitions are valid (queued → running → done/failed)

**Documentation updates:** Create `src/queue/README.md`

---

### Split 3: Source Planner Queue Extraction (Finding 3)

**Current responsibility overload:** `SourcePlanner` (1,078 LOC) is simultaneously a queue manager (4 queues + routing + eviction), host tracker (blocks, counts, budgets), URL validator, and orchestration coordinator.

**Proposed module boundaries:**
- `src/planner/plannerQueueManager.js` — owns 4 queues, routing decisions, eviction
- `src/planner/plannerHostTracker.js` — owns blockedHosts, hostCounts, budget tracking
- `src/planner/sourcePlanner.js` — reduced to orchestration (seeds, lifecycle, public API)

**Target files after split:**
- `plannerQueueManager.js` (~350 LOC): `createPlannerQueueManager()` → `{ enqueue, dequeue, route, evict, getQueueStats }`
- `plannerHostTracker.js` (~200 LOC): `createPlannerHostTracker()` → `{ trackHost, isBlocked, getCount, applyBudget }`
- `sourcePlanner.js` (~500 LOC): uses both; owns `next()`, `seed()`, lifecycle

**Expected benefit:** Queue routing testable in isolation. Host tracking testable in isolation. `SourcePlanner` reads as a coordinator, not a state dump.

**Documentation updates:** `src/planner/README.md`

---

## C. Highest-Value Refactor First

### Review Route Consolidation (Finding 1)

This is the highest-value refactor because it:
1. Eliminates the only **Critical** severity finding
2. Removes the only **bidirectional cross-boundary dependency** in the codebase
3. Unblocks the review feature from being a true self-contained vertical slice
4. Sets the pattern for other feature route consolidations

**Before (current state):**
```javascript
// src/features/review/api/reviewRoutes.js — CURRENT
import { handleReviewItemMutationRoute } from '../../../api/reviewItemRoutes.js';        // ← BACKWARD
import { handleReviewComponentMutationRoute } from '../../../api/reviewComponentMutationRoutes.js'; // ← BACKWARD
import { handleReviewEnumMutationRoute } from '../../../api/reviewEnumMutationRoutes.js';          // ← BACKWARD

export function registerReviewRoutes(ctx) {
  return async (parts, params, method, req, res) => {
    // ... delegates to the above handlers
  };
}
```

```javascript
// src/api/reviewItemRoutes.js — CURRENT (in wrong location)
import {
  resolveGridLaneStateForMutation,
  resolveGridLaneCandidate,
  // ... 10 more
} from '../features/review/services/itemMutationService.js';   // ← re-exports from feature

export { resolveGridLaneStateForMutation, ... };               // ← dual public contract

export async function handleReviewItemMutationRoute(ctx) { ... }
```

**After (target state):**
```javascript
// src/features/review/api/reviewRoutes.js — AFTER
import { handleReviewItemMutationRoute } from './itemMutationHandlers.js';         // ← INTERNAL
import { handleReviewComponentMutationRoute } from './componentMutationHandlers.js'; // ← INTERNAL
import { handleReviewEnumMutationRoute } from './enumMutationHandlers.js';          // ← INTERNAL

export function registerReviewRoutes(ctx) {
  return async (parts, params, method, req, res) => {
    // ... same dispatcher, now all internal
  };
}
```

```javascript
// src/features/review/api/itemMutationHandlers.js — AFTER (moved into feature)
import {
  resolveGridLaneStateForMutation,
  // ...
} from '../services/itemMutationService.js';   // ← INTERNAL import

export async function handleReviewItemMutationRoute(ctx) { ... }
// No re-exports — service consumed internally only
```

**Documentation state change:** After this refactor, the `src/features/review/README.md` Public API section can truthfully say: "All review HTTP handling is self-contained in this feature. No external route files."

---

## D. Practical Implementation Order

### Phase 0: Documentation Baseline (Prerequisite)

**Goal:** Ensure current READMEs are accurate before any code moves.

1. Verify `src/api/README.md` accurately lists all route files (including the review route files that will move)
2. Verify `src/features/review/README.md` accurately documents current cross-boundary imports
3. Author 7 missing READMEs: `src/app/`, `src/exporter/`, `src/queue/`, `src/scoring/`, `src/billing/`, `src/evidence/`, `src/inference/`

**Parallelizable:** All 7 missing READMEs can be authored in parallel.

> DOCUMENTATION GATE: Complete and merge Phase 0 before proceeding.

---

### Phase 1: Core Infrastructure Relocation

**Goal:** Move shared infrastructure to correct locations so features can import from `core/` instead of `api/`.

1. **Move `src/api/events/dataChangeContract.js` → `src/core/events/dataChangeContract.js`**
   - Update all imports (3+ features, `guiServer.js`)
   - Update `src/core/README.md`
2. **Move `src/api/helpers/domainBucketHelpers.js` → `src/core/domainBucketHelpers.js`**
   - Update imports
3. **Move `src/api/helpers/llmHelpers.js` → `src/core/llm/llmHelpers.js`**
   - Update imports
4. **Delete re-export shims** in `src/api/helpers/` (valueNormalizers, fileHelpers, requestHelpers)
   - Update any consumers to import from `src/shared/` directly

**Prerequisite:** Phase 0 complete.
**Parallelizable:** Steps 1-4 are independent.

> DOCUMENTATION GATE: Update `src/api/README.md`, `src/core/README.md`. Verify no broken imports.

---

### Phase 2: Review Route Consolidation (Critical Fix)

**Goal:** Eliminate bidirectional dependency between `src/api/` and `src/features/review/`.

1. **Move `src/api/reviewRouteSharedHelpers.js` → `src/features/review/api/reviewRouteSharedHelpers.js`**
2. **Move `src/api/reviewMutationResolvers.js` → `src/features/review/api/reviewMutationResolvers.js`**
3. **Move handler logic from `src/api/reviewItemRoutes.js` → `src/features/review/api/itemMutationHandlers.js`**
4. **Move handler logic from `src/api/reviewComponentMutationRoutes.js` → `src/features/review/api/componentMutationHandlers.js`**
5. **Move handler logic from `src/api/reviewEnumMutationRoutes.js` → `src/features/review/api/enumMutationHandlers.js`**
6. **Update `src/features/review/api/reviewRoutes.js`** to import from local handlers (remove `../../../api/` imports)
7. **Update `guiServer.js`** if needed (it already imports `registerReviewRoutes` from features)
8. **Delete emptied `src/api/review*Routes.js` files** (or leave as re-export shims temporarily)

**Prerequisite:** Phase 1 complete (dataChangeContract moved to `src/core/events/`).
**Testing:** Run full test suite after each step. Characterization tests already exist for review routes.

> DOCUMENTATION GATE: Update `src/features/review/README.md`, `src/api/README.md`, `docs/03-architecture/routing-and-gui.md`.

---

### Phase 3: Legacy Shim Cleanup

**Goal:** Remove the `src/review/` compatibility layer.

1. **Migrate 22 test files** to import from `src/features/review/domain/` or `src/features/review/index.js`
2. **Migrate `src/pipeline/seams/buildRunProductFinalizationContext.js`** to import from `src/features/review/`
3. **Migrate `src/cli/spec.js`** (3 imports) to import from `src/features/review/`
4. **Delete `src/review/` directory** entirely
5. **Retire `src/features/review-curation/`** — migrate 4 consumers to import from `src/features/review/index.js`; delete the feature directory

**Prerequisite:** Phase 2 complete.
**Parallelizable:** Test migration (step 1) can be done file-by-file in parallel.

> DOCUMENTATION GATE: Remove `src/review/` from architecture docs. Delete `src/features/review-curation/README.md`.

---

### Phase 4: Utils Dissolution

**Goal:** Eliminate the `src/utils/` junk drawer.

1. Move `common.js` generic parts to `src/shared/common.js`
2. Move domain files to owning feature/domain boundaries:
   - `candidateIdentifier.js` → `src/features/indexing/`
   - `fieldKeys.js` → `src/engine/` or `src/field-rules/`
   - `identityNormalize.js` → `src/features/indexing/`
   - `slotValueShape.js` → `src/features/indexing/`
   - `tierHelpers.js` → `src/engine/` or `src/categories/`
   - `componentIdentifier.js` → `src/features/catalog/` or `src/engine/`
3. Delete `src/utils/` directory
4. Relocate `src/components/library.js` → `src/features/catalog/componentLibrary.js`

**Prerequisite:** Phase 0 READMEs for target directories.
**Parallelizable:** Each file move is independent.

> DOCUMENTATION GATE: Update owning feature READMEs to include new files. Remove `src/utils/` from any docs.

---

### Phase 5: Queue State Decomposition (High Fix)

**Goal:** Extract dual-path storage adapter from `queueState.js`.

1. **Characterize:** Write golden-master tests for `loadQueueState`, `saveQueueState`, `recordQueueRunResult`, `recordQueueFailure` covering both SpecDb and JSON paths
2. **Extract:** `createQueueStorage({ specDb, storage, category })` adapter
3. **Reduce:** `queueState.js` calls adapter instead of branching
4. **Verify:** Full test suite green

**Prerequisite:** Phase 0 (queue README authored).
**Testing:** Characterization tests REQUIRED before extraction.

> DOCUMENTATION GATE: Update `src/queue/README.md`.

---

### Phase 6: Source Planner Decomposition (High Fix)

**Goal:** Extract queue manager and host tracker from `SourcePlanner`.

1. **Characterize:** Write boundary tests for `_resolveQueueRoute()`, queue selection, host budget
2. **Extract Phase A:** `plannerQueueManager.js` (4 queues + routing + eviction)
3. **Extract Phase B:** `plannerHostTracker.js` (blocks, counts, budgets)
4. **Reduce:** `SourcePlanner` delegates to both; owns orchestration only
5. **Verify:** Full test suite green

**Prerequisite:** Phase 0.
**Testing:** Characterization tests REQUIRED before extraction.

> DOCUMENTATION GATE: Update `src/planner/README.md`.

---

### Phase 7: Frontend README + Inline Style Cleanup

**Goal:** Document frontend architecture; fix inline style violations.

1. Author `tools/gui-react/src/README.md` (Purpose, Architecture, State Management, API Client, Design System)
2. Extract 15-20 fixed inline styles to utility/semantic classes

**Parallelizable with:** Phases 4-6 (independent of backend work).

> DOCUMENTATION GATE: New `tools/gui-react/src/README.md` complete before inline style fixes.

---

## E. Domain Contract Specifications

### E.1 — `src/features/review/` (Post Phase 2+3)

```markdown
## Purpose
Review feature: field-level review grid, component/enum review, override workflows,
candidate management, and all review mutation HTTP routes.

## Public API (The Contract)
Exported via `index.js`:
- `registerReviewRoutes(ctx)` — HTTP route registrar
- `createReviewRouteContext(options)` — DI context factory
- 44 domain functions via `domain/index.js` (grid builders, override workflow,
  candidate infrastructure, normalization, impact analysis, QA judge, suggestions)

## Dependencies
- Allowed: `src/core/`, `src/shared/`, `src/db/` (via injected specDb),
  `src/engine/` (field rules), `src/field-rules/`
- Forbidden: Other features, `src/api/` (all HTTP infra self-contained)

## Mutation Boundaries
- SpecDb: item state, component state, enum lists, key review, overrides (via injected specDb)
- Filesystem: override artifacts, review layout artifacts (via injected storage)
- WebSocket: broadcast mutations via injected `broadcastWs`
- Events: emit data-change events via `src/core/events/dataChangeContract.js`

## Domain Invariants
- All mutations go through service layer; no direct DB access in handlers
- Override acceptance requires QA judge validation
- Component cascade analysis must complete before component mutations commit
- Payload shape is forward-investment (carries fields for future stages; do not trim)
```

---

### E.2 — `src/queue/` (Post Phase 5)

```markdown
## Purpose
Product queue lifecycle management: scoring, selection, state transitions,
and persistence (SpecDb or JSON fallback).

## Public API (The Contract)
- `loadQueueState(storage, category, specDb?)` → queue state
- `saveQueueState(storage, category, state)` → void
- `selectNextQueueProduct(state, config)` → product row
- `syncQueueFromInputs(state, inputs, config)` → updated state
- `recordQueueRunResult(state, product, result, specDb?)` → void
- `recordQueueFailure(state, product, error, specDb?)` → void
- `listQueueProducts(state, status?)` → product rows
- `clearQueueByStatus(state, status)` → void

## Dependencies
- Allowed: `src/shared/`, `src/features/catalog/` (identity gate, canonical index)
- Forbidden: `src/api/`, `src/pipeline/`, other features

## Mutation Boundaries
- SpecDb: queue_products table (via adapter)
- Filesystem: queue state JSON (via storage)

## Domain Invariants
- Score computation is deterministic for same inputs
- Product selection respects priority ordering
- State transitions: queued → running → done|failed (no invalid transitions)
- Identity gate validation on ingest (rejects products without canonical identity)
```

---

### E.3 — `src/core/events/` (Post Phase 1)

```markdown
## Purpose
Event infrastructure for mutation broadcasting and real-time UI synchronization.

## Public API (The Contract)
- `DATA_CHANGE_EVENT_DOMAIN_MAP` — event type → affected domain mapping
- `createDataChangePayload(options)` → standardized event payload
- `emitDataChange(options)` → broadcasts via WebSocket
- `isDataChangePayload(obj)` → boolean type guard

## Dependencies
- Allowed: None (leaf module)
- Forbidden: All feature modules, `src/api/`, `src/db/`

## Domain Invariants
- Event payloads are immutable after creation
- All mutation broadcasts use standardized payload shape
- Event domain mapping is exhaustive (every event type has a domain)
```

---

### E.4 — `src/app/` (Post Phase 0)

```markdown
## Purpose
Application entrypoints and HTTP request dispatch pipeline.

## Public API (The Contract)
- `createApiPathParser(options)` — URL path → parts/params parser
- `createApiRouteDispatcher(handlers)` — ordered handler chain executor
- `createApiHttpRequestHandler(options)` — top-level HTTP handler
- `GUI_API_ROUTE_ORDER` — canonical route registration order

## Dependencies
- Allowed: `src/api/` (server composition), `src/features/*/api/` (route registrars)
- Forbidden: Domain modules, `src/db/`, `src/pipeline/`

## Domain Invariants
- Route order is deterministic (GUI_API_ROUTE_ORDER)
- First matching handler wins (no multiple dispatch)
- All API errors caught and logged at top level
```

---

### E.5 — `src/exporter/` (Post Phase 0)

```markdown
## Purpose
Run artifact export: S3/local storage writes for raw pages, schema packets,
summaries, screenshots, and compressed archives.

## Public API (The Contract)
- `exportRunArtifacts(options)` — write all artifacts for a completed run
- `writeFinalOutputs(options)` — write summary + schema packets

## Dependencies
- Allowed: `src/core/`, `src/shared/`, `src/s3/` (storage adapter)
- Forbidden: `src/api/`, `src/db/`, feature modules

## Domain Invariants
- Export is idempotent (same inputs produce same outputs)
- All writes use gzip compression where applicable
- Screenshot artifacts written alongside data artifacts
```

---

### E.6 — `src/scoring/` (Post Phase 0)

```markdown
## Purpose
Consensus scoring, quality assessment, and candidate list operations.

## Public API (The Contract)
- Consensus phase: candidate agreement scoring across sources
- Quality scoring: field-level confidence computation
- List union: candidate list merging and deduplication

## Dependencies
- Allowed: `src/shared/`, `src/utils/` (until dissolved)
- Forbidden: `src/api/`, `src/db/`, feature modules

## Domain Invariants
- Scoring is deterministic for same inputs
- Consensus requires minimum source count
- Quality scores normalized to 0.0-1.0 range
```

---

### E.7 — `src/billing/` (Post Phase 0)

```markdown
## Purpose
Usage tracking and cost accounting for LLM calls, fetch operations, and pipeline runs.

## Public API (The Contract)
- Cost aggregation per run/round
- LLM token usage tracking
- Billing summary generation

## Dependencies
- Allowed: `src/shared/`, `src/core/`
- Forbidden: `src/api/`, `src/db/` (receives data via parameters)

## Domain Invariants
- Cost calculations are additive (never subtract)
- Token counts are exact (not estimated)
```

---

### E.8 — `src/evidence/` (Post Phase 0)

```markdown
## Purpose
Evidence tier classification and evidence pack assembly for field candidates.

## Public API (The Contract)
- Evidence tier resolution (manufacturer > lab > retailer > candidate)
- Evidence pack construction from source extractions

## Dependencies
- Allowed: `src/shared/`, `src/categories/` (tier constants)
- Forbidden: `src/api/`, `src/db/`

## Domain Invariants
- Tier ordering is strict (manufacturer highest, candidate lowest)
- Evidence packs are immutable after construction
```

---

### E.9 — `src/inference/` (Post Phase 0)

```markdown
## Purpose
LLM inference orchestration for field-level extraction and validation.

## Public API (The Contract)
- `inferField(options)` — LLM-based field value inference

## Dependencies
- Allowed: `src/core/llm/`, `src/shared/`, `src/engine/` (field rules)
- Forbidden: `src/api/`, `src/db/`, `src/pipeline/`

## Domain Invariants
- Inference results include confidence scores
- LLM calls are tracked for billing
- Inference is stateless (no side effects beyond LLM API calls)
```

---

## F. Post-Refactor Test Traceability

### F.1 — Current Test Coverage Map

| Module | Test Files | Coverage Type | Gaps |
|--------|-----------|---------------|------|
| `src/features/review/domain/` | `test/componentImpact*.test.js`, `test/keyReviewState.test.js`, `test/qaJudge.test.js`, `test/varianceEvaluator.test.js`, `test/reviewGrid*.test.js`, `test/overrideWorkflow*.test.js` + 16 others | Unit + characterization | Tests use legacy shim paths (migrate in Phase 3) |
| `src/features/review/api/` | `test/reviewRouteContext.test.js`, `test/reviewRoutesDataChangeContract.test.js`, `test/reviewEnumMutationService.characterization.test.js` | Contract + characterization | No test for field mutation handlers; no integration test for full route chain |
| `src/features/review/services/` | `test/reviewItemMutation*.test.js`, `test/reviewComponentMutation*.test.js` | Unit | Good coverage |
| `src/features/review/contracts/` | `test/contracts/reviewFieldContract.test.js` | Contract | Shape-only; not runtime-enforced |
| `src/queue/queueState.js` | `test/queueState*.test.js` | Unit | **Gap: No characterization test for dual-path (SpecDb vs JSON) behavior** — needed before Phase 5 |
| `src/planner/sourcePlanner.js` | `test/planner*.test.js`, `test/sourcePlanner*.test.js` | Unit + integration | **Gap: No isolated test for `_resolveQueueRoute()` routing logic** — needed before Phase 6 |
| `src/pipeline/runProduct.js` | `test/pipeline*.test.js`, `test/apiProcessRuntimeWiring.test.js` | Integration + wiring | Good coverage via DI seams |
| `src/runner/runUntilComplete.js` | `test/runUntilComplete*.test.js`, `test/convergence*.test.js` | Unit + integration | Good coverage |
| `src/api/` routes | `test/api*.test.js`, `test/reviewRoute*.test.js` | Integration | Review routes covered; some infra routes untested |
| `src/db/specDb.js` | `test/specDb*.test.js`, `test/apiSpecDbRuntimeWiring.test.js` | Unit + integration + wiring | Excellent coverage via store decomposition |
| `src/engine/fieldRulesEngine.js` | `test/fieldRulesEngine*.test.js` | Unit | Good coverage |
| `src/shared/settingsRegistry.js` | `test/settingsRegistry*.test.js`, `test/settingsAccessor*.test.js` | Unit + contract | Excellent coverage |
| `src/indexlab/needsetEngine.js` | `test/needset*.test.js` | Unit + contract | Good coverage |
| `src/fetcher/playwrightFetcher.js` | `test/playwright*.test.js`, `test/dynamicCrawler*.test.js` | Unit + integration | Adequate |
| `src/categories/loader.js` | `test/categoryConfig*.test.js` | Unit | **Gap: Tier resolution edge cases not isolated** |
| `src/exporter/` | `test/exporter*.test.js` | Unit | Adequate |
| `src/utils/` | Various test files | Unit | Tests import from `src/utils/` — must update paths in Phase 4 |

### F.2 — Characterization Tests Needed Before Refactoring

| Module | Why Characterization Needed | Priority |
|--------|---------------------------|----------|
| `src/queue/queueState.js` | Dual-path SpecDb/JSON behavior must be locked before adapter extraction | **Required for Phase 5** |
| `src/planner/sourcePlanner.js` | Queue routing logic (`_resolveQueueRoute`) must be characterized before extraction | **Required for Phase 6** |
| `src/api/reviewItemRoutes.js` | Handler behavior must be locked before moving into feature | **Recommended for Phase 2** (existing characterization tests may suffice — verify) |

### F.3 — Safe to Split Now (No Characterization Needed)

| Module | Why Safe | Existing Coverage |
|--------|----------|-------------------|
| `src/api/events/dataChangeContract.js` | Pure move (no logic change) | `test/reviewRoutesDataChangeContract.test.js` |
| `src/review/*.js` shims | Pure re-exports (import path change only) | All 22 test files validate via shims |
| `src/utils/*.js` | Pure moves (no logic change) | Existing tests validate behavior |
| `src/features/review-curation/` | Pure re-export facade (4 consumers redirect) | Consumers tested independently |
| `src/api/helpers/` shims | Delete re-exports; consumers import from `src/shared/` | `src/shared/` tests cover behavior |

---

## Architectural Strengths (Preserve These)

The audit found significant areas of **strong architecture** that should be preserved and extended:

1. **Pipeline DI Pattern:** The 3-step DI pattern (callsite builder → context builder → runtime call) with `DEFAULT_DEPS` overrides is excellent. 213 orchestration modules are independently testable via DI without mocking frameworks. Preserve this pattern.

2. **Settings Registry SSOT:** `src/shared/settingsRegistry.js` (266 LOC) is a model O(1) feature scaling implementation. 4 registries (runtime, convergence, UI, storage) with centralized defaults. All settings flow from this single source.

3. **SpecDb Facade:** `src/db/specDb.js` (694 LOC) is a clean facade over 11 store modules. Constructor wiring via DI. Each store independently testable. This decomposition is complete and sound.

4. **Feature-First Architecture:** 10 feature directories with explicit `index.js` public APIs and README contracts. Cross-feature imports go through public APIs only. No circular dependencies between features.

5. **API Composition Root:** Pure Node HTTP server with no framework lock-in. DI-based route contexts created at boot. Composable handler chains. This is architecturally strong.

6. **Frontend TypeScript Discipline:** Zero `any`, zero `@ts-ignore`, zero `@ts-nocheck`. Strict mode enabled. Auto-generated types from backend registry. Centralized API client with validated request variants.

7. **Test Infrastructure:** 7,692 tests covering unit, integration, wiring, characterization, and contract boundaries. `node --test` runner with no framework dependencies.

8. **Domain README Coverage:** 21 of 28 major boundaries have contract READMEs with all 4 required sections. This is significantly above average.

---

## Summary

**Critical:** 1 finding (review route boundary violation — bidirectional cross-boundary dependency)
**High:** 3 findings (queue state duplication, source planner monolith, legacy shim wall)
**Medium:** 6 findings (utils junk drawer, event misplacement, review-curation phantom, missing READMEs, API helper misplacement, frontend README)
**Low:** 2 findings (runtime bridge boilerplate, component library misplacement)

**Execution path:** 8 phases, sequenced by risk reduction and dependency untangling. Phases 0 (documentation baseline) and 1 (infrastructure relocation) unblock Phase 2 (critical fix). Phases 4-7 are parallelizable. Each phase has a documentation gate.

**Post-execution state:** A codebase where every domain boundary has a README contract, every feature is traceable from entry point to data response via documented file paths, every module's allowed imports/exports/mutation surfaces are explicitly defined, and an LLM agent can work in any directory using only the local README and the code in that directory.
