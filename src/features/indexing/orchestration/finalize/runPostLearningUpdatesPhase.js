export async function runPostLearningUpdatesPhase({
  storage,
  config = {},
  category = '',
  job = {},
  normalized = {},
  summary = {},
  provenance = {},
  sourceResults = [],
  discoveryResult = {},
  runId = '',
  updateCategoryBrainFn,
  updateComponentLibraryFn,
} = {}) {
  const categoryBrain = await updateCategoryBrainFn({
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
  });
  summary.category_brain = {
    keys: categoryBrain.keys,
    promotion_update: categoryBrain.promotion_update,
  };

  const componentUpdate = await updateComponentLibraryFn({
    storage,
    normalized,
    summary,
    provenance,
  });
  summary.component_library = componentUpdate;

  return {
    categoryBrain,
    componentUpdate,
  };
}
