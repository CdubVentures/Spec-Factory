import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { defaultSnapshotRoot } from '../../core/config/runtimeArtifactRoots.js';
import { spawn, exec as execCb } from 'node:child_process';
import { loadCategoryConfig } from '../../categories/loader.js';
import { invalidateFieldRulesCache } from '../../field-rules/loader.js';
import {
  slugify as canonicalSlugify,
} from '../../features/catalog/index.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from './services/specDbSyncService.js';
import { handleCompileProcessCompletion } from './services/compileProcessCompletion.js';
import { handleIndexLabProcessCompletion } from './services/indexLabProcessCompletion.js';
import { dataChangeMatchesCategory } from '../../core/events/dataChangeContract.js';
import { toInt, toFloat, toUnitRatio, hasKnownValue } from '../../shared/valueNormalizers.js';
import { jsonRes, corsHeaders, readJsonBody, safeJoin } from './httpPrimitives.js';
import {
  safeReadJson, safeStat, listDirs, listFiles, readJsonlEvents,
  parseNdjson,
} from '../../shared/fileHelpers.js';
import {
  initIndexLabDataBuilders,
  invalidateEventCache,
} from '../../features/indexing/api/index.js';
import { createProcessRuntime } from './processRuntime.js';
import { createRealtimeBridge } from './realtimeBridge.js';
import { createBootstrapEnvironment } from './bootstrap/createBootstrapEnvironment.js';
import { OUTPUT_KEY_PREFIX } from '../../shared/storageKeyPrefixes.js';
import { createBootstrapSessionLayer } from './bootstrap/createBootstrapSessionLayer.js';
import { createBootstrapDomainRuntimes } from './bootstrap/createBootstrapDomainRuntimes.js';
import { assertNativeModulesHealthy } from '../../core/nativeModuleGuard.js';

// WHY: Documents the grouped return shape contract for bootstrapServer().
// Subordinate export — used by characterization tests to verify the shape
// without calling the side-effectful factory.
export const BOOTSTRAP_RETURN_GROUPS = {
  env: ['config', 'configGate', 'PORT', 'HELPER_ROOT', 'OUTPUT_ROOT', 'INDEXLAB_ROOT', 'LAUNCH_CWD'],
  storage: ['storage', 'getIndexLabRoot'],
  session: ['sessionCache', 'resolveCategoryAlias', 'specDbCache', 'reviewLayoutByCategory', 'getSpecDb', 'getSpecDbReady', 'appDb'],
  realtime: ['broadcastWs', 'setupWatchers', 'attachWebSocketUpgrade', 'getLastScreencastFrame'],
  process: ['processStatus', 'startProcess', 'stopProcess', 'isProcessRunning', 'waitForProcessExit', 'getSearxngStatus', 'startSearxngStack'],
  http: ['jsonRes', 'corsHeaders', 'readJsonBody'],
  helpers: ['toInt', 'toFloat', 'toUnitRatio', 'hasKnownValue', 'safeReadJson', 'safeStat', 'listFiles', 'listDirs', 'readJsonlEvents', 'safeJoin', 'canonicalSlugify', 'invalidateFieldRulesCache', 'loadCategoryConfig'],
  domain: [
    'normalizeLower', 'isMeaningfulValue', 'candidateLooksReference',
    'buildCatalog', 'patchCompiledComponentDb',
  ],
};

// WHY: Extracted from guiServer.js so the composition root is a thin
// orchestrator that calls bootstrapServer(), builds route contexts,
// and starts the HTTP server.
export function bootstrapServer({ projectRoot }) {
  // ── Phase 1: Environment (config, paths, storage) ──
  const env = createBootstrapEnvironment({ projectRoot });
  const {
    config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
    storage,
    resolveProjectPath, cleanVariant,
  } = env;

  // ── Native module guard (fail-loud before Phase 2) ──
  const nativeHealth = assertNativeModulesHealthy({ logger: console });
  if (!nativeHealth.ok) {
    throw new Error(
      `[FATAL] ${nativeHealth.error}\nFix: npm rebuild better-sqlite3\nNode: ${process.version} (${process.execPath})`,
    );
  }

  // ── Phase 2: Session + DB ──
  const {
    sessionCache, resolveCategoryAlias,
    specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady,
    appDb,
  } = createBootstrapSessionLayer({ config, HELPER_ROOT, storage, INDEXLAB_ROOT });

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
    // WHY: 30s ping interval catches half-open WS connections (NAT idle timeout,
    // OS sleep/wake, proxy drop) before the client gives up. Missing one pong →
    // server terminate() → client onclose → reconnect → hadConnection triggers
    // page reload, restoring a clean WS and fresh op broadcasts.
    heartbeatMs: 30_000,
  });

  // ── Process manager (stays inline — consumes all above + rebinds providers) ──
  const {
    getSearxngStatus, startSearxngStack,
    startProcess, stopProcess, processStatus, isProcessRunning,
    waitForProcessExit, forwardScreencastControl,
  } = createProcessRuntime({
    resolveProjectPath, path, fsSync, config, spawn, execCb,
    broadcastWs, invalidateEventCache, sessionCache, invalidateFieldRulesCache, reviewLayoutByCategory,
    syncSpecDbForCategory: ({ category }) =>
      syncSpecDbForCategoryService({ category, config, resolveCategoryAlias, getSpecDbReady }),
    handleCompileProcessCompletion, handleIndexLabProcessCompletion,
    indexLabRoot: INDEXLAB_ROOT, outputRoot: OUTPUT_ROOT,
    outputPrefix: OUTPUT_KEY_PREFIX,
    getSpecDbReady, getSpecDb, resolveCategoryAlias, logger: console,
  });

  processStatusProvider = processStatus;
  forwardScreencastControlProvider = forwardScreencastControl;

  const getIndexLabRoot = () => INDEXLAB_ROOT;

  // ── IndexLab init (side effect, no return value) ──
  initIndexLabDataBuilders({
    indexLabRoot: INDEXLAB_ROOT, outputRoot: OUTPUT_ROOT,
    storage, config,
    getSpecDbReady, isProcessRunning, processStatus,
    getIndexLabRoot,
  });

  // ── Phase 3: Domain runtimes (review + catalog) ──
  const domain = createBootstrapDomainRuntimes({
    config, HELPER_ROOT, storage, getSpecDb, cleanVariant,
  });

  // ── Crawl video cleanup (fire-and-forget, 24h TTL) ──
  // WHY: Must use os.tmpdir() to match crawlSession.js and runtimeOpsVideoHelpers.js.
  import('../../features/crawl/videoCleanup.js')
    .then(({ cleanupStaleVideoDirs }) => {
      const { tmpdir } = require('node:os');
      const videoBaseDir = path.join(tmpdir(), 'spec-factory-crawl-videos');
      cleanupStaleVideoDirs({ baseDir: videoBaseDir, maxAgeMs: 24 * 60 * 60 * 1000 });
    })
    .catch(() => { /* non-critical */ });

  // ── Snapshot cap (fire-and-forget, keep 10 most recent) ──
  import('../../core/config/snapshotCleanup.js')
    .then(({ cleanupOldSnapshots }) => {
      cleanupOldSnapshots({ dir: defaultSnapshotRoot(), maxCount: 10 });
    })
    .catch(() => { /* non-critical */ });

  return {
    env: { config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD },
    storage: { storage, getIndexLabRoot },
    session: { sessionCache, resolveCategoryAlias, specDbCache, reviewLayoutByCategory, getSpecDb, getSpecDbReady, appDb },
    realtime: { broadcastWs, setupWatchers, attachWebSocketUpgrade, getLastScreencastFrame },
    process: { processStatus, startProcess, stopProcess, isProcessRunning, waitForProcessExit, getSearxngStatus, startSearxngStack },
    http: { jsonRes, corsHeaders, readJsonBody },
    helpers: {
      toInt, toFloat, toUnitRatio, hasKnownValue,
      safeReadJson, safeStat, listFiles, listDirs, readJsonlEvents, safeJoin,
      canonicalSlugify, invalidateFieldRulesCache,
      loadCategoryConfig,
    },
    domain: { ...domain },
  };
}
