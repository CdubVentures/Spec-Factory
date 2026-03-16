import { copyContext } from '../shared/contextUtils.js';

export function buildSourceSkipBeforeFetchPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
