import { Suspense, lazy, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import {
  buildRuntimeLlmTokenProfileLookup,

  collectRuntimeFlowDraftPayload,
  createRuntimeModelTokenDefaultsResolver,
  deriveRuntimeLlmModelOptions,
  deriveRuntimeLlmTokenContractPresetMax,
  deriveRuntimeLlmTokenPresetOptions,
  normalizeRuntimeDraft,
  parseBoundedNumber,
  readRuntimeSettingsBootstrap,
  RUNTIME_NUMBER_BOUNDS,
  runtimeDraftEqual,
  toRuntimeDraft,
  useRuntimeSettingsEditorAdapter,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings';
import {
  RUNTIME_SETTING_DEFAULTS,
} from '../../../stores/settingsManifest';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore';
import { useUiStore } from '../../../stores/uiStore';
import { usePersistedTab } from '../../../stores/tabStore';
import { LlmConfigPageShell } from './LlmConfigPageShell';
import { LLM_PHASE_IDS } from '../state/llmPhaseRegistry';
import type { LlmPhaseId } from '../types/llmPhaseTypes';
import { parseProviderRegistry, serializeProviderRegistry } from '../state/llmProviderRegistryBridge';
import { mergeDefaultsIntoRegistry } from '../state/llmDefaultProviderRegistry';
import { parsePhaseOverrides, serializePhaseOverrides } from '../state/llmPhaseOverridesBridge';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes';

const LlmGlobalSection = lazy(async () => {
  const module = await import('../sections/LlmGlobalSection');
  return { default: module.LlmGlobalSection };
});

const LlmPhaseSection = lazy(async () => {
  const module = await import('../sections/LlmPhaseSection');
  return { default: module.LlmPhaseSection };
});

const LlmExtractionSection = lazy(async () => {
  const module = await import('../sections/LlmExtractionSection');
  return { default: module.LlmExtractionSection };
});

interface RuntimeSettingsLlmConfigResponse {
  model_options?: string[];
  token_defaults?: { plan?: number };
  token_presets?: number[];
  model_token_profiles?: Array<{
    model: string;
    default_output_tokens?: number;
    max_output_tokens?: number;
  }>;
  model_pricing?: Array<{
    model: string;
    provider?: string;
    input_per_1m?: number;
    output_per_1m?: number;
    cached_input_per_1m?: number;
  }>;
}

export function LlmConfigPage() {
  const queryClient = useQueryClient();
  const runtimeAutoSaveEnabled = useUiStore((state) => state.runtimeAutoSaveEnabled);
  const runtimeReadyFlag = useSettingsAuthorityStore((state) => state.snapshot.runtimeReady);

  const runtimeBootstrap = useMemo(
    () => readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS),
    [queryClient],
  );
  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  const runtimeBootstrapDraft = useMemo(
    () => normalizeRuntimeDraft(undefined, runtimeBootstrap),
    [runtimeBootstrap],
  );

  const [activePhase, setActivePhase] = usePersistedTab<LlmPhaseId>(
    'llm-config:active-phase',
    'global',
    { validValues: LLM_PHASE_IDS as unknown as readonly LlmPhaseId[] },
  );

  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<RuntimeSettingsLlmConfigResponse>('/indexing/llm-config'),
  });

  const llmTokenProfileLookup = useMemo(() => buildRuntimeLlmTokenProfileLookup({
    indexingLlmConfig,
  }), [indexingLlmConfig]);

  const llmTokenContractPresetMax = useMemo(() => deriveRuntimeLlmTokenContractPresetMax({
    indexingLlmConfig,
    runtimeManifestDefaults,
  }), [indexingLlmConfig, runtimeManifestDefaults]);

  const resolveModelTokenDefaults = useMemo(() => createRuntimeModelTokenDefaultsResolver({
    indexingLlmConfig,
    llmTokenProfileLookup,
    llmTokenContractPresetMax,
    runtimeManifestDefaults,
  }), [indexingLlmConfig, llmTokenContractPresetMax, llmTokenProfileLookup, runtimeManifestDefaults]);

  const payloadFromRuntimeDraft = useCallback((nextRuntimeDraft: RuntimeDraft) => collectRuntimeFlowDraftPayload({
    nextRuntimeDraft,
    runtimeManifestDefaults,
    resolveModelTokenDefaults,
  }), [resolveModelTokenDefaults, runtimeManifestDefaults]);

  const runtimeEditor = useRuntimeSettingsEditorAdapter<RuntimeDraft>({
    bootstrapValues: runtimeBootstrapDraft,
    payloadFromValues: payloadFromRuntimeDraft,
    normalizeSnapshot: (snapshot) => normalizeRuntimeDraft(snapshot, runtimeBootstrap),
    valuesEqual: runtimeDraftEqual,
    autoSaveEnabled: runtimeAutoSaveEnabled,
  });

  const runtimeDraft = runtimeEditor.values;
  const setRuntimeDraft = runtimeEditor.setValues;
  const setRuntimeDirty = runtimeEditor.setDirty;
  const runtimeSettingsLoading = runtimeEditor.isLoading;
  const runtimeSettingsSaving = runtimeEditor.isSaving;
  const saveNow = runtimeEditor.saveNow;
  const runtimeSaveState = runtimeEditor.saveStatus.kind;

  const {
    llmModelPlan,
    llmModelTriage,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
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
  } = runtimeDraft;

  const llmModelOptions = useMemo(() => deriveRuntimeLlmModelOptions({
    indexingLlmConfig,
    llmModelPlan,
    llmModelTriage,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
  }), [
    indexingLlmConfig,
    llmModelPlan,
    llmModelTriage,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
  ]);

  const llmTokenPresetOptions = useMemo(() => deriveRuntimeLlmTokenPresetOptions({
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
  }), [
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
  ]);

  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;

  const updateDraft = useCallback(<K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => {
    setRuntimeDraft((previous) => ({ ...previous, [key]: value }));
    setRuntimeDirty(true);
  }, [setRuntimeDraft, setRuntimeDirty]);

  const onNumberChange = useCallback(<K extends keyof RuntimeDraft>(
    key: K,
    eventValue: string,
    bounds: NumberBound,
  ) => {
    setRuntimeDraft((previous) => {
      const current = previous[key];
      const fallback = typeof current === 'number' ? current : 0;
      const next = parseBoundedNumber(eventValue, fallback, bounds) as RuntimeDraft[K];
      return { ...previous, [key]: next };
    });
    setRuntimeDirty(true);
  }, [setRuntimeDraft, setRuntimeDirty]);

  const getNumberBounds = useCallback(<K extends keyof RuntimeDraft>(key: K): NumberBound => {
    return RUNTIME_NUMBER_BOUNDS[key as keyof typeof RUNTIME_NUMBER_BOUNDS];
  }, []);

  function renderTokenOptions(model: string, prefix: string) {
    const cap = resolveModelTokenDefaults(model).max_output_tokens;
    return llmTokenPresetOptions.map((token) => {
      const disabled = token > cap;
      return (
        <option key={`${prefix}:${token}`} value={token} disabled={disabled}>
          {token}
          {disabled ? ' (model max)' : ''}
        </option>
      );
    });
  }

  /* --- Provider Registry bridge --- */
  const defaultRegistry = useMemo(
    () => parseProviderRegistry(RUNTIME_SETTING_DEFAULTS.llmProviderRegistryJson),
    [],
  );
  const ENV_KEY_MAP: Record<string, keyof typeof runtimeDraft> = {
    'default-gemini': 'geminiApiKey',
    'default-deepseek': 'deepseekApiKey',
    'default-anthropic': 'anthropicApiKey',
    'default-openai': 'openaiApiKey',
  };

  const registry: LlmProviderEntry[] = useMemo(() => {
    const merged = mergeDefaultsIntoRegistry(
      parseProviderRegistry(runtimeDraft.llmProviderRegistryJson),
      defaultRegistry,
    );
    // Seed env-var API keys into default providers when stored key is empty
    return merged.map((provider) => {
      const envField = ENV_KEY_MAP[provider.id];
      if (!envField || provider.apiKey) return provider;
      const envValue = runtimeDraft[envField];
      if (!envValue) {
        // Fallback: Gemini can use llmPlanApiKey
        if (provider.id === 'default-gemini' && runtimeDraft.llmPlanApiKey) {
          return { ...provider, apiKey: runtimeDraft.llmPlanApiKey as string };
        }
        return provider;
      }
      return { ...provider, apiKey: envValue as string };
    });
  }, [
    runtimeDraft.llmProviderRegistryJson,
    runtimeDraft.geminiApiKey,
    runtimeDraft.deepseekApiKey,
    runtimeDraft.anthropicApiKey,
    runtimeDraft.openaiApiKey,
    runtimeDraft.llmPlanApiKey,
    defaultRegistry,
  ]);

  const onRegistryChange = useCallback((nextRegistry: LlmProviderEntry[]) => {
    const serialized = serializeProviderRegistry(nextRegistry);
    setRuntimeDraft((previous) => ({ ...previous, llmProviderRegistryJson: serialized }));
    setRuntimeDirty(true);
  }, [setRuntimeDraft, setRuntimeDirty]);

  /* --- Phase Overrides bridge --- */
  const phaseOverrides: LlmPhaseOverrides = useMemo(
    () => parsePhaseOverrides(runtimeDraft.llmPhaseOverridesJson),
    [runtimeDraft.llmPhaseOverridesJson],
  );

  const onPhaseOverrideChange = useCallback((nextOverrides: LlmPhaseOverrides) => {
    const serialized = serializePhaseOverrides(nextOverrides);
    setRuntimeDraft((previous) => ({ ...previous, llmPhaseOverridesJson: serialized }));
    setRuntimeDirty(true);
  }, [setRuntimeDraft, setRuntimeDirty]);

  const globalDraft = useMemo(() => ({
    llmModelPlan: runtimeDraft.llmModelPlan,
    llmModelTriage: runtimeDraft.llmModelTriage,
    llmModelReasoning: runtimeDraft.llmModelReasoning,
    llmPlanUseReasoning: runtimeDraft.llmPlanUseReasoning,
    llmTriageUseReasoning: runtimeDraft.llmTriageUseReasoning,
    llmMaxOutputTokensPlan: runtimeDraft.llmMaxOutputTokensPlan,
    llmMaxOutputTokensTriage: runtimeDraft.llmMaxOutputTokensTriage,
  }), [
    runtimeDraft.llmModelPlan,
    runtimeDraft.llmModelTriage,
    runtimeDraft.llmModelReasoning,
    runtimeDraft.llmPlanUseReasoning,
    runtimeDraft.llmTriageUseReasoning,
    runtimeDraft.llmMaxOutputTokensPlan,
    runtimeDraft.llmMaxOutputTokensTriage,
  ]);

  const inputCls = 'sf-input w-full py-2 sf-text-label leading-5 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

  const saveStatusLabel = runtimeSettingsSaving
    ? 'Saving...'
    : runtimeSaveState === 'ok'
      ? 'Saved'
      : '';

  const headerActions = (
    <div className="flex items-center gap-2">
      {saveStatusLabel && (
        <span className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
          {saveStatusLabel}
        </span>
      )}
      <button
        className="sf-btn sf-btn-primary sf-text-label px-3 py-1.5"
        onClick={saveNow}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving}
      >
        Save
      </button>
    </div>
  );

  let activePanel = null;
  if (activePhase === 'global') {
    activePanel = (
      <Suspense fallback={null}>
        <LlmGlobalSection
          runtimeDraft={runtimeDraft}
          inputCls={inputCls}
          llmModelOptions={llmModelOptions}
          updateDraft={updateDraft}
          onNumberChange={onNumberChange}
          getNumberBounds={getNumberBounds}
          registry={registry}
          onRegistryChange={onRegistryChange}
        />
      </Suspense>
    );
  } else if (
    activePhase === 'needset' ||
    activePhase === 'brand-resolver' ||
    activePhase === 'search-planner' ||
    activePhase === 'serp-triage' ||
    activePhase === 'domain-classifier'
  ) {
    activePanel = (
      <Suspense fallback={null}>
        <LlmPhaseSection
          phaseId={activePhase}
          inputCls={inputCls}
          llmModelOptions={llmModelOptions}
          phaseOverrides={phaseOverrides}
          onPhaseOverrideChange={onPhaseOverrideChange}
          registry={registry}
          globalDraft={globalDraft}
        />
      </Suspense>
    );
  } else if (activePhase === 'extraction') {
    activePanel = (
      <Suspense fallback={null}>
        <LlmExtractionSection
          runtimeDraft={runtimeDraft}
          inputCls={inputCls}
          llmModelOptions={llmModelOptions}
          updateDraft={updateDraft}
          onNumberChange={onNumberChange}
          getNumberBounds={getNumberBounds}
          renderTokenOptions={renderTokenOptions}
          registry={registry}
        />
      </Suspense>
    );
  }

  return (
    <LlmConfigPageShell
      activePhase={activePhase}
      onSelectPhase={setActivePhase}
      headerActions={headerActions}
      activePanel={activePanel}
    />
  );
}
