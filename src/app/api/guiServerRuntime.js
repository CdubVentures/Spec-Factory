import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { bootstrapServer } from './serverBootstrap.js';
import { createGuiServerHttpAssembly } from './guiServerHttpAssembly.js';
import { registerInfraRoutes } from './routes/infraRoutes.js';
import { initOperationsRegistry } from '../../core/operations/index.js';
import { registerConfigRoutes } from '../../features/settings/api/configRoutes.js';
import { registerIndexlabRoutes } from '../../features/indexing/api/indexlabRoutes.js';
import { registerCatalogRoutes } from '../../features/catalog/api/catalogRoutes.js';
import { registerBrandRoutes } from '../../features/catalog/api/brandRoutes.js';
import { registerStudioRoutes } from '../../features/studio/api/studioRoutes.js';
import { registerDataAuthorityRoutes } from '../../features/category-authority/api/dataAuthorityRoutes.js';
import { registerReviewRoutes } from '../../features/review/api/reviewRoutes.js';
import { registerTestModeRoutes } from './routes/testModeRoutes.js';
import { createTestModeRouteContext } from './routes/testModeRouteContext.js';

import { registerQueueBillingLearningRoutes } from '../../features/indexing/api/queueBillingLearningRoutes.js';
import { registerSourceStrategyRoutes } from '../../features/indexing/api/sourceStrategyRoutes.js';
import { registerSpecSeedsRoutes } from '../../features/indexing/api/specSeedsRoutes.js';
import { registerColorRoutes } from '../../features/color-registry/api/colorRoutes.js';
import { createColorRouteContext } from '../../features/color-registry/api/colorRouteContext.js';
import { registerColorEditionFinderRoutes } from '../../features/color-edition/api/colorEditionFinderRoutes.js';
import { registerProductImageFinderRoutes } from '../../features/product-image/api/productImageFinderRoutes.js';
import { registerUnitRegistryRoutes } from '../../features/unit-registry/api/unitRegistryRoutes.js';
import { createColorEditionFinderRouteContext } from '../../features/color-edition/api/colorEditionFinderRouteContext.js';
import { createProductImageFinderRouteContext } from '../../features/product-image/api/productImageFinderRouteContext.js';
import { registerModuleSettingsRoutes } from '../../features/module-settings/api/moduleSettingsRoutes.js';
import { createModuleSettingsRouteContext } from '../../features/module-settings/api/moduleSettingsRouteContext.js';
import { registerPublisherRoutes } from '../../features/publisher/api/publisherRoutes.js';
import { createPublisherRouteContext } from '../../features/publisher/api/publisherRouteContext.js';
import { createRouteLlmLogger } from '../../core/llm/createRouteLlmLogger.js';
import { registerRuntimeOpsRoutes } from '../../features/indexing/api/runtimeOpsRoutes.js';
import {
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
} from './requestDispatch.js';
import { createGuiApiRouteRegistry } from './routeRegistry.js';
import { createRegisteredGuiApiRouteHandlers } from './guiRouteRegistration.js';
import { createGuiApiPipeline } from './guiApiPipeline.js';
import { createInfraRouteContext } from './infraRouteContext.js';
import { createDataAuthorityRouteContext } from '../../features/category-authority/api/dataAuthorityRouteContext.js';
import { createSourceStrategyRouteContext } from '../../features/indexing/api/sourceStrategyRouteContext.js';
import { createRuntimeOpsRouteContext } from '../../features/indexing/api/runtimeOpsRouteContext.js';
import { createQueueBillingLearningRouteContext } from '../../features/indexing/api/queueBillingLearningRouteContext.js';
import { createBrandRouteContext } from '../../features/catalog/api/brandRouteContext.js';
import { createConfigRouteContext } from '../../features/settings/api/configRouteContext.js';
import { createStudioRouteContext } from '../../features/studio/api/studioRouteContext.js';
import { createCatalogRouteContext } from '../../features/catalog/api/catalogRouteContext.js';

import { createIndexlabRouteContext } from '../../features/indexing/api/indexlabRouteContext.js';
import { createReviewRouteContext } from '../../features/review/api/reviewRouteContext.js';
import { createGuiStaticFileServer } from './staticFileServer.js';
import { fileURLToPath } from 'node:url';

const MODULE_FILENAME = typeof __filename === 'string'
  ? __filename
  : fileURLToPath(import.meta.url);
const MODULE_DIRNAME = path.dirname(MODULE_FILENAME);

export const PROJECT_ROOT = path.resolve(MODULE_DIRNAME, '..', '..', '..');

function withProcessBootstrapOverrides({ env = null, argv = null, cwd = null }, factory) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const envKeys = env ? Object.keys(env) : [];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  if (cwd) {
    process.chdir(cwd);
  }
  if (argv) {
    process.argv = [previousArgv[0], previousArgv[1], ...argv];
  }
  for (const key of envKeys) {
    const value = env[key];
    if (value == null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = String(value);
  }

  try {
    return factory();
  } finally {
    if (cwd) {
      process.chdir(previousCwd);
    }
    process.argv = previousArgv;
    for (const key of envKeys) {
      const previousValue = previousEnv.get(key);
      if (previousValue == null) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

export function createGuiServerRuntime({
  projectRoot = PROJECT_ROOT,
  env = null,
  argv = null,
  distRoot = null,
  cwd = null,
} = {}) {
  return withProcessBootstrapOverrides({ env, argv, cwd }, () => {
    const {
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
      domain: {
        ensureGridKeyReviewState, resolveKeyReviewForLaneMutation,
        markPrimaryLaneReviewedInItemState, syncItemFieldStateFromPrimaryLaneAccept,
        syncPrimaryLaneAcceptFromItemSelection,
        normalizeLower, isMeaningfulValue, candidateLooksReference,
        annotateCandidatePrimaryReviews, getPendingItemPrimaryCandidateIds,
        getPendingComponentSharedCandidateIdsAsync, getPendingEnumSharedCandidateIds,
        syncSyntheticCandidatesFromComponentReview,
        remapPendingComponentReviewItemsForNameChange, propagateSharedLaneDecision,
        buildCatalog, patchCompiledComponentDb,
      },
    } = bootstrapServer({ projectRoot });

    initOperationsRegistry({ broadcastWs });

    const resolvedDistRoot = distRoot
      ? path.resolve(projectRoot, distRoot)
      : process.env.__GUI_DIST_ROOT
        ? path.resolve(projectRoot, process.env.__GUI_DIST_ROOT)
        : path.resolve(projectRoot, 'tools', 'gui-react', 'dist');

    const routeCtx = {
      infraRouteContext: createInfraRouteContext({
        jsonRes, readJsonBody, listDirs, canonicalSlugify, HELPER_ROOT, DIST_ROOT: resolvedDistRoot,
        OUTPUT_ROOT, INDEXLAB_ROOT, fs, path,
        getSerperApiKey: () => config.serperApiKey,
        getSerperEnabled: () => config.serperEnabled,
        getSearxngStatus, startSearxngStack, startProcess, stopProcess, processStatus,
        isProcessRunning, waitForProcessExit, broadcastWs,
      }),
      dataAuthorityRouteContext: createDataAuthorityRouteContext({
        jsonRes, config, sessionCache, getSpecDb,
      }),
      sourceStrategyRouteContext: createSourceStrategyRouteContext({
        jsonRes, readJsonBody, config, resolveCategoryAlias, broadcastWs,
      }),
      specSeedsRouteContext: {
        jsonRes,
        readJsonBody,
        config,
        resolveCategoryAlias,
        broadcastWs,
      },
      runtimeOpsRouteContext: createRuntimeOpsRouteContext({
        jsonRes, toInt, INDEXLAB_ROOT, OUTPUT_ROOT, config, storage,
        processStatus, getLastScreencastFrame, safeReadJson, safeJoin, path,
        getIndexLabRoot, getSpecDbReady,
      }),
      queueBillingLearningRouteContext: createQueueBillingLearningRouteContext({
        jsonRes, readJsonBody, toInt, config, storage, OUTPUT_ROOT, path,
        getSpecDb, broadcastWs, safeReadJson, safeStat, listFiles,
      }),
      brandRouteContext: createBrandRouteContext({
        jsonRes, readJsonBody, config, storage,
        resolveCategoryAlias, broadcastWs, getSpecDb, appDb,
        brandRegistryPath: path.resolve(HELPER_ROOT, '_global', 'brand_registry.json'),
      }),
      colorRouteContext: createColorRouteContext({
        jsonRes, readJsonBody, appDb, broadcastWs, specDbCache,
        colorRegistryPath: path.resolve(HELPER_ROOT, '_global', 'color_registry.json'),
      }),
      unitRegistryRouteContext: {
        jsonRes, readJsonBody, appDb,
        unitRegistryPath: path.resolve(HELPER_ROOT, '_global', 'unit_registry.json'),
      },
      colorEditionFinderRouteContext: createColorEditionFinderRouteContext({
        jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
        logger: createRouteLlmLogger('color-edition-finder'),
      }),
      productImageFinderRouteContext: createProductImageFinderRouteContext({
        jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
        logger: createRouteLlmLogger('product-image-finder'),
      }),
      moduleSettingsRouteContext: createModuleSettingsRouteContext({
        jsonRes, readJsonBody, getSpecDb, broadcastWs, helperRoot: HELPER_ROOT,
      }),
      publisherRouteContext: createPublisherRouteContext({
        jsonRes, readJsonBody, getSpecDb, broadcastWs, config,
        productRoot: OUTPUT_ROOT,
      }),
      configRouteContext: createConfigRouteContext({
        jsonRes, readJsonBody, config, configGate, toInt,
        getSpecDb, storage, OUTPUT_ROOT, broadcastWs, HELPER_ROOT, appDb,
      }),
      studioRouteContext: createStudioRouteContext({
        jsonRes, readJsonBody, config, HELPER_ROOT, OUTPUT_ROOT, safeReadJson, safeStat,
        listFiles, fs, path, sessionCache, invalidateFieldRulesCache,
        getSpecDb, getSpecDbReady, storage, startProcess, broadcastWs,
        reviewLayoutByCategory, appDb,
      }),
      testModeRouteContext: createTestModeRouteContext({
        jsonRes, readJsonBody, HELPER_ROOT,
        getSpecDbReady, path, safeReadJson,
        listFiles, resolveCategoryAlias, appDb,
      }),
      catalogRouteContext: createCatalogRouteContext({
        jsonRes, readJsonBody, toInt, config, storage, buildCatalog,
        readJsonlEvents, fs, path, OUTPUT_ROOT, sessionCache,
        resolveCategoryAlias, listDirs, HELPER_ROOT, broadcastWs, getSpecDb, appDb,
      }),
      indexlabRouteContext: createIndexlabRouteContext({
        jsonRes, toInt, toFloat, config, safeJoin, safeReadJson, path, INDEXLAB_ROOT,
        processStatus, readJsonBody, broadcastWs, storage, OUTPUT_ROOT,
        getIndexLabRoot, getSpecDb,
      }),
      reviewRouteContext: createReviewRouteContext({
        jsonRes, readJsonBody, toInt, hasKnownValue, config, storage, OUTPUT_ROOT,
        HELPER_ROOT, path, fs, getSpecDb, getSpecDbReady,
        sessionCache, reviewLayoutByCategory,
        broadcastWs, specDbCache, invalidateFieldRulesCache, safeReadJson,
        syncPrimaryLaneAcceptFromItemSelection, resolveKeyReviewForLaneMutation,
        getPendingItemPrimaryCandidateIds, markPrimaryLaneReviewedInItemState,
        syncItemFieldStateFromPrimaryLaneAccept, isMeaningfulValue,
        propagateSharedLaneDecision, syncSyntheticCandidatesFromComponentReview,
        candidateLooksReference, normalizeLower,
        remapPendingComponentReviewItemsForNameChange,
        getPendingComponentSharedCandidateIdsAsync, getPendingEnumSharedCandidateIds,
        annotateCandidatePrimaryReviews, ensureGridKeyReviewState,
        patchCompiledComponentDb,
      }),
    };

    const routeDefinitions = [
      { key: 'infra', registrar: registerInfraRoutes },
      { key: 'config', registrar: registerConfigRoutes },
      { key: 'indexlab', registrar: registerIndexlabRoutes },
      { key: 'runtimeOps', registrar: registerRuntimeOpsRoutes },
      { key: 'catalog', registrar: registerCatalogRoutes },
      { key: 'brand', registrar: registerBrandRoutes },
      { key: 'color', registrar: registerColorRoutes },
      { key: 'unitRegistry', registrar: registerUnitRegistryRoutes },
      { key: 'colorEditionFinder', registrar: registerColorEditionFinderRoutes },
      { key: 'productImageFinder', registrar: registerProductImageFinderRoutes },
      { key: 'moduleSettings', registrar: registerModuleSettingsRoutes },
      { key: 'studio', registrar: registerStudioRoutes },
      { key: 'dataAuthority', registrar: registerDataAuthorityRoutes },
      { key: 'queueBillingLearning', registrar: registerQueueBillingLearningRoutes },
      { key: 'review', registrar: registerReviewRoutes },

      { key: 'publisher', registrar: registerPublisherRoutes },
      { key: 'sourceStrategy', registrar: registerSourceStrategyRoutes },
      { key: 'specSeeds', registrar: registerSpecSeedsRoutes },
      { key: 'testMode', registrar: registerTestModeRoutes },
    ];

    const serveStaticFile = createGuiStaticFileServer({
      distRoot: resolvedDistRoot,
      pathModule: path,
      createReadStream,
    });
    function serveStatic(req, res) {
      return serveStaticFile(req, res);
    }

    const {
      registeredApiRouteHandlers,
      handleApi,
      handleHttpRequest,
    } = createGuiServerHttpAssembly({
      routeCtx,
      routeDefinitions,
      serveStatic,
      resolveCategoryAlias,
      createGuiApiRouteRegistry,
      createRegisteredGuiApiRouteHandlers,
      createGuiApiPipeline,
      createApiPathParser,
      createApiRouteDispatcher,
      createApiHttpRequestHandler,
      corsHeaders,
      jsonRes,
    });

    const server = http.createServer(handleHttpRequest);
    attachWebSocketUpgrade(server);

    return {
      server,
      setupWatchers,
      registeredApiRouteHandlers,
      handleApi,
      handleHttpRequest,
      metadata: {
        projectRoot,
        PORT,
        HELPER_ROOT,
        OUTPUT_ROOT,
        INDEXLAB_ROOT,
        LAUNCH_CWD,
        DIST_ROOT: resolvedDistRoot,
      },
    };
  });
}
