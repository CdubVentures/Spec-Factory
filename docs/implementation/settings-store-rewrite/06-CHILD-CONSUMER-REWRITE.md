# Plan 06: Child Process Consumer Rewrite — Snapshot-First Config

## Goal
Make the child process consume the runtime snapshot directly. Consolidate phase resolution to one point. Verify all downstream pipeline consumers receive correct config.

## Depends On
Plan 05 (snapshot transport)

## Blocks
Plan 07 (GUI integration)

---

## Files to Modify

### 1. `src/config.js` (35 LOC → ~50 LOC)

```javascript
// BEFORE
export function loadConfigWithUserSettings(overrides = {}) {
  const config = _loadConfig(overrides);
  const helperRoot = String(config.categoryAuthorityRoot || config['helperFilesRoot'] || '...');
  try {
    const userSettings = loadUserSettingsSync({ categoryAuthorityRoot: helperRoot });
    applyRuntimeSettingsToConfig(config, userSettings.runtime);
    applyConvergenceSettingsToConfig(config, userSettings.convergence);
  } catch { /* best-effort */ }
  return config;
}

// AFTER
export function loadConfigWithUserSettings(overrides = {}) {
  const snapshotPath = resolveSnapshotPath();
  if (snapshotPath) {
    return loadConfigFromSnapshot(snapshotPath, overrides);
  }
  // Fallback: CLI usage without snapshot
  const config = _loadConfig(overrides);
  const helperRoot = String(config.categoryAuthorityRoot || 'category_authority');
  try {
    const userSettings = loadUserSettingsSync({ categoryAuthorityRoot: helperRoot });
    applyRuntimeSettingsToConfig(config, userSettings.runtime);
    applyConvergenceSettingsToConfig(config, userSettings.convergence);
  } catch { /* best-effort */ }
  return config;
}
```

### 2. `src/core/config/configBuilder.js` (~511 LOC)

Add new function:

```javascript
/**
 * Build config from a runtime settings snapshot.
 * Reads system-level env vars (AWS creds, etc.) then overlays snapshot values.
 */
export function buildConfigFromSnapshot(snapshot, manifestApplicator) {
  // 1. Build minimal base config (env-only system settings)
  const { cfg: baseConfig, explicitEnvKeys } = buildRawConfig({ manifestApplicator });

  // 2. Overlay snapshot settings using registry configKey mapping
  const configKeyMap = deriveConfigKeyMap(RUNTIME_SETTINGS_REGISTRY);
  for (const [settingKey, value] of Object.entries(snapshot.settings || {})) {
    const configKey = configKeyMap[settingKey] || settingKey;
    if (value !== undefined && value !== null) {
      baseConfig[configKey] = value;
    }
  }

  // 3. Apply post-merge normalization (clamping, fallbacks, phase resolution)
  return applyPostMergeNormalization(baseConfig, {}, explicitEnvKeys);
}
```

### 3. `src/core/config/configPostMerge.js` (~232 LOC)

Consolidate phase override resolution:
- Currently: phases resolved in configPostMerge AND re-resolved in applyRuntimeSettingsToConfig
- After: phases resolved ONCE in configPostMerge, AFTER all settings are merged
- When snapshot is present, user settings are already included in the snapshot, so re-resolution is not needed

### 4. `src/cli/spec.js`

Verify the CLI entry point calls `loadConfigWithUserSettings()` which will now auto-detect snapshot path.

### 5. New: `src/core/config/resolveEffectiveRuntimeConfig.js`

```javascript
import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveRoundOverridableSet } from '../../shared/settingsRegistryDerivations.js';

const ROUND_OVERRIDABLE = deriveRoundOverridableSet(RUNTIME_SETTINGS_REGISTRY);

/**
 * Single resolver for effective runtime config.
 * Merges: base config + snapshot + round overrides.
 * Returns effective config + audit trail.
 */
export function resolveEffectiveRuntimeConfig({ baseConfig, snapshot = null, roundContext = null }) {
  const effective = { ...baseConfig };
  const patches = [];

  // Layer 1: Apply snapshot values
  if (snapshot?.settings) {
    for (const [key, value] of Object.entries(snapshot.settings)) {
      if (value !== undefined && effective[key] !== value) {
        patches.push({
          key, originalValue: effective[key], effectiveValue: value,
          source: 'snapshot', reason: 'GUI editor value',
        });
        effective[key] = value;
      }
    }
  }

  // Layer 2: Apply round overrides (if context provided)
  if (roundContext) {
    const roundPatches = applyRoundOverrides(effective, roundContext);
    patches.push(...roundPatches);
  }

  return { effective, patches };
}
```

---

## Pipeline Consumer Verification

These files read config at runtime. Verify they continue to work with snapshot-derived config:

| File | Settings Read | Verification |
|------|--------------|-------------|
| `src/features/indexing/orchestration/bootstrap/runFetchSchedulerDrain.js` | fetchScheduler*, perHostMinDelayMs | Config object shape unchanged |
| `src/features/indexing/search/searchProviders.js` | searchEngines, searxngBaseUrl | Config object shape unchanged |
| `src/features/indexing/search/searchGoogle.js` | googleSearch* | Config object shape unchanged |
| `src/pipeline/seams/initializeIndexingResume.js` | indexingResumeMode, indexingResumeMaxAgeHours | Config object shape unchanged |
| `src/core/llm/client/routing.js` | llmProvider, llmModelPlan, _registryLookup | Config object shape unchanged |
| `src/research/serpReranker.js` | serpRerankerWeightMap | Config object shape unchanged |
| `src/features/indexing/discovery/serpSelectorLlmAdapter.js` | llm* config | Config object shape unchanged |
| `src/features/indexing/validation/validateCandidatesLLM.js` | llm* config | Config object shape unchanged |
| `src/features/indexing/validation/validateEnumConsistency.js` | enum config | Config object shape unchanged |
| `src/features/indexing/discovery/discoveryResultProcessor.js` | discovery* config | Config object shape unchanged |
| `src/features/indexing/orchestration/finalize/buildRunSummaryOperationsSection.js` | Reports effective config | Should report snapshot values |
| `src/features/settings/api/configIndexingMetricsHandler.js` | Metrics from config | Should use snapshot values |

**Key invariant**: The config object shape MUST NOT change. All consumers read `config.someKey` — the object is the same, only the source of values changes.

---

## Test File to Create

### `test/contracts/configFromSnapshotContract.test.js`

```
Test Group A: Snapshot Config Equivalence
- A1: Config from snapshot matches config from equivalent env vars + user-settings.json (for all 209 keys)
- A2: Snapshot values override base config for all registry keys
- A3: Missing snapshot key falls back to registry default

Test Group B: Phase Resolution
- B1: Phase overrides resolve correctly from snapshot (resolved ONCE)
- B2: _resolvedNeedsetBaseModel matches snapshot llmModelPlan
- B3: _resolvedExtractionUseReasoning matches snapshot llmPlanUseReasoning

Test Group C: Clamping
- C1: Integer values in snapshot still clamped to registry ranges
- C2: Float values in snapshot still clamped
- C3: Out-of-range values are clamped, not rejected

Test Group D: Backward Compatibility
- D1: Without RUNTIME_SETTINGS_SNAPSHOT env var, falls back to loadConfig + userSettings
- D2: CLI mode (no snapshot) still works
- D3: Invalid snapshot path produces clear error, not crash
```

---

## Execution Steps

1. Create `src/core/config/resolveEffectiveRuntimeConfig.js`
2. Modify `src/config.js` to detect and use snapshot
3. Add `buildConfigFromSnapshot()` to configBuilder.js
4. Consolidate phase resolution in configPostMerge.js
5. Write config-from-snapshot contract tests
6. Verify all 12 pipeline consumers still work (read config, run existing tests)
7. Run full test suite

## Estimated Effort
~4-5 hours. The consumer verification is mostly read-only checking.

## Rollback
Revert config.js and configBuilder.js. The snapshot detection is opt-in (env var present), so removing it restores old behavior.
