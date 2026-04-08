export function registerTestModeRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    getSpecDbReady,
    resolveCategoryAlias,
    runFieldContractTests,
    mergeDiscoveredEnums,
    buildDiscoveredEnumMap,
  } = ctx;

  return async function handleTestModeRoutes(parts, params, method, req, res) {
    // GET /api/v1/test-mode/audit?category=mouse — read cached audit from DB
    if (parts[0] === 'test-mode' && parts[1] === 'audit' && method === 'GET') {
      const category = resolveCategoryAlias(params.category);
      if (!category) return jsonRes(res, 400, { ok: false, error: 'missing_category' });

      const specDb = await getSpecDbReady(category).catch(() => null);
      if (!specDb) return jsonRes(res, 503, { ok: false, error: 'specdb_not_ready' });

      const row = specDb.db.prepare(
        'SELECT result_json, run_at FROM field_audit_cache WHERE category = ?',
      ).get(category);

      if (!row) return jsonRes(res, 200, { cached: false });

      const audit = JSON.parse(row.result_json);
      return jsonRes(res, 200, { cached: true, run_at: row.run_at, ...audit });
    }

    // POST /api/v1/test-mode/validate  { category } — run audit + persist to DB
    if (parts[0] === 'test-mode' && parts[1] === 'validate' && method === 'POST') {
      const body = await readJsonBody(req);
      const category = resolveCategoryAlias(body.category);
      if (!category) return jsonRes(res, 400, { ok: false, error: 'missing_category' });

      const runtimeSpecDb = await getSpecDbReady(category).catch(() => null);
      const compiledRules = runtimeSpecDb?.getCompiledRules?.() ?? null;
      if (!compiledRules?.fields) {
        return jsonRes(res, 503, { ok: false, error: 'specdb_not_ready', message: 'Category database not seeded yet. Compile and seed first.' });
      }
      const auditFieldRules = { fields: compiledRules.fields };
      let auditKnownValues = compiledRules.known_values || {};
      const auditComponentDBs = compiledRules.component_dbs || {};

      // WHY: Merge DB-discovered enum values into the compiled known values
      if (runtimeSpecDb && mergeDiscoveredEnums && buildDiscoveredEnumMap) {
        const discoveredMap = buildDiscoveredEnumMap(runtimeSpecDb);
        auditKnownValues = mergeDiscoveredEnums(
          auditKnownValues,
          discoveredMap,
          auditFieldRules?.fields || {},
        );
      }

      const auditResults = runFieldContractTests({
        fieldRules: auditFieldRules,
        knownValues: auditKnownValues,
        componentDbs: auditComponentDBs,
      });

      // WHY: Persist full result to DB — survives page refreshes.
      const { totalFields, totalChecks, passCount, failCount } = auditResults.summary;
      runtimeSpecDb.db.prepare(`
        INSERT OR REPLACE INTO field_audit_cache
          (category, total_fields, total_checks, pass_count, fail_count, result_json, run_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(category, totalFields, totalChecks, passCount, failCount, JSON.stringify(auditResults));

      return jsonRes(res, 200, auditResults);
    }

    return false;
  };
}
