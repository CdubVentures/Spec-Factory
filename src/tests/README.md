## Purpose

Test-mode synthetic data generation, per-key field contract audit, and test runner infrastructure. Powers the `/api/v1/test-mode/*` endpoints.

## Public API (The Contract)

**testDataProvider.js** exports:
- `analyzeContract(helperRoot, category)` — analyze field rules contract for a category
- `buildTestProducts(category, contractAnalysis)` — generate synthetic product fixtures from scenario defs
- `buildSeedComponentDB(contractAnalysis, testCategory, options)` — build component identity seeds
- `loadComponentIdentityPools({ componentTypes, strict })` — load deterministic component identity pools
- `generateTestSourceResults({ product, fieldRules, ... })` — LLM-based source result generation

**deriveFailureValues.js** exports:
- `deriveTestValues(fieldKey, fieldRule, knownValues, componentDb)` — derive bad/good values per field key from contract rules

**fieldContractTestRunner.js** exports:
- `runFieldContractTests({ fieldRules, knownValues, componentDbs })` — per-key field contract audit (validateField + buildRepairPrompt per field)

**testRunner.js** exports:
- `runTestProduct({ config, job, sourceResults, category, ... })` — run full pipeline for a test product

## Dependencies

Allowed: `src/core/llm/`, `src/shared/`, `src/features/catalog/identity/` (via public index), `src/features/publish-pipeline/validation/` (validateField, templateDispatch, formatRegistry), `src/features/publish-pipeline/repair-adapter/` (promptBuilder).

Forbidden: direct imports from other feature internals.

## Domain Invariants

- Per-key audit is deterministic: same field rules = same test values = same results.
- No side effects — all I/O is passed in via parameters.
- Adding a field key requires zero code changes in test infrastructure (O(1) scaling).
