import { copyContext } from '../shared/contextUtils.js';

export function buildSourceFetchPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
