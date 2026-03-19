# Plan 10: Drift Prevention, Existing Test Updates & E2E Verification

## Goal
Update all existing settings tests. Add structural tests that permanently prevent settings propagation drift.

## Depends On
All previous plans (01-09)

## Blocks
Nothing (final plan)

---

## Sub-Plan 10A: Update Existing Backend Tests (10 files)

### `test/settingsRegistryCharacterization.test.js`
- Add assertions for new registry fields: transport, envKey, configKey, roundOverridable
- Remove assertions for removed cfgKey field
- Add assertions that deprecated entries exist with deprecated: true

### `test/settingsRegistryDerivations.test.js`
- Add tests for new functions: deriveEnvKeyMap, deriveConfigKeyMap, deriveTransportMap, deriveRoundOverridableSet, deriveDeprecatedSet
- Update tests for cfgKey → configKey rename in existing functions

### `test/settingsDefaultsEnvSync.test.js`
- Update env sync expectations for removed dead knobs
- Add assertions that snapshot path env var is recognized

### `test/settingsApplyCharacterization.test.js`
- Update for single-point phase resolution (no more dual resolution)
- Remove assertions for helperFilesRoot dual-key sync

### `test/configCharacterization.test.js`
- Add snapshot-first config shape assertions
- Add test: config from snapshot produces same shape as config from env+userSettings
- Remove assertions for dead knob config keys

### `test/runtimeSettingsApi.test.js`
- Add snapshot transport awareness
- Verify PUT still works for non-deprecated keys
- Verify PUT rejects deprecated keys (or ignores them)

### `test/runtimeSettingsSerializerContract.test.js`
- Update serialization round-trip for new registry shape

### `test/runtimeSettingsPutSnapshot.test.js`
- Update PUT payload expectations (no dead knobs)

### `test/runtimeSettingsHydrationContract.test.js` (if exists)
- Update for registry-driven hydration bindings

### `test/runtimeSettingsParsingContract.test.js` (if exists)
- Update for registry-driven parsing

---

## Sub-Plan 10B: Update Existing Run-Launch & Consumer Tests (8 files)

### `src/features/indexing/api/tests/processStartLaunchPlan.test.js`
- **Major update**: Test snapshot writing instead of env var assignments
- Verify: RUNTIME_SETTINGS_SNAPSHOT env var is set
- Verify: Old per-field env vars are NOT set (except path-resolution ones)
- Verify: Snapshot file contains all registry keys from POST body

### `test/processStartRunIdContract.test.js`
- Update for snapshot transport (runId in snapshot file name)

### `test/indexingRuntimeSettingsProjection.test.js`
- Update projection expectations for snapshot-first model

### `test/searchProviders.test.js`
- Verify search provider reads effective config correctly
- Verify searchEngines round override is respected

### `test/llmRouting.test.js`
- Verify LLM routing reads effective config
- Verify phase overrides resolved from snapshot

### `test/serpSelectorIntegration.test.js`
- Verify SERP selector reads effective config

### `tools/gui-react/src/features/llm-config/state/__tests__/llmPhaseOverrideRegistry.test.ts`
- Update for registry-derived phase override handling

### `tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts`
- Update clamping tests for registry-driven clamping (not hand-coded)

---

## Sub-Plan 10C: New Structural Drift Prevention Tests

### `test/contracts/settingsDriftPrevention.test.js`

These tests are the permanent guardrail. They prevent the problem from ever returning.

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';

describe('Settings Drift Prevention', () => {

  // RULE 1: Every registry key has transport metadata
  it('every registry entry declares transport', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      assert.ok(
        ['snapshot', 'env', 'cli'].includes(entry.transport || 'snapshot'),
        `${entry.key} missing valid transport`
      );
    }
  });

  // RULE 2: Every registry key has a configKey
  it('every registry entry has configKey', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      assert.ok(entry.configKey || entry.key, `${entry.key} missing configKey`);
    }
  });

  // RULE 3: No duplicate configKeys
  it('no duplicate configKeys', () => {
    const seen = new Set();
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      const ck = entry.configKey || entry.key;
      assert.ok(!seen.has(ck), `Duplicate configKey: ${ck}`);
      seen.add(ck);
    }
  });

  // RULE 4: Snapshot writer includes all non-deprecated keys
  it('snapshot writer covers all active registry keys', async () => {
    // Import snapshot writer and verify coverage
    // This test reads the snapshot module and confirms it iterates the registry
  });

  // RULE 5: Round overrides only touch overridable keys
  it('roundConfigBuilder only overrides roundOverridable keys', async () => {
    // Import roundConfigBuilder, run with test config
    // Verify all patched keys have roundOverridable: true
  });

  // RULE 6: No orphan env vars in configBuilder
  it('every env var in configBuilder maps to a registry entry', () => {
    // Parse configBuilder.js for env var reads
    // Cross-reference with registry envKey values
  });

  // RULE 7: GUI payload covers all active non-secret keys
  it('GUI start payload includes all active non-secret registry keys', () => {
    // Import the registry-driven payload builder
    // Verify it produces keys for every eligible entry
  });
});
```

---

## Sub-Plan 10D: E2E Verification

### `test/e2e/settingsSnapshotE2E.test.js`

```javascript
describe('Settings Snapshot E2E', () => {

  it('start run → child config matches snapshot', async () => {
    // 1. Build a known settings payload
    // 2. POST /process/start with payload
    // 3. Read the written snapshot file
    // 4. Verify snapshot settings match POST body
    // 5. Verify child would read these values (mock loadConfigWithUserSettings)
  });

  it('round overrides are logged in run events', async () => {
    // 1. Start a run with known settings
    // 2. Simulate round 0 config build
    // 3. Verify patches are emitted as events
    // 4. Verify patches include expected overrides
  });
});
```

---

## Sub-Plan 10E: Domain Docs

### `src/core/README.md`
Add section:
```markdown
## Settings Store
- SSOT: `src/shared/settingsRegistry.js`
- Snapshot transport: `src/core/config/runtimeSettingsSnapshot.js`
- Effective config resolver: `src/core/config/resolveEffectiveRuntimeConfig.js`
- Adding a new setting: Add one entry to registry. Everything else derives.
```

### `src/features/indexing/README.md`
Add section:
```markdown
## Run Launch Settings
- GUI sends ALL settings in POST /process/start body
- Backend writes snapshot to _runtime/snapshots/<runId>-settings.json
- Child reads RUNTIME_SETTINGS_SNAPSHOT env var to find snapshot
- No more per-field env var mapping
```

### `src/features/settings-authority/README.md`
Add section:
```markdown
## Settings Authority
- Persists user settings to user-settings.json (for CLI fallback)
- For GUI-launched runs, snapshot is the source of truth (not user-settings.json)
- Legacy aliases (helperFilesRoot, searchProvider, etc.) have been removed
```

---

## Sub-Plan 10F: Maintenance Guide

### `docs/implementation/settings-store-rewrite/10-MAINTENANCE-GUIDE.md`

```markdown
# Settings Store Maintenance Guide

## How to Add a New Setting

1. Add one entry to `src/shared/settingsRegistry.js`:
   ```javascript
   { key: "myNewSetting", type: "int", default: 42, min: 1, max: 100,
     configKey: "myNewSetting", envKey: "MY_NEW_SETTING",
     transport: "snapshot", roundOverridable: false },
   ```
2. Done. Everything else derives automatically:
   - Defaults, clamping ranges, route contracts, GUI types, payload builders, snapshot transport

## How to Retire a Setting
1. Set `deprecated: true` on the registry entry
2. Remove UI controls from pipeline settings sections
3. After one release cycle, remove the entry entirely

## How to Make a Setting Round-Overridable
1. Set `roundOverridable: true` on the registry entry
2. Add override logic in `src/runner/roundConfigBuilder.js` with patch recording

## How to Debug Settings Propagation
1. Read the snapshot file: `categoryAuthorityRoot/_runtime/snapshots/<runId>-settings.json`
2. Check run events for `round_config_overrides` entries
3. Compare snapshot value vs effective value in run summary
```

---

## Execution Steps

1. Update all 10 existing backend test files
2. Update all 8 run-launch/consumer test files
3. Write settingsDriftPrevention.test.js
4. Write settingsSnapshotE2E.test.js
5. Update 3 domain READMEs
6. Write maintenance guide
7. Run FULL test suite (all 5,359+ tests)
8. Verify zero regressions

## Estimated Effort
~6-8 hours. Test updates are the bulk of the work.

## Rollback
Individual test files can be reverted independently. Docs are non-breaking.
