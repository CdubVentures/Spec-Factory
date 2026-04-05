## Purpose

Own repo-wide infrastructure for LLM provider/client/prompt plumbing: model resolution, pricing catalogs, provider metadata, policy schemas, and route-level helpers for LLM configuration surfaces.

## Public API (The Contract)

- `routeResolver.js` -- `resolveModelFromRegistry`, `resolveModelCosts`, `resolveModelTokenProfile`
- `providerMeta.js` -- `providerFromModelToken`, provider metadata lookups
- `llmModelValidation.js` -- model token validation
- `llmPolicySchema.js` -- LLM policy schema definitions
- `llmRouteHelpers.js` -- `llmProviderFromModel`, `resolveLlmRoleDefaults`, `resolveLlmKnobDefaults`, `resolvePricingForModel`, `resolveTokenProfileForModel`, `collectLlmModels`, `deriveTrafficLightCounts`
- `buildLlmCallDeps.js` -- `buildLlmCallDeps` (dependency injection for LLM calls)
- `createRouteLlmLogger.js` -- `createRouteLlmLogger` (per-route LLM logging)
- `zodToLlmSchema.js` -- Zod-to-LLM schema conversion
- `client/` -- LLM client implementations
- `providers/` -- provider-specific adapters

## Dependencies

- Allowed: `src/core/**`, `src/shared/**`, `src/billing/**`
- Forbidden: `src/features/`, `src/app/api/`, `src/db/`

## Domain Invariants

- Model resolution is registry-first, prefix-fallback second.
- Pricing data must come from `src/billing/modelPricingCatalog.js` -- never hardcoded.
- Provider detection uses `providerMeta.js` as SSOT.
