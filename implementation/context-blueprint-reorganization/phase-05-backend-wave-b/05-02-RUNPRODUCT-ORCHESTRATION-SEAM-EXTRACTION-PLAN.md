# 05-02 runProduct Orchestration Seam Extraction Plan

## Status

- Task ID: `05-02`
- State: `COMPLETED`
- Start date: `2026-03-02`
- Completion date: `2026-03-02`
- Owner: `Architecture Reorganization Track`

## Objective

Define and execute the first bounded extraction sequence for `src/pipeline/runProduct.js` orchestration seams while preserving runtime behavior.

## Outputs Produced

1. First bounded helper seam extraction from `src/pipeline/runProduct.js`:
   - Added `src/pipeline/helpers/runProductOrchestrationHelpers.js`
   - Moved helper ownership to module seam:
     - `buildNeedSetIdentityCaps`
     - `loadEnabledSourceStrategyRows`
2. `runProduct` orchestration rewire to consume extracted helper seam:
   - `src/pipeline/runProduct.js`
3. Characterization wiring coverage for the new seam:
   - `test/runProductOrchestrationSeamWiring.test.js`
   - `test/convergenceRuntimeKnobWiring.test.js` (seam ownership assertion updated)

## Completion Criteria

- [x] First `runProduct` helper seam extracted into dedicated module.
- [x] `runProduct` consumes extracted seam via helper import (no inline helper fallback).
- [x] Focused runtime characterization suites are green.
- [x] Full repository regression sweep (`npm test`) captured for this slice.

## Validation Evidence

Command:

```bash
node --check src/pipeline/helpers/runProductOrchestrationHelpers.js
node --check src/pipeline/runProduct.js
node --check test/runProductOrchestrationSeamWiring.test.js
node --test --test-concurrency=1 test/convergenceRuntimeKnobWiring.test.js test/runProductOrchestrationSeamWiring.test.js test/runtimeRunPayloadBaselineWiring.test.js test/runtimeFetchRenderKnobWiring.test.js test/runtimeDiscoveryEndpointKnobWiring.test.js test/runtimeScreencastKnobWiring.test.js test/runtimeObservabilityKnobWiring.test.js test/runtimeSettingsApi.test.js
```

Result: `19/19` passing.

Command:

```bash
npm test
```

Result: `3354/3354` passing (`210` suites).

## Next Task

- `05-03`: settings internals and composition seam cutover plan.
