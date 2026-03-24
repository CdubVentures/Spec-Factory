import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

async function loadProjectionModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/indexing/state/indexingRuntimeSettingsProjection.ts',
    { prefix: 'indexing-runtime-settings-projection-' },
  );
}

async function loadRuntimeDefaults() {
  const [{ RUNTIME_SETTING_DEFAULTS }, { toRuntimeDraft }] = await Promise.all([
    loadBundledModule(
      'tools/gui-react/src/stores/settingsManifest.ts',
      { prefix: 'indexing-runtime-settings-defaults-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalization.ts',
      { prefix: 'indexing-runtime-settings-draft-normalization-' },
    ),
  ]);
  return {
    runtimeBootstrap: { ...RUNTIME_SETTING_DEFAULTS },
    runtimeManifestDefaults: toRuntimeDraft(RUNTIME_SETTING_DEFAULTS),
  };
}

test('buildIndexingRuntimeSettingsProjection normalizes authority settings into draft, payload, baseline, and phase-05 display values', async () => {
  const [{ buildIndexingRuntimeSettingsProjection }, defaults] = await Promise.all([
    loadProjectionModule(),
    loadRuntimeDefaults(),
  ]);

  const projection = buildIndexingRuntimeSettingsProjection({
    runtimeSettings: {
      llmModelPlan: 'planner-live',
      fetchConcurrency: '7',
      perHostMinDelayMs: '1250',
      dynamicCrawleeEnabled: false,
      dynamicFetchRetryBudget: '4',
      dynamicFetchRetryBackoffMs: '875',
      reextractIndexed: false,
    },
    ...defaults,
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 512,
      max_output_tokens: 2048,
    }),
  });

  assert.equal(projection.runtimeDraft.llmModelPlan, 'planner-live');
  assert.equal(projection.runtimeDraft.fetchConcurrency, 7);
  assert.equal(projection.runtimeSettingsPayload.fetchConcurrency, 7);
  assert.equal(projection.runtimeSettingsPayload.dynamicFetchRetryBudget, 4);
  assert.equal(projection.runtimeSettingsBaseline.fetchConcurrency, 7);
  assert.equal(projection.runtimeSettingsBaseline.dynamicFetchRetryBudget, 4);
  assert.deepEqual(projection.phase05RuntimeSettings, {
    fetchConcurrency: '7',
    perHostMinDelayMs: '1250',
    dynamicCrawleeEnabled: false,
    dynamicFetchRetryBudget: '4',
    dynamicFetchRetryBackoffMs: '875',
  });
});

test('buildIndexingRuntimeSettingsProjection falls back to runtime defaults when authority settings are missing or invalid', async () => {
  const [{ buildIndexingRuntimeSettingsProjection }, defaults] = await Promise.all([
    loadProjectionModule(),
    loadRuntimeDefaults(),
  ]);

  const projection = buildIndexingRuntimeSettingsProjection({
    runtimeSettings: {
      fetchConcurrency: 'not-a-number',
      dynamicCrawleeEnabled: 'yes',
    },
    ...defaults,
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 512,
      max_output_tokens: 2048,
    }),
  });

  assert.equal(
    projection.runtimeDraft.fetchConcurrency,
    defaults.runtimeBootstrap.fetchConcurrency,
  );
  assert.equal(
    projection.runtimeSettingsPayload.fetchConcurrency,
    defaults.runtimeBootstrap.fetchConcurrency,
  );
});
