import { parseCsvList } from '../cliHelpers.js';

export function createPublishingCommands({
  asBool,
  publishProducts,
  readPublishedProvenance,
  readPublishedChangelog,
  buildSourceHealth,
  buildLlmMetrics,
  parseExpansionCategories,
  bootstrapExpansionCategories,
  runFuzzSourceHealthHarness,
  runProductionHardeningReport,
  scanAndEnqueueDriftedProducts,
  reconcileDriftedProduct,
  reconcileOrphans,
  openSpecDbForCategory = null,
}) {
  async function commandPublish(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('publish requires --category <category>');
    }
    // WHY: SQL is the sole SSOT for overrides and provenance. Ensure specDb is available for publish ops.
    const specDb = typeof openSpecDbForCategory === 'function'
      ? await openSpecDbForCategory(config, category)
      : null;
    const productIds = [];
    const singleProductId = String(args['product-id'] || '').trim();
    if (singleProductId) {
      productIds.push(singleProductId);
    }
    for (const productId of parseCsvList(args['product-ids'])) {
      productIds.push(productId);
    }
    try {
      const result = await publishProducts({
        storage,
        config,
        category,
        productIds,
        allApproved: asBool(args['all-approved'], false),
        format: String(args.format || 'all').trim().toLowerCase(),
        specDb,
      });
      return {
        command: 'publish',
        ...result
      };
    } finally {
      if (specDb && typeof specDb.close === 'function') specDb.close();
    }
  }

  async function commandProvenance(_config, storage, args) {
    const category = String(args.category || '').trim();
    const productId = String(args['product-id'] || '').trim();
    if (!category || !productId) {
      throw new Error('provenance requires --category <category> and --product-id <id>');
    }
    const field = String(args.field || '').trim();
    const full = asBool(args.full, false);
    const result = await readPublishedProvenance({
      storage,
      category,
      productId,
      field,
      full
    });
    return {
      command: 'provenance',
      ...result
    };
  }

  async function commandChangelog(_config, storage, args) {
    const category = String(args.category || '').trim();
    const productId = String(args['product-id'] || '').trim();
    if (!category || !productId) {
      throw new Error('changelog requires --category <category> and --product-id <id>');
    }
    const result = await readPublishedChangelog({
      storage,
      category,
      productId
    });
    return {
      command: 'changelog',
      ...result
    };
  }

  async function commandSourceHealth(_config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('source-health requires --category <category>');
    }
    const result = await buildSourceHealth({
      storage,
      category,
      source: String(args.source || '').trim(),
      periodDays: String(args.period || '30d').trim()
    });
    return {
      command: 'source-health',
      ...result
    };
  }

  async function commandLlmMetrics(config, storage, args) {
    const result = await buildLlmMetrics({
      storage,
      config,
      period: String(args.period || 'week').trim(),
      model: String(args.model || '').trim()
    });
    return {
      command: 'llm-metrics',
      ...result
    };
  }

  async function commandExpansionBootstrap(config, _storage, args, commandName = 'expansion-bootstrap') {
    const categories = parseExpansionCategories(args.categories, ['monitor', 'keyboard']);
    const template = String(args.template || 'electronics').trim() || 'electronics';
    const helperRoot = String(
      args['helper-root'] || config.categoryAuthorityRoot || 'category_authority'
    ).trim();
    const categoriesRoot = String(args['categories-root'] || 'categories').trim();
    const goldenRoot = String(args['golden-root'] || 'test/golden').trim();
    const result = await bootstrapExpansionCategories({
      config: {
        ...config,
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      },
      categories,
      template,
      goldenRoot
    });
    return {
      command: commandName,
      ...result
    };
  }

  async function commandHardeningHarness(config, storage, args) {
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const products = Math.max(1, Number.parseInt(String(args.products || '200'), 10) || 200);
    const cycles = Math.max(1, Number.parseInt(String(args.cycles || '100'), 10) || 100);
    const fuzzIterations = Math.max(1, Number.parseInt(String(args['fuzz-iterations'] || '200'), 10) || 200);
    const seed = Math.max(1, Number.parseInt(String(args.seed || '1337'), 10) || 1337);
    const failureAttempts = Math.max(1, Number.parseInt(String(args['failure-attempts'] || '3'), 10) || 3);
    // WHY: SQL is the sole SSOT for queue state. Ensure specDb is available for harness queue ops.
    const specDb = typeof openSpecDbForCategory === 'function'
      ? await openSpecDbForCategory(config, category)
      : null;

    try {
      const fuzzSourceHealth = await runFuzzSourceHealthHarness({
        storage,
        category,
        iterations: fuzzIterations,
        seed
      });
      return {
        command: 'hardening-harness',
        category,
        fuzz_source_health: fuzzSourceHealth,
        passed: Boolean(fuzzSourceHealth.passed)
      };
    } finally {
      if (specDb && typeof specDb.close === 'function') specDb.close();
    }
  }

  async function commandHardeningReport(_config, _storage, args) {
    const rootDir = String(args['root-dir'] || process.cwd()).trim() || process.cwd();
    const report = await runProductionHardeningReport({
      rootDir
    });
    return {
      command: 'hardening-report',
      ...report
    };
  }

  async function commandDriftScan(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('drift-scan requires --category <category>');
    }
    const specDb = typeof openSpecDbForCategory === 'function'
      ? await openSpecDbForCategory(config, category)
      : null;
    const maxProducts = Math.max(1, Number.parseInt(String(args['max-products'] || '250'), 10) || 250);
    try {
      const result = await scanAndEnqueueDriftedProducts({
        storage,
        config,
        category,
        maxProducts,
        queueOnChange: asBool(args.enqueue, true),
        specDb,
      });
      return {
        command: 'drift-scan',
        ...result
      };
    } finally {
      if (specDb && typeof specDb.close === 'function') specDb.close();
    }
  }

  async function commandDriftReconcile(config, storage, args) {
    const category = String(args.category || '').trim();
    const productId = String(args['product-id'] || '').trim();
    if (!category || !productId) {
      throw new Error('drift-reconcile requires --category <category> and --product-id <id>');
    }
    const specDb = typeof openSpecDbForCategory === 'function'
      ? await openSpecDbForCategory(config, category)
      : null;
    try {
      const result = await reconcileDriftedProduct({
        storage,
        config,
        category,
        productId,
        autoRepublish: asBool(args['auto-republish'], true),
        specDb,
      });
      return {
        command: 'drift-reconcile',
        ...result
      };
    } finally {
      if (specDb && typeof specDb.close === 'function') specDb.close();
    }
  }

  async function commandProductReconcile(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('product-reconcile requires --category <category>');
    }
    const dryRun = asBool(args['dry-run'], true);
    const result = await reconcileOrphans({
      storage,
      category,
      config,
      dryRun
    });
    return result;
  }

  return {
    commandPublish,
    commandProvenance,
    commandChangelog,
    commandSourceHealth,
    commandLlmMetrics,
    commandExpansionBootstrap,
    commandHardeningHarness,
    commandHardeningReport,
    commandDriftScan,
    commandDriftReconcile,
    commandProductReconcile,
  };
}
