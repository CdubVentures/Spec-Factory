import { copyContext } from '../shared/contextUtils.js';

export function buildRunCompletedPayloadPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
