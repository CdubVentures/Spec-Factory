import path from 'node:path';
import fs from 'node:fs';
import { buildRunId } from '../shared/primitives.js';
import { EventLogger } from '../logger.js';
import { captureKnobSnapshot } from '../features/indexing/telemetry/index.js';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { CONFIG_MANIFEST_DEFAULTS } from '../core/config/manifest.js';
import {
  resolveIdentityAmbiguitySnapshot, buildRunIdentityFingerprint,
  resolveRuntimeControlKey, defaultRuntimeOverrides, normalizeRuntimeOverrides,
  resolveScreencastCallback,
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

  bootstrapRunEventIndexing,
} from '../features/indexing/orchestration/bootstrap/index.js';
import { createCrawlLedgerAdapter } from '../features/indexing/orchestration/shared/crawlLedgerAdapter.js';
import { configInt } from '../shared/settingsAccessor.js';

import {
  normalizeAmbiguityLevel,
  resolveIdentityLockStatus
} from '../utils/identityNormalize.js';
import { bootstrapRunConfig } from './seams/bootstrapRunProductExecutionState.js';
import { buildDiscoverySeedPlanContext, runDiscoverySeedPlan } from '../features/indexing/pipeline/orchestration/index.js';
import { buildOrderedFetchPlan } from '../features/indexing/pipeline/domainClassifier/runDomainClassifier.js';
import { normalizeFieldList } from '../utils/fieldKeys.js';
// --- new crawl pipeline ---
import { resolveAdapter } from '../features/crawl/adapters/adapterRegistry.js';
import { resolveAllPlugins } from '../features/crawl/plugins/pluginRegistry.js';
import { resolveAllExtractionPlugins, createExtractionRunner, persistScreenshotArtifacts, persistVideoArtifact, persistHtmlArtifact } from '../features/extraction/index.js';

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
        createEventLogger: (options) => new EventLogger({ ...options, specDb: config.specDb || null }),
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

  const _telemetrySpecDb = config.specDb || null;
  const effectiveIndexLabRoot = config.indexLabRoot || defaultIndexLabRoot();
  const runDir = path.join(effectiveIndexLabRoot, runId);

  bootstrapRunEventIndexing({
    logger,
    category,
    productId,
    runId,
    env: process.env,
    manifestDefaults: CONFIG_MANIFEST_DEFAULTS,
    defaultIndexLabRootFn: () => config.indexLabRoot || defaultIndexLabRoot(),
    joinPathFn: path.join,
    mkdirSyncFn: fs.mkdirSync,
    captureKnobSnapshotFn: captureKnobSnapshot,
    recordKnobSnapshotFn: (snapshot) => {
      if (_telemetrySpecDb) try { _telemetrySpecDb.insertKnobSnapshot({ ...snapshot, category, run_id: runId }); } catch { /* best-effort */ }
    },
    recordUrlVisitFn: (record) => {
      if (_telemetrySpecDb) try { _telemetrySpecDb.insertUrlIndexEntry({ ...record, category, ts: new Date().toISOString() }); } catch { /* best-effort */ }
    },
    recordQueryResultFn: (record) => {
      if (_telemetrySpecDb) try { _telemetrySpecDb.insertQueryIndexEntry({ ...record, ts: new Date().toISOString() }); } catch { /* best-effort */ }
    },
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

  const frontierDb = createCrawlLedgerAdapter({
    specDb: config.specDb || null,
    productId,
    category,
    runId,
    queryCooldownDays: configInt(config, 'queryCooldownDays') ?? 30,
  });

  // --- Session + browser pool warm-up (runs in parallel with discovery) ---
  // WHY: Browser launches take ~3s. Starting them now means they're warm by
  // the time the crawl phase begins. Discovery/search takes 10-30s so
  // the warm-up is completely free (overlapped).
  const plugins = resolveAllPlugins();
  const extractionRunner = createExtractionRunner({
    plugins: resolveAllExtractionPlugins(),
    logger,
  });
  const adapter = resolveAdapter('crawlee');
  const screenshotDir = path.join(runDir, 'screenshots');
  const videoDir = path.join(runDir, 'video');
  const htmlDir = path.join(runDir, 'html');
  const session = adapter.create({
    settings: { ...config, runId },
    plugins,
    extractionRunner,
    logger,
    onScreencastFrame: resolveScreencastCallback(config),
    onScreenshotsPersist: ({ screenshots, workerId, url }) => {
      const specDb = config.specDb || null;
      let host = '';
      try { host = new URL(url).hostname; } catch { /* invalid URL */ }
      return persistScreenshotArtifacts({
        screenshots, screenshotDir, workerId, url,
        insertScreenshot: specDb ? (row) => specDb.insertScreenshot(row) : undefined,
        runContext: { category, productId, runId, host },
      });
    },
    onVideoPersist: ({ videoPath, workerId, url }) => {
      const specDb = config.specDb || null;
      let host = '';
      try { host = new URL(url).hostname; } catch { /* invalid URL */ }
      return persistVideoArtifact({
        videoPath, videoDir, workerId, url,
        insertVideo: specDb ? (row) => specDb.insertVideo(row) : undefined,
        runContext: { category, productId, runId, host },
      });
    },
    onHtmlPersist: ({ html, workerId, url, finalUrl, status, title }) => {
      const specDb = config.specDb || null;
      let host = '';
      try { host = new URL(url).hostname; } catch { /* invalid URL */ }
      return persistHtmlArtifact({
        html, htmlDir, workerId, url, finalUrl, status, title,
        insertCrawlSource: specDb ? (row) => specDb.insertCrawlSource(row) : undefined,
        runContext: { category, productId, runId, host },
      });
    },
  });
  const _t0 = Date.now();
  await session.start();
  const warmUpPromise = session.warmUp?.() ?? Promise.resolve();
  console.error(`[TIMING] session.start: ${Date.now() - _t0}ms`);

  // ── Phase 1: Config bootstrap (< 1s) ──────────────────────────────────────
  const _t1 = Date.now();
  const bootstrapConfig = await bootstrapRunConfig({
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
    syncRuntimeOverrides: async ({ force = false } = {}) => {
      runtimeOverrides = await runtimeOverridesLoader.loadRuntimeOverrides({ force });
      return runtimeOverrides;
    },
    frontierDb,
    specDb: config.specDb || null,
  });
  runtimeOverrides = bootstrapConfig.runtimeOverrides;
  console.error(`[TIMING] bootstrapRunConfig: ${Date.now() - _t1}ms`);

  // ── Phase 2: Discovery pipeline + browser warm-up (parallel) ─────────────
  const _t2 = Date.now();
  const discoveryContext = buildDiscoverySeedPlanContext({
    config,
    storage,
    category,
    categoryConfig: bootstrapConfig.categoryConfig,
    job,
    runId,
    logger,
    roundContext,
    requiredFields: bootstrapConfig.requiredFields,
    llmContext: bootstrapConfig.llmContext,
    frontierDb,
    planner: null,
    normalizeFieldList,
  });

  const [discoveryResult] = await Promise.all([
    runDiscoverySeedPlan(discoveryContext),
    warmUpPromise,
  ]);

  console.error(`[TIMING] discovery+warmup: ${Date.now() - _t2}ms`);

  // ── Phase 3: Build fetch plan ────────────────────────────────────────────
  const { orderedSources: orderedFetchPlan, workerIdMap, stats: fetchPlanStats } =
    buildOrderedFetchPlan({
      discoveryResult,
      blockedHosts: bootstrapConfig.blockedHosts,
      config,
      logger,
    });

  logger.info('crawl_fetch_plan_state', {
    has_urls: orderedFetchPlan?.length > 0,
    total_queued: fetchPlanStats?.total_queued ?? 0,
    seed_count: fetchPlanStats?.seed_count ?? 0,
    approved_count: fetchPlanStats?.approved_count ?? 0,
    blocked_count: fetchPlanStats?.blocked_count ?? 0,
  });

  try {
    const maxRunMs = (Number(config.maxRunSeconds) || 0) * 1000;
    const { crawlResults } = await session.runFetchPlan({
      orderedSources: orderedFetchPlan,
      workerIdMap,
      frontierDb,
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

    return { crawlResults, runId, category, productId, fetchPlanStats, startMs, job };
  } finally {
    await session.shutdown();
  }
}
