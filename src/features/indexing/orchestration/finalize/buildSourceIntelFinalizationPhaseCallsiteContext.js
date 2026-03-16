import { copyContext } from '../shared/contextUtils.js';

export function buildSourceIntelFinalizationPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
