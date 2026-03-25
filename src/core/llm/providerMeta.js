// WHY: Single source of truth for static LLM provider metadata.
// Adding a new provider = add one entry here. All consumers import from this file.
// Registry-based resolution (routeResolver.js) takes precedence at runtime;
// this module provides the static fallback for prefix-based inference.

import { configValue } from '../../shared/settingsAccessor.js';

export const PROVIDER_META = Object.freeze({
  openai: Object.freeze({
    baseUrl: 'https://api.openai.com',
    apiKeyConfigKey: 'openaiApiKey',
    modelPrefixes: [],
  }),
  deepseek: Object.freeze({
    baseUrl: 'https://api.deepseek.com',
    apiKeyConfigKey: 'deepseekApiKey',
    modelPrefixes: ['deepseek'],
  }),
  gemini: Object.freeze({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyConfigKey: 'geminiApiKey',
    modelPrefixes: ['gemini'],
  }),
  anthropic: Object.freeze({
    baseUrl: 'https://api.anthropic.com',
    apiKeyConfigKey: 'anthropicApiKey',
    modelPrefixes: ['claude'],
  }),
  chatmock: Object.freeze({
    baseUrl: '',
    apiKeyConfigKey: 'chatmockApiKey',
    modelPrefixes: ['chatmock'],
  }),
});

export const KNOWN_PROVIDERS = Object.freeze(Object.keys(PROVIDER_META));

/**
 * Validate a provider name string against KNOWN_PROVIDERS.
 * Returns the canonical provider name if known, '' otherwise.
 * WHY: Different from providerFromModelToken — this validates a provider string,
 * not a model name. Unknown providers return '' (not 'openai').
 */
export function normalizeProvider(value) {
  const token = String(value || '').trim().toLowerCase();
  return KNOWN_PROVIDERS.includes(token) ? token : '';
}

/**
 * Infer provider name from a model ID string using prefix matching.
 * Returns '' for empty input, 'openai' as default for unknown prefixes.
 */
export function providerFromModelToken(modelId) {
  const token = String(modelId || '').trim().toLowerCase();
  if (!token) return '';
  for (const [name, meta] of Object.entries(PROVIDER_META)) {
    for (const prefix of meta.modelPrefixes) {
      if (token.startsWith(prefix)) return name;
    }
  }
  return 'openai';
}

/**
 * Look up the default base URL for a provider name.
 */
export function defaultBaseUrlForProvider(provider) {
  return PROVIDER_META[provider]?.baseUrl || PROVIDER_META.openai.baseUrl;
}

/**
 * Resolve API key from config using the provider's registered config key.
 */
export function bootstrapApiKeyForProvider(config = {}, provider = '') {
  const configKey = PROVIDER_META[provider]?.apiKeyConfigKey || 'openaiApiKey';
  return String(configValue(config, configKey) || '').trim();
}
