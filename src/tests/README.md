## Purpose

Test-mode synthetic data generation and test runner infrastructure. Powers the `/api/v1/test-mode/*` endpoints that let users validate indexing pipelines against contract-driven synthetic products.

## Public API (The Contract)

**testDataProvider.js** exports:
- `analyzeContract(helperRoot, category)` — analyze field rules contract for a category
- `buildTestProducts(category, contractAnalysis)` — generate synthetic product fixtures from scenario defs
- `buildSeedComponentDB(contractAnalysis, testCategory, options)` — build component identity seeds
- `loadComponentIdentityPools({ componentTypes, strict })` — load deterministic component identity pools
- `generateTestSourceResults({ product, fieldRules, ... })` — LLM-based source result generation
- `buildDeterministicSourceResults({ product, contractAnalysis, ... })` — deterministic (non-LLM) source results
- `buildValidationChecks(testCaseId, { normalized, summary, ... })` — build validation check suite
- `buildBaseValues(contractAnalysis, scenarioIdx, options)` — generate base field values for a scenario

**testRunner.js** exports:
- `runTestProduct({ storage, config, job, sourceResults, category })` — stub test product runner (returns identity/metadata only; validation stage not yet wired)

## Dependencies

Allowed: `src/core/llm/`, `src/shared/`, `src/features/catalog/identity/` (via public index).

Forbidden: direct imports from other feature internals.

## Domain Invariants

- Output is deterministic for identical inputs (same category + scenario index = same synthetic data).
- No side effects — all I/O is passed in via `storage`/`config` parameters.
- Scenario definitions (`SCENARIO_DEFS_DEFAULT`) cover all field-rule edge cases: happy path, missing fields, type mismatches, component references, list dedup, etc.
