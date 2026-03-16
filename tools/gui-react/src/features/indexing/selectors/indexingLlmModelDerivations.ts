import { useCallback, useMemo } from 'react';
import { clampTokenForModel as clampRuntimeTokenForModel } from '../../pipeline-settings/state/runtimeSettingsDomain';
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
  llmTokensPlan: string | number | boolean;
  llmTokensTriage: string | number | boolean;
  llmTokensFast: string | number | boolean;
  llmTokensReasoning: string | number | boolean;
  llmTokensExtract: string | number | boolean;
  llmTokensValidate: string | number | boolean;
  llmTokensWrite: string | number | boolean;
  llmTokensPlanFallback: string | number | boolean;
  llmTokensExtractFallback: string | number | boolean;
  llmTokensValidateFallback: string | number | boolean;
  llmTokensWriteFallback: string | number | boolean;
}

interface UseIndexingLlmModelDerivationsInput {
  indexingLlmConfig: IndexingLlmConfigResponse | undefined;
  runtimeSettingsBootstrap: LlmTokenPresetBootstrapLike;
  phase2LlmModel: string;
  phase3LlmModel: string;
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
    phase2LlmModel,
    phase3LlmModel,
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

  const llmTokensPlanBootstrap = Number(runtimeSettingsBootstrap.llmTokensPlan || 0);

  const llmModelOptionsWithCurrent = useMemo(
    () => deriveLlmModelOptionsWithCurrent({
      llmModelOptions,
      phase2LlmModel,
      phase3LlmModel,
      llmModelFast,
      llmModelReasoning,
      llmModelExtract,
      llmModelValidate,
      llmModelWrite,
    }),
    [
      llmModelOptions,
      phase2LlmModel,
      phase3LlmModel,
      llmModelFast,
      llmModelReasoning,
      llmModelExtract,
      llmModelValidate,
      llmModelWrite,
    ],
  );

  const llmTokenPresetFallbackOptions = useMemo(
    () => deriveLlmTokenPresetFallbackOptions({
      llmTokensPlan: Number(runtimeSettingsBootstrap.llmTokensPlan || 0),
      llmTokensTriage: Number(runtimeSettingsBootstrap.llmTokensTriage || 0),
      llmTokensFast: Number(runtimeSettingsBootstrap.llmTokensFast || 0),
      llmTokensReasoning: Number(runtimeSettingsBootstrap.llmTokensReasoning || 0),
      llmTokensExtract: Number(runtimeSettingsBootstrap.llmTokensExtract || 0),
      llmTokensValidate: Number(runtimeSettingsBootstrap.llmTokensValidate || 0),
      llmTokensWrite: Number(runtimeSettingsBootstrap.llmTokensWrite || 0),
      llmTokensPlanFallback: Number(runtimeSettingsBootstrap.llmTokensPlanFallback || 0),
      llmTokensExtractFallback: Number(runtimeSettingsBootstrap.llmTokensExtractFallback || 0),
      llmTokensValidateFallback: Number(runtimeSettingsBootstrap.llmTokensValidateFallback || 0),
      llmTokensWriteFallback: Number(runtimeSettingsBootstrap.llmTokensWriteFallback || 0),
    }),
    [
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
      llmTokensPlanFallback: llmTokensPlanBootstrap,
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
