import { useCallback, useMemo } from 'react';
import { clampTokenForModel as clampRuntimeTokenForModel } from '../../pipeline-settings';
import { LLM_SETTING_LIMITS } from '../../../stores/settingsManifest';
import {
  deriveLlmModelOptions,
  deriveLlmModelOptionsWithCurrent,
  deriveLlmTokenPresetFallbackOptions,
  deriveLlmTokenPresetOptions,
  deriveLlmTokenProfileLookup,
  deriveModelTokenDefaults,
} from './indexingLlmConfigSelectors';
import type { IndexingLlmConfigResponse } from '../types';

const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;

interface LlmTokenPresetBootstrapLike {
  llmMaxOutputTokensPlan: string | number | boolean;
  llmMaxOutputTokensTriage: string | number | boolean;
  llmMaxOutputTokensFast: string | number | boolean;
  llmMaxOutputTokensReasoning: string | number | boolean;
  llmMaxOutputTokensExtract: string | number | boolean;
  llmMaxOutputTokensValidate: string | number | boolean;
  llmMaxOutputTokensWrite: string | number | boolean;
  llmMaxOutputTokensPlanFallback: string | number | boolean;
  llmMaxOutputTokensExtractFallback: string | number | boolean;
  llmMaxOutputTokensValidateFallback: string | number | boolean;
  llmMaxOutputTokensWriteFallback: string | number | boolean;
}

interface UseIndexingLlmModelDerivationsInput {
  indexingLlmConfig: IndexingLlmConfigResponse | undefined;
  runtimeSettingsBootstrap: LlmTokenPresetBootstrapLike;
  llmModelPlan: string;
  llmModelTriage: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
}

export function useIndexingLlmModelDerivations(input: UseIndexingLlmModelDerivationsInput) {
  const {
    indexingLlmConfig,
    runtimeSettingsBootstrap,
    llmModelPlan,
    llmModelTriage,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
  } = input;

  const llmModelOptions = useMemo(
    () => deriveLlmModelOptions(indexingLlmConfig),
    [indexingLlmConfig],
  );

  const llmTokensPlanBootstrap = Number(runtimeSettingsBootstrap.llmMaxOutputTokensPlan || 0);

  const llmModelOptionsWithCurrent = useMemo(
    () => deriveLlmModelOptionsWithCurrent({
      llmModelOptions,
      llmModelPlan,
      llmModelTriage,
      llmModelFast,
      llmModelReasoning,
      llmModelExtract,
      llmModelValidate,
      llmModelWrite,
    }),
    [
      llmModelOptions,
      llmModelPlan,
      llmModelTriage,
      llmModelFast,
      llmModelReasoning,
      llmModelExtract,
      llmModelValidate,
      llmModelWrite,
    ],
  );

  const llmTokenPresetFallbackOptions = useMemo(
    () => deriveLlmTokenPresetFallbackOptions({
      llmMaxOutputTokensPlan: Number(runtimeSettingsBootstrap.llmMaxOutputTokensPlan || 0),
      llmMaxOutputTokensTriage: Number(runtimeSettingsBootstrap.llmMaxOutputTokensTriage || 0),
      llmMaxOutputTokensFast: Number(runtimeSettingsBootstrap.llmMaxOutputTokensFast || 0),
      llmMaxOutputTokensReasoning: Number(runtimeSettingsBootstrap.llmMaxOutputTokensReasoning || 0),
      llmMaxOutputTokensExtract: Number(runtimeSettingsBootstrap.llmMaxOutputTokensExtract || 0),
      llmMaxOutputTokensValidate: Number(runtimeSettingsBootstrap.llmMaxOutputTokensValidate || 0),
      llmMaxOutputTokensWrite: Number(runtimeSettingsBootstrap.llmMaxOutputTokensWrite || 0),
      llmMaxOutputTokensPlanFallback: Number(runtimeSettingsBootstrap.llmMaxOutputTokensPlanFallback || 0),
      llmMaxOutputTokensExtractFallback: Number(runtimeSettingsBootstrap.llmMaxOutputTokensExtractFallback || 0),
      llmMaxOutputTokensValidateFallback: Number(runtimeSettingsBootstrap.llmMaxOutputTokensValidateFallback || 0),
      llmMaxOutputTokensWriteFallback: Number(runtimeSettingsBootstrap.llmMaxOutputTokensWriteFallback || 0),
    }),
    [
      runtimeSettingsBootstrap.llmMaxOutputTokensPlan,
      runtimeSettingsBootstrap.llmMaxOutputTokensTriage,
      runtimeSettingsBootstrap.llmMaxOutputTokensFast,
      runtimeSettingsBootstrap.llmMaxOutputTokensReasoning,
      runtimeSettingsBootstrap.llmMaxOutputTokensExtract,
      runtimeSettingsBootstrap.llmMaxOutputTokensValidate,
      runtimeSettingsBootstrap.llmMaxOutputTokensWrite,
      runtimeSettingsBootstrap.llmMaxOutputTokensPlanFallback,
      runtimeSettingsBootstrap.llmMaxOutputTokensExtractFallback,
      runtimeSettingsBootstrap.llmMaxOutputTokensValidateFallback,
      runtimeSettingsBootstrap.llmMaxOutputTokensWriteFallback,
    ],
  );

  const llmTokenPresetOptions = useMemo(
    () => deriveLlmTokenPresetOptions(
      indexingLlmConfig,
      llmTokenPresetFallbackOptions,
      llmTokensPlanBootstrap,
    ),
    [indexingLlmConfig, llmTokenPresetFallbackOptions, llmTokensPlanBootstrap],
  );

  const llmTokenProfileLookup = useMemo(
    () => deriveLlmTokenProfileLookup(indexingLlmConfig),
    [indexingLlmConfig],
  );

  const resolveModelTokenDefaults = useCallback(
    (model: string) => deriveModelTokenDefaults({
      model,
      llmTokenProfileLookup,
      indexingLlmConfig,
      llmTokenPresetOptions,
      llmMaxOutputTokensPlanFallback: llmTokensPlanBootstrap,
      llmMinOutputTokens: LLM_MIN_OUTPUT_TOKENS,
    }),
    [
      llmTokenProfileLookup,
      indexingLlmConfig,
      llmTokenPresetOptions,
      llmTokensPlanBootstrap,
    ],
  );

  const clampTokenForModel = useCallback(
    (model: string, value: number) => clampRuntimeTokenForModel(model, value, resolveModelTokenDefaults),
    [resolveModelTokenDefaults],
  );

  return {
    llmModelOptionsWithCurrent,
    llmTokenPresetFallbackOptions,
    llmTokenPresetOptions,
    resolveModelTokenDefaults,
    clampTokenForModel,
  };
}
