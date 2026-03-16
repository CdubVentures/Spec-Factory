import { copyContext } from '../shared/contextUtils.js';

export function buildValidationGatePhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
