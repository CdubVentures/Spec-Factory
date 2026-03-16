import { copyContext } from '../shared/contextUtils.js';

export function buildSourceProcessingPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
