// WHY: Shared Zustand store for runtime settings VALUES.
// This is the single source of truth for the current runtime settings state.
// All consumers (Pipeline Settings FlowCard, LLM Config Page, Indexing Page)
// read from and write to this one store instead of maintaining separate
// local useState copies.
//
// settingsAuthorityStore.ts remains separate — it tracks readiness FLAGS
// (runtimeReady, etc.), not values. This store holds the actual settings.

import { create } from 'zustand';
import type { RuntimeSettings } from '../features/pipeline-settings/index.ts';

interface RuntimeSettingsValueState {
  /** The canonical runtime settings values. Every consumer reads from here. */
  values: RuntimeSettings | null;
  /** Whether the first server hydration has been applied. */
  hydrated: boolean;
  /** Whether any consumer has unsaved edits. */
  dirty: boolean;
  /** Apply server-fetched settings (initial hydration or reload). */
  hydrate: (settings: RuntimeSettings) => void;
  /** Update a single key (user edit). Marks dirty. */
  updateKey: (key: string, value: unknown) => void;
  /** Bulk-update multiple keys (user edit). Marks dirty. */
  updateKeys: (patch: Partial<RuntimeSettings>) => void;
  /** Mark as clean (after successful save). */
  markClean: () => void;
  /** Replace entire values object (e.g. after normalization). */
  replaceValues: (values: RuntimeSettings) => void;
  /** Force hydration even if dirty (for initial load). */
  forceHydrate: (settings: RuntimeSettings) => void;
  /** Merge server-fetched keys without marking dirty or hydrated.
   * WHY: LLM policy hydration must seed flat keys into the store without
   * triggering the dirty flag. If updateKeys were used, dirty would block
   * the subsequent runtime-settings hydrate() call, causing data loss. */
  hydrateKeys: (patch: Partial<RuntimeSettings>) => void;
}

export const useRuntimeSettingsValueStore = create<RuntimeSettingsValueState>(
  (set, get) => ({
    values: null,
    hydrated: false,
    dirty: false,

    hydrate: (settings) => {
      const state = get();
      // WHY: First hydration always applies. Subsequent hydrations only apply
      // when the user has no pending edits (dirty = false). This prevents
      // a server refresh from overwriting the user's in-progress edits.
      if (state.hydrated && state.dirty) return;
      // WHY: Merge onto pre-seeded values (from hydrateKeys) rather than
      // replacing them. This preserves LLM flat keys that were seeded
      // before the runtime-settings query completed.
      const merged = state.values ? { ...state.values, ...settings } : settings;
      set({ values: merged, hydrated: true, dirty: false });
    },

    forceHydrate: (settings) => {
      set({ values: settings, hydrated: true, dirty: false });
    },

    hydrateKeys: (patch) => {
      const current = get().values;
      if (!current) {
        // WHY: Store is empty — seed with the patch but leave dirty=false
        // and hydrated=false. The full hydrate() from /runtime-settings
        // will merge on top and set hydrated=true.
        set({ values: patch as RuntimeSettings });
        return;
      }
      // WHY: Store already has values — merge without marking dirty.
      // This supports LLM reload() and initial hydration paths.
      set({ values: { ...current, ...patch } as RuntimeSettings });
    },

    updateKey: (key, value) => {
      const current = get().values;
      if (!current) return;
      set({
        values: { ...current, [key]: value } as RuntimeSettings,
        dirty: true,
      });
    },

    updateKeys: (patch) => {
      const current = get().values;
      if (!current) {
        // WHY: If the store hasn't been hydrated yet (values is null), treat
        // the patch as initial values. This prevents the LLM hydration from
        // silently dropping data when /llm-config is opened before /pipeline-settings.
        set({ values: patch as RuntimeSettings, dirty: true });
        return;
      }
      set({
        values: { ...current, ...patch } as RuntimeSettings,
        dirty: true,
      });
    },

    markClean: () => set({ dirty: false }),

    replaceValues: (values) => set({ values, dirty: get().dirty }),
  }),
);

/** Read current values outside React (for mutations, snapshot building). */
export function readRuntimeSettingsValues(): RuntimeSettings | null {
  return useRuntimeSettingsValueStore.getState().values;
}

/** Read dirty flag outside React. */
export function isRuntimeSettingsDirty(): boolean {
  return useRuntimeSettingsValueStore.getState().dirty;
}

/** Read hydration status outside React. */
export function isRuntimeSettingsHydrated(): boolean {
  return useRuntimeSettingsValueStore.getState().hydrated;
}
