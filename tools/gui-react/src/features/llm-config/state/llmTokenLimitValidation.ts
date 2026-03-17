import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import { resolveProviderForModel } from './llmProviderRegistryBridge.ts';

export interface TokenLimitWarning {
  phase: string;
  model: string;
  setting: number;
  limit: number;
  field: 'maxOutput';
}

interface PhaseTokenEntry {
  phase: string;
  modelKey: string;
  tokenKey: string;
}

const PHASE_TOKEN_ENTRIES: readonly PhaseTokenEntry[] = [
  { phase: 'Plan', modelKey: 'llmModelPlan', tokenKey: 'llmMaxOutputTokensPlan' },
  { phase: 'Triage', modelKey: 'llmModelTriage', tokenKey: 'llmMaxOutputTokensTriage' },
  { phase: 'Fast', modelKey: 'llmModelFast', tokenKey: 'llmMaxOutputTokensFast' },
  { phase: 'Reasoning', modelKey: 'llmModelReasoning', tokenKey: 'llmMaxOutputTokensReasoning' },
  { phase: 'Extract', modelKey: 'llmModelExtract', tokenKey: 'llmMaxOutputTokensExtract' },
  { phase: 'Validate', modelKey: 'llmModelValidate', tokenKey: 'llmMaxOutputTokensValidate' },
  { phase: 'Write', modelKey: 'llmModelWrite', tokenKey: 'llmMaxOutputTokensWrite' },
  { phase: 'Plan Fallback', modelKey: 'llmPlanFallbackModel', tokenKey: 'llmMaxOutputTokensPlanFallback' },
  { phase: 'Reasoning Fallback', modelKey: 'llmReasoningFallbackModel', tokenKey: 'llmMaxOutputTokensReasoningFallback' },
  { phase: 'Extract Fallback', modelKey: 'llmExtractFallbackModel', tokenKey: 'llmMaxOutputTokensExtractFallback' },
  { phase: 'Validate Fallback', modelKey: 'llmValidateFallbackModel', tokenKey: 'llmMaxOutputTokensValidateFallback' },
  { phase: 'Write Fallback', modelKey: 'llmWriteFallbackModel', tokenKey: 'llmMaxOutputTokensWriteFallback' },
];

export function validatePhaseTokenLimits(
  draft: Record<string, unknown>,
  registry: LlmProviderEntry[],
): TokenLimitWarning[] {
  const warnings: TokenLimitWarning[] = [];

  for (const entry of PHASE_TOKEN_ENTRIES) {
    const modelId = draft[entry.modelKey];
    const tokenSetting = draft[entry.tokenKey];
    if (typeof modelId !== 'string' || !modelId) continue;
    if (typeof tokenSetting !== 'number' || tokenSetting <= 0) continue;

    const provider = resolveProviderForModel(registry, modelId);
    if (!provider) continue;

    const model = provider.models.find((m) => m.modelId === modelId);
    if (!model || model.maxOutputTokens == null) continue;

    if (tokenSetting > model.maxOutputTokens) {
      warnings.push({
        phase: entry.phase,
        model: modelId,
        setting: tokenSetting,
        limit: model.maxOutputTokens,
        field: 'maxOutput',
      });
    }
  }

  return warnings;
}
