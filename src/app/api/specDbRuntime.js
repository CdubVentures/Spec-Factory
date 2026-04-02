import { scanAndSeedCheckpoints } from '../../pipeline/checkpoint/scanAndSeedCheckpoints.js';

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
  const checkpointReseedPromises = new Map();
  const reviewLayoutByCategory = new Map();

  // WHY: Re-seed run metadata from checkpoint files on disk. Runs
  // independently of triggerAutoSeed so it fires even when isSeeded()
  // returns true (partial rebuild: products > 0, runs = 0).
  function triggerCheckpointReseed(category, db) {
    if (!indexLabRoot) return;
    const resolvedCategory = resolveCategoryAlias(category);
    if (!resolvedCategory) return;
    if (checkpointReseedPromises.has(resolvedCategory)) return;
    const promise = (async () => {
      try {
        const seedResult = await scanAndSeedCheckpoints({ specDb: db, indexLabRoot, productRoot });
        if (seedResult.runs_seeded > 0) {
          logger.log(`[auto-seed] ${resolvedCategory}: ${seedResult.runs_seeded} runs re-seeded from checkpoints`);
        }
      } catch (err) {
        logger.error(`[auto-seed] ${resolvedCategory} checkpoint re-seed failed:`, err?.message || err);
      } finally {
        checkpointReseedPromises.delete(resolvedCategory);
      }
    })();
    checkpointReseedPromises.set(resolvedCategory, promise);
  }

  function getSpecDb(category) {
    const resolvedCategory = resolveCategoryAlias(category);
    if (!resolvedCategory) return null;
    if (resolvedCategory === 'all') return null;
    if (specDbCache.has(resolvedCategory)) return specDbCache.get(resolvedCategory);

    const primaryPath = path.join(config.specDbDir || '.workspace/db', resolvedCategory, 'spec.sqlite');

    try {
      fsSync.accessSync(primaryPath);
      const db = new specDbClass({ dbPath: primaryPath, category: resolvedCategory });
      if (db.isSeeded()) {
        specDbCache.set(resolvedCategory, db);
        triggerCheckpointReseed(resolvedCategory, db);
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
      const db = new specDbClass({ dbPath: primaryPath, category: resolvedCategory });
      specDbCache.set(resolvedCategory, db);
      triggerAutoSeed(resolvedCategory, db);
      return db;
    } catch (err) {
      logger.error(`[getSpecDb] fallback create failed for ${resolvedCategory}:`, err?.message || err);
      specDbCache.set(resolvedCategory, null);
      return null;
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
      triggerCheckpointReseed(resolvedCategory, db);
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
    const checkpointPending = checkpointReseedPromises.get(resolvedCategory);
    if (checkpointPending) {
      try {
        await checkpointPending;
      } catch {
        // best-effort — db still usable without checkpoint runs
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
