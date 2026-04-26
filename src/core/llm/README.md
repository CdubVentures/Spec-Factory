## Purpose

Own repo-wide infrastructure for LLM provider/client/prompt plumbing: model resolution, provider metadata, policy schemas, and route-level helpers for LLM configuration surfaces.

## Public API (The Contract)

- `routeResolver.js` -- `resolveModelFromRegistry`, `resolveModelCosts`, `resolveModelTokenProfile`
- `providerMeta.js` -- `providerFromModelToken`, provider metadata lookups
- `providerRegistryDefaults.js` -- `mergeDefaultApiModelsIntoRegistry` for backfilling default API model entries without touching Lab providers
- `llmModelValidation.js` -- model token validation
- `llmPolicySchema.js` -- LLM policy schema definitions
- `operationStreamingPolicy.js` -- live operation stream preview policy resolution
- `llmRouteHelpers.js` -- `llmProviderFromModel`, `resolveLlmRoleDefaults`, `resolveLlmKnobDefaults`, `resolvePricingForModel`, `resolveTokenProfileForModel`, `collectLlmModels`, `deriveTrafficLightCounts`
- `buildLlmCallDeps.js` -- `buildLlmCallDeps` (dependency injection for LLM calls)
- `labQueue.js` -- `enqueueLabCall` (serial queue for lab-proxied LLM calls)
- `createRouteLlmLogger.js` -- `createRouteLlmLogger` (per-route LLM logging)
- `zodToLlmSchema.js` -- Zod-to-LLM schema conversion
- `writerModelTest.js` -- Writer phase compatibility prompt, schema, semantic evaluator, and runner
- `client/` -- LLM client implementations
- `providers/` -- provider-specific adapters
- `prompts/` -- universal prompt fragments shared across finders (identity warning, siblings exclusion, evidence contract, value confidence rubric, discovery-history header). See `prompts/README.md` for the public API.

## Dependencies

- Allowed: `src/core/**`, `src/shared/**`, `src/billing/**`
- Forbidden: `src/features/`, `src/app/api/`, `src/db/`

## Domain Invariants

- Model resolution is registry-first, prefix-fallback second.
- Pricing and token limits must come from provider registry model entries; no separate model pricing catalog is active.
- Provider detection uses `providerMeta.js` as SSOT.
