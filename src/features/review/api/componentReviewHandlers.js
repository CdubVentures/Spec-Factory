// ── Component Review Route Handlers ─────────────────────────────────
//
// Extracted from reviewRoutes.js.
// Handles: component layout, components, enums, component-impact.

function buildReviewFieldRulesPayload(session = null, compiledFieldRules = null) {
  const mergedFields = session?.mergedFields;
  const compiled = (compiledFieldRules && typeof compiledFieldRules === 'object' && !Array.isArray(compiledFieldRules))
    ? compiledFieldRules
    : null;
  if (!mergedFields || typeof mergedFields !== 'object' || Array.isArray(mergedFields)) {
    return compiled;
  }
  const compiledRules = (compiled && typeof compiled.rules === 'object' && !Array.isArray(compiled.rules))
    ? compiled.rules
    : {};
  return {
    ...(compiled || {}),
    rules: {
      ...compiledRules,
      fields: mergedFields,
    },
  };
}

export async function handleComponentReviewRoute({ parts, params, method, req, res, context }) {
  const {
    jsonRes,
    readJsonBody,
    config,
    storage,
    getSpecDb,
    getSpecDbReady,
    sessionCache,
    buildComponentReviewLayout,
    buildComponentReviewPayloads,
    buildEnumReviewPayloads,
    findProductsReferencingComponent,
    OUTPUT_ROOT,
    cascadeEnumChange,
    specDbCache,
    broadcastWs,
  } = context;

  // Layout - list component types with property columns
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'layout' && method === 'GET') {
    const category = parts[1];
    const runtimeSpecDb = await getSpecDbReady(category);
    if (!runtimeSpecDb || !runtimeSpecDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const sessionCompLayout = await sessionCache.getSessionRules(category);
    const compiledRules = runtimeSpecDb.getCompiledRules() || {};
    const layout = await buildComponentReviewLayout({
      config,
      category,
      specDb: runtimeSpecDb,
      fieldRules: buildReviewFieldRulesPayload(sessionCompLayout, compiledRules),
    });
    return jsonRes(res, 200, layout);
  }

  // Component items for a specific type
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'components' && method === 'GET') {
    const category = parts[1];
    const componentType = params.get('type') || '';
    if (!componentType) return jsonRes(res, 400, { error: 'type parameter required' });
    const specDb = await getSpecDbReady(category);
    if (!specDb || !specDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const sessionComp = await sessionCache.getSessionRules(category);
    const compiledRules = specDb.getCompiledRules() || {};
    const payload = await buildComponentReviewPayloads({
      config,
      category,
      componentType,
      specDb,
      fieldRules: buildReviewFieldRulesPayload(sessionComp, compiledRules),
      fieldOrderOverride: sessionComp.cleanFieldOrder
    });
    return jsonRes(res, 200, payload);
  }

  // Enum review data
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'enums' && method === 'GET') {
    const category = parts[1];
    const specDb = await getSpecDbReady(category);
    if (!specDb || !specDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const sessionEnum = await sessionCache.getSessionRules(category);
    const compiledRulesEnum = specDb.getCompiledRules() || {};
    const payload = await buildEnumReviewPayloads({
      config,
      category,
      specDb,
      fieldRules: buildReviewFieldRulesPayload(sessionEnum, compiledRulesEnum),
      fieldOrderOverride: sessionEnum.cleanFieldOrder
    });
    return jsonRes(res, 200, payload);
  }

  // Component impact analysis
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'component-impact' && method === 'GET') {
    const category = parts[1];
    const type = params.get('type') || '';
    const name = params.get('name') || '';
    if (!type || !name) return jsonRes(res, 400, { error: 'type and name parameters required' });
    const runtimeSpecDb = getSpecDb(category);
    const affected = await findProductsReferencingComponent({
      outputRoot: OUTPUT_ROOT,
      category,
      componentType: type,
      componentName: name,
      specDb: runtimeSpecDb,
    });
    return jsonRes(res, 200, { affected_products: affected, total: affected.length });
  }

  return false;
}
