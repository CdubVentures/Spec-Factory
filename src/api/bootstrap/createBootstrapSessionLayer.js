import fsSync from 'node:fs';
import path from 'node:path';
import { loadCategoryConfig } from '../../categories/loader.js';
import { createSessionCache } from '../../field-rules/sessionCache.js';
import { createCategoryAliasResolver } from '../../app/api/categoryAlias.js';
import { createSpecDbRuntime } from '../../app/api/specDbRuntime.js';
import { SpecDb } from '../../db/specDb.js';
import { AppDb } from '../../db/appDb.js';
import { seedAppDb } from '../../db/appDbSeed.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from '../services/specDbSyncService.js';
import { safeReadJson } from '../helpers/fileHelpers.js';

export function createBootstrapSessionLayer({
  config, HELPER_ROOT, storage,
}) {
  const resolveCategoryAlias = createCategoryAliasResolver({
    helperRoot: HELPER_ROOT,
    path,
    existsSync: (targetPath) => fsSync.existsSync(targetPath),
  });

  // ── Lazy SpecDb Cache ──
  const {
    specDbCache,
    reviewLayoutByCategory,
    getSpecDb,
    getSpecDbReady,
  } = createSpecDbRuntime({
    resolveCategoryAlias,
    specDbClass: SpecDb,
    path,
    fsSync,
    syncSpecDbForCategory: syncSpecDbForCategoryService,
    config,
    logger: console,
  });

  const sessionCache = createSessionCache({
    loadCategoryConfig: (category) => loadCategoryConfig(category, { storage, config }),
    getSpecDb,
    readJsonIfExists: safeReadJson,
    statFile: (filePath) => fsSync.promises.stat(filePath),
    helperRoot: HELPER_ROOT,
  });

  // ── Global AppDb ──
  const appDbDir = path.resolve(config.specDbDir || '.specfactory_tmp');
  fsSync.mkdirSync(appDbDir, { recursive: true });
  const appDb = new AppDb({ dbPath: path.join(appDbDir, 'app.sqlite') });
  seedAppDb({
    appDb,
    brandRegistryPath: path.resolve(HELPER_ROOT, '_global', 'brand_registry.json'),
    userSettingsPath: path.resolve(HELPER_ROOT, '_runtime', 'user-settings.json'),
  });

  return {
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
    appDb,
  };
}
