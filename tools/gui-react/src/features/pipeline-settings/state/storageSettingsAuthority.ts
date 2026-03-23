import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS, STORAGE_SETTING_DEFAULTS } from '../../../stores/settingsManifest';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';
import { useSettingsAutoSaveEffect } from './useSettingsAutoSaveEffect';

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
  initialHydrationApplied?: boolean;
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

// WHY: Single sanitizer for API response → StorageSettingsResponse. Previously
// duplicated in sanitizeStorageSettingsResponse() and readStorageSettingsBootstrap().
function buildStorageSettingsFromRaw(raw: Record<string, unknown>): StorageSettingsResponse {
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
  const base: StorageSettingsResponse = previous ?? {
    ...STORAGE_SETTING_DEFAULTS,
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
  return buildStorageSettingsFromRaw(cached);
}

export function readStorageSettingsBootstrap(queryClient: QueryClient): StorageSettingsResponse {
  const source = queryClient.getQueryData<unknown>(STORAGE_SETTINGS_QUERY_KEY);
  return buildStorageSettingsFromRaw(isObject(source) ? source : {});
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
      return buildStorageSettingsFromRaw(result);
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
  initialHydrationApplied = true,
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
      return buildStorageSettingsFromRaw(result);
    },
    enabled,
  });

  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const saveFnRef = useRef<() => void>(() => {});
  const getUnloadBody = useCallback(() => payloadRef.current, []);

  const { markSaved, clearAttemptFingerprint, seedFingerprint } =
    useSettingsAutoSaveEffect({
      domain: 'storage',
      debounceMs: SETTINGS_AUTOSAVE_DEBOUNCE_MS.storage,
      payloadFingerprint,
      dirty,
      autoSaveEnabled,
      initialHydrationApplied,
      saveFn: () => saveFnRef.current(),
      getUnloadBody,
      unloadUrl: '/api/v1/storage-settings',
    });

  const handleAutoSaveError = (error: Error | unknown) => {
    clearAttemptFingerprint();
    onError?.(error);
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
      toAppliedData: (response) => {
        // WHY: Prefer snapshot from standardized envelope; fall back to top-level for compat.
        const source = response && typeof response === 'object' && 'snapshot' in response
          && response.snapshot && typeof response.snapshot === 'object'
          ? response.snapshot as Record<string, unknown>
          : response;
        return buildStorageSettingsFromRaw(source);
      },
      toPersistedResult: (_response, _nextPayload, _previousData, appliedData) => appliedData,
      onPersisted: (nextSettings, nextPayload) => {
        onPersisted?.(nextSettings);
        markSaved(autoSaveFingerprint(nextPayload));
        publishSettingsPropagation({ domain: 'storage' });
      },
      onError: handleAutoSaveError,
    }),
  );
  saveFnRef.current = () => saveMutation.mutate(payloadRef.current);

  async function reload() {
    const result = await refetch();
    if (!result.data) return undefined;
    queryClient.setQueryData(STORAGE_SETTINGS_QUERY_KEY, result.data);
    seedFingerprint(autoSaveFingerprint(result.data));
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
