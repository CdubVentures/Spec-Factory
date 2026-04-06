// WHY: Store for pipeline_category_cache — pre-computed projection of
// categoryConfig for fast pipeline boot. One row per category, all properties
// as JSON columns. Rebuild contract: reseed from JSON at server boot.

function stringify(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? {});
}

export function createPipelineCategoryCacheStore({ db, category, stmts }) {

  function upsertCache(cat, payload) {
    stmts._upsertPipelineCategoryCache.run({
      category: String(cat || '').trim(),
      field_rules: stringify(payload.field_rules),
      field_order: stringify(payload.field_order),
      field_groups: stringify(payload.field_groups),
      required_fields: stringify(payload.required_fields),
      critical_fields: stringify(payload.critical_fields),
      source_hosts: stringify(payload.source_hosts),
      source_registry: stringify(payload.source_registry),
      validated_registry: stringify(payload.validated_registry),
      denylist: stringify(payload.denylist),
      search_templates: stringify(payload.search_templates),
      spec_seeds: stringify(payload.spec_seeds),
    });
  }

  function getCache(cat) {
    return stmts._getPipelineCategoryCache.get(String(cat || '').trim()) || null;
  }

  function deleteCache(cat) {
    return stmts._deletePipelineCategoryCache.run(String(cat || '').trim());
  }

  return { upsertCache, getCache, deleteCache };
}
