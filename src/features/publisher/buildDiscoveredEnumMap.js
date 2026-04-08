/**
 * Reads active discovered enum values from the DB for all registered enum fields.
 * Receives specDb as injected dependency — no direct DB imports.
 *
 * @param {object|null} specDb — SpecDb instance (injected)
 * @returns {Record<string, string[]>} — { fieldKey: [value1, value2, ...] }
 */
export function buildDiscoveredEnumMap(specDb) {
  if (!specDb) return {};

  const fieldKeys = specDb.getAllEnumFields();
  if (!Array.isArray(fieldKeys) || fieldKeys.length === 0) return {};

  const map = {};
  for (const fieldKey of fieldKeys) {
    const rows = specDb.getListValues(fieldKey);
    if (!Array.isArray(rows)) continue;

    const pipelineValues = rows
      .filter(r => r.source === 'pipeline' && !r.overridden)
      .map(r => r.value);

    if (pipelineValues.length > 0) {
      map[fieldKey] = pipelineValues;
    }
  }
  return map;
}
