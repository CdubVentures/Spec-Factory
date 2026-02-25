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
    text.includes('if (!runtimeSettingsData || runtimeSettingsDirty) return;'),
    true,
    'Runtime LLM hydration should apply only from runtime authority data when not dirty',
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
