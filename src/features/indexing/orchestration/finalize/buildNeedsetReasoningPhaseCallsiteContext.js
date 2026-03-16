import { copyContext } from '../shared/contextUtils.js';

export function buildNeedsetReasoningPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
