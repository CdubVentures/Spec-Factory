# Phase 05 Characterization Test Plan

## Slice Test Policy

- Run focused suites continuously as each Wave B slice lands.
- Run full `npm test` before any progress/completion report.

## 05-01 Wave B Kickoff Baseline

- `test/runtimeRunPayloadBaselineWiring.test.js`
- `test/runtimeFetchRenderKnobWiring.test.js`
- `test/runtimeDiscoveryEndpointKnobWiring.test.js`
- `test/runtimeScreencastKnobWiring.test.js`
- `test/runtimeObservabilityKnobWiring.test.js`
- `test/cliCommandDispatch.test.js`
- `test/guiServerRouteRegistryWiring.test.js`
- `test/settingsAuthorityFeatureContractWiring.test.js`
- `test/catalogIdentityFeatureContractWiring.test.js`
- `test/reviewCurationFeatureContractWiring.test.js`

## 05-02 runProduct Orchestration

- `test/convergenceRuntimeKnobWiring.test.js`
- `test/runProductOrchestrationSeamWiring.test.js`
- `test/runtimeRunPayloadBaselineWiring.test.js`
- `test/runtimeFetchRenderKnobWiring.test.js`
- `test/runtimeDiscoveryEndpointKnobWiring.test.js`
- `test/runtimeScreencastKnobWiring.test.js`
- `test/runtimeObservabilityKnobWiring.test.js`
- `test/runtimeSettingsApi.test.js`

## 05-03 Settings Internals and Composition Seams (planned)

- `test/settingsAuthorityFeatureContractWiring.test.js`
- `test/runtimeSettingsApi.test.js`
- `test/userSettingsService.test.js`
- `test/cliCommandDispatch.test.js`
- `test/guiServerRouteRegistryWiring.test.js`
- `test/catalogIdentityFeatureContractWiring.test.js`
- `test/reviewCurationFeatureContractWiring.test.js`

## Wave B Closure

- Targeted rerun of all Wave B slice suites.
- Full regression sweep: `npm test`.

### Wave B Kickoff Snapshot (2026-03-02)

- Focused kickoff command:
  - `node --test --test-concurrency=1 test/runtimeRunPayloadBaselineWiring.test.js test/runtimeFetchRenderKnobWiring.test.js test/runtimeDiscoveryEndpointKnobWiring.test.js test/runtimeScreencastKnobWiring.test.js test/runtimeObservabilityKnobWiring.test.js test/cliCommandDispatch.test.js test/guiServerRouteRegistryWiring.test.js test/settingsAuthorityFeatureContractWiring.test.js test/catalogIdentityFeatureContractWiring.test.js test/reviewCurationFeatureContractWiring.test.js`
  - Result: `17/17` passing.

### 05-02 Seam Snapshot (2026-03-02)

- Focused seam command:
  - `node --test --test-concurrency=1 test/convergenceRuntimeKnobWiring.test.js test/runProductOrchestrationSeamWiring.test.js test/runtimeRunPayloadBaselineWiring.test.js test/runtimeFetchRenderKnobWiring.test.js test/runtimeDiscoveryEndpointKnobWiring.test.js test/runtimeScreencastKnobWiring.test.js test/runtimeObservabilityKnobWiring.test.js test/runtimeSettingsApi.test.js`
  - Result: `19/19` passing.
