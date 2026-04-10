/**
 * Persists a newly discovered enum value into list_values.
 * Called by pipeline orchestrator after validation/repair succeeds.
 * Receives specDb as injected dependency — no direct DB imports.
 *
 * WHY: onValueDiscovered callback enables dual-write (DB + JSON) per
 * CLAUDE.md Dual-State Architecture. The caller provides the JSON writer.
 *
 * @param {{ specDb: object, fieldKey: string, value: *, fieldRule: object|null, onValueDiscovered?: Function }} opts
 */
export function persistDiscoveredValue({ specDb, fieldKey, value, fieldRule, onValueDiscovered }) {
  if (!fieldRule || fieldRule?.enum?.policy !== 'open_prefer_known') return;
  if (value == null || value === '') return;

  const strValue = String(value);
  if (!strValue.trim()) return;

  const existing = specDb.getListValueByFieldAndValue(fieldKey, strValue);
  if (existing) return;

  specDb.upsertListValue({
    fieldKey,
    value: strValue,
    normalizedValue: strValue.toLowerCase().trim(),
    source: 'pipeline',
    enumPolicy: fieldRule.enum.policy,
    needsReview: true,
  });

  // WHY: Dual-write — notify caller to append to JSON for rebuild contract
  if (typeof onValueDiscovered === 'function') {
    onValueDiscovered({ fieldKey, value: strValue, firstSeenAt: new Date().toISOString() });
  }
}
