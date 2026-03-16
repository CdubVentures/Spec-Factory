import { parseRuntimeLlmTokenCap } from '../../pipeline-settings/state/runtimeSettingsDomain';
import { normalizeToken, providerFromModelToken } from '../helpers';
import type { IndexingLlmConfigResponse } from '../types';

const FALLBACK_BOOTSTRAP_MODEL = 'gemini-2.5-flash-lite';

export type ModelPricingLookup = Map<string, {
  provider?: string;
  input_per_1m?: number;
  output_per_1m?: number;
  cached_input_per_1m?: number;
}>;

export interface LlmPricingRow {
  knob: string;
  knob_key: string;
  model: string;
  default_model: string | null;
  uses_default_model: boolean;
  default_token_cap: number | null;
  uses_default_token_cap: boolean;
  provider: string;
  token_cap: number;
  input_per_1m: number;
  output_per_1m: number;
  cached_input_per_1m: number;
}

export interface LlmTokenDefaults {
  default_output_tokens: number;
  max_output_tokens: number;
}

interface LlmTokenPresetBootstrap {
  llmTokensPlan: number | string;
  llmTokensTriage: number | string;
  llmTokensFast: number | string;
  llmTokensReasoning: number | string;
  llmTokensExtract: number | string;
  llmTokensValidate: number | string;
  llmTokensWrite: number | string;
  llmTokensPlanFallback: number | string;
  llmTokensExtractFallback: number | string;
  llmTokensValidateFallback: number | string;
  llmTokensWriteFallback: number | string;
}

interface LlmModelOptionsWithCurrentInput {
  llmModelOptions: string[];
  phase2LlmModel: string;
  phase3LlmModel: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
}

interface SelectedLlmPricingRowsInput {
  phase2LlmModel: string;
  phase3LlmModel: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
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
  modelPricingLookup: ModelPricingLookup;
  indexingLlmConfig: IndexingLlmConfigResponse | undefined;
}

export function deriveLlmModelOptions(indexingLlmConfig: IndexingLlmConfigResponse | undefined): string[] {
  const rows = Array.isArray(indexingLlmConfig?.model_options)
    ? indexingLlmConfig.model_options.map((row) => String(row || '').trim()).filter(Boolean)
    : [];
  if (!rows.some((row) => normalizeToken(row) === normalizeToken(FALLBACK_BOOTSTRAP_MODEL))) {
    rows.unshift(FALLBACK_BOOTSTRAP_MODEL);
  }
  return [...new Set(rows)];
}

export function deriveLlmModelOptionsWithCurrent(input: LlmModelOptionsWithCurrentInput): string[] {
  const seeded = [
    ...input.llmModelOptions,
    input.phase2LlmModel,
    input.phase3LlmModel,
    input.llmModelFast,
    input.llmModelReasoning,
    input.llmModelExtract,
    input.llmModelValidate,
    input.llmModelWrite,
  ];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const model of seeded) {
    const token = String(model || '').trim();
    if (!token) continue;
    const normalized = normalizeToken(token);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(token);
  }
  return deduped;
}

export function deriveLlmTokenPresetFallbackOptions(runtimeSettingsBootstrap: LlmTokenPresetBootstrap): number[] {
  const seeded = [
    runtimeSettingsBootstrap.llmTokensPlan,
    runtimeSettingsBootstrap.llmTokensTriage,
    runtimeSettingsBootstrap.llmTokensFast,
    runtimeSettingsBootstrap.llmTokensReasoning,
    runtimeSettingsBootstrap.llmTokensExtract,
    runtimeSettingsBootstrap.llmTokensValidate,
    runtimeSettingsBootstrap.llmTokensWrite,
    runtimeSettingsBootstrap.llmTokensPlanFallback,
    runtimeSettingsBootstrap.llmTokensExtractFallback,
    runtimeSettingsBootstrap.llmTokensValidateFallback,
    runtimeSettingsBootstrap.llmTokensWriteFallback,
  ];
  const cleaned = seeded
    .map((value) => parseRuntimeLlmTokenCap(value))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  return [...new Set(cleaned)];
}

export function deriveLlmTokenPresetOptions(
  indexingLlmConfig: IndexingLlmConfigResponse | undefined,
  llmTokenPresetFallbackOptions: number[],
  llmTokensPlanFallback: number
): number[] {
  const fallbackPresets = llmTokenPresetFallbackOptions.length > 0
    ? llmTokenPresetFallbackOptions
    : [llmTokensPlanFallback];
  const raw = Array.isArray(indexingLlmConfig?.token_presets)
    ? indexingLlmConfig.token_presets
    : fallbackPresets;
  const cleaned = raw
    .map((value) => parseRuntimeLlmTokenCap(value))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  return [...new Set(cleaned)];
}

export function deriveLlmTokenProfileLookup(indexingLlmConfig: IndexingLlmConfigResponse | undefined) {
  const map = new Map<string, LlmTokenDefaults>();
  for (const row of indexingLlmConfig?.model_token_profiles || []) {
    const token = normalizeToken(row.model);
    if (!token) continue;
    map.set(token, {
      default_output_tokens: parseRuntimeLlmTokenCap(row.default_output_tokens) || 0,
      max_output_tokens: parseRuntimeLlmTokenCap(row.max_output_tokens) || 0,
    });
  }
  return map;
}

export function deriveModelTokenDefaults(options: {
  model: string;
  llmTokenProfileLookup: Map<string, LlmTokenDefaults>;
  indexingLlmConfig: IndexingLlmConfigResponse | undefined;
  llmTokenPresetOptions: number[];
  llmTokensPlanFallback: number;
  llmMinOutputTokens: number;
}): LlmTokenDefaults {
  const profile = options.llmTokenProfileLookup.get(normalizeToken(options.model));
  const defaultFromConfig = parseRuntimeLlmTokenCap(options.indexingLlmConfig?.token_defaults?.plan);
  const fallbackDefault = options.llmTokenPresetOptions[0] || options.llmTokensPlanFallback;
  const globalDefault = defaultFromConfig || parseRuntimeLlmTokenCap(fallbackDefault) || options.llmMinOutputTokens;
  const fallbackMaxOutputTokens = options.llmTokenPresetOptions[options.llmTokenPresetOptions.length - 1] || globalDefault;
  const default_output_tokens = parseRuntimeLlmTokenCap(profile?.default_output_tokens) || globalDefault;
  const max_output_tokens = Math.max(
    default_output_tokens,
    parseRuntimeLlmTokenCap(profile?.max_output_tokens)
    || parseRuntimeLlmTokenCap(fallbackMaxOutputTokens)
    || default_output_tokens,
  );
  return {
    default_output_tokens,
    max_output_tokens,
  };
}

export function deriveSelectedLlmPricingRows(input: SelectedLlmPricingRowsInput): LlmPricingRow[] {
  const entries = [
    { knob: 'phase 02 planner', knob_key: 'phase_02_planner', model: input.phase2LlmModel, token_cap: input.llmTokensPlan },
    { knob: 'phase 03 triage', knob_key: 'phase_03_triage', model: input.phase3LlmModel, token_cap: input.llmTokensTriage },
    { knob: 'fast pass', knob_key: 'fast_pass', model: input.llmModelFast, token_cap: input.llmTokensFast },
    { knob: 'reasoning pass', knob_key: 'reasoning_pass', model: input.llmModelReasoning, token_cap: input.llmTokensReasoning },
    { knob: 'extract role', knob_key: 'extract_role', model: input.llmModelExtract, token_cap: input.llmTokensExtract },
    { knob: 'validate role', knob_key: 'validate_role', model: input.llmModelValidate, token_cap: input.llmTokensValidate },
    { knob: 'write role', knob_key: 'write_role', model: input.llmModelWrite, token_cap: input.llmTokensWrite },
  ];
  const knobDefaults = input.indexingLlmConfig?.knob_defaults || {};
  return entries
    .map((row) => {
      const model = String(row.model || '').trim();
      if (!model) return null;
      const pricing = input.modelPricingLookup.get(normalizeToken(model));
      const defaults = input.indexingLlmConfig?.pricing_defaults || {};
      const knobDefault = knobDefaults[row.knob_key] || {};
      const defaultModel = String(knobDefault.model || '').trim();
      const defaultTokenCap = Math.max(0, Number(knobDefault.token_cap || 0));
      const usesDefaultModel = defaultModel
        ? normalizeToken(defaultModel) === normalizeToken(model)
        : false;
      const usesDefaultTokenCap = defaultTokenCap > 0
        ? defaultTokenCap === Math.max(0, Number(row.token_cap || 0))
        : false;
      return {
        knob: row.knob,
        knob_key: row.knob_key,
        model,
        default_model: defaultModel || null,
        uses_default_model: usesDefaultModel,
        default_token_cap: defaultTokenCap || null,
        uses_default_token_cap: usesDefaultTokenCap,
        provider: pricing?.provider || providerFromModelToken(model),
        token_cap: Math.max(0, Number(row.token_cap || 0)),
        input_per_1m: Number(pricing?.input_per_1m ?? defaults.input_per_1m ?? 0),
        output_per_1m: Number(pricing?.output_per_1m ?? defaults.output_per_1m ?? 0),
        cached_input_per_1m: Number(pricing?.cached_input_per_1m ?? defaults.cached_input_per_1m ?? 0),
      };
    })
    .filter((row): row is LlmPricingRow => Boolean(row));
}
