import { parseRuntimeLlmTokenCap } from './runtimeSettingsDomain';
import { normalizeToken, type RuntimeDraft } from './RuntimeFlowDraftContracts';

// WHY: Single canonical contract — no local duplicates.
import type { IndexingLlmConfigResponse } from '../../indexing/types.ts';
export type { IndexingLlmConfigResponse as RuntimeSettingsLlmConfigResponse };
type RuntimeSettingsLlmConfigResponse = IndexingLlmConfigResponse;

interface DeriveRuntimeLlmModelOptionsParams {
  indexingLlmConfig: RuntimeSettingsLlmConfigResponse | undefined;
  llmModelPlan: string;
  llmModelReasoning: string;
}

export function deriveRuntimeLlmModelOptions({
  indexingLlmConfig,
  llmModelPlan,
  llmModelReasoning,
}: DeriveRuntimeLlmModelOptionsParams): string[] {
  const options = Array.isArray(indexingLlmConfig?.model_options)
    ? indexingLlmConfig.model_options.map((row) => String(row || '').trim()).filter(Boolean)
    : [];
  const seeded = [
    ...options,
    llmModelPlan,
    llmModelReasoning,
  ];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const row of seeded) {
    const token = String(row || '').trim();
    if (!token) continue;
    const normalized = normalizeToken(token);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(token);
  }
  return deduped;
}

interface DeriveRuntimeLlmTokenPresetOptionsParams {
  indexingLlmConfig: RuntimeSettingsLlmConfigResponse | undefined;
  llmMaxOutputTokensPlan: number;
  llmMaxOutputTokensReasoning: number;
  llmMaxOutputTokensPlanFallback: number;
  llmMaxOutputTokensReasoningFallback: number;
  runtimeManifestDefaults: RuntimeDraft;
}

export function deriveRuntimeLlmTokenPresetOptions({
  indexingLlmConfig,
  llmMaxOutputTokensPlan,
  llmMaxOutputTokensReasoning,
  llmMaxOutputTokensPlanFallback,
  llmMaxOutputTokensReasoningFallback,
  runtimeManifestDefaults,
}: DeriveRuntimeLlmTokenPresetOptionsParams): number[] {
  const seeded = [
    ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
    llmMaxOutputTokensPlan,
    llmMaxOutputTokensReasoning,
    llmMaxOutputTokensPlanFallback,
    llmMaxOutputTokensReasoningFallback,
    runtimeManifestDefaults.llmMaxOutputTokensPlan,
    runtimeManifestDefaults.llmMaxOutputTokensReasoning,
    runtimeManifestDefaults.llmMaxOutputTokensPlanFallback,
    runtimeManifestDefaults.llmMaxOutputTokensReasoningFallback,
  ];
  const cleaned = seeded
    .map((row) => parseRuntimeLlmTokenCap(row))
    .filter((row): row is number => row !== null)
    .sort((a, b) => a - b);
  return [...new Set(cleaned)];
}
