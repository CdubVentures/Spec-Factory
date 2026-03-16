import { copyContext } from '../shared/contextUtils.js';

export function buildPostLearningUpdatesPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
