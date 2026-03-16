import { copyContext } from '../shared/contextUtils.js';

export function buildLearningGatePhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
