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
  phase2LlmModel: string;
  phase3LlmModel: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
}

export function deriveRuntimeLlmModelOptions({
  indexingLlmConfig,
  phase2LlmModel,
  phase3LlmModel,
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
    phase2LlmModel,
    phase3LlmModel,
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
  llmTokensPlan: number;
  llmTokensTriage: number;
  llmTokensFast: number;
  llmTokensReasoning: number;
  llmTokensExtract: number;
  llmTokensValidate: number;
  llmTokensWrite: number;
  llmTokensPlanFallback: number;
  llmTokensExtractFallback: number;
  llmTokensValidateFallback: number;
  llmTokensWriteFallback: number;
  runtimeManifestDefaults: RuntimeDraft;
}

export function deriveRuntimeLlmTokenPresetOptions({
  indexingLlmConfig,
  llmTokensPlan,
  llmTokensTriage,
  llmTokensFast,
  llmTokensReasoning,
  llmTokensExtract,
  llmTokensValidate,
  llmTokensWrite,
  llmTokensPlanFallback,
  llmTokensExtractFallback,
  llmTokensValidateFallback,
  llmTokensWriteFallback,
  runtimeManifestDefaults,
}: DeriveRuntimeLlmTokenPresetOptionsParams): number[] {
  const seeded = [
    ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
    llmTokensPlan,
    llmTokensTriage,
    llmTokensFast,
    llmTokensReasoning,
    llmTokensExtract,
    llmTokensValidate,
    llmTokensWrite,
    llmTokensPlanFallback,
    llmTokensExtractFallback,
    llmTokensValidateFallback,
    llmTokensWriteFallback,
    runtimeManifestDefaults.llmTokensPlan,
    runtimeManifestDefaults.llmTokensTriage,
    runtimeManifestDefaults.llmTokensFast,
    runtimeManifestDefaults.llmTokensReasoning,
    runtimeManifestDefaults.llmTokensExtract,
    runtimeManifestDefaults.llmTokensValidate,
    runtimeManifestDefaults.llmTokensWrite,
    runtimeManifestDefaults.llmTokensPlanFallback,
    runtimeManifestDefaults.llmTokensExtractFallback,
    runtimeManifestDefaults.llmTokensValidateFallback,
    runtimeManifestDefaults.llmTokensWriteFallback,
  ];
  const cleaned = seeded
    .map((row) => parseRuntimeLlmTokenCap(row))
    .filter((row): row is number => row !== null)
    .sort((a, b) => a - b);
  return [...new Set(cleaned)];
}

