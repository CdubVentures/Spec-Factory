import { scanAndSeedCheckpoints } from '../../pipeline/checkpoint/scanAndSeedCheckpoints.js';
import { rebuildColorEditionFinderFromJson } from '../../features/color-edition/index.js';
import { rebuildProductImageFinderFromJson } from '../../features/product-image/index.js';
import { rebuildReleaseDateFinderFromJson } from '../../features/release-date/releaseDateStore.js';
import { rebuildSkuFinderFromJson } from '../../features/sku/skuStore.js';
import { rebuildKeyFinderFromJson } from '../../features/key/keyStore.js';
import { rebuildFieldCandidatesFromJson, rebuildPublishedFieldsFromJson } from '../../features/publisher/index.js';
import { reseedFieldKeyOrderFromJson } from '../../features/studio/fieldKeyOrderReseed.js';
import { reseedFieldStudioMapFromJson } from '../../features/studio/fieldStudioMapReseed.js';
import { buildReseedSurfaces } from '../../db/seedRegistry.js';

function assertFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertObject(name, value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

export function createSpecDbRuntime({
  resolveCategoryAlias,
  specDbClass,
  path,
  fsSync,
  syncSpecDbForCategory,
  config,
  logger = console,
  indexLabRoot = '',
  productRoot = '',
  buildFieldRulesSignature = null,
  appDb = null,
} = {}) {
  assertFunction('resolveCategoryAlias', resolveCategoryAlias);
  assertFunction('specDbClass', specDbClass);
  assertObject('path', path);
  assertObject('fsSync', fsSync);
  assertFunction('fsSync.accessSync', fsSync.accessSync?.bind(fsSync));
  assertFunction('fsSync.mkdirSync', fsSync.mkdirSync?.bind(fsSync));
  assertFunction('syncSpecDbForCategory', syncSpecDbForCategory);
  assertObject('config', config);
  assertFunction('logger.log', logger.log?.bind(logger));
  assertFunction('logger.error', logger.error?.bind(logger));

  const specDbCache = new Map();
  const specDbSeedPromises = new Map();
  const reviewLayoutByCategory = new Map();

  // WHY: Reseed phases are defined in seedRegistry.js for O(1) discoverability.
  // The factory receives feature-module functions via DI (src/db/ can't import
  // from src/features/ or src/pipeline/ directly). triggerReseedPhases below
  // handles dedup, logging, and error isolation.
  const reseedSurfaces = buildReseedSurfaces({
    scanAndSeedCheckpoints,
    rebuildColorEditionFinderFromJson,
    rebuildProductImageFinderFromJson,
    rebuildReleaseDateFinderFromJson,
    rebuildSkuFinderFromJson,
    rebuildKeyFinderFromJson,
    reseedFieldKeyOrderFromJson,
    reseedFieldStudioMapFromJson,
    rebuildFieldCandidatesFromJson,
    rebuildPublishedFieldsFromJson,
  });
  const reseedPhases = reseedSurfaces.map(surface => ({
    name: surface.key,
    shouldRun: surface.shouldRun
      ? () => surface.shouldRun({ indexLabRoot })
      : undefined,
    trigger: (_category, db) => surface.execute({
      db, indexLabRoot, productRoot,
      helperRoot: config.categoryAuthorityRoot || 'category_authority',
    }),
    formatLog: surface.formatLog,
  }));

  // WHY: Single Map keyed by `${category}:${phaseName}` replaces per-phase Maps.
  const reseedPromises = new Map();

  function triggerReseedPhases(category, db) {
    const resolved = resolveCategoryAlias(category);
    if (!resolved) return;
    for (const phase of reseedPhases) {
      if (phase.shouldRun && !phase.shouldRun()) continue;
      const key = `${resolved}:${phase.name}`;
      if (reseedPromises.has(key)) continue;
      const promise = (async () => {
        try {
          const result = await phase.trigger(resolved, db);
          const msg = phase.formatLog(resolved, result);
          if (msg) logger.log(`[auto-seed] ${msg}`);
        } catch (err) {
          logger.error(`[auto-seed] ${resolved} ${phase.name} re-seed failed:`, err?.message || err);
        } finally {
          reseedPromises.delete(key);
        }
      })();
      reseedPromises.set(key, promise);
    }
  }

  // WHY: Hash-gated reconcile for already-seeded DBs. Computes the current
  // field-rules signature and compares to the stored value. Only runs the
  // full seedSpecDb path when sources have actually changed. First run after
  // upgrade (no stored signature) is treated as "changed."
  function triggerHashGatedReconcile(category, db) {
    if (typeof buildFieldRulesSignature !== 'function') return;
    const resolvedCategory = resolveCategoryAlias(category);
    if (!resolvedCategory) return;
    const key = `${resolvedCategory}:hash-reconcile`;
    if (specDbSeedPromises.has(key)) return;
    const promise = (async () => {
      try {
        const helperRoot = config.categoryAuthorityRoot || 'category_authority';
        const currentSignature = await buildFieldRulesSignature(helperRoot, resolvedCategory);
        const syncState = typeof db.getSpecDbSyncState === 'function'
          ? db.getSpecDbSyncState(resolvedCategory) : null;
        const storedMeta = syncState?.last_sync_meta
          ? (typeof syncState.last_sync_meta === 'string'
            ? JSON.parse(syncState.last_sync_meta) : syncState.last_sync_meta)
          : {};
        const storedSignature = storedMeta.field_rules_signature || null;

        if (currentSignature && currentSignature === storedSignature) {
          return;
        }

        logger.log(`[hash-reconcile] ${resolvedCategory}: field rules changed, running full reconcile`);
        const syncResult = await syncSpecDbForCategory({
          category: resolvedCategory,
          config,
          resolveCategoryAlias,
          getSpecDbReady: async () => db,
        });

        // WHY: Use post-sync signature from syncResult, not pre-computed currentSignature.
        // If sync triggered an auto-compile, generated artifacts changed and
        // currentSignature (computed before sync) is stale.
        if (typeof db.recordSpecDbSync === 'function') {
          const meta = syncResult && typeof syncResult === 'object' ? { ...syncResult } : {};
          meta.field_rules_signature = syncResult?.field_rules_signature || currentSignature;
          db.recordSpecDbSync({ category: resolvedCategory, status: 'ok', meta });
        }

        const durationMs = syncResult?.duration_ms || 0;
        logger.log(`[hash-reconcile] ${resolvedCategory}: reconcile complete (${durationMs}ms)`);
      } catch (err) {
        logger.error(`[hash-reconcile] ${resolvedCategory} failed:`, err?.message || err);
      } finally {
        specDbSeedPromises.delete(key);
      }
    })();
    specDbSeedPromises.set(key, promise);
  }

  function getSpecDb(category) {
    const resolvedCategory = resolveCategoryAlias(category);
    if (!resolvedCategory) return null;
    if (resolvedCategory === 'all') return null;
    if (specDbCache.has(resolvedCategory)) return specDbCache.get(resolvedCategory);

    const primaryPath = path.join(config.specDbDir || '.workspace/db', resolvedCategory, 'spec.sqlite');

    try {
      fsSync.accessSync(primaryPath);
      const db = new specDbClass({ dbPath: primaryPath, category: resolvedCategory, globalDb: appDb?.db });
      if (db.isSeeded()) {
        specDbCache.set(resolvedCategory, db);
        sweepOrphanRunsIfSupported(resolvedCategory, db);
        triggerHashGatedReconcile(resolvedCategory, db);
        triggerReseedPhases(resolvedCategory, db);
        return db;
      }
      specDbCache.set(resolvedCategory, db);
      triggerAutoSeed(resolvedCategory, db);
      return db;
    } catch (err) {
      logger.error(`[getSpecDb] primary open failed for ${resolvedCategory}:`, err?.message || err);
    }

    try {
      fsSync.mkdirSync(path.dirname(primaryPath), { recursive: true });
      const db = new specDbClass({ dbPath: primaryPath, category: resolvedCategory, globalDb: appDb?.db });
      specDbCache.set(resolvedCategory, db);
      triggerAutoSeed(resolvedCategory, db);
      return db;
    } catch (err) {
      logger.error(`[getSpecDb] fallback create failed for ${resolvedCategory}:`, err?.message || err);
      specDbCache.set(resolvedCategory, null);
      return null;
    }
  }

  function sweepOrphanRunsIfSupported(category, db) {
    if (typeof db?.sweepOrphanRuns !== 'function') return;
    try {
      const { swept } = db.sweepOrphanRuns({ maxAgeMinutes: 60 }) || {};
      if (swept > 0) {
        logger.log(`[sweep] ${category}: ${swept} orphan run(s) marked aborted`);
      }
    } catch (err) {
      logger.error(`[sweep] ${category} failed:`, err?.message || err);
    }
  }

  function triggerAutoSeed(category, db) {
    const resolvedCategory = resolveCategoryAlias(category);
    if (!resolvedCategory) return;
    if (specDbSeedPromises.has(resolvedCategory)) return;
    const promise = (async () => {
      try {
        const syncResult = await syncSpecDbForCategory({
          category: resolvedCategory,
          config,
          resolveCategoryAlias,
          getSpecDbReady: async () => db,
        });
        const syncVersion = Number.parseInt(String(syncResult.specdb_sync_version || ''), 10);
        const syncVersionText = Number.isFinite(syncVersion) && syncVersion > 0 ? `, version ${syncVersion}` : '';
        logger.log(
          `[auto-seed] ${resolvedCategory}: ${syncResult.components_seeded} components, ${syncResult.list_values_seeded} list values, ${syncResult.products_seeded} products (${syncResult.duration_ms}ms${syncVersionText})`,
        );
      } catch (err) {
        logger.error(`[auto-seed] ${resolvedCategory} failed:`, err?.message || err);
      } finally {
        specDbSeedPromises.delete(resolvedCategory);
      }
      triggerReseedPhases(resolvedCategory, db);
    })();
    specDbSeedPromises.set(resolvedCategory, promise);
  }

  async function getSpecDbReady(category) {
    const resolvedCategory = resolveCategoryAlias(category);
    const db = getSpecDb(resolvedCategory);
    if (!db) return null;
    const pending = specDbSeedPromises.get(resolvedCategory);
    if (pending) {
      try {
        await pending;
      } catch {
        // keep best available db handle
      }
    }
    // WHY: Await hash-gated reconcile if running.
    const reconcileKey = `${resolvedCategory}:hash-reconcile`;
    const reconcilePending = specDbSeedPromises.get(reconcileKey);
    if (reconcilePending) {
      try {
        await reconcilePending;
      } catch {
        // best-effort
      }
    }
    // WHY: Await all registered reseed phases. Generic loop — no per-phase edits needed.
    for (const phase of reseedPhases) {
      const key = `${resolvedCategory}:${phase.name}`;
      const reseedPending = reseedPromises.get(key);
      if (reseedPending) {
        try {
          await reseedPending;
        } catch {
          // best-effort — db still usable without reseed data
        }
      }
    }
    return getSpecDb(resolvedCategory);
  }

  return {
    specDbCache,
    reviewLayoutByCategory,
    getSpecDb,
    getSpecDbReady,
  };
}
