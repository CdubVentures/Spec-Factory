import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { autoSaveFingerprint } from './autoSaveFingerprint';

export type StorageDestination = 'local' | 's3';

export interface StorageSettingsResponse {
  enabled: boolean;
  destinationType: StorageDestination;
  localDirectory: string;
  s3Region: string;
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
  s3Region: string;
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

const STORAGE_SETTINGS_QUERY_KEY = ['storage-settings'];

function sanitizeStorageSettingsResponse(raw: Record<string, unknown>): StorageSettingsResponse {
  return {
    enabled: Boolean(raw.enabled),
    destinationType: String(raw.destinationType || 'local').trim().toLowerCase() === 's3'
      ? 's3'
      : 'local',
    localDirectory: String(raw.localDirectory || ''),
    s3Region: String(raw.s3Region || ''),
    s3Bucket: String(raw.s3Bucket || ''),
    s3Prefix: String(raw.s3Prefix || ''),
    s3AccessKeyId: String(raw.s3AccessKeyId || ''),
    hasS3SecretAccessKey: Boolean(raw.hasS3SecretAccessKey),
    hasS3SessionToken: Boolean(raw.hasS3SessionToken),
    stagingTempDirectory: raw.stagingTempDirectory == null
      ? undefined
      : String(raw.stagingTempDirectory),
    updatedAt: raw.updatedAt == null ? null : String(raw.updatedAt),
  };
}

export function useStorageSettingsAuthority({
  payload,
  dirty,
  autoSaveEnabled,
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
  });

  const payloadRef = useRef(payload);
  const payloadFingerprintRef = useRef(payloadFingerprint);
  const dirtyRef = useRef(dirty);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  const lastAutoSavedFingerprintRef = useRef('');
  const lastAutoSaveAttemptFingerprintRef = useRef('');
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

  const saveMutation = useMutation({
    mutationFn: (nextPayload: StorageSettingsPayload) => api.put<Record<string, unknown>>('/storage-settings', nextPayload),
    onSuccess: (response, nextPayload) => {
      const nextSettings = sanitizeStorageSettingsResponse(response);
      queryClient.setQueryData(STORAGE_SETTINGS_QUERY_KEY, nextSettings);
      onPersisted?.(nextSettings);
      const savedFingerprint = autoSaveFingerprint(nextPayload);
      lastAutoSavedFingerprintRef.current = savedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
    },
    onError,
  });
  const saveMutate = saveMutation.mutate;

  useEffect(() => {
    if (!autoSaveEnabled || !dirty || !payloadFingerprint) return;
    if (payloadFingerprint === lastAutoSavedFingerprintRef.current) return;
    if (payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
    const nextPayload = payloadRef.current;
    lastAutoSaveAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      saveMutate(nextPayload);
    }, 700);
    return () => clearTimeout(timer);
  }, [autoSaveEnabled, dirty, payloadFingerprint, saveMutate]);

  useEffect(() => {
    return () => {
      if (!dirtyRef.current || !autoSaveEnabledRef.current) return;
      const nextFingerprint = payloadFingerprintRef.current;
      if (!nextFingerprint) return;
      if (nextFingerprint === lastAutoSavedFingerprintRef.current) return;
      if (nextFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
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
