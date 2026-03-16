import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

async function loadRuntimeSettingsAuthorityModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthority.ts',
    {
      prefix: 'runtime-settings-authority-',
    },
  );
}

async function loadSettingsManifestModule() {
  return loadBundledModule(
    'tools/gui-react/src/stores/settingsManifest.ts',
    {
      prefix: 'runtime-settings-manifest-',
    },
  );
}

function deriveNumericDefaultKeys(defaults) {
  return Object.entries(defaults)
    .filter(([, value]) => typeof value === 'number')
    .map(([key]) => key)
    .sort();
}

test('runtime numeric baseline defaults are sourced from all numeric runtime defaults', async () => {
  const [
    { RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS },
    { RUNTIME_SETTING_DEFAULTS },
  ] = await Promise.all([
    loadRuntimeSettingsAuthorityModule(),
    loadSettingsManifestModule(),
  ]);

  const expectedKeys = deriveNumericDefaultKeys(RUNTIME_SETTING_DEFAULTS);
  const baselineKeys = Object.keys(RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS).sort();

  assert.deepEqual(
    baselineKeys,
    expectedKeys,
    'runtime numeric baseline should stay aligned with numeric runtime defaults without manual key drift',
  );
});

test('runtime numeric baseline reader hydrates numeric defaults that were previously omitted', async () => {
  const [
    { readRuntimeSettingsNumericBaseline, RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS },
    { RUNTIME_SETTING_DEFAULTS },
  ] = await Promise.all([
    loadRuntimeSettingsAuthorityModule(),
    loadSettingsManifestModule(),
  ]);

  const settingsWithNumericOverride = {
    ...RUNTIME_SETTING_DEFAULTS,
    serpTriageMaxUrls: 73,
  };
  const baseline = readRuntimeSettingsNumericBaseline(
    settingsWithNumericOverride,
    RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
  );

  assert.equal(
    baseline.serpTriageMaxUrls,
    73,
    'numeric baseline reader should include serpTriageMaxUrls via manifest-driven key derivation',
  );
});
