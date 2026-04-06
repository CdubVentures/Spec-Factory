// WHY: DB-first pipeline boot config loader. Reads one pre-cached row from
// pipeline_category_cache instead of ~11 JSON files. Returns the same shape
// that loadCategoryConfig + buildIndexlabRuntimeCategoryConfig produced,
// so all discovery phases work unchanged.

function safeParse(text, fallback) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

export function loadPipelineBootConfig({ specDb, category }) {
  if (!specDb || !category) {
    throw new Error(`loadPipelineBootConfig requires specDb and category`);
  }

  const row = specDb.getPipelineCategoryCache(category);
  if (!row) {
    throw new Error(`No pipeline cache for category: ${category}. Run server reconcile first.`);
  }

  const fieldRules = safeParse(row.field_rules, { fields: {} });
  const fieldOrder = safeParse(row.field_order, []);
  const sourceHosts = safeParse(row.source_hosts, []);
  const sourceHostMap = new Map(sourceHosts.map(s => [s.host, s]));
  const approvedRootDomains = new Set(sourceHosts.map(s =>
    String(s.host || '').replace(/^www\./, ''),
  ));

  return {
    category,
    fieldRules,
    fieldOrder,
    fieldGroups: safeParse(row.field_groups, {}),
    requiredFields: safeParse(row.required_fields, []),
    schema: { critical_fields: safeParse(row.critical_fields, []) },
    sourceHosts,
    sourceHostMap,
    approvedRootDomains,
    sourceRegistry: safeParse(row.source_registry, {}),
    validatedRegistry: safeParse(row.validated_registry, {}),
    denylist: safeParse(row.denylist, []),
    searchTemplates: safeParse(row.search_templates, []),
    specSeeds: safeParse(row.spec_seeds, []),
  };
}
