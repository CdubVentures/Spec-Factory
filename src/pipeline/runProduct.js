import path from 'node:path';
import fs from 'node:fs';
import { buildRunId } from '../utils/common.js';
import { EventLogger } from '../logger.js';
import { recordQueryResult, recordUrlVisit } from '../features/indexing/pipeline/shared/index.js';
import { captureKnobSnapshot, recordKnobSnapshot } from '../features/indexing/telemetry/index.js';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { CONFIG_MANIFEST_DEFAULTS } from '../core/config/manifest.js';
import {
  toBool,
  resolveIdentityAmbiguitySnapshot, buildRunIdentityFingerprint,
  resolveRuntimeControlKey, defaultRuntimeOverrides, normalizeRuntimeOverrides,
} from '../features/indexing/orchestration/shared/index.js';
import {
  createRunRuntime,
  buildRunRuntimePhaseCallsiteContext,
  buildRunRuntimeContext,
  createRuntimeOverridesLoader,
  buildRuntimeOverridesLoaderPhaseCallsiteContext,
  buildRuntimeOverridesLoaderContext,
  buildIdentityBootstrapPhaseCallsiteContext,
  createIdentityBootstrapContext,
  buildIdentityBootstrapContext,
  createRunLoggerBootstrap,
  buildRunLoggerBootstrapPhaseCallsiteContext,
  buildRunLoggerBootstrapContext,
  buildRunBootstrapLogPayload,
  buildRunBootstrapLogPayloadPhaseCallsiteContext,
  buildRunBootstrapLogPayloadContext,
  createRunTraceWriter,
  buildRunTraceWriterPhaseCallsiteContext,
  buildRunTraceWriterContext,
  createResearchBootstrap,
  buildResearchBootstrapPhaseCallsiteContext,
  buildResearchBootstrapContext,
  bootstrapRunEventIndexing,
} from '../features/indexing/orchestration/bootstrap/index.js';
import { createFrontier } from '../research/frontierDb.js';
import { RuntimeTraceWriter } from '../runtime/runtimeTraceWriter.js';
import {
  normalizeAmbiguityLevel,
  resolveIdentityLockStatus
} from '../utils/identityNormalize.js';
import { UberAggressiveOrchestrator } from '../research/uberAggressiveOrchestrator.js';
import { bootstrapRunProductExecutionState } from './seams/bootstrapRunProductExecutionState.js';
// --- new crawl pipeline ---
import { resolveAdapter } from '../features/crawl/adapters/adapterRegistry.js';
import { resolvePlugins } from '../features/crawl/plugins/pluginRegistry.js';
import { runCrawlProcessingLifecycle } from './runCrawlProcessingLifecycle.js';

const RUN_DEDUPE_MODE = 'serp_url+content_hash';

export async function runProduct({
  storage,
  config,
  s3Key,
  jobOverride = null,
  roundContext = null,
  runIdOverride = '',
}) {
  const { runId, runtimeMode } = createRunRuntime({
    ...buildRunRuntimeContext({
      ...buildRunRuntimePhaseCallsiteContext({
        runIdOverride,
        roundContext,
        config,
        buildRunId,
      }),
    }),
  });
  const { logger, startMs } = createRunLoggerBootstrap({
    ...buildRunLoggerBootstrapContext({
      ...buildRunLoggerBootstrapPhaseCallsiteContext({
        storage,
        config,
        runId,
        createEventLogger: (options) => new EventLogger(options),
      }),
    }),
  });

  const job = jobOverride || (await storage.readJson(s3Key));
  const productId = job.productId;
  const category = job.category || 'mouse';
  const runArtifactsBase = storage.resolveOutputKey(category, productId, 'runs', runId);
  const { identityLock, identityFingerprint, identityLockStatus } = await createIdentityBootstrapContext({
    ...buildIdentityBootstrapContext({
      ...buildIdentityBootstrapPhaseCallsiteContext({
        job,
        config,
        category,
        productId,
        resolveIdentityAmbiguitySnapshot: resolveIdentityAmbiguitySnapshot,
        normalizeAmbiguityLevel,
        buildRunIdentityFingerprint,
        resolveIdentityLockStatus,
      }),
    }),
  });
  const {
    runStartedPayload,
    loggerContext,
    runContextPayload,
  } = buildRunBootstrapLogPayload({
    ...buildRunBootstrapLogPayloadContext({
      ...buildRunBootstrapLogPayloadPhaseCallsiteContext({
        s3Key,
        runId,
        roundContext,
        category,
        productId,
        config,
        runtimeMode,
        identityFingerprint,
        identityLockStatus,
        identityLock,
        dedupeMode: RUN_DEDUPE_MODE,
      }),
    }),
  });
  logger.info('run_started', runStartedPayload);
  logger.setContext(loggerContext);
  logger.info('run_context', runContextPayload);

  bootstrapRunEventIndexing({
    logger,
    category,
    productId,
    runId,
    env: process.env,
    manifestDefaults: CONFIG_MANIFEST_DEFAULTS,
    defaultIndexLabRootFn: defaultIndexLabRoot,
    joinPathFn: path.join,
    mkdirSyncFn: fs.mkdirSync,
    captureKnobSnapshotFn: captureKnobSnapshot,
    recordKnobSnapshotFn: recordKnobSnapshot,
    recordUrlVisitFn: recordUrlVisit,
    recordQueryResultFn: recordQueryResult,
  });

  const traceWriter = createRunTraceWriter({
    ...buildRunTraceWriterContext({
      ...buildRunTraceWriterPhaseCallsiteContext({
        storage,
        config,
        runId,
        productId,
        toBool,
        createRuntimeTraceWriter: (options) => new RuntimeTraceWriter(options),
      }),
    }),
  });
  const runtimeOverridesLoader = createRuntimeOverridesLoader({
    ...buildRuntimeOverridesLoaderContext({
      ...buildRuntimeOverridesLoaderPhaseCallsiteContext({
        storage,
        config,
        resolveRuntimeControlKey,
        defaultRuntimeOverrides,
        normalizeRuntimeOverrides,
      }),
    }),
  });
  let runtimeOverrides = runtimeOverridesLoader.getRuntimeOverrides();

  const { frontierDb } = await createResearchBootstrap({
    ...buildResearchBootstrapContext({
      ...buildResearchBootstrapPhaseCallsiteContext({
        storage,
        config,
        logger,
        createFrontier,
        createUberAggressiveOrchestrator: (options) => new UberAggressiveOrchestrator(options),
      }),
    }),
  });

  const executionBootstrapState = await bootstrapRunProductExecutionState({
    storage,
    config,
    logger,
    category,
    productId,
    runId,
    roundContext,
    runtimeMode,
    job,
    identityLock,
    identityLockStatus,
    runArtifactsBase,
    traceWriter,
    syncRuntimeOverrides: async ({ force = false } = {}) => {
      runtimeOverrides = await runtimeOverridesLoader.loadRuntimeOverrides({ force });
      return runtimeOverrides;
    },
    frontierDb,
  });
  runtimeOverrides = executionBootstrapState.runtimeOverrides;

  const { planner, discoveryResult } = executionBootstrapState;

  // Diagnostic: log planner state after bootstrap to verify discovery seeded URLs
  const plannerHasUrls = planner?.hasNext?.() ?? false;
  logger.info('crawl_planner_state', {
    has_urls: plannerHasUrls,
    priority_queue_length: planner?.priorityQueue?.length ?? 0,
    manufacturer_queue_length: planner?.manufacturerQueue?.length ?? 0,
    queue_length: planner?.queue?.length ?? 0,
    candidate_queue_length: planner?.candidateQueue?.length ?? 0,
    discovery_selected_count: discoveryResult?.enqueue_summary?.approved_count ?? 0,
  });

  // --- New crawl pipeline: open pages, screenshot, record to frontier ---
  const adapterName = String(config.fetcherAdapter || 'crawlee');
  const pluginNames = String(config.fetcherPlugins || 'stealth,autoScroll,screenshot')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const plugins = resolvePlugins(pluginNames, { logger });
  const adapter = resolveAdapter(adapterName);
  const session = adapter.create({ settings: config, plugins, logger });
  await session.start();

  try {
    const maxRunMs = (Number(config.maxRunSeconds) || 0) * 1000;
    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner,
      session,
      frontierDb,
      settings: config,
      logger,
      startMs,
      maxRunMs,
    });

    logger.info('run_completed', {
      runId,
      category,
      productId,
      urls_crawled: crawlResults.length,
      urls_successful: crawlResults.filter((r) => r.success).length,
      urls_blocked: crawlResults.filter((r) => r.blocked).length,
      duration_ms: Date.now() - startMs,
    });

    return { crawlResults, runId, category, productId };
  } finally {
    await session.shutdown();
  }
}
