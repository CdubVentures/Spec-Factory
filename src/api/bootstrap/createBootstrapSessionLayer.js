import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { loadCategoryConfig } from '../../categories/loader.js';
import { createSessionCache } from '../../field-rules/sessionCache.js';
import { createCategoryAliasResolver } from '../../app/api/categoryAlias.js';
import { createSpecDbRuntime } from '../../app/api/specDbRuntime.js';
import { SpecDb } from '../../db/specDb.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from '../services/specDbSyncService.js';
import { safeReadJson } from '../helpers/fileHelpers.js';

export function createBootstrapSessionLayer({
  config, HELPER_ROOT, storage,
}) {
  const sessionCache = createSessionCache({
    loadCategoryConfig: (category) => loadCategoryConfig(category, { storage, config }),
    readJsonIfExists: safeReadJson,
    writeFile: (filePath, data) => fs.writeFile(filePath, data),
    mkdir: (dirPath, opts) => fs.mkdir(dirPath, opts),
    statFile: (filePath) => fs.stat(filePath),
    helperRoot: HELPER_ROOT,
  });

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

  return {
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
  };
}
