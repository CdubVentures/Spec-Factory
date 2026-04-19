import { useCallback, useMemo } from 'react';
import { clampTokenForModel as clampRuntimeTokenForModel } from '../../pipeline-settings/index.ts';
import { LLM_SETTING_LIMITS } from '../../../stores/settingsManifest.ts';
import {
  deriveLlmModelOptions,
  deriveLlmModelOptionsWithCurrent,
  deriveLlmTokenPresetFallbackOptions,
  deriveLlmTokenPresetOptions,
  deriveLlmTokenProfileLookup,
  deriveModelTokenDefaults,
} from './indexingLlmConfigSelectors.ts';
import type { IndexingLlmConfigResponse } from '../types.ts';

const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;

interface LlmTokenPresetBootstrapLike {
  llmMaxOutputTokensPlan: string | number | boolean;
  llmMaxOutputTokensReasoning: string | number | boolean;
}

interface UseIndexingLlmModelDerivationsInput {
  indexingLlmConfig: IndexingLlmConfigResponse | undefined;
  runtimeSettingsBootstrap: LlmTokenPresetBootstrapLike;
  llmModelPlan: string;
  llmModelReasoning: string;
}

export function useIndexingLlmModelDerivations(input: UseIndexingLlmModelDerivationsInput) {
  const {
    indexingLlmConfig,
    runtimeSettingsBootstrap,
    llmModelPlan,
    llmModelReasoning,
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
      llmModelReasoning,
    }),
    [
      llmModelOptions,
      llmModelPlan,
      llmModelReasoning,
    ],
  );

  const llmTokenPresetFallbackOptions = useMemo(
    () => deriveLlmTokenPresetFallbackOptions({
      llmMaxOutputTokensPlan: Number(runtimeSettingsBootstrap.llmMaxOutputTokensPlan || 0),
      llmMaxOutputTokensReasoning: Number(runtimeSettingsBootstrap.llmMaxOutputTokensReasoning || 0),
    }),
    [
      runtimeSettingsBootstrap.llmMaxOutputTokensPlan,
      runtimeSettingsBootstrap.llmMaxOutputTokensReasoning,
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
      llmMaxOutputTokensPlan: llmTokensPlanBootstrap,
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
