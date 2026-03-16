import { copyContext } from '../shared/contextUtils.js';

export function buildCortexSidecarPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
