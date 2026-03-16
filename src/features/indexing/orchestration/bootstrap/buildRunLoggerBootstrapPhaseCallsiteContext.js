import { copyContext } from '../shared/contextUtils.js';

export function buildRunLoggerBootstrapPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
