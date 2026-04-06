// WHY: DB-first pipeline boot config loader. Reads compiled field rules and
// boot config from field_studio_map (the single SSOT for all field-rules
// consumers). Returns the same shape all discovery phases expect.

export function loadPipelineBootConfig({ specDb, category }) {
  if (!specDb || !category) {
    throw new Error('loadPipelineBootConfig requires specDb and category');
  }

  const compiledRules = specDb.getCompiledRules();
  if (!compiledRules) {
    throw new Error(`No compiled rules for category: ${category}. Run compile first.`);
  }

  const bootConfig = specDb.getBootConfig() || {};
  const sourceHosts = bootConfig.source_hosts || [];
  const sourceHostMap = new Map(sourceHosts.map(s => [s.host, s]));
  const approvedRootDomains = new Set(sourceHosts.map(s =>
    String(s.host || '').replace(/^www\./, ''),
  ));

  return {
    category,
    fieldRules: { fields: compiledRules.fields || {} },
    fieldOrder: compiledRules.field_order || [],
    fieldGroups: compiledRules.field_groups || {},
    requiredFields: compiledRules.required_fields || [],
    schema: { critical_fields: compiledRules.critical_fields || [] },
    sourceHosts,
    sourceHostMap,
    approvedRootDomains,
    sourceRegistry: bootConfig.source_registry || {},
    validatedRegistry: bootConfig.validated_registry || {},
    denylist: bootConfig.denylist || [],
    searchTemplates: bootConfig.search_templates || [],
    specSeeds: bootConfig.spec_seeds || [],
  };
}
