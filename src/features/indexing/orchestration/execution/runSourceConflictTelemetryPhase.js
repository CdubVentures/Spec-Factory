export function runSourceConflictTelemetryPhase({
  llmExtraction = {},
  logger = null,
} = {}) {
  for (const conflict of llmExtraction.conflicts || []) {
    const field = String(conflict?.field || '').trim();
    if (!field) {
      continue;
    }
    logger?.info?.('field_conflict_detected', {
      field,
      value_a: String(conflict?.value_a || conflict?.left || ''),
      value_b: String(conflict?.value_b || conflict?.right || ''),
      sources: Array.isArray(conflict?.sources) ? conflict.sources.slice(0, 6) : []
    });
  }
}
