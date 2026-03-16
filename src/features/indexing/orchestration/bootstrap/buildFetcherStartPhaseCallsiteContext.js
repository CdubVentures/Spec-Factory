import { copyContext } from '../shared/contextUtils.js';

export function buildFetcherStartPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
