import { copyContext } from '../shared/contextUtils.js';

export function buildRunSummaryPayloadPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
