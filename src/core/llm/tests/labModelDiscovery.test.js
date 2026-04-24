import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  transformLabRegistryToModels,
  mergeLabModelsIntoRegistry,
  syncLabRegistryIntoConfig,
} from '../labModelDiscovery.js';

// ---------------------------------------------------------------------------
// transformLabRegistryToModels — table-driven tests
// ---------------------------------------------------------------------------

describe('transformLabRegistryToModels', () => {
  const BASE_MODEL = {
    id: 'gpt-5.4',
    tier: 1,
    maxContextTokens: 1050000,
    maxOutputTokens: 128000,
    efforts: ['low', 'medium', 'high', 'xhigh'],
    costInputPer1M: 2.5,
    costOutputPer1M: 15.0,
    costCachedPer1M: 0.25,
    capabilities: { chat: true, extraction: true, json_mode: true, web_search: true },
  };

  test('base model with efforts → thinkingEffortOptions + thinking: true', () => {
    const result = transformLabRegistryToModels({ models: [BASE_MODEL] }, 'oai');
    assert.equal(result.length, 1);
    const m = result[0];
    assert.equal(m.modelId, 'gpt-5.4');
    assert.equal(m.thinking, true);
    assert.deepEqual(m.thinkingEffortOptions, ['low', 'medium', 'high', 'xhigh']);
    assert.equal(m.role, 'reasoning');
    assert.equal(m.accessMode, 'lab');
  });

  test('suffixed model with empty efforts → thinking: true, no thinkingEffortOptions', () => {
    const suffixed = { ...BASE_MODEL, id: 'gpt-5.4-xhigh', efforts: [] };
    const result = transformLabRegistryToModels({ models: [suffixed] }, 'oai');
    const m = result[0];
    assert.equal(m.thinking, true);
    assert.equal(m.thinkingEffortOptions, undefined);
    assert.equal(m.role, 'reasoning');
  });

  test('minimal model → thinking: false', () => {
    const minimal = { ...BASE_MODEL, id: 'gpt-5-minimal', efforts: [] };
    const result = transformLabRegistryToModels({ models: [minimal] }, 'oai');
    assert.equal(result[0].thinking, false);
  });

  test('web_search capability maps to webSearch', () => {
    const result = transformLabRegistryToModels({ models: [BASE_MODEL] }, 'oai');
    assert.equal(result[0].webSearch, true);
  });

  test('no web_search → webSearch: false', () => {
    const noWeb = { ...BASE_MODEL, capabilities: { chat: true } };
    const result = transformLabRegistryToModels({ models: [noWeb] }, 'oai');
    assert.equal(result[0].webSearch, false);
  });

  test('cost fields map 1:1', () => {
    const result = transformLabRegistryToModels({ models: [BASE_MODEL] }, 'oai');
    const m = result[0];
    assert.equal(m.costInputPer1M, 2.5);
    assert.equal(m.costOutputPer1M, 15.0);
    assert.equal(m.costCachedPer1M, 0.25);
  });

  test('LLM Lab provider registry shape maps provider-specific models and prices', () => {
    const result = transformLabRegistryToModels({
      providers: {
        openai: {
          models: [{
            ...BASE_MODEL,
            id: 'gpt-5.5',
            costInputPer1M: 5,
            costOutputPer1M: 30,
            costCachedPer1M: 0.5,
          }],
        },
      },
    }, 'oai', 'lab-openai');
    const m = result[0];
    assert.equal(m.modelId, 'gpt-5.5');
    assert.equal(m.costInputPer1M, 5);
    assert.equal(m.costOutputPer1M, 30);
    assert.equal(m.costCachedPer1M, 0.5);
  });

  test('token limits map 1:1', () => {
    const result = transformLabRegistryToModels({ models: [BASE_MODEL] }, 'oai');
    const m = result[0];
    assert.equal(m.maxContextTokens, 1050000);
    assert.equal(m.maxOutputTokens, 128000);
  });

  test('generated id follows lab-{prefix}-{normalized} pattern', () => {
    const result = transformLabRegistryToModels({ models: [BASE_MODEL] }, 'oai');
    assert.ok(result[0].id.startsWith('lab-oai-'));
  });

  test('compound model gpt-5.4-pro with efforts → reasoning role', () => {
    const pro = { ...BASE_MODEL, id: 'gpt-5.4-pro', efforts: ['medium', 'high', 'xhigh'] };
    const result = transformLabRegistryToModels({ models: [pro] }, 'oai');
    assert.equal(result[0].role, 'reasoning');
    assert.equal(result[0].modelId, 'gpt-5.4-pro');
  });

  test('compound model gpt-5.4-pro-xhigh → reasoning role', () => {
    const proX = { ...BASE_MODEL, id: 'gpt-5.4-pro-xhigh', efforts: [] };
    const result = transformLabRegistryToModels({ models: [proX] }, 'oai');
    assert.equal(result[0].role, 'reasoning');
  });

  test('empty/null registry → empty array', () => {
    assert.deepEqual(transformLabRegistryToModels(null, 'oai'), []);
    assert.deepEqual(transformLabRegistryToModels({}, 'oai'), []);
    assert.deepEqual(transformLabRegistryToModels({ models: [] }, 'oai'), []);
  });
});

// ---------------------------------------------------------------------------
// mergeLabModelsIntoRegistry — tests
// ---------------------------------------------------------------------------

describe('mergeLabModelsIntoRegistry', () => {
  const REGISTRY = JSON.stringify([
    { id: 'default-gemini', name: 'Gemini', type: 'openai-compatible', models: [{ id: 'g1', modelId: 'gemini-2.5-flash' }] },
    { id: 'lab-openai', name: 'LLM Lab OpenAI', type: 'openai-compatible', baseUrl: 'http://localhost:5001/v1', apiKey: 'session', accessMode: 'lab', models: [{ id: 'old-model', modelId: 'gpt-5' }] },
  ]);

  const SYNCED = new Map([
    ['lab-openai', [{ id: 'lab-oai-gpt54', modelId: 'gpt-5.4', role: 'primary' }]],
  ]);

  test('replaces lab provider models with synced models', () => {
    const result = JSON.parse(mergeLabModelsIntoRegistry(REGISTRY, SYNCED));
    const lab = result.find((p) => p.id === 'lab-openai');
    assert.equal(lab.models.length, 1);
    assert.equal(lab.models[0].modelId, 'gpt-5.4');
  });

  test('preserves non-lab providers untouched', () => {
    const result = JSON.parse(mergeLabModelsIntoRegistry(REGISTRY, SYNCED));
    const gemini = result.find((p) => p.id === 'default-gemini');
    assert.equal(gemini.models[0].modelId, 'gemini-2.5-flash');
  });

  test('preserves lab provider-level fields (baseUrl, apiKey)', () => {
    const result = JSON.parse(mergeLabModelsIntoRegistry(REGISTRY, SYNCED));
    const lab = result.find((p) => p.id === 'lab-openai');
    assert.equal(lab.baseUrl, 'http://localhost:5001/v1');
    assert.equal(lab.apiKey, 'session');
    assert.equal(lab.name, 'LLM Lab OpenAI');
  });

  test('appends new lab provider if not in registry', () => {
    const newProv = new Map([['lab-newprov', [{ id: 'n1', modelId: 'new-model' }]]]);
    const result = JSON.parse(mergeLabModelsIntoRegistry(REGISTRY, newProv));
    assert.equal(result.length, 3);
    const added = result.find((p) => p.id === 'lab-newprov');
    assert.ok(added);
    assert.equal(added.models[0].modelId, 'new-model');
  });

  test('empty syncedProviders returns original JSON', () => {
    assert.equal(mergeLabModelsIntoRegistry(REGISTRY, new Map()), REGISTRY);
  });

  test('invalid JSON passthrough', () => {
    assert.equal(mergeLabModelsIntoRegistry('not-json', SYNCED), 'not-json');
  });
});

describe('syncLabRegistryIntoConfig', () => {
  test('refreshes stale Lab provider models from the local LLM Lab registry file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-factory-lab-registry-'));
    const registryPath = path.join(dir, 'model_registry.json');
    fs.writeFileSync(registryPath, JSON.stringify({
      providers: {
        openai: {
          models: [{
            id: 'gpt-5.5',
            maxContextTokens: 1050000,
            maxOutputTokens: 128000,
            efforts: ['low', 'medium', 'high', 'xhigh'],
            costInputPer1M: 5,
            costOutputPer1M: 30,
            costCachedPer1M: 0.5,
            capabilities: { web_search: true },
          }],
        },
      },
    }));
    const config = {
      llmProviderRegistryJson: JSON.stringify([{
        id: 'lab-openai',
        name: 'LLM Lab OpenAI',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:5001/v1',
        apiKey: 'session',
        accessMode: 'lab',
        models: [{
          id: 'lab-oai-gpt55',
          modelId: 'gpt-5.5',
          costInputPer1M: 5,
          costOutputPer1M: 3,
          costCachedPer1M: 0.5,
        }],
      }]),
    };

    await syncLabRegistryIntoConfig(config, {
      labRegistryPath: registryPath,
      fetchRegistry: async () => {
        throw new Error('fetch should not be used when the local Lab registry has the provider');
      },
    });

    const providers = JSON.parse(config.llmProviderRegistryJson);
    const openai = providers.find((provider) => provider.id === 'lab-openai');
    assert.equal(openai.models.length, 1);
    assert.equal(openai.models[0].modelId, 'gpt-5.5');
    assert.equal(openai.models[0].costOutputPer1M, 30);
    assert.equal(openai.models[0].webSearch, true);
  });
});
