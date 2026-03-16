import { copyContext } from '../shared/contextUtils.js';

export function buildIdentityBootstrapPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
