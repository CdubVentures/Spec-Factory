import { emitDataChange } from '../events/dataChangeContract.js';

function categoryFromCliArgs(cliArgs) {
  if (!Array.isArray(cliArgs)) return '';
  const idx = cliArgs.indexOf('--category');
  if (idx < 0 || !cliArgs[idx + 1]) return '';
  return String(cliArgs[idx + 1]).trim();
}

function isCategoryCompileCommand(cliArgs) {
  if (!Array.isArray(cliArgs)) return false;
  return cliArgs.includes('category-compile');
}

export async function handleCompileProcessCompletion({
  exitCode,
  cliArgs,
  sessionCache,
  invalidateFieldRulesCache,
  reviewLayoutByCategory,
  syncSpecDbForCategory,
  broadcastWs,
  logError = console.error,
}) {
  if (Number(exitCode) !== 0) return null;

  const category = categoryFromCliArgs(cliArgs);
  if (!category) return null;

  sessionCache?.invalidateSessionCache?.(category);
  invalidateFieldRulesCache?.(category);
  reviewLayoutByCategory?.delete?.(category);

  let specDbSync = null;
  if (isCategoryCompileCommand(cliArgs) && typeof syncSpecDbForCategory === 'function') {
    try {
      const syncResult = await syncSpecDbForCategory({ category });
      specDbSync = { ok: true, ...syncResult };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const syncVersion = Number.parseInt(String(err?.specdb_sync_version ?? ''), 10);
      const syncUpdatedAt = String(err?.specdb_sync_updated_at || '').trim();
      const syncStatus = String(err?.specdb_sync_status || '').trim();
      specDbSync = {
        ok: false,
        error: message,
        ...(Number.isFinite(syncVersion) && syncVersion >= 0
          ? { specdb_sync_version: syncVersion }
          : {}),
        ...(syncUpdatedAt ? { specdb_sync_updated_at: syncUpdatedAt } : {}),
        ...(syncStatus ? { specdb_sync_status: syncStatus } : {}),
      };
      logError?.(`[compile-sync] ${category} failed`, err);
    }
  }

  const syncVersion = Number.parseInt(String(specDbSync?.specdb_sync_version ?? ''), 10);
  const syncVersionPayload = Number.isFinite(syncVersion) && syncVersion > 0
    ? {
      specdb_sync_version: syncVersion,
      updated_at: String(specDbSync?.specdb_sync_updated_at || '').trim() || null,
    }
    : null;

  emitDataChange({
    broadcastWs,
    event: 'process-completed',
    category,
    version: syncVersionPayload,
    meta: specDbSync ? { specDbSync } : {},
  });

  return {
    category,
    specDbSync: specDbSync || undefined,
  };
}
