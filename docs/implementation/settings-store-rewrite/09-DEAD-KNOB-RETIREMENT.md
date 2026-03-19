# Plan 09: Dead Knob Retirement & Alias Cleanup

## Goal
Remove confirmed dead settings, retire legacy aliases, clean up dual-key confusion.

## Depends On
Plan 02 (characterization tests prove current behavior captured)

## Blocks
Plan 10 (drift prevention)

---

## Dead Knobs to Remove

### 1. `fetchSchedulerFallbackWaitMs`

**Evidence**: Grepped entire codebase. Only appears in:
- `src/shared/settingsRegistry.js` (definition)
- `src/core/config/configBuilder.js` (env parsing: FETCH_SCHEDULER_FALLBACK_WAIT_MS)
- `tools/gui-react/` (UI knob display + payload builders)

**NOT consumed by**: The actual fetch scheduler uses `fetchSchedulerRetryWaitMs` from `fetchSchedulerInternalsMap` (which is a parsed JSON map, not this individual key).

**Files to modify**:
- `src/shared/settingsRegistry.js` — remove entry (or mark deprecated: true if doing Plan 03 first)
- `src/core/config/configBuilder.js` — remove FETCH_SCHEDULER_FALLBACK_WAIT_MS parsing
- `tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowFetchNetworkSection.tsx` — remove UI control
- `tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalizer.ts` — remove normalization
- `tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftPayload.ts` — remove from payload
- `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts` — remove from serializer

### 2. `runtimeTraceLlmRing`

**Evidence**: Grepped entire codebase. Appears in:
- `src/shared/settingsRegistry.js` (definition)
- `src/core/config/configBuilder.js` (env parsing: RUNTIME_TRACE_LLM_RING)
- `src/features/indexing/api/builders/processStartLaunchPlan.js` (launched as env var)
- `tools/gui-react/` (UI knob display + payload builders)

**NOT consumed by**: No trace writer reads this setting. Trace ring buffer sizes are not configurable at runtime.

**Files to modify**: Same pattern as fetchSchedulerFallbackWaitMs:
- Registry, configBuilder, launch plan, GUI normalizer/payload/UI

### 3. `helperFilesRoot` (Legacy Alias)

**Evidence**: `categoryAuthorityRoot` is the canonical key. `helperFilesRoot` exists only for backward compat:
- `src/config.js` line 26: `config['helper' + 'FilesRoot']` (obfuscated access)
- `src/features/settings-authority/userSettingsService.js`: `LEGACY_HELPER_ROOT_ALIAS_KEY`
- `src/features/indexing/api/builders/processStartLaunchPlan.js`: destructures `helperFilesRoot`
- `tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalizer.ts` lines 626-635: mirrors both

**Files to modify**:
- `src/shared/settingsRegistry.js` — remove entry
- `src/config.js` — remove helperFilesRoot fallback
- `src/core/config/configBuilder.js` — remove HELPER_FILES_ROOT env parsing (keep CATEGORY_AUTHORITY_ROOT)
- `src/features/settings-authority/userSettingsService.js` — remove LEGACY_HELPER_ROOT_ALIAS_KEY, simplify resolveSettingsAuthorityRoot
- `src/features/indexing/api/builders/processStartLaunchPlan.js` — remove helperFilesRoot destructuring
- `tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalizer.ts` — remove mirroring logic
- `tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowAutomationSection.tsx` — remove helperFilesRoot control

---

## Additional Alias Cleanup

### GUI Legacy Name Mappings to Remove
In `RuntimeFlowDraftNormalizer.ts`:
- `searchProvider` → `searchEngines` (line ~77)
- `phase2LlmModel` → `llmModelPlan` (line ~81)
- `indexingHelperFilesEnabled` → `indexingCategoryAuthorityEnabled` (line ~667)

These legacy fallbacks should be removed. If user-settings.json has the old key, migration should handle it once, not forever at runtime.

---

## Test File to Create

### `test/contracts/deadKnobRetirement.test.js`

```
Test Group A: Registry Cleanliness
- A1: RUNTIME_SETTINGS_REGISTRY does not contain key 'fetchSchedulerFallbackWaitMs'
- A2: RUNTIME_SETTINGS_REGISTRY does not contain key 'runtimeTraceLlmRing'
- A3: RUNTIME_SETTINGS_REGISTRY does not contain key 'helperFilesRoot'

Test Group B: Config Cleanliness
- B1: loadConfig() result does not have key 'fetchSchedulerFallbackWaitMs'
- B2: loadConfig() result does not have key 'runtimeTraceLlmRing'
- B3: loadConfig() result does not have key 'helperFilesRoot'

Test Group C: Backward Compat
- C1: user-settings.json with fetchSchedulerFallbackWaitMs is loaded without crash (key ignored)
- C2: user-settings.json with runtimeTraceLlmRing is loaded without crash (key ignored)
- C3: user-settings.json with helperFilesRoot is loaded without crash (key ignored)
- C4: HELPER_FILES_ROOT env var is ignored (CATEGORY_AUTHORITY_ROOT used instead)

Test Group D: No Regressions
- D1: Fetch scheduler still works (uses fetchSchedulerInternalsMap)
- D2: Runtime trace still works (uses runtimeTraceFetchRing, not LlmRing)
- D3: Category authority root still resolves correctly
```

---

## Execution Steps

1. Verify characterization tests are green (Plan 02)
2. Remove fetchSchedulerFallbackWaitMs from registry + all consumers
3. Run tests — confirm green
4. Remove runtimeTraceLlmRing from registry + all consumers
5. Run tests — confirm green
6. Remove helperFilesRoot from registry + all consumers
7. Run tests — confirm green
8. Remove GUI legacy name mappings
9. Run full test suite
10. Write dead knob retirement tests

## Estimated Effort
~3 hours. Mostly mechanical deletion.

## Rollback
Re-add entries to registry. Each knob removal is independent — can revert one without affecting others.
