import { copyContext } from '../shared/contextUtils.js';

export function buildSourcePreflightPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
