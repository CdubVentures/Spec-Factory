import fs from 'node:fs/promises';
import { emitDataChange } from '../../../api/events/dataChangeContract.js';
import {
  defaultRunDataLocalDirectory,
  listLocalStorageDirectories,
  normalizeRunDataStorageSettings,
  sanitizeRunDataStorageSettingsForResponse,
  validateRunDataStorageSettings,
} from '../../../api/services/runDataRelocationService.js';
import { snapshotStorageSettings } from '../../settings-authority/index.js';

export function createStorageSettingsHandler({
  jsonRes,
  readJsonBody,
  toInt,
  broadcastWs,
  config,
  configGate,
  persistenceCtx,
}) {
  const { runDataStorageState } = persistenceCtx;

  return async function handleStorageSettings(parts, params, method, req, res) {
    if (parts[0] !== 'storage-settings') return false;

    if (
      parts[1] === 'local'
      && (parts[2] === 'browse' || !parts[2])
      && method === 'GET'
    ) {
      const requestedPath = String(params.get('path') || '').trim();
      const maxEntries = Math.max(1, toInt(params.get('limit'), 500));
      const resolvedBrowseCwd = requestedPath
        ? process.cwd()
        : (runDataStorageState.localDirectory || defaultRunDataLocalDirectory());
      try {
        if (!requestedPath) {
          await fs.mkdir(resolvedBrowseCwd, { recursive: true });
        }
        const listing = await listLocalStorageDirectories({
          requestedPath,
          cwd: resolvedBrowseCwd,
          maxEntries,
        });
        return jsonRes(res, 200, listing);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'storage_browse_failed';
        return jsonRes(res, 400, { error: message });
      }
    }

    if (method === 'GET') {
      return jsonRes(res, 200, sanitizeRunDataStorageSettingsForResponse(runDataStorageState));
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const storageMutableKeys = [
        'enabled',
        'destinationType',
        'localDirectory',
        'awsRegion',
        's3Bucket',
        's3Prefix',
        's3AccessKeyId',
        's3SecretAccessKey',
        's3SessionToken',
      ];
      const STORAGE_ALLOWED = new Set(storageMutableKeys);
      const rejected = {};
      for (const key of Object.keys(body || {})) {
        if (!STORAGE_ALLOWED.has(key)) rejected[key] = 'unknown_key';
      }
      const currentStorageSnapshot = snapshotStorageSettings(runDataStorageState);
      const normalized = normalizeRunDataStorageSettings(body, currentStorageSnapshot);
      const validationError = validateRunDataStorageSettings(normalized);
      if (validationError) {
        return jsonRes(res, 400, { error: validationError });
      }
      if (normalized.destinationType === 'local') {
        try {
          await fs.mkdir(normalized.localDirectory || defaultRunDataLocalDirectory(), { recursive: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'local_directory_create_failed';
          return jsonRes(res, 400, { error: message });
        }
      }
      const normalizedStorageSnapshot = snapshotStorageSettings({
        ...currentStorageSnapshot,
        ...normalized,
        updatedAt: new Date().toISOString(),
      });
      const userSettingsState = persistenceCtx.getUserSettingsState();
      const currentUserStorage = (
        userSettingsState
        && userSettingsState.storage
        && typeof userSettingsState.storage === 'object'
      )
        ? userSettingsState.storage
        : {};
      const storagePatch = {};
      const applied = {};
      for (const key of storageMutableKeys) {
        if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
        storagePatch[key] = normalizedStorageSnapshot[key];
        applied[key] = normalizedStorageSnapshot[key];
      }
      storagePatch.updatedAt = normalizedStorageSnapshot.updatedAt;
      const persistSnapshot = {
        ...currentUserStorage,
        ...storagePatch,
      };
      persistenceCtx.recordRouteWriteAttempt('storage', 'storage-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistenceCtx.persistCanonicalSections({
          storage: persistSnapshot,
        });
        await persistenceCtx.persistLegacySettingsFile(
          'storage-settings.json',
          persistedArtifacts.legacy.storage,
        );
        persistenceCtx.recordRouteWriteOutcome('storage', 'storage-settings-route', true);
      } catch {
        persistenceCtx.recordRouteWriteOutcome('storage', 'storage-settings-route', false, 'storage_settings_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'storage_settings_persist_failed' });
      }
      const propagatedRegion = String(runDataStorageState.awsRegion || '').trim();
      const propagatedBucket = String(runDataStorageState.s3Bucket || '').trim();
      const s3Patch = {};
      if (propagatedRegion) s3Patch.awsRegion = propagatedRegion;
      if (propagatedBucket) s3Patch.s3Bucket = propagatedBucket;
      if (Object.keys(s3Patch).length > 0 && configGate) {
        configGate.applyPatch(s3Patch, { source: 'storage-settings-route' });
      }
      emitDataChange({
        broadcastWs,
        event: 'storage-settings-updated',
        domains: ['storage', 'settings'],
        meta: {
          enabled: runDataStorageState.enabled,
          destinationType: runDataStorageState.destinationType,
        },
      });
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'storage',
          enabled: runDataStorageState.enabled,
          destinationType: runDataStorageState.destinationType,
        },
      });
      const snapshot = sanitizeRunDataStorageSettingsForResponse(runDataStorageState);
      return jsonRes(res, 200, { ok: true, applied, snapshot, rejected });
    }

    return false;
  };
}
