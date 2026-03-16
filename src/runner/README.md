## Purpose

Convergence loop orchestrator — runs multi-round product indexing until completion or budget/search exhaustion.

## Public API (The Contract)

**`runUntilComplete.js`** — async orchestrator + re-exports:
- `runUntilComplete({ storage, config, s3key, maxRounds, mode })` — main entry point
- Re-exports all functions from `convergenceHelpers.js` and `roundConfigBuilder.js` for backward compatibility

**`convergenceHelpers.js`** — leaf pure utilities:
- `toInt`, `toArray`, `normalizedRoundCount` — safe value coercion
- `summaryProgress`, `isCompleted` — summary state readers
- `makeRoundHint` — round label mapping
- `normalizeFieldForSearchQuery`, `buildAvailabilityQueries` — search query construction
- `normalizeFieldContractToken` — field key normalization
- `llmBlocked` — budget block reason reader
- `isIdentityOrEditorialField` — identity/editorial field classification
- `calcProgressDelta` — round-over-round improvement detection

**`roundConfigBuilder.js`** — round config domain logic:
- `buildContractEffortPlan` — weighted effort plan from field rules
- `selectRoundSearchProvider`, `explainSearchProviderSelection` — search provider resolution
- `evaluateRequiredSearchExhaustion` — stop condition for search loops
- `shouldForceExpectedFieldRetry` — one-shot retry for expected required fields
- `buildRoundConfig` — per-round config construction (budgets, discovery, LLM caps)
- `shouldStopForBudgetExhaustion` — budget stop gate
- `makeLlmTargetFields` — LLM target field selection
- `resolveMissingRequiredForPlanning` — missing field resolution for planning
- `buildRoundRequirements` — round job override construction

## Dependencies

Allowed: `src/pipeline/`, `src/categories/`, `src/features/indexing/`, `src/queue/`, `src/engine/`, `src/utils/`, `src/logger.js`
Forbidden: Other feature folders, GUI code

## Domain Invariants

- Rounds are capped 1–12, always start from round 0
- Round 0 is always fast pass (no discovery, no search, no fetch)
- Budget exhaustion only stops after round 0
- Progress tracking resets on improvement
- Per-field call budget is enforced via `ruleAiMaxCalls`
- Expected-field retry is limited to once per run
