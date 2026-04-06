function safeParse(text, fallback) {
  if (text == null || text === '') return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

export function createFieldStudioMapStore({ stmts }) {
  function getFieldStudioMap() {
    return stmts._getFieldStudioMap.get() || null;
  }
  function upsertFieldStudioMap(mapJson, mapHash) {
    return stmts._upsertFieldStudioMap.run({ map_json: mapJson, map_hash: mapHash });
  }
  function getCompiledRules() {
    const row = stmts._getFieldStudioMap.get();
    if (!row?.compiled_rules) return null;
    const parsed = safeParse(row.compiled_rules, null);
    if (!parsed || !parsed.fields) return null;
    return parsed;
  }
  function getBootConfig() {
    const row = stmts._getFieldStudioMap.get();
    if (!row?.boot_config) return null;
    return safeParse(row.boot_config, null);
  }
  function upsertCompiledRules(compiledRulesJson, bootConfigJson) {
    return stmts._upsertCompiledRules.run({
      compiled_rules: typeof compiledRulesJson === 'string' ? compiledRulesJson : JSON.stringify(compiledRulesJson ?? {}),
      boot_config: typeof bootConfigJson === 'string' ? bootConfigJson : JSON.stringify(bootConfigJson ?? {}),
    });
  }
  return { getFieldStudioMap, upsertFieldStudioMap, getCompiledRules, getBootConfig, upsertCompiledRules };
}
