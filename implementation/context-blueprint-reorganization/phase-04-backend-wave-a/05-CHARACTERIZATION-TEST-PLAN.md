# Phase 04 Characterization Test Plan

## Slice Test Policy

- Run focused suites continuously as each Wave A slice lands.
- Run full `npm test` before any progress/completion report.

## 04-01 Settings-Authority Contract Seed

- `test/settingsAuthorityFeatureContractWiring.test.js`
- `test/runtimeSettingsApi.test.js`
- `test/userSettingsService.test.js`
- `test/studioRoutesPropagation.test.js`
- `test/convergenceSettingsAuthorityWiring.test.js`
- `test/settingsAuthorityMatrixWiring.test.js`

## 04-02 Catalog-Identity Contract Seed

- `test/catalogIdentityFeatureContractWiring.test.js`
- `test/catalogBrandPropagationRoutes.test.js`
- `test/reviewRoutesDataChangeContract.test.js`
- `test/dataAuthorityPropagationMatrix.test.js`
- `test/productIdentityAuthority.test.js`

## 04-03 Review-Curation Contract Seed

- `test/reviewCurationFeatureContractWiring.test.js`
- `test/reviewRoutesDataChangeContract.test.js`
- `test/reviewGridData.test.js`
- `test/reviewLaneContractApi.test.js`
- `test/reviewLaneContractGui.test.js`

## Wave A Closure

- Targeted rerun of all Wave A slice suites.
- Full regression sweep: `npm test`.

### Wave A Closure Snapshot (2026-03-02)

- Targeted rerun command:
  - `node --test --test-concurrency=1 test/settingsAuthorityFeatureContractWiring.test.js test/runtimeSettingsApi.test.js test/userSettingsService.test.js test/studioRoutesPropagation.test.js test/convergenceSettingsAuthorityWiring.test.js test/settingsAuthorityMatrixWiring.test.js test/catalogIdentityFeatureContractWiring.test.js test/catalogBrandPropagationRoutes.test.js test/reviewRoutesDataChangeContract.test.js test/dataAuthorityPropagationMatrix.test.js test/productIdentityAuthority.test.js test/reviewCurationFeatureContractWiring.test.js test/reviewGridData.test.js test/reviewLaneContractApi.test.js test/reviewLaneContractGui.test.js`
  - Result: `91/91` passing.
- Full regression command:
  - `npm test`
  - Result: `3351/3351` passing (`210` suites).
