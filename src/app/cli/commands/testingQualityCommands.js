import { parseJsonArg } from '../cliHelpers.js';

export function createTestingQualityCommands({
  asBool,
  createGoldenFixture,
  createGoldenFromCatalog,
  validateGoldenFixtures,
  runQaJudge,
  computeCalibrationReport,
  buildAccuracyReport,
  renderAccuracyReportMarkdown,
  runAccuracyBenchmarkReport,
  buildAccuracyTrend,
  openSpecDbForCategory,
}) {
  async function commandCreateGolden(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('create-golden requires --category <category>');
    }
    const fromCatalog = asBool(args['from-catalog'], false);
    if (fromCatalog) {
      const count = Math.max(1, Number.parseInt(String(args.count || '50'), 10) || 50);
      const productId = String(args['product-id'] || '').trim();
      const result = await createGoldenFromCatalog({
        category,
        count,
        productId,
        config
      });
      return {
        command: 'create-golden',
        mode: 'from-catalog',
        ...result
      };
    }

    const productId = String(args['product-id'] || '').trim();
    if (!productId) {
      throw new Error('create-golden requires --product-id <id> when --from-catalog is not set');
    }
    const identity = parseJsonArg('identity-json', args['identity-json'], {});
    const fields = parseJsonArg('fields-json', args['fields-json'], {});
    const expectedUnknowns = parseJsonArg('unknowns-json', args['unknowns-json'], {});
    const notes = String(args.notes || '').trim();

    const result = await createGoldenFixture({
      category,
      productId,
      identity,
      fields,
      expectedUnknowns,
      notes,
      config
    });
    return {
      command: 'create-golden',
      mode: 'single',
      ...result
    };
  }

  async function commandTestGolden(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('test-golden requires --category <category>');
    }
    const result = await validateGoldenFixtures({
      category,
      config
    });
    return {
      command: 'test-golden',
      ...result
    };
  }

  async function commandQaJudge(config, storage, args) {
    const category = String(args.category || '').trim();
    const productId = String(args['product-id'] || args.product || '').trim();
    if (!category || !productId) {
      throw new Error('qa-judge requires --category <category> --product-id <id>');
    }
    return runQaJudge({
      storage,
      config,
      category,
      productId
    });
  }

  async function commandCalibrateConfidence(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('calibrate-confidence requires --category <category>');
    }
    const productId = String(args['product-id'] || '').trim();

    const specDb = await openSpecDbForCategory?.(config, category) ?? null;
    try {
    const predictions = [];
    const productIds = [];

    if (productId) {
      productIds.push(productId);
    } else {
      const allKeys = await storage.listInputKeys(category);
      for (const key of allKeys) {
        const job = await storage.readJsonOrNull(key);
        if (job?.productId) productIds.push(job.productId);
      }
    }

    for (const pid of productIds) {
      const latestBase = storage.resolveOutputKey(category, pid, 'latest');
      const summary = specDb
        ? specDb.getSummaryForProduct(pid)
        : (await storage.readJsonOrNull(`${latestBase}/summary.json`));
      const normalized = specDb
        ? specDb.getNormalizedForProduct(pid)
        : (await storage.readJsonOrNull(`${latestBase}/normalized.json`));
      if (!normalized?.fields) continue;

      for (const [field, value] of Object.entries(normalized.fields)) {
        const token = String(value ?? '').trim().toLowerCase();
        if (token === 'unk' || token === '') continue;
        const confidence = Number.parseFloat(
          String(summary?.field_confidence?.[field] ?? summary?.confidence ?? 0.5)
        ) || 0.5;
        predictions.push({ field, value, confidence, product_id: pid });
      }
    }

    const goldenDir = `fixtures/golden/${category}`;
    const goldenKeys = await storage.listKeys?.(goldenDir) || [];
    const groundTruth = {};
    for (const gk of goldenKeys) {
      if (!gk.endsWith('.json')) continue;
      const golden = await storage.readJsonOrNull(gk);
      if (!golden?.expected_fields) continue;
      for (const [field, value] of Object.entries(golden.expected_fields)) {
        if (!groundTruth[field]) groundTruth[field] = value;
      }
    }

    const report = computeCalibrationReport({ predictions, groundTruth });
    return {
      command: 'calibrate-confidence',
      category,
      product_count: productIds.length,
      ...report
    };
    } finally {
      try { specDb?.close(); } catch { /* */ }
    }
  }

  async function commandAccuracyReport(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('accuracy-report requires --category <category>');
    }
    const format = String(args.format || 'json').trim().toLowerCase();
    const maxCases = Math.max(0, Number.parseInt(String(args['max-cases'] || '0'), 10) || 0);
    const report = await buildAccuracyReport({
      category,
      storage,
      config,
      maxCases
    });
    if (format === 'md') {
      return {
        command: 'accuracy-report',
        format: 'md',
        category: report.category,
        report_markdown: renderAccuracyReportMarkdown(report),
        report
      };
    }
    return {
      command: 'accuracy-report',
      format: 'json',
      ...report
    };
  }

  async function commandAccuracyBenchmark(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('accuracy-benchmark requires --category <category>');
    }
    const maxCases = Math.max(0, Number.parseInt(String(args['max-cases'] || '0'), 10) || 0);
    const period = String(args.period || 'weekly').trim().toLowerCase();
    const report = await runAccuracyBenchmarkReport({
      storage,
      config,
      category,
      period,
      maxCases
    });
    return {
      command: 'accuracy-benchmark',
      ...report
    };
  }

  async function commandAccuracyTrend(_config, storage, args) {
    const category = String(args.category || '').trim();
    const field = String(args.field || '').trim();
    if (!category || !field) {
      throw new Error('accuracy-trend requires --category <category> and --field <field>');
    }
    const period = String(args.period || '90d').trim();
    const result = await buildAccuracyTrend({
      storage,
      category,
      field,
      periodDays: period
    });
    return {
      command: 'accuracy-trend',
      ...result
    };
  }

  return {
    commandCreateGolden,
    commandTestGolden,
    commandQaJudge,
    commandCalibrateConfidence,
    commandAccuracyReport,
    commandAccuracyBenchmark,
    commandAccuracyTrend,
  };
}
