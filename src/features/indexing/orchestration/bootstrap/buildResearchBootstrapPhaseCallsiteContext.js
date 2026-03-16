import { copyContext } from '../shared/contextUtils.js';

export function buildResearchBootstrapPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
