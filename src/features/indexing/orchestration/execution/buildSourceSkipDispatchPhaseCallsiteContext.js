import { copyContext } from '../shared/contextUtils.js';

export function buildSourceSkipDispatchPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
