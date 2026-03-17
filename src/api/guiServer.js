import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, exec as execCb } from 'node:child_process';
import { bootstrapServer } from './serverBootstrap.js';
import { createGuiServerHttpAssembly } from './guiServerHttpAssembly.js';
import { registerInfraRoutes } from '../app/api/routes/infraRoutes.js';
import { registerConfigRoutes } from '../features/settings/api/configRoutes.js';
import { registerIndexlabRoutes } from '../features/indexing/api/indexlabRoutes.js';
import { registerCatalogRoutes } from '../features/catalog/api/catalogRoutes.js';
import { registerBrandRoutes } from '../features/catalog/api/brandRoutes.js';
import { registerStudioRoutes } from '../features/studio/api/studioRoutes.js';
import { registerDataAuthorityRoutes } from '../features/category-authority/api/dataAuthorityRoutes.js';
import { registerReviewRoutes } from '../features/review/api/reviewRoutes.js';
import { registerTestModeRoutes } from '../app/api/routes/testModeRoutes.js';
import { registerQueueBillingLearningRoutes } from '../features/indexing/api/queueBillingLearningRoutes.js';
import { registerSourceStrategyRoutes } from '../features/indexing/api/sourceStrategyRoutes.js';
import { registerRuntimeOpsRoutes } from '../features/indexing/api/runtimeOpsRoutes.js';
import {
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
} from '../app/api/requestDispatch.js';
import { createGuiApiRouteRegistry } from '../app/api/routeRegistry.js';
import { createRegisteredGuiApiRouteHandlers } from '../app/api/guiRouteRegistration.js';
import { createGuiApiPipeline } from '../app/api/guiApiPipeline.js';
import { createInfraRouteContext } from '../app/api/infraRouteContext.js';
import { createDataAuthorityRouteContext } from '../features/category-authority/api/dataAuthorityRouteContext.js';
import { createSourceStrategyRouteContext } from '../features/indexing/api/sourceStrategyRouteContext.js';
import { createRuntimeOpsRouteContext } from '../features/indexing/api/runtimeOpsRouteContext.js';
import { createQueueBillingLearningRouteContext } from '../features/indexing/api/queueBillingLearningRouteContext.js';
import { createBrandRouteContext } from '../features/catalog/api/brandRouteContext.js';
import { createConfigRouteContext } from '../features/settings/api/configRouteContext.js';
import { createStudioRouteContext } from '../features/studio/api/studioRouteContext.js';
import { createCatalogRouteContext } from '../features/catalog/api/catalogRouteContext.js';
import { createTestModeRouteContext } from '../app/api/routes/testModeRouteContext.js';
import { createIndexlabRouteContext } from '../features/indexing/api/indexlabRouteContext.js';
import { createReviewRouteContext } from '../features/review/api/reviewRouteContext.js';
import { createGuiStaticFileServer } from '../app/api/staticFileServer.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const {
  config, configGate, PORT, HELPER_ROOT, OUTPUT_ROOT, INDEXLAB_ROOT, LAUNCH_CWD,
  storage, runDataStorageState,
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
  buildCatalog, patchCompiledComponentDb,
} = bootstrapServer({ projectRoot: PROJECT_ROOT });

// ── Static assets root ──
const DIST_ROOT = process.env.__GUI_DIST_ROOT
  ? path.resolve(PROJECT_ROOT, process.env.__GUI_DIST_ROOT)
  : path.resolve(PROJECT_ROOT, 'tools', 'gui-react', 'dist');

// ── Route Handler Registration ──
const routeCtx = {
  infraRouteContext: createInfraRouteContext({
    jsonRes, readJsonBody, listDirs, canonicalSlugify, HELPER_ROOT, DIST_ROOT,
    OUTPUT_ROOT, INDEXLAB_ROOT, fs, path, runDataStorageState, getSearxngStatus,
    startSearxngStack, startProcess, stopProcess, processStatus, isProcessRunning,
    waitForProcessExit, broadcastWs,
  }),
  dataAuthorityRouteContext: createDataAuthorityRouteContext({
    jsonRes, config, sessionCache, getSpecDb,
  }),
  sourceStrategyRouteContext: createSourceStrategyRouteContext({
    jsonRes, readJsonBody, config, resolveCategoryAlias, broadcastWs,
  }),
  runtimeOpsRouteContext: createRuntimeOpsRouteContext({
    jsonRes, toInt, INDEXLAB_ROOT, OUTPUT_ROOT, config, storage,
    processStatus, getLastScreencastFrame, safeReadJson, safeJoin, path,
  }),
  queueBillingLearningRouteContext: createQueueBillingLearningRouteContext({
    jsonRes, readJsonBody, toInt, config, storage, OUTPUT_ROOT, path,
    getSpecDb, broadcastWs, safeReadJson, safeStat, listFiles,
    loadProductCatalog,
  }),
  brandRouteContext: createBrandRouteContext({
    jsonRes, readJsonBody, config, storage,
    resolveCategoryAlias, broadcastWs, getSpecDb, loadProductCatalog,
  }),
  configRouteContext: createConfigRouteContext({
    jsonRes, readJsonBody, config, configGate, toInt,
    getSpecDb, storage, OUTPUT_ROOT, broadcastWs, HELPER_ROOT, runDataStorageState,
  }),
  studioRouteContext: createStudioRouteContext({
    jsonRes, readJsonBody, config, HELPER_ROOT, OUTPUT_ROOT, safeReadJson, safeStat,
    listFiles, fs, path, sessionCache, invalidateFieldRulesCache,
    getSpecDbReady, storage, loadCategoryConfig, startProcess, broadcastWs,
    reviewLayoutByCategory, loadProductCatalog,
  }),
  catalogRouteContext: createCatalogRouteContext({
    jsonRes, readJsonBody, toInt, config, storage, buildCatalog,
    loadProductCatalog, readJsonlEvents, fs, path, OUTPUT_ROOT, sessionCache,
    resolveCategoryAlias, listDirs, HELPER_ROOT, broadcastWs, getSpecDb,
  }),
  testModeRouteContext: createTestModeRouteContext({
    jsonRes, readJsonBody, toInt, toUnitRatio, config, storage, HELPER_ROOT,
    OUTPUT_ROOT, getSpecDb, getSpecDbReady, fs, path, safeReadJson, safeStat,
    listFiles, resolveCategoryAlias, broadcastWs,
    purgeTestModeCategoryState, resetTestModeSharedReviewState,
    resetTestModeProductReviewState, invalidateFieldRulesCache, sessionCache,
  }),
  indexlabRouteContext: createIndexlabRouteContext({
    jsonRes, toInt, toFloat, config, safeJoin, safeReadJson, path, INDEXLAB_ROOT,
    processStatus,
  }),
  reviewRouteContext: createReviewRouteContext({
    jsonRes, readJsonBody, toInt, hasKnownValue, config, storage, OUTPUT_ROOT,
    HELPER_ROOT, path, fs, getSpecDb, getSpecDbReady,
    loadCategoryConfig, loadProductCatalog, sessionCache, reviewLayoutByCategory,
    broadcastWs, specDbCache, invalidateFieldRulesCache, safeReadJson, spawn,
    syncPrimaryLaneAcceptFromItemSelection, resolveKeyReviewForLaneMutation,
    getPendingItemPrimaryCandidateIds, markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept, isMeaningfulValue,
    propagateSharedLaneDecision, syncSyntheticCandidatesFromComponentReview,
    candidateLooksReference, normalizeLower,
    remapPendingComponentReviewItemsForNameChange,
    getPendingComponentSharedCandidateIdsAsync, getPendingEnumSharedCandidateIds,
    annotateCandidatePrimaryReviews, ensureGridKeyReviewState,
    markEnumSuggestionStatusBound, patchCompiledComponentDb,
  }),
};

const guiServerHttpAssembly = createGuiServerHttpAssembly({
  routeCtx,
  serveStatic,
  resolveCategoryAlias,
  createGuiApiRouteRegistry,
  registerInfraRoutes,
  registerConfigRoutes,
  registerIndexlabRoutes,
  registerRuntimeOpsRoutes,
  registerCatalogRoutes,
  registerBrandRoutes,
  registerStudioRoutes,
  registerDataAuthorityRoutes,
  registerQueueBillingLearningRoutes,
  registerReviewRoutes,
  registerTestModeRoutes,
  registerSourceStrategyRoutes,
  createRegisteredGuiApiRouteHandlers,
  createGuiApiPipeline,
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
  corsHeaders,
  jsonRes,
});

const {
  registeredApiRouteHandlers,
  handleApi,
  handleHttpRequest,
} = guiServerHttpAssembly;

// ── Static File Serving ──
const serveStaticFile = createGuiStaticFileServer({
  distRoot: DIST_ROOT,
  pathModule: path,
  createReadStream,
});

function serveStatic(req, res) {
  return serveStaticFile(req, res);
}

// ── HTTP Server ──
const server = http.createServer(handleHttpRequest);
attachWebSocketUpgrade(server);

server.listen(PORT, '0.0.0.0', () => {
  const msg = `[gui-server] running on http://localhost:${PORT}`;
  console.log(msg);
  console.log(`[gui-server] API:     http://localhost:${PORT}/api/v1/health`);
  console.log(`[gui-server] WS:      ws://localhost:${PORT}/ws`);
  console.log(`[gui-server] Project: ${PROJECT_ROOT}`);
  console.log(`[gui-server] CWD:     ${LAUNCH_CWD}`);
  console.log(`[gui-server] Helper:  ${HELPER_ROOT}`);
  console.log(`[gui-server] Output:  ${OUTPUT_ROOT}`);
  console.log(`[gui-server] IndexLab:${INDEXLAB_ROOT}`);
  console.log(`[gui-server] Canonical settings writes only: ${config.settingsCanonicalOnlyWrites ? 'ON' : 'OFF'}`);
  console.log(`[gui-server] Static:  ${DIST_ROOT}`);
  try {
    const distFiles = fsSync.readdirSync(path.join(DIST_ROOT, 'assets'));
    console.log(`[gui-server] Assets:  ${distFiles.join(', ')}`);
  } catch { console.log('[gui-server] Assets:  (could not list)'); }
  setupWatchers();

  // Auto-open browser when --open flag is passed (used by SpecFactory.exe launcher)
  if (process.argv.includes('--open')) {
    const url = `http://localhost:${PORT}?_=${Date.now()}`;
    console.log(`[gui-server] Opening browser -> ${url}`);
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
    execCb(cmd);
  }
});
