# Structural And Decomposition Audit - 2026-03-24

> **Purpose:** Preserve the 2026-03-24 architecture/decomposition audit as a historical record; use the numbered current-state docs for active implementation guidance.
> **Prerequisites:** [../README.md](../README.md), [backend-architecture.md](./backend-architecture.md)
> **Last validated:** 2026-03-24

Historical architecture audit retained for traceability. It may contain then-current counts, path assumptions, and refactor recommendations that differ from the live codebase audited for the maintained docs set.

**Auditor:** Claude Opus 4.6 (Principal Software Architect role)
**Scope:** Full codebase — backend (`src/`), frontend (`tools/gui-react/src/`), tests, database layer
**Goal:** Identify architectural hotspots, decomposition targets, boundary violations, and produce an executable refactoring plan

---

## Codebase Snapshot

| Layer | Files | LOC | Notes |
|-------|-------|-----|-------|
| Backend (`src/`) | 634 `.js` | ~60,086 | 45 top-level dirs; 10 inside `features/` |
| Frontend (`tools/gui-react/src/`) | ~467 `.ts`/`.tsx` | ~36,813 | 8 feature domains, Zustand + React Query |
| Tests (`test/`) | 578 `.js` | ~62,704 | Node built-in runner, no Jest/Vitest |
| **Total** | **~1,679** | **~159,603** | |

---

## G. Executive Risk Tables

### G.1 App-Wide High-Level Risk Table

| Rank | Severity | Area | Primary Hotspot | LOC | Full Slice / Surface | Why It Matters | Recommended Action | Doc Impact |
|------|----------|------|-----------------|-----|---------------------|----------------|-------------------|------------|
| 1 | **Critical** | Architecture | 33+ legacy dirs under `src/` outside `features/` | ~28K | `ingest/`, `intel/`, `publish/`, `retrieve/`, `research/`, `queue/`, `exporter/`, `runtime/`, `inference/`, `training/`, `utils/` | Feature-first mandate violated. New contributors can't tell features from infra. LLM agents can't scope work. | Migrate domain dirs to `features/` or `core/`; add README contracts | `docs/01-project-overview/folder-map.md`, all moved-dir READMEs |
| 2 | **Critical** | Boundary | Features importing from `engine/` and `queue/` | 8 files | `review/domain/`, `catalog/products/`, `expansion-hardening/` | DIP violation. Features depend outward on non-core dirs. Coupling makes feature extraction impossible. | Abstract through service contracts or move to `core/` | Feature READMEs' `## Dependencies` sections |
| 3 | **Critical** | Dumping ground | `src/utils/` (7 files, 927 LOC) | 927 | Imported by ~40 files across codebase | Explicitly prohibited by CLAUDE.md. Vague shared utilities block decomposition. | Scatter to `shared/` or domain modules. Delete `src/utils/`. | `docs/01-project-overview/folder-map.md` |
| 4 | **High** | Frontend | 5 components > 1,000 LOC | 6,315 | `EditableComponentSource`, `ComponentReviewDrawer`, `BrandManager`, `ProductManager`, `ReviewPage` | Each mixes form state, table rendering, mutation logic, layout orchestration. Change risk concentrates in monoliths. | Extract sub-components, split form logic from table rendering | Frontend architecture doc |
| 5 | **High** | Backend | `db/seed.js` (1,946 LOC, 10 responsibilities) | 1,946 | Direct SpecDb mutations across 10+ tables | Highest blast radius in codebase. Bug corrupts all products for a category. | Split into 3 builder modules + thin orchestrator | `src/db/README.md` |
| 6 | **High** | Backend | `testing/testDataProvider.js` (2,981 LOC) | 2,981 | 9 distinct responsibilities | Largest single file. Contract-driven test data generator is hard to navigate or extend. | Split into 4 focused modules | Test infrastructure docs |
| 7 | **High** | Backend | `core/llm/client/openaiClient.js` (995 LOC) | 995 | HTTP calls, cost tracking, retry logic, schema fallback, rate limiting | All LLM calls flow through this file. 7 concerns mixed. Bug affects all extraction/validation. | Extract cost tracking and retry logic | `src/core/README.md` |
| 8 | **High** | Documentation | 17+ dirs missing README.md contracts | — | `ingest/`, `intel/`, `queue/`, `publish/`, `retrieve/`, `research/`, `cli/`, `daemon/`, `utils/`, `exporter/`, `runtime/`, `inference/`, `training/`, `billing/`, `observability/`, `diagnostics/`, `cache/` | CLAUDE.md mandates domain contract README in every boundary. LLM agents arrive blind. | Add README with Purpose, Public API, Dependencies, Invariants | Each affected directory |
| 9 | **High** | Testing | 9/10 feature modules have no feature-level tests | — | All features except `crawl/` | Only `crawl` follows TDD discipline. Review, indexing, catalog, settings-authority have zero in-feature test directories. | Add characterization test suites before any decomposition | Feature READMEs |
| 10 | **Medium** | Backend | `ingest/` (6,767 LOC, 13 files) outside features | 6,767 | Category compilation, CSV ingest, catalog seeding | Domain logic masquerading as infrastructure. Should be under `features/`. | Migrate to `features/catalog/ingest/` or `features/category-authority/` | Folder map, backend architecture |
| 11 | **Medium** | Backend | `review/domain/` — 4 files over 700 LOC | 3,233 | `reviewGridData` (885), `overrideWorkflow` (814), `componentReviewLegacy` (791), `componentReviewSpecDb` (743) | Review domain is in-progress; contracts not frozen. Each file mixes state machine, persistence, and validation. | Characterize first, then split after contracts freeze | `src/features/review/README.md` |
| 12 | **Medium** | Architecture | Partial migrations incomplete | ~3,100 | `src/api/` ↔ `src/app/api/`, `src/cli/` ↔ `src/app/cli/` | Two locations for same concern. Ambiguous canonical path confuses agents. | Complete migration; leave thin re-export shims | Folder map, backend architecture |
| 13 | **Medium** | Backend | `review-curation/` deprecated facade (32 LOC) | 32 | Re-exports 31 functions from `features/review/` | Dead indirection. Consumers should import from `features/review/index.js` directly. | Migrate 4 remaining consumers, then delete | Folder map |
| 14 | **Low** | Backend | `src/scoring/` empty barrel (5 LOC) | 5 | Comment: "stripped during pipeline rework" | Dead code. Violates Subtractive Engineering Mandate. | Delete | Folder map |
| 15 | **Low** | Backend | Small stubs: `indexer/` (56), `normalizer/` (86), `replay/` (149), `reports/` (154) | 445 | Single-file directories with no README | Directory proliferation. Each could fold into parent domain. | Consolidate into existing boundaries | Folder map |

### G.2 Critical Finding #1: Legacy Directory Sprawl

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/ingest/` (13 files) | 6,767 | Category compilation & CSV ingest | Domain logic outside `features/` boundary |
| Supporting hotspot | `src/intel/` (9 files) | 2,982 | Source intelligence analysis | Discovery domain logic outside boundary |
| Supporting hotspot | `src/publish/` (7 files) | 2,398 | Publishing pipeline | Delivery domain logic outside boundary |
| Supporting hotspot | `src/retrieve/` (4 files) | 1,042 | Tier-aware data retrieval | Search domain logic outside boundary |
| Supporting hotspot | `src/research/` (6 files) | 1,628 | Frontier DB & URL scheduling | Crawl domain logic outside boundary |
| Supporting hotspot | `src/exporter/` (3 files) | ~1,080 | Learning data export | Indexing domain logic outside boundary |
| Supporting hotspot | `src/runtime/` (4 files) | 520 | Runtime artifact tracking | Indexing domain logic outside boundary |
| Supporting hotspot | `src/inference/` (1 file) | 420 | Field inference | Indexing domain logic outside boundary |
| Supporting hotspot | `src/training/` (2 files) | 399 | Model training data | Domain logic outside boundary |
| Dumping ground | `src/utils/` (7 files) | 927 | Generic utilities | Explicitly prohibited by CLAUDE.md |
| **Full slice** | **11 legacy domain dirs** | **~18,163** | | **30% of backend LOC sits outside declared architecture** |

**Why this is still Critical:** The CLAUDE.md architecture mandate states "Organize by domain, not technical layers" and "`src/utils`, `src/helpers`, `src/services` are prohibited as dumping grounds." Having ~30% of backend LOC in 33+ scattered top-level directories violates the feature-first architecture. An LLM agent asked to "work on publishing" must scan 7+ directories to understand the full slice. This is the single largest contributor to navigability debt.

### G.2 Critical Finding #2: Boundary Violations (DIP)

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary violation | `features/review/domain/overrideWorkflow.js` | 814 | Imports `engine/fieldRulesEngine.js` + `engine/runtimeGate.js` | Feature depends outward on non-core |
| Primary violation | `features/review/domain/qaJudge.js` | ~200 | Imports `engine/fieldRulesEngine.js` + `engine/runtimeGate.js` | Feature depends outward on non-core |
| Primary violation | `features/review/domain/reviewGridData.js` | 885 | Imports `engine/ruleAccessors.js` + `queue/queueState.js` | Feature depends on both engine + queue |
| Primary violation | `features/catalog/products/reconciler.js` | 254 | Imports `queue/queueState.js` | Feature depends on queue persistence |
| Primary violation | `features/expansion-hardening/expansionHardening.js` | 450 | Imports `queue/queueState.js` (4 functions) | Feature depends on queue persistence |
| Primary violation | `features/review/domain/reviewGridHelpers.js` | 348 | Imports `engine/ruleAccessors.js` | Feature depends outward on engine |
| Primary violation | `features/review/api/reviewRouteContext.js` | ~50 | Imports `engine/curationSuggestions.js` | Route context depends on engine |
| Bypass violation | `pipeline/runCrawlProcessingLifecycle.js` | 112 | Imports `features/crawl/bypassStrategies.js` directly (not via index.js) | Bypasses public API contract |
| **Full slice** | **8 boundary violations** | | | **Feature isolation is broken for review, catalog, expansion-hardening** |

**Why this is still Critical:** Features are architecturally required to import only from `core/`, `shared/`, and other features' `index.js` barrels. The `review` feature has 6 direct imports from `engine/` and `queue/`, meaning it cannot be extracted, tested, or reasoned about in isolation. Any change to `engine/` or `queue/` can break `review/` through invisible coupling.

### G.3 High Finding: Frontend Component Monoliths

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Monolith component | `EditableComponentSource.tsx` | 1,375 | Studio component editor | Form + table + mutation + layout in one file |
| Monolith component | `ComponentReviewDrawer.tsx` | 1,372 | Component review drawer | Multi-tab orchestration + data transforms |
| Monolith component | `BrandManager.tsx` | 1,352 | Brand mapping interface | CRUD + search + validation + bulk ops |
| Monolith component | `ProductManager.tsx` | 1,156 | Product catalog manager | CRUD + identity + bulk operations |
| Monolith page | `ReviewPage.tsx` | 1,060 | Review workflow page | Grid + overrides + WebSocket + state |
| **Full slice** | **5 components** | **6,315** | | **17% of frontend LOC in 5 files** |

**Why this is still High:** Each component exceeds the 700 LOC soft limit by 50-100%. They mix at least 4 concerns (form handling, data transformation, table rendering, mutation/persistence). Changes to any concern risk regressions in others. The files are difficult for LLM agents to reason about within context windows.

### G.4 High Finding: Database Seed Monolith

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `db/seed.js` | 1,946 | Seeds all SpecDb tables | 10 responsibilities, direct DB mutation |
| Persistence boundary | `db/specDb.js` (facade) | 694 | SpecDb class wrapper | Exposes 11 store modules |
| Schema definition | `db/specDbSchema.js` | 866 | DDL for all tables | Schema changes ripple through seed |
| **Full slice** | **Database init path** | **3,506** | | **Bug in seed corrupts entire category DB** |

**Why this is still High:** `seed.js` performs direct mutations across 10+ SQLite tables in a single orchestrator function. It handles component identity seeding, enum normalization, product scaffolding, field state initialization, and review backfilling — all in one file. A seeding bug corrupts the entire product database for a category, and recovery requires re-running compilation.

---

## A. Prioritized Finding List

### A.1 Critical Findings

#### F-01: Legacy Directory Sprawl (Critical)

**Affected:** `src/ingest/`, `src/intel/`, `src/publish/`, `src/retrieve/`, `src/research/`, `src/exporter/`, `src/runtime/`, `src/inference/`, `src/training/`, `src/utils/`

**Why it matters:** 30% of backend LOC (~18K) lives outside the declared feature-first architecture. New engineers and LLM agents cannot determine domain ownership by looking at directory structure.

**Likely failure mode:** Agent working on "source intelligence" modifies `src/intel/sourceIntel.js` without realizing it's consumed by `features/indexing/` — no README tells them the contract.

**Recommended direction:** Migrate domain dirs to `features/` or `core/` per the split plan in Section B. Infrastructure dirs (`concurrency/`, `s3/`, `categories/`, `field-rules/`) stay at top level or move to `core/`.

**Documentation impact:** `docs/01-project-overview/folder-map.md`, `docs/03-architecture/backend-architecture.md`, every moved directory needs a new README.md.

---

#### F-02: Feature Boundary Violations — DIP (Critical)

**Affected:** `src/features/review/domain/` (6 violations), `src/features/catalog/products/reconciler.js` (1), `src/features/expansion-hardening/` (1)

**Why it matters:** Features must depend inward (→ `core/`, `shared/`), never outward/sideways to `engine/` or `queue/`. Currently `review/` has 6 direct imports from non-core directories.

**Likely failure mode:** Refactoring `engine/ruleAccessors.js` silently breaks `review/domain/reviewGridHelpers.js` — no index.js or contract boundary to catch the change.

**Recommended direction:**
- **Option A (preferred):** Move `engine/` to `core/engine/` (it's infrastructure — field validation is cross-cutting).
- **Option B:** Create `core/fieldRules/` facade that re-exports what features need.
- **Queue fix:** Move `queue/` to `core/queue/` — job queue state is infrastructure.

**Documentation impact:** Feature READMEs `## Dependencies` sections; `src/core/README.md` updated with new boundaries.

---

#### F-03: `src/utils/` Dumping Ground (Critical)

**Affected:** `src/utils/` — 7 files, 927 LOC, imported by ~40 files

**Why it matters:** CLAUDE.md explicitly prohibits `src/utils` as a dumping ground. Contains identity normalization, slot value shapes, common helpers, field keys, candidate identifiers, tier helpers.

**Likely failure mode:** New contributor adds another "utility" to `src/utils/common.js` because it's the path of least resistance — the dumping ground grows.

**Recommended direction:**
- `identityNormalize.js` → `src/shared/identityNormalize.js`
- `fieldKeys.js` → `src/shared/fieldKeys.js`
- `slotValueShape.js` → `src/shared/slotValueShape.js`
- `candidateIdentifier.js` → `src/shared/candidateIdentifier.js`
- `componentIdentifier.js` → `src/shared/componentIdentifier.js`
- `common.js` → scatter individual functions to domain modules
- `tierHelpers.js` → domain-specific (where consumed)
- Delete `src/utils/` directory after migration

**Documentation impact:** `docs/01-project-overview/folder-map.md`, `src/shared/README.md`.

---

### A.2 High Findings

#### F-04: Frontend Component Monoliths (High)

**Affected:** 5 TSX components > 1,000 LOC (see table G.3)

**Why it matters:** Each mixes form state, data transforms, table rendering, and mutation logic. The 700 LOC soft limit exists to prevent exactly this.

**Likely failure mode:** Adding a new column to `BrandManager.tsx` (1,352 LOC) requires reading the entire file to understand state flow, risking regression in search or bulk-operations logic.

**Recommended direction:** For each monolith:
1. Extract data transform functions to `<Feature>/utils/` or `<Feature>/transforms/`
2. Extract table column definitions to `<Feature>/columns.tsx`
3. Extract form sections to `<Feature>/sections/`
4. Leave the parent as a thin orchestrator (< 300 LOC)

**Documentation impact:** `docs/03-architecture/frontend-architecture.md`.

---

#### F-05: `db/seed.js` Monolith (High)

**Affected:** `src/db/seed.js` (1,946 LOC, 10 responsibilities)

**Why it matters:** Direct mutations to 10+ SQLite tables. Bug corrupts entire category database.

**Likely failure mode:** Adding a new table relationship to seeding breaks enum normalization in the same function — no isolation between concerns.

**Recommended direction:**
- Extract `componentSeedBuilder.js` (~400 LOC) — component identity, aliases, values
- Extract `productSeedOrchestrator.js` (~400 LOC) — per-product candidate/state/links
- Extract `enumSeedBuilder.js` (~200 LOC) — enum/list normalization
- Leave `seed.js` as thin orchestrator (~200 LOC) calling builders in sequence

**Documentation impact:** `src/db/README.md`.

---

#### F-06: Missing README Contracts (High)

**Affected:** 17+ directories (see table G.1 row 8)

**Why it matters:** CLAUDE.md mandates "Each domain boundary must contain exactly one structural map: README.md." Missing READMEs mean LLM agents arrive blind.

**Recommended direction:** Add README.md with required sections (Purpose, Public API, Dependencies, Domain Invariants) to every directory that lacks one. Max 150 lines per CLAUDE.md.

**Documentation impact:** Each directory gains a README.

---

#### F-07: Feature Test Deficit (High)

**Affected:** 9/10 feature modules — all except `crawl/`

**Why it matters:** Only `crawl/` has dedicated feature-level tests (12 test files). `review/`, `indexing/`, `catalog/`, `settings-authority/` have zero in-feature test directories despite being the highest-risk domains.

**Likely failure mode:** Decomposing `review/domain/reviewGridData.js` (885 LOC) without characterization tests risks silent behavior changes.

**Recommended direction:** Before any decomposition of `review/` or `catalog/`:
1. Write characterization tests locking current behavior
2. Place tests in `src/features/<feature>/tests/`
3. Use table-driven tests per CLAUDE.md

**Documentation impact:** Feature READMEs gain `## Test Coverage` notes.

---

#### F-08: `testing/testDataProvider.js` (High)

**Affected:** `src/testing/testDataProvider.js` (2,981 LOC — largest file in codebase)

**Why it matters:** 9 distinct responsibilities from component identity synthesis to LLM route initialization. Hard to navigate, hard to extend.

**Recommended direction:**
- `componentIdentityBuilder.js` (~500 LOC) — component synthesis
- `fieldValueBuilder.js` (~600 LOC) — per-scenario field values
- `testScenarioDefs.js` (~200 LOC) — scenario definitions
- `sourceResultSynthesizer.js` (~400 LOC) — deterministic source data
- Leave `testDataProvider.js` as assembly (~400 LOC)

**Documentation impact:** Test infrastructure docs.

---

#### F-09: `core/llm/client/openaiClient.js` 7-Concern Mix (High)

**Affected:** `src/core/llm/client/openaiClient.js` (995 LOC)

**Why it matters:** All LLM calls flow through this single file. Mixes HTTP transport, cost tracking, retry logic, schema fallback, rate limiting, model ladder selection, and caching.

**Recommended direction:**
- Extract `llmCostTracker.js` (~150 LOC) — token counting, billing events
- Extract `llmRetryPolicy.js` (~100 LOC) — retry logic, backoff
- Keep `openaiClient.js` as HTTP transport + dispatch (~500 LOC)

**Documentation impact:** `src/core/README.md`, `src/core/llm/` README.

---

### A.3 Medium Findings

#### F-10: Review Domain — 4 Files Over 700 LOC (Medium)

**Affected:** `reviewGridData.js` (885), `overrideWorkflow.js` (814), `componentReviewLegacy.js` (791), `componentReviewSpecDb.js` (743)

**Why it matters:** Review feature is in-progress with unfrozen contracts. Each file mixes state machine, persistence queries, and validation logic.

**Recommended direction:** Characterize first (golden-master tests), then decompose after contracts freeze. Do NOT split prematurely while the shape is still evolving per the memory note about no premature field trimming.

---

#### F-11: Partial API/CLI Migration (Medium)

**Affected:** `src/api/` ↔ `src/app/api/`, `src/cli/` ↔ `src/app/cli/`

**Why it matters:** Two locations for same concern. Ambiguous canonical path.

**Recommended direction:** Complete the migration. Move remaining `src/api/` files to `src/app/api/`. Move remaining `src/cli/` files to `src/app/cli/`. Leave re-export shims temporarily.

---

#### F-12: `review-curation/` Deprecated Facade (Medium)

**Affected:** `src/features/review-curation/` — 32 LOC, re-exports 31 functions

**Why it matters:** Dead indirection. 4 consumers should import from `features/review/index.js`.

**Recommended direction:** Migrate consumers, delete directory.

---

### A.4 Low Findings

#### F-13: Dead Code — `src/scoring/` (Low)

5 LOC empty barrel. Comment says "stripped during pipeline rework." Delete.

#### F-14: Single-File Stubs (Low)

`indexer/` (56 LOC), `normalizer/` (86 LOC), `replay/` (149 LOC), `reports/` (154 LOC) — each a single file with no README. Consolidate into parent domains.

#### F-15: `src/review/` Legacy Shims (Low)

19 re-export files mapping old imports to `features/review/domain/`. No external consumers found outside tests. Safe to remove after grep confirms.

---

## B. Recommended Module Split Plan

### B.1 `src/utils/` → `src/shared/` (Critical, ~2 hours)

**Current:** 7 files, 927 LOC, prohibited dumping ground.

**Split:**

| Current File | Target | LOC | Notes |
|-------------|--------|-----|-------|
| `utils/identityNormalize.js` | `shared/identityNormalize.js` | 233 | Pure normalizers |
| `utils/slotValueShape.js` | `shared/slotValueShape.js` | 202 | Value shape contract |
| `utils/fieldKeys.js` | `shared/fieldKeys.js` | 142 | Field key constants |
| `utils/candidateIdentifier.js` | `shared/candidateIdentifier.js` | 139 | ID generation |
| `utils/componentIdentifier.js` | `shared/componentIdentifier.js` | 14 | Component IDs |
| `utils/common.js` | Split per function | 149 | `buildRunId` → `shared/`, `wait` → `shared/`, `nowIso` → `shared/` |
| `utils/tierHelpers.js` | Where consumed | 48 | Move to consuming domain |

**Post-split contract for `src/shared/`:**
- **Exports:** Pure functions, constants, type utilities — zero side effects, zero feature knowledge
- **Allowed imports:** Node built-ins only (no `core/`, no `features/`)
- **Mutation boundaries:** Read-only. Never writes to DB, FS, or external APIs
- **Invariants:** All exports deterministic. All frozen. No feature-specific logic.

**Documentation updates required:**
1. `src/shared/README.md` — add new exports
2. `docs/01-project-overview/folder-map.md` — remove `utils/`
3. Update all 40+ import paths across codebase (use find-replace)

---

### B.2 `engine/` and `queue/` → `core/` (Critical, ~1 hour)

**Current:** `engine/` (15 files, 3,118 LOC) and `queue/` (1 file, 903 LOC) are infrastructure but live outside `core/`, causing DIP violations when features import them.

**Split:**

| Current | Target | Rationale |
|---------|--------|-----------|
| `src/engine/` | `src/core/engine/` | Field validation is cross-cutting infrastructure, not a feature |
| `src/queue/queueState.js` | `src/core/queue/queueState.js` | Job queue is infrastructure |

**Post-split contracts:**

`src/core/engine/`:
- **Purpose:** Field rule execution, normalization, constraint evaluation
- **Exports:** `createFieldRulesEngine()`, rule accessors, normalization functions, curation suggestions
- **Allowed imports:** `src/shared/`, `src/field-rules/`, Node built-ins
- **Mutation boundaries:** Read-only (engine evaluates rules, never writes)
- **Invariants:** Field rules immutable during session. Normalization is deterministic. Enum policies are closed/open only.

`src/core/queue/`:
- **Purpose:** Job queue state management (SQLite-backed)
- **Exports:** `loadQueueState()`, `syncQueueFromInputs()`, `selectNextQueueProduct()`, `upsertQueueProduct()`
- **Allowed imports:** `src/shared/`, `src/features/catalog/index.js` (identity evaluation), Node built-ins
- **Mutation boundaries:** Writes to queue state files (JSON). Never writes to SpecDb.
- **Invariants:** Queue state is canonical for product scheduling. State transitions are idempotent.

**Documentation updates required:**
1. `src/core/README.md` — add engine and queue
2. Feature READMEs (`review/`, `catalog/`, `expansion-hardening/`) — update `## Dependencies`
3. `docs/01-project-overview/folder-map.md`
4. `docs/03-architecture/backend-architecture.md`

---

### B.3 `db/seed.js` Decomposition (High, ~3 hours)

**Current:** 1,946 LOC, 10 responsibilities, direct mutations to 10+ tables.

**Proposed split:**

| New Module | LOC (est.) | Responsibility |
|-----------|------------|----------------|
| `db/seeders/componentSeeder.js` | ~400 | Component identity, aliases, property values |
| `db/seeders/productSeeder.js` | ~400 | Per-product candidates, field state, links |
| `db/seeders/enumSeeder.js` | ~200 | Enum/list value normalization and dedup |
| `db/seeders/catalogSeeder.js` | ~250 | Product metadata, parent/child relationships |
| `db/seeders/reviewSeeder.js` | ~200 | Key review state backfilling |
| `db/seed.js` (orchestrator) | ~200 | Calls seeders in FK-safe order |

**Post-split contract for `db/seed.js`:**
- **Exports:** `seedSpecDb({ db, config, category, fieldRules, logger })` (unchanged public API)
- **Allowed imports:** `db/seeders/*`, `db/stores/*`, `shared/`
- **Mutation boundaries:** Writes to all SpecDb tables (via stores)
- **Invariants:** FK dependency order enforced. Seeding is idempotent. Statistics returned.

**Documentation updates:** `src/db/README.md`.

---

### B.4 Frontend Component Decomposition (High, per-component ~2 hours)

**Highest-value target:** `EditableComponentSource.tsx` (1,375 LOC)

**Proposed split:**

| New Module | LOC (est.) | Responsibility |
|-----------|------------|----------------|
| `EditableComponentSourceForm.tsx` | ~300 | Form fields, validation, submit handlers |
| `EditableComponentSourceTable.tsx` | ~300 | Table rendering, column definitions |
| `EditableComponentSourceActions.tsx` | ~200 | Bulk actions, toolbar, mutation triggers |
| `editableComponentSourceTransforms.ts` | ~150 | Data normalization between API ↔ form |
| `EditableComponentSource.tsx` (orchestrator) | ~300 | Layout, state wiring, sub-component composition |

**Apply same pattern to:** `ComponentReviewDrawer.tsx`, `BrandManager.tsx`, `ProductManager.tsx`, `ReviewPage.tsx`.

---

## C. Highest-Value Refactor First

### Eliminating `src/utils/` and fixing DIP violations

**Why this unlocks the most:** Every subsequent decomposition depends on clean boundaries. Moving `utils/` to `shared/` and `engine/`+`queue/` to `core/` fixes the two most critical violations simultaneously and enables all downstream feature extraction work.

**Before:**
```
src/features/review/domain/overrideWorkflow.js
├── import { createFieldRulesEngine } from '../../../engine/fieldRulesEngine.js'
├── import { applyRuntimeFieldRules } from '../../../engine/runtimeGate.js'
└── [VIOLATION: feature depends outward on non-core directory]

src/features/review/domain/reviewGridData.js
├── import { loadQueueState } from '../../../queue/queueState.js'
├── import { ruleRequiredLevel } from '../../../engine/ruleAccessors.js'
└── [VIOLATION: feature depends on two non-core directories]

src/features/catalog/products/reconciler.js
├── import { loadQueueState, saveQueueState } from '../../../queue/queueState.js'
└── [VIOLATION: feature depends on non-core queue]
```

**After (move engine/ → core/engine/, queue/ → core/queue/):**
```
src/features/review/domain/overrideWorkflow.js
├── import { createFieldRulesEngine } from '../../../core/engine/fieldRulesEngine.js'
├── import { applyRuntimeFieldRules } from '../../../core/engine/runtimeGate.js'
└── [CLEAN: feature depends inward on core/]

src/features/review/domain/reviewGridData.js
├── import { loadQueueState } from '../../../core/queue/queueState.js'
├── import { ruleRequiredLevel } from '../../../core/engine/ruleAccessors.js'
└── [CLEAN: feature depends inward on core/]

src/features/catalog/products/reconciler.js
├── import { loadQueueState, saveQueueState } from '../../../core/queue/queueState.js'
└── [CLEAN: feature depends inward on core/]
```

**Impact:**
- 8 boundary violations fixed
- All features now depend exclusively on `core/`, `shared/`, and other features' `index.js`
- Enables safe extraction of `review/` and `catalog/` in later phases
- Every feature README can now declare clean `## Dependencies` sections

**Documentation that changes:**
- `src/core/README.md` — add engine and queue sections
- `src/features/review/README.md` — update Dependencies
- `src/features/catalog/README.md` — update Dependencies
- `src/features/expansion-hardening/README.md` — update Dependencies
- `docs/01-project-overview/folder-map.md` — reflect new structure
- `docs/03-architecture/backend-architecture.md` — update component diagram

---

## D. Practical Implementation Order

### Phase 1: Boundary Cleanup (Critical — prerequisite for all else)

**Step 1.1:** Move `src/utils/` → `src/shared/` (F-03)
- Move 7 files, update ~40 import paths
- Run full test suite after
- **DOCUMENTATION GATE:** Update `src/shared/README.md`, folder map

**Step 1.2:** Move `src/engine/` → `src/core/engine/` (F-02)
- Move 15 files, update import paths
- Run full test suite after
- **DOCUMENTATION GATE:** Update `src/core/README.md`, feature READMEs

**Step 1.3:** Move `src/queue/` → `src/core/queue/` (F-02)
- Move 1 file, update import paths
- Run full test suite after
- **DOCUMENTATION GATE:** Update `src/core/README.md`

**Step 1.4:** Fix crawl bypass import (F-02)
- Change `runCrawlProcessingLifecycle.js` to import from `features/crawl/index.js`
- **DOCUMENTATION GATE:** None needed

**Step 1.5:** Delete `src/scoring/` (F-13)
- Delete 1 file (5 LOC empty barrel)
- **DOCUMENTATION GATE:** Update folder map

**Parallelizable:** Steps 1.1, 1.2, 1.3 are independent and can run in parallel.

---

### Phase 2: README Contracts (High — enables all future LLM work)

**Step 2.1:** Add README.md to all 17+ directories missing one (F-06)
- Use CLAUDE.md template: Purpose, Public API, Dependencies, Domain Invariants
- Max 150 lines each
- **Can run in parallel** across directories; no code changes

**Step 2.2:** Update existing READMEs affected by Phase 1 moves
- `src/shared/README.md`, `src/core/README.md`, feature READMEs

---

### Phase 3: Characterization Tests (High — prerequisite for decomposition)

**Step 3.1:** Characterization tests for `review/domain/` (F-07, F-10)
- Lock down `reviewGridData.js`, `overrideWorkflow.js`, `componentReviewLegacy.js`, `componentReviewSpecDb.js`
- Place in `src/features/review/tests/`

**Step 3.2:** Characterization tests for `catalog/` (F-07)
- Lock down `productCatalog.js`, `brandRegistry.js`
- Place in `src/features/catalog/tests/`

**Step 3.3:** Characterization tests for `db/seed.js` (F-05)
- Lock down seeding behavior before split

**Parallelizable:** All three can run in parallel.

---

### Phase 4: Backend Decomposition (High)

**Step 4.1:** Split `db/seed.js` into seeders (F-05)
- Only after Phase 3.3 characterization tests are green
- **DOCUMENTATION GATE:** Update `src/db/README.md`

**Step 4.2:** Split `testing/testDataProvider.js` (F-08)
- Only after existing test data tests pass
- **DOCUMENTATION GATE:** Test infrastructure docs

**Step 4.3:** Extract cost tracking from `openaiClient.js` (F-09)
- **DOCUMENTATION GATE:** Update `src/core/llm/` section in `src/core/README.md`

---

### Phase 5: Frontend Decomposition (High)

**Step 5.1:** Split `EditableComponentSource.tsx` (1,375 LOC)
**Step 5.2:** Split `ComponentReviewDrawer.tsx` (1,372 LOC)
**Step 5.3:** Split `BrandManager.tsx` (1,352 LOC)

**Parallelizable:** All three are independent components.
**DOCUMENTATION GATE:** Update `docs/03-architecture/frontend-architecture.md`

---

### Phase 6: Legacy Directory Migration (Medium)

**Step 6.1:** Move `src/ingest/` → `src/features/catalog/ingest/` or `src/features/category-authority/ingest/` (F-01)
**Step 6.2:** Move `src/intel/` → `src/features/indexing/discovery/intel/` (F-01)
**Step 6.3:** Move `src/publish/` → `src/features/publish/` (F-01)
**Step 6.4:** Move `src/research/` → `src/features/crawl/frontier/` or `src/features/discovery/frontier/` (F-01)
**Step 6.5:** Move `src/retrieve/` → `src/features/indexing/search/retrieve/` (F-01)
**Step 6.6:** Complete `src/api/` → `src/app/api/` migration (F-11)
**Step 6.7:** Migrate `review-curation/` consumers, delete facade (F-12)
**Step 6.8:** Consolidate stubs: `indexer/`, `normalizer/`, `replay/`, `reports/` (F-14)

**Each step requires:**
- Move files, update imports, run suite
- **DOCUMENTATION GATE:** Update folder map, add README to new location, update architecture docs

---

### Phase 7: Infrastructure Consolidation (Low)

Move remaining scattered infrastructure to `core/`:
- `src/observability/` → `src/core/observability/`
- `src/diagnostics/` → `src/core/diagnostics/`
- `src/cache/` → `src/core/cache/`
- `src/calibration/` → `src/core/config/calibration.js`
- `src/billing/` → `src/core/billing/`
- `src/s3/` → `src/core/storage/`

---

## E. Domain Contract Specifications (Post-Refactor)

### E.1 `src/core/` (after Phase 1)

```
Purpose: Infrastructure — config, LLM routing, field engine, queue, events, storage adapters.

Public API:
  config/manifest.js  → CONFIG_MANIFEST, CONFIG_MANIFEST_DEFAULTS, CONFIG_MANIFEST_KEYS
  config/configBuilder.js → createManifestApplicator()
  llm/client/routing.js → resolveLlmRoute(), callLlmWithRouting()
  llm/client/llmClient.js → callLlmProvider(), getProviderHealth()
  llm/providers/index.js → selectLlmProvider()
  engine/fieldRulesEngine.js → createFieldRulesEngine()
  engine/ruleAccessors.js → ruleRequiredLevel(), 17 other accessors
  queue/queueState.js → loadQueueState(), selectNextQueueProduct(), upsertQueueProduct()
  events/dataChangeContract.js → createDataChangePayload(), emitDataChange()

Dependencies: src/shared/, src/field-rules/, Node built-ins
Mutation Boundaries: queue writes to JSON state files; LLM client writes to cache; events broadcast only
Invariants: Secrets never leak. Config defaults are deterministic. Engine rules immutable during session.
```

### E.2 `src/shared/` (after Phase 1)

```
Purpose: Universal settings registry, normalizers, accessors, and truly generic utilities.

Public API:
  settingsRegistry.js → RUNTIME_SETTINGS_REGISTRY (SSOT for all settings)
  settingsDefaults.js → SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES
  settingsAccessor.js → configValue(), configInt(), configFloat(), configBool()
  valueNormalizers.js → toInt(), toFloat(), normalizeModelToken(), parseCsvTokens()
  fileHelpers.js → safeReadJson(), listFiles(), readJsonlEvents()
  payloadAliases.js → EVENT_FIELD_ALIASES, resolveAlias()
  discoveryRankConstants.js → RANK_SCORE_* constants
  stableHash.js → stableHash()
  identityNormalize.js → [moved from utils/]
  fieldKeys.js → [moved from utils/]
  slotValueShape.js → [moved from utils/]
  candidateIdentifier.js → [moved from utils/]
  componentIdentifier.js → [moved from utils/]

Dependencies: Node built-ins ONLY. No core/, no features/.
Mutation Boundaries: Read-only. Never writes.
Invariants: All exports frozen. All functions pure. No feature-specific logic.
```

### E.3 `src/features/review/` (existing, dependencies updated)

```
Purpose: Product, component, and enum review workflows — grid assembly, override acceptance, cascade impact.

Public API: (via index.js)
  Routes: registerReviewRoutes, createReviewRouteContext
  Grid: buildReviewLayout, buildFieldState, buildProductReviewPayload, buildReviewQueue
  Overrides: setOverrideFromCandidate, setManualOverride, approveGreenOverrides, finalizeOverrides
  Components: buildComponentReviewLayout, buildComponentReviewPayloads, buildEnumReviewPayloads
  Cascade: findProductsReferencingComponent, cascadeComponentChange, cascadeEnumChange

Dependencies:
  Allowed: src/core/ (including core/engine/, core/queue/), src/shared/, src/db/,
           features/catalog/index.js, features/indexing/index.js, features/settings-authority/index.js
  Forbidden: Direct imports from engine/, queue/ (use core/ paths)

Mutation Boundaries: Writes to SpecDb (via stores), emits data-change events
Invariants: Review state derived from SpecDb. Override workflows idempotent. Forward-investment fields retained.
```

---

## F. Post-Refactor Test Traceability

| Module | Current Test Files | Coverage Type | Gaps |
|--------|--------------------|---------------|------|
| `src/core/config/` | `test/settingsDefaults*.test.js` (8+), `test/configBuilder*.test.js` | unit + integration | Good coverage |
| `src/core/llm/` | `src/core/llm/tests/llmPolicySchema.test.js`, `test/llmRouting*.test.js` | unit + integration | Cost tracking untested in isolation |
| `src/core/engine/` (after move) | `test/runtimeGate.test.js`, `test/engineField*.test.js` | unit | Good coverage |
| `src/core/queue/` (after move) | `test/queueState*.test.js` | unit | Concurrent access scenarios |
| `src/shared/` | `src/shared/tests/hasKnownValue.test.js`, `test/settingsDefaultsEnvSync.test.js` | unit | Only 1 in-directory test; rest in root `test/` |
| `src/db/` | `test/specDb*.test.js`, `test/seed*.test.js` | unit + integration | seed.js needs characterization before split |
| `src/features/crawl/` | 12 test files in `tests/` | unit + contract + lifecycle | **Best coverage in features** |
| `src/features/review/` | Zero in-feature tests; root `test/review*.test.js` (5+) | integration only | **Needs characterization tests before decomposition** |
| `src/features/catalog/` | Zero in-feature tests; root `test/catalog*.test.js` | integration only | **Needs characterization tests before decomposition** |
| `src/features/indexing/` | `discovery/tests/` (1 characterization test) | characterization | Needs expansion for API builders |
| `src/features/settings-authority/` | Root `test/settingsAuthority*.test.js` | integration | Needs in-feature unit tests |
| `src/features/studio/` | Zero tests | none | Needs characterization |
| `src/features/settings/` | Zero tests | none | Covered by integration in settings-authority |
| `src/pipeline/` | Root `test/pipeline*.test.js` (3+) | integration | Good coverage |
| Frontend (`tools/gui-react/`) | `__tests__/` dirs in 5 features | unit | Most features untested |

---

## Architectural Strengths (No Action Required)

These patterns are working well and should be preserved:

1. **SSOT Registry Pattern** — `settingsRegistry.js` → derived defaults, clamping, schemas. O(1) feature scaling proven.
2. **Zero circular dependencies** in `core/` ↔ `shared/` — clean unidirectional flow.
3. **Feature index.js barrels** — all 10 features have explicit public APIs. Cross-feature imports are clean.
4. **Crawl plugin architecture** — well-decomposed, well-tested, serves as exemplar for other features.
5. **Frontend TypeScript discipline** — zero `any`, zero `@ts-ignore`, strict throughout.
6. **Centralized API client** — `tools/gui-react/src/api/client.ts` (39 LOC) routes all HTTP through one module.
7. **Pipeline context schema** — cumulative Zod checkpoints with enforcement modes.
8. **Zustand multi-store pattern** — clear store ownership, derived state via selectors.

---

## DOCUMENTATION GATE RULE (Mandatory)

> After each split or refactor step is merged, the following must be updated BEFORE the next step begins:
> 1. The domain README for every new or modified module boundary
> 2. `docs/01-project-overview/folder-map.md`
> 3. Any feature doc whose file paths, entry points, or flow changed
> 4. `docs/03-architecture/backend-architecture.md` or `frontend-architecture.md` if system maps changed
> 5. Cross-references in related docs that link to moved or renamed files

If this gate is skipped, documentation becomes stale mid-refactor and every subsequent LLM session will hallucinate against a codebase that no longer matches the docs.


## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | historical audit body preserved as supplemental record |
| source | `docs/03-architecture/backend-architecture.md` | current-state backend reference for active work |
| source | `docs/05-operations/documentation-audit-ledger.md` | historical-vs-current authority note for this refresh |

## Related Documents

- [Backend Architecture](./backend-architecture.md) - Current-state backend reference that supersedes historical path assumptions in this audit.
- [System Map](./system-map.md) - Current topology for the live repo.
- [Documentation Audit Ledger](../05-operations/documentation-audit-ledger.md) - Explains why this file is retained as history rather than current-state authority.
