// Pure reset-scope builders for LLM Config panels. Each builder returns a
// patch object suitable for llmAuthority.updatePolicy(). Separated from the
// page so it can be tested without React.

import type { LlmPolicy } from './llmPolicyAdapter.generated.ts';
import type { LlmOverridePhaseId } from '../types/llmPhaseOverrideTypes.generated.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';

/**
 * Global panel reset: only the 5 "inherited defaults" shown on the Global
 * panel — Max Output Tokens (plan), Max Context Tokens, Timeout, Reasoning
 * Budget, Lab Queue Delay. Leaves providers, models, budgets, API keys, and
 * all phase overrides untouched.
 */
export function buildLlmGlobalDefaultsResetPatch(
  defaults: LlmPolicy,
  current: LlmPolicy,
): Partial<LlmPolicy> {
  return {
    tokens: {
      ...current.tokens,
      plan: defaults.tokens.plan,
      maxTokens: defaults.tokens.maxTokens,
    },
    reasoning: {
      ...current.reasoning,
      budget: defaults.reasoning.budget,
    },
    timeoutMs: defaults.timeoutMs,
    labQueueDelayMs: defaults.labQueueDelayMs,
  };
}

/**
 * Phase override reset: clears one phase's override slice. Phase UI then
 * re-inherits from the Global panel's defaults.
 */
export function buildLlmPhaseOverrideResetPatch(
  overrideKey: LlmOverridePhaseId,
  current: LlmPolicy,
): Partial<LlmPolicy> {
  const nextOverrides = { ...current.phaseOverrides };
  delete nextOverrides[overrideKey];
  return { phaseOverrides: nextOverrides };
}

/**
 * Full policy reset preserving API keys. The registry is re-parsed from
 * defaults; each provider's apiKey is carried over from the current
 * registry (falling back to the flat apiKeys slice if missing).
 */
export function buildLlmResetAllPatch(args: {
  readonly defaults: LlmPolicy;
  readonly current: LlmPolicy;
  readonly freshRegistry: LlmProviderEntry[];
  readonly providerApiKeyMap: Record<string, string>;
}): Partial<LlmPolicy> {
  const { defaults, current, freshRegistry, providerApiKeyMap } = args;

  const currentRegistry = current.providerRegistry as LlmProviderEntry[];
  const resolvedKeys: Record<string, string> = {};
  for (const provider of currentRegistry) {
    let key = provider.apiKey?.trim() || '';
    if (!key) {
      const flatField = providerApiKeyMap[provider.id] as keyof LlmPolicy['apiKeys'] | undefined;
      if (flatField) key = String(current.apiKeys[flatField] || '').trim();
    }
    if (key) resolvedKeys[provider.id] = key;
  }

  const preservedRegistry = freshRegistry.map((provider) => ({
    ...provider,
    apiKey: resolvedKeys[provider.id] || provider.apiKey,
  }));

  return {
    ...defaults,
    providerRegistry: preservedRegistry,
    apiKeys: {
      gemini: current.apiKeys.gemini || resolvedKeys['default-gemini'] || '',
      deepseek: current.apiKeys.deepseek || resolvedKeys['default-deepseek'] || '',
      anthropic: current.apiKeys.anthropic || resolvedKeys['default-anthropic'] || '',
      openai: current.apiKeys.openai || resolvedKeys['default-openai'] || '',
    },
  };
}
