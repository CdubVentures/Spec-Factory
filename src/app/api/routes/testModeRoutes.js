import { emitDataChange } from '../../../core/events/dataChangeContract.js';

export function registerTestModeRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    toUnitRatio,
    config,
    storage,
    HELPER_ROOT,
    OUTPUT_ROOT,
    getSpecDb,
    getSpecDbReady,
    fs,
    path,
    safeReadJson,
    safeStat,
    listFiles,
    resolveCategoryAlias,
    broadcastWs,
    analyzeContract,
    buildTestProducts,
    generateTestSourceResults,
    buildSeedComponentDB,
    loadComponentIdentityPools,
    runFieldContractTests,
    runTestProduct,
    purgeTestModeCategoryState,
    resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
    addBrand,
    appDb,
    invalidateFieldRulesCache,
    sessionCache,
    logger,
  } = ctx;

  return async function handleTestModeRoutes(parts, params, method, req, res) {
    // POST /api/v1/test-mode/create  { sourceCategory }
    if (parts[0] === 'test-mode' && parts[1] === 'create' && method === 'POST') {
      const body = await readJsonBody(req);
      const sourceCategory = body.sourceCategory || 'mouse';
      const testCategory = `_test_${sourceCategory}`;
      const sourceDir = path.join(HELPER_ROOT, sourceCategory, '_generated');
      const sourceStat = await safeStat(sourceDir);
      if (!sourceStat) return jsonRes(res, 400, { ok: false, error: 'source_category_not_found', sourceCategory });

      try {
        const runtimeSpecDb = await getSpecDbReady(testCategory);
        purgeTestModeCategoryState(runtimeSpecDb, testCategory);
      } catch { /* non-fatal */ }

      const testDir = path.join(HELPER_ROOT, testCategory);
      const fixturesCategoryDir = path.join('fixtures', 's3', 'specs', 'inputs', testCategory);
      const outputsCategoryDir = path.join(OUTPUT_ROOT, 'specs', 'outputs', testCategory);
      await Promise.all([
        fs.rm(testDir, { recursive: true, force: true }),
        fs.rm(fixturesCategoryDir, { recursive: true, force: true }),
        fs.rm(outputsCategoryDir, { recursive: true, force: true }),
      ]);
      const genDir = path.join(testDir, '_generated');
      const compDbDir = path.join(genDir, 'component_db');
      await fs.mkdir(genDir, { recursive: true });
      await fs.mkdir(compDbDir, { recursive: true });
      await fs.mkdir(path.join(testDir, '_control_plane'), { recursive: true });
      await fs.mkdir(path.join(testDir, '_overrides'), { recursive: true });

      // Copy generated rule files with progress broadcasts
      const ruleFiles = ['field_rules.json', 'known_values.json',
        'cross_validation_rules.json', 'parse_templates.json', 'ui_field_catalog.json',
        'key_migrations.json', 'field_groups.json', 'manifest.json'];

      broadcastWs('test-import-progress', { step: 'field_rules', status: 'copying', detail: `Copying ${ruleFiles.length} rule files` });
      let copiedRules = 0;
      for (const f of ruleFiles) {
        const src = path.join(sourceDir, f);
        const dest = path.join(genDir, f);
        try { await fs.copyFile(src, dest); copiedRules++; } catch { /* skip missing */ }
      }
      broadcastWs('test-import-progress', { step: 'field_rules', status: 'done', detail: `${copiedRules} rule files` });

      // Build seed component DBs from source contract analysis
      const sourceSpecDb = await getSpecDbReady(sourceCategory).catch(() => null);
      const sourceCR = sourceSpecDb?.getCompiledRules?.() ?? null;
      const sourceAnalysis = await analyzeContract(HELPER_ROOT, sourceCategory, { compiledRules: sourceCR });
      const componentTypes = (sourceAnalysis?.summary?.componentTypes || [])
        .map((row) => String(row?.type || '').trim())
        .filter(Boolean);
      const identityPoolsByType = await loadComponentIdentityPools({
        componentTypes,
        strict: true,
      });
      const seedDBs = buildSeedComponentDB(sourceAnalysis, testCategory, {
        identityPoolsByType,
        strictIdentityPools: true,
      });
      for (const [dbFile, db] of Object.entries(seedDBs)) {
        broadcastWs('test-import-progress', { step: `component_db/${dbFile}`, status: 'copying', file: `${dbFile}.json` });
        await fs.writeFile(path.join(compDbDir, `${dbFile}.json`), JSON.stringify(db, null, 2));
        broadcastWs('test-import-progress', { step: `component_db/${dbFile}`, status: 'done', detail: `${db.items.length} seed items` });
      }

      // Create products directory in fixtures
      const productsDir = path.join('fixtures', 's3', 'specs', 'inputs', testCategory, 'products');
      await fs.mkdir(productsDir, { recursive: true });

      // WHY: Populate compiled_rules so subsequent calls (contract-summary, generate-products, run)
      // can read from DB instead of JSON.
      let testCR = null;
      try {
        const testSpecDb = await getSpecDbReady(testCategory);
        const { reseedCompiledRulesAndBootConfig } = await import('../../../features/studio/fieldStudioMapReseed.js');
        await reseedCompiledRulesAndBootConfig({ specDb: testSpecDb, helperRoot: HELPER_ROOT });
        testCR = testSpecDb?.getCompiledRules?.() ?? null;
      } catch { /* non-fatal */ }

      // Analyze the test category contract for summary
      let contractSummary = null;
      try {
        const analysis = await analyzeContract(HELPER_ROOT, testCategory, { compiledRules: testCR });
        contractSummary = analysis.summary;
        broadcastWs('test-import-progress', {
          step: 'complete',
          status: 'done',
          summary: {
            fields: analysis.summary.fieldCount,
            components: analysis.summary.componentTypes.length,
            componentItems: analysis.summary.componentTypes.reduce((s, c) => s + c.itemCount, 0),
            enums: analysis.summary.knownValuesCatalogs.length,
            rules: analysis.summary.crossValidationRules.length
          }
        });
      } catch { /* non-fatal */ }

      emitDataChange({
        broadcastWs,
        event: 'test-mode-created',
        category: 'all',
        meta: {
          sourceCategory,
          testCategory,
        },
      });

      return jsonRes(res, 200, { ok: true, category: testCategory, contractSummary });
    }

    // GET /api/v1/test-mode/contract-summary?category=_test_mouse
    if (parts[0] === 'test-mode' && parts[1] === 'contract-summary' && method === 'GET') {
      const category = resolveCategoryAlias(params.get('category') || '');
      if (!category || !category.startsWith('_test_')) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_test_category' });
      }

      try {
        const runtimeSpecDb = await getSpecDbReady(category).catch(() => null);
        const compiledRules = runtimeSpecDb?.getCompiledRules?.() ?? null;
        const analysis = await analyzeContract(HELPER_ROOT, category, { compiledRules });
        return jsonRes(res, 200, { ok: true, summary: analysis.summary, matrices: analysis.matrices, scenarioDefs: analysis.scenarioDefs });
      } catch (err) {
        return jsonRes(res, 500, { ok: false, error: err.message });
      }
    }

    // GET /api/v1/test-mode/status?sourceCategory=mouse
    if (parts[0] === 'test-mode' && parts[1] === 'status' && method === 'GET') {
      const sourceCategory = params.get('sourceCategory') || 'mouse';
      const testCategory = `_test_${sourceCategory}`;
      const genDir = path.join(HELPER_ROOT, testCategory, '_generated');
      const genExists = await safeStat(genDir);

      if (!genExists) {
        return jsonRes(res, 200, { ok: true, exists: false, testCategory: '', testCases: [], runResults: [] });
      }

      const productsDir = path.join('fixtures', 's3', 'specs', 'inputs', testCategory, 'products');
      const productFiles = await listFiles(productsDir, '.json').catch(() => []);
      const testCases = [];
      const runResults = [];

      // WHY: Load repair data from field_test DB (persists across tabs/reloads)
      const runtimeSpecDb = await getSpecDbReady(testCategory).catch(() => null);
      const fieldTestRows = new Map();
      try {
        const rows = runtimeSpecDb?.getFieldTestByCategory() || [];
        for (const row of rows) fieldTestRows.set(row.product_id, row);
      } catch { /* table may not exist */ }

      for (const pf of productFiles) {
        const job = await safeReadJson(path.join(productsDir, pf));
        if (!job?._testCase) continue;
        testCases.push({
          id: job._testCase.id,
          name: job._testCase.name,
          description: job._testCase.description,
          category: job._testCase.category,
          productId: job.productId
        });

        // DB is SSOT for test run results
        const ftRow = fieldTestRows.get(job.productId);
        if (ftRow) {
          runResults.push({
            productId: job.productId,
            status: 'complete',
            testCase: job._testCase,
            confidence: ftRow.confidence,
            coverage: ftRow.coverage,
            completeness: ftRow.completeness,
            trafficLight: { green: ftRow.traffic_green, yellow: ftRow.traffic_yellow, red: ftRow.traffic_red },
            constraintConflicts: ftRow.constraint_conflicts || 0,
            missingRequired: ftRow.missing_required ? JSON.parse(ftRow.missing_required) : [],
            curationSuggestions: ftRow.curation_suggestions || 0,
            runtimeFailures: ftRow.runtime_failures || 0,
            durationMs: ftRow.duration_ms || undefined,
            repairLog: ftRow.repair_total > 0 ? {
              total: ftRow.repair_total,
              repaired: ftRow.repair_repaired,
              failed: ftRow.repair_failed,
              rerunRecommended: ftRow.repair_rerun,
              promptSkipped: ftRow.repair_skipped,
            } : null,
          });
        }
      }

      return jsonRes(res, 200, { ok: true, exists: true, testCategory, testCases, runResults });
    }

    // POST /api/v1/test-mode/generate-products  { category }
    if (parts[0] === 'test-mode' && parts[1] === 'generate-products' && method === 'POST') {
      const body = await readJsonBody(req);
      const category = resolveCategoryAlias(body.category);
      if (!category || !category.startsWith('_test_')) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_test_category' });
      }

      const productsDir = path.join('fixtures', 's3', 'specs', 'inputs', category, 'products');
      await fs.rm(productsDir, { recursive: true, force: true });
      await fs.mkdir(productsDir, { recursive: true });
      const outputsCategoryDir = path.join(OUTPUT_ROOT, 'specs', 'outputs', category);
      await fs.rm(outputsCategoryDir, { recursive: true, force: true });

      let contractAnalysis = null;
      try {
        const genSpecDb = await getSpecDbReady(category).catch(() => null);
        const genCR = genSpecDb?.getCompiledRules?.() ?? null;
        contractAnalysis = await analyzeContract(HELPER_ROOT, category, { compiledRules: genCR });
      } catch { /* non-fatal */ }

      const testProducts = buildTestProducts(category, contractAnalysis);
      const productIds = [];
      const testCases = [];

      for (const product of testProducts) {
        const filePath = path.join(productsDir, `${product.productId}.json`);
        await fs.writeFile(filePath, JSON.stringify(product, null, 2));
        productIds.push(product.productId);
        testCases.push({
          id: product._testCase.id,
          name: product._testCase.name,
          description: product._testCase.description,
          category: product._testCase.category,
          productId: product.productId
        });
      }

      const testBrands = new Set();
      for (const product of testProducts) {
        const il = product.identityLock || {};
        testBrands.add(il.brand || 'TestCo');
      }

      testBrands.add('NovaForge Labs');
      for (const brandName of testBrands) {
        const result = await addBrand({ config, appDb, name: brandName, aliases: [], categories: [category] });
        if (result.ok === false && result.error === 'brand_already_exists' && appDb) {
          const existing = appDb.getBrandBySlug(result.slug);
          if (existing) {
            const currentCats = appDb.getCategoriesForBrand(existing.identifier);
            if (!currentCats.includes(category.toLowerCase())) {
              appDb.setBrandCategories(existing.identifier, [...new Set([...currentCats, category.toLowerCase()])].sort());
            }
          }
        }
      }

      emitDataChange({
        broadcastWs,
        event: 'test-mode-products-generated',
        category,
        meta: {
          count: testCases.length,
        },
      });

      return jsonRes(res, 200, { ok: true, products: productIds, testCases });
    }

    // POST /api/v1/test-mode/run  { category, productId? }
    if (parts[0] === 'test-mode' && parts[1] === 'run' && method === 'POST') {
      const body = await readJsonBody(req);
      const category = resolveCategoryAlias(body.category);
      if (!category || !category.startsWith('_test_')) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_test_category' });
      }

      const productsDir = path.join('fixtures', 's3', 'specs', 'inputs', category, 'products');
      let productFiles;
      if (body.productId) {
        productFiles = [`${body.productId}.json`];
      } else {
        productFiles = await listFiles(productsDir, '.json');
      }
      const resetState = body?.resetState !== false;
      const runtimeSpecDb = await getSpecDbReady(category);
      if (resetState && runtimeSpecDb && !body.productId) {
        resetTestModeSharedReviewState(runtimeSpecDb, category);
      }

      // WHY: DB-first for field rules, JSON fallback for freshly created test categories
      const compiledRules = runtimeSpecDb?.getCompiledRules?.() ?? null;
      let fieldRules, knownValues, componentDBs;
      if (compiledRules?.fields) {
        fieldRules = { fields: compiledRules.fields, component_db_sources: compiledRules.component_db_sources || {} };
        knownValues = compiledRules.known_values || {};
        componentDBs = compiledRules.component_dbs || {};
      } else {
        const fieldRulesPath = path.join(HELPER_ROOT, category, '_generated', 'field_rules.json');
        const knownValuesPath = path.join(HELPER_ROOT, category, '_generated', 'known_values.json');
        const compDbDir = path.join(HELPER_ROOT, category, '_generated', 'component_db');
        fieldRules = await safeReadJson(fieldRulesPath) || {};
        knownValues = await safeReadJson(knownValuesPath) || {};
        componentDBs = {};
        const compFiles = await listFiles(compDbDir, '.json');
        for (const f of compFiles) {
          const data = await safeReadJson(path.join(compDbDir, f));
          if (data) componentDBs[data?.component_type || f.replace('.json', '')] = data;
        }
      }

      let contractAnalysis = null;
      try {
        contractAnalysis = await analyzeContract(HELPER_ROOT, category, { compiledRules });
      } catch { /* non-fatal */ }
      const generationOptions = (body && typeof body.generation === 'object' && body.generation !== null)
        ? body.generation
        : {};

      // WHY: Deterministic mode runs per-key field contract audit directly — no products, no sources, no consensus.
      if (!body.useLlm) {
        broadcastWs('test-run-progress', { status: 'running', audit: true });
        const auditResults = runFieldContractTests({ fieldRules, knownValues, componentDbs: componentDBs });
        broadcastWs('test-run-progress', { status: 'complete', audit: true, summary: auditResults.summary });
        return jsonRes(res, 200, { ok: true, results: [{ status: 'complete', audit: auditResults }] });
      }

      const results = [];
      const totalProducts = productFiles.length;
      for (let pi = 0; pi < totalProducts; pi++) {
        const pf = productFiles[pi];
        const productPath = path.join(productsDir, pf);
        const job = await safeReadJson(productPath);
        if (!job) { results.push({ file: pf, error: 'read_failed' }); continue; }

        if (resetState && runtimeSpecDb) {
          resetTestModeProductReviewState(runtimeSpecDb, category, job.productId);
        }

        const scenarioName = job._testCase?.name || pf;
        broadcastWs('test-run-progress', {
          index: pi,
          total: totalProducts,
          productId: job.productId,
          scenarioName,
          status: 'running',
          aiReview: body.aiReview ?? false,
        });

        try {
          const sourceResults = await generateTestSourceResults({
            product: job,
            fieldRules,
            componentDBs,
            knownValues,
            config,
            contractAnalysis,
            generationOptions,
          });

          const result = await runTestProduct({
            config, job, sourceResults, category,
            specDb: runtimeSpecDb,
            fieldRules,
            knownValues,
            componentDBs,
            aiReview: body.aiReview ?? false,
            logger,
            // WHY: Stream per-field repair progress so the UI shows each LLM call live
            onProgress: (body.aiReview) ? (progress) => {
              broadcastWs('test-repair-progress', { productId: job.productId, scenarioName, ...progress });
            } : null,
          });
          const fullResult = { productId: job.productId, status: 'complete', ...result };
          results.push(fullResult);

          // WHY: Broadcast the full result so frontend can update panels live
          broadcastWs('test-run-progress', {
            index: pi,
            total: totalProducts,
            productId: job.productId,
            scenarioName,
            status: 'complete',
            result: fullResult,
          });
        } catch (err) {
          const errResult = { productId: job.productId, status: 'error', error: err.message, testCase: job._testCase || null };
          results.push(errResult);

          broadcastWs('test-run-progress', {
            index: pi,
            total: totalProducts,
            productId: job.productId,
            scenarioName,
            status: 'error',
            result: errResult,
          });
        }
      }

      const resyncSpecDb = body?.resyncSpecDb !== false;
      if (runtimeSpecDb && resyncSpecDb) {
        // WHY: Preserve field_test + curation rows across purge+resync — they have no file source
        let savedFieldTestRows = [];
        let savedCurationRows = [];
        try { savedFieldTestRows = runtimeSpecDb.getFieldTestByCategory() || []; } catch { /* table may not exist */ }
        try {
          const enumSugs = runtimeSpecDb.getCurationSuggestions('enum_value') || [];
          const compSugs = runtimeSpecDb.getCurationSuggestions('new_component') || [];
          savedCurationRows = [...enumSugs, ...compSugs];
        } catch { /* table may not exist */ }

        try {
          if (!body.productId) {
            purgeTestModeCategoryState(runtimeSpecDb, category);
          }
          const { syncSpecDbForCategory } = await import('../services/specDbSyncService.js');
          await syncSpecDbForCategory({
            category,
            config,
            resolveCategoryAlias,
            getSpecDbReady,
          });
        } catch (err) {
          results.push({
            status: 'warning',
            warning: 'specdb_resync_failed',
            error: err?.message || 'Unknown SpecDb resync error',
          });
        }

        // Restore field_test + curation rows after resync
        for (const row of savedFieldTestRows) {
          try { runtimeSpecDb.upsertFieldTest(row); } catch { /* non-fatal */ }
        }
        for (const row of savedCurationRows) {
          try { runtimeSpecDb.upsertCurationSuggestion(row); } catch { /* non-fatal */ }
        }
      }

      emitDataChange({
        broadcastWs,
        event: 'review',
        category,
      });
      return jsonRes(res, 200, { ok: true, results });
    }

    // GET /api/v1/test-mode/field-test-repairs?category=_test_mouse&productId=xxx
    if (parts[0] === 'test-mode' && parts[1] === 'field-test-repairs' && method === 'GET') {
      const cat = resolveCategoryAlias(params.get('category') || '');
      const productId = params.get('productId') || '';
      if (!cat || !cat.startsWith('_test_')) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_test_category' });
      }
      const runtimeSpecDb = await getSpecDbReady(cat).catch(() => null);
      const row = runtimeSpecDb?.getFieldTestByProduct(productId) || null;
      if (!row) return jsonRes(res, 200, { ok: true, repairs: [], validation: null });
      const repairs = row.repair_json ? JSON.parse(row.repair_json) : [];
      const validation = row.validation_json ? JSON.parse(row.validation_json) : null;
      return jsonRes(res, 200, { ok: true, repairs, validation });
    }

    // POST /api/v1/test-mode/validate  { category }
    if (parts[0] === 'test-mode' && parts[1] === 'validate' && method === 'POST') {
      const body = await readJsonBody(req);
      const category = resolveCategoryAlias(body.category);
      if (!category || !category.startsWith('_test_')) {
        return jsonRes(res, 400, { ok: false, error: 'invalid_test_category' });
      }

      // WHY: Per-key field contract audit — loads compiled rules and runs every field through validateField
      const runtimeSpecDb = await getSpecDbReady(category).catch(() => null);
      const compiledRules = runtimeSpecDb?.getCompiledRules?.() ?? null;
      let auditFieldRules, auditKnownValues, auditComponentDBs;
      if (compiledRules?.fields) {
        auditFieldRules = { fields: compiledRules.fields };
        auditKnownValues = compiledRules.known_values || {};
        auditComponentDBs = compiledRules.component_dbs || {};
      } else {
        const genDir = path.join(HELPER_ROOT, category, '_generated');
        auditFieldRules = await safeReadJson(path.join(genDir, 'field_rules.json')) || {};
        auditKnownValues = await safeReadJson(path.join(genDir, 'known_values.json')) || {};
        auditComponentDBs = {};
        const compDbDir = path.join(genDir, 'component_db');
        const compFiles = await listFiles(compDbDir, '.json').catch(() => []);
        for (const f of compFiles) {
          const data = await safeReadJson(path.join(compDbDir, f));
          if (data) auditComponentDBs[data?.component_type || f.replace('.json', '')] = data;
        }
      }

      const auditResults = runFieldContractTests({
        fieldRules: auditFieldRules,
        knownValues: auditKnownValues,
        componentDbs: auditComponentDBs,
      });

      return jsonRes(res, 200, auditResults);
    }

    // DELETE /api/v1/test-mode/{category}
    if (parts[0] === 'test-mode' && parts[1] && method === 'DELETE') {
      const category = parts[1];
      if (!category.startsWith('_test_')) {
        return jsonRes(res, 400, { ok: false, error: 'can_only_delete_test_categories' });
      }

      try {
        const runtimeSpecDb = await getSpecDbReady(category);
        purgeTestModeCategoryState(runtimeSpecDb, category);
      } catch { /* non-fatal */ }

      const fixturesRoot = path.resolve('fixtures', 's3', 'specs', 'inputs');
      const dirs = [
        path.resolve(HELPER_ROOT, category),
        path.resolve(fixturesRoot, category),
        path.resolve(OUTPUT_ROOT, 'specs', 'outputs', category)
      ];
      // BUG: Validate every resolved delete target before the first rm() call so
      // path-traversal input cannot partially delete allowed roots before the
      // handler notices a later escaped path.
      for (const dir of dirs) {
        if (!dir.startsWith(path.resolve(HELPER_ROOT)) &&
            !dir.startsWith(fixturesRoot) &&
            !dir.startsWith(path.resolve(OUTPUT_ROOT))) {
          return jsonRes(res, 400, { ok: false, error: 'invalid_category_path' });
        }
      }
      for (const dir of dirs) {
        try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      }

      try {
        if (appDb) {
          const catLower = category.toLowerCase();
          const allBrands = appDb.listBrands();
          for (const brand of allBrands) {
            const cats = appDb.getCategoriesForBrand(brand.identifier);
            const filtered = cats.filter((c) => c !== catLower);
            if (filtered.length === 0 && ['TestCo', 'TestNewBrand', 'NovaForge Labs'].includes(brand.canonical_name)) {
              appDb.deleteBrand(brand.identifier);
            } else if (filtered.length !== cats.length) {
              appDb.setBrandCategories(brand.identifier, filtered);
            }
          }
        }
      } catch { /* non-fatal */ }

      emitDataChange({
        broadcastWs,
        event: 'test-mode-deleted',
        category: 'all',
        meta: {
          deleted: category,
        },
      });

      return jsonRes(res, 200, { ok: true, deleted: category });
    }

    return false;
  };
}
