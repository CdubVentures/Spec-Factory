import { renameContextKeys } from '../shared/contextUtils.js';

export function buildResearchBootstrapContext(context = {}) {
  return renameContextKeys(context, {
  "createFrontier": "createFrontierFn",
  "createUberAggressiveOrchestrator": "createUberAggressiveOrchestratorFn"
});
}
