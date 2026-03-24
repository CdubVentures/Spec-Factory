import { Suspense, lazy, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import {
  deriveRuntimeLlmModelOptions,
  parseBoundedNumber,
  RUNTIME_NUMBER_BOUNDS,
  toRuntimeDraft,
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
import { parseProviderRegistry, syncCostsFromRegistry } from '../state/llmProviderRegistryBridge';
import { mergeDefaultsIntoRegistry } from '../state/llmDefaultProviderRegistry';
import { providerHasApiKey, PROVIDER_API_KEY_MAP, type RuntimeApiKeySlice } from '../state/llmProviderApiKeyGate';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes';
import { useLlmPolicyAuthority } from '../state/useLlmPolicyAuthority';
import { DEFAULT_LLM_POLICY } from '../state/llmPolicyDefaults';
import { flattenLlmPolicy, routeFlatKeyUpdate } from '../state/llmPolicyAdapter';

const LlmGlobalSection = lazy(async () => {
  const module = await import('../sections/LlmGlobalSection');
  return { default: module.LlmGlobalSection };
});

const LlmPhaseSection = lazy(async () => {
  const module = await import('../sections/LlmPhaseSection');
  return { default: module.LlmPhaseSection };
});

// WHY: Single canonical contract — no local duplicates.
import type { IndexingLlmConfigResponse as RuntimeSettingsLlmConfigResponse } from '../../indexing/types.ts';

export function LlmConfigPage() {
  const runtimeAutoSaveEnabled = useUiStore((state) => state.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((state) => state.setRuntimeAutoSaveEnabled);
  const runtimeReadyFlag = useSettingsAuthorityStore((state) => state.snapshot.runtimeReady);

  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);

  const [activePhase, setActivePhase] = usePersistedTab<LlmPhaseId>(
    'llm-config:active-phase',
    'global',
    { validValues: LLM_PHASE_IDS as unknown as readonly LlmPhaseId[] },
  );

  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<RuntimeSettingsLlmConfigResponse>('/indexing/llm-config'),
  });

  // WHY: LLM config now uses the dedicated LlmPolicy authority instead of
  // useRuntimeSettingsEditorAdapter. The authority auto-saves to PUT /llm-policy.
  const llmAuthority = useLlmPolicyAuthority({
    autoSaveEnabled: runtimeAutoSaveEnabled,
    defaultPolicy: DEFAULT_LLM_POLICY,
  });

  const { policy } = llmAuthority;
  const saveNow = llmAuthority.saveNow;

  // WHY: Adapter layer — child sections still receive flat-key RuntimeDraft interface.
  // flattenLlmPolicy converts the composite to flat keys for backward compat.
  const runtimeDraft = useMemo(
    () => flattenLlmPolicy(policy) as unknown as RuntimeDraft,
    [policy],
  );

  const runtimeSettingsLoading = llmAuthority.isLoading;
  const runtimeSettingsSaving = llmAuthority.isSaving;
  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;

  const llmModelOptions = useMemo(() => deriveRuntimeLlmModelOptions({
    indexingLlmConfig,
    llmModelPlan: policy.models.plan,
    llmModelReasoning: policy.models.reasoning,
  }), [
    indexingLlmConfig,
    policy.models.plan,
    policy.models.reasoning,
  ]);

  // WHY: updateDraft adapter routes flat-key writes to the correct policy group.
  const updateDraft = useCallback(<K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => {
    const route = routeFlatKeyUpdate(key as string, value);
    if (!route) return;
    if ('group' in route) {
      llmAuthority.updateGroup(route.group, route.patch as never);
    } else if ('topLevel' in route) {
      llmAuthority.updatePolicy(route.topLevel);
    }
  }, [llmAuthority]);

  const onNumberChange = useCallback(<K extends keyof RuntimeDraft>(
    key: K,
    eventValue: string,
    bounds: NumberBound,
  ) => {
    const current = (runtimeDraft as Record<string, unknown>)[key as string];
    const fallback = typeof current === 'number' ? current : 0;
    const next = parseBoundedNumber(eventValue, fallback, bounds);
    const route = routeFlatKeyUpdate(key as string, next);
    if (!route) return;
    if ('group' in route) {
      llmAuthority.updateGroup(route.group, route.patch as never);
    } else if ('topLevel' in route) {
      llmAuthority.updatePolicy(route.topLevel);
    }
  }, [runtimeDraft, llmAuthority]);

  const getNumberBounds = useCallback(<K extends keyof RuntimeDraft>(key: K): NumberBound => {
    return RUNTIME_NUMBER_BOUNDS[key as keyof typeof RUNTIME_NUMBER_BOUNDS];
  }, []);

  /* --- Provider Registry bridge --- */
  const defaultRegistry = useMemo(
    () => parseProviderRegistry(RUNTIME_SETTING_DEFAULTS.llmProviderRegistryJson),
    [],
  );
  const serverResolvedKeys = indexingLlmConfig?.resolved_api_keys as
    | Record<string, string>
    | undefined;

  const registry: LlmProviderEntry[] = useMemo(() => {
    const merged = mergeDefaultsIntoRegistry(
      policy.providerRegistry as LlmProviderEntry[],
      defaultRegistry,
    );
    return merged.map((provider) => {
      if (provider.apiKey) return provider;
      const envField = PROVIDER_API_KEY_MAP[provider.id] as keyof typeof policy.apiKeys | undefined;
      const envValue = envField ? policy.apiKeys[envField] : undefined;
      if (envValue) return { ...provider, apiKey: envValue };
      if (provider.id === 'default-gemini' && policy.apiKeys.plan) {
        return { ...provider, apiKey: policy.apiKeys.plan };
      }
      const serverKey = envField && serverResolvedKeys ? serverResolvedKeys[envField] : undefined;
      if (serverKey) return { ...provider, apiKey: serverKey };
      return provider;
    });
  }, [
    policy.providerRegistry,
    policy.apiKeys,
    defaultRegistry,
    serverResolvedKeys,
  ]);

  const runtimeApiKeys: RuntimeApiKeySlice = useMemo(() => ({
    geminiApiKey: policy.apiKeys.gemini ?? '',
    deepseekApiKey: policy.apiKeys.deepseek ?? '',
    anthropicApiKey: policy.apiKeys.anthropic ?? '',
    openaiApiKey: policy.apiKeys.openai ?? '',
    llmPlanApiKey: policy.apiKeys.plan ?? '',
  }), [policy.apiKeys]);

  const apiKeyFilter = useCallback(
    (provider: LlmProviderEntry) => providerHasApiKey(provider, runtimeApiKeys),
    [runtimeApiKeys],
  );

  const onRegistryChange = useCallback((nextRegistry: LlmProviderEntry[]) => {
    // WHY: Re-bridge costs so budget fields stay in sync when model costs
    // are edited in the Provider Registry panel.
    const costs = syncCostsFromRegistry(nextRegistry, policy.models.plan);
    llmAuthority.updatePolicy({
      providerRegistry: nextRegistry,
      ...(costs ? {
        budget: {
          ...policy.budget,
          costInputPer1M: costs.llmCostInputPer1M,
          costOutputPer1M: costs.llmCostOutputPer1M,
          costCachedInputPer1M: costs.llmCostCachedInputPer1M,
        },
      } : {}),
    });
  }, [llmAuthority, policy.models.plan, policy.budget]);

  /* --- Phase Overrides bridge --- */
  const phaseOverrides: LlmPhaseOverrides = policy.phaseOverrides as LlmPhaseOverrides;

  const onPhaseOverrideChange = useCallback((nextOverrides: LlmPhaseOverrides) => {
    llmAuthority.updatePolicy({ phaseOverrides: nextOverrides });
  }, [llmAuthority]);

  const globalDraft = useMemo(() => ({
    llmModelPlan: policy.models.plan,
    llmModelReasoning: policy.models.reasoning,
    llmPlanUseReasoning: policy.reasoning.enabled,
    llmMaxOutputTokensPlan: policy.tokens.plan,
  }), [
    policy.models.plan,
    policy.models.reasoning,
    policy.reasoning.enabled,
    policy.tokens.plan,
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
    // WHY: Preserve API keys and enabled state from current registry when resetting.
    const currentRegistry = policy.providerRegistry as LlmProviderEntry[];
    const resolvedKeys: Record<string, string> = {};
    for (const provider of currentRegistry) {
      let key = provider.apiKey?.trim() || '';
      if (!key) {
        const field = PROVIDER_API_KEY_MAP[provider.id] as keyof typeof policy.apiKeys | undefined;
        if (field) key = String(policy.apiKeys[field] || '').trim();
      }
      if (key) resolvedKeys[provider.id] = key;
    }
    if (serverResolvedKeys) {
      for (const [field, envKey] of Object.entries(PROVIDER_API_KEY_MAP)) {
        if (!resolvedKeys[field] && serverResolvedKeys[envKey]) {
          resolvedKeys[field] = serverResolvedKeys[envKey];
        }
      }
    }

    const resetRegistry = parseProviderRegistry(RUNTIME_SETTING_DEFAULTS.llmProviderRegistryJson);
    const preservedRegistry = resetRegistry.map((provider) => {
      const currentProvider = currentRegistry.find((p) => p.id === provider.id);
      return {
        ...provider,
        apiKey: resolvedKeys[provider.id] || provider.apiKey,
        enabled: currentProvider ? currentProvider.enabled : provider.enabled,
      };
    });

    llmAuthority.updatePolicy({
      ...DEFAULT_LLM_POLICY,
      providerRegistry: preservedRegistry,
      apiKeys: {
        gemini: policy.apiKeys.gemini || resolvedKeys['default-gemini'] || '',
        deepseek: policy.apiKeys.deepseek || resolvedKeys['default-deepseek'] || '',
        anthropic: policy.apiKeys.anthropic || resolvedKeys['default-anthropic'] || '',
        openai: policy.apiKeys.openai || resolvedKeys['default-openai'] || '',
        plan: policy.apiKeys.plan,
      },
    });
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
    activePhase === 'serp-selector' ||
    activePhase === 'extraction' ||
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
