export function buildPostLearningUpdatesContext({
  storage,
  config,
  category,
  job,
  normalized,
  summary,
  provenance,
  sourceResults,
  discoveryResult,
  runId,
  updateCategoryBrain,
  updateComponentLibrary,
} = {}) {
  return {
    storage,
    config,
    category,
    job,
    normalized,
    summary,
    provenance,
    sourceResults,
    discoveryResult,
    runId,
    updateCategoryBrainFn: updateCategoryBrain,
    updateComponentLibraryFn: updateComponentLibrary,
  };
}
