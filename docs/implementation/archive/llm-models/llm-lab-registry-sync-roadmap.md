# LLM Lab ↔ Spec Factory: Model Registry Sync & Effort Routing Roadmap

**Created:** 2026-04-10
**Status:** Planning
**Scope:** Fix effort double-application, unify model registry SSOT, eliminate manual duplication

---

## Problem Statement

Three interrelated issues cause confusion and maintenance burden when using OpenAI models through LLM Lab:

1. **Double effort application** — Suffixed models (e.g., `gpt-5.4-xhigh`) encode effort in the model name, but Spec Factory also sends `reasoning_effort` in `request_options`. LLM Lab resolves this correctly (model suffix wins via `extract_reasoning_from_model_name` in `reasoning.py:101-127`), but Spec Factory's UI displays misleading effort state and sends a redundant/conflicting parameter.

2. **Inconsistent `thinking` flags** — Suffixed models have random `thinking: true/false` values used as a hack to control whether `reasoning_effort` gets sent. Users see "thinking: off" for models that actually think (e.g., `gpt-5.4-xhigh` has `thinking: false`).

3. **Manual O(N) duplication** — Models are hardcoded in both `model_registry.json` (LLM Lab) and the `DEFAULT_LLM_PROVIDER_REGISTRY_JSON` constant in `settingsRegistry.js` (Spec Factory). Adding a model requires updating both repos manually.

### What Already Works (Do NOT Touch)

LLM Lab's effort resolution is correct and battle-tested:
- `reasoning.py` — `extract_reasoning_from_model_name()`, `build_reasoning_param()`, `allowed_efforts_for_model()` all work correctly
- `upstream.py` — `normalize_model_name()` correctly strips effort suffixes
- `routes_openai.py:601-611` — Priority chain (model suffix overrides request_options) works as intended

---

## Phased Roadmap

### Phase 1: Fix Effort Routing (Spec Factory only)

**Goal:** When a suffixed model is selected, auto-detect the baked-in effort and don't double-send it in `request_options`.

**Changes:**

In `src/core/llm/client/routing.js` (`callLlmWithRouting`, lines ~510-518):
- Add a helper `extractEffortFromModelName(modelId)` that parses known suffixes (`-xhigh`, `-high`, `-medium`, `-low`, `-minimal`) and returns the effort level or `null`.
- Must NOT false-match on model name segments like `-mini`, `-nano`, `-pro`.
- If the model name has a baked-in effort, use that as the effective effort and **skip** sending `reasoning_effort` in `request_options` (the model name already carries it to LLM Lab).
- If the model name has NO suffix (base model like `gpt-5.4`), keep current behavior — send `reasoning_effort` from phase config.
- Apply the same logic to fallback (line ~623-631) and writer (line ~704-710) effort paths.

**Contract:**
```
extractEffortFromModelName("gpt-5.4-xhigh")  → "xhigh"
extractEffortFromModelName("gpt-5.4")         → null
extractEffortFromModelName("gpt-5.4-mini")    → null    (NOT an effort suffix)
extractEffortFromModelName("gpt-5.4-nano")    → null
extractEffortFromModelName("gpt-5.1-high")    → "high"
extractEffortFromModelName("gpt-5-minimal")   → "minimal"
```

When `extractEffortFromModelName` returns non-null:
- `mergedOptions` does NOT include `reasoning_effort` (model name is the sole effort signal)
- The baked effort IS logged in `llm_route_selected` telemetry (line ~552)

When it returns null:
- Current behavior preserved: `reasoning_effort: phaseThinkingEffort || 'medium'`

**Files:**

| File | Action | What Changes |
|------|--------|------|
| `src/core/llm/client/routing.js` | Modify | Add `extractEffortFromModelName()`, gate `reasoning_effort` in mergedOptions for primary/fallback/writer |
| `src/core/llm/client/tests/llmRouting.test.js` | Modify | Add tests for effort-suffix detection + mergedOptions gating |
| New: `src/core/llm/client/tests/extractEffortFromModelName.test.js` | Create | Unit tests for the parser: each suffix, non-effort suffixes, edge cases |

**Risk:** Low. Routing-only change. LLM Lab already handles suffix extraction as fallback, so removing the redundant `request_options` effort is safe. No behavioral change at the LLM Lab layer.

---

### Phase 2: Fix `thinking` Flags + UI Clarity (Spec Factory registry + GUI)

**Goal:** All suffixed OpenAI reasoning models should have `thinking: true`. The UI should make "locked effort preset" vs "selectable effort" obvious.

**Depends on:** Phase 1 (must land first — otherwise fixing `thinking: true` re-enables the double-send bug)

**Changes:**

**2A — Registry flags** (`src/shared/settingsRegistry.js`):
- Set `thinking: true` on all suffixed lab-openai models that actually perform reasoning:
  - `lab-oai-gpt54-xhigh` → `thinking: true` (currently `false`)
  - `lab-oai-gpt51-high` → `thinking: true` (currently `false`)
  - `lab-oai-gpt51-low` → `thinking: true` (currently `false`)
  - `lab-oai-gpt52-high` → `thinking: true` (currently `false`)
- Keep `lab-oai-gpt5-minimal` as `thinking: false` (minimal effort = effectively no reasoning)

**2B — UI locked-effort indicator** (GUI):
- In `LlmPhaseSection.tsx`: when the resolved model has a baked-in effort suffix, show the effort as a **read-only badge** (e.g., "Effort: xhigh (locked)") instead of the effort dropdown. The dropdown only appears for base models with `thinkingEffortOptions`.
- In `LlmGlobalSection.tsx`: same locked-effort badge pattern for global reasoning model.
- In `llmModelDropdownOptions.ts`: append effort level to label for suffixed models (e.g., `"gpt-5.4-xhigh"` → label shows `"gpt-5.4 · xhigh"` or similar visual distinction).

**2C — Phase override bridge** (`llmPhaseOverridesBridge.generated.ts`):
- Add a derived `effectiveThinkingEffort` field to `ResolvedPhaseModel` that returns either:
  - The baked-in effort from model name suffix (if present), OR
  - The manual `thinkingEffort` from config (current behavior)
- This gives the UI a single field to read for display.

**Contract:**
- `thinking: true` means "this model performs chain-of-thought reasoning"
- `thinking: false` means "this model does NOT perform reasoning"
- `thinking` flag must NEVER be used to control whether `reasoning_effort` is sent — Phase 1 handles that
- Suffixed models show locked effort badge; base models show effort dropdown

**Files:**

| File | Action | What Changes |
|------|--------|------|
| `src/shared/settingsRegistry.js` | Modify | Fix `thinking` flags on 4 suffixed models |
| `tools/gui-react/src/features/llm-config/sections/LlmPhaseSection.tsx` | Modify | Locked-effort badge for suffixed models |
| `tools/gui-react/src/features/llm-config/sections/LlmGlobalSection.tsx` | Modify | Same locked-effort pattern |
| `tools/gui-react/src/features/llm-config/state/llmPhaseOverridesBridge.generated.ts` | Modify | Add `effectiveThinkingEffort` derived field |
| `tools/gui-react/src/features/llm-config/state/llmModelDropdownOptions.ts` | Modify | Label decoration for suffixed models |
| `tools/gui-react/src/features/llm-config/types/llmProviderRegistryTypes.ts` | Possibly modify | Only if new type field needed for locked effort |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmDefaultProviderRegistry.test.ts` | Modify | Verify thinking flag changes |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmPhaseOverrideRegistry.test.ts` | Modify | Test effectiveThinkingEffort derivation |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.sortContracts.test.ts` | Modify | Verify label decoration doesn't break sort |

**Risk:** Low. Phase 1 already prevents double-send. These are display-only fixes.

---

### Phase 3: LLM Lab — New `/v1/model-registry` Endpoint

**Goal:** Expose the full `model_registry.json` content via API so Spec Factory can fetch instead of hardcoding.

**Scope:** LLM Lab repo (`C:\Users\Chris\Desktop\LLM Lab`)

**Changes:**

New endpoint: `GET /v1/model-registry`
- Returns the full provider section from `model_registry.json` for the current provider
- Includes ALL fields: `id`, `tier`, `efforts`, `maxContextTokens`, `maxOutputTokens`, cost fields, `capabilities`
- `?all=true` query param returns all providers (for multi-lab Spec Factory setup)
- CORS headers included (matching existing endpoints)

Response shape:
```json
{
  "provider": "openai",
  "name": "OpenAI",
  "capabilities": { "thinking": true, "web_search": true },
  "effort_levels": ["minimal", "low", "medium", "high", "xhigh"],
  "models": [
    {
      "id": "gpt-5.4-xhigh",
      "tier": 1,
      "maxContextTokens": 1050000,
      "maxOutputTokens": 128000,
      "efforts": [],
      "costInputPer1M": 2.5,
      "costOutputPer1M": 15.0,
      "costCachedPer1M": 1.25,
      "capabilities": { "chat": true, "extraction": true, "json_mode": true, "web_search": true }
    }
  ]
}
```

Key semantics:
- `efforts: []` → effort baked into model name (suffixed model, locked)
- `efforts: ["low", "medium", "high", "xhigh"]` → model accepts dynamic effort

**Files:**

| File | Action | What Changes |
|------|--------|------|
| `app/chatmock/routes_openai.py` | Modify | New `/v1/model-registry` route |
| `app/chatmock/provider.py` | Modify | New `full_registry_for_provider()` helper exposing all fields |
| `app/tests/test_provider_routes.py` | Modify | Tests for new endpoint: shape, provider filter, `?all=true`, corrupt registry |

**Risk:** Low. Read-only endpoint, no side effects. No changes to existing routes.

---

### Phase 4: Spec Factory — Fetch-at-Boot Registry Sync

**Goal:** On startup (and on-demand refresh), Spec Factory fetches model lists from LLM Lab and merges them into the provider registry. Adding a model to LLM Lab = immediately available in Spec Factory.

**Depends on:** Phase 3 (endpoint must exist)

**Changes:**

**4A — Sync module** (new `src/core/llm/labRegistrySync.js`):
- Fetch from each Lab base URL: `http://localhost:5001/v1/model-registry`, `:5002`, `:5003`
- Transform LLM Lab registry → Spec Factory `LlmProviderModel` shape:
  - `efforts.length > 0` → `thinkingEffortOptions: efforts`, `thinking: true`
  - `efforts.length === 0` AND model ID has effort suffix → `thinking: true`, no `thinkingEffortOptions`
  - `efforts.length === 0` AND model ID ends in `-minimal` → `thinking: false`
  - `capabilities.web_search` → `webSearch: true`
  - `tier` → display ordering
  - All cost fields mapped 1:1
- Generate unique `id` for each model (e.g., `lab-oai-{normalized_model_id}`)
- Wrap in `LlmProviderEntry` with `accessMode: 'lab'`

**4B — Boot integration**:
- On server start, attempt sync. On failure, log warning and use hardcoded defaults.
- Store synced registry in config so `collectLlmModels()` and routing pick it up.
- `collectLlmModels()` in `llmRouteHelpers.js` must include synced models.

**4C — Frontend integration**:
- `LlmConfigPage.tsx` — on mount, fetch synced registry from backend (or use existing config hydration path)
- `llmProviderRegistryBridge.ts` — merge synced lab providers into registry (synced wins over hardcoded for lab providers)
- Frontend model dropdowns automatically pick up new models via existing `buildModelDropdownOptions()` pipeline

**4D — Metrics surface**:
- `configIndexingMetricsHandler.js` — `GET /indexing/llm-config` should reflect synced models in `model_options` and `model_pricing`

**Contract:**
- Adding a model to LLM Lab's `model_registry.json` → available in Spec Factory after restart
- No Spec Factory code changes required for new models
- Hardcoded defaults remain as offline fallback
- `thinking` and `thinkingEffortOptions` derived from registry `efforts` array — never manually set for lab models

**Files:**

| File | Action | What Changes |
|------|--------|------|
| New: `src/core/llm/labRegistrySync.js` | Create | Fetch + transform logic |
| New: `src/core/llm/tests/labRegistrySync.test.js` | Create | Unit tests for transform, fallback, edge cases |
| `src/core/llm/llmRouteHelpers.js` | Modify | `collectLlmModels()` includes synced models |
| `src/features/settings/api/configIndexingMetricsHandler.js` | Modify | Reflect synced models in read surface |
| `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | Modify | Bootstrap from synced registry |
| `tools/gui-react/src/features/llm-config/state/llmProviderRegistryBridge.ts` | Modify | Merge synced lab providers |
| `src/core/config/tests/llmConfigReadSurface.test.js` | Modify | Verify synced models appear in read surfaces |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmDefaultProviderRegistry.test.ts` | Modify | Test merge behavior with synced providers |

**Risk:** Medium. Touches boot path and config hydration. Needs careful fallback handling and timeout on fetch.

---

### Phase 5: Remove Hardcoded Lab Models from settingsRegistry.js

**Goal:** Once Phase 4 is proven stable, delete the manually maintained `lab-openai`, `lab-gemini`, `lab-claude` entries from `DEFAULT_LLM_PROVIDER_REGISTRY_JSON`.

**Depends on:** Phase 4 (must be stable for at least one full work cycle)

**Changes:**
- Remove all `lab-*` provider blocks from `DEFAULT_LLM_PROVIDER_REGISTRY_JSON` in `settingsRegistry.js`
- Keep public API providers (Gemini, DeepSeek, Anthropic, OpenAI) as hardcoded defaults
- Lab providers are now 100% dynamic from fetch
- Update `llmDefaultProviderRegistry.test.ts` — lab providers no longer in defaults

**Contract:**
- Lab models only appear if Lab is reachable
- Public API models always appear (hardcoded)
- Zero manual maintenance for lab models going forward

**Files:**

| File | Action | What Changes |
|------|--------|------|
| `src/shared/settingsRegistry.js` | Modify | Remove `lab-openai`, `lab-gemini`, `lab-claude` blocks from JSON constant |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmDefaultProviderRegistry.test.ts` | Modify | Update: lab providers no longer in hardcoded defaults |

**Risk:** Medium. If Lab fetch fails silently, users lose lab models. Phase 4's fallback and error messaging must be solid first.

---

## Phase Dependency Graph

```
Phase 1 (Fix effort routing — routing.js)
    ↓
Phase 2 (Fix thinking flags + UI clarity)    Phase 3 (LLM Lab /v1/model-registry endpoint)
                                                  ↓
                                             Phase 4 (Fetch-at-boot sync)
                                                  ↓
                                             Phase 5 (Remove hardcoded lab models)
```

- Phase 1 is the prerequisite for Phase 2 (prevents double-send before fixing thinking flags)
- Phases 2 and 3 can run in parallel after Phase 1
- Phase 4 requires Phase 3
- Phase 5 requires Phase 4 to be proven stable

---

## Complete File Inventory

### Spec Factory — Must Touch

| File | Phases | Role |
|------|--------|------|
| `src/core/llm/client/routing.js` | 1 | Add effort suffix detection, gate reasoning_effort in mergedOptions |
| `src/shared/settingsRegistry.js` | 2, 5 | Fix thinking flags (P2), remove lab blocks (P5) |
| `tools/gui-react/src/features/llm-config/sections/LlmPhaseSection.tsx` | 2 | Locked-effort badge for suffixed models |
| `tools/gui-react/src/features/llm-config/sections/LlmGlobalSection.tsx` | 2 | Same locked-effort badge |
| `tools/gui-react/src/features/llm-config/state/llmPhaseOverridesBridge.generated.ts` | 2 | Derived `effectiveThinkingEffort` |
| `tools/gui-react/src/features/llm-config/state/llmModelDropdownOptions.ts` | 2 | Label decoration for suffixed models |
| `tools/gui-react/src/features/llm-config/types/llmProviderRegistryTypes.ts` | 2 | Possibly: locked effort type |
| `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | 4 | Bootstrap from synced registry |
| `tools/gui-react/src/features/llm-config/state/llmProviderRegistryBridge.ts` | 4 | Merge synced lab providers |
| `src/core/llm/llmRouteHelpers.js` | 4 | `collectLlmModels()` includes synced models |
| `src/features/settings/api/configIndexingMetricsHandler.js` | 4 | Reflect synced models |

### Spec Factory — New Files

| File | Phase |
|------|-------|
| `src/core/llm/client/tests/extractEffortFromModelName.test.js` | 1 |
| `src/core/llm/labRegistrySync.js` | 4 |
| `src/core/llm/tests/labRegistrySync.test.js` | 4 |

### Spec Factory — Tests to Modify

| File | Phases |
|------|--------|
| `src/core/llm/client/tests/llmRouting.test.js` | 1 |
| `src/core/config/tests/llmConfigReadSurface.test.js` | 4 |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmDefaultProviderRegistry.test.ts` | 2, 4, 5 |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmPhaseOverrideRegistry.test.ts` | 2 |
| `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.sortContracts.test.ts` | 2 |

### LLM Lab — Must Touch

| File | Phase |
|------|-------|
| `app/chatmock/routes_openai.py` | 3 |
| `app/chatmock/provider.py` | 3 |
| `app/tests/test_provider_routes.py` | 3 |

### LLM Lab — Do NOT Touch

| File | Why |
|------|-----|
| `app/chatmock/reasoning.py` | Effort extraction + build logic already correct |
| `app/chatmock/upstream.py` | Model normalization already correct |
| `app/models/model_registry.json` | Already the SSOT; no schema changes needed |

### Spec Factory — Do NOT Touch (for this fix)

| File | Why |
|------|-----|
| `tools/dist/launcher.cjs` | Only if/when checked-in bundle is rebuilt after Phase 2 GUI changes |

---

## Current State Reference

| What | Where |
|------|-------|
| LLM Lab model registry (SSOT) | `C:\Users\Chris\Desktop\LLM Lab\app\models\model_registry.json` |
| Spec Factory baked registry | `src/shared/settingsRegistry.js` line 9 (`DEFAULT_LLM_PROVIDER_REGISTRY_JSON`) |
| Effort routing (primary) | `src/core/llm/client/routing.js` lines 510-518 |
| Effort routing (fallback) | `src/core/llm/client/routing.js` lines 623-631 |
| Effort routing (writer) | `src/core/llm/client/routing.js` lines 704-710 |
| LLM Lab effort resolution | `app/chatmock/routes_openai.py` lines 601-611 |
| LLM Lab effort extraction | `app/chatmock/reasoning.py` lines 101-127 |
| Phase override bridge | `tools/gui-react/.../llmPhaseOverridesBridge.generated.ts` |
| Model dropdown builder | `tools/gui-react/.../llmModelDropdownOptions.ts` |
| Provider registry bridge | `tools/gui-react/.../llmProviderRegistryBridge.ts` |
| Model collection for read surfaces | `src/core/llm/llmRouteHelpers.js` (`collectLlmModels()`) |
| Config metrics handler | `src/features/settings/api/configIndexingMetricsHandler.js` |
