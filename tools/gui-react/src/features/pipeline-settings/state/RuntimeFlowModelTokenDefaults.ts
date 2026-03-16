import { LLM_SETTING_LIMITS } from '../../../stores/settingsManifest';
import {
  parseRuntimeLlmTokenCap,
  type RuntimeModelTokenDefaultsResolver,
} from './runtimeSettingsDomain';
import { normalizeToken, type RuntimeDraft } from './RuntimeFlowDraftContracts';
import type { RuntimeSettingsLlmConfigResponse } from './RuntimeFlowModelTokenOptions';

interface RuntimeLlmTokenProfile {
  default_output_tokens: number;
  max_output_tokens: number;
}

export type RuntimeLlmTokenProfileLookup = Map<string, RuntimeLlmTokenProfile>;

interface BuildRuntimeLlmTokenProfileLookupParams {
  indexingLlmConfig: RuntimeSettingsLlmConfigResponse | undefined;
}

export function buildRuntimeLlmTokenProfileLookup({
  indexingLlmConfig,
}: BuildRuntimeLlmTokenProfileLookupParams): RuntimeLlmTokenProfileLookup {
  const lookup = new Map<string, RuntimeLlmTokenProfile>();
  for (const row of indexingLlmConfig?.model_token_profiles || []) {
    const token = normalizeToken(row.model);
    if (!token) continue;
    lookup.set(token, {
      default_output_tokens: parseRuntimeLlmTokenCap(row.default_output_tokens) || 0,
      max_output_tokens: parseRuntimeLlmTokenCap(row.max_output_tokens) || 0,
    });
  }
  return lookup;
}

interface DeriveRuntimeLlmTokenContractPresetMaxParams {
  indexingLlmConfig: RuntimeSettingsLlmConfigResponse | undefined;
  runtimeManifestDefaults: RuntimeDraft;
}

export function deriveRuntimeLlmTokenContractPresetMax({
  indexingLlmConfig,
  runtimeManifestDefaults,
}: DeriveRuntimeLlmTokenContractPresetMaxParams): number {
  const seeded = [
    ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
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
  return cleaned[cleaned.length - 1] || runtimeManifestDefaults.llmTokensPlan;
}

interface CreateRuntimeModelTokenDefaultsResolverParams {
  indexingLlmConfig: RuntimeSettingsLlmConfigResponse | undefined;
  llmTokenProfileLookup: RuntimeLlmTokenProfileLookup;
  llmTokenContractPresetMax: number;
  runtimeManifestDefaults: RuntimeDraft;
}

export function createRuntimeModelTokenDefaultsResolver({
  indexingLlmConfig,
  llmTokenProfileLookup,
  llmTokenContractPresetMax,
  runtimeManifestDefaults,
}: CreateRuntimeModelTokenDefaultsResolverParams): RuntimeModelTokenDefaultsResolver {
  return (model: string) => {
    const profile = llmTokenProfileLookup.get(normalizeToken(model));
    const defaultFromConfig = parseRuntimeLlmTokenCap(indexingLlmConfig?.token_defaults?.plan);
    const fallbackDefault = runtimeManifestDefaults.llmTokensPlan;
    const globalDefault = defaultFromConfig
      || parseRuntimeLlmTokenCap(fallbackDefault)
      || LLM_SETTING_LIMITS.maxTokens.min;
    const fallbackMax = llmTokenContractPresetMax || globalDefault;
    const default_output_tokens = parseRuntimeLlmTokenCap(profile?.default_output_tokens) || globalDefault;
    const max_output_tokens = Math.max(
      default_output_tokens,
      parseRuntimeLlmTokenCap(profile?.max_output_tokens)
      || parseRuntimeLlmTokenCap(fallbackMax)
      || default_output_tokens,
    );
    return { default_output_tokens, max_output_tokens };
  };
}

