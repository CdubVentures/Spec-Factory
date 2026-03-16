import { copyContext } from '../shared/contextUtils.js';

export function buildRunRuntimePhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
