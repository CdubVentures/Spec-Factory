import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import { resolveProviderForModel } from './llmProviderRegistryBridge.ts';
import { LLM_MODEL_FIELD_LABELS } from './llmModelRoleRegistry.ts';

export interface MixIssue {
  key: string;
  severity: 'warning' | 'info' | 'error';
  title: string;
  message: string;
  ringFields: string[];
}

interface GlobalModelDefaults {
  llmModelPlan: string;
  llmModelReasoning: string;
  llmPlanFallbackModel: string;
  llmReasoningFallbackModel: string;
}

export function detectMixIssues(
  registry: LlmProviderEntry[],
  defaults: GlobalModelDefaults,
): MixIssue[] {
  const issues: MixIssue[] = [];

  const baseProv = resolveProviderForModel(registry, defaults.llmModelPlan);
  const reasonProv = resolveProviderForModel(registry, defaults.llmModelReasoning);
  const baseFbProv = resolveProviderForModel(registry, defaults.llmPlanFallbackModel);
  const reasonFbProv = resolveProviderForModel(registry, defaults.llmReasoningFallbackModel);

  // Cross-provider base vs reasoning
  if (baseProv && reasonProv && baseProv.id !== reasonProv.id) {
    issues.push({
      key: 'cross-provider-base-reasoning',
      severity: 'warning',
      title: 'Cross-provider models',
      message: `Base model uses ${baseProv.name}, reasoning uses ${reasonProv.name}. Different providers may have inconsistent behavior.`,
      ringFields: ['llmModelPlan', 'llmModelReasoning'],
    });
  }

  // Fallback same as base model
  if (defaults.llmPlanFallbackModel && defaults.llmPlanFallbackModel === defaults.llmModelPlan) {
    issues.push({
      key: 'fallback-same-as-base',
      severity: 'error',
      title: 'Fallback matches base',
      message: 'Base fallback is the same model as the base model. Use a different model for redundancy.',
      ringFields: ['llmPlanFallbackModel'],
    });
  }

  // Reasoning fallback same as reasoning model
  if (defaults.llmReasoningFallbackModel && defaults.llmReasoningFallbackModel === defaults.llmModelReasoning) {
    issues.push({
      key: 'reasoning-fallback-same-as-reasoning',
      severity: 'error',
      title: 'Reasoning fallback matches reasoning',
      message: 'Reasoning fallback is the same model as the reasoning model. Use a different model for redundancy.',
      ringFields: ['llmReasoningFallbackModel'],
    });
  }

  // Same provider fallback (no redundancy)
  if (baseProv && baseFbProv && baseProv.id === baseFbProv.id && defaults.llmPlanFallbackModel) {
    issues.push({
      key: 'same-provider-fallback',
      severity: 'warning',
      title: 'Same-provider fallback',
      message: `Both base and fallback models are from ${baseProv.name}. If the provider goes down, both will fail.`,
      ringFields: ['llmModelPlan', 'llmPlanFallbackModel'],
    });
  }

  // No fallback configured
  if (!defaults.llmPlanFallbackModel) {
    issues.push({
      key: 'no-base-fallback',
      severity: 'info',
      title: 'No base fallback',
      message: 'No fallback model configured for the base model. Consider adding one for resilience.',
      ringFields: ['llmPlanFallbackModel'],
    });
  }

  // No reasoning fallback configured
  if (!defaults.llmReasoningFallbackModel) {
    issues.push({
      key: 'no-reasoning-fallback',
      severity: 'info',
      title: 'No reasoning fallback',
      message: 'No fallback model configured for reasoning. Consider adding one for resilience.',
      ringFields: ['llmReasoningFallbackModel'],
    });
  }

  // Local+remote mix in fallback chain
  const isLocal = (p: LlmProviderEntry | undefined) => p?.type === 'ollama';
  if (baseProv && baseFbProv && defaults.llmPlanFallbackModel) {
    if (isLocal(baseProv) !== isLocal(baseFbProv)) {
      issues.push({
        key: 'local-remote-mix',
        severity: 'warning',
        title: 'Local/remote mix',
        message: 'Base and fallback models mix local and remote providers. Network failures may affect both differently.',
        ringFields: ['llmModelPlan', 'llmPlanFallbackModel'],
      });
    }
  }

  // Different API formats
  if (baseProv && reasonProv && baseProv.type !== reasonProv.type) {
    issues.push({
      key: 'different-api-formats',
      severity: 'info',
      title: 'Different API formats',
      message: `Base (${baseProv.type}) and reasoning (${reasonProv.type}) use different API formats.`,
      ringFields: ['llmModelPlan', 'llmModelReasoning'],
    });
  }

  return issues;
}

export function detectStaleModelIssues(
  registry: LlmProviderEntry[],
  modelFields: Record<string, string>,
  knownModelOptions?: readonly string[],
): MixIssue[] {
  const issues: MixIssue[] = [];
  for (const [field, modelId] of Object.entries(modelFields)) {
    if (!modelId || !modelId.trim()) continue;
    const provider = resolveProviderForModel(registry, modelId);
    if (provider) continue;
    if (knownModelOptions && knownModelOptions.includes(modelId)) continue;
    const label = LLM_MODEL_FIELD_LABELS[field] ?? field;
    issues.push({
      key: `stale-model-${field}`,
      severity: 'warning',
      title: `${label} may be stale`,
      message: `"${modelId}" is not found in any enabled provider. It may have been removed or its provider disabled.`,
      ringFields: [field],
    });
  }
  return issues;
}

export function resolveRingColor(
  field: string,
  issues: MixIssue[],
  dismissedKeys: Record<string, boolean>,
): string | null {
  let maxSeverity: 'error' | 'warning' | 'info' | null = null;
  for (const issue of issues) {
    if (dismissedKeys[issue.key]) continue;
    if (!issue.ringFields.includes(field)) continue;
    if (issue.severity === 'error') return 'var(--sf-error, #dc2626)';
    if (issue.severity === 'warning') maxSeverity = 'warning';
    if (issue.severity === 'info' && !maxSeverity) maxSeverity = 'info';
  }
  if (maxSeverity === 'warning') return 'var(--sf-warning, #d97706)';
  if (maxSeverity === 'info') return 'var(--sf-info, #2563eb)';
  return null;
}
