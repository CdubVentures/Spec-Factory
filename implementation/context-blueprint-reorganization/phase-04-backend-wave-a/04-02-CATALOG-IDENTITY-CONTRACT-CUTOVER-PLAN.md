# 04-02 Catalog-Identity Contract Cutover Plan

## Status

- Task ID: `04-02`
- State: `COMPLETED`
- Start date: `2026-03-02`
- Completion date: `2026-03-02`
- Owner: `Architecture Reorganization Track`

## Objective

Seed `catalog-identity` backend feature contract and rewire first API consumers through that contract while preserving route behavior.

## Outputs Produced

1. `src/features/catalog-identity/index.js`
2. First API consumer rewires from deep catalog imports to feature contract:
   - `src/api/routes/catalogRoutes.js`
   - `src/api/routes/reviewRoutes.js`
3. Characterization coverage update for catalog contract wiring:
   - `test/catalogIdentityFeatureContractWiring.test.js`

## Completion Criteria

- [x] `catalog-identity` backend feature contract entrypoint exists.
- [x] First route consumers read identity capability through feature contract.
- [x] Focused catalog/review characterization suites are green.
- [x] Full repository regression sweep (`npm test`) captured for this slice.

## Validation Evidence

Command:

```bash
node --test --test-concurrency=1 test/catalogIdentityFeatureContractWiring.test.js test/catalogBrandPropagationRoutes.test.js test/reviewRoutesDataChangeContract.test.js test/dataAuthorityPropagationMatrix.test.js test/productIdentityAuthority.test.js
```

Result: `28/28` passing.

Command:

```bash
npm test
```

Result: `3349/3349` passing (`210` suites).

## Next Task

- `04-03`: review-curation contract cutover plan and first consumer rewire.
