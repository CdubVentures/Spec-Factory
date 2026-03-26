import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { providerHasApiKey, extractRegistryApiKeys, PROVIDER_API_KEY_MAP, type RuntimeApiKeySlice } from '../llmProviderApiKeyGate.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

function makeProvider(overrides: Partial<LlmProviderEntry> & { id: string; name: string }): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    expanded: false,
    models: [],
    ...overrides,
  };
}

function emptyKeys(): RuntimeApiKeySlice {
  return {
    geminiApiKey: '',
    deepseekApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: '',
  };
}

describe('providerHasApiKey', () => {
  // ── Local providers never need keys ──

  it('ollama provider always returns true regardless of keys', () => {
    const provider = makeProvider({ id: 'user-ollama', name: 'Ollama', type: 'ollama' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), true);
  });

  // ── Registry-level apiKey ──

  it('returns true when provider has its own apiKey', () => {
    const provider = makeProvider({ id: 'custom-1', name: 'Custom', apiKey: 'sk-abc123' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), true);
  });

  it('ignores whitespace-only provider apiKey', () => {
    const provider = makeProvider({ id: 'custom-1', name: 'Custom', apiKey: '   ' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), false);
  });

  // ── Default provider → runtime key mapping ──

  it('default-gemini resolves from geminiApiKey', () => {
    const provider = makeProvider({ id: 'default-gemini', name: 'Gemini' });
    const keys = { ...emptyKeys(), geminiApiKey: 'AIza-gemini-key' };
    deepStrictEqual(providerHasApiKey(provider, keys), true);
  });

  it('default-deepseek resolves from deepseekApiKey', () => {
    const provider = makeProvider({ id: 'default-deepseek', name: 'DeepSeek' });
    const keys = { ...emptyKeys(), deepseekApiKey: 'sk-ds-key' };
    deepStrictEqual(providerHasApiKey(provider, keys), true);
  });

  it('default-anthropic resolves from anthropicApiKey', () => {
    const provider = makeProvider({ id: 'default-anthropic', name: 'Anthropic', type: 'anthropic' });
    const keys = { ...emptyKeys(), anthropicApiKey: 'sk-ant-key' };
    deepStrictEqual(providerHasApiKey(provider, keys), true);
  });

  it('default-openai resolves from openaiApiKey', () => {
    const provider = makeProvider({ id: 'default-openai', name: 'OpenAI' });
    const keys = { ...emptyKeys(), openaiApiKey: 'sk-openai-key' };
    deepStrictEqual(providerHasApiKey(provider, keys), true);
  });

  it('default-gemini returns false when geminiApiKey is empty', () => {
    const provider = makeProvider({ id: 'default-gemini', name: 'Gemini' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), false);
  });

  // ── No global catch-all — providers need their own key ──

  it('user-added provider without own apiKey returns false', () => {
    const provider = makeProvider({ id: 'provider-12345', name: 'My LLM' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), false);
  });

  it('default provider without dedicated key returns false', () => {
    const provider = makeProvider({ id: 'default-anthropic', name: 'Anthropic', type: 'anthropic' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), false);
  });

  // ── Priority: registry key wins over runtime key ──

  it('provider apiKey takes precedence even when runtime key also set', () => {
    const provider = makeProvider({ id: 'default-gemini', name: 'Gemini', apiKey: 'registry-key' });
    const keys = { ...emptyKeys(), geminiApiKey: 'runtime-key' };
    deepStrictEqual(providerHasApiKey(provider, keys), true);
  });

  // ── Lab providers bypass API key requirement ──

  it('lab provider always returns true regardless of keys', () => {
    const provider = makeProvider({ id: 'lab-openai', name: 'LLM Lab OpenAI', accessMode: 'lab' as const });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), true);
  });

  it('lab provider with session sentinel returns true', () => {
    const provider = makeProvider({ id: 'lab-gemini', name: 'LLM Lab Gemini', accessMode: 'lab' as const, apiKey: 'session' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), true);
  });

  // ── Full miss ──

  it('returns false when no key source has a value', () => {
    const provider = makeProvider({ id: 'provider-99', name: 'No Key Provider' });
    deepStrictEqual(providerHasApiKey(provider, emptyKeys()), false);
  });

  it('returns false when all key sources are whitespace', () => {
    const provider = makeProvider({ id: 'default-openai', name: 'OpenAI', apiKey: '  ' });
    const keys: RuntimeApiKeySlice = {
      geminiApiKey: '',
      deepseekApiKey: '',
      anthropicApiKey: '',
      openaiApiKey: '   ',
    };
    deepStrictEqual(providerHasApiKey(provider, keys), false);
  });
});

describe('PROVIDER_API_KEY_MAP', () => {
  it('contains all 4 default providers', () => {
    const keys = Object.keys(PROVIDER_API_KEY_MAP).sort();
    deepStrictEqual(keys, [
      'default-anthropic',
      'default-deepseek',
      'default-gemini',
      'default-openai',
    ]);
  });
});

describe('extractRegistryApiKeys', () => {
  it('empty registry returns empty object', () => {
    deepStrictEqual(extractRegistryApiKeys([]), {});
  });

  it('provider with apiKey mapped via PROVIDER_API_KEY_MAP returns correct standalone field', () => {
    const registry = [
      makeProvider({ id: 'default-gemini', name: 'Gemini', apiKey: 'AIza-key' }),
    ];
    deepStrictEqual(extractRegistryApiKeys(registry), { geminiApiKey: 'AIza-key' });
  });

  it('provider with whitespace-only apiKey is skipped', () => {
    const registry = [
      makeProvider({ id: 'default-openai', name: 'OpenAI', apiKey: '   ' }),
    ];
    deepStrictEqual(extractRegistryApiKeys(registry), {});
  });

  it('provider with non-default ID (no mapping) is skipped', () => {
    const registry = [
      makeProvider({ id: 'custom-provider', name: 'Custom', apiKey: 'sk-custom' }),
    ];
    deepStrictEqual(extractRegistryApiKeys(registry), {});
  });

  it('multiple providers with keys return multiple entries', () => {
    const registry = [
      makeProvider({ id: 'default-gemini', name: 'Gemini', apiKey: 'AIza-key' }),
      makeProvider({ id: 'default-anthropic', name: 'Anthropic', apiKey: 'sk-ant' }),
      makeProvider({ id: 'default-deepseek', name: 'DeepSeek', apiKey: '' }),
      makeProvider({ id: 'custom-other', name: 'Other', apiKey: 'sk-other' }),
    ];
    deepStrictEqual(extractRegistryApiKeys(registry), {
      geminiApiKey: 'AIza-key',
      anthropicApiKey: 'sk-ant',
    });
  });
});
