import { parseCsvList, looksHttpUrl, assertCategorySchemaReady, parseJsonArg } from '../cliHelpers.js';
import pathNode from 'node:path';
import fsNode from 'node:fs/promises';
import { configInt } from '../../../shared/settingsAccessor.js';
import { buildProductId } from '../../../shared/primitives.js';
import { buildCrawlCheckpoint } from '../../../pipeline/checkpoint/buildCrawlCheckpoint.js';
import { writeCrawlCheckpoint } from '../../../pipeline/checkpoint/writeCrawlCheckpoint.js';
import { buildProductCheckpoint } from '../../../pipeline/checkpoint/buildProductCheckpoint.js';
import { writeProductCheckpoint } from '../../../pipeline/checkpoint/writeProductCheckpoint.js';
import { buildJobFromDb } from '../../../features/indexing/orchestration/bootstrap/buildJobFromDb.js';
import { serializeRunSummary } from '../../../indexlab/runSummarySerializer.js';
import { buildRuntimeOpsPanels } from '../../../features/indexing/api/builders/buildRuntimeOpsPanels.js';

export function createPipelineCommands({
  asBool,
  toPosixKey,
  runProduct,
  runUntilComplete,
  IndexLabRuntimeBridge,
  defaultIndexLabRoot,
}) {
  async function commandRunOne(config, storage, args) {
    const s3Key =
      args.s3key || 'specs/inputs/mouse/products/mouse-razer-viper-v3-pro.json';

    const result = await runProduct({ storage, config, s3Key });
    const urlsCrawled = result.crawlResults?.length ?? 0;
    const urlsSuccessful = result.crawlResults?.filter((r) => r.success).length ?? 0;
    return {
      command: 'run-one',
      productId: result.productId,
      runId: result.runId,
      urls_crawled: urlsCrawled,
      urls_successful: urlsSuccessful,
    };
  }

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
      // CLI identity args (brand, model, variant, etc.).
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
      const generatedProductId = productIdArg || buildProductId(category);
      const job = {
        productId: generatedProductId,
        category,
        identityLock: {
          brand,
          model,
          variant,
          sku,
          title
        },
        seedUrls: seedIsUrl ? [seed] : parseCsvList(args['seed-urls'])
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
    // WHY: resolve from project root, not CWD — the child process CWD may differ from the GUI server
    let specDb = null;
    try {
      const { SpecDb } = await import('../../../db/specDb.js');
      const projectRoot = pathNode.resolve(decodeURIComponent(new URL('../../../../', import.meta.url).pathname).replace(/^\/([A-Z]:)/i, '$1'));
      const specDbDir = pathNode.join(projectRoot, '.workspace', 'db', category);
      await fsNode.mkdir(specDbDir, { recursive: true });
      specDb = new SpecDb({ dbPath: pathNode.join(specDbDir, 'spec.sqlite'), category });
    } catch { /* best-effort: pipeline still works without SQL event logging */ }

    // WHY: DB-first job resolution. The products table in spec.sqlite is the SSOT
    // for product identity. This eliminates the "unknown unknown-model" problem
    // when fixture files don't exist or were created without identity args.
    // Precedence: 1) CLI args  2) DB lookup  3) fixture file (legacy fallback)
    let jobOverride = null;
    const cliBrand = String(args.brand || '').trim();
    const cliModel = String(args.model || '').trim();
    const resolvedProductId = productIdArg || s3Key.replace(/.*\//, '').replace(/\.json$/i, '');
    if (cliBrand && cliModel) {
      jobOverride = {
        productId: resolvedProductId,
        category,
        identityLock: {
          brand: cliBrand,
          model: cliModel,
          variant: String(args.variant || '').trim(),
          sku: String(args.sku || '').trim(),
          title: String(args.title || '').trim(),
        },
        seedUrls: parseCsvList(args['seed-urls']),
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
          try { process.send({ __runtime_event: true, run_id: row.run_id || '', stage: row.stage || '', event: row.event || '' }); } catch { /* ignore IPC errors */ }
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

    try {
      const result = await runProduct({
        storage,
        config: runConfig,
        s3Key,
        jobOverride,
        runIdOverride: requestedRunId || undefined,
      });

      // WHY: Write run.json + product.json BEFORE finalize. If finalize or the
      // process exit crashes, both JSONs are already on disk. serializeRunSummary
      // reads bridge state which is still populated (finalize clears it after).
      try {
        const runSummary = await serializeRunSummary(bridge).catch(() => null);
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
          status: 'completed',
          identityLock: result.job?.identityLock || null,
          runtimeOpsPanels,
        });
        writeCrawlCheckpoint({
          checkpoint,
          outRoot,
          runId: result.runId,
          upsertRunArtifact: specDb ? (row) => specDb.upsertRunArtifact(row) : undefined,
          category,
        });
        // WHY: Product.json accumulates sources across runs. Content-addressed
        // dedup means same page content → update last_seen, not duplicate.
        const productCp = buildProductCheckpoint({
          identity: result.job?.identityLock || {},
          category,
          productId: result.productId,
          runId: result.runId,
          sources: checkpoint.sources,
        });
        writeProductCheckpoint({ productCheckpoint: productCp, outRoot, runId: result.runId });
      } catch { /* best-effort: pipeline continues without checkpoints */ }

      bridge.setContext({
        category,
        productId: result.productId,
        s3Key
      });
      await bridge.finalize({
        status: 'completed',
        run_id: result.runId,
        run_base: result.exportInfo?.runBase || '',
        latest_base: result.exportInfo?.latestBase || ''
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

  async function commandRunAdHoc(config, storage, args) {
    const positional = args._ || [];
    const category = String(args.category || positional[0] || 'mouse').trim();
    const brand = String(args.brand || positional[1] || '').trim();
    const model = String(args.model || positional[2] || '').trim();
    const variant = String(args.variant || positional.slice(3).join(' ') || '').trim();

    if (!brand || !model) {
      throw new Error('run-ad-hoc requires <category> <brand> <model> or --brand/--model');
    }

    await assertCategorySchemaReady({ category, storage, config });

    const productId = String(args['product-id'] || '').trim() || buildProductId(category);

    const identityLock = {
      brand,
      model,
      variant,
      sku: String(args.sku || '').trim(),
      mpn: String(args.mpn || '').trim(),
      gtin: String(args.gtin || '').trim()
    };

    const seedUrls = parseCsvList(args['seed-urls']);
    const anchors = parseJsonArg('anchors-json', args['anchors-json'], {});
    const requirements = parseJsonArg('requirements-json', args['requirements-json'], null);

    const job = {
      productId,
      category,
      identityLock,
      seedUrls,
      anchors
    };
    if (requirements) {
      job.requirements = requirements;
    }

    const s3Key =
      args.s3key || toPosixKey('specs/inputs', category, 'products', `${productId}.json`);

    await storage.writeObject(
      s3Key,
      Buffer.from(JSON.stringify(job, null, 2), 'utf8'),
      { contentType: 'application/json' }
    );

    if (asBool(args['until-complete'], false)) {
      const maxRounds = Math.max(1, Number.parseInt(String(args['max-rounds'] || '0'), 10) || 0);
      const completed = await runUntilComplete({
        storage,
        config,
        s3key: s3Key,
        maxRounds: maxRounds || undefined,
      });
      return {
        command: 'run-ad-hoc',
        until_complete: true,
        s3Key,
        productId: completed.productId,
        ...completed
      };
    }

    const result = await runProduct({ storage, config, s3Key });
    return {
      command: 'run-ad-hoc',
      s3Key,
      productId: result.productId,
      runId: result.runId,
      validated: result.summary?.validated,
      validated_reason: result.summary?.validated_reason,
      confidence: result.summary?.confidence,
      completeness_required_percent: result.summary?.completeness_required_percent,
      coverage_overall_percent: result.summary?.coverage_overall_percent,
      runBase: result.exportInfo?.runBase,
      latestBase: result.exportInfo?.latestBase,
      finalBase: result.finalExport?.final_base || null
    };
  }

  async function commandRunUntilComplete(config, storage, args) {
    const s3key = String(args.s3key || '').trim();
    if (!s3key) {
      throw new Error('run-until-complete requires --s3key <key>');
    }
    const maxRounds = Math.max(1, Number.parseInt(String(args['max-rounds'] || '0'), 10) || 0);
    const result = await runUntilComplete({
      storage,
      config,
      s3key,
      maxRounds: maxRounds || undefined,
    });
    return {
      command: 'run-until-complete',
      ...result
    };
  }

  return {
    commandRunOne,
    commandIndexLab,
    commandRunAdHoc,
    commandRunUntilComplete,
  };
}
