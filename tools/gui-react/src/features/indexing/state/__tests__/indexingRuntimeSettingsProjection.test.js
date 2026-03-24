import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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
      maxPagesPerDomain: '12',
    },
    ...defaults,
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 512,
      max_output_tokens: 2048,
    }),
  });

  assert.equal(projection.runtimeDraft.llmModelPlan, 'planner-live');
  assert.equal(projection.runtimeDraft.maxPagesPerDomain, 12);
  assert.equal(projection.runtimeSettingsPayload.maxPagesPerDomain, 12);
  assert.equal(projection.runtimeSettingsBaseline.maxPagesPerDomain, 12);
  assert.deepEqual(projection.phase05RuntimeSettings, {
    maxPagesPerDomain: '12',
  });
});

test('buildIndexingRuntimeSettingsProjection falls back to runtime defaults when authority settings are missing or invalid', async () => {
  const [{ buildIndexingRuntimeSettingsProjection }, defaults] = await Promise.all([
    loadProjectionModule(),
    loadRuntimeDefaults(),
  ]);

  const projection = buildIndexingRuntimeSettingsProjection({
    runtimeSettings: {
      maxPagesPerDomain: 'not-a-number',
    },
    ...defaults,
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 512,
      max_output_tokens: 2048,
    }),
  });

  assert.equal(
    projection.runtimeDraft.maxPagesPerDomain,
    defaults.runtimeBootstrap.maxPagesPerDomain,
  );
  assert.equal(
    projection.runtimeSettingsPayload.maxPagesPerDomain,
    defaults.runtimeBootstrap.maxPagesPerDomain,
  );
});
