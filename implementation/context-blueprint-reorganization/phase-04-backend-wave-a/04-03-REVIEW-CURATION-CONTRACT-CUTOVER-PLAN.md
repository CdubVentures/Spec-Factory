# 04-03 Review-Curation Contract Cutover Plan

## Status

- Task ID: `04-03`
- State: `COMPLETED`
- Start date: `2026-03-02`
- Completion date: `2026-03-02`
- Owner: `Architecture Reorganization Track`

## Objective

Seed `review-curation` backend feature contract and rewire first review API consumers through that contract while preserving data-change and mutation semantics.

## Outputs Produced

1. `src/features/review-curation/index.js`
2. First review API consumer rewires from deep review imports to feature contract:
   - `src/api/guiServer.js`
3. Characterization coverage update for review contract wiring:
   - `test/reviewCurationFeatureContractWiring.test.js`

## Completion Criteria

- [x] `review-curation` backend feature contract entrypoint exists.
- [x] First review API consumer reads review capabilities through feature contract.
- [x] Focused review characterization suites are green.
- [x] Full repository regression sweep (`npm test`) captured for this slice.

## Validation Evidence

Command:

```bash
node --test --test-concurrency=1 test/reviewCurationFeatureContractWiring.test.js test/reviewRoutesDataChangeContract.test.js test/reviewGridData.test.js test/reviewLaneContractApi.test.js test/reviewLaneContractGui.test.js
```

Result: `40/40` passing.

Command:

```bash
npm test
```

Result: `3351/3351` passing (`210` suites).

## Next Task

- `04-04`: Wave A guardrail closure and Phase 05 handoff packet.
