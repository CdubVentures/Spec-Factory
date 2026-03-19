// WHY: Dedicated authority hook for the LlmPolicy composite.
// The flat Zustand runtimeSettingsValueStore is the SSOT for all settings.
// This hook derives the composite LlmPolicy view from the store on every render,
// writes edits as flat keys directly to the store, and auto-saves to PUT /llm-policy.

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from '../../../stores/settingsManifest';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';
import {
  registerUnloadGuard,
  markDomainFlushedByUnmount,
  isDomainFlushedByUnload,
} from '../../../stores/settingsUnloadGuard';
import { shouldAutoSave } from '../../pipeline-settings/state/settingsAutoSaveGate';
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
  const dirtyRef = useRef(dirty);
  const lastSavedFingerprintRef = useRef('');
  const lastAttemptFingerprintRef = useRef('');
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  dirtyRef.current = dirty;

  const payloadFingerprint = useMemo(() => autoSaveFingerprint(policy), [policy]);
  const payloadFingerprintRef = useRef(payloadFingerprint);
  payloadFingerprintRef.current = payloadFingerprint;

  const { data: serverData, isLoading, refetch } = useQuery({
    queryKey: LLM_POLICY_QUERY_KEY,
    queryFn: async () => {
      const res = await fetchLlmPolicy();
      return res.policy;
    },
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
    const fp = autoSaveFingerprint(serverData);
    lastSavedFingerprintRef.current = fp;
    lastAttemptFingerprintRef.current = fp;
  }, [serverData]);

  const saveMutation = useMutation({
    mutationFn: (nextPolicy: LlmPolicy) => persistLlmPolicy(nextPolicy),
    onSuccess: (result) => {
      if (result.policy) {
        queryClient.setQueryData(LLM_POLICY_QUERY_KEY, result.policy);
      }
      // WHY: Read the current policy from the store (derived) for fingerprint.
      const currentStore = useRuntimeSettingsValueStore.getState().values;
      const currentPolicy = currentStore
        ? assembleLlmPolicyFromFlat(currentStore as unknown as Record<string, unknown>)
        : policy;
      const fp = autoSaveFingerprint(currentPolicy);
      lastSavedFingerprintRef.current = fp;
      setDirty(false);
      // WHY: Clear the store's dirty flag after successful LLM policy save.
      // Without this, updateKeys() from user edits sets store.dirty=true,
      // and it stays true forever because only the runtime authority called
      // markClean(). This permanently blocks hydrate() from /runtime-settings.
      useRuntimeSettingsValueStore.getState().markClean();
      publishSettingsPropagation({ domain: 'runtime' });
    },
  });

  // WHY: Debounced auto-save matching the runtime authority pattern.
  // Reads the composite from the store (derived) at save time.
  useEffect(() => {
    const canSave = shouldAutoSave({
      autoSaveEnabled,
      dirty,
      payloadFingerprint,
      lastSavedFingerprint: lastSavedFingerprintRef.current,
      lastAttemptFingerprint: lastAttemptFingerprintRef.current,
      initialHydrationApplied: initialHydrationAppliedRef.current,
    });
    if (!canSave) return;
    lastAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      pendingTimerRef.current = null;
      // WHY: Read the latest composite from the store at save time.
      const currentStore = useRuntimeSettingsValueStore.getState().values;
      const currentPolicy = currentStore
        ? assembleLlmPolicyFromFlat(currentStore as unknown as Record<string, unknown>)
        : policy;
      saveMutation.mutate(currentPolicy);
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime);
    pendingTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
  }, [autoSaveEnabled, dirty, payloadFingerprint, saveMutation, policy]);

  // WHY: Unload guard ensures dirty edits survive hard reload.
  useEffect(() => {
    return registerUnloadGuard({
      domain: 'llm-policy',
      isDirty: () => {
        if (!dirtyRef.current) return false;
        const fp = payloadFingerprintRef.current;
        return Boolean(fp) && fp !== lastSavedFingerprintRef.current;
      },
      getPayload: () => {
        const currentStore = useRuntimeSettingsValueStore.getState().values;
        const currentPolicy = currentStore
          ? assembleLlmPolicyFromFlat(currentStore as unknown as Record<string, unknown>)
          : defaultPolicy;
        return {
          url: '/api/v1/llm-policy',
          method: 'PUT',
          body: currentPolicy,
        };
      },
      markFlushed: () => {
        lastAttemptFingerprintRef.current = payloadFingerprintRef.current;
      },
    });
  }, [defaultPolicy]);

  // WHY: Unmount flush for tab navigation.
  useEffect(() => {
    return () => {
      if (isDomainFlushedByUnload('llm-policy')) return;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      if (!dirtyRef.current) return;
      const fp = payloadFingerprintRef.current;
      if (!fp || fp === lastSavedFingerprintRef.current) return;
      lastAttemptFingerprintRef.current = fp;
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const currentStore = useRuntimeSettingsValueStore.getState().values;
        const currentPolicy = currentStore
          ? assembleLlmPolicyFromFlat(currentStore as unknown as Record<string, unknown>)
          : defaultPolicy;
        const blob = new Blob([JSON.stringify(currentPolicy)], { type: 'application/json' });
        navigator.sendBeacon('/api/v1/llm-policy', blob);
      }
      markDomainFlushedByUnmount('llm-policy');
    };
  }, [defaultPolicy]);

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
    const fp = payloadFingerprintRef.current;
    if (!fp || fp === lastSavedFingerprintRef.current) return;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    lastAttemptFingerprintRef.current = fp;
    await saveMutation.mutateAsync(policy);
  }, [saveMutation, policy]);

  const reload = useCallback(async () => {
    const result = await refetch();
    if (result.data) {
      const flat = flattenLlmPolicy(result.data);
      // WHY: Use hydrateKeys for server reload, not updateKeys. updateKeys
      // would mark dirty and block future hydrate() calls from /runtime-settings.
      useRuntimeSettingsValueStore.getState().hydrateKeys(flat as Partial<RuntimeSettings>);
      const fp = autoSaveFingerprint(result.data);
      lastSavedFingerprintRef.current = fp;
      lastAttemptFingerprintRef.current = fp;
      setDirty(false);
    }
  }, [refetch]);

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
