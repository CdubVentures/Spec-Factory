import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import type { MixIssue } from './llmMixDetection';
import type { RuntimeApiKeySlice } from './llmProviderApiKeyGate';
import { LLM_MODEL_ROLES } from './llmModelRoleRegistry';
import { detectEmptyModelFields } from './llmModelValidation';
import { providerHasApiKey } from './llmProviderApiKeyGate';
import { validatePhaseTokenLimits } from './llmTokenLimitValidation';
import { resolveProviderForModel } from './llmProviderRegistryBridge';

export interface PreflightResult {
  valid: boolean;
  issues: MixIssue[];
}

/**
 * Composes all LLM validation checks into a single pass.
 * Returns valid:false if any error-severity issue is found.
 * Warnings do not block (valid remains true).
 */
export function validateLlmConfigForRun(
  draft: Record<string, unknown>,
  registry: LlmProviderEntry[],
  runtimeApiKeys: RuntimeApiKeySlice,
): PreflightResult {
  const issues: MixIssue[] = [];

  // 1. Empty model fields
  const modelFields: Record<string, string> = {};
  for (const role of LLM_MODEL_ROLES) {
    const val = draft[role.modelKey];
    if (typeof val === 'string') modelFields[role.modelKey] = val;
  }
  issues.push(...detectEmptyModelFields(modelFields));

  // 2. Missing API keys — check each non-empty model's provider
  const checkedProviders = new Set<string>();
  for (const role of LLM_MODEL_ROLES) {
    const modelId = draft[role.modelKey];
    if (typeof modelId !== 'string' || !modelId.trim()) continue;
    const provider = resolveProviderForModel(registry, modelId);
    if (!provider || checkedProviders.has(provider.id)) continue;
    checkedProviders.add(provider.id);
    if (!providerHasApiKey(provider, runtimeApiKeys)) {
      issues.push({
        key: `missing-api-key-${provider.id}`,
        severity: 'error',
        title: `${provider.name} has no API key`,
        message: `Provider "${provider.name}" needs an API key configured before running.`,
        ringFields: [],
      });
    }
  }

  // 3. Token limit warnings
  const tokenWarnings = validatePhaseTokenLimits(draft, registry);
  for (const tw of tokenWarnings) {
    issues.push({
      key: `token-limit-${tw.phase}`,
      severity: 'warning',
      title: `${tw.phase} token cap exceeds model limit`,
      message: `${tw.model} max output is ${tw.limit.toLocaleString()}, but ${tw.phase} is set to ${tw.setting.toLocaleString()}.`,
      ringFields: [],
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return { valid: !hasError, issues };
}
