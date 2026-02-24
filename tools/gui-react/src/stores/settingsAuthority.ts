import { useEffect, useRef } from 'react';
import { useConvergenceSettingsAuthority } from './convergenceSettingsAuthority';
import { useRuntimeSettingsAuthority } from './runtimeSettingsAuthority';
import { useStorageSettingsAuthority } from './storageSettingsAuthority';
import { useSourceStrategyAuthority } from './sourceStrategyAuthority';
import { useLlmSettingsAuthority } from './llmSettingsAuthority';
import { useUiSettingsAuthority } from './uiSettingsAuthority';
import { STORAGE_SETTING_DEFAULTS } from './settingsManifest';
import type { LlmRouteRow } from '../types/llmSettings';
import { useUiStore } from './uiStore';
import { autoSaveFingerprint } from './autoSaveFingerprint';

export interface SettingsAuthoritySnapshot {
  category: string;
  runtimeReady: boolean;
  convergenceReady: boolean;
  storageReady: boolean;
  sourceStrategyReady: boolean;
  llmSettingsReady: boolean;
  uiSettingsReady: boolean;
  autoSaveAllEnabled: boolean;
  storageAutoSaveEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  llmSettingsAutoSaveEnabled: boolean;
}

const EMPTY_RUNTIME_PAYLOAD = {};
const EMPTY_STORAGE_PAYLOAD = {
  enabled: STORAGE_SETTING_DEFAULTS.enabled,
  destinationType: 'local' as const,
  localDirectory: '',
  s3Region: STORAGE_SETTING_DEFAULTS.s3Region,
  s3Bucket: STORAGE_SETTING_DEFAULTS.s3Bucket,
  s3Prefix: STORAGE_SETTING_DEFAULTS.s3Prefix,
  s3AccessKeyId: '',
};
const EMPTY_LLM_ROWS: LlmRouteRow[] = [];

export function useSettingsAuthorityBootstrap(): SettingsAuthoritySnapshot {
  const category = useUiStore((s) => s.category);
  const autoSaveAllEnabled = useUiStore((s) => s.autoSaveAllEnabled);
  const autoSaveEnabled = useUiStore((s) => s.autoSaveEnabled);
  const autoSaveMapEnabled = useUiStore((s) => s.autoSaveMapEnabled);
  const storageAutoSaveEnabled = useUiStore((s) => s.storageAutoSaveEnabled);
  const runtimeAutoSaveEnabled = useUiStore((s) => s.runtimeAutoSaveEnabled);
  const llmSettingsAutoSaveEnabled = useUiStore((s) => s.llmSettingsAutoSaveEnabled);
  const setAutoSaveAllEnabled = useUiStore((s) => s.setAutoSaveAllEnabled);
  const setAutoSaveEnabled = useUiStore((s) => s.setAutoSaveEnabled);
  const setAutoSaveMapEnabled = useUiStore((s) => s.setAutoSaveMapEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((s) => s.setRuntimeAutoSaveEnabled);
  const setStorageAutoSaveEnabled = useUiStore((s) => s.setStorageAutoSaveEnabled);
  const setLlmSettingsAutoSaveEnabled = useUiStore((s) => s.setLlmSettingsAutoSaveEnabled);

  const runtime = useRuntimeSettingsAuthority({
    payload: EMPTY_RUNTIME_PAYLOAD,
    dirty: false,
    autoSaveEnabled: false,
  });
  const convergence = useConvergenceSettingsAuthority();
  const storage = useStorageSettingsAuthority({
    payload: EMPTY_STORAGE_PAYLOAD,
    dirty: false,
    autoSaveEnabled: false,
  });
  const sourceStrategy = useSourceStrategyAuthority({ category });
  const llm = useLlmSettingsAuthority({
    category,
    enabled: category !== 'all',
    rows: EMPTY_LLM_ROWS,
    dirty: false,
    autoSaveEnabled: false,
    editVersion: 0,
  });
  const uiSettings = useUiSettingsAuthority();
  const uiSettingsLoading = uiSettings.isLoading;
  const uiSettingsData = uiSettings.settings;
  const reloadUiSettings = uiSettings.reload;
  const saveUiSettings = uiSettings.saveNow;

  const bootstrappedRef = useRef(false);
  const uiSettingsHydratedRef = useRef(false);
  const skipNextUiPersistRef = useRef(false);
  const lastUiAutosaveFingerprintRef = useRef('');

  const uiAutoSavePayload = {
    studioAutoSaveAllEnabled: autoSaveAllEnabled,
    studioAutoSaveEnabled: autoSaveEnabled,
    studioAutoSaveMapEnabled: autoSaveMapEnabled,
    runtimeAutoSaveEnabled,
    storageAutoSaveEnabled,
    llmSettingsAutoSaveEnabled,
  };

  useEffect(() => {
    if (!uiSettingsData) return;
    lastUiAutosaveFingerprintRef.current = autoSaveFingerprint(uiSettingsData);
  }, [uiSettingsData]);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void runtime.reload();
    void convergence.reload();
    void storage.reload();
    void sourceStrategy.reload();
    void reloadUiSettings();
    if (category !== 'all') {
      void llm.reload();
    }
  }, [runtime, convergence, storage, sourceStrategy, category, llm, reloadUiSettings]);

  useEffect(() => {
    if (uiSettingsHydratedRef.current) return;
    if (uiSettingsLoading) return;
    const serverSettings = uiSettingsData;
    if (serverSettings) {
      skipNextUiPersistRef.current = true;
      if (serverSettings.studioAutoSaveAllEnabled) {
        setAutoSaveEnabled(serverSettings.studioAutoSaveEnabled);
        setAutoSaveMapEnabled(serverSettings.studioAutoSaveMapEnabled);
      } else {
        setAutoSaveAllEnabled(false);
        setAutoSaveEnabled(serverSettings.studioAutoSaveEnabled);
        setAutoSaveMapEnabled(serverSettings.studioAutoSaveMapEnabled);
      }
      setRuntimeAutoSaveEnabled(serverSettings.runtimeAutoSaveEnabled);
      setStorageAutoSaveEnabled(serverSettings.storageAutoSaveEnabled);
      setLlmSettingsAutoSaveEnabled(serverSettings.llmSettingsAutoSaveEnabled);
      setAutoSaveAllEnabled(serverSettings.studioAutoSaveAllEnabled);
    }
    uiSettingsHydratedRef.current = true;
  }, [
    uiSettingsLoading,
    uiSettingsData,
    setAutoSaveEnabled,
    setAutoSaveMapEnabled,
    setRuntimeAutoSaveEnabled,
    setStorageAutoSaveEnabled,
    setLlmSettingsAutoSaveEnabled,
    setAutoSaveAllEnabled,
  ]);

  useEffect(() => {
    if (!uiSettingsHydratedRef.current) return;
    if (skipNextUiPersistRef.current) {
      skipNextUiPersistRef.current = false;
      return;
    }
    const nextFingerprint = autoSaveFingerprint(uiAutoSavePayload);
    if (nextFingerprint && nextFingerprint === lastUiAutosaveFingerprintRef.current) return;
    const timer = setTimeout(() => {
      saveUiSettings(uiAutoSavePayload);
      lastUiAutosaveFingerprintRef.current = nextFingerprint;
    }, 250);
    return () => clearTimeout(timer);
  }, [
    uiAutoSavePayload,
    saveUiSettings,
  ]);

  return {
    category,
    runtimeReady: !runtime.isLoading,
    convergenceReady: !convergence.isLoading,
    storageReady: !storage.isLoading,
    sourceStrategyReady: !sourceStrategy.isLoading,
    llmSettingsReady: category === 'all' ? true : !llm.isLoading,
    uiSettingsReady: !uiSettingsLoading,
    autoSaveAllEnabled,
    storageAutoSaveEnabled,
    runtimeAutoSaveEnabled,
    llmSettingsAutoSaveEnabled,
  };
}
