import { copyContext } from '../shared/contextUtils.js';

export function buildFetchSchedulerDrainPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
