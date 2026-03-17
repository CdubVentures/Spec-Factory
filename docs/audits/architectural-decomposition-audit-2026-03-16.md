# Spec Factory — Architectural Decomposition Audit

**Date:** 2026-03-16
**Scope:** Full codebase structural audit — decomposition, dependency health, documentation, runtime risk, test traceability
**Codebase:** ~70,536 LOC backend (JS ESM), ~45,600 LOC frontend (TypeScript React), 769 test files (45,694 LOC)

---

## 1. Executive Summary

Spec Factory is a **70K-LOC backend + 45K-LOC frontend** system with strong architectural foundations in its feature boundaries, composition-root DI, and settings SSOT — but suffering from **organic sprawl** that undermines the declared feature-first architecture. The codebase has grown to **50+ top-level `src/` directories** while the CLAUDE.md architecture prescribes `core/`, `shared/`, `features/`, and bounded domain modules.

**What is holding:**
- Feature boundaries are clean (zero cross-feature imports in both backend and frontend)
- Settings/config system follows SSOT with explicit contracts
- Server composition uses proper DI via context factories
- Frontend TypeScript discipline is excellent (zero `any`, zero escape hatches)
- 16 domain boundaries have compliant README contracts
- 769 test files providing substantial coverage

**What is collapsing under scale:**
- 35+ non-canonical directories outside `core/shared/features/` with no boundary governance
- 30 files exceed the 700-LOC soft limit (top: 2,995 LOC)
- 39 directories have zero README documentation — agents arriving blind
- 1 critical dependency inversion (`core/` → `features/`)
- 20+ boundary violations (`features/` → `api/` helpers)
- Key orchestration modules use 40+ injected parameters with implicit phase contracts
- 5 god-object files mixing I/O, validation, state management, and orchestration

**Risk posture:** The system works and produces correct results, but change safety is degrading. The top 10 largest files account for ~15,000 LOC and sit on production-critical paths (consensus scoring, field validation, CLI dispatch, review data, identity gating). A defect in any of these has blast radius across the entire pipeline.

---

## 2. Severity-Ranked Findings

### Finding F1: Non-Canonical Directory Sprawl (35+ orphan modules)

**Severity:** CRITICAL
**Affected:** 35+ directories under `src/` outside `core/shared/features/`
**Why it matters:** The declared architecture (`core/` → `shared/` → `features/`) is fiction. In practice, `src/` has 50+ peer directories with no declared dependency rules, no barrel exports, and no README contracts. An LLM agent (or new developer) cannot determine what may import what, what the public API is, or what invariants apply.
**Likely failure mode:** Uncontrolled coupling growth. Any new code can import from any directory. Boundary violations accumulate silently. Refactoring becomes unsafe because the blast radius of any change is unknown.
**Recommended direction:** Classify all 35+ orphan directories into one of three buckets: (a) promote to `src/features/<name>/` with full contracts, (b) consolidate into `src/core/<subsystem>/`, or (c) keep as domain modules with explicit README contracts and allowed-dependency declarations. The key 14 high-file-count directories need contracts first.
**Documentation impact:** `docs/01-project-overview/folder-map.md` requires full rewrite. Every reclassified directory needs a README contract. `docs/03-architecture/backend-structure.md` needs updated module map.

**Key orphan directories (by file count and pipeline criticality):**

| Directory | Files | LOC (est.) | Pipeline Role |
|-----------|-------|-----------|---------------|
| `src/indexlab/` | 17 | ~3,500 | Run-artifact packets, runtime bridge |
| `src/ingest/` | 13 | ~4,500 | Category compilation, CSV ingest |
| `src/engine/` | 13 | ~2,800 | Field rules, validation, evidence audit |
| `src/fetcher/` | 11 | ~3,200 | HTTP/Playwright/Crawlee fetch |
| `src/review/` | 10 | ~5,000 | Review grid, override workflow |
| `src/field-rules/` | 10 | ~2,500 | Rule compilation, session cache |
| `src/intel/` | 9 | ~2,800 | Source intelligence |
| `src/concurrency/` | 9 | ~1,800 | Fetch scheduling, throttling |
| `src/scoring/` | 7 | ~2,400 | Consensus, quality scoring |
| `src/research/` | 7 | ~1,800 | SERP triage |
| `src/publish/` | 7 | ~1,850 | Publishing pipeline |
| `src/planner/` | 6 | ~1,400 | Source planning |
| `src/cli/` | 7 | ~2,800 | CLI entry point |
| `src/utils/` | 7 | 927 | Junk drawer (80+ dependents) |

---

### Finding F2: God-Object Files on Critical Paths

**Severity:** CRITICAL
**Affected files (LOC):**

| File | LOC | Mixed Concerns |
|------|-----|----------------|
| `src/testing/testDataProvider.js` | 2,995 | Test fixtures + factory + data generation |
| `src/review/componentReviewData.js` | 2,659 | Review data assembly + grid state + I/O |
| `src/cli/spec.js` | 1,989 | CLI dispatch + 30+ command handlers |
| `src/db/seed.js` | 1,946 | DB seeding + schema + migration |
| `src/indexlab/indexingSchemaPackets.js` | 1,333 | Packet validation + coercion + assembly |
| `src/features/indexing/validation/identityGate.js` | 1,266 | Identity consensus + matching + evidence |
| `src/fetcher/playwrightFetcher.js` | 1,231 | Browser automation + page parsing + screenshot |
| `src/ingest/categoryCompile.js` | 1,208 | Category compilation + file I/O + validation |
| `src/review/reviewGridData.js` | 1,194 | Grid assembly + query + sorting + filtering |
| `src/intel/sourceIntel.js` | 1,183 | Source intelligence + host scoring + caching |

**Why it matters:** These files sit on production execution paths. `identityGate.js` gates every product identity decision. `consensusEngine.js` determines every field value. `spec.js` is the CLI entry point for all operations. A defect in any of these cascades through the pipeline.
**Likely failure mode:** Merge conflicts, regressions from unrelated changes touching the same file, difficulty writing focused tests, cognitive overload during code review.
**Recommended direction:** Apply proven decomposition patterns (Pattern A: Factory/DI for stateful, Pattern B: Direct Export for pure) already used successfully on `indexlabDataBuilders` and `runtimeOpsDataBuilders`.
**Documentation impact:** Each split creates new module boundaries requiring README contracts. Parent module README needs update to reflect delegation.

---

### Finding F3: Core-to-Feature Dependency Inversion

**Severity:** CRITICAL
**Affected:** `src/core/config/configPostMerge.js` line 20
```javascript
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../features/settings-authority/runtimeSettingsRoutePut.js';
```
**Why it matters:** `core/` is the foundation layer — it must not depend on `features/`. This inversion means config post-merge (called at every startup) depends on a feature module. If `settings-authority` changes its route contract, `core/config/` breaks. The dependency arrow points the wrong way.
**Likely failure mode:** Circular dependency if `settings-authority` ever imports from `core/config/` (which it likely will for defaults). Build-time or runtime import cycles.
**Recommended direction:** Extract `RUNTIME_SETTINGS_ROUTE_PUT` clamping ranges into `src/shared/settingsRanges.js` or `src/core/config/settingsRanges.js`. Both `configPostMerge.js` and `runtimeSettingsRoutePut.js` import from the shared location.
**Documentation impact:** `src/core/README.md` dependencies section needs update. `src/shared/README.md` public API needs update if ranges move there. `src/features/settings-authority/README.md` dependencies section needs update.

---

### Finding F4: Feature-to-API Boundary Violations (20+ files)

**Severity:** HIGH
**Affected:** 20+ files in `src/features/` importing from `src/api/helpers/`

Key violations:
- `src/features/indexing/api/builders/*.js` → `src/api/helpers/valueNormalizers.js`
- `src/features/indexing/api/builders/*.js` → `src/api/helpers/fileHelpers.js`
- `src/features/indexing/api/builders/*.js` → `src/api/helpers/httpPrimitives.js`
- `src/features/catalog/api/*.js` → `src/api/events/dataChangeContract.js`
- `src/features/review/api/reviewRouteContext.js` → `src/api/reviewContextHelpers.js`

**Why it matters:** Features should depend on `core/` and `shared/`, not on `api/`. The `api/helpers/` utilities (`valueNormalizers`, `fileHelpers`, `httpPrimitives`) are shared infrastructure masquerading as API-layer code. This couples features to the HTTP layer unnecessarily.
**Likely failure mode:** Moving or refactoring API helpers breaks feature code. Features cannot be tested without the API layer present.
**Recommended direction:** Promote `valueNormalizers.js`, `fileHelpers.js`, and `httpPrimitives.js` from `src/api/helpers/` to `src/shared/`. Move `dataChangeContract.js` from `src/api/events/` to `src/shared/events/` or `src/core/events/`.
**Documentation impact:** `src/api/README.md` public API section needs update (removes helpers from API contract). `src/shared/README.md` needs update (adds promoted helpers).

---

### Finding F5: Consensus Engine — 310-Line Function with Mixed Scoring/Acceptance/Clustering

**Severity:** HIGH
**Affected:** `src/scoring/consensusEngine.js` (784 LOC)
**Why it matters:** `runConsensusEngine()` is a single 310-line function that clusters candidates, scores them, applies tier weighting, checks pass targets, and makes acceptance decisions — all inline. This is the most critical domain function in the pipeline: it determines every field value for every product. A scoring bug here corrupts all published specs.
**Likely failure mode:** Regression from changes to one concern (e.g., tier weighting) breaking another (e.g., acceptance logic). Difficulty testing clustering independently from scoring.
**Recommended direction:** Extract into: `clusterCandidates()`, `scoreClusters()`, `evaluatePassTargets()`, `decideAcceptance()`. Each is a pure function, independently testable.
**Documentation impact:** `src/scoring/README.md` needs creation with public API contract.

---

### Finding F6: Extreme Dependency Injection in Orchestration (40+ params)

**Severity:** HIGH
**Affected:** `src/features/indexing/orchestration/finalize/`
- `runProductFinalizationDerivation.js` (476 LOC) — 40+ injected function parameters
- `createProductFinalizationDerivationRuntime.js` (467 LOC) — 30+ phase step functions
- `createProductCompletionRuntime.js` (429 LOC)

**Why it matters:** DI is good for testability, but 40+ injected parameters means no one can read the function signature and understand what it does. Phase contracts are implicit — there is no schema for what a phase receives or returns. Adding a new phase requires threading parameters through 3+ files.
**Likely failure mode:** Wrong parameter wiring (silent bugs), difficulty onboarding, parameter naming drift between injector and consumer.
**Recommended direction:** Bundle related injections into phase runner objects: `{ contextBuilders: {...}, phaseRunners: {...}, domainLogic: {...} }`. Define explicit phase contracts with Zod schemas.
**Documentation impact:** `src/features/indexing/orchestration/DOMAIN.md` needs update with phase contract definitions.

---

### Finding F7: CLI Entry Point God-Object

**Severity:** HIGH
**Affected:** `src/cli/spec.js` (1,989 LOC)
**Why it matters:** Single file handles 30+ CLI commands. Every command handler is inline in one massive dispatch. Adding, modifying, or testing any CLI command requires navigating a 2,000-line file.
**Likely failure mode:** Merge conflicts when two developers modify different commands. Cannot test individual commands in isolation.
**Recommended direction:** Extract each command group to `src/cli/commands/<group>.js` (e.g., `runCommands.js`, `publishCommands.js`, `reviewCommands.js`). `spec.js` becomes a thin dispatcher.
**Documentation impact:** `src/cli/README.md` needs creation with command registry.

---

### Finding F8: Review Data Layer — Two Files Totaling 3,853 LOC

**Severity:** HIGH
**Affected:**
- `src/review/componentReviewData.js` (2,659 LOC)
- `src/review/reviewGridData.js` (1,194 LOC)

**Why it matters:** Review data assembly mixes query building, grid state management, I/O, sorting, filtering, and lane computation in monolithic files. These power the review workbench UI — the primary human authoring surface.
**Likely failure mode:** Review grid bugs from unrelated data assembly changes. Cannot test grid sorting without full data pipeline. Performance regressions from accidental N+1 queries.
**Recommended direction:** Decompose along concern: `reviewDataQueries.js` (DB queries), `reviewGridBuilder.js` (grid assembly), `reviewLaneComputer.js` (lane state), `reviewSorting.js` (sort/filter).
**Documentation impact:** `src/review/README.md` needs creation. `src/features/review/README.md` needs update to reference decomposed modules.

---

### Finding F9: Missing README Contracts (39 directories)

**Severity:** HIGH
**Affected:** 39 directories under `src/` have zero documentation
**Why it matters:** CLAUDE.md requires every domain boundary to have a README acting as a "local system prompt." Without these, an LLM agent arriving at `src/engine/`, `src/indexlab/`, or `src/fetcher/` has no guidance — it must infer contracts from code, which is slow and error-prone.
**Likely failure mode:** LLM agents make incorrect assumptions about module boundaries, create wrong imports, or modify internal code that should be accessed through public API.
**Recommended direction:** Create README contracts for the 14 highest-impact directories first (see Finding F1 table), then expand to remaining 25.
**Documentation impact:** This IS the documentation impact — 39 new README files needed.

---

### Finding F10: `src/utils/` Junk Drawer (927 LOC, 80+ dependents)

**Severity:** MEDIUM
**Affected:** `src/utils/` — 7 files, 927 LOC
- `identityNormalize.js` (233 LOC) — domain-specific normalization
- `slotValueShape.js` (202 LOC) — value shape validation
- `common.js` (149 LOC) — generic utilities (`nowIso`, etc.)
- `fieldKeys.js` (142 LOC) — field key handling
- `candidateIdentifier.js` (139 LOC) — candidate ID building
- `tierHelpers.js` (48 LOC) — tier utilities
- `componentIdentifier.js` (14 LOC) — component ID building

**Why it matters:** CLAUDE.md explicitly prohibits `src/utils` as a dumping ground. These are imported by 80+ files across the codebase. `identityNormalize.js` and `candidateIdentifier.js` are domain logic masquerading as utilities.
**Recommended direction:** Move domain-specific files (`identityNormalize`, `candidateIdentifier`, `componentIdentifier`, `slotValueShape`) to `src/engine/` or appropriate feature. Move truly generic (`common.js`, `tierHelpers.js`) to `src/shared/`. Move `fieldKeys.js` to `src/shared/`.
**Documentation impact:** All 80+ import sites need path updates. `src/shared/README.md` needs update.

---

### Finding F11: userSettingsService.js God-Object (700 LOC)

**Severity:** MEDIUM
**Affected:** `src/features/settings-authority/userSettingsService.js` (~700 LOC)
**Why it matters:** Mixes file I/O, migration, validation, snapshots, and apply logic in one file. Settings persistence is a trust boundary — any bug here can corrupt user settings or cause config drift.
**Recommended direction:** Split into: `userSettingsFileService.js` (I/O + migration), `userSettingsSnapshotService.js` (snapshot + derive + apply).
**Documentation impact:** `src/features/settings-authority/README.md` public API section needs update.

---

### Finding F12: `categories/loader.js` Mixed Concerns (691 LOC)

**Severity:** MEDIUM
**Affected:** `src/categories/loader.js` (691 LOC)
**Why it matters:** Mixes caching (LRU), file I/O, config merging, host flattening, source registry validation, and field group metadata attachment. Called on every category load — a hot path.
**Recommended direction:** Extract: `loadCategoryArtifacts.js` (file reads), `buildCategoryConfig.js` (aggregation/merge), `validateSourceRegistry.js` (gate checks).
**Documentation impact:** `src/categories/README.md` needs creation.

---

### Finding F13: LLM Routing Config Branching (540 LOC)

**Severity:** MEDIUM
**Affected:** `src/core/llm/client/routing.js` (540 LOC)
**Why it matters:** 4 roles x 2 tiers x multiple config key lookups creates dense branching. Hardcoded provider base URLs and token caps. Role-to-reason mapping is implicit.
**Recommended direction:** Extract role registry pattern with declarative role definitions. Move provider defaults to config.
**Documentation impact:** `src/core/README.md` needs update to document LLM routing contract.

---

### Finding F14: Frontend Components Over 1,000 LOC

**Severity:** MEDIUM
**Affected (tools/gui-react/src/):**

| Component | LOC |
|-----------|-----|
| `features/studio/BrandManager.tsx` | 1,392 |
| `features/studio/EditableComponentSource.tsx` | 1,375 |
| `features/component-review/ComponentReviewDrawer.tsx` | 1,372 |
| `features/review/ReviewPage.tsx` | 1,060 |
| `features/llm-settings/LlmSettingsPage.tsx` | 998 |

**Why it matters:** Large components increase cognitive load and merge conflict risk. Complex state derivations embedded in render logic.
**Recommended direction:** Extract sub-components for discrete UI sections. Move complex state derivations to custom hooks.
**Documentation impact:** No doc changes required — frontend components don't have README contracts.

---

### Finding F15: Field Rules Engine Facade (707 LOC, 270-line function)

**Severity:** MEDIUM
**Affected:** `src/engine/fieldRulesEngine.js`
**Why it matters:** `normalizeCandidate()` is a 270-line multi-stage pipeline with 8+ branching paths. While it correctly delegates to specialized validators, the orchestration logic is dense and hard to test in isolation.
**Recommended direction:** Extract the normalization pipeline stages into a pipeline pattern: each stage is a function that takes (candidate, context) and returns (candidate, context).
**Documentation impact:** `src/engine/README.md` needs creation.

---

## 3. Recommended Module Split Plan

### Split S1: `src/cli/spec.js` (1,989 LOC) → Command Group Modules

**Current overload:** CLI dispatch + 30+ inline command handlers + argument parsing + output formatting
**Proposed boundaries:**

| New Module | Responsibility | Moves Out |
|------------|---------------|-----------|
| `src/cli/commands/runCommands.js` | Run/index/benchmark commands | ~400 LOC |
| `src/cli/commands/publishCommands.js` | Publish/export commands | ~300 LOC |
| `src/cli/commands/reviewCommands.js` | Review/override/approve commands | ~300 LOC |
| `src/cli/commands/categoryCommands.js` | Category/compile/seed commands | ~300 LOC |
| `src/cli/commands/infoCommands.js` | Status/info/diagnostic commands | ~200 LOC |
| `src/cli/spec.js` (remaining) | Dispatcher + arg parser | ~400 LOC |

**Post-split contract for `src/cli/spec.js`:**
- **Exports:** `main(argv)` — CLI entry point
- **Imports allowed:** `src/cli/commands/*`, `src/core/config/`
- **Mutation:** stdout/stderr only; delegates all side effects to commands
- **Invariants:** Every command is a pure function `(args, config) → Promise<result>`

**Documentation updates:**
- Create `src/cli/README.md` with command registry
- Update `docs/01-project-overview/folder-map.md`

---

### Split S2: `src/scoring/consensusEngine.js` (784 LOC) → Scoring Pipeline Modules

**Current overload:** Candidate clustering + tier-weighted scoring + pass target calculation + acceptance decision + policy reducers
**Proposed boundaries:**

| New Module | Responsibility | LOC |
|------------|---------------|-----|
| `src/scoring/candidateClusterer.js` | Group candidates by normalized value, build cluster metadata | ~120 |
| `src/scoring/clusterScorer.js` | Apply tier/method weights, compute weighted scores per cluster | ~150 |
| `src/scoring/passTargetCalculator.js` | Determine required pass threshold per field (identity/editorial/commonly-wrong) | ~80 |
| `src/scoring/acceptanceDecider.js` | Apply strict/relaxed acceptance logic with credible domain checks | ~100 |
| `src/scoring/consensusEngine.js` (remaining) | Orchestrate the pipeline; call each stage in order | ~200 |

**Post-split contract for `src/scoring/consensusEngine.js`:**
- **Exports:** `runConsensusEngine(config, fieldCandidates, provenance)`, `applySelectionPolicyReducers(consensus, config)`
- **Imports allowed:** `src/scoring/*` (sibling modules), `src/utils/` (until F10 resolved)
- **Mutation:** None — pure function returning consensus result
- **Invariants:** Every field gets exactly one consensus decision. Score is always [0, 1]. Anchor fields bypass scoring.

**Documentation updates:**
- Create `src/scoring/README.md`

---

### Split S3: `src/review/componentReviewData.js` (2,659 LOC) → Review Data Pipeline

**Current overload:** DB queries + grid assembly + lane state computation + I/O + sorting + filtering + override merging
**Proposed boundaries:**

| New Module | Responsibility | LOC |
|------------|---------------|-----|
| `src/review/reviewDataQueries.js` | Raw DB/file queries for review data | ~500 |
| `src/review/reviewGridBuilder.js` | Grid row assembly from raw data | ~600 |
| `src/review/reviewLaneComputer.js` | Lane state machine (pending/approved/rejected/escalated) | ~400 |
| `src/review/reviewSorting.js` | Sort/filter logic for grid display | ~200 |
| `src/review/componentReviewData.js` (remaining) | Orchestration: query → build → compute → sort | ~500 |

**Post-split contract:** Each module is a pure function or async query — no shared mutable state.

**Documentation updates:**
- Create `src/review/README.md`

---

### Split S4: `src/features/indexing/validation/identityGate.js` (1,266 LOC)

**Current overload:** Identity consensus matching + evidence evaluation + gate decision + confidence scoring
**Proposed boundaries:**

| New Module | Responsibility | LOC |
|------------|---------------|-----|
| `identityMatcher.js` | String/token-based identity matching (brand, model, variant) | ~400 |
| `identityEvidenceEvaluator.js` | Evidence strength evaluation for identity claims | ~300 |
| `identityConfidence.js` | Confidence score computation from match + evidence | ~150 |
| `identityGate.js` (remaining) | Gate orchestration: match → evaluate → score → decide | ~400 |

**Documentation updates:**
- Update `src/features/indexing/README.md` public API
- Update `src/features/indexing/orchestration/DOMAIN.md`

---

## 4. Highest-Value Refactor First

### Refactor R1: Extract Clamping Ranges from `features/` to `shared/` (Fixes F3)

This is the single highest-value refactor because it:
1. Fixes the only `core/ → features/` dependency inversion (CRITICAL)
2. Is surgical (one file move, two import updates)
3. Eliminates the most dangerous coupling in the dependency graph
4. Unlocks safe changes to both `configPostMerge.js` and `runtimeSettingsRoutePut.js` independently

**Before:**
```javascript
// src/core/config/configPostMerge.js (line 20)
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../features/settings-authority/runtimeSettingsRoutePut.js';

// src/features/settings-authority/runtimeSettingsRoutePut.js
export const RUNTIME_SETTINGS_ROUTE_PUT = {
  intRangeMap: { llmMaxOutputTokensPlan: { cfgKey: 'llmMaxOutputTokensPlan', min: 256, max: 65536 }, ... },
  floatRangeMap: { ... },
  stringEnumMap: { ... },
  boolMap: { ... },
  // ... 289 LOC of contract definitions
};
```

**After:**
```javascript
// NEW FILE: src/shared/settingsRanges.js
// Extract ONLY the clamping ranges and enum constraints (the data contract)
export const SETTINGS_CLAMPING_RANGES = {
  intRangeMap: { llmMaxOutputTokensPlan: { cfgKey: 'llmMaxOutputTokensPlan', min: 256, max: 65536 }, ... },
  floatRangeMap: { ... },
  stringEnumMap: { ... },
  boolMap: { ... },
};

// src/core/config/configPostMerge.js (line 20 — FIXED)
import { SETTINGS_CLAMPING_RANGES } from '../../shared/settingsRanges.js';

// src/features/settings-authority/runtimeSettingsRoutePut.js (FIXED)
import { SETTINGS_CLAMPING_RANGES } from '../../shared/settingsRanges.js';
export const RUNTIME_SETTINGS_ROUTE_PUT = {
  ...SETTINGS_CLAMPING_RANGES,
  // route-specific additions (string trim, string free, etc.)
  stringTrimMap: { ... },
  stringFreeMap: { ... },
};
```

**Documentation impact:**
- Update `src/shared/README.md` — add `settingsRanges.js` to public API
- Update `src/core/README.md` — remove `features/` from dependencies
- Update `src/features/settings-authority/README.md` — add `shared/` to dependencies

---

## 5. Practical Implementation Order

### Phase 1: Foundation Safety (Weeks 1-2)

| Step | Target | Action | Prerequisites | Parallelizable |
|------|--------|--------|---------------|----------------|
| 1.1 | F3 | Extract clamping ranges to `src/shared/settingsRanges.js` | None | Yes |
| 1.2 | F4 | Promote `api/helpers/{valueNormalizers,fileHelpers,httpPrimitives}.js` to `src/shared/` | None | Yes (with 1.1) |
| 1.3 | F9 (tier 1) | Write README contracts for `src/engine/`, `src/indexlab/`, `src/field-rules/`, `src/fetcher/`, `src/planner/` | Read code in each | Yes (with 1.1, 1.2) |
| 1.4 | F10 | Relocate `src/utils/` domain files to `src/engine/` and generic files to `src/shared/` | 1.2 | After 1.2 |

**DOCUMENTATION GATE after Phase 1:**
1. `src/shared/README.md` — updated with new exports
2. `src/core/README.md` — updated dependencies (no more features/ import)
3. `src/api/README.md` — updated (helpers removed from API contract)
4. 5 new README contracts for tier-1 modules
5. `docs/01-project-overview/folder-map.md` — updated paths
6. All cross-references in `docs/03-architecture/backend-structure.md` updated

---

### Phase 2: Critical Decompositions (Weeks 3-5)

| Step | Target | Action | Prerequisites | Parallelizable |
|------|--------|--------|---------------|----------------|
| 2.1 | F5 | Split `consensusEngine.js` into 4 scoring modules | Write characterization tests first | Yes |
| 2.2 | F7 | Split `spec.js` into command group modules | None | Yes (with 2.1) |
| 2.3 | F8 | Split `componentReviewData.js` into 4 review modules | Write characterization tests first | Yes (with 2.1, 2.2) |
| 2.4 | F9 (tier 2) | Write README contracts for `src/scoring/`, `src/research/`, `src/publish/`, `src/concurrency/`, `src/intel/`, `src/ingest/` | After 2.1 for scoring | Partial |

**DOCUMENTATION GATE after Phase 2:**
1. `src/scoring/README.md` — created with split module contracts
2. `src/cli/README.md` — created with command registry
3. `src/review/README.md` — created with decomposed modules
4. 6 additional README contracts for tier-2 modules
5. `docs/04-features/` — updated feature docs for review and scoring changes

---

### Phase 3: High-Impact Decompositions (Weeks 6-8)

| Step | Target | Action | Prerequisites | Parallelizable |
|------|--------|--------|---------------|----------------|
| 3.1 | F2 | Split `identityGate.js` (1,266 LOC) | Characterization tests | Yes |
| 3.2 | F6 | Refactor orchestration DI — bundle injected params into phase runner objects | After 2.1 | Yes (with 3.1) |
| 3.3 | F11 | Split `userSettingsService.js` | Characterization tests | Yes (with 3.1, 3.2) |
| 3.4 | F12 | Split `categories/loader.js` | None | Yes (with above) |
| 3.5 | F15 | Extract `fieldRulesEngine` normalization pipeline | After 3.1 | After 3.1 |

**DOCUMENTATION GATE after Phase 3:**
1. `src/features/indexing/README.md` — updated for identity gate split
2. `src/features/indexing/orchestration/DOMAIN.md` — updated with phase contracts
3. `src/features/settings-authority/README.md` — updated for settings service split
4. `src/categories/README.md` — created
5. `src/engine/README.md` — updated for normalization pipeline

---

### Phase 4: Frontend Decomposition + Remaining Cleanup (Weeks 9-10)

| Step | Target | Action | Prerequisites | Parallelizable |
|------|--------|--------|---------------|----------------|
| 4.1 | F14 | Split largest frontend components (>1000 LOC) | None | Yes |
| 4.2 | F9 (tier 3) | Write README contracts for remaining 25 directories | None | Yes |
| 4.3 | F1 | Classify orphan directories (promote/consolidate/contract) | All prior phases | After 4.2 |
| 4.4 | — | Final folder-map and architecture doc rewrite | All prior phases | After 4.3 |

**DOCUMENTATION GATE after Phase 4:**
1. All 50+ `src/` directories have README contracts
2. `docs/01-project-overview/folder-map.md` reflects post-refactor reality
3. `docs/03-architecture/backend-structure.md` reflects post-refactor reality
4. Full LLM navigability achieved

---

## 6. Domain Contract Specifications

### Contract C1: `src/scoring/`

```markdown
## Purpose
Consensus scoring engine: clusters field candidates from multiple sources, applies tier-weighted scoring, determines pass thresholds, and makes acceptance decisions for every field value.

## Public API (The Contract)
- `runConsensusEngine(config, fieldCandidates, provenance)` → `{ consensus, agreementScore, provenance }`
- `applySelectionPolicyReducers(consensus, config)` → `{ reducedConsensus }`
- `computeQuoteSpan(quote, text)` → `{ start, end }` | null

## Dependencies
- Allowed: `src/shared/`, `src/utils/` (transitional — will move to `src/shared/`)
- Forbidden: `src/features/`, `src/api/`, `src/db/`

## Domain Invariants
- Every field gets exactly one consensus decision (accept/reject/relaxed).
- Score is always in [0, 1]. Anchor fields bypass scoring (always accepted).
- Tier 1 manufacturer evidence is weighted highest. User overrides are tier 1.
- Pass target is field-dependent: identity fields = strict, editorial = relaxed, commonly-wrong = stringent.
```

### Contract C2: `src/engine/`

```markdown
## Purpose
Field validation, normalization, and rule enforcement engine. Validates individual field values against rules (type, range, enum, evidence provenance) and normalizes candidate data for consensus.

## Public API (The Contract)
- `createFieldRulesEngine(fieldRules, options)` → engine instance
- Engine instance: `.normalizeFullRecord(record)`, `.normalizeCandidate(field, value, context)`, `.validateField(field, value)`
- Supporting: `ruleAccessors.*` (18 pure accessor functions), `engineTextHelpers.*` (8 text utilities)

## Dependencies
- Allowed: `src/field-rules/`, `src/shared/`, `src/utils/` (transitional)
- Forbidden: `src/features/`, `src/api/`, `src/db/`

## Domain Invariants
- Field rules are loaded once and treated as immutable during a validation session.
- Normalization is deterministic: same input always produces same output.
- Unknown values are flagged, never silently accepted.
- Evidence audit requires snippet_id, source_id, and quote — missing any is a violation.
```

### Contract C3: `src/planner/`

```markdown
## Purpose
Source planning and URL queuing for web crawl. Manages queue prioritization (manufacturer > priority > general), brand/model tokenization for slug matching, and URL deduplication.

## Public API (The Contract)
- `SourcePlanner` class — stateful planner with queue management
  - `.enqueue(url, meta)`, `.dequeue()`, `.isEmpty()`, `.size()`
  - `.addManufacturerHosts(brand)`, `.addDiscoveryCallback(cb)`
- Supporting: `sourcePlannerBrandConfig.js` (brand-to-host mappings), `sourcePlannerUrlUtils.js` (URL normalization)

## Dependencies
- Allowed: `src/categories/`, `src/shared/`
- Forbidden: `src/features/`, `src/api/`, `src/db/`

## Domain Invariants
- No URL is fetched twice per run (visitedUrls dedup).
- Manufacturer queue is always drained before general queue.
- Host count caps are enforced (no single host dominates).
- Blocked hosts and denied hosts are never enqueued.
```

### Contract C4: `src/publish/`

```markdown
## Purpose
Publishing pipeline: validates field quality gates, merges human overrides, builds published specs with provenance metadata, writes output artifacts (JSON, JSON-LD, Markdown, CSV, SQLite, changelog).

## Public API (The Contract)
- `publishProducts({ storage, config, category, productIds, allApproved, format })` → `{ published_count, blocked_count, results, exports }`
- `evaluatePublishGate({ engine, fields, provenance, runtimeGate, gate })` → `{ passed, blockers }`
- `readPublishedProvenance({ storage, category, productId, field })` → provenance records
- Analytics: `runAccuracyBenchmarkReport()`, `buildAccuracyTrend()`, `buildSourceHealth()`, `buildLlmMetrics()`

## Dependencies
- Allowed: `src/engine/`, `src/shared/`, `src/categories/`
- Forbidden: `src/features/` (except re-exports in publishingPipeline.js for override docs)

## Domain Invariants
- Publish gate is 5-level: identity → required → evidence → validation → strict. All levels must pass.
- Published specs use semver (patch bump on any field change).
- Dual-write: every artifact written to both modern and legacy paths.
- Override values always get tier-1 "user_override" evidence.
```

### Contract C5: `src/cli/`

```markdown
## Purpose
CLI entry point for all Spec Factory operations. Dispatches commands to domain modules. No business logic — pure dispatch.

## Public API (The Contract)
- `main(argv)` — CLI entry point, parses args and dispatches to command handlers
- Each command module: `(args, config) → Promise<{ ok, message, data? }>`

## Dependencies
- Allowed: `src/core/config/`, `src/features/*/`, `src/pipeline/`, `src/publish/`, `src/categories/`
- Forbidden: `src/api/` (CLI and API are separate entry points)

## Domain Invariants
- Every command returns a structured result (never raw stdout).
- Commands are stateless — all state comes from config and filesystem.
- Exit code 0 on success, 1 on failure.
```

### Contract C6: `src/indexlab/`

```markdown
## Purpose
IndexLab runtime bridge: translates pipeline events into structured observation packets for the GUI. Manages search slot allocation, LLM call tracking, and stage lifecycle for live run visualization.

## Public API (The Contract)
- `dispatchRuntimeEvent(state, deps, row)` — Main event dispatcher (table-driven)
- `createLlmCallTracker()` → tracker instance (worker ID resolution, aggregate metrics)
- `buildSearchPlan({ searchPlanningContext, config, logger, llmContext })` → Schema 4 query plan
- `buildSearchPlanningContext({ needSetOutput, config, fieldGroupsData, runContext })` → Schema 3 context

## Dependencies
- Allowed: `src/core/llm/`, `src/shared/`, `src/categories/`
- Forbidden: `src/features/` (indexlab is consumed by features, not the reverse)

## Domain Invariants
- Every runtime event maps to exactly one handler (or is silently ignored).
- LLM worker IDs are reused on fallback (same GUI row for primary + fallback).
- Search plan queries are capped per group (3) and globally (6).
- Stage lifecycle: startStage must precede finishStage for every stage.
```

---

## 7. Post-Refactor Test Traceability Map

| Module | Test Files | Coverage Type | Gaps |
|--------|-----------|---------------|------|
| `src/scoring/consensusEngine.js` | `test/consensusEngine.test.js` (1,028 LOC) | unit | No coverage for isolated clustering or acceptance logic (needed post-split) |
| `src/planner/sourcePlanner.js` | `test/sourcePlanner.test.js` (1,200 LOC) | unit | Good coverage; split modules will need test redistribution |
| `src/planner/sourcePlannerBrandConfig.js` | `test/sourcePlannerBrandConfig.test.js` | unit | Adequate |
| `src/planner/sourcePlannerDiscovery.js` | `test/sourcePlannerDiscovery.test.js` | unit | Adequate |
| `src/planner/sourcePlannerScoring.js` | `test/sourcePlannerScoring.test.js` | unit | Adequate |
| `src/planner/sourcePlannerUrlUtils.js` | `test/sourcePlannerUrlUtils.test.js` | unit | Adequate |
| `src/planner/sourcePlannerValidation.js` | `test/sourcePlannerValidation.test.js` | unit | Adequate |
| `src/engine/fieldRulesEngine.js` | (no dedicated test found) | **NONE** | **CRITICAL GAP** — needs characterization before split |
| `src/engine/engineComponentResolver.js` | `test/engineComponentResolver.test.js` | unit | Adequate |
| `src/engine/engineCrossValidator.js` | `test/engineCrossValidator.test.js` | unit | Adequate |
| `src/engine/engineEnumIndex.js` | `test/engineEnumIndex.test.js` | unit | Adequate |
| `src/engine/engineEvidenceAuditor.js` | `test/engineEvidenceAuditor.test.js` | unit | Adequate |
| `src/engine/engineFieldValidators.js` | `test/engineFieldValidators.test.js` | unit | Adequate |
| `src/engine/engineTextHelpers.js` | `test/engineTextHelpers.test.js` | unit | Adequate |
| `src/publish/publishingPipeline.js` | `test/publishingPipeline.test.js` (1,128 LOC) | unit | Good coverage |
| `src/publish/publishAnalytics.js` | `test/publishAnalytics.test.js` | unit | Adequate |
| `src/publish/publishPrimitives.js` | `test/publishPrimitives.test.js` | unit | Adequate |
| `src/publish/publishProductWriter.js` | `test/publishProductWriter.test.js` | unit | Adequate |
| `src/publish/publishSpecBuilders.js` | `test/publishSpecBuilders.test.js` | unit | Adequate |
| `src/publish/publishStorageAdapter.js` | `test/publishStorageAdapter.test.js` | unit | Adequate |
| `src/cli/spec.js` | (no dedicated test) | **NONE** | **CRITICAL GAP** — CLI dispatch untested |
| `src/review/componentReviewData.js` | `test/componentReviewDataLaneState.test.js` (2,069 LOC) | unit | Partial — lane state only, no grid/query coverage |
| `src/review/reviewGridData.js` | (no dedicated test found) | **NONE** | Needs characterization |
| `src/review/overrideWorkflow.js` | (no dedicated test found) | **NONE** | Needs characterization |
| `src/indexlab/searchPlanBuilder.js` | `test/searchPlanBuilder.test.js` (1,142 LOC) | unit | Good coverage |
| `src/indexlab/searchPlanningContext.js` | `test/searchPlanningContext.test.js` (1,407 LOC) | unit | Good coverage |
| `src/indexlab/runtimeBridgeEventHandlers.js` | (no dedicated test found) | **NONE** | Needs characterization before split |
| `src/runner/runUntilComplete.js` | `test/runUntilComplete.test.js` | unit | Adequate |
| `src/runner/roundConfigBuilder.js` | (no dedicated test found) | **NONE** | Needs characterization |
| `src/features/indexing/validation/identityGate.js` | `test/identityGateRelaxed.test.js` | unit | Partial — relaxed gate only |
| `src/features/settings-authority/userSettingsService.js` | `test/runtimeSettingsApi.test.js`, `test/runtimeSettingsSerializerContract.test.js` | unit + contract | Partial — API-level, not service internals |
| `src/categories/loader.js` | (no dedicated test found) | **NONE** | Needs characterization |
| `src/core/config/configPostMerge.js` | `test/configCharacterization.test.js` | characterization | Adequate |
| `src/core/config/configBuilder.js` | `test/configCharacterization.test.js` | characterization | Adequate |
| `src/core/config/configValidator.js` | `test/configValidation.test.js` | unit | Adequate |
| `src/api/serverBootstrap.js` | `test/serverBootstrapShape.characterization.test.js` | characterization | Adequate |
| `src/api/reviewComponentMutationRoutes.js` | `test/reviewComponentMutationService.characterization.test.js` | characterization | Adequate |
| `src/api/reviewEnumMutationRoutes.js` | `test/reviewEnumMutationService.characterization.test.js` | characterization | Adequate |
| `src/api/reviewItemRoutes.js` | `test/reviewItemMutationService.characterization.test.js` | characterization | Adequate |

**Characterization tests needed before decomposition:**
1. `src/engine/fieldRulesEngine.js` — REQUIRED before F15
2. `src/review/componentReviewData.js` — REQUIRED before Split S3
3. `src/review/reviewGridData.js` — REQUIRED before Split S3
4. `src/indexlab/runtimeBridgeEventHandlers.js` — REQUIRED before any indexlab split
5. `src/categories/loader.js` — REQUIRED before F12
6. `src/cli/spec.js` — REQUIRED before Split S1 (or split without behavior changes)

---

## 8. Executive Risk Tables

### 8a. App-Wide High-Level Risk Table

| Rank | Severity | Area | Primary Hotspot | LOC | Full Slice / Surface | Why It Matters | Recommended Action | Doc Impact |
|------|----------|------|----------------|-----|---------------------|----------------|-------------------|------------|
| 1 | CRITICAL | Architecture | 35+ orphan dirs in `src/` | ~35K | Full backend | No boundary governance; uncontrolled coupling growth | Classify into core/shared/features + README contracts | folder-map, backend-structure, 14+ new READMEs |
| 2 | CRITICAL | Scoring | `consensusEngine.js` | 784 | Every published field value | 310-line function determines all field values; regression corrupts specs | Split into 4 scoring modules | Create `src/scoring/README.md` |
| 3 | CRITICAL | Dependencies | `configPostMerge.js` → `features/` | 249 | Config bootstrap | Core depends on feature; circular dep risk | Extract ranges to `src/shared/` | 3 README updates |
| 4 | HIGH | CLI | `spec.js` | 1,989 | All CLI operations | 30+ inline commands; untestable monolith | Split into command group modules | Create `src/cli/README.md` |
| 5 | HIGH | Review | `componentReviewData.js` | 2,659 | Review workbench | Mixed queries/grid/lanes/I/O; human authoring surface | Decompose into 4 modules | Create `src/review/README.md` |
| 6 | HIGH | Identity | `identityGate.js` | 1,266 | Every product identity | Gates all identity decisions; mixed matching/evidence/confidence | Split into 3 modules | Update indexing README |
| 7 | HIGH | Orchestration | Finalization DI (3 files) | 1,372 | Product completion | 40+ injected params; implicit phase contracts | Bundle DI into phase runner objects | Update DOMAIN.md |
| 8 | HIGH | Boundaries | `features/` → `api/helpers/` | 20+ files | Feature isolation | Features coupled to HTTP layer | Promote helpers to `src/shared/` | 2 README updates |
| 9 | MEDIUM | Config | `userSettingsService.js` | 700 | Settings persistence | Mixed I/O/migration/validation/apply; trust boundary | Split into 2 services | Update authority README |
| 10 | MEDIUM | Categories | `loader.js` | 691 | Category loading | Mixed caching/I/O/config/validation; hot path | Split into 3 modules | Create categories README |

---

### 8b. Critical/High Finding Drill-Down Tables

#### Drill-Down: F1 + F9 — Non-Canonical Directory Sprawl + Missing READMEs

| Scope | Target | Files | LOC | Role | Risk Contribution |
|-------|--------|-------|-----|------|-------------------|
| Primary hotspot | `src/indexlab/` | 17 | ~3,500 | Runtime bridge, packet validation | Undocumented core runtime infrastructure |
| Primary hotspot | `src/engine/` | 13 | ~2,800 | Field rules, validation | Undocumented core domain logic |
| Primary hotspot | `src/ingest/` | 13 | ~4,500 | Category compilation | Undocumented data pipeline |
| Supporting hotspot | `src/fetcher/` | 11 | ~3,200 | HTTP/browser fetch | Undocumented external I/O |
| Supporting hotspot | `src/review/` | 10 | ~5,000 | Review grid, overrides | Undocumented human authoring surface |
| Supporting hotspot | `src/field-rules/` | 10 | ~2,500 | Rule compilation | Undocumented studio dependency |
| Full backend slice | All 35+ orphan dirs | 200+ | ~35,000 | Pipeline + infrastructure | 50% of backend LOC with no boundary contracts |
| Junk drawer | `src/utils/` | 7 | 927 | Shared utilities | 80+ dependents, domain logic misplaced |

**Why this is still CRITICAL:** The declared architecture in CLAUDE.md says `core/ → shared/ → features/`. In reality, 35+ directories exist as ungoverned peers. Any code can import from any directory. There are no declared dependency rules, no barrel exports, and no README contracts for these modules. An LLM agent arriving at any of these directories has zero guidance. This is not a cosmetic issue — it is a structural integrity problem that makes every subsequent refactor riskier because blast radius is unknown.

---

#### Drill-Down: F2 + F5 — God-Object Files on Critical Paths

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/scoring/consensusEngine.js` | 784 | Field value consensus | 310-line function; every published value |
| Primary hotspot | `src/features/indexing/validation/identityGate.js` | 1,266 | Product identity | Gates every identity decision |
| Primary hotspot | `src/review/componentReviewData.js` | 2,659 | Review data assembly | Powers human authoring surface |
| Supporting hotspot | `src/engine/fieldRulesEngine.js` | 707 | Field validation | 270-line normalizeCandidate |
| Supporting hotspot | `src/runner/runUntilComplete.js` | 473 | Run loop | 300-line main loop |
| Supporting hotspot | `src/planner/sourcePlanner.js` | 797 | URL queuing | Stateful with 8 queues |
| Supporting hotspot | `src/runner/roundConfigBuilder.js` | 662 | Round configuration | 200-line buildRoundConfig |
| Full runtime slice | All god-object files | ~8,000 | Pipeline core | 11% of backend LOC, 80%+ of runtime risk |

**Why this is still CRITICAL:** These files are not just large — they sit on the **hottest execution paths** in the pipeline. `consensusEngine.runConsensusEngine()` determines every field value. `identityGate.js` gates every product identity. `componentReviewData.js` powers the only human review surface. A regression in any of these files has blast radius across the entire output. The files are too large to review confidently, too monolithic to test surgically, and too dense to modify safely.

---

#### Drill-Down: F3 — Core-to-Feature Dependency Inversion

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Trust boundary | `src/core/config/configPostMerge.js` | 249 | Config normalization | Runs at every startup |
| Dependency source | `src/features/settings-authority/runtimeSettingsRoutePut.js` | 289 | Route validation contract | Defines clamping ranges |
| Shared dependency | `src/shared/settingsDefaults.js` | 349 | User-facing defaults | SSOT for default values |
| Full config slice | Config system total | ~4,600 | Config pipeline | Foundation layer integrity |

**Why this is still CRITICAL:** This is a dependency arrow pointing the wrong way. `core/` is the foundation — every module in the system depends on it. If `core/` depends on `features/`, then `core/` transitively depends on everything `features/` depends on. One additional import in `settings-authority/` could create a circular dependency that breaks the entire module graph. The fix is surgical (one file extraction) but the risk of not fixing it grows with every commit.

---

#### Drill-Down: F6 — Orchestration DI Explosion

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `runProductFinalizationDerivation.js` | 476 | Phase sequencing | 40+ injected params |
| Primary hotspot | `createProductFinalizationDerivationRuntime.js` | 467 | Runtime builder | 30+ phase step functions |
| Supporting hotspot | `createProductCompletionRuntime.js` | 429 | Completion runtime | DI wiring layer |
| Supporting hotspot | `runProductCompletionLifecycle.js` | 370 | Lifecycle sequencer | Phase coordination |
| Full orchestration slice | `orchestration/finalize/` | ~2,500 | Product finalization | All post-extraction processing |

**Why this is still HIGH:** DI is the correct pattern, but 40+ parameters means the function signature is itself a liability. No one can verify that all 40 parameters are correctly wired by reading the code. Phase contracts are implicit — if a phase expects a field that isn't there, it fails at runtime with an unclear error. Bundling related functions into objects (e.g., `{ contextBuilders, phaseRunners, domainLogic }`) and defining explicit phase input/output schemas would make the system self-documenting without losing testability.

---

#### Drill-Down: F7 — CLI God-Object

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/cli/spec.js` | 1,989 | CLI dispatch + 30+ commands | Operator interface |
| Trust boundary | CLI argument parsing | ~200 | Input validation | User-facing input surface |
| Full CLI slice | `src/cli/` | 7 files, ~2,800 | CLI subsystem | All operator commands |

**Why this is still HIGH:** Every CLI command is inline in a single 2,000-line file. There are zero tests for CLI dispatch. Adding a new command means editing a file that touches 30 other commands. Two developers adding different commands will always conflict. The fix (extracting command modules) is low-risk because each command is already a self-contained block — they just need to be moved to separate files with a registry pattern.

---

*End of audit. This document is a refactoring execution plan. Each finding includes its documentation impact. The implementation order enforces documentation gates between phases. The end state is a codebase where every domain boundary has a README contract, every module's allowed imports are declared, and an LLM agent can begin productive work by reading the local README.*
