export function buildRunResultPayload({
  job,
  normalized,
  provenance,
  summary,
  runId,
  productId,
  exportInfo,
  finalExport,
  learning,
  learningGateResult,
  categoryBrain,
} = {}) {
  return {
    job,
    normalized,
    provenance,
    summary,
    runId,
    productId,
    exportInfo,
    finalExport,
    learning,
    learningGateResult,
    categoryBrain,
  };
}
