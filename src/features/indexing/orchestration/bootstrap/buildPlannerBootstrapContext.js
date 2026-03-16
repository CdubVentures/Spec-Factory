import { renameContextKeys } from '../shared/contextUtils.js';

export function buildPlannerBootstrapContext(context = {}) {
  return renameContextKeys(context, {
  "createAdapterManager": "createAdapterManagerFn",
  "loadSourceIntel": "loadSourceIntelFn",
  "createSourcePlanner": "createSourcePlannerFn",
  "syncRuntimeOverrides": "syncRuntimeOverridesFn",
  "applyRuntimeOverridesToPlanner": "applyRuntimeOverridesToPlannerFn"
});
}
