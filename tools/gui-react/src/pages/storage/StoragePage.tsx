import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { wsManager } from '../../api/ws';
import { Spinner } from '../../components/common/Spinner';
import { StorageManagerPanel } from '../../features/storage-manager';
import { resolveStorageSettingsStatusText } from '../../shared/ui/feedback/settingsStatus';
import { usePersistedTab } from '../../stores/tabStore';
import { useUiStore } from '../../stores/uiStore';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import { STORAGE_DESTINATION_OPTIONS, STORAGE_SETTING_DEFAULTS, type StorageDestinationOption } from '../../stores/settingsManifest';
import {
  useStorageSettingsAuthority,
  useStorageSettingsBootstrap,
  type StorageSettingsPayload,
  type StorageSettingsResponse,
} from '../../stores/storageSettingsAuthority';

interface StorageBrowseDirectoryRow {
  name: string;
  path: string;
}

interface StorageBrowseResponse {
  currentPath: string;
  parentPath: string | null;
  directories: StorageBrowseDirectoryRow[];
}

interface StorageSettingsFormState {
  enabled: boolean;
  localDirectory: string;
  awsRegion: string;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
}

const DESTINATION_KEYS = STORAGE_DESTINATION_OPTIONS;

const cardCls = 'rounded sf-surface-elevated p-4';
const inputCls = 'w-full rounded sf-input px-3 py-2 text-sm';

function readStorageFormString(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  return String(value);
}

function toFormState(settings: StorageSettingsResponse): StorageSettingsFormState {
  return {
    enabled: Boolean(settings.enabled),
    localDirectory: readStorageFormString(settings.localDirectory, STORAGE_SETTING_DEFAULTS.localDirectory),
    awsRegion: readStorageFormString(settings.awsRegion, STORAGE_SETTING_DEFAULTS.awsRegion),
    s3Bucket: readStorageFormString(settings.s3Bucket, STORAGE_SETTING_DEFAULTS.s3Bucket),
    s3Prefix: readStorageFormString(settings.s3Prefix, STORAGE_SETTING_DEFAULTS.s3Prefix),
    s3AccessKeyId: readStorageFormString(settings.s3AccessKeyId, STORAGE_SETTING_DEFAULTS.s3AccessKeyId),
  };
}

function statusCls(kind: 'ok' | 'error' | '') {
  if (kind === 'ok') return 'sf-status-text-info';
  if (kind === 'error') return 'sf-status-text-danger';
  return 'sf-status-text-muted';
}

function migrationStatusCls(kind: 'running' | 'ok' | 'error' | 'idle') {
  if (kind === 'running') return 'sf-status-text-info';
  if (kind === 'ok') return 'sf-status-text-info';
  if (kind === 'error') return 'sf-status-text-danger';
  return 'sf-status-text-muted';
}

function destinationLabel(destinationType = '') {
  const token = String(destinationType || '').trim().toLowerCase();
  if (token === 's3') return 'S3';
  if (token === 'local') return 'local storage';
  return 'selected destination';
}

function buildComparableState({
  destinationType,
  form,
  s3SecretAccessKey,
  s3SessionToken,
  clearS3SecretAccessKey,
  clearS3SessionToken,
}: {
  destinationType: StorageDestinationOption;
  form: StorageSettingsFormState;
  s3SecretAccessKey: string;
  s3SessionToken: string;
  clearS3SecretAccessKey: boolean;
  clearS3SessionToken: boolean;
}) {
  return JSON.stringify({
    destinationType,
    form,
    s3SecretAccessKey: s3SecretAccessKey.trim(),
    s3SessionToken: s3SessionToken.trim(),
    clearS3SecretAccessKey: Boolean(clearS3SecretAccessKey),
    clearS3SessionToken: Boolean(clearS3SessionToken),
  });
}

export function StoragePage() {
  const storageSettingsReady = useSettingsAuthorityStore((s) => s.snapshot.storageReady);
  const storageSettingsBootstrap = useStorageSettingsBootstrap();
  const [destinationType, setDestinationType] = usePersistedTab<StorageDestinationOption>(
    'storage:destination:main',
    storageSettingsBootstrap.destinationType,
    { validValues: DESTINATION_KEYS },
  );
  const storageAutoSaveEnabled = useUiStore((s) => s.storageAutoSaveEnabled);
  const setStorageAutoSaveEnabled = useUiStore((s) => s.setStorageAutoSaveEnabled);
  const [form, setForm] = useState<StorageSettingsFormState>(() => toFormState(storageSettingsBootstrap));
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3SessionToken, setS3SessionToken] = useState('');
  const [hasS3SecretAccessKey, setHasS3SecretAccessKey] = useState(storageSettingsBootstrap.hasS3SecretAccessKey);
  const [hasS3SessionToken, setHasS3SessionToken] = useState(storageSettingsBootstrap.hasS3SessionToken);
  const [clearS3SecretAccessKey, setClearS3SecretAccessKey] = useState(false);
  const [clearS3SessionToken, setClearS3SessionToken] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'error' | ''>('');
  const [browsePathInput, setBrowsePathInput] = usePersistedTab<string>(
    'storage:browse:pathInput',
    storageSettingsBootstrap.localDirectory,
  );
  const [browsePath, setBrowsePath] = usePersistedTab<string>(
    'storage:browse:path',
    storageSettingsBootstrap.localDirectory,
  );
  const [migrationStatusKind, setMigrationStatusKind] = useState<'running' | 'ok' | 'error' | 'idle'>('idle');
  const [migrationStatusText, setMigrationStatusText] = useState('No active run-data migration.');
  const hasLocalEditsRef = useRef(false);
  const [savedComparableState, setSavedComparableState] = useState(() => buildComparableState({
    destinationType,
    form: toFormState(storageSettingsBootstrap),
    s3SecretAccessKey: '',
    s3SessionToken: '',
    clearS3SecretAccessKey: false,
    clearS3SessionToken: false,
  }));
  const autoSaveEnabled = storageAutoSaveEnabled;

  const currentComparableState = useMemo(() => buildComparableState({
    destinationType,
    form,
    s3SecretAccessKey,
    s3SessionToken,
    clearS3SecretAccessKey,
    clearS3SessionToken,
  }), [
    destinationType,
    form,
    s3SecretAccessKey,
    s3SessionToken,
    clearS3SecretAccessKey,
    clearS3SessionToken,
  ]);

  const isDirty = currentComparableState !== savedComparableState;
  const storagePayload: StorageSettingsPayload = useMemo(() => ({
    enabled: form.enabled,
    destinationType,
    localDirectory: form.localDirectory,
    awsRegion: form.awsRegion,
    s3Bucket: form.s3Bucket,
    s3Prefix: form.s3Prefix,
    s3AccessKeyId: form.s3AccessKeyId,
    ...(s3SecretAccessKey.trim() ? { s3SecretAccessKey: s3SecretAccessKey.trim() } : {}),
    ...(clearS3SecretAccessKey ? { clearS3SecretAccessKey: true } : {}),
    ...(s3SessionToken.trim() ? { s3SessionToken: s3SessionToken.trim() } : {}),
    ...(clearS3SessionToken ? { clearS3SessionToken: true } : {}),
  }), [
    form.enabled,
    destinationType,
    form.localDirectory,
    form.awsRegion,
    form.s3Bucket,
    form.s3Prefix,
    form.s3AccessKeyId,
    s3SecretAccessKey,
    clearS3SecretAccessKey,
    s3SessionToken,
    clearS3SessionToken,
  ]);

  const {
    settings: storageSettings,
    isSaving: isStorageSaving,
    reload: reloadStorageSettings,
    saveNow: saveStorageSettings,
  } = useStorageSettingsAuthority({
    payload: storagePayload,
    dirty: isDirty,
    autoSaveEnabled: autoSaveEnabled && storageSettingsReady,
    onPersisted: (next) => {
      const nextForm = toFormState(next);
      setForm(nextForm);
      setDestinationType(next.destinationType);
      setHasS3SecretAccessKey(Boolean(next.hasS3SecretAccessKey));
      setHasS3SessionToken(Boolean(next.hasS3SessionToken));
      setS3SecretAccessKey('');
      setS3SessionToken('');
      setClearS3SecretAccessKey(false);
      setClearS3SessionToken(false);
      setSavedComparableState(buildComparableState({
        destinationType: next.destinationType,
        form: nextForm,
        s3SecretAccessKey: '',
        s3SessionToken: '',
        clearS3SecretAccessKey: false,
        clearS3SessionToken: false,
      }));
      setStatusKind('ok');
      setStatusText('Storage settings saved.');
      hasLocalEditsRef.current = false;
    },
    onError: (error) => {
      setStatusKind('error');
      setStatusText(error instanceof Error ? error.message : 'Failed to save storage settings.');
    },
  });
  const canManualSave = useMemo(() => storageSettingsReady && !isStorageSaving && isDirty, [
    storageSettingsReady,
    isStorageSaving,
    isDirty,
  ]);

  const s3TempNote = useMemo(() => {
    const base = String(storageSettings?.stagingTempDirectory || '').trim();
    if (!base) return 'Temporary staging path: OS temp directory (auto-deleted after upload).';
    return `Temporary staging path: ${base}${base.endsWith('\\') ? '' : '\\'}spec-factory-run-stage-* (auto-deleted after upload).`;
  }, [storageSettings?.stagingTempDirectory]);

  useEffect(() => {
    if (!storageSettings) return;
    if (storageSettingsReady && hasLocalEditsRef.current) return;
    const next = storageSettings;
    setForm(toFormState(next));
    setDestinationType(next.destinationType);
    setHasS3SecretAccessKey(Boolean(next.hasS3SecretAccessKey));
    setHasS3SessionToken(Boolean(next.hasS3SessionToken));
    setS3SecretAccessKey('');
    setS3SessionToken('');
    setClearS3SecretAccessKey(false);
    setClearS3SessionToken(false);
    setSavedComparableState(buildComparableState({
      destinationType: next.destinationType,
      form: toFormState(next),
      s3SecretAccessKey: '',
      s3SessionToken: '',
      clearS3SecretAccessKey: false,
      clearS3SessionToken: false,
    }));
    if (next.localDirectory) {
      setBrowsePathInput(next.localDirectory);
      setBrowsePath(next.localDirectory);
    }
    hasLocalEditsRef.current = false;
  }, [storageSettings, setDestinationType, storageSettingsReady]);

  useEffect(() => {
    const unsubscribe = wsManager.onMessage((channel, data) => {
      if (channel !== 'data-change') return;
      if (!data || typeof data !== 'object') return;
      const payload = data as {
        event?: string;
        meta?: {
          run_id?: string;
          destination_type?: string;
          message?: string;
        };
      };
      const event = String(payload.event || '').trim();
      if (!event) return;
      const runId = String(payload.meta?.run_id || '').trim();
      const destination = destinationLabel(payload.meta?.destination_type || '');
      if (event === 'indexlab-run-data-relocation-started') {
        setMigrationStatusKind('running');
        setMigrationStatusText(
          runId
            ? `Migrating run data for ${runId} to ${destination}...`
            : `Migrating run data to ${destination}...`,
        );
        return;
      }
      if (event === 'indexlab-run-data-relocated') {
        setMigrationStatusKind('ok');
        setMigrationStatusText(
          runId
            ? `Migration complete for ${runId}.`
            : 'Run-data migration complete.',
        );
        return;
      }
      if (event === 'indexlab-run-data-relocation-failed') {
        const reason = String(payload.meta?.message || '').trim();
        setMigrationStatusKind('error');
        setMigrationStatusText(
          runId
            ? `Migration failed for ${runId}${reason ? `: ${reason}` : '.'}`
            : `Run-data migration failed${reason ? `: ${reason}` : '.'}`,
        );
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const browseQuery = useQuery({
    queryKey: ['storage-settings', 'local-browse', browsePath],
    queryFn: async () => {
      const query = browsePath ? `?path=${encodeURIComponent(browsePath)}` : '';
      return api.get<StorageBrowseResponse>(`/storage-settings/local/browse${query}`);
    },
    enabled: destinationType === 'local',
    retry: false,
  });

  function markEdited() {
    hasLocalEditsRef.current = true;
  }

  function setField<K extends keyof StorageSettingsFormState>(key: K, value: StorageSettingsFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    markEdited();
  }

  const storageStatusTone = isStorageSaving
    ? 'sf-status-text-info'
    : statusCls(statusKind);
  const storageStatusText = resolveStorageSettingsStatusText({
    isSaving: isStorageSaving,
    statusKind,
    statusText,
    storageSettingsReady,
    dirty: isDirty,
    autoSaveEnabled,
  });

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Run Data Storage</h2>
            <p className="sf-text-label sf-status-text-muted mt-1 max-w-3xl">
              Move all run artifacts, ledgers, and logs to a user-selected local folder or S3 destination after each successful IndexLab run.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!storageSettingsReady || isStorageSaving || autoSaveEnabled}
              onClick={() => saveStorageSettings()}
              className={`rounded px-3 py-1.5 sf-text-label transition-colors disabled:opacity-50 ${
                autoSaveEnabled
                  ? 'sf-icon-button'
                  : 'sf-primary-button'
              }`}
            >
              {isStorageSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setStorageAutoSaveEnabled(!autoSaveEnabled)}
              className={`rounded px-3 py-1.5 sf-text-label transition-colors ${
                autoSaveEnabled
                  ? 'sf-primary-button'
                  : 'sf-action-button'
              }`}
            >
              {autoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off'}
            </button>
            <button
              type="button"
              onClick={() => reloadStorageSettings()}
              className="rounded sf-icon-button px-3 py-1.5 sf-text-label"
            >
              Reload
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="sf-text-label sf-status-text-muted">Route Run Data To</span>
          <div className="inline-flex items-center gap-1 rounded sf-surface-elevated px-1 py-1">
            <button
              type="button"
              onClick={() => {
                if (destinationType === 'local') return;
                setDestinationType('local');
                markEdited();
              }}
              className={`rounded sf-nav-item px-3 py-1.5 sf-text-label ${
                destinationType === 'local' ? 'sf-nav-item-active' : 'sf-nav-item-muted'
              }`}
            >
              Local
            </button>
            <button
              type="button"
              onClick={() => {
                if (destinationType === 's3') return;
                setDestinationType('s3');
                markEdited();
              }}
              className={`rounded sf-nav-item px-3 py-1.5 sf-text-label ${
                destinationType === 's3' ? 'sf-nav-item-active' : 'sf-nav-item-muted'
              }`}
            >
              S3
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <label className="sf-text-label flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setField('enabled', event.target.checked)}
            />
            <span>Enable automatic run-data relocation</span>
          </label>
          <span className={`sf-text-label ${storageStatusTone}`}>
            {storageStatusText}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {migrationStatusKind === 'running' ? (
            <Spinner className="h-3 w-3" />
          ) : (
            <span className="inline-block h-2 w-2 rounded-full sf-chip-neutral" />
          )}
          <span className={`sf-text-label ${migrationStatusCls(migrationStatusKind)}`}>
            {migrationStatusText}
          </span>
        </div>
      </div>

      {destinationType === 'local' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={cardCls}>
            <h3 className="text-sm font-semibold">Destination Folder</h3>
            <p className="sf-text-label sf-status-text-muted mt-1">Run bundles are written to `category/product/run_id` under this folder.</p>
            <div className="mt-3 space-y-2">
              <label className="sf-text-label sf-status-text-muted">Local Directory</label>
              <input
                className={inputCls}
                value={form.localDirectory}
                onChange={(event) => setField('localDirectory', event.target.value)}
                placeholder="C:\\SpecFactoryRuns"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded sf-icon-button px-3 py-1.5 sf-text-label"
                  onClick={() => {
                    setBrowsePathInput(form.localDirectory || browsePathInput);
                    setBrowsePath(form.localDirectory || browsePathInput);
                  }}
                >
                  Browse From Current
                </button>
                <button
                  type="button"
                  className="rounded sf-icon-button px-3 py-1.5 sf-text-label"
                  onClick={() => {
                    setField('localDirectory', '');
                  }}
                >
                  Clear Path
                </button>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <h3 className="text-sm font-semibold">Folder Browser</h3>
            <div className="mt-3 space-y-2">
              <label className="sf-text-label sf-status-text-muted">Browse Path</label>
              <div className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={browsePathInput}
                  onChange={(event) => setBrowsePathInput(event.target.value)}
                  placeholder="Enter a folder path"
                />
                <button
                  type="button"
                  className="rounded sf-icon-button px-3 py-2 sf-text-label"
                  onClick={() => setBrowsePath(browsePathInput.trim())}
                >
                  Load
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded sf-icon-button px-3 py-1.5 sf-text-label disabled:opacity-50"
                disabled={!browseQuery.data?.parentPath}
                onClick={() => {
                  const parentPath = browseQuery.data?.parentPath || '';
                  if (!parentPath) return;
                  setBrowsePathInput(parentPath);
                  setBrowsePath(parentPath);
                }}
              >
                Up
              </button>
              <button
                type="button"
                className="rounded sf-icon-button px-3 py-1.5 sf-text-label"
                onClick={() => browseQuery.refetch()}
              >
                Refresh
              </button>
              <button
                type="button"
                className="rounded sf-action-button px-3 py-1.5 sf-text-label disabled:opacity-50"
                disabled={!browseQuery.data?.currentPath}
                onClick={() => {
                  const currentPath = browseQuery.data?.currentPath || '';
                  if (!currentPath) return;
                  setField('localDirectory', currentPath);
                }}
              >
                Use Current
              </button>
            </div>

            {browseQuery.isError && (
              <p className="mt-3 sf-text-label sf-status-text-danger">
                {browseQuery.error instanceof Error ? browseQuery.error.message : 'Failed to browse this path.'}
              </p>
            )}

            <div className="mt-3 rounded sf-surface-elevated p-2 max-h-72 overflow-auto space-y-1">
              {(browseQuery.data?.directories || []).length === 0 ? (
                <div className="px-3 py-4 sf-text-label sf-status-text-muted">No subdirectories found for this location.</div>
              ) : (
                (browseQuery.data?.directories || []).map((dir) => (
                  <button
                    key={dir.path}
                    type="button"
                    className={`w-full text-left rounded sf-nav-item px-3 py-2 ${
                      form.localDirectory === dir.path ? 'sf-nav-item-active' : 'sf-nav-item-muted'
                    }`}
                    onClick={() => {
                      setBrowsePathInput(dir.path);
                      setBrowsePath(dir.path);
                      setField('localDirectory', dir.path);
                    }}
                  >
                    <span className="sf-text-label font-medium">{dir.name}</span>
                    <span className="block sf-text-caption sf-status-text-muted mt-0.5">{dir.path}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {destinationType === 's3' && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold">S3 Destination</h3>
          <p className="sf-text-label sf-status-text-muted mt-1">Provide the bucket destination and optional explicit credentials.</p>
          <p className="sf-text-label sf-status-text-muted mt-2">{s3TempNote}</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="sf-text-label sf-status-text-muted">Region</span>
              <input
                className={inputCls}
                value={form.awsRegion}
                onChange={(event) => setField('awsRegion', event.target.value)}
                placeholder={STORAGE_SETTING_DEFAULTS.awsRegion}
              />
            </label>
            <label className="space-y-1">
              <span className="sf-text-label sf-status-text-muted">Bucket</span>
              <input
                className={inputCls}
                value={form.s3Bucket}
                onChange={(event) => setField('s3Bucket', event.target.value)}
                placeholder="my-spec-harvester-data"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="sf-text-label sf-status-text-muted">Prefix</span>
              <input
                className={inputCls}
                value={form.s3Prefix}
                onChange={(event) => setField('s3Prefix', event.target.value)}
                placeholder={STORAGE_SETTING_DEFAULTS.s3Prefix}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="sf-text-label sf-status-text-muted">Access Key Id</span>
              <input
                className={inputCls}
                value={form.s3AccessKeyId}
                onChange={(event) => setField('s3AccessKeyId', event.target.value)}
                placeholder="AKIA..."
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="sf-text-label sf-status-text-muted">Secret Access Key</span>
              <input
                className={inputCls}
                type="password"
                value={s3SecretAccessKey}
                onChange={(event) => {
                  setS3SecretAccessKey(event.target.value);
                  setClearS3SecretAccessKey(false);
                  markEdited();
                }}
                placeholder={hasS3SecretAccessKey ? 'Stored secret is present. Enter a new value to replace it.' : 'Enter secret access key'}
              />
              <label className="sf-text-label flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={clearS3SecretAccessKey}
                  onChange={(event) => {
                    setClearS3SecretAccessKey(event.target.checked);
                    markEdited();
                  }}
                />
                <span>Clear stored secret on save</span>
              </label>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="sf-text-label sf-status-text-muted">Session Token (optional)</span>
              <input
                className={inputCls}
                type="password"
                value={s3SessionToken}
                onChange={(event) => {
                  setS3SessionToken(event.target.value);
                  setClearS3SessionToken(false);
                  markEdited();
                }}
                placeholder={hasS3SessionToken ? 'Stored session token is present. Enter a new value to replace it.' : 'Enter session token (optional)'}
              />
              <label className="sf-text-label flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={clearS3SessionToken}
                  onChange={(event) => {
                    setClearS3SessionToken(event.target.checked);
                    markEdited();
                  }}
                />
                <span>Clear stored session token on save</span>
              </label>
            </label>
          </div>
        </div>
      )}

      {form.enabled && (destinationType === 'local' ? form.localDirectory : form.s3Bucket) && (
        <div className="mt-6">
          <StorageManagerPanel />
        </div>
      )}
    </div>
  );
}
