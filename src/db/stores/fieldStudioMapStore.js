export function createFieldStudioMapStore({ stmts }) {
  function getFieldStudioMap() {
    return stmts._getFieldStudioMap.get() || null;
  }
  function upsertFieldStudioMap(mapJson, mapHash) {
    return stmts._upsertFieldStudioMap.run({ map_json: mapJson, map_hash: mapHash });
  }
  return { getFieldStudioMap, upsertFieldStudioMap };
}
