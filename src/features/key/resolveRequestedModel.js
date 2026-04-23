// WHY: Single authority for the model-name that keyFinder both DISPLAYS on
// the pending LLM-call row (keyFinder.js:340 initialModel) and PERSISTS on
// the run record (keyFinder.js:381-383 requestedModel). Two places, one rule
// — previously they drifted and users saw llmModelPlan on the pending row
// while the actual call (and persisted record) used the tier's reasoningModel.

export function resolveRequestedModel(tierBundle, llmModelPlan = '') {
  const useReasoning = Boolean(tierBundle?.useReasoning);
  const reasoningModel = String(tierBundle?.reasoningModel || '').trim();
  const baseModel = String(tierBundle?.model || '').trim();
  const plan = String(llmModelPlan || '').trim();
  if (useReasoning && reasoningModel) return reasoningModel;
  return baseModel || plan || 'unknown';
}
