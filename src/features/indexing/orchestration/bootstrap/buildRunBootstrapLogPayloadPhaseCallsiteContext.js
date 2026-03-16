import { copyContext } from '../shared/contextUtils.js';

export function buildRunBootstrapLogPayloadPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
