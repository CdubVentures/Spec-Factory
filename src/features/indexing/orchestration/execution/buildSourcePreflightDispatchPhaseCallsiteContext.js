import { copyContext } from '../shared/contextUtils.js';

export function buildSourcePreflightDispatchPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
