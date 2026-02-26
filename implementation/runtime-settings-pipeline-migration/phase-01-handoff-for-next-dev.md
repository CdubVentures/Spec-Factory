# Phase 01 Handoff (Next Developer)

## Phase Name
`Phase 01 - Ownership Contract and No-Overlap Matrix`

## Core Goal
Lock ownership so runtime settings have one canonical editor surface only, with no duplicated writer paths.

## What Phase 01 Covers
1. Define canonical ownership by settings domain:
   - Runtime -> Pipeline Settings (writer)
   - Convergence -> Pipeline Settings (writer)
   - Source Strategy -> Pipeline Settings (writer)
2. Define no-overlap policy:
   - Indexing can show runtime context/telemetry
   - Indexing cannot be a settings writer for runtime/convergence/source strategy
3. Define invariants that cannot regress during migration:
   - canonical persistence path stays intact
   - save-state truth remains persistence-driven
   - cross-tab propagation stays active
   - run payload key coverage remains complete
4. Add/maintain contract tests that enforce these boundaries.

## Required Context Files
- [phase-01-ownership-contract-and-no-overlap-matrix.md](C:/Users/Chris/Desktop/Spec%20Factory/implementation/runtime-settings-pipeline-migration/phase-01-ownership-contract-and-no-overlap-matrix.md)
- [settingsAuthority.ts](C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/stores/settingsAuthority.ts)
- [runtimeSettingsAuthority.ts](C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/stores/runtimeSettingsAuthority.ts)
- [convergenceSettingsAuthority.ts](C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/stores/convergenceSettingsAuthority.ts)
- [sourceStrategyAuthority.ts](C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/stores/sourceStrategyAuthority.ts)
- [IndexingPage.tsx](C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/pages/indexing/IndexingPage.tsx)
- [PipelineSettingsPage.tsx](C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx)

## Contract Tests to Run
```bash
node --test --test-concurrency=1 \
  test/settingsEndpointAuthorityOwnershipMatrix.test.js \
  test/settingsCacheReadAuthorityOwnership.test.js \
  test/settingsAuthorityMatrixWiring.test.js \
  test/runtimeSettingsKeyCoverageMatrix.test.js \
  test/convergenceCrossSurfacePropagationWiring.test.js
```

## Acceptance Criteria
- Ownership contract is explicit and consistent across docs/code/tests.
- No direct settings endpoint usage from page surfaces.
- Authority modules are the only settings route writers/readers.
- No-overlap rule is enforced by regression tests.

## Handoff Notes
- Phase 01 is a contract/enforcement phase, not a UI migration phase.
- If a Phase 01 test fails, fix ownership boundaries first, then proceed to feature work.
- Do not add new runtime writer paths in Indexing surfaces.
