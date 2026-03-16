import { copyContext } from '../shared/contextUtils.js';

export function buildIdentityNormalizationPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
