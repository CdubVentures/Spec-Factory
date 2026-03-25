import { create } from 'zustand';

export interface SettingsAuthorityStoreSnapshot {
  category: string;
  runtimeReady: boolean;
  storageReady: boolean;
  sourceStrategyReady: boolean;
  llmSettingsReady: boolean;
  uiSettingsReady: boolean;
  uiSettingsPersistState: 'idle' | 'saving' | 'error';
  uiSettingsPersistMessage: string;
  autoSaveAllEnabled: boolean;
  storageAutoSaveEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
}

interface SettingsAuthorityStoreState {
  hydrated: boolean;
  snapshot: SettingsAuthorityStoreSnapshot;
  hydrateOnce: (snapshot: SettingsAuthorityStoreSnapshot) => void;
  patchSnapshot: (patch: Partial<SettingsAuthorityStoreSnapshot> | SettingsAuthorityStoreSnapshot) => void;
  resetSnapshot: () => void;
}

const DEFAULT_SNAPSHOT: SettingsAuthorityStoreSnapshot = {
  category: 'all',
  runtimeReady: false,
  storageReady: false,
  sourceStrategyReady: false,
  llmSettingsReady: false,
  uiSettingsReady: false,
  uiSettingsPersistState: 'idle',
  uiSettingsPersistMessage: '',
  autoSaveAllEnabled: false,
  storageAutoSaveEnabled: false,
  runtimeAutoSaveEnabled: false,
};

function mergeSnapshot(
  current: SettingsAuthorityStoreSnapshot,
  patch: Partial<SettingsAuthorityStoreSnapshot> | SettingsAuthorityStoreSnapshot,
): SettingsAuthorityStoreSnapshot {
  return {
    ...current,
    ...patch,
  };
}

export const useSettingsAuthorityStore = create<SettingsAuthorityStoreState>((set, get) => ({
  hydrated: false,
  snapshot: DEFAULT_SNAPSHOT,
  hydrateOnce: (snapshot) => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      snapshot: mergeSnapshot(DEFAULT_SNAPSHOT, snapshot),
    });
  },
  patchSnapshot: (patch) => {
    const state = get();
    if (!state.hydrated) {
      set({
        hydrated: true,
        snapshot: mergeSnapshot(DEFAULT_SNAPSHOT, patch),
      });
      return;
    }
    set({
      snapshot: mergeSnapshot(state.snapshot, patch),
    });
  },
  resetSnapshot: () => {
    set({
      hydrated: false,
      snapshot: DEFAULT_SNAPSHOT,
    });
  },
}));

export function readSettingsAuthoritySnapshot(): SettingsAuthorityStoreSnapshot {
  return useSettingsAuthorityStore.getState().snapshot;
}
