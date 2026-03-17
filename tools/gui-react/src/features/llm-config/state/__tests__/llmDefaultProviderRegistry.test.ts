import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import {
  mergeDefaultsIntoRegistry,
  isDefaultProvider,
  isDefaultModel,
} from '../llmDefaultProviderRegistry.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

function makeProvider(overrides: Partial<LlmProviderEntry> & { id: string; name: string }): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    expanded: false,
    models: [],
    ...overrides,
  };
}

function makeModel(
  id: string,
  modelId: string,
  role: 'primary' | 'reasoning' | 'fast' | 'embedding' = 'primary',
) {
  return {
    id,
    modelId,
    role,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null as number | null,
    maxOutputTokens: null as number | null,
  };
}

const DEFAULTS: LlmProviderEntry[] = [
  makeProvider({
    id: 'default-gemini',
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    enabled: true,
    models: [
      makeModel('default-gemini-flash', 'gemini-2.5-flash', 'primary'),
      makeModel('default-gemini-flash-lite', 'gemini-2.5-flash-lite', 'fast'),
    ],
  }),
  makeProvider({
    id: 'default-deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    enabled: true,
    models: [
      makeModel('default-deepseek-chat', 'deepseek-chat', 'primary'),
      makeModel('default-deepseek-reasoner', 'deepseek-reasoner', 'reasoning'),
    ],
  }),
  makeProvider({
    id: 'default-anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    enabled: false,
    models: [makeModel('default-anthropic-sonnet', 'claude-sonnet-4-20250514', 'reasoning')],
  }),
  makeProvider({
    id: 'default-openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    enabled: false,
    models: [
      makeModel('default-openai-gpt-4-1', 'gpt-4.1', 'primary'),
      makeModel('default-openai-gpt-4-1-mini', 'gpt-4.1-mini', 'fast'),
      makeModel('default-openai-gpt-5', 'gpt-5', 'primary'),
    ],
  }),
];

describe('mergeDefaultsIntoRegistry', () => {
  it('empty user + full defaults → all 4 providers, 8 models', () => {
    const result = mergeDefaultsIntoRegistry([], DEFAULTS);
    strictEqual(result.length, 4);
    const modelCount = result.reduce((sum, p) => sum + p.models.length, 0);
    strictEqual(modelCount, 8);
  });

  it('user has default-gemini with edits → user version preserved entirely', () => {
    const userGemini = makeProvider({
      id: 'default-gemini',
      name: 'My Custom Name',
      apiKey: 'sk-user-key-123',
      enabled: false,
      models: [],
    });
    const result = mergeDefaultsIntoRegistry([userGemini], DEFAULTS);
    const gemini = result.find((p) => p.id === 'default-gemini');
    strictEqual(gemini?.apiKey, 'sk-user-key-123');
    strictEqual(gemini?.enabled, false);
    strictEqual(gemini?.name, 'My Custom Name'); // user's edits preserved
    strictEqual(gemini?.models.length, 0); // user's edits preserved
  });

  it('user missing some defaults → all 4 defaults appear', () => {
    const userGemini = makeProvider({
      id: 'default-gemini',
      name: 'Gemini',
      apiKey: 'key-1',
    });
    const result = mergeDefaultsIntoRegistry([userGemini], DEFAULTS);
    const ids = result.map((p) => p.id);
    deepStrictEqual(ids.includes('default-gemini'), true);
    deepStrictEqual(ids.includes('default-deepseek'), true);
    deepStrictEqual(ids.includes('default-anthropic'), true);
    deepStrictEqual(ids.includes('default-openai'), true);
  });

  it('user has extra custom providers → customs appear after defaults, unmodified', () => {
    const custom = makeProvider({
      id: 'provider-custom',
      name: 'My Custom',
      apiKey: 'sk-custom',
      models: [makeModel('m-custom', 'custom-model', 'fast')],
    });
    const result = mergeDefaultsIntoRegistry([custom], DEFAULTS);
    strictEqual(result.length, 5); // 4 defaults + 1 custom
    // Defaults first
    strictEqual(result[0].id, 'default-gemini');
    strictEqual(result[1].id, 'default-deepseek');
    strictEqual(result[2].id, 'default-anthropic');
    strictEqual(result[3].id, 'default-openai');
    // Custom last, unmodified
    strictEqual(result[4].id, 'provider-custom');
    strictEqual(result[4].name, 'My Custom');
    strictEqual(result[4].apiKey, 'sk-custom');
    strictEqual(result[4].models.length, 1);
    strictEqual(result[4].models[0].modelId, 'custom-model');
  });

  it('deepseek-reasoner role preserved after merge', () => {
    const result = mergeDefaultsIntoRegistry([], DEFAULTS);
    const deepseek = result.find((p) => p.id === 'default-deepseek');
    const reasoner = deepseek?.models.find((m) => m.modelId === 'deepseek-reasoner');
    strictEqual(reasoner?.role, 'reasoning');
  });

  it('claude-sonnet role preserved after merge', () => {
    const result = mergeDefaultsIntoRegistry([], DEFAULTS);
    const anthropic = result.find((p) => p.id === 'default-anthropic');
    const sonnet = anthropic?.models.find((m) => m.modelId === 'claude-sonnet-4-20250514');
    strictEqual(sonnet?.role, 'reasoning');
  });

  it('gemini role preserved after merge', () => {
    const result = mergeDefaultsIntoRegistry([], DEFAULTS);
    const gemini = result.find((p) => p.id === 'default-gemini');
    const flash = gemini?.models.find((m) => m.modelId === 'gemini-2.5-flash');
    strictEqual(flash?.role, 'primary');
  });

  it('default order is gemini → deepseek → anthropic → openai regardless of user order', () => {
    const userAnthropicFirst = [
      makeProvider({ id: 'default-anthropic', name: 'Anthropic', apiKey: 'k1' }),
      makeProvider({ id: 'default-openai', name: 'OpenAI', apiKey: 'k3' }),
      makeProvider({ id: 'default-gemini', name: 'Gemini', apiKey: 'k2' }),
    ];
    const result = mergeDefaultsIntoRegistry(userAnthropicFirst, DEFAULTS);
    strictEqual(result[0].id, 'default-gemini');
    strictEqual(result[1].id, 'default-deepseek');
    strictEqual(result[2].id, 'default-anthropic');
    strictEqual(result[3].id, 'default-openai');
  });

  it('user edits to model costs/roles preserved on merge', () => {
    const userDeepSeek = makeProvider({
      id: 'default-deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-ds',
      enabled: true,
      models: [
        { ...makeModel('default-deepseek-chat', 'deepseek-chat', 'fast'), costInputPer1M: 0.5 },
        makeModel('default-deepseek-reasoner', 'deepseek-reasoner', 'reasoning'),
      ],
    });
    const result = mergeDefaultsIntoRegistry([userDeepSeek], DEFAULTS);
    const ds = result.find((p) => p.id === 'default-deepseek');
    strictEqual(ds?.enabled, true); // user changed from default false
    strictEqual(ds?.apiKey, 'sk-ds');
    const chat = ds?.models.find((m) => m.modelId === 'deepseek-chat');
    strictEqual(chat?.role, 'fast'); // user changed role
    strictEqual(chat?.costInputPer1M, 0.5); // user changed cost
  });

  it('openai provider inserted when missing from user registry', () => {
    const result = mergeDefaultsIntoRegistry([], DEFAULTS);
    const openai = result.find((p) => p.id === 'default-openai');
    strictEqual(openai?.name, 'OpenAI');
    strictEqual(openai?.enabled, false);
    strictEqual(openai?.models.length, 3);
    const gpt41 = openai?.models.find((m) => m.modelId === 'gpt-4.1');
    strictEqual(gpt41?.role, 'primary');
  });
});

describe('isDefaultProvider', () => {
  it('returns true for default-gemini', () => {
    strictEqual(isDefaultProvider('default-gemini'), true);
  });

  it('returns true for default-deepseek', () => {
    strictEqual(isDefaultProvider('default-deepseek'), true);
  });

  it('returns true for default-anthropic', () => {
    strictEqual(isDefaultProvider('default-anthropic'), true);
  });

  it('returns true for default-openai', () => {
    strictEqual(isDefaultProvider('default-openai'), true);
  });

  it('returns false for provider-123', () => {
    strictEqual(isDefaultProvider('provider-123'), false);
  });

  it('returns false for empty string', () => {
    strictEqual(isDefaultProvider(''), false);
  });
});

describe('isDefaultModel', () => {
  it('returns true for default-gemini-flash-lite', () => {
    strictEqual(isDefaultModel('default-gemini-flash-lite'), true);
  });

  it('returns true for default-deepseek-reasoner', () => {
    strictEqual(isDefaultModel('default-deepseek-reasoner'), true);
  });

  it('returns true for default-openai-gpt-4-1', () => {
    strictEqual(isDefaultModel('default-openai-gpt-4-1'), true);
  });

  it('returns false for model-123', () => {
    strictEqual(isDefaultModel('model-123'), false);
  });
});
