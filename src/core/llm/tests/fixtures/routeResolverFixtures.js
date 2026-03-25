import { buildRegistryLookup } from '../../routeResolver.js';

export function geminiProvider(overrides = {}) {
  return {
    id: 'default-gemini',
    name: 'Google Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: 'gem-key',
    enabled: true,
    models: [
      {
        id: 'gem-flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.15,
        costOutputPer1M: 0.60,
        costCachedPer1M: 0.04,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
      {
        id: 'gem-flash-lite',
        modelId: 'gemini-2.5-flash-lite',
        role: 'fast',
        costInputPer1M: 0.075,
        costOutputPer1M: 0.30,
        costCachedPer1M: 0.02,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
    ],
    ...overrides,
  };
}

export function deepseekProvider(overrides = {}) {
  return {
    id: 'default-deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'ds-key',
    enabled: true,
    models: [
      {
        id: 'ds-chat',
        modelId: 'deepseek-chat',
        role: 'primary',
        costInputPer1M: 0.27,
        costOutputPer1M: 1.10,
        costCachedPer1M: 0.07,
        maxContextTokens: 65536,
        maxOutputTokens: 8192,
      },
    ],
    ...overrides,
  };
}

export function anthropicProvider(overrides = {}) {
  return {
    id: 'default-anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'ant-key',
    enabled: true,
    models: [
      {
        id: 'ant-sonnet',
        modelId: 'claude-sonnet-4-6',
        role: 'reasoning',
        costInputPer1M: 3.0,
        costOutputPer1M: 15.0,
        costCachedPer1M: 0.30,
        maxContextTokens: 200000,
        maxOutputTokens: 64000,
      },
    ],
    ...overrides,
  };
}

export function cortexProvider(overrides = {}) {
  return {
    id: 'local-llmlab',
    name: 'LLM Lab Sidecar',
    type: 'cortex',
    baseUrl: 'http://localhost:5050',
    apiKey: '',
    enabled: true,
    models: [
      {
        id: 'llmlab-gpt5-low',
        modelId: 'gpt-5-low',
        role: 'fast',
        tier: 'fast',
        transport: 'sync',
        costInputPer1M: 0,
        costOutputPer1M: 0,
        costCachedPer1M: 0,
        maxContextTokens: 16384,
        maxOutputTokens: 16384,
      },
    ],
    ...overrides,
  };
}

export function twoProviderRegistry() {
  return [geminiProvider(), deepseekProvider()];
}

export function fullRegistry() {
  return [geminiProvider(), deepseekProvider(), anthropicProvider(), cortexProvider()];
}

export function registryIntegrationConfig(providers, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(providers),
    llmModelExtract: 'gemini-2.5-flash',
    llmModelPlan: 'gemini-2.5-flash',
    llmModelValidate: 'gemini-2.5-flash',
    llmModelWrite: 'gemini-2.5-flash',
    ...overrides,
  };
}
