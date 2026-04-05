import fsSync from 'node:fs';
import path from 'node:path';
import { loadCategoryConfig } from '../../../categories/loader.js';
import { createSessionCache } from '../../../field-rules/sessionCache.js';
import { createCategoryAliasResolver } from '../categoryAlias.js';
import { createSpecDbRuntime } from '../specDbRuntime.js';
import { SpecDb } from '../../../db/specDb.js';
import { AppDb } from '../../../db/appDb.js';
import { seedAppDb } from '../../../db/appDbSeed.js';
import { seedColorRegistry } from '../../../features/color-registry/index.js';
import {
  applyRuntimeSettingsToConfig,
  loadUserSettingsSync,
} from '../../../features/settings-authority/index.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from '../services/specDbSyncService.js';
import { safeReadJson } from '../../../shared/fileHelpers.js';
import { defaultUserSettingsRoot, defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { buildFieldRulesSignature } from '../../../field-rules/loader.js';

export function createBootstrapSessionLayer({
  config, HELPER_ROOT, storage, INDEXLAB_ROOT = '',
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
    indexLabRoot: INDEXLAB_ROOT,
    productRoot: defaultProductRoot(),
    buildFieldRulesSignature,
  });

  const sessionCache = createSessionCache({
    loadCategoryConfig: (category) => loadCategoryConfig(category, { storage, config }),
    getSpecDb,
    readJsonIfExists: safeReadJson,
    statFile: (filePath) => fsSync.promises.stat(filePath),
    helperRoot: HELPER_ROOT,
  });

  // ── Global AppDb ──
  const appDbDir = path.resolve(config.specDbDir || '.workspace/db');
  fsSync.mkdirSync(appDbDir, { recursive: true });
  const appDb = new AppDb({ dbPath: path.join(appDbDir, 'app.sqlite') });
  seedAppDb({
    appDb,
    brandRegistryPath: path.resolve(HELPER_ROOT, '_global', 'brand_registry.json'),
    userSettingsPath: path.join(defaultUserSettingsRoot(), 'user-settings.json'),
  });
  // WHY: createBootstrapEnvironment applied settings from user-settings.json before
  // appDb existed. Now that SQL is open, rehydrate config from the authoritative store
  // so any settings that were saved to SQL but not mirrored to JSON are restored.
  const persistedSettings = loadUserSettingsSync({ appDb });
  applyRuntimeSettingsToConfig(config, persistedSettings.runtime, { mode: 'bootstrap' });

  const colorRegistryPath = path.resolve(HELPER_ROOT, '_global', 'color_registry.json');
  seedColorRegistry(appDb, colorRegistryPath);

  return {
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
    appDb,
  };
}
