import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import { resolveProviderForModel, parseModelKey } from './llmProviderRegistryBridge.ts';
import { LLM_TOKEN_VALIDATION_ENTRIES } from './llmModelRoleRegistry.ts';

export interface TokenLimitWarning {
  phase: string;
  model: string;
  setting: number;
  limit: number;
  field: 'maxOutput' | 'contextOverflow';
}

export function validatePhaseTokenLimits(
  draft: Record<string, unknown>,
  registry: LlmProviderEntry[],
): TokenLimitWarning[] {
  const warnings: TokenLimitWarning[] = [];

  for (const entry of LLM_TOKEN_VALIDATION_ENTRIES) {
    const modelId = draft[entry.modelKey];
    const tokenSetting = draft[entry.tokenKey];
    if (typeof modelId !== 'string' || !modelId) continue;
    if (typeof tokenSetting !== 'number' || tokenSetting <= 0) continue;

    const provider = resolveProviderForModel(registry, modelId);
    if (!provider) continue;

    const { modelId: bareId } = parseModelKey(modelId);
    const model = provider.models.find((m) => m.modelId === bareId);
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

    if (model.maxContextTokens != null && tokenSetting > model.maxContextTokens * 0.5) {
      warnings.push({
        phase: entry.phase,
        model: modelId,
        setting: tokenSetting,
        limit: model.maxContextTokens,
        field: 'contextOverflow',
      });
    }
  }

  return warnings;
}
