# Phase 01 - Ownership Contract and No-Overlap Matrix

## Objective
Establish a hard ownership contract so runtime settings have exactly one editing surface (`Pipeline Settings`) and zero duplicated writers. This phase defines and locks the rules before moving UI code.

## Why This Phase Exists
Current behavior mixes responsibilities:
- Runtime settings are edited in `Indexing Lab` (`IndexingPage` + `RuntimePanel`).
- Convergence settings are edited in both `Indexing Lab` and `Pipeline Settings`.
- `IndexingPage` also owns local runtime state used for `/process/start` payload assembly.

Without a contract-first phase, migration risks include:
- hidden duplicate writers,
- conflicting save semantics,
- stale run payload wiring,
- and regression in persistence/propagation guarantees.

## Target End State for Phase 01
At phase close, the project has a documented and test-backed ownership matrix that says:
- `Pipeline Settings` is the canonical runtime settings writer surface.
- `Indexing Lab` is run control/telemetry only (runtime config may be shown read-only during transition).
- Each settings domain has one canonical writer and known reader list.
- Any duplicated writer path is treated as a regression.

This phase is contract and enforcement scaffolding; it does **not** yet perform the full UI move.

## In Scope
1. Define canonical ownership per settings domain and per key group.
2. Define no-overlap policy for runtime/convergence/source-strategy surfaces.
3. Define transition rules for `Indexing Lab` during migration.
4. Define persistence + propagation invariants that must remain unchanged.
5. Add/adjust contract tests that enforce ownership boundaries.
6. Capture evidence and update implementation docs.

## Out of Scope
- Moving runtime controls into new Pipeline tabs (Phase 03).
- Deleting old Indexing runtime controls (Phase 04).
- Final GUI migration persistence E2E matrix refresh (Phase 05).

## Source of Truth Files
- Frontend ownership and authorities:
  - `tools/gui-react/src/stores/runtimeSettingsAuthority.ts`
  - `tools/gui-react/src/stores/convergenceSettingsAuthority.ts`
  - `tools/gui-react/src/stores/sourceStrategyAuthority.ts`
  - `tools/gui-react/src/stores/settingsAuthority.ts`
- Current writer surfaces:
  - `tools/gui-react/src/pages/indexing/IndexingPage.tsx`
  - `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`
  - `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`
- Backend contract + persistence:
  - `src/api/services/settingsContract.js`
  - `src/api/routes/configRoutes.js`
  - `src/api/services/userSettingsService.js`

## Ownership Matrix to Ratify

### Domain-Level Ownership
- Runtime settings (`/runtime-settings`)
  - Canonical writer surface: `Pipeline Settings`
  - Canonical frontend authority: `useRuntimeSettingsAuthority`
  - Persistence target: `helper_files/_runtime/user-settings.json` (`runtime` section)
- Convergence settings (`/convergence-settings`)
  - Canonical writer surface: `Pipeline Settings`
  - Canonical frontend authority: `useConvergenceSettingsAuthority`
- Source strategy (`/source-strategy`)
  - Canonical writer surface: `Pipeline Settings`
  - Canonical frontend authority: `useSourceStrategyAuthority`

### Indexing Lab Policy
- Allowed:
  - Run controls, run payload consumption of already-hydrated runtime settings, telemetry/read-only summaries.
- Disallowed (after migration completion):
  - Any editable runtime/convergence/source-strategy controls.
  - Any direct settings endpoint mutation from Indexing surfaces.

## Required Invariants (Must Stay True Throughout Migration)
1. No backend route or schema changes that break persisted keys.
2. Runtime settings still persist via canonical-first path (`/runtime-settings` -> `user-settings.json`).
3. Cross-tab propagation remains active via settings propagation contract.
4. Save-state truth remains persistence-driven (`saving/error/partial/ok`), never optimistic-only.
5. `/process/start` payload continues to include full runtime key coverage.

## Work Breakdown

### 1. Contract Specification
- Create a contract table (domain -> writer -> readers -> route -> persistence target -> propagation domain).
- Explicitly mark `Indexing Lab` runtime editing as transitional/deprecated.
- Define completion criteria for "no overlap".

### 2. Test Contract Scaffolding
- Add/extend ownership matrix tests to enforce that runtime/convergence/source-strategy writer ownership is Pipeline-first.
- Add explicit test assertions for "Indexing pages must not become direct settings endpoint callers" (already partially covered; extend for new runtime move state).
- Add transitional assertion strategy:
  - Until Phase 04, tests can allow legacy runtime editor presence but must fail on new duplicate writers.

### 3. Documentation Contract Wiring
- Update implementation docs to record:
  - the approved ownership model,
  - transition boundary,
  - and required invariants.
- Link this phase doc from `AGENTS.md` and/or `implementation/gui-persistence` once accepted.

### 4. Readiness Gate for Phase 02
- Confirm all runtime keys in `settings-knob-usage-audit.json` are accounted for in migration mapping.
- Confirm there is no unresolved key with unknown destination tab/section.

## Deliverables
1. This phase doc (approved).
2. Contract test updates (ownership/no-overlap scaffolding).
3. Updated ownership matrix docs in GUI persistence implementation docs.
4. Phase exit checklist signed with evidence references.

## Exit Criteria (Definition of Done)
- Ownership contract is documented and unambiguous.
- No-overlap rule is enforceable by tests (or transitional guards with dated TODOs).
- Runtime key inventory has explicit destination mapping for future Pipeline tabs.
- Existing settings persistence and propagation tests remain green.

## Test Plan for Phase 01
Run targeted contract/wiring suites:
- `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
- `test/settingsCacheReadAuthorityOwnership.test.js`
- `test/settingsAuthorityMatrixWiring.test.js`
- `test/runtimeSettingsKeyCoverageMatrix.test.js`
- `test/convergenceCrossSurfacePropagationWiring.test.js`

If contract tests are added in this phase, include them in this list and record pass results in the phase evidence section.

## Risks and Mitigations
- Risk: hidden duplicate writer paths in nested components.
  - Mitigation: ownership grep audit + explicit test coverage by path.
- Risk: breaking run payload behavior while ownership moves.
  - Mitigation: preserve/expand `runtimeSettingsKeyCoverageMatrix` and run payload baseline tests.
- Risk: accidental persistence target drift.
  - Mitigation: keep `settingsContract` and `configRoutes` unchanged in this phase; contract-only updates first.

## Evidence Capture Template
When completing this phase, record:
- Commands run
- Test pass counts
- Updated files list
- Any deferred items with explicit phase target

---

## Phase 01 Checklist
- [ ] Ownership matrix finalized and reviewed.
- [ ] No-overlap policy written and approved.
- [ ] Contract tests added/updated.
- [ ] Runtime key destination mapping drafted for Phase 03 tab layout.
- [ ] Targeted suites green and captured.
