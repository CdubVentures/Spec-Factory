function safeParse(text, fallback) {
  if (text == null || text === '') return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

export function createFieldStudioMapStore({ stmts }) {
  // WHY: compiled_rules is a ~365 KB JSON blob. isVariantDependentField()
  // calls getCompiledRules() inside per-product × per-field loops (~30k iters
  // per products-index request). Both the SQLite row read (pulls 365 KB of
  // text) and JSON.parse are expensive. Cache the parsed value in-process
  // and invalidate only on self-writes. External writers (other processes)
  // must rely on process restart — matches sessionCache's invalidation model.
  let compiledRulesCache = { valid: false, value: null };
  let bootConfigCache = { valid: false, value: null };

  function invalidateCompiledCaches() {
    compiledRulesCache = { valid: false, value: null };
    bootConfigCache = { valid: false, value: null };
  }

  function getFieldStudioMap() {
    return stmts._getFieldStudioMap.get() || null;
  }
  function upsertFieldStudioMap(mapJson, mapHash) {
    return stmts._upsertFieldStudioMap.run({ map_json: mapJson, map_hash: mapHash });
  }
  function getCompiledRules() {
    if (compiledRulesCache.valid) return compiledRulesCache.value;
    const row = stmts._getFieldStudioMap.get();
    const raw = row?.compiled_rules;
    if (!raw) {
      compiledRulesCache = { valid: true, value: null };
      return null;
    }
    const parsed = safeParse(raw, null);
    const value = (parsed && parsed.fields) ? parsed : null;
    compiledRulesCache = { valid: true, value };
    return value;
  }
  function getBootConfig() {
    if (bootConfigCache.valid) return bootConfigCache.value;
    const row = stmts._getFieldStudioMap.get();
    const raw = row?.boot_config;
    if (!raw) {
      bootConfigCache = { valid: true, value: null };
      return null;
    }
    const value = safeParse(raw, null);
    bootConfigCache = { valid: true, value };
    return value;
  }
  function upsertCompiledRules(compiledRulesJson, bootConfigJson) {
    invalidateCompiledCaches();
    return stmts._upsertCompiledRules.run({
      compiled_rules: typeof compiledRulesJson === 'string' ? compiledRulesJson : JSON.stringify(compiledRulesJson ?? {}),
      boot_config: typeof bootConfigJson === 'string' ? bootConfigJson : JSON.stringify(bootConfigJson ?? {}),
    });
  }
  return { getFieldStudioMap, upsertFieldStudioMap, getCompiledRules, getBootConfig, upsertCompiledRules };
}
