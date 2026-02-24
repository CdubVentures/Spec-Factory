import { loadFieldRules as loadFieldRulesDefault } from '../../field-rules/loader.js';
import { seedSpecDb as seedSpecDbDefault } from '../../db/seed.js';

function normalizeCategory(category, resolveCategoryAlias) {
  const raw = String(category || '').trim();
  if (!raw) return '';
  if (typeof resolveCategoryAlias !== 'function') return raw;
  return String(resolveCategoryAlias(raw) || raw).trim();
}

export async function syncSpecDbForCategory({
  category,
  config,
  resolveCategoryAlias,
  getSpecDbReady,
  loadFieldRules = loadFieldRulesDefault,
  seedSpecDb = seedSpecDbDefault,
}) {
  const resolvedCategory = normalizeCategory(category, resolveCategoryAlias);
  if (!resolvedCategory) {
    throw new Error('category_required');
  }
  if (typeof getSpecDbReady !== 'function') {
    throw new Error('getSpecDbReady_required');
  }

  let db = null;
  try {
    db = await getSpecDbReady(resolvedCategory);
    if (!db) {
      throw new Error(`specdb_unavailable:${resolvedCategory}`);
    }

    const fieldRules = await loadFieldRules(resolvedCategory, { config });
    const syncResult = await seedSpecDb({
      db,
      config,
      category: resolvedCategory,
      fieldRules,
    });

    let syncState = null;
    if (typeof db.recordSpecDbSync === 'function') {
      syncState = db.recordSpecDbSync({
        category: resolvedCategory,
        status: 'ok',
        meta: syncResult && typeof syncResult === 'object' ? syncResult : {},
      });
    }

    return {
      category: resolvedCategory,
      ...syncResult,
      ...(syncState
        ? {
          specdb_sync_version: syncState.specdb_sync_version,
          specdb_sync_updated_at: syncState.last_sync_at,
        }
        : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let failureSyncState = null;
    if (db && typeof db.recordSpecDbSync === 'function') {
      try {
        const currentSyncState = typeof db.getSpecDbSyncState === 'function'
          ? db.getSpecDbSyncState(resolvedCategory)
          : null;
        const currentVersion = Number.parseInt(String(currentSyncState?.specdb_sync_version ?? ''), 10);
        failureSyncState = db.recordSpecDbSync({
          category: resolvedCategory,
          status: 'failed',
          version: Number.isFinite(currentVersion) && currentVersion >= 0 ? currentVersion : 0,
          meta: {
            error: message,
          },
        });
      } catch {
        failureSyncState = null;
      }
    }
    if (err && typeof err === 'object' && failureSyncState) {
      err.specdb_sync_version = failureSyncState.specdb_sync_version;
      err.specdb_sync_updated_at = failureSyncState.last_sync_at;
      err.specdb_sync_status = failureSyncState.last_sync_status;
    }
    throw err;
  }
}
