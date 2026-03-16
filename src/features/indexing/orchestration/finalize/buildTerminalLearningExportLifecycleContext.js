import { renameContextKeys } from '../shared/contextUtils.js';

export function buildTerminalLearningExportLifecycleContext(context = {}) {
  return renameContextKeys(context, {
  "runLearningExportPhase": "runLearningExportPhaseFn",
  "finalizeRunLifecycle": "finalizeRunLifecycleFn",
  "emitFieldDecisionEvents": "emitFieldDecisionEventsFn"
});
}
