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
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
} from '../../../stores/settingsManifest';
import { RuntimeFlowHeaderControls } from '../../pipeline-settings/components/RuntimeFlowHeaderControls';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore';
import { useUiStore } from '../../../stores/uiStore';
import { usePersistedTab } from '../../../stores/tabStore';
import { LlmConfigPageShell } from './LlmConfigPageShell';
import { LLM_PHASE_IDS } from '../state/llmPhaseRegistry';
import type { LlmPhaseId } from '../types/llmPhaseTypes';
import { parseProviderRegistry, serializeProviderRegistry, syncCostsFromRegistry } from '../state/llmProviderRegistryBridge';
import { mergeDefaultsIntoRegistry } from '../state/llmDefaultProviderRegistry';
import { parsePhaseOverrides, serializePhaseOverrides } from '../state/llmPhaseOverridesBridge';
import { providerHasApiKey, PROVIDER_API_KEY_MAP, type RuntimeApiKeySlice } from '../state/llmProviderApiKeyGate';
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
  resolved_api_keys?: Record<string, string>;
}

export function LlmConfigPage() {
  const queryClient = useQueryClient();
  const runtimeAutoSaveEnabled = useUiStore((state) => state.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((state) => state.setRuntimeAutoSaveEnabled);
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

  // WHY: LLM config is always autosaved — no user toggle.
  const runtimeEditor = useRuntimeSettingsEditorAdapter<RuntimeDraft>({
    bootstrapValues: runtimeBootstrapDraft,
    payloadFromValues: payloadFromRuntimeDraft,
    normalizeSnapshot: (snapshot) => normalizeRuntimeDraft(snapshot, runtimeBootstrap),
    valuesEqual: runtimeDraftEqual,
    autoSaveEnabled: true,
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
    llmModelReasoning,
    llmMaxOutputTokensPlan,
  } = runtimeDraft;

  const llmModelOptions = useMemo(() => deriveRuntimeLlmModelOptions({
    indexingLlmConfig,
    llmModelPlan,
    llmModelReasoning,
  }), [
    indexingLlmConfig,
    llmModelPlan,
    llmModelReasoning,
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

  /* --- Provider Registry bridge --- */
  const defaultRegistry = useMemo(
    () => parseProviderRegistry(RUNTIME_SETTING_DEFAULTS.llmProviderRegistryJson),
    [],
  );
  // WHY: resolved_api_keys comes from the server's configBuilder which reads .env vars.
  // This is the only path for .env API keys to reach the GUI.
  const serverResolvedKeys = indexingLlmConfig?.resolved_api_keys as
    | Record<string, string>
    | undefined;

  const registry: LlmProviderEntry[] = useMemo(() => {
    const merged = mergeDefaultsIntoRegistry(
      parseProviderRegistry(runtimeDraft.llmProviderRegistryJson),
      defaultRegistry,
    );
    // Seed API keys into default providers from all available sources:
    // 1. provider.apiKey (user typed directly in provider card)
    // 2. standalone runtime fields (geminiApiKey, etc.)
    // 3. server-resolved .env keys (resolved_api_keys from /indexing/llm-config)
    return merged.map((provider) => {
      if (provider.apiKey) return provider;
      const envField = PROVIDER_API_KEY_MAP[provider.id] as keyof typeof runtimeDraft | undefined;
      const envValue = envField ? runtimeDraft[envField] : undefined;
      if (envValue) return { ...provider, apiKey: envValue as string };
      if (provider.id === 'default-gemini' && runtimeDraft.llmPlanApiKey) {
        return { ...provider, apiKey: runtimeDraft.llmPlanApiKey as string };
      }
      // Fallback: server-resolved .env key
      const serverKey = envField && serverResolvedKeys ? serverResolvedKeys[envField] : undefined;
      if (serverKey) return { ...provider, apiKey: serverKey };
      return provider;
    });
  }, [
    runtimeDraft.llmProviderRegistryJson,
    runtimeDraft.geminiApiKey,
    runtimeDraft.deepseekApiKey,
    runtimeDraft.anthropicApiKey,
    runtimeDraft.openaiApiKey,
    runtimeDraft.llmPlanApiKey,
    defaultRegistry,
    serverResolvedKeys,
  ]);

  const runtimeApiKeys: RuntimeApiKeySlice = useMemo(() => ({
    geminiApiKey: runtimeDraft.geminiApiKey ?? '',
    deepseekApiKey: runtimeDraft.deepseekApiKey ?? '',
    anthropicApiKey: runtimeDraft.anthropicApiKey ?? '',
    openaiApiKey: runtimeDraft.openaiApiKey ?? '',
    llmPlanApiKey: runtimeDraft.llmPlanApiKey ?? '',
  }), [
    runtimeDraft.geminiApiKey,
    runtimeDraft.deepseekApiKey,
    runtimeDraft.anthropicApiKey,
    runtimeDraft.openaiApiKey,
    runtimeDraft.llmPlanApiKey,
  ]);

  const apiKeyFilter = useCallback(
    (provider: LlmProviderEntry) => providerHasApiKey(provider, runtimeApiKeys),
    [runtimeApiKeys],
  );

  const onRegistryChange = useCallback((nextRegistry: LlmProviderEntry[]) => {
    const serialized = serializeProviderRegistry(nextRegistry);
    setRuntimeDraft((previous) => {
      const next = { ...previous, llmProviderRegistryJson: serialized };
      // WHY: Re-bridge costs so flat fields stay in sync when model costs
      // are edited in the Provider Registry panel.
      const costs = syncCostsFromRegistry(nextRegistry, previous.llmModelPlan as string);
      if (costs) {
        next.llmCostInputPer1M = costs.llmCostInputPer1M;
        next.llmCostOutputPer1M = costs.llmCostOutputPer1M;
        next.llmCostCachedInputPer1M = costs.llmCostCachedInputPer1M;
      }
      return next;
    });
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
    llmModelReasoning: runtimeDraft.llmModelReasoning,
    llmPlanUseReasoning: runtimeDraft.llmPlanUseReasoning,
    llmMaxOutputTokensPlan: runtimeDraft.llmMaxOutputTokensPlan,
  }), [
    runtimeDraft.llmModelPlan,
    runtimeDraft.llmModelReasoning,
    runtimeDraft.llmPlanUseReasoning,
    runtimeDraft.llmMaxOutputTokensPlan,
  ]);

  const inputCls = 'sf-input w-full py-2 sf-text-label leading-5 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

  const runtimeAutoSaveDelaySeconds = (SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime / 1000).toFixed(1);

  function resetToDefaults() {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Reset all LLM settings to defaults? This overwrites current unsaved edits.',
      );
      if (!confirmed) return;
    }
    // Reset to manifest defaults but preserve API keys and enabled state from current registry.
    // WHY: Without this, providers the user configured (keys, enabled) revert to manifest
    // defaults — Anthropic/OpenAI become disabled and all provider apiKey fields go blank.
    setRuntimeDraft((prev) => {
      const currentRegistry = parseProviderRegistry(prev.llmProviderRegistryJson);

      // Resolve each default provider's API key from ALL sources:
      // 1. provider.apiKey in stored registry
      // 2. standalone runtime field (geminiApiKey, etc.)
      // 3. server-resolved .env keys (resolved_api_keys from /indexing/llm-config)
      const resolvedKeys: Record<string, string> = {};
      for (const provider of currentRegistry) {
        let key = provider.apiKey?.trim() || '';
        if (!key) {
          const field = PROVIDER_API_KEY_MAP[provider.id] as keyof typeof prev | undefined;
          if (field) key = String(prev[field] || '').trim();
        }
        if (!key && provider.id === 'default-gemini') {
          key = String(prev.llmPlanApiKey || '').trim();
        }
        if (key) resolvedKeys[provider.id] = key;
      }
      // Also check server-resolved .env keys for any provider still missing
      if (serverResolvedKeys) {
        for (const [field, envKey] of Object.entries(PROVIDER_API_KEY_MAP)) {
          if (!resolvedKeys[field] && serverResolvedKeys[envKey]) {
            resolvedKeys[field] = serverResolvedKeys[envKey];
          }
        }
      }

      // Reset registry to defaults, then inject resolved apiKey + preserved enabled
      const resetRegistry = parseProviderRegistry(runtimeManifestDefaults.llmProviderRegistryJson);
      const preservedRegistry = resetRegistry.map((provider) => {
        const currentProvider = currentRegistry.find((p) => p.id === provider.id);
        return {
          ...provider,
          apiKey: resolvedKeys[provider.id] || provider.apiKey,
          enabled: currentProvider ? currentProvider.enabled : provider.enabled,
        };
      });

      return {
        ...runtimeManifestDefaults,
        llmProviderRegistryJson: serializeProviderRegistry(preservedRegistry),
        geminiApiKey: prev.geminiApiKey || resolvedKeys['default-gemini'] || '',
        deepseekApiKey: prev.deepseekApiKey || resolvedKeys['default-deepseek'] || '',
        anthropicApiKey: prev.anthropicApiKey || resolvedKeys['default-anthropic'] || '',
        openaiApiKey: prev.openaiApiKey || resolvedKeys['default-openai'] || '',
        llmPlanApiKey: prev.llmPlanApiKey,
      };
    });
    setRuntimeDirty(true);
    // Force immediate save so reset persists even without auto-save
    setTimeout(() => saveNow(), 0);
  }

  const headerActions = (
    <RuntimeFlowHeaderControls
      runtimeSettingsReady={runtimeSettingsReady}
      runtimeSettingsSaving={runtimeSettingsSaving}
      runtimeAutoSaveEnabled={runtimeAutoSaveEnabled}
      runtimeAutoSaveDelaySeconds={runtimeAutoSaveDelaySeconds}
      onSaveNow={saveNow}
      onToggleRuntimeAutoSaveEnabled={() => setRuntimeAutoSaveEnabled(!runtimeAutoSaveEnabled)}
      onResetToDefaults={resetToDefaults}
    />
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
          apiKeyFilter={apiKeyFilter}
        />
      </Suspense>
    );
  } else if (
    activePhase === 'needset' ||
    activePhase === 'brand-resolver' ||
    activePhase === 'search-planner' ||
    activePhase === 'serp-triage' ||
    activePhase === 'validate' ||
    activePhase === 'write'
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
          apiKeyFilter={apiKeyFilter}
        />
      </Suspense>
    );
  } else if (activePhase === 'extraction') {
    activePanel = (
      <Suspense fallback={null}>
        <>
          <LlmPhaseSection
            phaseId="extraction"
            inputCls={inputCls}
            llmModelOptions={llmModelOptions}
            phaseOverrides={phaseOverrides}
            onPhaseOverrideChange={onPhaseOverrideChange}
            registry={registry}
            globalDraft={globalDraft}
            apiKeyFilter={apiKeyFilter}
          />
          <LlmExtractionSection
            runtimeDraft={runtimeDraft}
            inputCls={inputCls}
            updateDraft={updateDraft}
            onNumberChange={onNumberChange}
            getNumberBounds={getNumberBounds}
          />
        </>
      </Suspense>
    );
  }

  const settingsScope = activePhase === 'global' ? 'default' as const : 'user' as const;

  return (
    <LlmConfigPageShell
      activePhase={activePhase}
      onSelectPhase={setActivePhase}
      headerActions={headerActions}
      activePanel={activePanel}
      settingsScope={settingsScope}
    />
  );
}
