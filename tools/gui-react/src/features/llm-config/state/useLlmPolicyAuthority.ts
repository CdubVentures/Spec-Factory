// WHY: Dedicated authority hook for the LlmPolicy composite.
// The flat Zustand runtimeSettingsValueStore is the SSOT for all settings.
// This hook derives the composite LlmPolicy view from the store on every render,
// writes edits as flat keys directly to the store, and auto-saves to PUT /llm-policy.

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from '../../../stores/settingsManifest';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';
import { useSettingsAutoSaveEffect } from '../../pipeline-settings/state/useSettingsAutoSaveEffect';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore';
import type { RuntimeSettings } from '../../pipeline-settings';
import { LLM_POLICY_QUERY_KEY, fetchLlmPolicy, persistLlmPolicy } from '../api/llmPolicyApi';
import type { LlmPolicy, LlmPolicyGroup } from '../types/llmPolicyTypes';
import { flattenLlmPolicy, flattenPolicyGroup } from './llmPolicyAdapter';
import { assembleLlmPolicyFromFlat } from './llmPolicyDefaults';

interface UseLlmPolicyAuthorityOptions {
  autoSaveEnabled?: boolean;
  defaultPolicy: LlmPolicy;
}

interface UseLlmPolicyAuthorityResult {
  policy: LlmPolicy;
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  updateGroup: <G extends LlmPolicyGroup>(group: G, patch: Partial<LlmPolicy[G]>) => void;
  updatePolicy: (patch: Partial<LlmPolicy>) => void;
  saveNow: () => void;
  flushIfDirty: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useLlmPolicyAuthority({
  autoSaveEnabled = true,
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

  // WHY: Local dirty flag tracks "LLM policy has unsaved changes to /llm-policy".
  // This is distinct from the store's dirty which tracks runtime settings unsaved changes.
  const [dirty, setDirty] = useState(false);
  const initialHydrationAppliedRef = useRef(false);

  const payloadFingerprint = useMemo(() => autoSaveFingerprint(policy), [policy]);

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

  const saveFnRef = useRef<() => void>(() => {});
  const getUnloadBody = useCallback(() => readCurrentPolicy(), [readCurrentPolicy]);

  const { markSaved, clearAttemptFingerprint, seedFingerprint, prepareFlush } =
    useSettingsAutoSaveEffect({
      domain: 'llm-policy',
      debounceMs: SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime,
      payloadFingerprint,
      dirty,
      autoSaveEnabled,
      initialHydrationApplied: initialHydrationAppliedRef.current,
      saveFn: () => saveFnRef.current(),
      getUnloadBody,
      unloadUrl: '/api/v1/llm-policy',
    });

  // WHY: Hydrate once from server — push flat keys into the store.
  // The composite policy is then derived from the store via useMemo above.
  // Uses hydrateKeys (not updateKeys) to avoid marking the store dirty,
  // which would block the runtime-settings hydrate() call.
  useEffect(() => {
    if (initialHydrationAppliedRef.current || !serverData) return;
    initialHydrationAppliedRef.current = true;
    const flat = flattenLlmPolicy(serverData);
    useRuntimeSettingsValueStore.getState().hydrateKeys(flat as Partial<RuntimeSettings>);
    seedFingerprint(autoSaveFingerprint(serverData));
  }, [serverData, seedFingerprint]);

  const saveMutation = useMutation({
    mutationFn: (nextPolicy: LlmPolicy) => persistLlmPolicy(nextPolicy),
    onSuccess: (result) => {
      if (result.policy) {
        queryClient.setQueryData(LLM_POLICY_QUERY_KEY, result.policy);
      }
      markSaved(autoSaveFingerprint(readCurrentPolicy()));
      setDirty(false);
      // WHY: Clear the store's dirty flag after successful LLM policy save.
      // Without this, updateKeys() from user edits sets store.dirty=true,
      // and it stays true forever because only the runtime authority called
      // markClean(). This permanently blocks hydrate() from /runtime-settings.
      useRuntimeSettingsValueStore.getState().markClean();
      publishSettingsPropagation({ domain: 'runtime' });
    },
    onError: (error) => {
      clearAttemptFingerprint();
      console.error('LLM policy auto-save failed:', error);
    },
  });
  saveFnRef.current = () => saveMutation.mutate(readCurrentPolicy());

  // WHY: Edits write flat keys directly to the store. The composite is re-derived
  // from the store on the next render via useMemo. No local policy state to sync.
  const updateGroup = useCallback(<G extends LlmPolicyGroup>(
    group: G,
    patch: Partial<LlmPolicy[G]>,
  ) => {
    const current = policy[group] as unknown as Record<string, unknown>;
    const merged = { ...current, ...patch };
    const flatPatch = flattenPolicyGroup(group, merged);
    useRuntimeSettingsValueStore.getState().updateKeys(flatPatch as Partial<RuntimeSettings>);
    setDirty(true);
  }, [policy]);

  const updatePolicy = useCallback((patch: Partial<LlmPolicy>) => {
    // WHY: For top-level or multi-group patches, flatten the entire merged policy.
    const merged = { ...policy, ...patch };
    const flat = flattenLlmPolicy(merged);
    useRuntimeSettingsValueStore.getState().updateKeys(flat as Partial<RuntimeSettings>);
    setDirty(true);
  }, [policy]);

  const saveNow = useCallback(() => {
    saveMutation.mutate(policy);
  }, [saveMutation, policy]);

  const flushIfDirty = useCallback(async () => {
    if (!prepareFlush()) return;
    await saveMutation.mutateAsync(readCurrentPolicy());
  }, [saveMutation, readCurrentPolicy, prepareFlush]);

  const reload = useCallback(async () => {
    const result = await refetch();
    if (result.data) {
      const flat = flattenLlmPolicy(result.data);
      // WHY: Use hydrateKeys for server reload, not updateKeys. updateKeys
      // would mark dirty and block future hydrate() calls from /runtime-settings.
      useRuntimeSettingsValueStore.getState().hydrateKeys(flat as Partial<RuntimeSettings>);
      seedFingerprint(autoSaveFingerprint(result.data));
      setDirty(false);
    }
  }, [refetch, seedFingerprint]);

  return {
    policy,
    isLoading,
    isSaving: saveMutation.isPending,
    isDirty: dirty,
    updateGroup,
    updatePolicy,
    saveNow,
    flushIfDirty,
    reload,
  };
}
