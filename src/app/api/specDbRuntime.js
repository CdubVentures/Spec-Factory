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

  function getSpecDb(category) {
    const resolvedCategory = resolveCategoryAlias(category);
    if (!resolvedCategory) return null;
    if (specDbCache.has(resolvedCategory)) return specDbCache.get(resolvedCategory);

    const primaryPath = path.join('.specfactory_tmp', resolvedCategory, 'spec.sqlite');

    try {
      fsSync.accessSync(primaryPath);
      const db = new specDbClass({ dbPath: primaryPath, category: resolvedCategory });
      if (db.isSeeded()) {
        specDbCache.set(resolvedCategory, db);
        return db;
      }
      specDbCache.set(resolvedCategory, db);
      triggerAutoSeed(resolvedCategory, db);
      return db;
    } catch {
      // create path below
    }

    try {
      fsSync.mkdirSync(path.dirname(primaryPath), { recursive: true });
      const db = new specDbClass({ dbPath: primaryPath, category: resolvedCategory });
      specDbCache.set(resolvedCategory, db);
      triggerAutoSeed(resolvedCategory, db);
      return db;
    } catch {
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
    return getSpecDb(resolvedCategory);
  }

  return {
    specDbCache,
    reviewLayoutByCategory,
    getSpecDb,
    getSpecDbReady,
  };
}
