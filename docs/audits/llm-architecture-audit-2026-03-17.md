# LLM Architecture Audit — 2026-03-17

> **Purpose:** Preserve the focused historical architecture audit of the LLM subsystem across backend and frontend boundaries.
> **Prerequisites:** [../README.md](../README.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-03-17

Historical note: this is a subsystem audit and refactor-analysis document, not the master current-state architecture contract for the entire app.

## 1. Executive Summary

The LLM subsystem spans **~35 backend files and ~30 frontend files** across 5 feature boundaries. It works — runs are executing, models are routing, billing is tracking — but it is **structurally fragile at scale**. The audit identified **5 Critical**, **8 High**, and **9 Medium** findings.

**Three systemic problems dominate:**

1. **No single source of truth for model identity.** Model names are scattered across `settingsDefaults.js`, `llmGroup.js`, `modelPricingCatalog.js`, `cortexRouter.js`, and `llmHelpers.js`. Changing a model name requires touching 5+ files. Provider inference is string-matching (`gemini-*` → gemini), not registry-based.

2. **The RuntimeDraft god-type bleeds everywhere.** A 400+ field flat record is the primary data contract between pipeline-settings, llm-config, and indexing features. No semantic grouping. Every feature imports it, couples to it, and passes it whole. Adding a field means touching 3 serialization layers (~2,100 LOC of field-by-field assignments).

3. **Validation exists but isn't wired to trust boundaries.** The llm-config feature has good validators (`detectEmptyModelFields`, `validatePhaseTokenLimits`, `providerHasApiKey`). The indexing mutation boundary calls none of them. Model strings, API keys, and JSON policy maps reach the backend unvalidated.

---

## 2. Severity-Ranked Findings

### CRITICAL

#### C1: Model Identity Has No SSOT
- **Files**: `src/shared/settingsDefaults.js:23-55`, `src/core/config/manifest/llmGroup.js:95-100`, `src/billing/modelPricingCatalog.js:28-62`, `src/core/llm/cortex/cortexRouter.js:62-67`, `src/api/helpers/llmHelpers.js:225-230`
- **Why**: 5 separate sources define model names. `llmGroup.js` defaults to `gemini-2.5-flash-lite`; `settingsDefaults.js` defaults to `gemini-2.5-flash`. Pricing catalog has 43 entries with no cross-reference to the provider registry.
- **Failure mode**: A model rename or deprecation requires finding every hardcoded reference across the stack. Miss one and billing is wrong or routing fails silently.
- **Direction**: Canonical model catalog in one file. All other layers reference it by ID. Provider registry becomes the SSOT for model → provider → cost → limits.

#### C2: Conflicting `LlmPhaseId` Type Definitions
- **Files**: `llm-config/types/llmPhaseTypes.ts:1-8` (kebab-case, 7 phases), `llm-config/types/llmPhaseOverrideTypes.ts:8` (camelCase, 5 phases)
- **Why**: Two incompatible union types for the same concept. `PHASE_GLOBAL_MAP` in `llmPhaseOverridesBridge.ts:48-58` only handles 5 phases. If called with `'global'` or `'extraction'`, it crashes on `undefined.globalModel`.
- **Failure mode**: Adding extraction to phase overrides causes runtime crash. TypeScript won't catch it because the type is `Partial<Record<...>>`.
- **Direction**: Single `LlmPhaseId` type. Exhaustive switch/map. Compile-time check for completeness.

#### C3: Duplicated `resolveProviderForModel`
- **Files**: `llmProviderRegistryBridge.ts:73-80` (exported), `llmMixDetection.ts:3-10` (private copy)
- **Why**: Same 8-line function in two files with different visibility. If one is patched and the other isn't, provider resolution diverges between mix detection and the rest of the system.
- **Failure mode**: Silent inconsistency in stale-model warnings vs. actual provider resolution.
- **Direction**: Delete the private copy. Import from bridge.

#### C4: Trust Boundary Gap — Indexing Mutation
- **Files**: `indexing/api/indexingRunModelPayload.ts:35-50`, `indexing/api/indexingRunLearningPayload.ts:44-55`, `indexing/api/indexingRunStartPayload.ts:137-141`
- **Why**: Model strings, API keys, and JSON policy maps pass through `readString()` (which only trims) and reach the backend without existence checks, format validation, or schema validation. No zod/ajv anywhere in the indexing API layer.
- **Failure mode**: Typo in model name → runtime LLM call failure deep in the pipeline. Malformed JSON policy map → parsing crash in worker. Empty API key for required provider → 401 errors mid-run.
- **Direction**: Pre-flight validation at the mutation boundary. Reuse existing llm-config validators (`detectEmptyModelFields`, `providerHasApiKey`). Add zod schema for JSON policy maps.

#### C5: Duplicated Field Label Maps
- **Files**: `llmModelValidation.ts:3-11` (`FIELD_LABELS`), `llmMixDetection.ts:132-140` (`STALE_FIELD_LABELS`)
- **Why**: Identical key→label mappings maintained in two places. Zero tests verify consistency.
- **Failure mode**: A field rename updates one map but not the other. User sees "Base model" warning for stale detection but "llmModelPlan" for empty validation.
- **Direction**: Single `LLM_MODEL_FIELD_LABELS` constant exported from a shared location.

### HIGH

#### H1: God-Type `RuntimeDraft` (400+ Fields)
- **Files**: `RuntimeFlowDraftContracts.ts:7`, consumed by `LlmConfigPage.tsx`, `PipelineSettingsPage.tsx`, `IndexingPage.tsx`, 3 serialization layers
- **Why**: Flat record with no semantic grouping. LLM, fetch, frontier, PDF, cortex, billing — all in one type. Every feature imports it whole. Adding a field means updating `RuntimeFlowDraftNormalizer.ts` (760 LOC), `RuntimeFlowDraftPayload.ts` (721 LOC), and `runtimeSettingsPayload.ts` (648 LOC) — 2,129 LOC of field-by-field assignments.
- **Failure mode**: Shotgun surgery on every schema change. High regression risk because the type is too large for humans to review completely.
- **Direction**: Extract semantic sub-types: `LlmPhaseConfig`, `FetchConfig`, `CortexConfig`, `BillingConfig`. Keep flat record for wire format, compose from typed sub-objects at serialization boundary.

#### H2: Provider Inference by String Matching
- **Files**: `src/core/llm/client/routing.js:88-100` (`providerFromModel()`)
- **Why**: `gemini-*` → gemini, `deepseek-*` → deepseek, else openai. No registry lookup. Breaks if model names change convention or a model is available from multiple providers.
- **Failure mode**: A model like `gemini-2.5-flash-preview-04-17` works. A hypothetical `flash-gemini-3` would route to OpenAI.
- **Direction**: Add explicit `provider` field to provider registry entries. Use registry lookup, fall back to string inference only as last resort.

#### H3: Three Pricing Sources
- **Files**: `modelPricingCatalog.js:28-62` (43 entries), `settingsDefaults.js:37-49` (global cost multipliers), `costRates.js:96-124` (per-model overrides)
- **Why**: Cost calculation merges three maps at runtime with no single resolved view. Alias pricing (`gpt-5-low` → gpt-5-mini) adds another indirection layer.
- **Failure mode**: Pricing update in catalog but not in overrides → billing drift. New model added to registry but missing from pricing catalog → zero-cost billing.
- **Direction**: Build resolved pricing map at post-merge time. Expose as config output. One lookup at billing time.

#### H4: Implicit Fallback Chains
- **Files**: `src/core/config/configPostMerge.js:84-129`, `src/core/llm/client/routing.js:214-227`
- **Why**: Model fallback chains are spread across two files using conditional assignment (`a || b || c`). No declarative registry. Chains can't be inspected or tested without executing the code.
- **Failure mode**: Circular fallback (write → validate → write) if configPostMerge logic changes. Silent null route if no fallback resolves.
- **Direction**: Declarative fallback registry: `{ plan: ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat'], ... }`. Validate no cycles at config load.

#### H5: Phase Override Mapping is Manual and Incomplete
- **Files**: `LlmPhaseSection.tsx:17-24` (`TAB_TO_OVERRIDE_KEY`), `llmPhaseOverridesBridge.ts:48-58` (`PHASE_GLOBAL_MAP`)
- **Why**: Two manual maps that must stay in sync. Neither is exhaustive. No compile-time completeness check. `TAB_TO_OVERRIDE_KEY` uses `Partial<Record<...>>` which makes missing entries invisible.
- **Failure mode**: Adding a new phase (e.g., `'hypothesis'`) requires updating both maps. Missing either → silent null render or runtime crash.
- **Direction**: Single registry with all phase metadata (ID, override key, global model key, reasoning flag). Derive both maps from it.

#### H6: LLM Validation Not Wired to Indexing
- **Files**: `llm-config/state/llmModelValidation.ts`, `llm-config/state/llmTokenLimitValidation.ts`, `llm-config/state/llmProviderApiKeyGate.ts` (validators exist), `indexing/api/indexingRunStartPayload.ts` (never calls them)
- **Why**: Good validation logic exists but lives in llm-config feature only. The indexing feature assembles payloads without calling any of it.
- **Failure mode**: User can start a run with empty model fields, missing API keys, or token caps exceeding model limits. Errors surface deep in the pipeline instead of at the start button.
- **Direction**: Extract validators to shared boundary. Call as pre-flight checks in indexing mutation.

#### H7: `resolveProviderForModel` Accepts Empty `modelId`
- **Files**: `llmProviderRegistryBridge.ts:73-80`
- **Why**: No guard for empty/whitespace string. Empty `modelId` returns `undefined` silently, which callers interpret as "model not in registry" rather than "invalid input."
- **Failure mode**: `bridgeRegistryToFlatKeys(registry, '')` returns null → cost fields not synced → stale pricing reaches backend.
- **Direction**: Early return for empty/whitespace modelId. Or throw. Callers already handle `undefined` return.

#### H8: API Key Resolution Chain Undocumented
- **Files**: `LlmConfigPage.tsx:256-288` (`ENV_KEY_MAP`), `llmProviderApiKeyGate.ts:13` (`DEFAULT_PROVIDER_RUNTIME_KEY`)
- **Why**: Two separate key→provider mappings with different structures. Special case: Gemini falls back to `llmPlanApiKey` (legacy). No documentation of precedence order.
- **Failure mode**: New default provider added → developer updates one map but not the other → provider shows "no key" even though key exists.
- **Direction**: Single canonical key resolution chain. Document precedence. Remove legacy Gemini special case or document why it exists.

### MEDIUM

#### M1: `settingsDefaults.js` Mixes All Concerns (508 LOC)
- 200+ settings. LLM models, fetch params, frontier thresholds, PDF config, cortex models, billing limits — all in one frozen object.
- **Direction**: Split into domain-scoped defaults files. Import and merge at config load.

#### M2: Three Serialization Layers (2,129 LOC Combined)
- `RuntimeFlowDraftNormalizer.ts` (760 LOC), `RuntimeFlowDraftPayload.ts` (721 LOC), `runtimeSettingsPayload.ts` (648 LOC). Each is 95% field-by-field assignments.
- **Direction**: Generate from schema. Or use a single generic map/transform function with field metadata.

#### M3: Data Clumping — Model + Token + Fallback
- `llmModelPlan`, `llmMaxOutputTokensPlan`, `llmMaxOutputTokensPlanFallback`, `llmPlanFallbackModel` always travel together but are 4 separate unrelated fields.
- **Direction**: `LlmRoleConfig { model, maxOutputTokens, fallbackModel, fallbackMaxOutputTokens }` per role.

#### M4: Duplicate `GlobalDraftSlice` Types
- `llmPhaseOverridesBridge.ts:38-46` vs `LlmPhaseSection.tsx:26-34`. Structurally identical.
- **Direction**: Export from bridge, import in section.

#### M5: Cortex Models Separate from Main Config
- Cortex uses `gpt-5-low`, `gpt-5-high`, etc. These are not in the provider registry. They're hardcoded in `cortexRouter.js` and `llmGroup.js`.
- **Direction**: Add cortex models to provider registry with `type: 'cortex'` and role hints.

#### M6: `clampPhaseTokenCap` is Dead Code
- `llmPhaseOverridesBridge.ts:82-88`. Exported, never called.
- **Direction**: Remove or wire into phase override token validation.

#### M7: `llmPhaseOverridesJson` Placeholder Unused in Backend
- Defined in settingsDefaults.js, referenced in llmGroup.js, but routing.js doesn't consume it.
- **Direction**: Implement or document as future work. Current phase override UI changes don't propagate to backend routing.

#### M8: No JSON Schema Validation for Policy Maps
- `searchProfileCapMapJson`, `serpRerankerWeightMapJson`, `fetchSchedulerInternalsMapJson` — trimmed strings, no parse/validate.
- **Direction**: zod schema at trust boundary.

#### M9: Inconsistent `allowEmpty` Semantics in Hydration
- Some fields allow empty (`llmPlanApiKey`), others don't (`llmModelPlan`). No documentation of why.
- **Direction**: Document policy. Empty model = inherit global (now implemented). Empty key = no override (document).

---

## 3. Recommended Module Split Plan

### Split A: Canonical Model Catalog (Highest Value)
- **Current overload**: Model names, costs, limits, and provider mappings scattered across 5+ files
- **Target**: `src/shared/llmModelCatalog.js`
- **Moves out**:
  - Model name constants from `settingsDefaults.js`
  - Pricing entries from `modelPricingCatalog.js`
  - Provider inference from `routing.js:providerFromModel()`
- **Stays temporarily**: `settingsDefaults.js` re-exports from catalog for backward compat
- **Benefit**: One file to update when adding/removing/repricing a model

### Split B: LLM Role Config Sub-Type
- **Current overload**: 28 flat fields in RuntimeDraft for 7 model roles
- **Target**: `tools/gui-react/src/features/pipeline-settings/state/llmRoleConfig.ts`
- **Moves out**: `{ model, maxOutputTokens, fallbackModel, fallbackMaxOutputTokens }` per role
- **Stays temporarily**: Flat field serialization (wire format unchanged)
- **Benefit**: Type-safe grouping. Eliminates data clumps. Makes "add a new role" a single-type change.

### Split C: Pre-flight Validation Layer
- **Current overload**: Validators in llm-config, not called from indexing
- **Target**: `tools/gui-react/src/features/llm-config/state/llmPreflightValidation.ts`
- **Moves out**: Composition of `detectEmptyModelFields` + `providerHasApiKey` + `validatePhaseTokenLimits`
- **Stays temporarily**: Individual validators (preflight calls them)
- **Benefit**: Single `validateLlmConfigForRun(draft, registry)` → `{ valid: boolean, issues: MixIssue[] }`. Wire into indexing mutation.

### Split D: Phase Registry (Single Source)
- **Current overload**: Phase IDs in 2 type files, mappings in 2 code files
- **Target**: `tools/gui-react/src/features/llm-config/state/llmPhaseRegistry.ts` (already exists, extend it)
- **Moves out**: `TAB_TO_OVERRIDE_KEY`, `PHASE_GLOBAL_MAP`, phase metadata
- **Stays temporarily**: Section components consume from registry
- **Benefit**: Add a phase in one place. Compile-time exhaustiveness checks.

---

## 4. Highest-Value Refactor First

**Fix C3 + C5: Eliminate duplicated code in llmMixDetection.ts**

This is the smallest change with the highest safety improvement. It removes two sources of divergence and takes ~10 minutes.

**Before** (`llmMixDetection.ts`):
```typescript
// PRIVATE COPY — can diverge from the exported version
function resolveProviderForModel(registry, modelId) {
  return registry.find(p => p.enabled && p.models.some(m => m.modelId === modelId));
}

// DUPLICATE LABELS — can diverge from llmModelValidation.ts
const STALE_FIELD_LABELS: Record<string, string> = {
  llmModelPlan: 'Base model', llmModelTriage: 'Triage model', ...
};
```

**After** (`llmMixDetection.ts`):
```typescript
import { resolveProviderForModel } from './llmProviderRegistryBridge';
import { LLM_MODEL_FIELD_LABELS } from './llmFieldLabels';
```

**New file** (`llmFieldLabels.ts`):
```typescript
export const LLM_MODEL_FIELD_LABELS: Record<string, string> = {
  llmModelPlan: 'Base model',
  llmModelTriage: 'Triage model',
  llmModelFast: 'Fast model',
  llmModelReasoning: 'Reasoning model',
  llmModelExtract: 'Extract model',
  llmModelValidate: 'Validate model',
  llmModelWrite: 'Write model',
};
```

**Why this unlocks the most**: Eliminates the two most dangerous divergence points. Both are in hot validation paths (mix detection runs on every model change). Safe to do without characterization tests — behavioral contract is identical.

---

## 5. Practical Implementation Order

| Phase | Work | Prereq | Risk | Parallelizable |
|-------|------|--------|------|----------------|
| **P0** | Fix C3 + C5 (dedup resolveProvider + field labels) | None | Trivial | Yes |
| **P0** | Fix C2 (unify LlmPhaseId types) | None | Low | Yes |
| **P1** | Fix H7 (guard empty modelId in resolveProviderForModel) | P0 | Low | Yes |
| **P1** | Fix M6 (remove dead clampPhaseTokenCap) | None | Trivial | Yes |
| **P1** | Fix M4 (dedup GlobalDraftSlice types) | None | Low | Yes |
| **P2** | Split C (pre-flight validation layer) | P0 | Medium | No — needs P0 |
| **P2** | Split D (phase registry consolidation) | P0, C2 fix | Medium | No — needs C2 |
| **P3** | Split A (canonical model catalog) | None | High (cross-stack) | No |
| **P3** | Fix C4 (wire validation to indexing mutation) | P2 | Medium | No — needs P2 |
| **P4** | Split B (LlmRoleConfig sub-type) | None | High (wide refactor) | Yes with P3 |
| **P5** | Fix H1 (RuntimeDraft semantic decomposition) | P4 | Very High | No |

**P0 items** are safe to merge independently. **P1 items** are low-risk cleanups. **P2-P3** deliver the architectural improvements. **P4-P5** are the big structural refactors that require characterization coverage first.

---

## 6. Executive Risk Tables

### App-Wide High-Level Risk Table

| Rank | Severity | Area | Primary Hotspot | LOC | Full Slice | Why It Matters | Action |
|------|----------|------|-----------------|-----|------------|----------------|--------|
| 1 | **CRITICAL** | Model Identity | `settingsDefaults.js` + 4 others | 508+541+87 | Backend config → routing → billing | Model rename requires 5+ file changes; miss one → silent billing/routing failure | Canonical model catalog (Split A) |
| 2 | **CRITICAL** | Trust Boundary | `indexingRunStartPayload.ts` | 318 | Indexing mutation → backend | Unvalidated model names, API keys, JSON maps reach runtime | Pre-flight validation (Split C + C4) |
| 3 | **CRITICAL** | Type Safety | `llmPhaseTypes.ts` + `llmPhaseOverrideTypes.ts` | 16 | Phase override → resolution → UI | Two incompatible phase ID types; crash on extraction override | Unify types (C2) |
| 4 | **HIGH** | State Management | `RuntimeDraft` (400+ fields) | 2,129 | 3 serialization layers | Every field change = 3-file shotgun surgery | Semantic sub-types (Split B, H1) |
| 5 | **HIGH** | Backend Routing | `routing.js` | 541 | LLM call dispatch | String-based provider inference; implicit fallback chains | Registry-based routing (H2, H4) |
| 6 | **HIGH** | Pricing | `modelPricingCatalog.js` + 2 others | 298 | Billing pipeline | Three pricing sources merged at runtime; no single view | Resolved pricing map (H3) |
| 7 | **HIGH** | Validation | llm-config validators | 181 | LLM config UI only | Good validators exist but aren't called at run boundary | Wire to indexing (H6) |
| 8 | **MEDIUM** | Config | `settingsDefaults.js` | 508 | All features | Mixed concerns; LLM + fetch + PDF + cortex in one file | Domain-scoped split (M1) |

### Critical Finding Drill-Down: C1 — Model Identity Has No SSOT

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/shared/settingsDefaults.js:23-55,102-293` | 508 | Role defaults + provider registry JSON | Defines 12 model defaults + 43 registry models |
| Supporting hotspot | `src/core/config/manifest/llmGroup.js:95-143` | 149 | Env-var defaults | Defines different defaults than settingsDefaults |
| Pricing layer | `src/billing/modelPricingCatalog.js:28-62` | 87 | Canonical pricing | 43 entries; no cross-ref to registry |
| Routing layer | `src/core/llm/client/routing.js:88-100` | 541 | Provider inference | String-matches model name → provider |
| Cortex routing | `src/core/llm/cortex/cortexRouter.js:62-67` | 100+ | Cortex model names | Hardcoded gpt-5 variants; not in registry |
| Helper layer | `src/api/helpers/llmHelpers.js:225-230` | 292 | Model candidates | Hardcoded fallback candidates |
| Config post-merge | `src/core/config/configPostMerge.js:84-129` | 200+ | Fallback chains | Model → model fallback assignments |

**Why this is still Critical**: A model deprecation (e.g., `gemini-2.5-flash` → `gemini-2.5-flash-001`) requires changes in 7 files across 3 layers (config, routing, billing). The provider registry in `settingsDefaults.js` is the closest thing to a SSOT, but `routing.js` doesn't consult it — it infers provider from model name strings. Pricing catalog is a separate hardcoded map. Until these converge into one catalog, every model change is a multi-file shotgun surgery with silent-failure risk.

### Critical Finding Drill-Down: C4 — Trust Boundary Gap at Indexing Mutation

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `indexing/api/indexingRunModelPayload.ts:35-50` | 62 | Model payload | Passes model strings without existence check |
| Supporting hotspot | `indexing/api/indexingRunLearningPayload.ts:44-55` | 71 | API key payload | API keys trimmed but not validated |
| Orchestrator | `indexing/api/indexingRunStartPayload.ts:137-141,287-313` | 318 | Payload assembly | Composes all sub-builders; no pre-flight validation |
| JSON policy maps | `indexingRunStartPayload.ts:137-141` | 4 lines | Policy payloads | Trimmed strings; no JSON parse/validate |
| Mutation entry | `indexing/api/indexingRunMutations.ts` | 189 | Mutation hook | Calls builders directly; no validation gate |
| **Existing validators (unused)** | `llm-config/state/llmModelValidation.ts` | 29 | Empty model check | Available but not called from indexing |
| **Existing validators (unused)** | `llm-config/state/llmProviderApiKeyGate.ts` | 43 | API key check | Available but not called from indexing |

**Why this is still Critical**: The indexing mutation is the primary way users start runs. Every run passes through `buildIndexingRunStartPayload`. A typo in a model name, a missing API key, or a malformed JSON policy map all pass through to the backend, where they cause failures deep in the pipeline (during LLM calls, not at run start). The validators to catch these already exist — they're just not wired to this boundary. This is the highest-ROI fix: connect existing code to the trust boundary.

### High Finding Drill-Down: H1 — RuntimeDraft God-Type

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Type definition | `RuntimeFlowDraftContracts.ts:7` | 1 | Type alias | 400+ fields via Omit from defaults |
| Normalizer | `RuntimeFlowDraftNormalizer.ts` | 760 | Storage → draft | Field-by-field normalization with legacy fallbacks |
| Flow payload | `RuntimeFlowDraftPayload.ts` | 721 | Draft → payload | Field-by-field bounded serialization |
| Settings payload | `runtimeSettingsPayload.ts` | 648 | Payload → wire | Field-by-field clamping + serialization |
| Domain types | `runtimeSettingsDomainTypes.ts:32-289` | 560 | 291 setters | Primitive obsession at scale |
| Hydration | `runtimeSettingsHydration.ts` | ~200 | Wire → setters | More field-by-field assignments |
| **Total serialization chain** | 3 files | **2,129** | Draft ↔ wire format | Every field change = 3-file edit |

**Why this is still High**: The RuntimeDraft type is the backbone of the settings system. It works because the fields are exhaustively enumerated in all three serialization layers. But at 400+ fields, it's beyond human reviewability. Adding one LLM field (e.g., `llmModelHypothesis`) requires edits in 3 files totaling 2,129 LOC. The regression risk per change is proportional to the number of untested field interactions. This is not fixable without semantic decomposition into sub-types.

### High Finding Drill-Down: H2+H4 — Backend Routing Architecture

| Scope | Target | LOC | Role | Risk Contribution |
|-------|--------|-----|------|-------------------|
| Primary hotspot | `src/core/llm/client/routing.js` | 541 | Route resolution | ROLE_KEYS, provider inference, fallback chains |
| Config layer | `src/core/config/configPostMerge.js:84-129` | 200+ | Fallback assignment | Implicit model→model fallback chains |
| Provider dispatch | `src/core/llm/providers/index.js` | 30 | Provider selection | 4 hardcoded providers; string switch |
| Cortex routing | `src/core/llm/cortex/cortexRouter.js` | 100+ | Cortex dispatch | Separate model namespace; not in registry |

**Why this is still High**: The routing layer is the production execution path for every LLM call. Provider inference by model-name string matching is the weakest link — it works for current naming conventions but will break the first time a model name doesn't follow the `{provider}-*` pattern. The fallback chain in `configPostMerge.js` is implicit (`a || b || c`) with no cycle detection. Adding a 5th provider requires changes in routing.js + providers/index.js + configPostMerge.js. The cortex routing system operates in parallel with its own model namespace. These should converge into a single registry-driven dispatch.
## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsDefaults.js` | default model identities and runtime draft surface referenced by the audit |
| source | `src/core/config/manifest/llmGroup.js` | env-backed LLM settings inventory referenced by the audit |
| source | `src/core/llm/client/routing.js` | backend routing and provider inference behavior cited by the audit |
| source | `tools/gui-react/src/features/llm-config/state/llmModelRoleRegistry.ts` | frontend LLM role registry and label contracts cited by the audit |
| source | `tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftContracts.ts` | RuntimeDraft coupling cited by the audit |

## Related Documents

- [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md) - current LLM/config authority surfaces referenced by this audit.
- [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md) - current user-facing settings flow touched by the LLM subsystem.
- [./llm-integration-audit-2026-03-17.md](./llm-integration-audit-2026-03-17.md) - broader integration audit covering runtime flow, providers, and diagrams.
