// WHY: Dedicated authority hook for the LlmPolicy composite.
// The flat Zustand runtimeSettingsValueStore is the SSOT for all settings.
// This hook derives the composite LlmPolicy view from the store on every render,
// writes edits as flat keys directly to the store, and persists to PUT /llm-policy
// immediately on every change — no debounce, no dirty tracking, no save button.

import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import type { RuntimeSettings } from '../../pipeline-settings/index.ts';
import { LLM_POLICY_QUERY_KEY, fetchLlmPolicy, persistLlmPolicy } from '../api/llmPolicyApi.ts';
import type { LlmPolicy, LlmPolicyGroup } from './llmPolicyAdapter.generated.ts';
import { flattenLlmPolicy, flattenPolicyGroup } from './llmPolicyAdapter.ts';
import { assembleLlmPolicyFromFlat } from './llmPolicyDefaults.ts';
import { validateModelExistence } from './llmModelValidation.ts';
import { LLM_MODEL_ROLES } from './llmModelRoleRegistry.ts';

interface UseLlmPolicyAuthorityOptions {
  defaultPolicy: LlmPolicy;
}

interface UseLlmPolicyAuthorityResult {
  policy: LlmPolicy;
  isLoading: boolean;
  isSaving: boolean;
  updateGroup: <G extends LlmPolicyGroup>(group: G, patch: Partial<LlmPolicy[G]>) => void;
  updatePolicy: (patch: Partial<LlmPolicy>) => void;
  saveNow: () => void;
  reload: () => Promise<void>;
}

export function useLlmPolicyAuthority({
  defaultPolicy,
}: UseLlmPolicyAuthorityOptions): UseLlmPolicyAuthorityResult {
  const queryClient = useQueryClient();

  // WHY: Derive the composite LlmPolicy from the flat Zustand store.
  // The store is the SSOT — no local useState for policy values.
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  const policy = useMemo(
    () => storeValues
      ? assembleLlmPolicyFromFlat(storeValues as unknown as Record<string, unknown>)
      : defaultPolicy,
    [storeValues, defaultPolicy],
  );

  const initialHydrationAppliedRef = useRef(false);

  const { data: serverData, isLoading, refetch } = useQuery({
    queryKey: LLM_POLICY_QUERY_KEY,
    queryFn: async () => {
      const res = await fetchLlmPolicy();
      return res.policy;
    },
  });

  const readCurrentPolicy = useCallback((): LlmPolicy => {
    const currentStore = useRuntimeSettingsValueStore.getState().values;
    return currentStore
      ? assembleLlmPolicyFromFlat(currentStore as unknown as Record<string, unknown>)
      : defaultPolicy;
  }, [defaultPolicy]);

  // WHY: Hydrate once from server — push flat keys into the store.
  // The composite policy is then derived from the store via useMemo above.
  // Uses hydrateKeys (not updateKeys) to avoid marking the store dirty,
  // which would block the runtime-settings hydrate() call.
  useEffect(() => {
    if (initialHydrationAppliedRef.current || !serverData) return;
    initialHydrationAppliedRef.current = true;
    const flat = flattenLlmPolicy(serverData);
    useRuntimeSettingsValueStore.getState().hydrateKeys(flat as Partial<RuntimeSettings>);
  }, [serverData]);

  const saveMutation = useMutation({
    mutationFn: (nextPolicy: LlmPolicy) => {
      // WHY: Reject invalid model IDs before they reach the server.
      const modelFields: Record<string, string> = {};
      for (const entry of LLM_MODEL_ROLES) {
        const modelId = nextPolicy.models[entry.role.toLowerCase() as keyof typeof nextPolicy.models];
        if (modelId) modelFields[entry.modelKey] = modelId;
        if (entry.fallbackModelKey) {
          const fbKey = entry.role.toLowerCase() + 'Fallback';
          const fbValue = nextPolicy.models[fbKey as keyof typeof nextPolicy.models];
          if (fbValue) modelFields[entry.fallbackModelKey] = fbValue as string;
        }
      }
      const registry = nextPolicy.providerRegistry ?? [];
      const issues = validateModelExistence(modelFields, registry);
      if (issues.length > 0) {
        const names = issues.map((i) => i.title).join(', ');
        return Promise.reject(new Error(`Invalid model(s): ${names}`));
      }
      return persistLlmPolicy(nextPolicy);
    },
    onSuccess: (result) => {
      if (result.policy) {
        queryClient.setQueryData(LLM_POLICY_QUERY_KEY, result.policy);
      }
      // WHY: Clear the store's dirty flag after successful save.
      // updateKeys() from the preceding edit sets store.dirty=true;
      // markClean() unblocks hydrate() from /runtime-settings.
      useRuntimeSettingsValueStore.getState().markClean();
      publishSettingsPropagation({ domain: 'runtime' });
    },
    onError: (error) => {
      console.error('LLM policy save failed:', error);
    },
  });

  // WHY: Edits write flat keys directly to the store, then persist immediately.
  // No debounce, no dirty tracking — every change triggers PUT /llm-policy.
  const updateGroup = useCallback(<G extends LlmPolicyGroup>(
    group: G,
    patch: Partial<LlmPolicy[G]>,
  ) => {
    const current = policy[group] as unknown as Record<string, unknown>;
    const merged = { ...current, ...patch };
    const flatPatch = flattenPolicyGroup(group, merged);
    useRuntimeSettingsValueStore.getState().updateKeys(flatPatch as Partial<RuntimeSettings>);
    saveMutation.mutate(readCurrentPolicy());
  }, [policy, saveMutation, readCurrentPolicy]);

  const updatePolicy = useCallback((patch: Partial<LlmPolicy>) => {
    const merged = { ...policy, ...patch };
    const flat = flattenLlmPolicy(merged);
    useRuntimeSettingsValueStore.getState().updateKeys(flat as Partial<RuntimeSettings>);
    saveMutation.mutate(readCurrentPolicy());
  }, [policy, saveMutation, readCurrentPolicy]);

  const saveNow = useCallback(() => {
    saveMutation.mutate(readCurrentPolicy());
  }, [saveMutation, readCurrentPolicy]);

  const reload = useCallback(async () => {
    const result = await refetch();
    if (result.data) {
      const flat = flattenLlmPolicy(result.data);
      useRuntimeSettingsValueStore.getState().hydrateKeys(flat as Partial<RuntimeSettings>);
    }
  }, [refetch]);

  return {
    policy,
    isLoading,
    isSaving: saveMutation.isPending,
    updateGroup,
    updatePolicy,
    saveNow,
    reload,
  };
}
