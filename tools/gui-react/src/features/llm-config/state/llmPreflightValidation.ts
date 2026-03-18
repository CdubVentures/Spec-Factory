import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import type { MixIssue } from './llmMixDetection.ts';
import type { RuntimeApiKeySlice } from './llmProviderApiKeyGate.ts';
import { LLM_MODEL_ROLES } from './llmModelRoleRegistry.ts';
import { detectEmptyModelFields } from './llmModelValidation.ts';
import { providerHasApiKey } from './llmProviderApiKeyGate.ts';
import { validatePhaseTokenLimits } from './llmTokenLimitValidation.ts';
import { resolveProviderForModel } from './llmProviderRegistryBridge.ts';

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
      key: `token-limit-${tw.field}-${tw.phase}`,
      severity: 'warning',
      title: tw.field === 'contextOverflow'
        ? `${tw.phase}: output allocation exceeds 50% of context window`
        : `${tw.phase} token cap exceeds model limit`,
      message: tw.field === 'contextOverflow'
        ? `${tw.model} context window is ${tw.limit.toLocaleString()}, but ${tw.phase} output is set to ${tw.setting.toLocaleString()} (>${Math.floor(tw.limit * 0.5).toLocaleString()}).`
        : `${tw.model} max output is ${tw.limit.toLocaleString()}, but ${tw.phase} is set to ${tw.setting.toLocaleString()}.`,
      ringFields: [],
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return { valid: !hasError, issues };
}
