import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS, STORAGE_SETTING_DEFAULTS } from '../../../stores/settingsManifest';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';

export type StorageDestination = 'local' | 's3';

export interface StorageSettingsResponse {
  enabled: boolean;
  destinationType: StorageDestination;
  localDirectory: string;
  awsRegion: string;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  hasS3SecretAccessKey: boolean;
  hasS3SessionToken: boolean;
  stagingTempDirectory?: string;
  updatedAt: string | null;
}

export interface StorageSettingsPayload {
  enabled: boolean;
  destinationType: StorageDestination;
  localDirectory: string;
  awsRegion: string;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  s3SecretAccessKey?: string;
  clearS3SecretAccessKey?: boolean;
  s3SessionToken?: string;
  clearS3SessionToken?: boolean;
}

interface StorageSettingsAuthorityOptions {
  payload: StorageSettingsPayload;
  dirty: boolean;
  autoSaveEnabled: boolean;
  enabled?: boolean;
  onPersisted?: (settings: StorageSettingsResponse) => void;
  onError?: (error: Error | unknown) => void;
}

interface StorageSettingsAuthorityResult {
  settings: StorageSettingsResponse | undefined;
  isLoading: boolean;
  isSaving: boolean;
  reload: () => Promise<StorageSettingsResponse | undefined>;
  saveNow: () => void;
}

interface StorageSettingsReaderOptions {
  enabled?: boolean;
}

interface StorageSettingsReaderResult {
  settings: StorageSettingsResponse | undefined;
  isLoading: boolean;
  reload: () => Promise<StorageSettingsResponse | undefined>;
}

export const STORAGE_SETTINGS_QUERY_KEY = ['storage-settings'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStorageDestination(value: unknown): StorageDestination {
  return String(value || '').trim().toLowerCase() === 's3' ? 's3' : 'local';
}

function readStorageString(
  source: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return fallback;
  const value = source[key];
  if (value == null) return fallback;
  return String(value);
}

function sanitizeStorageSettingsResponse(raw: Record<string, unknown>): StorageSettingsResponse {
  return {
    enabled: Object.prototype.hasOwnProperty.call(raw, 'enabled')
      ? Boolean(raw.enabled)
      : STORAGE_SETTING_DEFAULTS.enabled,
    destinationType: normalizeStorageDestination(raw.destinationType),
    localDirectory: readStorageString(raw, 'localDirectory', STORAGE_SETTING_DEFAULTS.localDirectory),
    awsRegion: readStorageString(raw, 'awsRegion', STORAGE_SETTING_DEFAULTS.awsRegion),
    s3Bucket: readStorageString(raw, 's3Bucket', STORAGE_SETTING_DEFAULTS.s3Bucket),
    s3Prefix: readStorageString(raw, 's3Prefix', STORAGE_SETTING_DEFAULTS.s3Prefix),
    s3AccessKeyId: readStorageString(raw, 's3AccessKeyId', STORAGE_SETTING_DEFAULTS.s3AccessKeyId),
    hasS3SecretAccessKey: Boolean(raw.hasS3SecretAccessKey),
    hasS3SessionToken: Boolean(raw.hasS3SessionToken),
    stagingTempDirectory: raw.stagingTempDirectory == null
      ? undefined
      : String(raw.stagingTempDirectory),
    updatedAt: raw.updatedAt == null ? null : String(raw.updatedAt),
  };
}

function applyStoragePayloadOptimistically(
  payload: StorageSettingsPayload,
  previous: StorageSettingsResponse | undefined,
): StorageSettingsResponse {
  const base: StorageSettingsResponse = previous || {
    enabled: STORAGE_SETTING_DEFAULTS.enabled,
    destinationType: STORAGE_SETTING_DEFAULTS.destinationType,
    localDirectory: STORAGE_SETTING_DEFAULTS.localDirectory,
    awsRegion: STORAGE_SETTING_DEFAULTS.awsRegion,
    s3Bucket: STORAGE_SETTING_DEFAULTS.s3Bucket,
    s3Prefix: STORAGE_SETTING_DEFAULTS.s3Prefix,
    s3AccessKeyId: STORAGE_SETTING_DEFAULTS.s3AccessKeyId,
    hasS3SecretAccessKey: false,
    hasS3SessionToken: false,
    updatedAt: null,
  };
  const hasSecretOverride = typeof payload.s3SecretAccessKey === 'string';
  const hasSessionOverride = typeof payload.s3SessionToken === 'string';
  return {
    ...base,
    enabled: Boolean(payload.enabled),
    destinationType: payload.destinationType,
    localDirectory: payload.localDirectory,
    awsRegion: payload.awsRegion,
    s3Bucket: payload.s3Bucket,
    s3Prefix: payload.s3Prefix,
    s3AccessKeyId: payload.s3AccessKeyId,
    hasS3SecretAccessKey: payload.clearS3SecretAccessKey ? false : (hasSecretOverride || base.hasS3SecretAccessKey),
    hasS3SessionToken: payload.clearS3SessionToken ? false : (hasSessionOverride || base.hasS3SessionToken),
  };
}

export function readStorageSettingsSnapshot(queryClient: QueryClient): StorageSettingsResponse | undefined {
  const cached = queryClient.getQueryData<unknown>(STORAGE_SETTINGS_QUERY_KEY);
  if (!isObject(cached)) return undefined;
  return sanitizeStorageSettingsResponse(cached);
}

export function readStorageSettingsBootstrap(queryClient: QueryClient): StorageSettingsResponse {
  const source = queryClient.getQueryData<unknown>(STORAGE_SETTINGS_QUERY_KEY);
  const snapshot = isObject(source) ? source : {};
  return {
    enabled: Object.prototype.hasOwnProperty.call(snapshot, 'enabled')
      ? Boolean(snapshot.enabled)
      : STORAGE_SETTING_DEFAULTS.enabled,
    destinationType: normalizeStorageDestination(snapshot.destinationType),
    localDirectory: readStorageString(snapshot, 'localDirectory', STORAGE_SETTING_DEFAULTS.localDirectory),
    awsRegion: readStorageString(snapshot, 'awsRegion', STORAGE_SETTING_DEFAULTS.awsRegion),
    s3Bucket: readStorageString(snapshot, 's3Bucket', STORAGE_SETTING_DEFAULTS.s3Bucket),
    s3Prefix: readStorageString(snapshot, 's3Prefix', STORAGE_SETTING_DEFAULTS.s3Prefix),
    s3AccessKeyId: readStorageString(snapshot, 's3AccessKeyId', STORAGE_SETTING_DEFAULTS.s3AccessKeyId),
    hasS3SecretAccessKey: Boolean(snapshot.hasS3SecretAccessKey),
    hasS3SessionToken: Boolean(snapshot.hasS3SessionToken),
    stagingTempDirectory: snapshot.stagingTempDirectory == null
      ? undefined
      : String(snapshot.stagingTempDirectory),
    updatedAt: snapshot.updatedAt == null ? null : String(snapshot.updatedAt),
  };
}

export function useStorageSettingsBootstrap(): StorageSettingsResponse {
  const queryClient = useQueryClient();
  return useMemo(
    () => readStorageSettingsBootstrap(queryClient),
    [queryClient],
  );
}

export function useStorageSettingsReader({
  enabled = true,
}: StorageSettingsReaderOptions = {}): StorageSettingsReaderResult {
  const queryClient = useQueryClient();
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: STORAGE_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const result = await api.get<Record<string, unknown>>('/storage-settings');
      return sanitizeStorageSettingsResponse(result);
    },
    enabled,
  });

  async function reload() {
    const result = await refetch();
    if (!result.data) return undefined;
    queryClient.setQueryData(STORAGE_SETTINGS_QUERY_KEY, result.data);
    return result.data;
  }

  return {
    settings,
    isLoading,
    reload,
  };
}

export function useStorageSettingsAuthority({
  payload,
  dirty,
  autoSaveEnabled,
  enabled = true,
  onPersisted,
  onError,
}: StorageSettingsAuthorityOptions): StorageSettingsAuthorityResult {
  const queryClient = useQueryClient();
  const payloadFingerprint = autoSaveFingerprint(payload);

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: STORAGE_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const result = await api.get<Record<string, unknown>>('/storage-settings');
      return sanitizeStorageSettingsResponse(result);
    },
    enabled,
  });

  const payloadRef = useRef(payload);
  const payloadFingerprintRef = useRef(payloadFingerprint);
  const dirtyRef = useRef(dirty);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  const lastAutoSavedFingerprintRef = useRef('');
  const lastAutoSaveAttemptFingerprintRef = useRef('');
  const pendingAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  payloadRef.current = payload;
  payloadFingerprintRef.current = payloadFingerprint;
  dirtyRef.current = dirty;
  autoSaveEnabledRef.current = autoSaveEnabled;

  const persistStorageSettings = async (nextPayload: StorageSettingsPayload, emitState = true) => {
    try {
      const response = await api.put<Record<string, unknown>>('/storage-settings', nextPayload);
      const nextSettings = sanitizeStorageSettingsResponse(response);
      queryClient.setQueryData(STORAGE_SETTINGS_QUERY_KEY, nextSettings);
      if (emitState) {
        onPersisted?.(nextSettings);
      }
      const savedFingerprint = autoSaveFingerprint(nextPayload);
      lastAutoSavedFingerprintRef.current = savedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
      publishSettingsPropagation({ domain: 'storage' });
      return nextSettings;
    } catch (error) {
      if (emitState) {
        onError?.(error);
      } else {
        console.error('Storage settings autosave failed:', error);
      }
      return undefined;
    }
  };

  const saveMutation = useMutation(
    createSettingsOptimisticMutationContract<
      StorageSettingsPayload,
      Record<string, unknown>,
      StorageSettingsResponse,
      StorageSettingsResponse
    >({
      queryClient,
      queryKey: STORAGE_SETTINGS_QUERY_KEY,
      mutationFn: (nextPayload) => api.put<Record<string, unknown>>('/storage-settings', nextPayload),
      toOptimisticData: (nextPayload, previousData) => applyStoragePayloadOptimistically(nextPayload, previousData),
      toAppliedData: (response) => sanitizeStorageSettingsResponse(response),
      toPersistedResult: (_response, _nextPayload, _previousData, appliedData) => appliedData,
      onPersisted: (nextSettings, nextPayload) => {
        onPersisted?.(nextSettings);
        const savedFingerprint = autoSaveFingerprint(nextPayload);
        lastAutoSavedFingerprintRef.current = savedFingerprint;
        lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
        publishSettingsPropagation({ domain: 'storage' });
      },
      onError,
    }),
  );
  const saveMutate = saveMutation.mutate;

  useEffect(() => {
    if (!autoSaveEnabled || !dirty || !payloadFingerprint) return;
    if (payloadFingerprint === lastAutoSavedFingerprintRef.current) return;
    if (payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
    const nextPayload = payloadRef.current;
    lastAutoSaveAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      pendingAutoSaveTimerRef.current = null;
      saveMutate(nextPayload);
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.storage);
    pendingAutoSaveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (pendingAutoSaveTimerRef.current === timer) {
        pendingAutoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, dirty, payloadFingerprint, saveMutate]);

  useEffect(() => {
    return () => {
      const hadPendingAutoSaveTimer = Boolean(pendingAutoSaveTimerRef.current);
      if (pendingAutoSaveTimerRef.current) {
        clearTimeout(pendingAutoSaveTimerRef.current);
        pendingAutoSaveTimerRef.current = null;
      }
      if (!dirtyRef.current || !autoSaveEnabledRef.current) return;
      const nextFingerprint = payloadFingerprintRef.current;
      if (!nextFingerprint) return;
      if (nextFingerprint === lastAutoSavedFingerprintRef.current) return;
      if (!hadPendingAutoSaveTimer && nextFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
      lastAutoSaveAttemptFingerprintRef.current = nextFingerprint;
      void persistStorageSettings(payloadRef.current, false);
    };
  }, []);

  async function reload() {
    const result = await refetch();
    if (!result.data) return undefined;
    queryClient.setQueryData(STORAGE_SETTINGS_QUERY_KEY, result.data);
    const loadedFingerprint = autoSaveFingerprint(result.data);
    lastAutoSavedFingerprintRef.current = loadedFingerprint;
    lastAutoSaveAttemptFingerprintRef.current = loadedFingerprint;
    return result.data;
  }

  function saveNow() {
    saveMutation.mutate(payloadRef.current);
  }

  return {
    settings,
    isLoading,
    isSaving: saveMutation.isPending,
    reload,
    saveNow,
  };
}
