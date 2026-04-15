import { parseCsvList, looksHttpUrl } from '../cliHelpers.js';
import pathNode from 'node:path';
import { configInt } from '../../../shared/settingsAccessor.js';
import { buildProductId } from '../../../shared/primitives.js';
import { buildCrawlCheckpoint } from '../../../pipeline/checkpoint/buildCrawlCheckpoint.js';
import { writeCrawlCheckpoint } from '../../../pipeline/checkpoint/writeCrawlCheckpoint.js';
import { buildProductCheckpoint } from '../../../pipeline/checkpoint/buildProductCheckpoint.js';
import { writeProductCheckpoint } from '../../../pipeline/checkpoint/writeProductCheckpoint.js';
import { buildJobFromDb } from '../../../features/indexing/orchestration/index.js';
import { serializeRunSummary } from '../../../indexlab/runSummarySerializer.js';
import { buildRuntimeOpsPanels } from '../../../features/indexing/api/index.js';
import { setStageCursor } from '../../../indexlab/runtimeBridgeStageLifecycle.js';
import { writeRunMeta } from '../../../indexlab/runtimeBridgeArtifacts.js';
import { deriveFullModel } from '../../../features/catalog/index.js';

export function createPipelineCommands({
  asBool,
  toPosixKey,
  runProduct,
  IndexLabRuntimeBridge,
  defaultIndexLabRoot,
  openSpecDbForCategory,
  withSpecDb,
}) {
  async function commandIndexLab(config, storage, args) {
    const category = String(args.category || 'mouse').trim();
    const seed = String(args.seed || '').trim();
    const outRoot = String(args.out || defaultIndexLabRoot()).trim();
    const requestedRunIdRaw = String(args['run-id'] || '').trim();
    const requestedRunId = /^[A-Za-z0-9._-]{8,96}$/.test(requestedRunIdRaw)
      ? requestedRunIdRaw
      : '';
    const productIdArg = String(args['product-id'] || '').trim();
    const fields = parseCsvList(args.fields);
    const providerTokens = parseCsvList(args.providers).map((entry) => entry.toLowerCase());

    const buildInputKey = (pid) => {
      const normalized = String(pid || '').trim().replace(/\.json$/i, '');
      if (!normalized) return '';
      return toPosixKey('specs/inputs', category, 'products', `${normalized}.json`);
    };

    let s3Key = String(args.s3key || '').trim();
    if (!s3Key && productIdArg) {
      const candidateKey = buildInputKey(productIdArg);
      // WHY: After the id-format migration (hash-based product IDs), the input
      // JSON files may still use the old brand-model slug names. Verify the file
      // actually exists before committing to this key; if it doesn't, fall
      // through to the creation path which builds a fresh input JSON from the
      // CLI identity args (brand, base_model via --model, variant, etc.).
      let candidateExists = false;
      try {
        await storage.readJson(candidateKey);
        candidateExists = true;
      } catch { /* file missing — expected after id-format migration */ }
      if (candidateExists) {
        s3Key = candidateKey;
      }
    }

    if (!s3Key && seed) {
      if (seed.endsWith('.json') || seed.includes('/')) {
        s3Key = seed;
      } else if (!seed.includes(' ') && !looksHttpUrl(seed)) {
        s3Key = buildInputKey(seed);
      }
    }

    if (!s3Key) {
      const seedIsUrl = looksHttpUrl(seed);
      // WHY: When only --seed is given (e.g. "Razer Viper V3 Pro"), parse
      // the first token as brand and the rest as model so query templates
      // don't produce "unknown unknown-model" garbage queries.
      const seedTokens = (!seedIsUrl && seed) ? seed.split(/\s+/).filter(Boolean) : [];
      const brand = String(args.brand || seedTokens[0] || 'unknown').trim() || 'unknown';
      const model = String(args.model || args.sku || (seedTokens.length > 1 ? seedTokens.slice(1).join(' ') : '')).trim() || 'unknown-model';
      const variant = String(args.variant || '').trim();
      const sku = String(args.sku || '').trim();
      const title = String(args.title || (!seedIsUrl ? seed : '')).trim();
      // WHY: Reuse existing product_id when brand+model match — prevents duplicate
      // random hex IDs for the same product across runs.
      // WHY: Reuse existing product_id from SQL when brand+model match.
      let generatedProductId = productIdArg;
      if (!generatedProductId) {
        try {
          generatedProductId = await withSpecDb(config, category, (lookupDb) => {
            const allRows = lookupDb?.getAllProducts?.() || [];
            const match = allRows.find((r) =>
              String(r.brand || '').trim().toLowerCase() === brand.toLowerCase() &&
              String(r.base_model || '').trim().toLowerCase() === model.toLowerCase() &&
              String(r.variant || '').trim().toLowerCase() === variant.toLowerCase()
            );
            return match?.product_id || buildProductId(category);
          });
        } catch { generatedProductId = buildProductId(category); }
      }
      const derivedModel = deriveFullModel(model, variant);
      const job = {
        productId: generatedProductId,
        category,
        identityLock: {
          brand,
          base_model: model,
          model: derivedModel,
          variant,
          brand_identifier: '',
          sku,
          title
        },
      };
      if (fields.length > 0) {
        job.requirements = {
          requiredFields: fields
        };
      }
      s3Key = buildInputKey(generatedProductId);
      await storage.writeObject(
        s3Key,
        Buffer.from(JSON.stringify(job, null, 2), 'utf8'),
        { contentType: 'application/json' }
      );
    }

    // Open per-category SpecDb for event logging (WAL-safe, best-effort)
    let specDb = null;
    try {
      specDb = await openSpecDbForCategory(config, category);
    } catch { /* best-effort: pipeline still works without SQL event logging */ }

    // WHY: Pipeline subprocess needs AppDb for billing entries to reach SQLite.
    // Without this, pipeline billing goes to JSONL only and never shows in the GUI.
    let appDb = null;
    try {
      const { AppDb } = await import('../../../db/appDb.js');
      const appDbDir = pathNode.resolve(config.specDbDir || '.workspace/db');
      appDb = new AppDb({ dbPath: pathNode.join(appDbDir, 'app.sqlite') });
    } catch { /* best-effort: pipeline still works without billing SQL */ }

    try {
    // WHY: DB-first job resolution. The products table in spec.sqlite is the SSOT
    // for product identity. This eliminates the "unknown unknown-model" problem
    // when fixture files don't exist or were created without identity args.
    // Precedence: 1) CLI args  2) DB lookup  3) fixture file (legacy fallback)
    let jobOverride = null;
    const cliBrand = String(args.brand || '').trim();
    const cliModel = String(args.model || '').trim();
    const resolvedProductId = productIdArg || s3Key.replace(/.*\//, '').replace(/\.json$/i, '');
    if (cliBrand && cliModel) {
      const cliVariant = String(args.variant || '').trim();
      jobOverride = {
        productId: resolvedProductId,
        category,
        identityLock: {
          brand: cliBrand,
          base_model: cliModel,
          model: deriveFullModel(cliModel, cliVariant),
          variant: cliVariant,
          brand_identifier: '',
          sku: String(args.sku || '').trim(),
          title: String(args.title || '').trim(),
        },
      };
      const cliFields = parseCsvList(args.fields);
      if (cliFields.length > 0) {
        jobOverride.requirements = { requiredFields: cliFields };
      }
    } else if (specDb && resolvedProductId) {
      jobOverride = buildJobFromDb({ productId: resolvedProductId, category, specDb });
    }

    const bridge = new IndexLabRuntimeBridge({
      outRoot,
      specDb,
      context: {
        category,
        s3Key
      }
    });
    if (typeof process.send === 'function') {
      bridge.onEvent = (row) => {
        if (row && row.__screencast) {
          try { process.send(row); } catch { /* ignore IPC errors */ }
        } else if (row) {
          const msg = { __runtime_event: true, run_id: row.run_id || '', stage: row.stage || '', stage_cursor: row.stage_cursor || '', event: row.event || '' };
          // WHY: Thread LLM call metadata so the parent process can append
          // LLM call records (with token usage) to the pipeline operation.
          // Bridge emit() uses event names 'llm_started'/'llm_finished'/'llm_failed'
          // and nests LLM data inside row.payload (not at top level).
          const ev = row.event;
          if (ev === 'llm_started' || ev === 'llm_finished' || ev === 'llm_failed') {
            const p = row.payload || {};
            msg.__llm_call = { event: ev, model: p.model || '', reason: p.reason || '', prompt_tokens: p.prompt_tokens ?? null, completion_tokens: p.completion_tokens ?? null, total_tokens: p.total_tokens ?? null, cost_usd: p.estimated_cost ?? null, estimated_usage: Boolean(p.estimated_usage), duration_ms: p.duration_ms ?? null, prompt_preview: p.prompt_preview || '', response_preview: p.response_preview || '' };
          }
          try { process.send(msg); } catch { /* ignore IPC errors */ }
        }
      };
      process.on('message', (msg) => {
        if (msg && msg.type === 'screencast_subscribe') {
          bridge.screencastTarget = String(msg.worker_id || '');
        }
        if (msg && msg.type === 'screencast_unsubscribe') {
          bridge.screencastTarget = '';
        }
      });
    }

    const onScreencastFrame = config.runtimeScreencastEnabled
      ? (frame) => bridge.broadcastScreencastFrame(frame)
      : undefined;

    const runConfig = {
      ...config,
      specDb,
      appDb,
      indexLabRoot: outRoot,
      onRuntimeEvent: (row) => bridge.onRuntimeEvent(row),
      onScreencastFrame
    };
    const maxRunSecondsArg = Number.parseInt(String(args['max-run-seconds'] || '').trim(), 10);
    if (Number.isFinite(maxRunSecondsArg) && maxRunSecondsArg > 0) {
      runConfig.maxRunSeconds = maxRunSecondsArg;
      const runBudgetMs = maxRunSecondsArg * 1000;
      // WHY: Cap per-page navigation timeout to runBudget/3 so a single slow
      // page doesn't eat the entire time budget. Uses the Crawlee navigation
      // timeout (seconds) as the baseline.
      const currentNavTimeoutMs = configInt(runConfig, 'crawleeNavigationTimeoutSecs') * 1000;
      const boundedNavTimeoutSecs = Math.max(
        1,
        Math.floor(Math.min(currentNavTimeoutMs, Math.floor(runBudgetMs / 3)) / 1000)
      );
      runConfig.crawleeNavigationTimeoutSecs = boundedNavTimeoutSecs;
    }
    const discoveryEnabledArg = asBool(args['discovery-enabled'], undefined);
    const searchEnginesArg = String(args['search-engines'] || args['search-provider'] || '').trim().toLowerCase();
    if (providerTokens.length === 1) {
      runConfig.searchEngines = providerTokens[0];
    } else if (providerTokens.length > 1) {
      runConfig.searchEngines = providerTokens.join(',');
    }
    if (searchEnginesArg) {
      runConfig.searchEngines = searchEnginesArg;
    }
    if (typeof discoveryEnabledArg === 'boolean') {
      runConfig.discoveryEnabled = discoveryEnabledArg;
    } else if (runConfig.searchEngines) {
      runConfig.discoveryEnabled = true;
    }

      const result = await runProduct({
        storage,
        config: runConfig,
        s3Key,
        jobOverride,
        runIdOverride: requestedRunId || undefined,
      });

      // WHY: Advance stepper to "Finalize" so the GUI shows post-crawl progress
      // instead of appearing stuck on the last crawl phase.
      setStageCursor(bridge, 'stage:finalize');
      await writeRunMeta(bridge);

      // WHY: Write run.json + product.json BEFORE finalize. If finalize or the
      // process exit crashes, both JSONs are already on disk. serializeRunSummary
      // reads bridge state which is still populated (finalize clears it after).
      // Serialize ONCE — pass the payload to finalize() to avoid redundant SQL read.
      let runSummary = null;
      try {
        runSummary = await serializeRunSummary(bridge).catch(() => null);
        // WHY: run.json v3 — embed pre-built panel data so old runs can be
        // replayed without re-querying bridge_events SQL. The builders are
        // called once here against the serialized events; the GUI serves
        // directly from these snapshots for completed runs.
        let runtimeOpsPanels = null;
        try {
          const summaryEvents = runSummary?.telemetry?.events || [];
          const summaryMeta = runSummary?.telemetry?.meta || {};
          runtimeOpsPanels = buildRuntimeOpsPanels({
            events: summaryEvents,
            meta: summaryMeta,
            artifacts: {
              needset: bridge.needSet,
              search_profile: bridge.searchProfile,
            },
            config: runConfig,
          });
        } catch { /* best-effort: v2 checkpoint still written without panels */ }
        // WHY: brandResolution is already in SQL (written by the brand_resolved event handler
        // in runtimeBridgeEventHandlers.js during the run). Read it back so it gets checkpointed
        // into run.json for rebuild durability.
        const brandResolution = specDb?.getRunArtifact?.(result.runId, 'brand_resolution')?.payload || null;
        const checkpoint = buildCrawlCheckpoint({
          crawlResults: result.crawlResults,
          runId: result.runId,
          category,
          productId: result.productId,
          s3Key,
          startMs: result.startMs,
          fetchPlanStats: result.fetchPlanStats,
          needset: bridge.needSet,
          searchProfile: bridge.searchProfile,
          runSummary,
          brandResolution,
          status: 'completed',
          identityLock: result.job?.identityLock || null,
          runtimeOpsPanels,
        });
        // WHY: Checkpoint writes are independent — run in parallel.
        // WHY: Snapshot query cooldowns into product.json so tier progression
        // survives DB rebuilds. Product.json is the durable SSOT (never pruned).
        const queryCooldowns = specDb?.getQueryCooldownsByProduct?.(result.productId) || [];
        const productCp = buildProductCheckpoint({
          identity: result.job?.identityLock || {},
          category,
          productId: result.productId,
          runId: result.runId,
          sources: checkpoint.sources,
          queryCooldowns,
        });
        writeCrawlCheckpoint({
          checkpoint,
          outRoot,
          runId: result.runId,
          upsertRunArtifact: specDb ? (row) => specDb.upsertRunArtifact(row) : undefined,
          category,
        });
        writeProductCheckpoint({ productCheckpoint: productCp, outRoot, runId: result.runId });
      } catch (cpErr) {
        console.warn('[checkpoint-write] run.json/product.json write failed:', cpErr?.message || cpErr);
      }

      bridge.setContext({
        category,
        productId: result.productId,
        s3Key
      });
      // WHY: Pass pre-built runSummary to finalize to avoid redundant SQL read.
      // Previously serializeRunSummary was called twice — once here and once inside
      // finalize — each doing specDb.getBridgeEventsByRunId(runId, 6000).
      await bridge.finalize({
        status: 'completed',
        run_id: result.runId,
        run_base: result.exportInfo?.runBase || '',
        latest_base: result.exportInfo?.latestBase || '',
        runSummaryPayload: runSummary,
      });

      return {
        command: 'indexlab',
        category,
        productId: result.productId,
        runId: result.runId,
        s3Key,
        validated: result.summary?.validated,
        confidence: result.summary?.confidence,
        completeness_required_percent: result.summary?.completeness_required_percent,
        coverage_overall_percent: result.summary?.coverage_overall_percent,
        runBase: result.exportInfo?.runBase,
        latestBase: result.exportInfo?.latestBase,
        indexlab: {
          out_root: pathNode.resolve(outRoot),
          run_dir: pathNode.resolve(outRoot, result.runId),
        }
      };
    } finally {
      try { specDb?.close(); } catch { /* best-effort */ }
    }
  }

  return {
    commandIndexLab,
  };
}
