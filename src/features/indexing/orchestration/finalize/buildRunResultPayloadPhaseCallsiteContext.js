import { copyContext } from '../shared/contextUtils.js';

export function buildRunResultPayloadPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
