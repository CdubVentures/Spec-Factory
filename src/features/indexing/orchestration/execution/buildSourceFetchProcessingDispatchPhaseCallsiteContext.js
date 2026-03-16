import { copyContext } from '../shared/contextUtils.js';

export function buildSourceFetchProcessingDispatchPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
