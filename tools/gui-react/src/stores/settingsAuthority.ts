import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { readRuntimeSettingsSnapshot, useRuntimeSettingsReader } from '../features/pipeline-settings/index.ts';
import { readSourceStrategySnapshot, sourceStrategyQueryKey, useSourceStrategyReader } from '../features/pipeline-settings/index.ts';
import { readUiSettingsSnapshot, useUiSettingsAuthority } from './uiSettingsAuthority.ts';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from './settingsManifest.ts';
import { useUiStore } from './uiStore.ts';
import { autoSaveFingerprint } from './autoSaveFingerprint.ts';
import { useSettingsAuthorityStore } from './settingsAuthorityStore.ts';
import { subscribeSettingsPropagation, type SettingsPropagationEvent } from './settingsPropagationContract.ts';
import {
  registerUnloadGuard,
} from './settingsUnloadGuard.ts';

export interface SettingsAuthoritySnapshot {
  category: string;
  runtimeReady: boolean;
  sourceStrategyReady: boolean;
  uiSettingsReady: boolean;
  uiSettingsPersistState: 'idle' | 'saving' | 'error';
  uiSettingsPersistMessage: string;
  autoSaveAllEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
}

export function isSettingsAuthoritySnapshotReady(
  snapshot: SettingsAuthoritySnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  const baseReady = (
    snapshot.runtimeReady
    && snapshot.uiSettingsReady
  );
  if (!baseReady) return false;
  const category = String(snapshot.category || '').trim().toLowerCase();
  if (!category || category === 'all') {
    return true;
  }
  return snapshot.sourceStrategyReady;
}

interface SettingsHydrationPipelineOptions {
  category: string;
  runtimeReload: () => Promise<unknown>;
  sourceStrategyReload: () => Promise<unknown>;
  uiReload: () => Promise<unknown>;
}

async function runSettingsStartupHydrationPipeline({
  category,
  runtimeReload,
  sourceStrategyReload,
  uiReload,
}: SettingsHydrationPipelineOptions) {
  const reloadTasks: Promise<unknown>[] = [
    runtimeReload(),
    uiReload(),
  ];
  if (category !== 'all') {
    reloadTasks.push(sourceStrategyReload());
  }
  await Promise.allSettled(reloadTasks);
}

async function runCategoryScopedSettingsHydrationPipeline({
  category,
  sourceStrategyReload,
}: Pick<SettingsHydrationPipelineOptions, 'category' | 'sourceStrategyReload'>) {
  if (category === 'all') return;
  await Promise.allSettled([
    sourceStrategyReload(),
  ]);
}

export function useSettingsAuthorityBootstrap(): SettingsAuthoritySnapshot {
  const queryClient = useQueryClient();
  const category = useUiStore((s) => s.category);
  const autoSaveAllEnabled = useUiStore((s) => s.autoSaveAllEnabled);
  const autoSaveEnabled = useUiStore((s) => s.autoSaveEnabled);
  const autoSaveMapEnabled = useUiStore((s) => s.autoSaveMapEnabled);
  const runtimeAutoSaveEnabled = useUiStore((s) => s.runtimeAutoSaveEnabled);
  const setAutoSaveAllEnabled = useUiStore((s) => s.setAutoSaveAllEnabled);
  const setAutoSaveEnabled = useUiStore((s) => s.setAutoSaveEnabled);
  const setAutoSaveMapEnabled = useUiStore((s) => s.setAutoSaveMapEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((s) => s.setRuntimeAutoSaveEnabled);
  const [uiSettingsPersistState, setUiSettingsPersistState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [uiSettingsPersistMessage, setUiSettingsPersistMessage] = useState('');

  const runtime = useRuntimeSettingsReader({
    enabled: false,
  });
  const sourceStrategy = useSourceStrategyReader({
    category,
    enabled: category !== 'all',
    autoQueryEnabled: false,
  });
  const uiSettings = useUiSettingsAuthority({
    enabled: false,
    onPersisted: () => {
      const persistedFingerprint = lastUiAutosaveFingerprintRef.current;
      if (persistedFingerprint) {
        lastAppliedServerUiFingerprintRef.current = persistedFingerprint;
        lastUiAutosaveFingerprintRef.current = '';
      }
      setUiSettingsPersistState('idle');
      setUiSettingsPersistMessage('');
    },
    onError: (error) => {
      setUiSettingsPersistState('error');
      setUiSettingsPersistMessage(error instanceof Error ? error.message : 'Failed to save autosave settings.');
    },
  });
  const uiSettingsLoading = uiSettings.isLoading;
  const uiSettingsData = uiSettings.settings;
  const reloadUiSettings = uiSettings.reload;
  const saveUiSettings = uiSettings.saveNow;

  const startupHydratedRef = useRef(false);
  const hydratedCategoryRef = useRef<string | null>(null);
  const startupHydrationRunIdRef = useRef(0);
  const uiSettingsHydratedRef = useRef(false);
  const lastUiAutosaveFingerprintRef = useRef('');
  const lastAppliedServerUiFingerprintRef = useRef('');
  const runtimeReloadRef = useRef(runtime.reload);
  const sourceStrategyReloadRef = useRef(sourceStrategy.reload);
  const uiReloadRef = useRef(reloadUiSettings);
  const hydrateAuthoritySnapshot = useSettingsAuthorityStore((s) => s.hydrateOnce);
  const patchAuthoritySnapshot = useSettingsAuthorityStore((s) => s.patchSnapshot);

  runtimeReloadRef.current = runtime.reload;
  sourceStrategyReloadRef.current = sourceStrategy.reload;
  uiReloadRef.current = reloadUiSettings;

  const uiAutoSavePayload = {
    studioAutoSaveAllEnabled: autoSaveAllEnabled,
    studioAutoSaveEnabled: autoSaveEnabled,
    studioAutoSaveMapEnabled: autoSaveMapEnabled,
    runtimeAutoSaveEnabled,
  };
  const uiAutoSavePayloadRef = useRef(uiAutoSavePayload);
  uiAutoSavePayloadRef.current = uiAutoSavePayload;

  const hasRuntimeSnapshot = readRuntimeSettingsSnapshot(queryClient) !== undefined;
  const hasUiSettingsSnapshot = readUiSettingsSnapshot(queryClient) !== undefined;
  const hasSourceStrategySnapshot = category === 'all'
    ? true
    : readSourceStrategySnapshot(queryClient, category) !== undefined;

  const authoritySnapshot = useMemo<SettingsAuthoritySnapshot>(() => ({
    category,
    runtimeReady: hasRuntimeSnapshot,
    sourceStrategyReady: hasSourceStrategySnapshot,
    uiSettingsReady: hasUiSettingsSnapshot,
    uiSettingsPersistState,
    uiSettingsPersistMessage,
    autoSaveAllEnabled,
    runtimeAutoSaveEnabled,
  }), [
    category,
    hasRuntimeSnapshot,
    hasSourceStrategySnapshot,
    hasUiSettingsSnapshot,
    uiSettingsPersistState,
    uiSettingsPersistMessage,
    autoSaveAllEnabled,
    runtimeAutoSaveEnabled,
  ]);

  useEffect(() => {
    const runId = ++startupHydrationRunIdRef.current;
    let cancelled = false;

    const hydrate = async () => {
      if (!startupHydratedRef.current) {
        await runSettingsStartupHydrationPipeline({
          category,
          runtimeReload: runtimeReloadRef.current,
          sourceStrategyReload: sourceStrategyReloadRef.current,
          uiReload: uiReloadRef.current,
        });
        if (cancelled || runId !== startupHydrationRunIdRef.current) return;
        startupHydratedRef.current = true;
        hydratedCategoryRef.current = category;
        return;
      }
      if (hydratedCategoryRef.current === category) return;
      await runCategoryScopedSettingsHydrationPipeline({
        category,
        sourceStrategyReload: sourceStrategyReloadRef.current,
      });
      if (cancelled || runId !== startupHydrationRunIdRef.current) return;
      hydratedCategoryRef.current = category;
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    if (uiSettingsLoading) return;
    const serverSettings = uiSettingsData;
    if (!serverSettings) return;
    const shouldPreserveLocalStudioAutoSaveEnabled = (
      !serverSettings.studioAutoSaveAllEnabled
      && serverSettings.studioAutoSaveMapEnabled
      && serverSettings.studioAutoSaveEnabled
      && !autoSaveEnabled
      && autoSaveMapEnabled
    );
    const nextStudioAutoSaveEnabled = shouldPreserveLocalStudioAutoSaveEnabled
      ? false
      : serverSettings.studioAutoSaveEnabled;
    const serverFingerprint = autoSaveFingerprint(serverSettings);
    const localFingerprint = autoSaveFingerprint(uiAutoSavePayload);
    if (
      serverFingerprint
      && localFingerprint
      && localFingerprint !== serverFingerprint
      && lastUiAutosaveFingerprintRef.current
      && serverFingerprint !== lastUiAutosaveFingerprintRef.current
    ) {
      return;
    }
    if (serverFingerprint && serverFingerprint === lastAppliedServerUiFingerprintRef.current) {
      uiSettingsHydratedRef.current = true;
      lastUiAutosaveFingerprintRef.current = '';
      return;
    }
    if (serverSettings.studioAutoSaveAllEnabled) {
      setAutoSaveEnabled(nextStudioAutoSaveEnabled);
      setAutoSaveMapEnabled(serverSettings.studioAutoSaveMapEnabled);
    } else {
      setAutoSaveAllEnabled(false);
      setAutoSaveEnabled(nextStudioAutoSaveEnabled);
      setAutoSaveMapEnabled(serverSettings.studioAutoSaveMapEnabled);
    }
    setRuntimeAutoSaveEnabled(serverSettings.runtimeAutoSaveEnabled);
    setAutoSaveAllEnabled(serverSettings.studioAutoSaveAllEnabled);
    uiSettingsHydratedRef.current = true;
    lastAppliedServerUiFingerprintRef.current = serverFingerprint;
    lastUiAutosaveFingerprintRef.current = '';
  }, [
    uiSettingsLoading,
    uiSettingsData,
    uiAutoSavePayload,
    setAutoSaveEnabled,
    setAutoSaveMapEnabled,
    setRuntimeAutoSaveEnabled,
    setAutoSaveAllEnabled,
  ]);

  useEffect(() => {
    const handlePropagationEvent = (event: SettingsPropagationEvent) => {
      switch (event.domain) {
        case 'runtime': {
          void runtimeReloadRef.current();
          return;
        }
        case 'ui': {
          void uiReloadRef.current();
          return;
        }
        case 'source-strategy': {
          const scopedCategory = String(event.category || '').trim();
          if (!scopedCategory || scopedCategory.toLowerCase() === 'all') {
            if (category !== 'all') {
              void sourceStrategyReloadRef.current();
            }
            return;
          }
          queryClient.invalidateQueries({ queryKey: sourceStrategyQueryKey(scopedCategory) });
          if (category !== 'all' && scopedCategory === category) {
            void sourceStrategyReloadRef.current();
          }
          return;
        }
        default:
          return;
      }
    };

    return subscribeSettingsPropagation(handlePropagationEvent);
  }, [category, queryClient]);

  useEffect(() => {
    if (!uiSettingsHydratedRef.current) return;
    const nextFingerprint = autoSaveFingerprint(uiAutoSavePayload);
    if (nextFingerprint && nextFingerprint === lastAppliedServerUiFingerprintRef.current) {
      return;
    }
    if (nextFingerprint && nextFingerprint === lastUiAutosaveFingerprintRef.current) return;
    const timer = setTimeout(() => {
      setUiSettingsPersistState('saving');
      setUiSettingsPersistMessage('');
      saveUiSettings(uiAutoSavePayload);
      lastUiAutosaveFingerprintRef.current = nextFingerprint;
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.uiSettings);
    return () => clearTimeout(timer);
  }, [
    uiAutoSavePayload,
    saveUiSettings,
  ]);

  useEffect(() => {
    return registerUnloadGuard({
      domain: 'uiSettings',
      isDirty: () => {
        if (!uiSettingsHydratedRef.current) return false;
        const fp = autoSaveFingerprint(uiAutoSavePayloadRef.current);
        return Boolean(fp) && fp !== lastAppliedServerUiFingerprintRef.current;
      },
      getPayload: () => ({
        url: '/api/v1/ui-settings',
        method: 'PUT',
        body: uiAutoSavePayloadRef.current,
      }),
      markFlushed: () => {
        lastUiAutosaveFingerprintRef.current = autoSaveFingerprint(uiAutoSavePayloadRef.current);
      },
    });
  }, []);

  useEffect(() => {
    hydrateAuthoritySnapshot(authoritySnapshot);
    patchAuthoritySnapshot(authoritySnapshot);
  }, [hydrateAuthoritySnapshot, patchAuthoritySnapshot, authoritySnapshot]);

  return authoritySnapshot;
}
