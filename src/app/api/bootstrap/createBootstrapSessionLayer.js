import fsSync from 'node:fs';
import path from 'node:path';
import { createSessionCache } from '../../../field-rules/sessionCache.js';
import { createCategoryAliasResolver } from '../categoryAlias.js';
import { createSpecDbRuntime } from '../specDbRuntime.js';
import { SpecDb } from '../../../db/specDb.js';
import { AppDb } from '../../../db/appDb.js';
import { seedAppDb, seedBillingFromJsonl } from '../../../db/appDbSeed.js';
import { seedColorRegistry } from '../../../features/color-registry/index.js';
import {
  applyRuntimeSettingsToConfig,
  loadUserSettingsSync,
} from '../../../features/settings-authority/index.js';
import { loadGlobalPromptsSync } from '../../../core/llm/prompts/globalPromptStore.js';
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

  // ── Global AppDb ──
  // WHY: Opened first so createSpecDbRuntime can thread appDb.db into each
  // per-category specDb as the shared `globalDb` for finder_global_settings.
  const appDbDir = path.resolve(config.specDbDir || '.workspace/db');
  fsSync.mkdirSync(appDbDir, { recursive: true });
  const appDb = new AppDb({ dbPath: path.join(appDbDir, 'app.sqlite') });
  // WHY: Rebuild contract — seed finder_global_settings from _global/ JSON
  // mirrors when app.sqlite is fresh.
  appDb.reseedFinderGlobalSettingsFromJson({ helperRoot: HELPER_ROOT });
  seedAppDb({
    appDb,
    brandRegistryPath: path.resolve(HELPER_ROOT, '_global', 'brand_registry.json'),
    userSettingsPath: path.join(defaultUserSettingsRoot(), 'user-settings.json'),
    unitRegistryPath: path.resolve(HELPER_ROOT, '_global', 'unit_registry.json'),
  });
  loadGlobalPromptsSync({ appDb });

  // ── Lazy SpecDb Cache ──
  const {
    specDbCache,
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
    appDb,
  });

  const sessionCache = createSessionCache({
    getSpecDb,
  });
  // WHY: createBootstrapEnvironment applied settings from user-settings.json before
  // appDb existed. Now that SQL is open, rehydrate config from the authoritative store
  // so any settings that were saved to SQL but not mirrored to JSON are restored.
  const persistedSettings = loadUserSettingsSync({ appDb });
  applyRuntimeSettingsToConfig(config, persistedSettings.runtime, { mode: 'bootstrap' });

  const colorRegistryPath = path.resolve(HELPER_ROOT, '_global', 'color_registry.json');
  seedColorRegistry(appDb, colorRegistryPath);

  // WHY: Rebuild contract — if billing_entries is empty but JSONL ledger files
  // exist (e.g. after app.sqlite was deleted), restore from durable memory.
  const billingLedgerDir = path.resolve(config.specDbDir || '.workspace', 'global', 'billing', 'ledger');
  seedBillingFromJsonl({ appDb, billingLedgerDir });

  return {
    sessionCache, resolveCategoryAlias,
    specDbCache, getSpecDb, getSpecDbReady,
    appDb,
  };
}
