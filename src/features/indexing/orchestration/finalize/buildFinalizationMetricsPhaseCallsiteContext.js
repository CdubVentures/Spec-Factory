import { copyContext } from '../shared/contextUtils.js';

export function buildFinalizationMetricsPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
