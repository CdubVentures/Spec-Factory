# LLM Lab ↔ Spec Factory: Model Registry Sync & Effort Routing Roadmap

**Created:** 2026-04-10
**Status:** Planning
**Scope:** Fix effort double-application, unify model registry SSOT, eliminate manual duplication

---

## Problem Statement

Three interrelated issues cause confusion and maintenance burden when using OpenAI models through LLM Lab:

1. **Double effort application** — Suffixed models (e.g., `gpt-5.4-xhigh`) encode effort in the model name, but Spec Factory also sends `reasoning_effort` in `request_options`. LLM Lab resolves this (model suffix wins), but the UI displays misleading effort state.

2. **Inconsistent `thinking` flags** — Suffixed models have random `thinking: true/false` values as a workaround to control whether `reasoning_effort` gets sent. Users see "thinking: off" for models that actually think.

3. **Manual O(N) duplication** — Models are hardcoded in both `model_registry.json` (LLM Lab) and `settingsRegistry.js` (Spec Factory). Adding a model requires updating both repos manually.

---

## Phased Roadmap

### Phase 1: Fix Effort Routing (Spec Factory only)

**Goal:** When a suffixed model is selected, auto-detect the baked-in effort and don't double-send it.

**Scope:** `src/core/llm/client/routing.js`

**Changes:**
- Add a helper `extractEffortFromModelName(modelId)` that parses known suffixes (`-xhigh`, `-high`, `-medium`, `-low`, `-minimal`) and returns the effort level or `null`.
- In `callLlmWithRouting()` (line ~514-518): if the model name has a baked-in effort, use that as the effective effort and **skip** sending `reasoning_effort` in `request_options`.
- If the model name has NO suffix (base model like `gpt-5.4`), keep current behavior — send `reasoning_effort` from config.

**Contract:**
- Input: model ID string (e.g., `"gpt-5.4-xhigh"` or `"gpt-5.4"`)
- Output for suffixed: `{ bakedEffort: "xhigh", skipRequestOption: true }`
- Output for base: `{ bakedEffort: null, skipRequestOption: false }`
- No change to LLM Lab. No change to model registry format.

**Tests:**
- `extractEffortFromModelName` unit tests: each suffix, base model, edge cases (e.g., `gpt-5.4-mini` should NOT match as effort)
- Integration: verify `callLlmWithRouting` omits `reasoning_effort` from `mergedOptions` when model has suffix
- Integration: verify `callLlmWithRouting` includes `reasoning_effort` for base models

**Risk:** Low. Routing-only change. LLM Lab already handles the suffix extraction as a fallback, so removing the redundant `request_options` effort is safe.

---

### Phase 2: Fix `thinking` Flags on Suffixed Models (Spec Factory registry)

**Goal:** All suffixed OpenAI reasoning models should have `thinking: true`. The `thinking` flag should reflect actual model capability, not be used as an effort-routing hack.

**Scope:** `src/shared/settingsRegistry.js` (the `DEFAULT_LLM_PROVIDER_REGISTRY_JSON` constant)

**Depends on:** Phase 1 (must land first, otherwise fixing `thinking: true` re-enables the double-send bug)

**Changes:**
- Set `thinking: true` on all suffixed lab-openai models that actually perform reasoning:
  - `lab-oai-gpt54-xhigh` → `thinking: true` (currently `false`)
  - `lab-oai-gpt51-high` → `thinking: true` (currently `false`)
  - `lab-oai-gpt51-low` → `thinking: true` (currently `false`)
  - `lab-oai-gpt52-high` → `thinking: true` (currently `false`)
- Keep `lab-oai-gpt5-minimal` as `thinking: false` (minimal effort = effectively no reasoning)

**Contract:**
- `thinking: true` means "this model performs chain-of-thought reasoning"
- `thinking: false` means "this model does NOT perform reasoning"
- `thinking` flag must NEVER be used to control whether `reasoning_effort` is sent — that's Phase 1's job

**Tests:**
- Characterization: snapshot current registry, verify only the intended flags changed
- Verify UI shows thinking indicator correctly for suffixed models

**Risk:** Low. Phase 1 already prevents double-send, so flipping `thinking: true` just fixes the UI display.

---

### Phase 3: LLM Lab — New `/v1/model-registry` Endpoint

**Goal:** Expose the full `model_registry.json` content via API so Spec Factory can fetch at boot instead of hardcoding.

**Scope:** LLM Lab repo (`C:\Users\Chris\Desktop\LLM Lab`)
- `app/chatmock/routes_openai.py` (new route)
- `app/chatmock/provider.py` (new helper)

**Changes:**
- New endpoint: `GET /v1/model-registry`
- Returns the full provider section from `model_registry.json` for the current provider:
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
        "capabilities": { ... }
      }
    ]
  }
  ```
- Also expose a combined variant: `GET /v1/model-registry?all=true` that returns all providers (for multi-lab setups)

**Contract:**
- Response shape mirrors `model_registry.json` structure exactly
- `efforts: []` = effort baked into model name (suffixed model)
- `efforts: ["low", "medium", "high", "xhigh"]` = model accepts dynamic effort
- CORS headers included (same as existing endpoints)

**Tests:**
- Unit: endpoint returns correct shape
- Unit: respects provider filtering
- Unit: handles missing/corrupt registry gracefully

**Risk:** Low. Read-only endpoint, no side effects.

---

### Phase 4: Spec Factory — Fetch-at-Boot Registry Sync

**Goal:** On startup (and on-demand refresh), Spec Factory fetches model lists from LLM Lab instances and merges them into the provider registry automatically.

**Scope:**
- New: `src/core/llm/labRegistrySync.js` — fetch + transform logic
- Modified: `src/core/llm/client/routing.js` or `src/core/config/` — integrate synced models
- Modified: `tools/gui-react/src/features/llm-config/` — show synced models in dropdowns

**Depends on:** Phase 3 (endpoint must exist)

**Changes:**
- On boot, attempt `GET http://localhost:5001/v1/model-registry` (OpenAI lab), `GET http://localhost:5002/v1/model-registry` (Gemini lab), `GET http://localhost:5003/v1/model-registry` (Claude lab)
- Transform LLM Lab registry format → Spec Factory provider model format:
  ```
  LLM Lab: { id, tier, efforts, maxContextTokens, maxOutputTokens, cost*, capabilities }
  ↓ transforms to ↓
  Spec Factory: { id, modelId, role, accessMode, costInputPer1M, ..., thinking, webSearch, thinkingEffortOptions }
  ```
- Mapping rules:
  - `efforts.length > 0` → `thinkingEffortOptions: efforts`, `thinking: true`
  - `efforts.length === 0` AND model ID has effort suffix → `thinking: true`, no `thinkingEffortOptions`
  - `efforts.length === 0` AND model ID ends in `-minimal` → `thinking: false`
  - `capabilities.web_search` → `webSearch: true`
  - `tier` → used for display ordering
  - `role`: if model ID contains `-xhigh` or is tagged as reasoning → `"reasoning"`, else `"primary"`
- Merge synced models with the hardcoded defaults (synced wins for lab providers)
- If LLM Lab is unreachable, fall back to hardcoded defaults (current behavior)

**Contract:**
- Adding a model to LLM Lab's `model_registry.json` makes it immediately available in Spec Factory after restart (or manual refresh)
- No Spec Factory code changes required to add a new model
- Hardcoded defaults remain as offline fallback
- `thinking` and `thinkingEffortOptions` are derived from the registry `efforts` array — never manually set for lab models

**Tests:**
- Unit: transform function maps each field correctly
- Unit: effort suffix detection works for all known patterns
- Unit: graceful fallback when Lab is unreachable
- Integration: E2E with running Lab instance

**Risk:** Medium. Touches boot path and config hydration. Needs careful fallback handling.

---

### Phase 5: Remove Hardcoded Lab Models from settingsRegistry.js

**Goal:** Once Phase 4 is stable and proven, delete the manually maintained `lab-openai`, `lab-gemini`, `lab-claude` entries from `DEFAULT_LLM_PROVIDER_REGISTRY_JSON`.

**Depends on:** Phase 4 (must be stable for at least one full work cycle)

**Scope:** `src/shared/settingsRegistry.js`

**Changes:**
- Remove all `lab-*` provider blocks from `DEFAULT_LLM_PROVIDER_REGISTRY_JSON`
- Keep public API providers (Gemini, DeepSeek, Anthropic, OpenAI) as hardcoded defaults
- Lab providers are now 100% dynamic from fetch

**Contract:**
- Lab models only appear if Lab is reachable
- Public API models always appear (hardcoded)
- Zero manual maintenance for lab models going forward

**Risk:** Medium. If Lab fetch fails silently, users lose lab models. Phase 4's fallback logic must be solid first.

---

## Phase Dependency Graph

```
Phase 1 (Fix effort routing)
    ↓
Phase 2 (Fix thinking flags)    Phase 3 (LLM Lab endpoint)
                                     ↓
                                Phase 4 (Fetch-at-boot sync)
                                     ↓
                                Phase 5 (Remove hardcoded lab models)
```

Phases 2 and 3 can run in parallel after Phase 1.
Phase 4 requires Phase 3.
Phase 5 requires Phase 4 to be proven stable.

---

## Files Affected (by phase)

| Phase | Repo | Files |
|-------|------|-------|
| 1 | Spec Factory | `src/core/llm/client/routing.js`, new test file |
| 2 | Spec Factory | `src/shared/settingsRegistry.js` |
| 3 | LLM Lab | `app/chatmock/routes_openai.py`, `app/chatmock/provider.py` |
| 4 | Spec Factory | new `src/core/llm/labRegistrySync.js`, config integration, GUI updates |
| 5 | Spec Factory | `src/shared/settingsRegistry.js` |

---

## Current State Reference

**LLM Lab registry path:** `C:\Users\Chris\Desktop\LLM Lab\app\models\model_registry.json`
**Spec Factory registry:** `C:\Users\Chris\Desktop\Spec Factory\src\shared\settingsRegistry.js` line 9
**Effort routing:** `C:\Users\Chris\Desktop\Spec Factory\src\core\llm\client\routing.js` lines 510-518
**LLM Lab effort resolution:** `C:\Users\Chris\Desktop\LLM Lab\app\chatmock\routes_openai.py` lines 601-611
**LLM Lab effort extraction:** `C:\Users\Chris\Desktop\LLM Lab\app\chatmock\reasoning.py` lines 101-127
