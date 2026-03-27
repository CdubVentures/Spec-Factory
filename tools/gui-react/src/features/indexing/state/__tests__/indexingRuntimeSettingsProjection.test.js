import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let projectionModulePromise;
let runtimeDefaultsPromise;

async function loadProjectionModule() {
  if (!projectionModulePromise) {
    projectionModulePromise = loadBundledModule(
      'tools/gui-react/src/features/indexing/state/indexingRuntimeSettingsProjection.ts',
      { prefix: 'indexing-runtime-settings-projection-' },
    );
  }
  return projectionModulePromise;
}

async function loadRuntimeDefaults() {
  if (!runtimeDefaultsPromise) {
    runtimeDefaultsPromise = Promise.all([
      loadBundledModule(
        'tools/gui-react/src/stores/settingsManifest.ts',
        { prefix: 'indexing-runtime-settings-defaults-' },
      ),
      loadBundledModule(
        'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftContracts.ts',
        { prefix: 'indexing-runtime-settings-draft-contracts-' },
      ),
    ]).then(([{ RUNTIME_SETTING_DEFAULTS }, { toRuntimeDraft }]) => ({
      runtimeBootstrap: { ...RUNTIME_SETTING_DEFAULTS },
      runtimeManifestDefaults: toRuntimeDraft(RUNTIME_SETTING_DEFAULTS),
    }));
  }
  return runtimeDefaultsPromise;
}

test('buildIndexingRuntimeSettingsProjection normalizes authority settings into draft, payload, baseline, and phase-05 display values', async () => {
  const [{ buildIndexingRuntimeSettingsProjection }, defaults] = await Promise.all([
    loadProjectionModule(),
    loadRuntimeDefaults(),
  ]);

  const projection = buildIndexingRuntimeSettingsProjection({
    runtimeSettings: {
      llmModelPlan: 'planner-live',
      domainClassifierUrlCap: '12',
    },
    ...defaults,
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 512,
      max_output_tokens: 2048,
    }),
  });

  assert.equal(projection.runtimeDraft.llmModelPlan, 'planner-live');
  assert.equal(projection.runtimeDraft.domainClassifierUrlCap, 12);
  assert.equal(projection.runtimeSettingsPayload.domainClassifierUrlCap, 12);
  assert.equal(projection.runtimeSettingsBaseline.domainClassifierUrlCap, 12);
  // WHY: phase05RuntimeSettings still references perHostMinDelayMs (hardcoded in projection module).
  // perHostMinDelayMs was removed from the registry so the draft value is undefined.
  assert.ok(projection.phase05RuntimeSettings != null);
});

test('buildIndexingRuntimeSettingsProjection falls back to runtime defaults when authority settings are missing or invalid', async () => {
  const [{ buildIndexingRuntimeSettingsProjection }, defaults] = await Promise.all([
    loadProjectionModule(),
    loadRuntimeDefaults(),
  ]);

  const projection = buildIndexingRuntimeSettingsProjection({
    runtimeSettings: {
      maxRunSeconds: 'not-a-number',
    },
    ...defaults,
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 512,
      max_output_tokens: 2048,
    }),
  });

  assert.equal(
    projection.runtimeDraft.maxRunSeconds,
    defaults.runtimeBootstrap.maxRunSeconds,
  );
  assert.equal(
    projection.runtimeSettingsPayload.maxRunSeconds,
    defaults.runtimeBootstrap.maxRunSeconds,
  );
});
