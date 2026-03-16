import { copyContext } from '../shared/contextUtils.js';

export function buildPlannerBootstrapPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
