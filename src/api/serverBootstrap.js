import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, exec as execCb } from 'node:child_process';
import { loadCategoryConfig } from '../categories/loader.js';
import { invalidateFieldRulesCache } from '../field-rules/loader.js';
import {
  slugify as canonicalSlugify,
  loadProductCatalog,
} from '../features/catalog/index.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from './services/specDbSyncService.js';
import { handleCompileProcessCompletion } from './services/compileProcessCompletion.js';
import { handleIndexLabProcessCompletion } from './services/indexLabProcessCompletion.js';
import { dataChangeMatchesCategory } from '../core/events/dataChangeContract.js';
import { toInt, toFloat, toUnitRatio, hasKnownValue } from './helpers/valueNormalizers.js';
import { jsonRes, corsHeaders, readJsonBody, safeJoin } from './helpers/httpPrimitives.js';
import {
  safeReadJson, safeStat, listDirs, listFiles, readJsonlEvents,
  parseNdjson,
} from './helpers/fileHelpers.js';
import {
  initIndexLabDataBuilders,
} from '../features/indexing/api/index.js';
import { createProcessRuntime } from '../app/api/processRuntime.js';
import { createRealtimeBridge } from '../app/api/realtimeBridge.js';
import { createBootstrapEnvironment } from './bootstrap/createBootstrapEnvironment.js';
import { resolveCurrentIndexLabRoot } from './guiServerRuntimeConfig.js';
import { OUTPUT_KEY_PREFIX } from '../shared/storageKeyPrefixes.js';
import { defaultIndexLabRoot, defaultLocalOutputRoot } from '../core/config/runtimeArtifactRoots.js';
import { createBootstrapSessionLayer } from './bootstrap/createBootstrapSessionLayer.js';
import { createBootstrapDomainRuntimes } from './bootstrap/createBootstrapDomainRuntimes.js';

// WHY: Extracted from guiServer.js so the composition root is a thin
// orchestrator that calls bootstrapServer(), builds route contexts,
// and starts the HTTP server.
export function bootstrapServer({ projectRoot }) {
  // ── Phase 1: Environment (config, paths, storage) ──
  const env = createBootstrapEnvironment({ projectRoot });
  const {
    config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
    storage, runDataStorageState, runDataArchiveStorage, getRunDataArchiveStorage,
    resolveProjectPath, cleanVariant, catalogKey, markEnumSuggestionStatusBound,
  } = env;

  // ── Phase 2: Session + DB ──
  const {
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
  } = createBootstrapSessionLayer({ config, HELPER_ROOT, storage });

  // ── Realtime bridge (stays inline — circular closure binding) ──
  let processStatusProvider = () => ({ running: false });
  let forwardScreencastControlProvider = () => false;

  const {
    broadcastWs, setupWatchers, attachWebSocketUpgrade, getLastScreencastFrame,
  } = createRealtimeBridge({
    path, fs,
    outputRoot: OUTPUT_ROOT, indexLabRoot: INDEXLAB_ROOT,
    parseNdjson, dataChangeMatchesCategory,
    processStatus: () => processStatusProvider(),
    forwardScreencastControl: (options) => forwardScreencastControlProvider(options),
  });

  // ── Process manager (stays inline — consumes all above + rebinds providers) ──
  const {
    getSearxngStatus, startSearxngStack,
    startProcess, stopProcess, processStatus, isProcessRunning,
    waitForProcessExit, forwardScreencastControl,
  } = createProcessRuntime({
    resolveProjectPath, path, fsSync, config, spawn, execCb,
    broadcastWs, sessionCache, invalidateFieldRulesCache, reviewLayoutByCategory,
    syncSpecDbForCategory: ({ category }) =>
      syncSpecDbForCategoryService({ category, config, resolveCategoryAlias, getSpecDbReady }),
    handleCompileProcessCompletion, handleIndexLabProcessCompletion,
    runDataStorageState,
    indexLabRoot: INDEXLAB_ROOT, outputRoot: OUTPUT_ROOT,
    outputPrefix: OUTPUT_KEY_PREFIX,
    getSpecDbReady, resolveCategoryAlias, logger: console,
  });

  processStatusProvider = processStatus;
  forwardScreencastControlProvider = forwardScreencastControl;

  // WHY: Dynamic getter so run discovery tracks live storage settings, not boot-time snapshot.
  // Falls back to boot-time INDEXLAB_ROOT (which honours --indexlab-root) instead of the
  // global default, so tests and CLI overrides are respected.
  const getIndexLabRoot = () => resolveCurrentIndexLabRoot({
    runDataStorageState, defaultIndexLabRoot: () => INDEXLAB_ROOT, defaultLocalOutputRoot,
  });

  // ── IndexLab init (side effect, no return value) ──
  initIndexLabDataBuilders({
    indexLabRoot: INDEXLAB_ROOT, outputRoot: OUTPUT_ROOT,
    storage, runDataArchiveStorage, config,
    getSpecDbReady, isProcessRunning, processStatus, runDataStorageState,
    getIndexLabRoot, getRunDataArchiveStorage,
  });

  // ── Phase 3: Domain runtimes (review + catalog) ──
  const domain = createBootstrapDomainRuntimes({
    config, HELPER_ROOT, storage, getSpecDb, cleanVariant, catalogKey,
  });

  return {
    config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
    storage, runDataStorageState, getIndexLabRoot,
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
    broadcastWs, setupWatchers, attachWebSocketUpgrade, getLastScreencastFrame,
    processStatus, startProcess, stopProcess, isProcessRunning,
    waitForProcessExit, getSearxngStatus, startSearxngStack,
    jsonRes, corsHeaders, readJsonBody,
    toInt, toFloat, toUnitRatio, hasKnownValue,
    safeReadJson, safeStat, listFiles, listDirs, readJsonlEvents, safeJoin,
    canonicalSlugify, invalidateFieldRulesCache,
    loadProductCatalog, loadCategoryConfig,
    ...domain,
    markEnumSuggestionStatusBound,
  };
}
