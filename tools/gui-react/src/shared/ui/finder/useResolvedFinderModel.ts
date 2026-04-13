/**
 * useResolvedFinderModel — generic hook for resolving the LLM model
 * assigned to any finder module's phase.
 *
 * O(1): parameterized by phase ID. No per-module duplication needed.
 */

import { useMemo } from 'react';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { resolvePhaseModel } from '../../../features/llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { GlobalDraftSlice } from '../../../features/llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { LlmPhaseOverrides, LlmOverridePhaseId } from '../../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { assembleLlmPolicyFromFlat } from '../../../features/llm-config/state/llmPolicyAdapter.generated.ts';
import { resolveProviderForModel } from '../../../features/llm-config/state/llmProviderRegistryBridge.ts';
import type { LlmAccessMode, LlmProviderEntry } from '../../../features/llm-config/types/llmProviderRegistryTypes.ts';
import { extractEffortFromModelName } from '../../../features/llm-config/state/llmEffortFromModelName.ts';

export interface ResolvedFinderModel {
  model: ReturnType<typeof resolvePhaseModel>;
  accessMode: LlmAccessMode;
  modelDisplay: string;
  /** Resolved effort level — baked from model name suffix or configured per-phase. Empty when none. */
  effortLevel: string;
  registry: LlmProviderEntry[];
}

function resolveAccessModeForModel(registry: LlmProviderEntry[], modelKey: string): LlmAccessMode {
  const provider = resolveProviderForModel(registry, modelKey);
  if (!provider) return 'api';
  const entry = provider.models.find((m) => m.modelId === modelKey);
  return ((entry?.accessMode ?? provider.accessMode ?? 'api') as LlmAccessMode);
}

/**
 * Resolve the LLM model configured for a finder module's phase.
 *
 * @param phaseId — the phase key from llmPhaseDefs (e.g. 'colorFinder', 'imageFinder')
 */
export function useResolvedFinderModel(phaseId: LlmOverridePhaseId): ResolvedFinderModel {
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  return useMemo(() => {
    const empty: ResolvedFinderModel = { model: null, accessMode: 'api' as LlmAccessMode, modelDisplay: 'not configured', effortLevel: '', registry: [] };
    if (!storeValues) return empty;
    const policy = assembleLlmPolicyFromFlat(storeValues as Record<string, unknown>);
    const globalDraft: GlobalDraftSlice = {
      llmModelPlan: policy.models?.plan ?? '',
      llmModelReasoning: policy.models?.reasoning ?? '',
      llmPlanFallbackModel: policy.models?.planFallback ?? '',
      llmReasoningFallbackModel: policy.models?.reasoningFallback ?? '',
      llmPlanUseReasoning: policy.reasoning?.enabled ?? false,
      llmMaxOutputTokensPlan: policy.tokens?.plan ?? 0,
      llmMaxOutputTokensTriage: policy.tokens?.triage ?? 0,
      llmTimeoutMs: policy.timeoutMs ?? 0,
      llmMaxTokens: policy.tokens?.maxTokens ?? 0,
    };
    const overrides: LlmPhaseOverrides = (policy.phaseOverrides ?? {}) as LlmPhaseOverrides;
    const resolved = resolvePhaseModel(overrides, phaseId, globalDraft);
    const registry: LlmProviderEntry[] = Array.isArray(policy.providerRegistry) ? policy.providerRegistry as LlmProviderEntry[] : [];
    const phaseOverride = (overrides as Record<string, { baseModel?: string; reasoningModel?: string } | undefined>)[phaseId];
    const rawModelKey = resolved?.useReasoning
      ? (phaseOverride?.reasoningModel || globalDraft.llmModelReasoning)
      : (phaseOverride?.baseModel || globalDraft.llmModelPlan);
    const accessMode = resolveAccessModeForModel(registry, rawModelKey);
    const modelDisplay = resolved?.effectiveModel || 'not configured';
    // WHY: Baked effort (e.g. gpt-5.4-xhigh) takes priority over configured effort.
    const bakedEffort = extractEffortFromModelName(modelDisplay);
    const effortLevel = bakedEffort || resolved?.thinkingEffort || '';
    return { model: resolved, accessMode, modelDisplay, effortLevel, registry };
  }, [storeValues, phaseId]);
}
