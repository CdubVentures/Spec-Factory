# CLAUDE.grid.md - Spec Factory / Field Studio Grid

This file is read at session start and after every context compaction.
Keep it up to date as the project evolves.

---

# Field Rules + Grid + Data Authority Audit Guide

Audit date: 2026-02-24

This document is the compact operational map for:
- field rules compile/load
- item/component/enum review grid behavior
- data authority eventing and propagation

Use this to recover context after compaction and to avoid stale hierarchy assumptions.

## Canonical precedence (when documents disagree)

1. Runtime behavior in `src/` plus passing tests in `test/`
2. `implementation/data-managament/01-05-*.md`
3. `implementation/grid-rules/*.md`
4. `implementation/field-studio-contract/component-system-architecture.md`
5. `implementation/field-studio-contract/*.mmd` and `*.png` (reference diagrams; may lag)

## Audit status summary (2026-02-24)

- Data authority flow is consistent across backend producers, WS broadcast contract, frontend invalidation, and snapshot subscriber paths.
- Component slot aggregation invariant is documented and validated by tests.
- Flag taxonomy is coherent when normalized to one source of truth:
  - 7 primary real actionable flags
  - `compound_range_conflict` as an actionable variant of `constraint_conflict`
- One GUI contract test is currently failing in this environment (details in Testing section).

## Scope and source trees

### Canonical plan docs

`implementation/data-managament/`
- `01-data-authority-system-overview.md`
- `02-data-authority-data-sources.md`
- `03-data-authority-event-contract.md`
- `04-data-authority-subscribers-and-live-propagation.md`
- `05-data-authority-audit-playbook.md`

`implementation/grid-rules/`
- `component-slot-fill-rules.md`
- `flag-rules.md`
- `test-mode-data-coverage.md`
- `component-identity-pools-10-tabs.xlsx` (seed pool input)

`implementation/field-studio-contract/`
- `component-system-architecture.md`
- `field-studio-contract.mmd`
- `field-studio-contract-hierarchy.mmd`

### Runtime modules

Contract compile/load:
- `src/field-rules/compiler.js`
- `src/field-rules/loader.js`
- `src/field-rules/migrations.js`

Data authority and eventing:
- `src/api/events/dataChangeContract.js`
- `src/api/routes/dataAuthorityRoutes.js`
- `src/api/services/specDbSyncService.js`
- `src/api/services/compileProcessCompletion.js`
- `src/api/routes/studioRoutes.js`
- `src/api/routes/sourceStrategyRoutes.js`
- `src/api/routes/catalogRoutes.js`
- `src/api/routes/brandRoutes.js`
- `src/api/routes/reviewRoutes.js`

Review API and lane mutations:
- `src/api/guiServer.js`
- `src/api/reviewRouteSharedHelpers.js`
- `src/api/reviewMutationResolvers.js`
- `src/api/reviewItemRoutes.js`
- `src/api/reviewComponentMutationRoutes.js`
- `src/api/reviewEnumMutationRoutes.js`

Review payload builders:
- `src/review/reviewGridData.js`
- `src/review/componentReviewData.js`
- `src/review/keyReviewState.js`
- `src/review/componentImpact.js`

Persistence and seed:
- `src/db/specDb.js`
- `src/db/seed.js`
- `src/testing/testDataProvider.js`
- `src/testing/testRunner.js`
- `src/utils/componentIdentifier.js`
- `src/utils/candidateIdentifier.js`

Frontend propagation + review UI:
- `tools/gui-react/src/components/layout/AppShell.tsx`
- `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
- `tools/gui-react/src/api/dataChangeInvalidationMap.js`
- `tools/gui-react/src/hooks/useDataChangeSubscription.js`
- `tools/gui-react/src/hooks/useAuthoritySnapshot.js`
- `tools/gui-react/src/pages/studio/authoritySync.js`
- `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`
- `tools/gui-react/src/pages/component-review/ComponentSubTab.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`
- `tools/gui-react/src/pages/component-review/EnumSubTab.tsx`

## Data authority model (authoritative behavior)

1. Authoring sources (field-studio map, drafts, generated artifacts) define category authority.
2. Mutation routes emit typed `data-change` events with category scope.
3. WebSocket server filters by category (`dataChangeMatchesCategory`).
4. Frontend subscribers invalidate query families from `domains` mapping.
5. Compile completion attempts SpecDb sync before `process-completed` fanout.
6. Sync state is durable in `data_authority_sync` and exposed via authority snapshot API.

### Authority invariants

- Authority is category-scoped, not global transactional.
- Source host/domain is provenance metadata, not an authority key.
- Component and enum masters propagate to linked item surfaces.
- Item acceptance does not become master authority for component/enum definitions.

## Review grid contract (item, component, enum)

### Row and lane identity

- Component row key is strict: `component_type + component_name + component_maker`.
- Shared lane key uses canonical format: `type::name::maker`.
- Candidate actions stay slot-scoped and candidate-scoped.

### Component slot aggregation invariant

For row key `K = (type, name, maker)` and slot field `F`:

```
C(K, F) = count(candidates where product_id in linked_products(K) and field_key = F)
```

This applies uniformly to `__name`, `__maker`, and every property slot.
No slot type is allowed to use a different linked-product aggregation path.

### Fallback guardrail

- If `LP(K) > 0`, slot candidates come only from linked products.
- Queue/pipeline fallback is allowed only when `LP(K) == 0`.
- Fallback candidates must remain lane-scoped to exact `type + name + maker`.

## Flag taxonomy (grid rules source of truth)

Primary real actionable flags:
1. `variance_violation`
2. `constraint_conflict`
3. `new_component`
4. `new_enum_value`
5. `below_min_evidence`
6. `conflict_policy_hold`
7. `dependency_missing`

Actionable variant:
- `compound_range_conflict` (variant of `constraint_conflict`, treated as real in grid reason-code handling)

Non-flag visual states include `manual_override`, `missing_value`, confidence bands, and `pending_ai`.

## Data source precedence and projection

1. Compiled generated rules are baseline.
2. Draft rules overlay baseline via session cache merge.
3. Draft field order overrides compiled order and preserves `__grp::` markers.
4. Snapshot token is derived from draft timestamp, compiled timestamp, and SpecDb sync version.

Primary authority sources:
- `helper_files/{category}/_control_plane/*`
- `helper_files/{category}/_generated/*`
- `helper_files/{category}/_suggestions/*`
- `data_authority_sync` and runtime SQL tables in SpecDb

## Test mode contract highlights

- Seed pools come from `implementation/grid-rules/component-identity-pools-10-tabs.xlsx`.
- Maker-capable component types include A/B/makerless lanes for same name.
- Each component type has deterministic 6-11 rows and 1-3 non-discovered rows.
- Non-discovered rows remain visible under test-mode rules.

## Targeted validation tests

Data authority and propagation:
- `test/dataChangeContract.test.js`
- `test/dataChangeInvalidationMap.test.js`
- `test/dataChangeDomainParity.test.js`
- `test/dataAuthorityRoutes.test.js`
- `test/specDbSyncService.test.js`
- `test/specDbSyncVersion.test.js`
- `test/compileProcessCompletion.test.js`
- `test/studioRoutesPropagation.test.js`
- `test/mapValidationPreflight.test.js`
- `test/dataAuthorityPropagationMatrix.test.js`

Grid and field contract:
- `test/contractDriven.test.js`
- `test/componentReviewDataLaneState.test.js`
- `test/reviewLaneContractApi.test.js`
- `test/reviewLaneContractGui.test.js`
- `test/reviewGridData.test.js`
- `test/reviewOverrideWorkflow.test.js`
- `test/phase1FieldRulesLoader.test.js`

Audit execution snapshot (2026-02-24):
- Data authority suite: 30/30 passing.
- Grid suite: all targeted tests passing except `test/reviewLaneContractGui.test.js`.
- Current GUI failure: Playwright timeout waiting for visible `mouse_contract_lane_matrix_gui` option while option exists but is hidden.

## Quick run commands

```bash
# Data authority validation
node --test test/dataChangeContract.test.js test/dataChangeInvalidationMap.test.js test/dataChangeDomainParity.test.js test/dataAuthorityRoutes.test.js test/specDbSyncService.test.js test/specDbSyncVersion.test.js test/compileProcessCompletion.test.js test/studioRoutesPropagation.test.js test/mapValidationPreflight.test.js test/dataAuthorityPropagationMatrix.test.js

# Grid and field validation
node --test test/contractDriven.test.js test/componentReviewDataLaneState.test.js test/reviewLaneContractApi.test.js test/reviewLaneContractGui.test.js test/reviewGridData.test.js test/reviewOverrideWorkflow.test.js test/phase1FieldRulesLoader.test.js
```

## Working rules for future updates

- Keep this file aligned with canonical docs under `implementation/data-managament/` and `implementation/grid-rules/`.
- Treat mmd/png hierarchy diagrams as support artifacts, not sole authority.
- Update this file whenever event domains, flag taxonomy, slot aggregation behavior, or source precedence rules change.


## Core Development Philosophy

### TEST-DRIVEN DEVELOPMENT IS NON-NEGOTIABLE

Every single line of production code must be written in response to a failing test.
No exceptions. This is the fundamental practice that enables all other principles.

**RED → GREEN → REFACTOR**
- **RED**: Write the failing test first. Zero production code without a failing test.
- **GREEN**: Write the minimum code to make the test pass.
- **REFACTOR**: Improve only if it adds real value. Keep increments small and always working.

Wait for explicit commit approval before every commit.

### Decomposition Safety Rule — NON-NEGOTIABLE

When decomposing, extracting, or refactoring existing code, **existing functionality must never break**.

The protocol is:
1. **Tests must be green before touching anything.** Run the full test suite and confirm it passes. If tests are already failing, stop and fix them before refactoring.
2. **Write characterization tests first** for any code that lacks coverage before moving it. These tests capture the current behavior — they are the safety net for the extraction.
3. **Move in the smallest possible increments.** Extract one function or one responsibility at a time. Run tests after every single move. Never batch multiple extractions into one step.
4. **The extracted module must produce identical outputs** to the inline code it replaced, on the same inputs. If behavior changes during extraction, that is a bug, not a feature.
5. **No behavior changes during a refactor step.** Refactor means structure changes, behavior stays identical. If you want to change behavior, do it in a separate commit with its own failing test.
6. **If tests go red at any point during extraction, revert the extraction, not the tests.** The tests are the source of truth. A red test during refactor means the extraction broke something.
7. **The pipeline must run end-to-end successfully** on at least one product before a decomposition step is considered complete.

### App Section / Feature Organization (Vertical Slicing)

**Organize by Domain, Not by Technical Layer**
App sections and features must be entirely self-contained within their own domain directories. This approach, known as Vertical Slicing, ensures modularity and prevents tangled dependencies.

* **The Rule of Proximity:** Everything required for a specific app feature (validation, pure logic, state transformations, and UI components) must live together in that feature's directory. 
* **No Generic "Junk Drawers":** Directories like `src/utils/`, `src/helpers/`, or `src/services/` are strictly prohibited. If a function belongs to a specific feature, it lives in that feature's folder. If it is genuinely shared across multiple boundaries, it must be extracted into a clearly defined `shared-core/` or `infrastructure/` module.
* **Strict Boundary Enforcement:** One feature cannot directly import internal implementations from another. If "Feature A" needs data from "Feature B", it must communicate through explicitly defined public contracts (`index.js` exports) or a central orchestrator.

**Standardized Feature Directory Structure:**

src/
├── feature-a/               # Self-contained domain boundary
│   ├── index.js             # Explicit public API for this feature
│   ├── transformations.js   # Pure functions and mapping logic
│   ├── validation.js        # Domain-specific schemas
│   └── components/          # UI components (if applicable to the stack)
│
├── feature-b/               # Completely isolated from feature-a
│   ├── index.js
│   ├── core-logic.js
│   └── rules.js
│
└── shared-infrastructure/   # Cross-cutting side effects and external adapters
    ├── network-client.js
    └── logger.js

### Approved Refactoring Techniques

These are the only refactoring patterns used during decomposition. No other approaches.

- **Preparatory Refactoring**: Do not add new features to the core orchestrator module. Refactor and extract logic in preparation for upcoming phases to avoid accumulating technical debt. New capabilities should go into distinct new modules, not into the existing monolith.

- **Extract Method / Composing Method**: Aggressively break down the monolith. Extract isolated logic and domain-specific operations into smaller, pure functions within new, dedicated modules. Replace the original inline code with a single delegating call. The core orchestrator must read like a high-level sequence of named steps, abstracting away all implementation details.

- **Moving Features Between Modules**: Shift non-orchestration responsibilities out of the main loop and into dedicated domain modules. Billing belongs in the billing module. Telemetry formatting belongs in the runtime bridge. Extraction state belongs in the extraction phase module. The orchestrator owns sequencing only.

- **Red-Green-Refactor Pipeline for Extraction**: When extracting a module, write a failing test for the new standalone component first. Make it pass using the extracted logic. Then wire the new module back into the orchestrator as a replacement for the inline code. Run the full suite. Green = done.

### Testing Principles
- Test behavior, not implementation. 100% coverage through business behavior.
- Test through the public API exclusively.
- Use factory functions for test data (no `let`/`beforeEach` mutation).
- Tests must document expected business behavior.
- No 1:1 mapping between test files and implementation files required.
- Test runner: `node --test` (NOT Jest/Vitest — this project uses the built-in runner).
- Tests live in `test/` directory.

### Code Style (Functional)
- No data mutation — immutable data structures only.
- Pure functions wherever possible.
- No nested if/else — use early returns or composition.
- No comments — code should be self-documenting.
- Prefer options objects over positional parameters.
- Use array methods (`map`, `filter`, `reduce`) over loops.
- Small, focused functions. Avoid premature abstractions.

### JavaScript Conventions (this is a JS project, not TypeScript)
- All source files are `.js` ESM (`import`/`export`).
- GUI frontend (`tools/gui-react/`) is TypeScript + React.
- Use `zod` or `ajv` for schema validation at trust boundaries.
- Avoid `any` equivalents — validate at boundaries, trust internals.

### Guiding Principles (IndexLab Specific)
- **Accuracy first**: 95%+ on technical specs is the objective.
- **Evidence tiers + confidence gates** control what happens next.
- **Need-driven discovery**: NeedSet drives search — no endless alias loops.
- **Deterministic indexing**: `content_hash` dedupe + stable `snippet_id`s = replayable, auditable.
- **GUI must prove each phase**: no phase is "done" until GUI proof checklist is complete.

---

