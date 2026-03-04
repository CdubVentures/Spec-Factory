import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('indexing runtime LLM knobs hydrate from runtime authority without config-default bootstrap drift', () => {
  const indexingPagePath = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
  const text = readText(indexingPagePath);

  assert.equal(
    /const applied = hydrateRuntimeSettingsFromBindings\(\s*runtimeSettingsData,\s*runtimeSettingsDirty,\s*runtimeHydrationBindings,\s*\);/s.test(text),
    true,
    'Runtime hydration should flow through shared hydration bindings using authority snapshot + dirty guard inputs',
  );
  assert.equal(
    text.includes('if (!applied) return;'),
    true,
    'Runtime hydration should skip local state resets when bindings do not apply',
  );
  assert.equal(
    text.includes('setRuntimeSettingsDirty(false);'),
    true,
    'Runtime hydration should clear dirty state only after authority snapshot values are applied',
  );
  assert.equal(
    text.includes('if (!runtimeSettingsData || runtimeSettingsDirty) return;'),
    false,
    'Hydration dirty-guard logic should live in shared runtime hydration helpers instead of page-local branches',
  );
  assert.equal(
    text.includes('if (!indexingLlmConfig || llmKnobsInitialized) return;'),
    false,
    'Indexing page should not bootstrap LLM knob state from indexing config defaults before runtime hydration',
  );
  assert.equal(
    text.includes('llmPlanFallbackModel: llmFallbackPlanModel,'),
    true,
    'Run payload should include persisted fallback-model knobs from runtime authority state',
  );
  assert.equal(
    text.includes('llmTokensWriteFallback,'),
    true,
    'Run payload should include persisted fallback-token knobs from runtime authority state',
  );
});
