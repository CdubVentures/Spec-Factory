import { copyContext } from '../shared/contextUtils.js';

export function buildLearningExportPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
