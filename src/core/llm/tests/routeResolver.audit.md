# routeResolver.test.js Audit

Scope: `src/core/llm/tests/routeResolver.test.js`

Policy:
- Preserve registry lookup, model resolution, cost/token profile, and registry-to-routing integration contracts.
- Collapse repeated empty-input, malformed-registry, and one-case provider mapping tests into table-driven helper-family contracts.
- Retire no live behavior in this pass; reduction comes from collapsing duplicate edge-case coverage.

## buildRegistryLookup

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildRegistryLookup returns empty lookup for null/undefined/empty` | COLLAPSE | Same invalid-registry-input family as malformed JSON and non-array parsed values. | `routeResolver.lookupContracts.test.js` | Merged into invalid-registry-input test |
| `buildRegistryLookup parses JSON string` | COLLAPSE | Same valid-input family as pre-parsed array acceptance. | `routeResolver.lookupContracts.test.js` | Merged into valid-input test |
| `buildRegistryLookup accepts pre-parsed array` | COLLAPSE | Same valid-input family as JSON-string acceptance. | `routeResolver.lookupContracts.test.js` | Merged into valid-input test |
| `buildRegistryLookup skips disabled providers` | COLLAPSE | Same provider-filtering family as missing-id provider handling. | `routeResolver.lookupContracts.test.js` | Merged into provider-filtering test |
| `buildRegistryLookup builds composite index correctly` | COLLAPSE | Same index-shape family as model-index and duplicate-model-id coverage. | `routeResolver.lookupContracts.test.js` | Merged into composite/model index test |
| `buildRegistryLookup builds model index with all routes per model` | COLLAPSE | Same index-shape family as composite-index and duplicate-model-id coverage. | `routeResolver.lookupContracts.test.js` | Merged into composite/model index test |
| `buildRegistryLookup same modelId in two providers yields two entries in modelIndex` | COLLAPSE | Same index-shape family as composite-index and single-provider model-index coverage. | `routeResolver.lookupContracts.test.js` | Merged into composite/model index test |
| `buildRegistryLookup malformed JSON string yields empty lookup` | COLLAPSE | Same invalid-registry-input family as null/undefined/empty and non-array parsed values. | `routeResolver.lookupContracts.test.js` | Merged into invalid-registry-input test |
| `buildRegistryLookup non-array parsed value yields empty lookup` | COLLAPSE | Same invalid-registry-input family as null/undefined/empty and malformed JSON. | `routeResolver.lookupContracts.test.js` | Merged into invalid-registry-input test |
| `buildRegistryLookup provider missing id is skipped` | COLLAPSE | Same provider-filtering family as disabled-provider handling. | `routeResolver.lookupContracts.test.js` | Merged into provider-filtering test |
| `buildRegistryLookup provider missing models array uses empty` | KEEP | Distinct tolerance contract for provider entries without model arrays. | `routeResolver.lookupContracts.test.js` | Preserved |

## resolveModelFromRegistry

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `resolveModelFromRegistry composite key exact match` | COLLAPSE | Same composite-resolution family as deepseek composite route. | `routeResolver.resolveContracts.test.js` | Merged into composite-resolution test |
| `resolveModelFromRegistry composite key for deepseek` | COLLAPSE | Same composite-resolution family as gemini composite route. | `routeResolver.resolveContracts.test.js` | Merged into composite-resolution test |
| `resolveModelFromRegistry composite key miss returns null` | KEEP | Distinct composite-key miss contract. | `routeResolver.resolveContracts.test.js` | Preserved |
| `resolveModelFromRegistry bare key finds first enabled provider` | COLLAPSE | Same bare-key family as duplicate-provider precedence. | `routeResolver.resolveContracts.test.js` | Merged into bare-key resolution test |
| `resolveModelFromRegistry bare key with duplicate model picks first enabled` | COLLAPSE | Same bare-key family as first-enabled resolution. | `routeResolver.resolveContracts.test.js` | Merged into bare-key resolution test |
| `resolveModelFromRegistry bare key unknown model returns null` | KEEP | Distinct bare-key miss contract. | `routeResolver.resolveContracts.test.js` | Preserved |
| `resolveModelFromRegistry openai-compatible type` | COLLAPSE | Same provider-metadata family as anthropic and cortex type flow-through. | `routeResolver.resolveContracts.test.js` | Merged into provider-metadata test |
| `resolveModelFromRegistry anthropic type` | COLLAPSE | Same provider-metadata family as openai-compatible and cortex type flow-through. | `routeResolver.resolveContracts.test.js` | Merged into provider-metadata test |
| `resolveModelFromRegistry cortex type with modelMeta` | COLLAPSE | Same provider-metadata family as openai-compatible and anthropic type flow-through. | `routeResolver.resolveContracts.test.js` | Merged into provider-metadata test |
| `resolveModelFromRegistry openai-compatible ignores unknown model fields` | COLLAPSE | Same provider-metadata family as type and modelMeta propagation. | `routeResolver.resolveContracts.test.js` | Merged into provider-metadata test |
| `resolveModelFromRegistry costs populated from model entry` | COLLAPSE | Same resolved-route metadata family as token profile population. | `routeResolver.resolveContracts.test.js` | Merged into provider-metadata test |
| `resolveModelFromRegistry token profile populated from model entry` | COLLAPSE | Same resolved-route metadata family as cost population. | `routeResolver.resolveContracts.test.js` | Merged into provider-metadata test |
| `resolveModelFromRegistry null lookup returns null` | COLLAPSE | Same invalid-lookup family as undefined lookup and empty/null/whitespace model keys. | `routeResolver.resolveContracts.test.js` | Merged into invalid-lookup test |
| `resolveModelFromRegistry undefined lookup returns null` | COLLAPSE | Same invalid-lookup family as null lookup and empty/null/whitespace model keys. | `routeResolver.resolveContracts.test.js` | Merged into invalid-lookup test |
| `resolveModelFromRegistry empty string key returns null` | COLLAPSE | Same invalid-key family as null and whitespace-only keys. | `routeResolver.resolveContracts.test.js` | Merged into invalid-lookup test |
| `resolveModelFromRegistry null key returns null` | COLLAPSE | Same invalid-key family as empty and whitespace-only keys. | `routeResolver.resolveContracts.test.js` | Merged into invalid-lookup test |
| `resolveModelFromRegistry whitespace-only key returns null` | COLLAPSE | Same invalid-key family as empty and null keys. | `routeResolver.resolveContracts.test.js` | Merged into invalid-lookup test |
| `resolveModelFromRegistry missing type defaults to openai-compatible` | KEEP | Distinct provider-type defaulting contract. | `routeResolver.resolveContracts.test.js` | Preserved |
| `resolveModelFromRegistry model role in modelMeta` | KEEP | Distinct model-role propagation contract. | `routeResolver.resolveContracts.test.js` | Preserved |

## resolveModelCosts / resolveModelTokenProfile

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `resolveModelCosts returns registry costs for known model` | COLLAPSE | Same cost-resolution family as composite-key cost lookup. | `routeResolver.costContracts.test.js` | Merged into registry-cost test |
| `resolveModelCosts returns fallback rates for unknown model` | COLLAPSE | Same fallback-cost family as null-lookup and zero-default handling. | `routeResolver.costContracts.test.js` | Merged into fallback/default-cost test |
| `resolveModelCosts returns zeros when no model and no fallback` | COLLAPSE | Same fallback-cost family as unknown-model and null-lookup handling. | `routeResolver.costContracts.test.js` | Merged into fallback/default-cost test |
| `resolveModelCosts null lookup returns fallback` | COLLAPSE | Same fallback-cost family as unknown-model and zero-default handling. | `routeResolver.costContracts.test.js` | Merged into fallback/default-cost test |
| `resolveModelCosts composite key works` | COLLAPSE | Same cost-resolution family as known bare-model lookup. | `routeResolver.costContracts.test.js` | Merged into registry-cost test |
| `resolveModelTokenProfile returns profile for known model` | COLLAPSE | Same token-profile family as composite-key profile lookup. | `routeResolver.costContracts.test.js` | Merged into token-profile test |
| `resolveModelTokenProfile returns null for unknown model` | COLLAPSE | Same null-profile family as null-lookup handling. | `routeResolver.costContracts.test.js` | Merged into token-profile test |
| `resolveModelTokenProfile null lookup returns null` | COLLAPSE | Same null-profile family as unknown-model handling. | `routeResolver.costContracts.test.js` | Merged into token-profile test |
| `resolveModelTokenProfile composite key works` | COLLAPSE | Same token-profile family as known bare-model lookup. | `routeResolver.costContracts.test.js` | Merged into token-profile test |

## Registry To Routing Integration

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `integration config with registry -> resolveLlmRoute returns registry-resolved route` | KEEP | Primary registry-to-routing integration contract. | `routeResolver.integrationContracts.test.js` | Preserved |
| `integration config with registry + modelOverride re-resolves override from registry` | KEEP | Distinct override re-resolution contract. | `routeResolver.integrationContracts.test.js` | Preserved |
| `integration config with empty registry infers provider from model name + bootstrap keys` | KEEP | Distinct non-registry fallback routing contract. | `routeResolver.integrationContracts.test.js` | Preserved |
| `integration resolveLlmFallbackRoute with registry returns registry-resolved fallback` | KEEP | Distinct fallback-route integration contract. | `routeResolver.integrationContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/core/llm/tests/*.test.js`
- Surrounding core LLM tests: `node --test src/core/llm/tests/*.test.js`
- Full suite: `npm test`
