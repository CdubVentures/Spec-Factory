import { copyContext } from '../shared/contextUtils.js';

export function buildIdentityConsensusPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
