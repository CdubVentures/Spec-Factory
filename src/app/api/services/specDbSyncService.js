import path from 'node:path';
import { loadFieldRules as loadFieldRulesDefault, buildFieldRulesSignature as buildSignatureDefault, invalidateFieldRulesCache as invalidateFieldRulesCacheDefault } from '../../../field-rules/loader.js';
import { seedSpecDb as seedSpecDbDefault } from '../../../db/seed.js';
import { compileCategoryFieldStudio as compileCategoryDefault, loadFieldStudioMap } from '../../../ingest/categoryCompile.js';
import { readJsonIfExists } from '../../../ingest/compileFileIo.js';
import { hashJson } from '../../../ingest/compileUtils.js';

function normalizeCategory(category, resolveCategoryAlias) {
  const raw = String(category || '').trim();
  if (!raw) return '';
  if (typeof resolveCategoryAlias !== 'function') return raw;
  return String(resolveCategoryAlias(raw) || raw).trim();
}

// WHY: Detect when field_studio_map.json changed since last compile.
// Precedence: no map → false; map exists, no report → true; hash mismatch → true.
async function isCompileStaleDefault(category, helperRoot) {
  const loaded = await loadFieldStudioMap({
    category, config: { categoryAuthorityRoot: helperRoot },
  }).catch(() => null);
  if (!loaded?.map || typeof loaded.map !== 'object') return false;

  const generatedRoot = path.join(helperRoot, category, '_generated');
  const report = await readJsonIfExists(
    path.join(generatedRoot, '_compile_report.json'),
  );
  if (!report?.field_studio_map_hash) return true;

  return hashJson(loaded.map) !== String(report.field_studio_map_hash);
}

export async function syncSpecDbForCategory({
  category,
  config,
  resolveCategoryAlias,
  getSpecDbReady,
  loadFieldRules = loadFieldRulesDefault,
  seedSpecDb = seedSpecDbDefault,
  isCompileStale = isCompileStaleDefault,
  compileCategory = compileCategoryDefault,
  invalidateFieldRulesCache = invalidateFieldRulesCacheDefault,
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

    // WHY: If field_studio_map.json changed since last compile, auto-compile
    // so downstream seed tables get fresh generated artifacts.
    const helperRoot = config.categoryAuthorityRoot || 'category_authority';
    if (typeof isCompileStale === 'function') {
      try {
        if (await isCompileStale(resolvedCategory, helperRoot)) {
          await compileCategory({ category: resolvedCategory, config });
          if (typeof invalidateFieldRulesCache === 'function') {
            invalidateFieldRulesCache(resolvedCategory);
          }
        }
      } catch (err) {
        console.error(`[sync] auto-compile failed for ${resolvedCategory}:`, err?.message || err);
      }
    }

    const fieldRules = await loadFieldRules(resolvedCategory, { config });
    const syncResult = await seedSpecDb({
      db,
      config,
      category: resolvedCategory,
      fieldRules,
    });

    // WHY: Store field_rules_signature in sync meta so hash-gated reconcile
    // can detect when sources changed since last seed.
    let syncMeta = syncResult && typeof syncResult === 'object' ? { ...syncResult } : {};
    try {
      const helperRoot = config.categoryAuthorityRoot || 'category_authority';
      const signature = await buildSignatureDefault(helperRoot, resolvedCategory);
      if (signature) syncMeta.field_rules_signature = signature;
    } catch { /* non-critical — signature is best-effort */ }

    let syncState = null;
    if (typeof db.recordSpecDbSync === 'function') {
      syncState = db.recordSpecDbSync({
        category: resolvedCategory,
        status: 'ok',
        meta: syncMeta,
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
