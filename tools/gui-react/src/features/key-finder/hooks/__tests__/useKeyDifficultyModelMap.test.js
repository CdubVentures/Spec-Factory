import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/key-finder/hooks/useKeyDifficultyModelMap.ts',
    {
      prefix: 'key-difficulty-model-map-',
      stubs: {
        react: 'export function useMemo(factory) { return factory(); }',
        '../../../stores/runtimeSettingsValueStore.ts': `
          export function useRuntimeSettingsValueStore(selector) {
            const state = { values: {} };
            return typeof selector === 'function' ? selector(state) : state;
          }
        `,
      },
    },
  );
}

test('KF model map mirrors backend tier routing when reasoning is enabled without a reasoning model', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.resolveKeyDifficultyModelMapFromSettings, 'function');

  const map = mod.resolveKeyDifficultyModelMapFromSettings({
    llmModelPlan: 'default-gemini:gemini-2.5-flash',
    keyFinderTierSettingsJson: JSON.stringify({
      easy: {
        model: 'lab-openai:gpt-5.4',
        useReasoning: true,
        reasoningModel: '',
        thinking: true,
        thinkingEffort: 'xhigh',
        webSearch: true,
      },
      fallback: {
        model: 'default-openai:gpt-5.4',
        useReasoning: false,
        reasoningModel: '',
        thinking: true,
        thinkingEffort: 'xhigh',
        webSearch: true,
      },
    }),
  });

  assert.equal(map.easy.model, 'lab-openai:gpt-5.4');
});

test('KF model map resolves access mode from composite model provider', async () => {
  const mod = await loadModule();

  const map = mod.resolveKeyDifficultyModelMapFromSettings({
    llmModelPlan: 'default-gemini:gemini-2.5-flash',
    llmProviderRegistryJson: JSON.stringify([
      {
        id: 'default-openai',
        accessMode: 'api',
        models: [{ modelId: 'gpt-5.4', role: 'primary' }],
      },
      {
        id: 'lab-openai',
        accessMode: 'lab',
        models: [{ modelId: 'gpt-5.4', role: 'primary' }],
      },
    ]),
    keyFinderTierSettingsJson: JSON.stringify({
      easy: {
        model: 'lab-openai:gpt-5.4',
        useReasoning: false,
        reasoningModel: '',
      },
      medium: {
        model: 'default-openai:gpt-5.4',
        useReasoning: false,
        reasoningModel: '',
      },
      fallback: {
        model: 'lab-openai:gpt-5.4',
        useReasoning: false,
        reasoningModel: '',
      },
    }),
  });

  assert.equal(map.easy.accessMode, 'lab');
  assert.equal(map.medium.accessMode, 'api');
});
