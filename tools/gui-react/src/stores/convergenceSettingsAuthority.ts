import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '../api/client';
import { CONVERGENCE_SETTING_DEFAULTS } from './settingsManifest';
import { createSettingsOptimisticMutationContract } from './settingsMutationContract';
import { publishSettingsPropagation } from './settingsPropagationContract';
export { CONVERGENCE_KNOB_GROUPS, CONVERGENCE_SETTING_DEFAULTS } from './settingsManifest';

export type ConvergenceSettings = Record<string, number | boolean>;

interface ConvergenceSettingsState {
  settings: ConvergenceSettings;
  dirty: boolean;
  hydrate: (settings: ConvergenceSettings) => void;
  updateSetting: (key: string, value: number | boolean) => void;
}

interface ConvergenceSettingsPersistResult {
  ok: boolean;
  applied: ConvergenceSettings;
  rejected: Record<string, string>;
}

interface ConvergenceSettingsAuthorityOptions {
  enabled?: boolean;
  onPersisted?: (result: ConvergenceSettingsPersistResult) => void;
  onError?: (error: Error | unknown) => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConvergenceSettings(source: unknown): ConvergenceSettings {
  const input = isObject(source) ? source : {};
  const normalized: ConvergenceSettings = {};
  for (const [key, fallback] of Object.entries(CONVERGENCE_SETTING_DEFAULTS)) {
    if (typeof fallback === 'boolean') {
      const raw = input[key];
      normalized[key] = raw === true || raw === 'true' || raw === 1;
      continue;
    }
    const parsed = Number.parseFloat(String(input[key] ?? ''));
    normalized[key] = Number.isFinite(parsed) ? parsed : fallback;
  }
  return normalized;
}

const useConvergenceSettingsStore = create<ConvergenceSettingsState>((set) => ({
  settings: { ...CONVERGENCE_SETTING_DEFAULTS },
  dirty: false,
  hydrate: (settings) => set({ settings: normalizeConvergenceSettings(settings), dirty: false }),
  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
      dirty: true,
    })),
}));

export function readConvergenceSettingsSnapshot(queryClient: QueryClient): ConvergenceSettings | undefined {
  const cached = queryClient.getQueryData<unknown>(['convergence-settings']);
  if (!isObject(cached)) return undefined;
  return normalizeConvergenceSettings(cached);
}

export function useConvergenceSettingsAuthority({
  enabled = true,
  onPersisted,
  onError,
}: ConvergenceSettingsAuthorityOptions = {}) {
  const queryClient = useQueryClient();
  const settings = useConvergenceSettingsStore((s) => s.settings);
  const dirty = useConvergenceSettingsStore((s) => s.dirty);
  const hydrate = useConvergenceSettingsStore((s) => s.hydrate);
  const updateSetting = useConvergenceSettingsStore((s) => s.updateSetting);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['convergence-settings'],
    queryFn: () => api.get<ConvergenceSettings>('/convergence-settings'),
    enabled,
  });

  useEffect(() => {
    if (!data) return;
    if (dirty) return;
    hydrate(data);
  }, [data, dirty, hydrate]);

  const saveMutation = useMutation(
    createSettingsOptimisticMutationContract<
      ConvergenceSettings,
      { ok: boolean; applied: ConvergenceSettings; rejected?: Record<string, string> },
      ConvergenceSettings,
      ConvergenceSettingsPersistResult
    >({
      queryClient,
      queryKey: ['convergence-settings'],
      mutationFn: (payload) =>
        api.put<{ ok: boolean; applied: ConvergenceSettings; rejected?: Record<string, string> }>(
          '/convergence-settings',
          payload,
        ),
      toOptimisticData: (payload) => normalizeConvergenceSettings(payload),
      toAppliedData: (response, payload, previousData) => {
        const responseApplied = response?.applied && typeof response.applied === 'object'
          ? response.applied as Record<string, unknown>
          : payload;
        const baseline = previousData || payload;
        return normalizeConvergenceSettings({ ...baseline, ...responseApplied });
      },
      toPersistedResult: (response, _payload, _previousData, applied) => {
        const rejected = response?.rejected && typeof response.rejected === 'object'
          ? response.rejected as Record<string, string>
          : {};
        return {
          ok: response?.ok !== false && Object.keys(rejected).length === 0,
          applied,
          rejected,
        };
      },
      onPersisted: (result) => {
        onPersisted?.(result);
        publishSettingsPropagation({ domain: 'convergence' });
        if (Object.keys(result.rejected).length > 0) {
          useConvergenceSettingsStore.setState({
            settings: result.applied,
            dirty: true,
          });
          return;
        }
        hydrate(result.applied);
      },
      onError,
    }),
  );

  async function reload() {
    const result = await refetch();
    if (!result.data) return;
    const normalized = normalizeConvergenceSettings(result.data);
    hydrate(normalized);
    queryClient.setQueryData(['convergence-settings'], normalized);
  }

  function save() {
    saveMutation.mutate(useConvergenceSettingsStore.getState().settings);
  }

  return {
    settings,
    dirty,
    isLoading,
    isSaving: saveMutation.isPending,
    updateSetting,
    reload,
    save,
  };
}
