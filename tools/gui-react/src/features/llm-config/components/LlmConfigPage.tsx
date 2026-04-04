import { Suspense, lazy, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import {
  deriveRuntimeLlmModelOptions,
  parseBoundedNumber,
  RUNTIME_NUMBER_BOUNDS,
  toRuntimeDraft,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings/index.ts';
import {
  RUNTIME_SETTING_DEFAULTS,
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
} from '../../../stores/settingsManifest.ts';
import { RuntimeFlowHeaderControls } from '../../pipeline-settings/components/RuntimeFlowHeaderControls.tsx';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { LlmConfigPageShell } from './LlmConfigPageShell.tsx';
import { LLM_PHASE_IDS } from '../state/llmPhaseRegistry.generated.ts';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';
import { uiPhaseIdToOverrideKey } from '../state/llmPhaseOverridesBridge.generated.ts';
import { parseProviderRegistry, syncCostsFromRegistry } from '../state/llmProviderRegistryBridge.ts';
import { mergeDefaultsIntoRegistry } from '../state/llmDefaultProviderRegistry.ts';
import { extractRegistryApiKeys, providerHasApiKey, PROVIDER_API_KEY_MAP, type RuntimeApiKeySlice } from '../state/llmProviderApiKeyGate.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';
import { useLlmPolicyAuthority } from '../state/useLlmPolicyAuthority.ts';
import { DEFAULT_LLM_POLICY } from '../state/llmPolicyDefaults.ts';
import { flattenLlmPolicy, routeFlatKeyUpdate } from '../state/llmPolicyAdapter.ts';

const LlmGlobalSection = lazy(async () => {
  const module = await import('../sections/LlmGlobalSection.tsx');
  return { default: module.LlmGlobalSection };
});

const LlmPhaseSection = lazy(async () => {
  const module = await import('../sections/LlmPhaseSection.tsx');
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

  // WHY: If the default registry gained new providers (e.g. lab-openai) since the
  // user last saved, policy.providerRegistry won't have them. The merge above adds
  // them for display, but saves serialize policy.providerRegistry (the raw version).
  // This effect writes the merged list back so the next save persists all providers.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    const savedIds = new Set((policy.providerRegistry as LlmProviderEntry[]).map((p) => p.id));
    const hasMissing = registry.some((p) => !savedIds.has(p.id));
    if (hasMissing) {
      syncedRef.current = true;
      llmAuthority.updatePolicy({ providerRegistry: registry });
    }
  }, [registry, policy.providerRegistry, llmAuthority]);

  const runtimeApiKeys: RuntimeApiKeySlice = useMemo(() => ({
    geminiApiKey: policy.apiKeys.gemini ?? '',
    deepseekApiKey: policy.apiKeys.deepseek ?? '',
    anthropicApiKey: policy.apiKeys.anthropic ?? '',
    openaiApiKey: policy.apiKeys.openai ?? '',
  }), [policy.apiKeys]);

  const apiKeyFilter = useCallback(
    (provider: LlmProviderEntry) => providerHasApiKey(provider, runtimeApiKeys),
    [runtimeApiKeys],
  );

  const onRegistryChange = useCallback((nextRegistry: LlmProviderEntry[]) => {
    // WHY: Re-bridge costs so budget fields stay in sync when model costs
    // are edited in the Provider Registry panel.
    const costs = syncCostsFromRegistry(nextRegistry, policy.models.plan);
    // WHY: Sync API keys from registry providers to flat apiKeys fields.
    // Without this, entering a key in the registry panel only writes to
    // providerRegistry[idx].apiKey (inside the JSON blob). The flat fields
    // (geminiApiKey, etc.) stay empty, so bootstrapApiKeyForProvider and
    // resolved_api_keys both report missing keys, keeping the lockout active.
    const extractedKeys = extractRegistryApiKeys(nextRegistry);
    const apiKeysPatch = Object.keys(extractedKeys).length > 0
      ? { apiKeys: { ...policy.apiKeys, ...extractedKeys } }
      : {};
    llmAuthority.updatePolicy({
      providerRegistry: nextRegistry,
      ...apiKeysPatch,
      ...(costs ? {
        budget: {
          ...policy.budget,
          costInputPer1M: costs.llmCostInputPer1M,
          costOutputPer1M: costs.llmCostOutputPer1M,
          costCachedInputPer1M: costs.llmCostCachedInputPer1M,
        },
      } : {}),
    });
  }, [llmAuthority, policy.models.plan, policy.budget, policy.apiKeys]);

  /* --- Phase Overrides bridge --- */
  const phaseOverrides: LlmPhaseOverrides = policy.phaseOverrides as LlmPhaseOverrides;

  const onPhaseOverrideChange = useCallback((nextOverrides: LlmPhaseOverrides) => {
    llmAuthority.updatePolicy({ phaseOverrides: nextOverrides });
  }, [llmAuthority]);

  const globalDraft = useMemo(() => ({
    llmModelPlan: policy.models.plan,
    llmModelReasoning: policy.models.reasoning,
    llmPlanFallbackModel: policy.models.planFallback,
    llmReasoningFallbackModel: policy.models.reasoningFallback,
    llmPlanUseReasoning: policy.reasoning.enabled,
    llmMaxOutputTokensPlan: policy.tokens.plan,
    llmMaxOutputTokensTriage: policy.tokens.triage,
    llmTimeoutMs: policy.timeoutMs,
    llmMaxTokens: policy.tokens.maxTokens,
  }), [
    policy.models.plan,
    policy.models.reasoning,
    policy.models.planFallback,
    policy.models.reasoningFallback,
    policy.reasoning.enabled,
    policy.tokens.plan,
    policy.tokens.triage,
    policy.timeoutMs,
    policy.tokens.maxTokens,
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
  } else if (uiPhaseIdToOverrideKey(activePhase) !== undefined) {
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
          phaseSchema={indexingLlmConfig?.phase_schemas?.[activePhase] ?? null}
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
