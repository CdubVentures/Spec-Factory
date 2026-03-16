import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, exec as execCb } from 'node:child_process';
import { loadConfig, loadDotEnvFile } from '../config.js';
import { CONFIG_MANIFEST_DEFAULTS } from '../core/config/manifest.js';
import { defaultIndexLabRoot, defaultLocalOutputRoot } from '../core/config/runtimeArtifactRoots.js';
import { createStorage } from '../s3/storage.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { loadQueueState } from '../queue/queueState.js';
import {
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
} from './reviewMutationResolvers.js';
import { createReviewCandidateRuntime } from './reviewCandidateRuntime.js';
import { createReviewGridStateRuntime } from './reviewGridStateRuntime.js';
import {
  resolveProjectPath as resolveProjectPathForRoot,
  normalizeRuntimeArtifactWorkspaceDefaults,
  assertNoShadowHelperRuntime,
  envToken as envTokenFromProcess,
  envBool as envBoolFromProcess,
  resolveStorageBackedWorkspaceRoots as resolveStorageBackedWorkspaceRootsFromSettings,
  resolveRunDataDestinationType,
  createRunDataArchiveStorage,
} from './guiServerRuntimeConfig.js';
import { SpecDb } from '../db/specDb.js';
import { componentReviewPath } from '../engine/curationSuggestions.js';
import { invalidateFieldRulesCache } from '../field-rules/loader.js';
import { createSessionCache } from '../field-rules/sessionCache.js';
import {
  slugify as canonicalSlugify,
  cleanVariant as canonicalCleanVariant,
  loadProductCatalog,
} from '../features/catalog/index.js';
import { SETTINGS_DEFAULTS } from '../shared/settingsDefaults.js';
import {
  buildComponentReviewSyntheticCandidateId,
} from '../utils/candidateIdentifier.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from './services/specDbSyncService.js';
import { handleCompileProcessCompletion } from './services/compileProcessCompletion.js';
import { handleIndexLabProcessCompletion } from './services/indexLabProcessCompletion.js';
import { dataChangeMatchesCategory } from './events/dataChangeContract.js';
import { normalizeRunDataStorageSettings } from './services/runDataRelocationService.js';
import {
  applyConvergenceSettingsToConfig,
  applyRuntimeSettingsToConfig,
  loadUserSettingsSync,
} from '../features/settings-authority/index.js';
import { toInt, toFloat, toUnitRatio, hasKnownValue, normalizePathToken } from './helpers/valueNormalizers.js';
import { jsonRes, corsHeaders, readJsonBody, safeJoin } from './helpers/httpPrimitives.js';
import {
  safeReadJson, safeStat, listDirs, listFiles, readJsonlEvents,
  parseNdjson, markEnumSuggestionStatus,
} from './helpers/fileHelpers.js';
import {
  initIndexLabDataBuilders,
} from '../features/indexing/api/index.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../app/api/catalogHelpers.js';
import { createCategoryAliasResolver } from '../app/api/categoryAlias.js';
import { createSpecDbRuntime } from '../app/api/specDbRuntime.js';
import { createProcessRuntime } from '../app/api/processRuntime.js';
import { createRealtimeBridge } from '../app/api/realtimeBridge.js';

// WHY: Extracted from guiServer.js so the composition root is a thin
// orchestrator (~200 LOC) that calls bootstrapServer(), builds route
// contexts, and starts the HTTP server.
export function bootstrapServer({ projectRoot }) {
  const resolveProjectPath = (value, fallback = '') =>
    resolveProjectPathForRoot({ projectRoot, value, fallback });
  const envToken = (name, fallback = '') =>
    envTokenFromProcess({ env: process.env, name, fallback });
  const envBool = (name, fallback = false) =>
    envBoolFromProcess({ env: process.env, name, fallback });
  const resolveStorageBackedWorkspaceRoots = (settings = {}) =>
    resolveStorageBackedWorkspaceRootsFromSettings({
      settings,
      defaultLocalOutputRoot,
    });

  function cleanVariant(v) {
    return canonicalCleanVariant(v);
  }

  function normText(v) {
    return String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function catalogKey(brand, model, variant) {
    return `${normText(brand)}|${normText(model)}|${normText(cleanVariant(variant))}`;
  }

  function slugify(value) {
    return canonicalSlugify(value);
  }

  function buildProductIdFromParts(category, brand, model, variant) {
    return [slugify(category), slugify(brand), slugify(model), slugify(cleanVariant(variant))]
      .filter(Boolean)
      .join('-');
  }

  // ── Args ──
  const args = process.argv.slice(2);
  function argVal(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
  }
  const PORT = toInt(
    argVal('port', process.env.PORT || CONFIG_MANIFEST_DEFAULTS.PORT || '8788'),
    Number.parseInt(String(CONFIG_MANIFEST_DEFAULTS.PORT || '8788'), 10) || 8788
  );
  const isLocal = args.includes('--local');
  const explicitLocalOutputRoot = String(argVal('local-output-root', process.env.LOCAL_OUTPUT_ROOT || '') || '').trim();

  // ── Config + Storage ──
  if (!loadDotEnvFile()) {
    loadDotEnvFile(path.join(projectRoot, '.env'));
  }
  const config = loadConfig({
    ...(isLocal ? { localMode: true } : {}),
    ...(argVal('local-input-root', '') ? { localInputRoot: argVal('local-input-root', '') } : {}),
    ...(argVal('local-output-root', '') ? { localOutputRoot: argVal('local-output-root', '') } : {}),
    ...(argVal('output-mode', '') ? { outputMode: argVal('output-mode', '') } : {}),
  });
  const resolvedCategoryAuthorityRoot = resolveProjectPath(
    config.categoryAuthorityRoot || config['helper' + 'FilesRoot'],
    'category_authority',
  );
  config.categoryAuthorityRoot = resolvedCategoryAuthorityRoot;
  config['helper' + 'FilesRoot'] = resolvedCategoryAuthorityRoot;
  config.localOutputRoot = resolveProjectPath(config.localOutputRoot, defaultLocalOutputRoot());
  config.localInputRoot = resolveProjectPath(config.localInputRoot, 'fixtures/s3');
  const HELPER_ROOT = resolveProjectPath(config['helper' + 'FilesRoot'], 'category_authority');
  const LAUNCH_CWD = path.resolve(process.cwd());
  assertNoShadowHelperRuntime({
    helperRoot: HELPER_ROOT,
    launchCwd: LAUNCH_CWD,
    existsSync: fsSync.existsSync,
  });
  const userSettings = loadUserSettingsSync({ categoryAuthorityRoot: HELPER_ROOT });
  applyRuntimeSettingsToConfig(config, userSettings.runtime);
  applyConvergenceSettingsToConfig(config, userSettings.convergence);
  normalizeRuntimeArtifactWorkspaceDefaults({
    config,
    projectRoot,
    explicitLocalOutputRoot,
    persistedRuntimeSettings: userSettings.runtime,
    defaultLocalOutputRoot,
    repoDefaultOutputRoot: SETTINGS_DEFAULTS.runtime?.localOutputRoot,
  });

  config.settingsCanonicalOnlyWrites = envBool('SETTINGS_CANONICAL_ONLY_WRITES', true);

  const runDataStorageState = normalizeRunDataStorageSettings({
    enabled: envBool('RUN_DATA_STORAGE_ENABLED', envToken('S3_BUCKET', '') !== ''),
    destinationType: resolveRunDataDestinationType({ env: process.env }),
    localDirectory: envToken('RUN_DATA_STORAGE_LOCAL_DIRECTORY', ''),
    awsRegion: envToken('RUN_DATA_STORAGE_S3_REGION', config.awsRegion || 'us-east-2'),
    s3Bucket: envToken('RUN_DATA_STORAGE_S3_BUCKET', config.s3Bucket || ''),
    s3Prefix: envToken('RUN_DATA_STORAGE_S3_PREFIX', 'spec-factory-runs'),
    s3AccessKeyId: envToken('RUN_DATA_STORAGE_S3_ACCESS_KEY_ID', process.env.AWS_ACCESS_KEY_ID || ''),
    s3SecretAccessKey: envToken('RUN_DATA_STORAGE_S3_SECRET_ACCESS_KEY', process.env.AWS_SECRET_ACCESS_KEY || ''),
    s3SessionToken: envToken('RUN_DATA_STORAGE_S3_SESSION_TOKEN', process.env.AWS_SESSION_TOKEN || ''),
    updatedAt: null,
    ...userSettings.storage,
  });
  if (runDataStorageState.awsRegion) config.awsRegion = runDataStorageState.awsRegion;
  if (runDataStorageState.s3Bucket) config.s3Bucket = runDataStorageState.s3Bucket;
  const storageBackedWorkspaceRoots = resolveStorageBackedWorkspaceRoots(runDataStorageState);
  if (storageBackedWorkspaceRoots) {
    if (storageBackedWorkspaceRoots.outputRoot) {
      config.localOutputRoot = storageBackedWorkspaceRoots.outputRoot;
    }
    if (storageBackedWorkspaceRoots.specDbDir) {
      config.specDbDir = storageBackedWorkspaceRoots.specDbDir;
    }
    if (storageBackedWorkspaceRoots.llmExtractionCacheDir) {
      config.llmExtractionCacheDir = storageBackedWorkspaceRoots.llmExtractionCacheDir;
    }
  }
  const OUTPUT_ROOT = resolveProjectPath(config.localOutputRoot, defaultLocalOutputRoot());
  const INDEXLAB_ROOT = storageBackedWorkspaceRoots?.indexLabRoot
    ? storageBackedWorkspaceRoots.indexLabRoot
    : resolveProjectPath(argVal('indexlab-root', ''), defaultIndexLabRoot());
  const storage = createStorage(config);
  const runDataArchiveStorage = createRunDataArchiveStorage({
    runDataStorageState,
    config,
    createStorage,
  });

  const markEnumSuggestionStatusBound = (category, field, value, status = 'accepted') =>
    markEnumSuggestionStatus(category, field, value, status, HELPER_ROOT);

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

  let processStatusProvider = () => ({ running: false });
  let forwardScreencastControlProvider = () => false;

  const {
    broadcastWs,
    setupWatchers,
    attachWebSocketUpgrade,
    getLastScreencastFrame,
  } = createRealtimeBridge({
    path,
    fs,
    outputRoot: OUTPUT_ROOT,
    indexLabRoot: INDEXLAB_ROOT,
    parseNdjson,
    dataChangeMatchesCategory,
    processStatus: () => processStatusProvider(),
    forwardScreencastControl: (options) => forwardScreencastControlProvider(options),
  });

  // ── Process Manager ──
  const {
    getSearxngStatus,
    startSearxngStack,
    startProcess,
    stopProcess,
    processStatus,
    isProcessRunning,
    waitForProcessExit,
    forwardScreencastControl,
  } = createProcessRuntime({
    resolveProjectPath,
    path,
    fsSync,
    config,
    spawn,
    execCb,
    broadcastWs,
    sessionCache,
    invalidateFieldRulesCache,
    reviewLayoutByCategory,
    syncSpecDbForCategory: ({ category }) =>
      syncSpecDbForCategoryService({
        category,
        config,
        resolveCategoryAlias,
        getSpecDbReady,
      }),
    handleCompileProcessCompletion,
    handleIndexLabProcessCompletion,
    runDataStorageState,
    indexLabRoot: INDEXLAB_ROOT,
    outputRoot: OUTPUT_ROOT,
    outputPrefix: config.s3OutputPrefix || 'specs/outputs',
    getSpecDbReady,
    resolveCategoryAlias,
    logger: console,
  });

  processStatusProvider = processStatus;
  forwardScreencastControlProvider = forwardScreencastControl;

  initIndexLabDataBuilders({
    indexLabRoot: INDEXLAB_ROOT,
    outputRoot: OUTPUT_ROOT,
    storage,
    runDataArchiveStorage,
    config,
    getSpecDbReady,
    isProcessRunning,
    processStatus,
    runDataStorageState,
  });

  const {
    ensureGridKeyReviewState,
    resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
    purgeTestModeCategoryState,
    resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
  } = createReviewGridStateRuntime({
    resolveExplicitPositiveId,
    resolveGridFieldStateForMutation,
  });

  const {
    normalizeLower,
    isMeaningfulValue,
    candidateLooksReference,
    annotateCandidatePrimaryReviews,
    getPendingItemPrimaryCandidateIds,
    getPendingComponentSharedCandidateIdsAsync,
    getPendingEnumSharedCandidateIds,
    syncSyntheticCandidatesFromComponentReview,
    remapPendingComponentReviewItemsForNameChange,
    propagateSharedLaneDecision,
  } = createReviewCandidateRuntime({
    componentReviewPath,
    safeReadJson,
    fs,
    getSpecDb,
    config,
    normalizePathToken,
    buildComponentReviewSyntheticCandidateId,
  });

  // ── Catalog builder ──
  const buildCatalog = createCatalogBuilder({
    config,
    storage,
    getSpecDb,
    loadQueueState,
    loadProductCatalog,
    cleanVariant,
    catalogKey,
    path,
  });

  const patchCompiledComponentDb = createCompiledComponentDbPatcher({
    helperRoot: HELPER_ROOT,
    listFiles,
    safeReadJson,
    fs,
    path,
  });

  return {
    // Config & paths
    config, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
    storage, runDataStorageState,
    // Session & SpecDb
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
    // Realtime
    broadcastWs, setupWatchers, attachWebSocketUpgrade, getLastScreencastFrame,
    // Process
    processStatus, startProcess, stopProcess, isProcessRunning,
    waitForProcessExit, getSearxngStatus, startSearxngStack,
    // HTTP primitives
    jsonRes, corsHeaders, readJsonBody,
    toInt, toFloat, toUnitRatio, hasKnownValue,
    // File I/O
    safeReadJson, safeStat, listFiles, listDirs, readJsonlEvents, safeJoin,
    canonicalSlugify, invalidateFieldRulesCache,
    // Shared domain
    loadProductCatalog, loadCategoryConfig,
    // Review runtime
    ensureGridKeyReviewState, resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState, syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
    purgeTestModeCategoryState, resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
    normalizeLower, isMeaningfulValue, candidateLooksReference,
    annotateCandidatePrimaryReviews, getPendingItemPrimaryCandidateIds,
    getPendingComponentSharedCandidateIdsAsync, getPendingEnumSharedCandidateIds,
    syncSyntheticCandidatesFromComponentReview,
    remapPendingComponentReviewItemsForNameChange, propagateSharedLaneDecision,
    markEnumSuggestionStatusBound,
    // Catalog runtime
    buildCatalog, patchCompiledComponentDb,
  };
}
