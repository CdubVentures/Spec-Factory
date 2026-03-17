import { parseRuntimeLlmTokenCap } from './runtimeSettingsDomain';
import { normalizeToken, type RuntimeDraft } from './RuntimeFlowDraftContracts';

export interface RuntimeSettingsLlmConfigResponse {
  model_options?: string[];
  token_defaults?: {
    plan?: number;
  };
  token_presets?: number[];
  model_token_profiles?: Array<{
    model: string;
    default_output_tokens?: number;
    max_output_tokens?: number;
  }>;
}

interface DeriveRuntimeLlmModelOptionsParams {
  indexingLlmConfig: RuntimeSettingsLlmConfigResponse | undefined;
  llmModelPlan: string;
  llmModelTriage: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
}

export function deriveRuntimeLlmModelOptions({
  indexingLlmConfig,
  llmModelPlan,
  llmModelTriage,
  llmModelFast,
  llmModelReasoning,
  llmModelExtract,
  llmModelValidate,
  llmModelWrite,
}: DeriveRuntimeLlmModelOptionsParams): string[] {
  const options = Array.isArray(indexingLlmConfig?.model_options)
    ? indexingLlmConfig.model_options.map((row) => String(row || '').trim()).filter(Boolean)
    : [];
  const seeded = [
    ...options,
    llmModelPlan,
    llmModelTriage,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
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
  llmMaxOutputTokensTriage: number;
  llmMaxOutputTokensFast: number;
  llmMaxOutputTokensReasoning: number;
  llmMaxOutputTokensExtract: number;
  llmMaxOutputTokensValidate: number;
  llmMaxOutputTokensWrite: number;
  llmMaxOutputTokensPlanFallback: number;
  llmMaxOutputTokensReasoningFallback: number;
  llmMaxOutputTokensExtractFallback: number;
  llmMaxOutputTokensValidateFallback: number;
  llmMaxOutputTokensWriteFallback: number;
  runtimeManifestDefaults: RuntimeDraft;
}

export function deriveRuntimeLlmTokenPresetOptions({
  indexingLlmConfig,
  llmMaxOutputTokensPlan,
  llmMaxOutputTokensTriage,
  llmMaxOutputTokensFast,
  llmMaxOutputTokensReasoning,
  llmMaxOutputTokensExtract,
  llmMaxOutputTokensValidate,
  llmMaxOutputTokensWrite,
  llmMaxOutputTokensPlanFallback,
  llmMaxOutputTokensReasoningFallback,
  llmMaxOutputTokensExtractFallback,
  llmMaxOutputTokensValidateFallback,
  llmMaxOutputTokensWriteFallback,
  runtimeManifestDefaults,
}: DeriveRuntimeLlmTokenPresetOptionsParams): number[] {
  const seeded = [
    ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
    llmMaxOutputTokensPlan,
    llmMaxOutputTokensTriage,
    llmMaxOutputTokensFast,
    llmMaxOutputTokensReasoning,
    llmMaxOutputTokensExtract,
    llmMaxOutputTokensValidate,
    llmMaxOutputTokensWrite,
    llmMaxOutputTokensPlanFallback,
    llmMaxOutputTokensReasoningFallback,
    llmMaxOutputTokensExtractFallback,
    llmMaxOutputTokensValidateFallback,
    llmMaxOutputTokensWriteFallback,
    runtimeManifestDefaults.llmMaxOutputTokensPlan,
    runtimeManifestDefaults.llmMaxOutputTokensTriage,
    runtimeManifestDefaults.llmMaxOutputTokensFast,
    runtimeManifestDefaults.llmMaxOutputTokensReasoning,
    runtimeManifestDefaults.llmMaxOutputTokensExtract,
    runtimeManifestDefaults.llmMaxOutputTokensValidate,
    runtimeManifestDefaults.llmMaxOutputTokensWrite,
    runtimeManifestDefaults.llmMaxOutputTokensPlanFallback,
    runtimeManifestDefaults.llmMaxOutputTokensReasoningFallback,
    runtimeManifestDefaults.llmMaxOutputTokensExtractFallback,
    runtimeManifestDefaults.llmMaxOutputTokensValidateFallback,
    runtimeManifestDefaults.llmMaxOutputTokensWriteFallback,
  ];
  const cleaned = seeded
    .map((row) => parseRuntimeLlmTokenCap(row))
    .filter((row): row is number => row !== null)
    .sort((a, b) => a - b);
  return [...new Set(cleaned)];
}

