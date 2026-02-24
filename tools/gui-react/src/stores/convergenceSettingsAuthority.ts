import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '../api/client';
export { CONVERGENCE_KNOB_GROUPS } from './settingsManifest';

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
  onPersisted?: (result: ConvergenceSettingsPersistResult) => void;
  onError?: (error: Error | unknown) => void;
}

const useConvergenceSettingsStore = create<ConvergenceSettingsState>((set) => ({
  settings: {},
  dirty: false,
  hydrate: (settings) => set({ settings: { ...settings }, dirty: false }),
  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
      dirty: true,
    })),
}));

export function useConvergenceSettingsAuthority({
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
  });

  useEffect(() => {
    if (!data) return;
    if (dirty) return;
    hydrate(data);
  }, [data, dirty, hydrate]);

  const saveMutation = useMutation({
    mutationFn: (payload: ConvergenceSettings) =>
      api.put<{ ok: boolean; applied: ConvergenceSettings; rejected?: Record<string, string> }>('/convergence-settings', payload),
    onSuccess: (response) => {
      const responseApplied = response?.applied && typeof response.applied === 'object'
        ? response.applied as ConvergenceSettings
        : useConvergenceSettingsStore.getState().settings;
      const rejected = response?.rejected && typeof response.rejected === 'object'
        ? response.rejected as Record<string, string>
        : {};
      const hasRejected = Object.keys(rejected).length > 0;
      const current = useConvergenceSettingsStore.getState().settings;
      const applied = { ...current, ...responseApplied };
      queryClient.setQueryData(['convergence-settings'], applied);
      onPersisted?.({
        ok: response?.ok !== false && !hasRejected,
        applied,
        rejected,
      });
      if (hasRejected) {
        useConvergenceSettingsStore.setState({
          settings: applied,
          dirty: true,
        });
        return;
      }
      hydrate(applied as ConvergenceSettings);
    },
    onError,
  });

  async function reload() {
    const result = await refetch();
    if (!result.data) return;
    hydrate(result.data);
    queryClient.setQueryData(['convergence-settings'], result.data);
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
