import { slug, parseCsvList, looksHttpUrl, assertCategorySchemaReady, parseJsonArg } from '../cliHelpers.js';
import pathNode from 'node:path';
import fsNode from 'node:fs/promises';
import { configInt } from '../../../shared/settingsAccessor.js';
import { INPUT_KEY_PREFIX } from '../../../shared/storageKeyPrefixes.js';

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
      args.s3key || `${INPUT_KEY_PREFIX}/mouse/products/mouse-razer-viper-v3-pro.json`;

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
      return toPosixKey(INPUT_KEY_PREFIX, category, 'products', `${normalized}.json`);
    };

    let s3Key = String(args.s3key || '').trim();
    if (!s3Key && productIdArg) {
      s3Key = buildInputKey(productIdArg);
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
      const generatedProductId = productIdArg
        || [category, slug(brand), slug(model), slug(variant), `indexlab-${Date.now()}`]
          .filter(Boolean)
          .join('-');
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
    let specDb = null;
    try {
      const { SpecDb } = await import('../../../db/specDb.js');
      const specDbDir = pathNode.join(config.specDbDir || '.specfactory_tmp', category);
      await fsNode.mkdir(specDbDir, { recursive: true });
      specDb = new SpecDb({ dbPath: pathNode.join(specDbDir, 'spec.sqlite'), category });
    } catch { /* best-effort: pipeline still works without SQL event logging */ }

    const bridge = new IndexLabRuntimeBridge({
      outRoot,
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
      onRuntimeEvent: (row) => bridge.onRuntimeEvent(row),
      onScreencastFrame
    };
    const maxRunSecondsArg = Number.parseInt(String(args['max-run-seconds'] || '').trim(), 10);
    if (Number.isFinite(maxRunSecondsArg) && maxRunSecondsArg > 0) {
      runConfig.maxRunSeconds = maxRunSecondsArg;
      const runBudgetMs = maxRunSecondsArg * 1000;
      const boundedFetchTimeoutMs = Math.max(
        1_000,
        Math.min(
          configInt(runConfig, 'pageGotoTimeoutMs'),
          Math.floor(runBudgetMs / 3)
        )
      );
      runConfig.pageGotoTimeoutMs = boundedFetchTimeoutMs;
      runConfig.dynamicFetchRetryBudget = 0;
      runConfig.dynamicFetchRetryBackoffMs = 0;
      runConfig.sourceFetchWrapperAttempts = 1;
      runConfig.sourceFetchWrapperBackoffMs = 0;
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
      runIdOverride: requestedRunId || undefined,
    });

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
        events_path: pathNode.resolve(outRoot, result.runId, 'run_events.ndjson'),
        run_meta_path: pathNode.resolve(outRoot, result.runId, 'run.json')
      }
    };
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

    const autoProductId = [category, slug(brand), slug(model), slug(variant)]
      .filter(Boolean)
      .join('-');
    const productId = String(args['product-id'] || autoProductId || `${category}-${Date.now()}`).trim();

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
      args.s3key || toPosixKey(INPUT_KEY_PREFIX, category, 'products', `${productId}.json`);

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
